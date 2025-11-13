import type { Card } from "../shared/contracts";
import { computeSuitCounts, cardBossValue, cardNumericValue } from "./cards";
import type { CardSuit } from "../shared/contracts";

export interface PlayerComboForScoring {
  seatIndex: number;
  playerId: string;
  displayName: string | null;
  cards: Card[];
  acesAsEleven: Set<string>;
}

export interface ComboEvaluation {
  seatIndex: number;
  playerId: string;
  displayName: string | null;
  total: number;
  cardCount: number;
  suitDistance: number;
  isExact: boolean;
  diff: number;
  under: boolean;
}

export interface ScoringResult {
  winners: ComboEvaluation[];
  requiresOxtail: boolean;
  bossTotal: number;
  tier: "exact" | "non_exact";
}

export function evaluateCombos(
  bossCards: Card[],
  combos: PlayerComboForScoring[]
): ScoringResult {
  const bossTotal = bossCards.reduce((sum, card) => sum + cardBossValue(card.rank), 0);
  const bossSuits = computeSuitCounts(bossCards);
  const evaluations = combos.map((combo) => {
    const total = combo.cards.reduce(
      (sum, card) =>
        sum + cardNumericValue(card.rank, combo.acesAsEleven.has(card.id)),
      0
    );
    const cardCount = combo.cards.length;
    const suitDistance = suitSpreadDistance(combo.cards, bossSuits);
    return {
      seatIndex: combo.seatIndex,
      playerId: combo.playerId,
      displayName: combo.displayName,
      total,
      cardCount,
      suitDistance,
      isExact: total === bossTotal,
      diff: Math.abs(total - bossTotal),
      under: total < bossTotal
    };
  });

  const exact = evaluations.filter((ev) => ev.isExact);
  if (exact.length > 0) {
    const winners = resolveExact(exact);
    return {
      winners,
      requiresOxtail: winners.length > 1,
      bossTotal,
      tier: "exact"
    };
  }
  const nonExact = evaluations.filter((ev) => !ev.isExact);
  const winners = resolveNonExact(nonExact);
  return {
    winners,
    requiresOxtail: winners.length > 1,
    bossTotal,
    tier: "non_exact"
  };
}

function resolveExact(evals: ComboEvaluation[]): ComboEvaluation[] {
  if (evals.length <= 1) return evals;
  const minCardCount = Math.min(...evals.map((ev) => ev.cardCount));
  let contenders = evals.filter((ev) => ev.cardCount === minCardCount);
  const minSuit = Math.min(...contenders.map((ev) => ev.suitDistance));
  contenders = contenders.filter((ev) => ev.suitDistance === minSuit);
  return contenders;
}

function resolveNonExact(evals: ComboEvaluation[]): ComboEvaluation[] {
  if (evals.length <= 1) return evals;
  const minDiff = Math.min(...evals.map((ev) => ev.diff));
  let contenders = evals.filter((ev) => ev.diff === minDiff);
  const under = contenders.filter((ev) => ev.under);
  if (under.length > 0 && under.length !== contenders.length) {
    contenders = under;
  }
  if (contenders.length <= 1) return contenders;
  const minSuit = Math.min(...contenders.map((ev) => ev.suitDistance));
  contenders = contenders.filter((ev) => ev.suitDistance === minSuit);
  return contenders;
}

function suitSpreadDistance(cards: Card[], bossCounts: Record<CardSuit, number>): number {
  const comboCounts = computeSuitCounts(cards);
  return (["H", "D", "C", "S"] as CardSuit[]).reduce(
    (sum, suit) => sum + Math.abs(comboCounts[suit] - bossCounts[suit]),
    0
  );
}
