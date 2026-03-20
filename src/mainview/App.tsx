import { useState, useEffect } from "react";
import { rpc } from "./rpc";
import { Chat } from "./pages/Chat";
import { Train } from "./pages/Train";
import { Documents } from "./pages/Documents";
import { Memories } from "./pages/Memories";
import { Peers } from "./pages/Peers";
import { Settings } from "./pages/Settings";
import { Onboarding } from "./pages/Onboarding";

type Page = "chat" | "documents" | "train" | "memories" | "peers" | "settings";

function App() {
  const [page, setPage] = useState<Page>("chat");
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    rpc.request.isOnboarded({}).then(setOnboarded);
  }, []);

  if (onboarded === null) {
    return (
      <div className="h-screen" style={{ background: "var(--ghost-bg)" }}>
        <div className="ambient-bg">
          <div className="ambient-blob ambient-blob-1" />
          <div className="ambient-blob ambient-blob-2" />
        </div>
      </div>
    );
  }

  if (!onboarded) {
    return (
      <Onboarding
        onComplete={(goToTrain) => {
          setOnboarded(true);
          if (goToTrain) setPage("train");
        }}
      />
    );
  }

  return (
    <div className="flex h-screen relative">
      <div className="ambient-bg">
        <div className="ambient-blob ambient-blob-1" />
        <div className="ambient-blob ambient-blob-2" />
        <div className="ambient-blob ambient-blob-3" />
      </div>

      <nav className="ghost-nav">
        {/* Ghost sigil at top */}
        <div className="ghost-sigil">
          <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
            <circle cx="12" cy="10" r="5" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
            <path d="M12 15 C12 15, 8 19, 8 21 C8 21, 12 20, 12 20 C12 20, 16 21, 16 21 C16 19, 12 15, 12 15Z" fill="currentColor" opacity="0.3" />
            <circle cx="12" cy="10" r="1.5" fill="currentColor" opacity="0.5" />
          </svg>
        </div>

        <div className="nav-group">
          <NavButton label="Chat" icon={<IconChat />} active={page === "chat"} onClick={() => setPage("chat")} />
          <NavButton label="Documents" icon={<IconDocs />} active={page === "documents"} onClick={() => setPage("documents")} />
          <NavButton label="Character" icon={<IconTrain />} active={page === "train"} onClick={() => setPage("train")} />
          <NavButton label="Memories" icon={<IconMemories />} active={page === "memories"} onClick={() => setPage("memories")} />
          <NavButton label="Peers" icon={<IconPeers />} active={page === "peers"} onClick={() => setPage("peers")} />
        </div>

        <div className="flex-1" />
        <NavButton label="Settings" icon={<IconSettings />} active={page === "settings"} onClick={() => setPage("settings")} />
      </nav>

      <main className="flex-1 flex flex-col overflow-hidden relative z-10">
        {page === "chat" && <Chat />}
        {page === "documents" && <Documents />}
        {page === "train" && <Train />}
        {page === "memories" && <Memories />}
        {page === "peers" && <Peers />}
        {page === "settings" && <Settings />}
      </main>
    </div>
  );
}

function NavButton({ label, icon, active, onClick }: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`nav-item group ${active ? "nav-item-active" : ""}`}
    >
      <span className="nav-icon">{icon}</span>
      <span className="nav-tooltip">{label}</span>
    </button>
  );
}

/* ─── Bespoke Ghost Icons ─── */
/* Custom-drawn SVGs with spectral aesthetic: thin strokes, */
/* organic curves, ethereal details. 20x20 viewBox. */

