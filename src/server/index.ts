import path from "node:path";
import fs from "node:fs";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { Server } from "socket.io";
import {
  betActionSchema,
  comboSubmitSchema,
  comboUpdateSchema,
  joinTableSchema,
  seatTakeSchema,
  TableSnapshot,
  type ClientToServerEvents,
  type ServerToClientEvents
} from "@shared/contracts";
import { BossTable } from "@engine";

const fastify = Fastify({ logger: true });
const table = new BossTable();

const clientDistPath = path.join(process.cwd(), "client", "dist");
if (fs.existsSync(clientDistPath)) {
  fastify.register(fastifyStatic, {
    root: clientDistPath,
    prefix: "/"
  });
  fastify.get("/*", (_req, reply) => {
    reply.sendFile("index.html");
  });
}

fastify.get("/health", async () => ({ status: "ok" }));

const io = new Server<ClientToServerEvents, ServerToClientEvents>(fastify.server, {
  cors: { origin: "*" }
});

const socketPlayers = new Map<string, string>();
let actionTimer: NodeJS.Timeout | null = null;

io.on("connection", (socket) => {
  socket.emit("table_snapshot", table.getPublicSnapshot());

  socket.on("join_table", (payload) => {
    try {
      const data = joinTableSchema.parse(payload);
      const { playerId } = table.joinTable(data.name);
      socketPlayers.set(socket.id, playerId);
      sendPrivateState(socket, playerId);
      sync();
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("seat_take", (payload) => {
    const playerId = socketPlayers.get(socket.id);
    if (!playerId) return emitError(socket, { code: "not_joined" });
    try {
      const data = seatTakeSchema.parse(payload);
      table.takeSeat(playerId, data.seatIndex);
      sync();
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("seat_leave", () => {
    const playerId = socketPlayers.get(socket.id);
    if (!playerId) return;
    table.leaveSeat(playerId);
    sync();
  });

  socket.on("start_hand", () => {
    const playerId = socketPlayers.get(socket.id);
    if (!playerId) return emitError(socket, { code: "not_joined" });
    try {
      table.startHand(playerId);
      sync();
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("bet_action", (payload) => {
    const playerId = socketPlayers.get(socket.id);
    if (!playerId) return emitError(socket, { code: "not_joined" });
    try {
      const data = betActionSchema.parse(payload);
      const seatIndex = table.getPlayerSeatIndex(playerId);
      if (seatIndex === null || seatIndex !== data.seatIndex) {
        throw new Error("seat_mismatch");
      }
      table.betAction(playerId, data.action);
      sync();
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("combo_update", (payload) => {
    const playerId = socketPlayers.get(socket.id);
    if (!playerId) return;
    try {
      const data = comboUpdateSchema.parse(payload);
      table.comboUpdate(playerId, data);
      sendPrivateState(socket, playerId);
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("combo_submit", (payload) => {
    const playerId = socketPlayers.get(socket.id);
    if (!playerId) return emitError(socket, { code: "not_joined" });
    try {
      const data = comboSubmitSchema.parse(payload);
      table.comboSubmit(playerId, data);
      sync();
    } catch (error) {
      emitError(socket, error);
    }
  });

  socket.on("heartbeat", () => {
    // No-op for now, but could track last seen timestamps here.
  });

  socket.on("disconnect", () => {
    const playerId = socketPlayers.get(socket.id);
    if (playerId) {
      table.leaveSeat(playerId);
      socketPlayers.delete(socket.id);
      sync();
    }
  });
});

function sendPrivateState(socket: { emit: Function }, playerId: string) {
  const state = table.getPrivateState(playerId);
  if (state) {
    socket.emit("player_private_state", state);
  }
}

function emitError(socket: { emit: Function }, error: unknown) {
  if (error instanceof Error) {
    socket.emit("error", { code: "engine_error", message: error.message });
    return;
  }
  socket.emit("error", {
    code: (error as { code?: string }).code ?? "unknown_error",
    message: "Command rejected"
  });
}

function sync() {
  const snapshot = table.getPublicSnapshot();
  io.emit("table_snapshot", snapshot);
  socketPlayers.forEach((playerId, socketId) => {
    const state = table.getPrivateState(playerId);
    if (state) {
      io.to(socketId).emit("player_private_state", state);
    }
  });
  scheduleTimer(snapshot);
}

function scheduleTimer(snapshot: TableSnapshot) {
  if (actionTimer) {
    clearTimeout(actionTimer);
    actionTimer = null;
  }
  if (!snapshot.actionDeadline || snapshot.toActSeat === null || !snapshot.actionType) {
    return;
  }
  const delay = Math.max(0, snapshot.actionDeadline - Date.now());
  actionTimer = setTimeout(() => handleTimeout(), delay);
}

function handleTimeout() {
  const snapshot = table.getPublicSnapshot();
  if (snapshot.toActSeat === null || !snapshot.actionType) return;
  const playerId = table.getSeatPlayerId(snapshot.toActSeat);
  try {
    if (snapshot.actionType === "bet") {
      if (playerId) {
        table.betAction(playerId, "fold");
      } else {
        table.forceFoldSeat(snapshot.toActSeat);
      }
    } else if (snapshot.actionType === "reveal") {
      if (playerId) {
        table.bowOut(playerId);
      } else {
        table.forceFoldSeat(snapshot.toActSeat);
      }
    }
  } catch (error) {
    console.error("Timeout enforcement failed", error);
  }
  sync();
}

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";

fastify.listen({ port: PORT, host: HOST }).catch((err) => {
  fastify.log.error(err);
  process.exit(1);
});
