import {
  BASE_BET_UNIT,
  BIG_BLIND,
  ComboSelection,
  HandPhase,
  INITIAL_STACK,
  MAX_OXTAIL_ROUNDS,
  MAX_RAISES_PER_ROUND,
  SeatStatus,
  SMALL_BLIND,
  TableSnapshot,
  PlayerPrivateState,
  BetActionType,
  TURN_TIMEOUT_MS
} from "@shared/contracts";
import type { Card, BettingRound } from "@shared/contracts";
import { buildShuffledDeck, cardBossValue } from "./cards";
import { evaluateCombos, PlayerComboForScoring } from "./scoring";
import { v4 as uuid } from "uuid";

interface PlayerState {
  id: string;
  displayName: string;
  bankroll: number;
  seatIndex: number | null;
  hand: Card[];
  comboSelection: ComboSelection;
  submittedCombo: ComboSelection | null;
  connected: boolean;
}

interface SeatState {
  index: number;
  playerId: string | null;
  status: SeatStatus;
}

interface SeatHandRuntime {
  seatIndex: number;
  folded: boolean;
  bowedOut: boolean;
  allIn: boolean;
  contributionsThisRound: number;
  contributionsTotal: number;
}

interface BetRoundState {
  round: BettingRound;
  currentBet: number;
  raisesUsed: number;
  turnSequence: number[];
  cursor: number;
  pendingSeats: Set<number>;
  lastAggressor: number | null;
}

interface HandRuntime {
  handNumber: number;
  phase: HandPhase;
  bettingRound: BettingRound | null;
  deck: Card[];
  bossCards: Card[];
  bossRevealed: number;
  actionSeat: number | null;
  actionType: "bet" | "reveal" | null;
  actionDeadline: number | null;
  dealerSeat: number | null;
  oxtailRound: number;
  potTotal: number;
  mainPot: number;
  sidePot: number;
  seatRuntime: Record<number, SeatHandRuntime>;
  betState: BetRoundState | null;
  pendingReveal: number[];
  awaitingCombos: Set<number>;
  showdownReady: boolean;
  finalists: number[] | null;
}

export interface JoinResult {
  playerId: string;
}

export class BossTable {
  private players = new Map<string, PlayerState>();
  private seats: SeatState[] = Array.from({ length: 6 }, (_, index) => ({
    index,
    playerId: null,
    status: "open"
  }));
  private dealerSeat: number | null = null;
  private handCount = 0;
  private handState: HandRuntime = this.createEmptyHand();
  private nextDeadlineAt: number | null = null;

  joinTable(displayName: string): JoinResult {
    const playerId = uuid();
    this.players.set(playerId, {
      id: playerId,
      displayName,
      bankroll: INITIAL_STACK,
      seatIndex: null,
      hand: [],
      comboSelection: { cardIds: [], acesAsEleven: [] },
      submittedCombo: null,
      connected: true
    });
    return { playerId };
  }

  updateDisplayName(playerId: string, name: string) {
    const player = this.players.get(playerId);
    if (!player) return;
    player.displayName = name;
  }

  takeSeat(playerId: string, seatIndex: number) {
    const player = this.players.get(playerId);
    if (!player) throw new Error("player_not_found");
    const seat = this.seats[seatIndex];
    if (!seat) throw new Error("seat_not_found");
    if (seat.playerId) throw new Error("seat_taken");
    if (player.seatIndex !== null) {
      throw new Error("already_seated");
    }
    seat.playerId = playerId;
    seat.status = "waiting";
    player.seatIndex = seatIndex;
    this.assignInitialDealer();
  }

  leaveSeat(playerId: string) {
    const player = this.players.get(playerId);
    if (!player) return;
    if (player.seatIndex === null) return;
    const seatIndex = player.seatIndex;
    if (this.handState.phase !== "waiting" && this.handState.phase !== "hand_end") {
      this.forceFoldSeat(seatIndex);
    }
    const seat = this.seats[seatIndex];
    if (seat) {
      seat.playerId = null;
      seat.status = "open";
    }
    if (this.dealerSeat === seatIndex) {
      this.dealerSeat = null;
      this.handState.dealerSeat = null;
    }
    this.assignInitialDealer();
    player.seatIndex = null;
    player.hand = [];
    player.comboSelection = { cardIds: [], acesAsEleven: [] };
    player.submittedCombo = null;
  }

