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
        <h2 className="text-base font-display mb-3">Anthropic API Key</h2>
        <p className="text-sm text-[var(--ghost-muted)] mb-4">
          Your API key is stored locally and never leaves your machine. Get one
          at{" "}
          <span className="text-amber-glow">console.anthropic.com</span>.
        </p>

        {hasKey ? (
          <div className="flex items-center gap-3">
            <div className="glass-card flex-1 px-4 py-2 text-sm text-[var(--ghost-muted)] font-mono">
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
        <h2 className="text-base font-display mb-3">Nostr Identity</h2>
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
        <h2 className="text-base font-display mb-3">Nostr Relays</h2>
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
        <div className="glass-card p-3 text-xs text-[var(--ghost-muted)] space-y-1">
          <p>Default relays:</p>
          <ul className="list-disc list-inside opacity-70">
            <li>wss://relay.damus.io</li>
            <li>wss://relay.nostr.band</li>
            <li>wss://nos.lol</li>
          </ul>
        </div>
      </section>

      {/* Model */}
      <section className="mb-8 glass-card p-5">
        <h2 className="text-base font-display mb-3">Model</h2>
        <div className="glass-card px-4 py-3 text-sm">
          <span>Claude Sonnet 4.6</span>
          <span className="text-[var(--ghost-muted)] ml-2">
            (claude-sonnet-4-6-20250514)
          </span>
        </div>
      </section>

      {/* About & Updates */}
      <section className="glass-card p-5">
        <h2 className="text-base font-display mb-3">About</h2>
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