function IconChat() {
  return (
    <svg className="w-[18px] h-[18px]" viewBox="0 0 20 20" fill="none">
      {/* Speech bubble with spectral wisps */}
      <path
        d="M4 4.5C4 3.67 4.67 3 5.5 3h9C15.33 3 16 3.67 16 4.5v7c0 .83-.67 1.5-1.5 1.5H8l-3 3v-3H5.5C4.67 13 4 12.33 4 11.5v-7Z"
        stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"
      />
      {/* Ethereal dots — thinking / presence */}
      <circle cx="7.5" cy="8" r="0.8" fill="currentColor" opacity="0.7" />
      <circle cx="10" cy="8" r="0.8" fill="currentColor" opacity="0.5" />
      <circle cx="12.5" cy="8" r="0.8" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

function IconDocs() {
  return (
    <svg className="w-[18px] h-[18px]" viewBox="0 0 20 20" fill="none">
      {/* Layered pages — knowledge stack */}
      <rect x="6" y="2" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.1" opacity="0.3" />
      <rect x="4" y="4" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      {/* Text lines */}
      <line x1="6.5" y1="8" x2="11.5" y2="8" stroke="currentColor" strokeWidth="1" opacity="0.5" strokeLinecap="round" />
      <line x1="6.5" y1="10.5" x2="10" y2="10.5" stroke="currentColor" strokeWidth="1" opacity="0.35" strokeLinecap="round" />
      <line x1="6.5" y1="13" x2="12" y2="13" stroke="currentColor" strokeWidth="1" opacity="0.2" strokeLinecap="round" />
    </svg>
  );
}

function IconTrain() {
  return (
    <svg className="w-[18px] h-[18px]" viewBox="0 0 20 20" fill="none">
      {/* Ghost silhouette — the character/soul being shaped */}
      <path
        d="M10 3C7.24 3 5 5.24 5 8v4c0 .5.2 1 .5 1.2l.5.3v1.5c0 .55.45 1 1 1s1-.2 1-.5v-1h4v1c0 .3.45.5 1 .5s1-.45 1-1v-1.5l.5-.3c.3-.2.5-.7.5-1.2V8c0-2.76-2.24-5-5-5Z"
        stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"
      />
      {/* Eyes — personality indicators */}
      <circle cx="8" cy="8.5" r="1" fill="currentColor" opacity="0.6" />
      <circle cx="12" cy="8.5" r="1" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

function IconMemories() {
  return (
    <svg className="w-[18px] h-[18px]" viewBox="0 0 20 20" fill="none">
      {/* Crystal/gem — preserved memories */}
      <path
        d="M10 2L5 7l5 11 5-11-5-5Z"
        stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"
      />
      {/* Facet lines */}
      <path d="M5 7h10" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <path d="M7 7l3 11" stroke="currentColor" strokeWidth="0.6" opacity="0.25" />
      <path d="M13 7l-3 11" stroke="currentColor" strokeWidth="0.6" opacity="0.25" />
      {/* Sparkle */}
      <circle cx="10" cy="5" r="0.6" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

function IconPeers() {
  return (
    <svg className="w-[18px] h-[18px]" viewBox="0 0 20 20" fill="none">
      {/* Two overlapping circles — connection/bonding */}
      <circle cx="7.5" cy="9" r="4" stroke="currentColor" strokeWidth="1.1" opacity="0.6" />
      <circle cx="12.5" cy="9" r="4" stroke="currentColor" strokeWidth="1.1" opacity="0.6" />
      {/* Connection point in overlap */}
      <circle cx="10" cy="9" r="1" fill="currentColor" opacity="0.4" />
      {/* Signal arcs */}
      <path d="M10 4.5c1.5 0 2.5.5 3 1.5" stroke="currentColor" strokeWidth="0.7" opacity="0.3" strokeLinecap="round" />
      <path d="M10 13.5c-1.5 0-2.5-.5-3-1.5" stroke="currentColor" strokeWidth="0.7" opacity="0.3" strokeLinecap="round" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg className="w-[18px] h-[18px]" viewBox="0 0 20 20" fill="none">
      {/* Minimal tuning sliders — three horizontal lines with dots */}
      <line x1="4" y1="6" x2="16" y2="6" stroke="currentColor" strokeWidth="1" opacity="0.3" strokeLinecap="round" />
      <line x1="4" y1="10" x2="16" y2="10" stroke="currentColor" strokeWidth="1" opacity="0.3" strokeLinecap="round" />
      <line x1="4" y1="14" x2="16" y2="14" stroke="currentColor" strokeWidth="1" opacity="0.3" strokeLinecap="round" />
      {/* Slider handles */}
      <circle cx="8" cy="6" r="1.5" fill="currentColor" opacity="0.7" />
      <circle cx="13" cy="10" r="1.5" fill="currentColor" opacity="0.7" />
      <circle cx="6.5" cy="14" r="1.5" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

export default App;
