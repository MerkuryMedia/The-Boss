import type { Card } from "@shared/contracts";
import { clsx } from "clsx";
import { SuitIcon } from "./SuitIcon";

interface Props {
  cards: Card[];
}

export function CardStack({ cards }: Props) {
  if (cards.length === 0) {
    return <div className="text-xs text-slate-400">Waiting for reveal...</div>;
  }
  return (
    <div className="flex gap-2">
      {cards.map((card) => {
        const rankColor =
          card.suit === "H" || card.suit === "D" ? "text-red-600" : "text-slate-900";
        return (
          <div
            key={card.id}
            className={clsx(
              "relative h-20 w-14 rounded-xl border border-white/40 bg-white px-2 py-2 shadow"
            )}
          >
            <div className="absolute left-1 top-1 text-left">
              <div className={clsx("text-xs font-bold leading-tight", rankColor)}>{card.rank}</div>
              <SuitIcon suit={card.suit} className="h-2.5 w-2.5" />
            </div>
            <div className="flex h-full items-center justify-center">
              <SuitIcon suit={card.suit} className="h-6 w-6" />
            </div>
            <div className="absolute bottom-1 right-1 rotate-180 text-right">
              <div className={clsx("text-xs font-bold leading-tight", rankColor)}>{card.rank}</div>
              <SuitIcon suit={card.suit} className="h-2.5 w-2.5" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default CardStack;