  startHand(requestingPlayerId: string) {
    const player = this.players.get(requestingPlayerId);
    if (!player || player.seatIndex === null) throw new Error("not_seated");
    if (this.handState.phase !== "waiting" && this.handState.phase !== "hand_end") {
      throw new Error("hand_in_progress");
    }
    const occupiedSeats = this.seats.filter((seat) => seat.playerId);
    if (occupiedSeats.length < 2) throw new Error("need_two_players");
    if (this.dealerSeat === null) {
      this.dealerSeat = this.randomOccupiedSeat();
      this.handState.dealerSeat = this.dealerSeat;
    } else {
      this.dealerSeat = this.nextOccupiedSeat(this.dealerSeat);
    }
    if (player.seatIndex !== this.dealerSeat) {
      throw new Error("only_dealer_starts");
    }
    this.handState = this.createEmptyHand();
    this.handCount += 1;
    this.handState.handNumber = this.handCount;
    this.handState.dealerSeat = this.dealerSeat;
    this.handState.phase = "blinds";
    this.prepareHand();
    this.advancePhaseToRush();
  }

  private prepareHand() {
    const deck = buildShuffledDeck();
    const bossCards = deck.splice(0, 5);
    this.handState.deck = deck;
    this.handState.bossCards = bossCards;
    this.handState.bossRevealed = 0;
    this.handState.potTotal = 0;
    this.handState.mainPot = 0;
    this.handState.sidePot = 0;
    this.handState.oxtailRound = 0;
    this.handState.seatRuntime = {};
    this.seats.forEach((seat) => {
      if (!seat.playerId) return;
      const player = this.players.get(seat.playerId);
      if (!player) return;
      const cards = deck.splice(0, 7);
      player.hand = cards;
      player.comboSelection = { cardIds: [], acesAsEleven: [] };
      player.submittedCombo = null;
      this.handState.seatRuntime[seat.index] = {
        seatIndex: seat.index,
        folded: false,
        bowedOut: false,
        allIn: false,
        contributionsThisRound: 0,
        contributionsTotal: 0
      };
      seat.status = "waiting";
    });
    this.postBlinds();
  }

  private postBlinds() {
    if (this.dealerSeat === null) return;
    const sbSeat = this.nextOccupiedSeat(this.dealerSeat);
    const bbSeat = this.nextOccupiedSeat(sbSeat);
    this.applyBlind(sbSeat, SMALL_BLIND);
    this.applyBlind(bbSeat, BIG_BLIND);
    this.handState.potTotal += SMALL_BLIND + BIG_BLIND;
    this.handState.mainPot = this.handState.potTotal;
  }

  private applyBlind(seatIndex: number, amount: number) {
    const seat = this.seats[seatIndex];
    if (!seat || !seat.playerId) return;
    const player = this.players.get(seat.playerId);
    if (!player) return;
    const runtime = this.handState.seatRuntime[seatIndex];
    if (!runtime) return;
    const blind = Math.min(player.bankroll, amount);
    player.bankroll -= blind;
    runtime.contributionsThisRound += blind;
    runtime.contributionsTotal += blind;
    if (player.bankroll === 0) {
      runtime.allIn = true;
      seat.status = "all_in";
    }
  }

  private advancePhaseToRush() {
    this.handState.phase = "rush";
    this.handState.bettingRound = "rush";
    this.handState.bossRevealed = 3;
    this.startBettingRound("rush");
  }

  private startBettingRound(round: BettingRound) {
    const firstSeat =
      round === "rush"
        ? this.nextOccupiedSeat(this.nextOccupiedSeat(this.nextOccupiedSeat(this.dealerSeat!)))
        : this.nextOccupiedSeat(this.dealerSeat!);
    const activeSeats = this.activeSeatIndices();
    const sequence = this.buildTurnSequence(firstSeat, activeSeats);
    const betState: BetRoundState = {
      round,
      currentBet: round === "rush" ? BIG_BLIND : 0,
      raisesUsed: 0,
      turnSequence: sequence,
      cursor: 0,
      pendingSeats: new Set(sequence),
      lastAggressor: null
    };
    this.handState.betState = betState;
    this.handState.actionSeat = this.nextTurnSeat();
    this.handState.actionType = this.handState.actionSeat !== null ? "bet" : null;
    this.handState.actionDeadline =
      this.handState.actionSeat !== null ? Date.now() + TURN_TIMEOUT_MS : null;
  }

