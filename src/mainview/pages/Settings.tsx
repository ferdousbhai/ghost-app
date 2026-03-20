import { useState, useEffect } from "react";
import { rpc } from "../rpc";

export function Settings() {
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [identity, setIdentity] = useState<{ npub: string; hasKey: boolean } | null>(null);
  const [importNsec, setImportNsec] = useState("");
  const [identityError, setIdentityError] = useState("");
  const [relayStatus, setRelayStatus] = useState<{ connected: number; relays: string[] }>({ connected: 0, relays: [] });
  const [connecting, setConnecting] = useState(false);
  const [appVersion, setAppVersion] = useState("...");
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "available" | "downloading" | "ready" | "error">("idle");
  const [updateError, setUpdateError] = useState("");
  const [backupCopied, setBackupCopied] = useState(false);

  useEffect(() => {
    rpc.request.hasApiKey({}).then(setHasKey);
    rpc.request.getIdentity({}).then(setIdentity);
    rpc.request.getRelayStatus({}).then(setRelayStatus);
    rpc.request.getAppVersion({}).then(setAppVersion);
  }, []);

  async function saveApiKey() {
    if (!apiKey.trim()) return;
    await rpc.request.setConfig({ key: "api_key", value: apiKey.trim() });
    setHasKey(true);
    setApiKey("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function clearApiKey() {
    await rpc.request.setConfig({ key: "api_key", value: "" });
    setHasKey(false);
  }

  async function handleGenerateKeypair() {
    const result = await rpc.request.generateKeypair({});
    setIdentity({ npub: result.npub, hasKey: true });
  }

  async function handleImportKeypair() {
    if (!importNsec.trim()) return;
    const result = await rpc.request.importKeypair({ nsec: importNsec.trim() });
    if ("error" in result) {
      setIdentityError(result.error);
    } else {
      setIdentity({ npub: result.npub, hasKey: true });
      setImportNsec("");
      setIdentityError("");
    }
  }

  async function handleConnectRelays() {
    setConnecting(true);
    const result = await rpc.request.connectRelays({});
    setRelayStatus({ connected: result.connected, relays: relayStatus.relays });
    setConnecting(false);
  }

  async function handleDisconnectRelays() {
    await rpc.request.disconnectRelays({});
    setRelayStatus({ connected: 0, relays: relayStatus.relays });
  }

  async function checkForUpdate() {
    setUpdateStatus("checking");
    setUpdateError("");
    const result = await rpc.request.checkForUpdate({});
    setUpdateStatus(result.updateAvailable ? "available" : "idle");
  }

  async function downloadAndApply() {
    setUpdateStatus("downloading");
    setUpdateError("");
    const dlResult = await rpc.request.downloadUpdate({});
    if (!dlResult.success) {
      setUpdateStatus("error");
      setUpdateError(dlResult.error || "Download failed");
      return;
    }
    setUpdateStatus("ready");
    const applyResult = await rpc.request.applyUpdate({});
    if (!applyResult.success) {
      setUpdateStatus("error");
      setUpdateError(applyResult.error || "Update failed");
    }
    // If successful, app will relaunch automatically
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-2xl animate-whisper-in">
      <h1 className="text-2xl font-display mb-6">Settings</h1>

      {/* API Key */}
      <section className="mb-8 glass-card p-5">
        <h2 className="text-base font-display mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-[var(--ghost-amber)] opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
          Anthropic API Key
        </h2>
        <p className="text-sm text-[var(--ghost-muted)] mb-4">
          Your API key is stored locally and never leaves your machine. Get one
          at{" "}
          <span className="text-amber-glow">console.anthropic.com</span>.
        </p>

        {hasKey ? (
          <div className="flex items-center gap-3">
            <div className="glass-card flex-1 px-4 py-2 text-sm text-[var(--ghost-muted)] font-mono" style={{ letterSpacing: '0.1em' }}>
              sk-ant-...****
            </div>
            <button
              onClick={clearApiKey}
              className="btn-danger px-4 py-2 text-sm"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="glass-input flex-1 px-4 py-2 text-sm"
            />
            <button
              onClick={saveApiKey}
              disabled={!apiKey.trim()}
              className="btn-primary px-4 py-2 text-sm"
            >
              Save
            </button>
          </div>
        )}
        {saved && (
          <p className="text-sm text-[var(--ghost-amber)] mt-2">API key saved.</p>
        )}
      </section>

      {/* Nostr Identity */}
      <section className="mb-8 glass-card p-5">
        <h2 className="text-base font-display mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-[var(--ghost-amber)] opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 10V4" /><path d="M7.5 7.5C7.5 5 9.5 3 12 3s4.5 2 4.5 4.5" /><rect x="5" y="10" width="14" height="11" rx="2" /><circle cx="12" cy="16" r="1" /></svg>
          Nostr Identity
        </h2>
        <p className="text-sm text-[var(--ghost-muted)] mb-4">
          Your ghost's identity on the Nostr network. Used for P2P communication with other ghosts.
        </p>

        {identity ? (
          <div className="space-y-3">
            <div>
              <div className="text-xs text-[var(--ghost-muted)] mb-1">Public Key (npub)</div>
              <div className="glass-card px-4 py-2 text-sm text-[var(--ghost-text)] font-mono break-all">
                {identity.npub}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--ghost-muted)]">
                {identity.hasKey ? "Private key stored locally" : "No private key (read-only)"}
              </span>
              {identity.hasKey && (
                <button
                  onClick={async () => {
                    const nsec = await rpc.request.exportNsec({});
                    if (nsec) {
                      await navigator.clipboard.writeText(nsec);
                      setBackupCopied(true);
                      setTimeout(() => setBackupCopied(false), 3000);
                    }
                  }}
                  className="btn-ghost px-2 py-1 text-xs"
                >
                  {backupCopied ? "Copied!" : "Backup key"}
                </button>
              )}
            </div>
            {backupCopied && (
              <p className="text-xs text-[var(--ghost-amber)] mt-2">
                nsec copied to clipboard. Store it somewhere safe — this is the only way to restore your ghost's identity.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={handleGenerateKeypair}
              className="btn-primary px-4 py-2 text-sm"
            >
              Generate new keypair
            </button>
            <div className="text-sm text-[var(--ghost-muted)]">or import an existing key:</div>
            <div className="flex gap-2">
              <input
                type="password"
                value={importNsec}
                onChange={(e) => { setImportNsec(e.target.value); setIdentityError(""); }}
                placeholder="nsec1..."
                className="glass-input flex-1 px-4 py-2 text-sm"
              />
              <button
                onClick={handleImportKeypair}
                disabled={!importNsec.trim()}
                className="btn-ghost px-4 py-2 text-sm"
              >
                Import
              </button>
            </div>
            {identityError && <p className="text-sm text-[var(--ghost-rose)]">{identityError}</p>}
          </div>
        )}
      </section>

      {/* Nostr Relays */}
      <section className="mb-8 glass-card p-5">
        <h2 className="text-base font-display mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-[var(--ghost-amber)] opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h6" /><path d="M22 12h-6" /><path d="M12 2v6" /><path d="M12 22v-6" /><circle cx="12" cy="12" r="4" /></svg>
          Nostr Relays
        </h2>
        <p className="text-sm text-[var(--ghost-muted)] mb-4">
          Relays are how your ghost communicates with other ghosts.
        </p>
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-2 h-2 rounded-full ${relayStatus.connected > 0 ? "bg-green-500" : "bg-[var(--ghost-amber)] animate-pulse"}`} />
          <span className="text-sm">
            {relayStatus.connected > 0
              ? `Connected to ${relayStatus.connected} relay(s)`
              : "Disconnected"}
          </span>
          <div className="flex-1" />
          {relayStatus.connected > 0 ? (
            <button
              onClick={handleDisconnectRelays}
              className="btn-ghost px-3 py-1.5 text-sm"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleConnectRelays}
              disabled={connecting}
              className="btn-primary px-3 py-1.5 text-sm"
            >
              {connecting ? "Connecting..." : "Connect"}
            </button>
          )}
        </div>
        <div className="glass-card p-3 text-xs text-[var(--ghost-muted)] space-y-2">
          <p className="mb-1">Default relays:</p>
          {["wss://relay.damus.io", "wss://relay.nostr.band", "wss://nos.lol"].map((relay) => (
            <div key={relay} className="flex items-center gap-2">
              <div
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${relayStatus.connected > 0 ? "bg-green-500" : "bg-[var(--ghost-muted)] opacity-40"}`}
              />
              <span className="font-mono">{relay}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Model */}
      <section className="mb-8 glass-card p-5">
        <h2 className="text-base font-display mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-[var(--ghost-amber)] opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3" /><path d="M15 1v3" /><path d="M9 20v3" /><path d="M15 20v3" /><path d="M20 9h3" /><path d="M20 14h3" /><path d="M1 9h3" /><path d="M1 14h3" /></svg>
          Model
        </h2>
        <div className="glass-card px-4 py-3 text-sm">
          <span>Claude Sonnet 4.6</span>
          <span className="text-[var(--ghost-muted)] ml-2">
            (claude-sonnet-4-6-20250514)
          </span>
        </div>
      </section>

      {/* About & Updates */}
      <section className="glass-card p-5">
        <h2 className="text-base font-display mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-[var(--ghost-amber)] opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
          About
        </h2>
        <div className="text-sm text-[var(--ghost-muted)] space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-amber-glow">Ghost v{appVersion}</span>
            <UpdateStatusIndicator
              status={updateStatus}
              error={updateError}
              onCheck={checkForUpdate}
              onInstall={downloadAndApply}
            />
          </div>
          <p>Local-first P2P AI agent</p>
          <p className="opacity-50">MIT License</p>
        </div>
      </section>
    </div>
  );
}

function UpdateStatusIndicator({ status, error, onCheck, onInstall }: {
  status: "idle" | "checking" | "available" | "downloading" | "ready" | "error";
  error: string;
  onCheck: () => void;
  onInstall: () => void;
}) {
  switch (status) {
    case "idle":
      return (
        <button onClick={onCheck} className="btn-ghost px-3 py-1 text-xs">
          Check for updates
        </button>
      );
    case "checking":
      return <span className="text-xs text-[var(--ghost-muted)]">Checking...</span>;
    case "available":
      return (
        <button onClick={onInstall} className="btn-primary px-3 py-1 text-xs">
          Update available — install
        </button>
      );
    case "downloading":
      return <span className="text-xs text-[var(--ghost-amber)]">Downloading update...</span>;
    case "ready":
      return <span className="text-xs text-[var(--ghost-amber)]">Applying update...</span>;
    case "error":
      return <span className="text-xs text-[var(--ghost-rose)]">{error}</span>;
  }
}
