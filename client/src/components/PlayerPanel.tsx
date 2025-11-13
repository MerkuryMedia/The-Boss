import type { PlayerPrivateState, TableSnapshot, ComboSubmitIntent } from "@shared/contracts";
import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";

interface Props {
  snapshot: TableSnapshot | null;
  privateState: PlayerPrivateState | null;
  onBet: (action: string) => void;
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
  const isActing = snapshot?.toActSeat === privateState.seatIndex;

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

  const canSubmit = privateState.canSubmitCombo;

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
          Selection · {selection.cardIds.length} cards · Total {total}
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
            return (
              <button
                key={card.id}
                className={clsx(
                  "relative h-32 w-20 rounded-2xl border-2 bg-white/90 text-rail shadow transition",
                  selected ? "border-accent -translate-y-1" : "border-transparent opacity-80"
                )}
                onClick={() => handleCardToggle(card.id)}
              >
                <div className="text-2xl font-semibold">{card.rank}</div>
                <div className="text-xl">{card.suit}</div>
                {card.rank === "A" && selected && (
                  <button
                    type="button"
                    className={clsx(
                      "absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-xs",
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
          {privateState.legalBetActions.includes("raise") && (
            <ActionButton label="Raise" tone="accent" onClick={() => onBet("raise")} />
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