  betAction(playerId: string, action: BetActionType) {
    if (!this.handState.betState) throw new Error("no_bet_round");
    if (this.handState.actionSeat === null) throw new Error("no_turn");
    const player = this.players.get(playerId);
    if (!player || player.seatIndex === null) throw new Error("not_seated");
    if (player.seatIndex !== this.handState.actionSeat) throw new Error("not_your_turn");
    const runtime = this.handState.seatRuntime[player.seatIndex];
    if (!runtime || runtime.folded || runtime.bowedOut) throw new Error("not_in_hand");
    switch (action) {
      case "fold":
        runtime.folded = true;
        this.seats[player.seatIndex].status = "folded";
        break;
      case "check":
        this.ensureCanCheck(player.seatIndex);
        break;
      case "call":
        this.handleCall(player.seatIndex);
        break;
      case "raise":
        this.handleRaise(player.seatIndex);
        break;
      case "all_in":
        this.handleAllIn(player.seatIndex);
        break;
      default:
        throw new Error("unknown_action");
    }
    this.advanceAfterBet(player.seatIndex);
  }

  private ensureCanCheck(seatIndex: number) {
    const betState = this.handState.betState!;
    const runtime = this.handState.seatRuntime[seatIndex];
    if (!runtime) throw new Error("seat_not_in_hand");
    if (betState.currentBet > runtime.contributionsThisRound) {
      throw new Error("cannot_check");
    }
  }

  private handleCall(seatIndex: number) {
    const betState = this.handState.betState!;
    const runtime = this.handState.seatRuntime[seatIndex];
    if (!runtime) throw new Error("seat_not_in_hand");
    const player = this.playerForSeat(seatIndex);
    if (!player) throw new Error("player_missing");
    const owed = betState.currentBet - runtime.contributionsThisRound;
    if (owed <= 0) return;
    const amount = Math.min(player.bankroll, owed);
    player.bankroll -= amount;
    runtime.contributionsThisRound += amount;
    runtime.contributionsTotal += amount;
    this.handState.potTotal += amount;
    this.handState.mainPot = this.handState.potTotal;
    if (player.bankroll === 0) {
      runtime.allIn = true;
      this.seats[seatIndex].status = "all_in";
    }
  }

  private handleRaise(seatIndex: number) {
    const betState = this.handState.betState!;
    if (betState.raisesUsed >= MAX_RAISES_PER_ROUND) {
      throw new Error("raise_cap");
    }
    this.handleCall(seatIndex);
    betState.currentBet += BASE_BET_UNIT;
    betState.raisesUsed += 1;
    betState.lastAggressor = seatIndex;
    this.resetPendingSeatsExcept(seatIndex);
  }

  private handleAllIn(seatIndex: number) {
    const betState = this.handState.betState!;
    const player = this.playerForSeat(seatIndex);
    if (!player) throw new Error("player_missing");
    const runtime = this.handState.seatRuntime[seatIndex];
    if (!runtime) throw new Error("seat_not_in_hand");
    const amount = player.bankroll;
    if (amount <= 0) throw new Error("no_stack");
    player.bankroll = 0;
    runtime.contributionsThisRound += amount;
    runtime.contributionsTotal += amount;
    this.handState.potTotal += amount;
    this.handState.mainPot = this.handState.potTotal;
    runtime.allIn = true;
    this.seats[seatIndex].status = "all_in";
    if (runtime.contributionsThisRound > betState.currentBet) {
      betState.currentBet = runtime.contributionsThisRound;
      betState.raisesUsed += 1;
      betState.lastAggressor = seatIndex;
      this.resetPendingSeatsExcept(seatIndex);
    }
  }

