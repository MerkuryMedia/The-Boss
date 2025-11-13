import { v4 as uuid } from "uuid";
import type { Card, CardRank, CardSuit } from "../shared/contracts";
import { CARD_RANKS, CARD_SUITS } from "../shared/contracts";

export function buildShuffledDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of CARD_SUITS) {
    for (const rank of CARD_RANKS) {
      deck.push({
        id: uuid(),
        rank,
        suit
      });
    }
  }
  return shuffle(deck);
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function cardNumericValue(rank: CardRank, aceAsEleven = false): number {
  if (rank === "A") {
    return aceAsEleven ? 11 : 1;
  }
  if (rank === "K") return 13;
  if (rank === "Q") return 12;
  if (rank === "J") return 11;
  return Number(rank);
}

export function cardBossValue(rank: CardRank): number {
  return cardNumericValue(rank, false);
}

export function computeSuitCounts(cards: Card[]): Record<CardSuit, number> {
  return cards.reduce(
    (acc, card) => {
      acc[card.suit] += 1;
      return acc;
    },
    { H: 0, D: 0, C: 0, S: 0 } as Record<CardSuit, number>
  );
}
