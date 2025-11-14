import type { PlayerPrivateState, TableSnapshot, ComboSubmitIntent } from "@shared/contracts";
import { BASE_BET_UNIT } from "@shared/contracts";
import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { SuitIcon } from "./SuitIcon";

interface Props {
  snapshot: TableSnapshot | null;
  privateState: PlayerPrivateState | null;
  onBet: (action: string, options?: { raiseSteps?: number }) => void;
  onComboChange: (selection: ComboSubmitIntent) => void;
  onComboSubmit: (selection: ComboSubmitIntent) => void;
}

export function PlayerPanel({
  snapshot,
  privateState,
  onBet,
  onComboChange,
  onComboSubmit
}: Props) {
  if (!privateState) {
    return (
      <section className="mx-auto mt-6 w-full max-w-5xl rounded-3xl border border-white/10 bg-rail/70 p-6 text-center text-slate-300">
        Join the table and take a seat to see your hand.
      </section>
    );
  }

  const selection = privateState.comboSelection;
  const [countdown, setCountdown] = useState(0);
  const [raiseSteps, setRaiseSteps] = useState(1);
  const seatIndex = privateState.seatIndex;
  const playerSeatInfo =
    seatIndex !== null && snapshot
      ? snapshot.seats.find((seat) => seat.seatIndex === seatIndex) ?? null
      : null;
  const maxRaiseSteps = Math.max(
    1,
    Math.floor((playerSeatInfo?.stack ?? BASE_BET_UNIT) / BASE_BET_UNIT)
  );
  const isActing = seatIndex !== null && snapshot?.toActSeat === seatIndex;

  useEffect(() => {
    if (!snapshot?.actionDeadline || !isActing) {
      setCountdown(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, snapshot.actionDeadline! - Date.now());
      setCountdown(Math.floor(remaining / 1000));
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [snapshot?.actionDeadline, isActing]);

  useEffect(() => {
    setRaiseSteps((current) => Math.min(Math.max(1, current), maxRaiseSteps));
  }, [maxRaiseSteps]);

  const total = useMemo(() => computeSelectionTotal(privateState), [privateState]);

  const handleCardToggle = (cardId: string) => {
    const exists = selection.cardIds.includes(cardId);
    const cardIds = exists
      ? selection.cardIds.filter((id) => id !== cardId)
      : [...selection.cardIds, cardId];
    const newSelection = { ...selection, cardIds };
    if (!cardIds.includes(cardId)) {
      newSelection.acesAsEleven = newSelection.acesAsEleven.filter((id) => id !== cardId);
    }
    onComboChange(newSelection);
  };

  const handleAceToggle = (cardId: string) => {
    if (!selection.cardIds.includes(cardId)) return;
    const isActive = selection.acesAsEleven.includes(cardId);
    const acesAsEleven = isActive
      ? selection.acesAsEleven.filter((id) => id !== cardId)
      : [...selection.acesAsEleven, cardId];
    onComboChange({ ...selection, acesAsEleven });
  };

  const adjustRaiseSteps = (delta: number) => {
    setRaiseSteps((current) => {
      const next = current + delta;
      if (next < 1) return 1;
      if (next > maxRaiseSteps) return maxRaiseSteps;
      return next;
    });
  };

  const canSubmit = privateState.canSubmitCombo;
  const raiseEnabled = privateState.legalBetActions.includes("raise");
  const raiseAmount = raiseSteps * BASE_BET_UNIT;

  return (
    <section className="mx-auto mt-6 w-full max-w-5xl rounded-3xl border border-white/10 bg-rail/80 p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-4 text-sm text-slate-200">
        <div>
          Acting:{" "}
          <span className="font-semibold text-white">
            {isActing ? "Your move" : snapshot?.actionType ?? "Waiting"}
          </span>
        </div>
        <div className="text-accent">
          Selection - {selection.cardIds.length} cards - Total {total}
        </div>
        {isActing && countdown > 0 && (
          <div className="rounded-full border border-accent px-3 py-1 text-xs text-accent">
            {countdown}s
          </div>
        )}
      </header>
      <div className="grid gap-4">
        <div className="flex flex-wrap justify-center gap-3">
          {privateState.hand.map((card) => {
            const selected = selection.cardIds.includes(card.id);
            const aceHigh = selection.acesAsEleven.includes(card.id);
            const rankColor =
              card.suit === "H" || card.suit === "D" ? "text-red-600" : "text-slate-900";
            return (
              <button
                key={card.id}
                className={clsx(
                  "relative h-36 w-24 rounded-3xl border-2 bg-white text-rail shadow-lg transition",
                  selected ? "border-accent -translate-y-1" : "border-transparent opacity-90"
                )}
                onClick={() => handleCardToggle(card.id)}
              >
                <div className="absolute left-2 top-2 text-left">
                  <div className={clsx("text-sm font-bold leading-none", rankColor)}>
                    {card.rank}
                  </div>
                  <SuitIcon suit={card.suit} className="h-3 w-3" />
                </div>
                <div className="absolute right-2 bottom-2 rotate-180 text-right">
                  <div className={clsx("text-sm font-bold leading-none", rankColor)}>
                    {card.rank}
                  </div>
                  <SuitIcon suit={card.suit} className="h-3 w-3" />
                </div>
                <div className="flex h-full items-center justify-center">
                  <SuitIcon suit={card.suit} className="h-10 w-10" />
                </div>
                {card.rank === "A" && selected && (
                  <button
                    type="button"
                    className={clsx(
                      "absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-xs",
                      aceHigh ? "bg-accent text-rail" : "bg-rail text-white"
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleAceToggle(card.id);
                    }}
                  >
                    {aceHigh ? "11" : "1"}
                  </button>
                )}
              </button>
            );
          })}
        </div>
        {raiseEnabled && (
          <div className="mx-auto mt-4 flex max-w-md flex-col items-center gap-2 rounded-2xl border border-white/10 bg-felt/20 p-3 text-xs text-slate-200">
            <div className="text-sm font-semibold text-white">
              Raise amount: ${raiseAmount.toFixed(2)}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="h-8 w-8 rounded-full border border-white/30 text-lg text-white disabled:opacity-40"
                onClick={() => adjustRaiseSteps(-1)}
                disabled={raiseSteps <= 1}
              >
                -
              </button>
              <div className="min-w-[80px] text-center text-base font-semibold text-accent">
                x{raiseSteps}
              </div>
              <button
                type="button"
                className="h-8 w-8 rounded-full border border-white/30 text-lg text-white disabled:opacity-40"
                onClick={() => adjustRaiseSteps(1)}
                disabled={raiseSteps >= maxRaiseSteps}
              >
                +
              </button>
            </div>
            <div className="text-[11px] text-slate-400">
              Each step equals ${BASE_BET_UNIT.toFixed(2)} (max {maxRaiseSteps} steps)
            </div>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          {privateState.legalBetActions.includes("fold") && (
            <ActionButton label="Fold" tone="danger" onClick={() => onBet("fold")} />
          )}
          {privateState.legalBetActions.includes("check") && (
            <ActionButton label="Check" onClick={() => onBet("check")} />
          )}
          {privateState.legalBetActions.includes("call") && (
            <ActionButton label="Call" onClick={() => onBet("call")} />
          )}
          {raiseEnabled && (
            <ActionButton
              label="Raise"
              tone="accent"
              onClick={() => onBet("raise", { raiseSteps })}
            />
          )}
          {privateState.legalBetActions.includes("all_in") && (
            <ActionButton label="All-In" tone="accent" onClick={() => onBet("all_in")} />
          )}
          {canSubmit && (
            <ActionButton
              label="Submit Combo"
              tone="accent"
              onClick={() => onComboSubmit(selection)}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function computeSelectionTotal(state: PlayerPrivateState): number {
  const cards = state.hand.filter((card) => state.comboSelection.cardIds.includes(card.id));
  return cards.reduce((sum, card) => {
    const aceHigh = state.comboSelection.acesAsEleven.includes(card.id);
    return sum + deriveCardValue(card.rank, aceHigh);
  }, 0);
}

function deriveCardValue(rank: string, aceAsEleven: boolean): number {
  if (rank === "A") return aceAsEleven ? 11 : 1;
  if (rank === "K") return 13;
  if (rank === "Q") return 12;
  if (rank === "J") return 11;
  return Number(rank);
}

interface ActionButtonProps {
  label: string;
  tone?: "neutral" | "danger" | "accent";
  onClick: () => void;
}

function ActionButton({ label, tone = "neutral", onClick }: ActionButtonProps) {
  const styles = {
    neutral: "bg-rail text-white",
    danger: "bg-red-500 text-white",
    accent: "bg-accent text-rail"
  }[tone];

  return (
    <button
      className={clsx(
        "rounded-full px-5 py-2 text-sm font-semibold uppercase tracking-wide transition",
        styles
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export default PlayerPanel;
