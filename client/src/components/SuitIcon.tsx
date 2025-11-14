import type { CardSuit } from "@shared/contracts";
import { clsx } from "clsx";

const SUIT_META: Record<
  CardSuit,
  { color: "text-red-600" | "text-slate-900"; path: JSX.Element }
> = {
  H: {
    color: "text-red-600",
    path: (
      <path d="M12 21c6.5-4.7 9-8.2 9-11.3C21 6.3 19.2 4 16.8 4c-1.6 0-3 1.2-3.8 2.5C11.2 5.2 9.8 4 8.2 4 5.8 4 4 6.3 4 9.7 4 12.8 6.5 16.3 12 21z" />
    )
  },
  D: {
    color: "text-red-600",
    path: <path d="M12 2 4 12l8 10 8-10-8-10z" />
  },
  C: {
    color: "text-slate-900",
    path: (
      <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm3.9-11.5c1.8 0 3.3-1.5 3.3-3.3S17.7 4 15.9 4c-1.3 0-2.4.7-3 1.8-.6-1.1-1.7-1.8-3-1.8-1.8 0-3.3 1.5-3.3 3.3s1.5 3.3 3.3 3.3c.2 0 .3 0 .5-.1-.5.7-.8 1.6-.8 2.6 0 1.4.6 2.6 1.6 3.4H7v2h10v-2h-3.2c1-.8 1.6-2 1.6-3.4 0-1-.3-1.9-.8-2.6.1.1.3.1.5.1z" />
    )
  },
  S: {
    color: "text-slate-900",
    path: (
      <path d="M12 2C7.1 7 5 9.3 5 12c0 2.1 1.7 3.8 3.8 3.8.6 0 1.1-.1 1.6-.3-.7.8-1.1 1.8-1.1 2.9 0 2.2 1.8 4 4 4s4-1.8 4-4c0-1.1-.4-2.1-1.1-2.9.5.2 1 .3 1.6.3 2.1 0 3.8-1.7 3.8-3.8 0-2.7-2.1-5-7-10z" />
    )
  }
};

interface SuitIconProps {
  suit: CardSuit;
  className?: string;
}

export function SuitIcon({ suit, className }: SuitIconProps) {
  const meta = SUIT_META[suit];
  return (
    <svg
      viewBox="0 0 24 24"
      className={clsx("h-5 w-5 fill-current", meta.color, className)}
      aria-hidden="true"
    >
      {meta.path}
    </svg>
  );
}
