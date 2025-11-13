import { useEffect, useState, useCallback, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  TableSnapshot,
  PlayerPrivateState,
  ComboSubmitIntent
} from "@shared/contracts";

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function useGameClient() {
  const [socket, setSocket] = useState<GameSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<TableSnapshot | null>(null);
  const [privateState, setPrivateState] = useState<PlayerPrivateState | null>(null);

  useEffect(() => {
    const instance: GameSocket = io();
    setSocket(instance);
    instance.on("connect", () => setConnected(true));
    instance.on("disconnect", () => setConnected(false));
    instance.on("table_snapshot", (next) => setSnapshot(next));
    instance.on("player_private_state", (next) => setPrivateState(next));
    instance.on("error", (payload) => console.warn("Server error", payload));
    return () => {
      instance.disconnect();
    };
  }, []);

  const emit = useCallback(
    <T extends keyof ClientToServerEvents>(
      event: T,
      payload?: Parameters<ClientToServerEvents[T]>[0]
    ) => {
      if (!socket) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (socket.emit as any)(event, payload);
    },
    [socket]
  );

  const joinTable = useCallback(
    (name: string) => emit("join_table", { name }),
    [emit]
  );

  const takeSeat = useCallback(
    (seatIndex: number) => emit("seat_take", { seatIndex }),
    [emit]
  );

  const leaveSeat = useCallback(() => emit("seat_leave"), [emit]);

  const startHand = useCallback(() => emit("start_hand"), [emit]);

  const sendBetAction = useCallback(
    (action: string) => {
      if (!privateState || privateState.seatIndex === null) return;
      emit("bet_action", { action, seatIndex: privateState.seatIndex });
    },
    [emit, privateState]
  );

  const updateCombo = useCallback(
    (selection: ComboSubmitIntent) => emit("combo_update", selection),
    [emit]
  );

  const submitCombo = useCallback(
    (selection: ComboSubmitIntent) => emit("combo_submit", selection),
    [emit]
  );

  const value = useMemo(
    () => ({
      connected,
      snapshot,
      privateState,
      joinTable,
      takeSeat,
      leaveSeat,
      startHand,
      sendBetAction,
      updateCombo,
      submitCombo
    }),
    [
      connected,
      snapshot,
      privateState,
      joinTable,
      takeSeat,
      leaveSeat,
      startHand,
      sendBetAction,
      updateCombo,
      submitCombo
    ]
  );

  return value;
}
