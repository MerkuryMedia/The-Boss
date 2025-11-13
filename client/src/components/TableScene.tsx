import type { PlayerPrivateState, TableSnapshot, SeatPublicState } from "@shared/contracts";
import { clsx } from "clsx";
import { CardStack } from "./cardStack";

const SEAT_POSITIONS = [
  { left: "50%", top: "82%" },
  { left: "78%", top: "70%" },
  { left: "88%", top: "38%" },
  { left: "50%", top: "18%" },
  { left: "12%", top: "38%" },
  { left: "22%", top: "70%" }
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
  const bossCards = snapshot?.boss.revealedCards ?? [];
  const phaseLabel = snapshot ? snapshot.phase.toUpperCase() : "WAITING";
  const canStart =
    snapshot &&
    ["waiting", "hand_end"].includes(snapshot.phase) &&
    privateState?.seatIndex !== null &&
    snapshot.dealerSeat === privateState.seatIndex;

  return (
    <section className="relative mx-auto mt-4 h-[520px] w-full max-w-5xl rounded-[200px] bg-rail/90 p-6 shadow-2xl">
      <div className="absolute inset-4 rounded-[180px] bg-felt felt-texture" />
      <div className="relative h-full w-full">
        <div className="absolute top-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 text-center">
          <div className="h-24 w-24 rounded-full border-4 border-boss/60 bg-boss/70 shadow-lg" />
          <div className="text-sm uppercase tracking-widest text-slate-200">The Boss</div>
          <CardStack cards={bossCards} />
          <div className="text-xs text-slate-200">
            Total {snapshot?.boss.total ?? 0} · {phaseLabel}
          </div>
          <div className="mt-2 rounded-full bg-rail/70 px-4 py-1 text-xs text-accent">
            Pot ${snapshot?.potTotal.toFixed(2) ?? "0.00"}
          </div>
          {canStart && (
            <button
              onClick={onStartHand}
              className="mt-2 rounded-full border border-accent px-4 py-1 text-xs uppercase tracking-wide text-accent transition hover:bg-accent hover:text-rail"
            >
              Start Hand
            </button>
          )}
        </div>
        {seats.map((seat, index) => (
          <SeatNode
            key={seat.seatIndex}
            seat={seat}
            position={SEAT_POSITIONS[index]}
            isYou={privateState?.seatIndex === seat.seatIndex}
            onSeat={() => onSeat(seat.seatIndex)}
            onLeave={onLeaveSeat}
            showTakeSeat={Boolean(privateState && !seat.playerId)}
          />
        ))}
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
}

function SeatNode({ seat, position, isYou, onSeat, onLeave, showTakeSeat }: SeatNodeProps) {
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
        <div className="text-xs tracking-widest text-slate-300">Seat {seat.seatIndex + 1}</div>
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
      </div>
    </div>
  );
}
