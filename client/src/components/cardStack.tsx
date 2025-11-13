import type { Card } from "@shared/contracts";
import { clsx } from "clsx";

interface Props {
  cards: Card[];
}

export function CardStack({ cards }: Props) {
  if (cards.length === 0) {
    return <div className="text-xs text-slate-400">Waiting for reveal…</div>;
  }
  return (
    <div className="flex gap-2">
      {cards.map((card, index) => (
        <div
          key={card.id}
          className={clsx(
            "h-16 w-12 rounded-lg border border-white/20 bg-white/90 text-center font-semibold text-rail shadow",
            "flex flex-col items-center justify-center"
          )}
        >
          <span className="text-lg">{card.rank}</span>
          <span className="text-sm">{card.suit}</span>
        </div>
      ))}
    </div>
  );
}

export default CardStack;