  private resetPendingSeatsExcept(seatIndex: number) {
    const betState = this.handState.betState!;
    const seats = this.handState.betState!.turnSequence.filter(
      (idx) =>
        !this.handState.seatRuntime[idx].folded &&
        !this.handState.seatRuntime[idx].bowedOut &&
        !this.handState.seatRuntime[idx].allIn &&
        idx !== seatIndex
    );
    betState.pendingSeats = new Set(seats);
  }

  private advanceAfterBet(seatIndex: number) {
    const betState = this.handState.betState!;
    betState.pendingSeats.delete(seatIndex);
    this.handState.actionSeat = this.nextTurnSeat();
    if (this.onlyOnePlayerLeft()) {
      this.resolveEarlyWin();
      return;
    }
    if (this.handState.actionSeat === null || betState.pendingSeats.size === 0) {
      this.finishBettingRound();
      return;
    }
    this.handState.actionType = "bet";
    this.handState.actionDeadline = Date.now() + TURN_TIMEOUT_MS;
  }

  private finishBettingRound() {
    this.handState.betState = null;
    this.resetRoundContributions();
    if (this.onlyOnePlayerLeft()) {
      this.resolveEarlyWin();
      return;
    }
    if (this.handState.phase === "rush") {
      this.handState.phase = "charge";
      this.handState.bettingRound = "charge";
      this.handState.bossRevealed = 4;
      this.startBettingRound("charge");
      return;
    }
    if (this.handState.phase === "charge") {
      this.handState.phase = "stomp";
      this.handState.bettingRound = "stomp";
      this.handState.bossRevealed = 5;
      this.startBettingRound("stomp");
      return;
    }
    if (this.handState.phase === "stomp" || this.handState.phase === "oxtail") {
      this.enterRevealPhase();
    }
  }

  private enterRevealPhase() {
    this.handState.phase = "reveal";
    this.handState.bettingRound = null;
    const queue = this.buildTurnSequence(
      this.nextOccupiedSeat(this.dealerSeat!),
      this.activeSeatIndices()
    );
    this.handState.pendingReveal = queue;
    this.handState.awaitingCombos = new Set(queue);
    this.advanceRevealTurn();
  }

  private advanceRevealTurn() {
    while (this.handState.pendingReveal.length > 0) {
      const seat = this.handState.pendingReveal[0];
      const runtime = this.handState.seatRuntime[seat];
      if (!runtime || runtime.folded || runtime.bowedOut) {
        this.handState.pendingReveal.shift();
        continue;
      }
      this.handState.actionSeat = seat;
      this.handState.actionType = "reveal";
      this.handState.actionDeadline = Date.now() + TURN_TIMEOUT_MS;
      this.seats[seat].status = "revealing";
      return;
    }
    this.handState.actionSeat = null;
    this.handState.actionType = null;
    this.evaluateShowdown();
  }

  comboUpdate(playerId: string, selection: ComboSelection) {
    const player = this.players.get(playerId);
    if (!player || player.seatIndex === null) throw new Error("not_seated");
    if (!this.handState.seatRuntime[player.seatIndex]) throw new Error("not_in_hand");
    const validCardIds = new Set(player.hand.map((card) => card.id));
    const selectedCards = selection.cardIds.filter((id) => validCardIds.has(id));
    const aceIds = selection.acesAsEleven.filter((id) => selectedCards.includes(id));
    player.comboSelection = {
      cardIds: selectedCards,
      acesAsEleven: aceIds
    };
  }

  comboSubmit(playerId: string, selection: ComboSelection) {
    const player = this.players.get(playerId);
    if (!player || player.seatIndex === null) throw new Error("not_seated");
    const seatIndex = player.seatIndex;
    const runtime = this.handState.seatRuntime[seatIndex];
    if (!runtime || runtime.folded || runtime.bowedOut) throw new Error("not_in_hand");
    if (this.handState.actionSeat !== seatIndex) throw new Error("not_your_turn");
    this.comboUpdate(playerId, selection);
    player.submittedCombo = player.comboSelection;
    this.handState.pendingReveal.shift();
    this.handState.awaitingCombos.delete(seatIndex);
    this.advanceRevealTurn();
  }

