import { z } from "zod";

export const CARD_RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K"
] as const;

export const CARD_SUITS = ["H", "D", "C", "S"] as const;

export const cardRankSchema = z.enum(CARD_RANKS);
export const cardSuitSchema = z.enum(CARD_SUITS);

export type CardRank = z.infer<typeof cardRankSchema>;
export type CardSuit = z.infer<typeof cardSuitSchema>;

export interface Card {
  id: string;
  rank: CardRank;
  suit: CardSuit;
}

export const HAND_PHASES = [
  "waiting",
  "blinds",
  "deal",
  "rush",
  "charge",
  "stomp",
  "reveal",
  "scoring",
  "oxtail",
  "hand_end"
] as const;

export type HandPhase = (typeof HAND_PHASES)[number];

export const BETTING_ROUNDS = ["rush", "charge", "stomp", "oxtail"] as const;
export type BettingRound = (typeof BETTING_ROUNDS)[number];

export const SEAT_STATUSES = [
  "open",
  "waiting",
  "acting",
  "folded",
  "all_in",
  "revealing",
  "bowed_out"
] as const;
export type SeatStatus = (typeof SEAT_STATUSES)[number];

export const BET_ACTIONS = [
  "fold",
  "check",
  "call",
  "raise",
  "all_in"
] as const;
export type BetActionType = (typeof BET_ACTIONS)[number];

export const REVEAL_ACTIONS = ["combo_submit", "bow_out"] as const;

export interface SeatPublicState {
  seatIndex: number;
  playerId: string | null;
  displayName: string | null;
  stack: number;
  status: SeatStatus;
  isDealer: boolean;
  isActing: boolean;
}

export interface BossPublicState {
  revealedCards: Card[];
  hiddenCount: number;
  total: number;
}

export interface TableSnapshot {
  handNumber: number;
  phase: HandPhase;
  bettingRound: BettingRound | null;
  potTotal: number;
  mainPot: number;
  sidePot: number;
  dealerSeat: number | null;
  boss: BossPublicState;
  seats: SeatPublicState[];
  toActSeat: number | null;
  actionType: "bet" | "reveal" | null;
  actionDeadline: number | null;
  oxtailRound: number;
  currentBet: number;
  raisesUsed: number;
}

export interface ComboSelection {
  cardIds: string[];
  acesAsEleven: string[];
}

export interface PlayerPrivateState {
  playerId: string;
  seatIndex: number | null;
  hand: Card[];
  comboSelection: ComboSelection;
  submittedCombo: ComboSelection | null;
  legalBetActions: BetActionType[];
  canSubmitCombo: boolean;
  errors: string[];
}

export const joinTableSchema = z.object({
  name: z.string().min(1).max(32)
});
export type JoinTableIntent = z.infer<typeof joinTableSchema>;

export const seatTakeSchema = z.object({
  seatIndex: z.number().int().min(0).max(5)
});
export type SeatTakeIntent = z.infer<typeof seatTakeSchema>;

export const betActionSchema = z.object({
  action: z.enum(BET_ACTIONS),
  seatIndex: z.number().int().min(0).max(5)
});
export type BetIntent = z.infer<typeof betActionSchema>;

export const comboUpdateSchema = z.object({
  cardIds: z.array(z.string()).max(7),
  acesAsEleven: z.array(z.string()).max(7)
});
export type ComboUpdateIntent = z.infer<typeof comboUpdateSchema>;

export const comboSubmitSchema = comboUpdateSchema;
export type ComboSubmitIntent = z.infer<typeof comboSubmitSchema>;

export const oxtailDecisionSchema = z.object({
  bowOut: z.boolean().optional()
});
export type OxtailDecisionIntent = z.infer<typeof oxtailDecisionSchema>;

export interface ClientToServerEvents {
  join_table: (payload: JoinTableIntent) => void;
  seat_take: (payload: SeatTakeIntent) => void;
  seat_leave: () => void;
  start_hand: () => void;
  bet_action: (payload: BetIntent) => void;
  combo_update: (payload: ComboUpdateIntent) => void;
  combo_submit: (payload: ComboSubmitIntent) => void;
  heartbeat: () => void;
}

export interface ServerToClientEvents {
  table_snapshot: (snapshot: TableSnapshot) => void;
  player_private_state: (state: PlayerPrivateState) => void;
  hand_result: (payload: HandResult) => void;
  error: (payload: { code: string; message: string }) => void;
}

export interface PayoutSummary {
  seatIndex: number;
  playerId: string;
  displayName: string | null;
  delta: number;
  finalStack: number;
}

export interface HandResult {
  handNumber: number;
  winners: PayoutSummary[];
  bossTotal: number;
  bossCards: Card[];
  oxtailRound: number;
}

export const INITIAL_STACK = 500;
export const SMALL_BLIND = 0.25;
export const BIG_BLIND = 1;
export const BASE_BET_UNIT = 1;
export const MAX_RAISES_PER_ROUND = 3;
export const TURN_TIMEOUT_MS = 30_000;
export const MAX_OXTAIL_ROUNDS = 3;

export interface TableError {
  code: string;
  message: string;
}
