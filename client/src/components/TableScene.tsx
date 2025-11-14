import type { PlayerPrivateState, TableSnapshot, SeatPublicState } from "@shared/contracts";
import { clsx } from "clsx";
import { CardStack } from "./cardStack";

const SEAT_POSITIONS = [
  { left: "50%", top: "84%" },
  { left: "80%", top: "72%" },
  { left: "92%", top: "42%" },
  { left: "68%", top: "20%" },
  { left: "32%", top: "20%" },
  { left: "8%", top: "42%" }
];

interface Props {
  snapshot: TableSnapshot | null;
  privateState: PlayerPrivateState | null;
  onSeat: (seat: number) => void;
  onLeaveSeat: () => void;
  onStartHand: () => void;
}

export function TableScene({
  snapshot,
  privateState,
  onSeat,
  onLeaveSeat,
  onStartHand
}: Props) {
  const seats = snapshot?.seats ?? [];
  const seatCount = seats.length;
  const seatedCount = seats.filter((seat) => seat.status !== "open").length;
  const bossCards = snapshot?.boss.revealedCards ?? [];
  const tablePhase = snapshot?.phase ?? "waiting";
  const phaseLabel = tablePhase.toUpperCase();
  const playerSeat = privateState?.seatIndex ?? null;
  const dealerSeat = snapshot?.dealerSeat ?? null;
  const playerSeated = playerSeat !== null;
  const isDealer = dealerSeat !== null && playerSeat === dealerSeat;
  const phaseAllowsStart = ["waiting", "hand_end"].includes(tablePhase);
  const enoughPlayers = seatedCount >= 2;
  const roleAllowsStart = Boolean(playerSeated && (dealerSeat === null || isDealer));
  const startAvailable = phaseAllowsStart && enoughPlayers && roleAllowsStart;
  const startStatusMessage = (() => {
    if (!phaseAllowsStart) return null;
    if (!playerSeated) return "Take a seat to start the hand";
    if (!enoughPlayers) return "Need at least 2 players to start";
    if (!roleAllowsStart) {
      return dealerSeat === null ? "Take a seat to become dealer" : "Waiting for dealer to start";
    }
    return null;
  })();
  const findNextOccupiedSeat = (fromSeat: number | null): number | null => {
    if (fromSeat === null || seatCount === 0) return null;
    for (let offset = 1; offset < seatCount; offset += 1) {
      const idx = (fromSeat + offset) % seatCount;
      const seat = seats[idx];
      if (seat?.playerId) return seat.seatIndex;
    }
    return null;
  };
  const derivedSmallBlindSeat =
    seatCount > 0 ? findNextOccupiedSeat(snapshot?.dealerSeat ?? null) : null;
  const derivedBigBlindSeat =
    seatCount > 0 && derivedSmallBlindSeat !== null
      ? findNextOccupiedSeat(derivedSmallBlindSeat)
      : null;
  const serverBlindsAssigned = seats.some((seat) => seat.isSmallBlind || seat.isBigBlind);
  const useDerivedBlinds =
    !serverBlindsAssigned && derivedSmallBlindSeat !== null && derivedBigBlindSeat !== null;

  return (
    <section className="relative mx-auto mt-4 h-[520px] w-full max-w-5xl rounded-[200px] bg-rail/90 p-6 shadow-2xl">
      <div className="absolute inset-4 rounded-[180px] bg-felt felt-texture" />
      <div className="relative h-full w-full">
        <div className="absolute top-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 text-center">
          <div className="h-24 w-24 rounded-full border-4 border-boss/60 bg-boss/70 shadow-lg" />
          <div className="text-sm uppercase tracking-widest text-slate-200">The Boss</div>
          <CardStack cards={bossCards} />
          <div className="text-xs text-slate-200">
            Total {snapshot?.boss.total ?? 0} - {phaseLabel}
          </div>
          <div className="mt-2 rounded-full bg-rail/70 px-4 py-1 text-xs text-accent">
            Pot ${snapshot?.potTotal.toFixed(2) ?? "0.00"}
          </div>
          {phaseAllowsStart && (
            <div className="mt-2 flex flex-col items-center gap-1 text-xs">
              {startAvailable ? (
                <>
                  <button
                    onClick={onStartHand}
                    className="rounded-full border border-accent px-4 py-1 text-xs uppercase tracking-wide text-accent transition hover:bg-accent hover:text-rail"
                  >
                    Start Hand
                  </button>
                  <span className="text-[11px] text-slate-400">
                    Dealer may wait for more players before starting
                  </span>
                </>
              ) : (
                startStatusMessage && (
                  <span className="text-[11px] text-slate-400">{startStatusMessage}</span>
                )
              )}
            </div>
          )}
        </div>
        {seats.map((seat, index) => {
          const seatIsLocal = playerSeat === seat.seatIndex;
          const seatShowStartButton =
            phaseAllowsStart &&
            seat.playerId &&
            seatIsLocal &&
            enoughPlayers &&
            (dealerSeat === null || seat.isDealer);
          return (
            <SeatNode
              key={seat.seatIndex}
              seat={seat}
              position={SEAT_POSITIONS[index]}
              isYou={playerSeat === seat.seatIndex}
              onSeat={() => onSeat(seat.seatIndex)}
              onLeave={onLeaveSeat}
              showTakeSeat={Boolean(privateState && !seat.playerId)}
              markers={{
                dealer: seat.isDealer,
                sb:
                  seat.isSmallBlind ||
                  (useDerivedBlinds && seat.seatIndex === derivedSmallBlindSeat),
                bb:
                  seat.isBigBlind ||
                  (useDerivedBlinds && seat.seatIndex === derivedBigBlindSeat)
              }}
              showStartButton={seatShowStartButton}
              startEnabled={seatShowStartButton}
              startDisabledReason={null}
              onStartHand={onStartHand}
            />
          );
        })}
      </div>
    </section>
  );
}