  bowOut(playerId: string) {
    const player = this.players.get(playerId);
    if (!player || player.seatIndex === null) return;
    const runtime = this.handState.seatRuntime[player.seatIndex];
    if (!runtime) return;
    runtime.bowedOut = true;
    runtime.folded = true;
    this.seats[player.seatIndex].status = "bowed_out";
    if (this.handState.phase === "reveal" && this.handState.actionSeat === player.seatIndex) {
      this.handState.pendingReveal.shift();
      this.advanceRevealTurn();
    }
  }

  private evaluateShowdown() {
    const bossCards = this.visibleBossCards();
    const combos: PlayerComboForScoring[] = [];
    this.seats.forEach((seat) => {
      if (!seat.playerId) return;
      const runtime = this.handState.seatRuntime[seat.index];
      if (!runtime || runtime.folded) return;
      const player = this.players.get(seat.playerId);
      if (!player || !player.submittedCombo) return;
      const cards = player.hand.filter((card) =>
        player.submittedCombo!.cardIds.includes(card.id)
      );
      combos.push({
        seatIndex: seat.index,
        playerId: player.id,
        displayName: player.displayName,
        cards,
        acesAsEleven: new Set(player.submittedCombo.acesAsEleven)
      });
    });
    if (combos.length === 0) {
      this.resolveSplitPot([]);
      return;
    }
    const result = evaluateCombos(bossCards, combos);
    if (result.requiresOxtail && this.handState.oxtailRound < MAX_OXTAIL_ROUNDS) {
      this.enterOxtailRound();
      return;
    }
    this.payWinners(result.winners, result.bossTotal);
  }

  private enterOxtailRound() {
    if (this.handState.deck.length === 0) {
      this.splitPotBetweenRemaining();
      return;
    }
    const card = this.handState.deck.shift()!;
    this.handState.bossCards.push(card);
    this.handState.oxtailRound += 1;
    this.handState.phase = "oxtail";
    this.handState.bettingRound = "oxtail";
    this.resetRoundContributions();
    this.startBettingRound("oxtail");
  }

  private payWinners(winners: { seatIndex: number; playerId: string }[], bossTotal: number) {
    if (winners.length === 0) {
      this.splitPotBetweenRemaining();
      return;
    }
    const payout = this.handState.potTotal / winners.length;
    winners.forEach((winner) => {
      const player = this.players.get(winner.playerId);
      if (!player) return;
      player.bankroll += payout;
    });
    this.handState.phase = "hand_end";
    this.handState.actionSeat = null;
    this.handState.actionType = null;
    this.clearHands();
  }

  private splitPotBetweenRemaining() {
    const active = this.activeSeatIndices();
    if (active.length === 0) {
      this.handState.phase = "hand_end";
      this.clearHands();
      return;
    }
    const payout = this.handState.potTotal / active.length;
    active.forEach((seatIdx) => {
      const player = this.playerForSeat(seatIdx);
      if (player) player.bankroll += payout;
    });
    this.handState.phase = "hand_end";
    this.clearHands();
  }

  private resolveSplitPot(winners: { seatIndex: number }[]) {
    const seats = winners.length > 0 ? winners.map((w) => w.seatIndex) : this.activeSeatIndices();
    if (seats.length === 0) {
      this.handState.phase = "hand_end";
      return;
    }
    const payout = this.handState.potTotal / seats.length;
    seats.forEach((seatIdx) => {
      const player = this.playerForSeat(seatIdx);
      if (player) player.bankroll += payout;
    });
    this.handState.phase = "hand_end";
    this.clearHands();
  }

  private resolveEarlyWin() {
    const remaining = this.activeSeatIndices();
    if (remaining.length !== 1) {
      this.splitPotBetweenRemaining();
      return;
    }
    const winnerSeat = remaining[0];
    const player = this.playerForSeat(winnerSeat);
    if (player) {
      player.bankroll += this.handState.potTotal;
    }
    this.handState.phase = "hand_end";
    this.clearHands();
  }

