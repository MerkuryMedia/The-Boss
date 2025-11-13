import { useState } from "react";
import { useGameClient } from "./hooks/useGameClient";
import { TableScene } from "./components/TableScene";
import { PlayerPanel } from "./components/PlayerPanel";

function App() {
  const {
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
  } = useGameClient();
  const [nameInput, setNameInput] = useState("");
  const joined = Boolean(privateState);

  const handleJoin = () => {
    if (!nameInput.trim()) return;
    joinTable(nameInput.trim());
    setNameInput("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-felt to-black text-white">
      <header className="border-b border-white/10 bg-rail/70 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-display text-2xl uppercase tracking-wider">The Boss</div>
            <div className="text-xs text-slate-300">
              Hand #{snapshot?.handNumber ?? 0} · Phase {snapshot?.phase ?? "waiting"}
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span
              className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs ${
                connected ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-current" />
              {connected ? "Connected" : "Reconnecting"}
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Display name"
                value={nameInput}
                disabled={joined}
                onChange={(event) => setNameInput(event.target.value)}
                className="rounded-full border border-white/20 bg-transparent px-3 py-1 text-sm focus:border-accent focus:outline-none disabled:opacity-50"
              />
              <button
                onClick={handleJoin}
                disabled={joined}
                className="rounded-full border border-accent px-4 py-1 text-xs font-semibold uppercase tracking-widest text-accent transition hover:bg-accent hover:text-rail disabled:opacity-50"
              >
                Join
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-12 pt-4">
        <TableScene
          snapshot={snapshot}
          privateState={privateState}
          onSeat={takeSeat}
          onLeaveSeat={leaveSeat}
          onStartHand={startHand}
        />

        <PlayerPanel
          snapshot={snapshot}
          privateState={privateState}
          onBet={sendBetAction}
          onComboChange={updateCombo}
          onComboSubmit={submitCombo}
        />
      </main>
    </div>
  );
}

export default App;