interface SeatNodeProps {
  seat: SeatPublicState;
  position: { left: string; top: string };
  isYou: boolean;
  onSeat: () => void;
  onLeave: () => void;
  showTakeSeat: boolean;
  markers: { dealer: boolean; sb: boolean; bb: boolean };
  showStartButton: boolean;
  startEnabled: boolean;
  startDisabledReason: string | null;
  onStartHand: () => void;
}

function SeatNode({
  seat,
  position,
  isYou,
  onSeat,
  onLeave,
  showTakeSeat,
  markers,
  showStartButton,
  startEnabled,
  startDisabledReason,
  onStartHand
}: SeatNodeProps) {
  return (
    <div
      style={{ left: position.left, top: position.top }}
      className="absolute flex w-40 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 text-center text-sm"
    >
      <div
        className={clsx(
          "w-full rounded-2xl border border-white/10 bg-rail/80 px-3 py-2 shadow-lg transition",
          seat.isActing && "border-accent shadow-accent/40",
          seat.isDealer && "ring-2 ring-offset-2 ring-accent ring-offset-rail"
        )}
      >
        <div className="relative text-xs tracking-widest text-slate-300">
          Seat {seat.seatIndex + 1}
          {seat.playerId && (
            <div className="pointer-events-none absolute -top-6 left-1/2 flex -translate-x-1/2 gap-1">
              {markers.dealer && <TableChip label="D" variant="dealer" />}
              {markers.sb && <TableChip label="SB" variant="sb" />}
              {markers.bb && <TableChip label="BB" variant="bb" />}
            </div>
          )}
        </div>
        {seat.playerId ? (
          <>
            <div className="text-base font-semibold text-white">
              {seat.displayName ?? "Player"}
            </div>
            <div className="text-xs text-slate-300">${seat.stack.toFixed(2)}</div>
            <div className="text-xs uppercase text-slate-400">{seat.status}</div>
            {isYou && (
              <button
                onClick={onLeave}
                className="mt-1 text-xs text-red-300 underline decoration-dotted"
              >
                Leave
              </button>
            )}
          </>
        ) : showTakeSeat ? (
          <button
            onClick={onSeat}
            className="mt-2 w-full rounded-full bg-accent/80 py-1 text-xs font-semibold text-rail transition hover:bg-accent"
          >
            Take Seat
          </button>
        ) : (
          <div className="mt-4 text-xs text-slate-500">Empty</div>
        )}
        {showStartButton && (
          <div className="mt-2 flex flex-col items-center gap-1 text-xs">
            <button
              onClick={() => startEnabled && onStartHand()}
              disabled={!startEnabled}
              className={clsx(
                "rounded-full border px-3 py-1 text-[11px] uppercase tracking-wide transition",
                startEnabled
                  ? "border-accent text-accent hover:bg-accent hover:text-rail"
                  : "border-white/30 text-white/40 cursor-not-allowed"
              )}
            >
              Start Hand
            </button>
            {!startEnabled && startDisabledReason && (
              <span className="text-[10px] text-slate-400">{startDisabledReason}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TableChip({ label, variant }: { label: string; variant: "dealer" | "sb" | "bb" }) {
  const colors =
    variant === "dealer"
      ? "bg-amber-400/90 text-rail"
      : variant === "sb"
      ? "bg-sky-500/80 text-white"
      : "bg-rose-500/80 text-white";
  return (
    <span className={clsx("rounded-full px-2 py-0.5 font-semibold shadow", colors)}>
      {label}
    </span>
  );
}