  private clearHands() {
    this.seats.forEach((seat) => {
      if (!seat.playerId) return;
      const player = this.players.get(seat.playerId);
      if (!player) return;
      player.hand = [];
      player.comboSelection = { cardIds: [], acesAsEleven: [] };
      player.submittedCombo = null;
      seat.status = "waiting";
    });
    this.handState.actionSeat = null;
    this.handState.actionType = null;
    this.handState.betState = null;
    this.handState.pendingReveal = [];
    this.handState.awaitingCombos = new Set();
    this.handState.bettingRound = null;
    this.handState.actionDeadline = null;
  }

  private resetRoundContributions() {
    Object.values(this.handState.seatRuntime).forEach((runtime) => {
      runtime.contributionsThisRound = 0;
    });
  }

  private visibleBossCards(): Card[] {
    return this.handState.bossCards.slice(0, this.handState.bossRevealed);
  }

  getPublicSnapshot(): TableSnapshot {
    return {
      handNumber: this.handState.handNumber,
      phase: this.handState.phase,
      bettingRound: this.handState.bettingRound,
      potTotal: this.handState.potTotal,
      mainPot: this.handState.mainPot,
      sidePot: this.handState.sidePot,
      dealerSeat: this.dealerSeat,
      boss: {
        revealedCards: this.visibleBossCards(),
        hiddenCount: Math.max(0, this.handState.bossCards.length - this.handState.bossRevealed),
        total: this.visibleBossCards().reduce((sum, card) => sum + cardBossValue(card.rank), 0)
      },
      seats: this.seats.map((seat) => {
        const runtime = this.handState.seatRuntime[seat.index];
        return {
          seatIndex: seat.index,
          playerId: seat.playerId,
          displayName: seat.playerId ? this.players.get(seat.playerId)?.displayName ?? null : null,
          stack: seat.playerId ? this.players.get(seat.playerId)?.bankroll ?? 0 : 0,
          status: seat.status,
          isDealer: this.dealerSeat === seat.index,
          isActing: this.handState.actionSeat === seat.index
        };
      }),
      toActSeat: this.handState.actionSeat,
      actionType: this.handState.actionType,
      actionDeadline: this.handState.actionDeadline,
      oxtailRound: this.handState.oxtailRound,
      currentBet: this.handState.betState?.currentBet ?? 0,
      raisesUsed: this.handState.betState?.raisesUsed ?? 0
    };
  }

  getPrivateState(playerId: string): PlayerPrivateState | null {
    const player = this.players.get(playerId);
    if (!player) return null;
    const seatIndex = player.seatIndex;
    const legalActions = this.determineLegalBetActions(seatIndex ?? -1);
    return {
      playerId,
      seatIndex,
      hand: player.hand,
      comboSelection: player.comboSelection,
      submittedCombo: player.submittedCombo,
      legalBetActions: legalActions,
      canSubmitCombo:
        this.handState.phase === "reveal" &&
        seatIndex !== null &&
        this.handState.actionSeat === seatIndex,
      errors: []
    };
  }

  private determineLegalBetActions(seatIndex: number): BetActionType[] {
    if (seatIndex < 0) return [];
    if (!this.handState.betState) return [];
    if (this.handState.actionSeat !== seatIndex) return [];
    const runtime = this.handState.seatRuntime[seatIndex];
    if (!runtime || runtime.folded || runtime.bowedOut) return [];
    const player = this.playerForSeat(seatIndex);
    if (!player) return [];
    const actions: BetActionType[] = [];
    if (
      this.handState.betState.currentBet === runtime.contributionsThisRound ||
      runtime.allIn
    ) {
      actions.push("check");
    } else {
      actions.push("call");
    }
    actions.push("fold");
    if (
      this.handState.betState.raisesUsed < MAX_RAISES_PER_ROUND &&
      player.bankroll + runtime.contributionsThisRound >
        this.handState.betState.currentBet
    ) {
      actions.push("raise");
    }
    if (player.bankroll > 0) {
      actions.push("all_in");
    }
    return actions;
  }

  setActionDeadline(timestamp: number | null) {
    this.handState.actionDeadline = timestamp;
  }

  forceFoldSeat(seatIndex: number) {
    const runtime = this.handState.seatRuntime[seatIndex];
    if (!runtime) return;
    runtime.folded = true;
    runtime.bowedOut = true;
    this.seats[seatIndex].status = "folded";
    if (this.handState.betState) {
      this.handState.betState.pendingSeats.delete(seatIndex);
      if (this.handState.actionSeat === seatIndex) {
        this.handState.actionSeat = this.nextTurnSeat();
      }
    }
    if (this.handState.phase === "reveal" && this.handState.actionSeat === seatIndex) {
      this.handState.pendingReveal.shift();
      this.advanceRevealTurn();
    }
  }

  private playerForSeat(seatIndex: number): PlayerState | null {
    const seat = this.seats[seatIndex];
    if (!seat || !seat.playerId) return null;
    return this.players.get(seat.playerId) ?? null;
  }

  getSeatPlayerId(seatIndex: number): string | null {
    const seat = this.seats[seatIndex];
    return seat?.playerId ?? null;
  }

  getPlayerSeatIndex(playerId: string): number | null {
    const player = this.players.get(playerId);
    return player?.seatIndex ?? null;
  }

  private buildTurnSequence(startSeat: number, seats: number[]): number[] {
    const ordered: number[] = [];
    if (seats.length === 0) return ordered;
    let current = startSeat;
    const seen = new Set<number>();
    for (let i = 0; i < seats.length; i += 1) {
      if (seats.includes(current) && !seen.has(current)) {
        ordered.push(current);
        seen.add(current);
      }
      current = this.nextSeatIndex(current);
    }
    seats.forEach((seat) => {
      if (!seen.has(seat)) ordered.push(seat);
    });
    return ordered;
  }

  private nextSeatIndex(seatIndex: number): number {
    return (seatIndex + 1) % this.seats.length;
  }

  private nextOccupiedSeat(fromSeat: number | null): number {
    if (fromSeat === null) return 0;
    let seat = this.nextSeatIndex(fromSeat);
    for (let i = 0; i < this.seats.length; i += 1) {
      const data = this.seats[seat];
      if (data.playerId) return seat;
      seat = this.nextSeatIndex(seat);
    }
    return fromSeat;
  }

  private activeSeatIndices(): number[] {
    return this.seats
      .filter((seat) => {
        if (!seat.playerId) return false;
        const runtime = this.handState.seatRuntime[seat.index];
        return runtime && !runtime.folded && !runtime.bowedOut;
      })
      .map((seat) => seat.index);
  }

  private nextTurnSeat(): number | null {
    const betState = this.handState.betState;
    if (!betState) return null;
    const seq = betState.turnSequence;
    for (let i = 0; i < seq.length; i += 1) {
      const seat = seq[(betState.cursor + i) % seq.length];
      const runtime = this.handState.seatRuntime[seat];
      if (
        runtime &&
        !runtime.folded &&
        !runtime.bowedOut &&
        !runtime.allIn &&
        betState.pendingSeats.has(seat)
      ) {
        betState.cursor = (betState.cursor + i) % seq.length;
        return seat;
      }
    }
    return null;
  }

  private onlyOnePlayerLeft(): boolean {
    return this.activeSeatIndices().length <= 1;
  }

  private createEmptyHand(): HandRuntime {
    return {
      handNumber: 0,
      phase: "waiting",
      bettingRound: null,
      deck: [],
      bossCards: [],
      bossRevealed: 0,
      actionSeat: null,
      actionType: null,
      actionDeadline: null,
      dealerSeat: this.dealerSeat,
      oxtailRound: 0,
      potTotal: 0,
      mainPot: 0,
      sidePot: 0,
      seatRuntime: {},
      betState: null,
      pendingReveal: [],
      awaitingCombos: new Set(),
      showdownReady: false,
      finalists: null
    };
  }

  private assignInitialDealer() {
    if (this.dealerSeat !== null) return;
    const occupied = this.seats.filter((seat) => seat.playerId);
    if (occupied.length < 2) return;
    const randomSeat = occupied[Math.floor(Math.random() * occupied.length)];
    this.dealerSeat = randomSeat.index;
    this.handState.dealerSeat = this.dealerSeat;
  }

  private randomOccupiedSeat(): number {
    const occupied = this.seats.filter((seat) => seat.playerId);
    if (occupied.length === 0) return 0;
    const randomSeat = occupied[Math.floor(Math.random() * occupied.length)];
    return randomSeat.index;
  }
}
