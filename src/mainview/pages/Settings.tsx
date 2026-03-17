import { useState, useEffect } from "react";
import { rpc } from "../rpc";

export function Settings() {
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [identity, setIdentity] = useState<{ npub: string; hasKey: boolean } | null>(null);
  const [importNsec, setImportNsec] = useState("");
  const [identityError, setIdentityError] = useState("");

  useEffect(() => {
    rpc.request.hasApiKey({}).then(setHasKey);
    rpc.request.getIdentity({}).then(setIdentity);
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

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>

      {/* API Key */}
      <section className="mb-8">
        <h2 className="text-lg font-medium mb-3">Anthropic API Key</h2>
        <p className="text-sm text-neutral-400 mb-4">
          Your API key is stored locally and never leaves your machine. Get one
          at{" "}
          <span className="text-blue-400">console.anthropic.com</span>.
        </p>

        {hasKey ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-sm text-neutral-400">
              sk-ant-...****
            </div>
            <button
              onClick={clearApiKey}
              className="px-4 py-2 text-sm bg-red-900/30 text-red-400 hover:bg-red-900/50 rounded-xl transition-colors"
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
              className="flex-1 px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-sm focus:outline-none focus:border-neutral-500"
            />
            <button
              onClick={saveApiKey}
              disabled={!apiKey.trim()}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl font-medium transition-colors"
            >
              Save
            </button>
          </div>
        )}
        {saved && (
          <p className="text-sm text-green-400 mt-2">API key saved.</p>
        )}
      </section>

      {/* Nostr Identity */}
      <section className="mb-8">
        <h2 className="text-lg font-medium mb-3">Nostr Identity</h2>
        <p className="text-sm text-neutral-400 mb-4">
          Your ghost's identity on the Nostr network. Used for P2P communication with other ghosts.
        </p>

        {identity ? (
          <div className="space-y-3">
            <div>
              <div className="text-xs text-neutral-500 mb-1">Public Key (npub)</div>
              <div className="px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-sm text-neutral-300 font-mono break-all">
                {identity.npub}
              </div>
            </div>
            <div className="text-xs text-neutral-500">
              {identity.hasKey ? "Private key stored locally" : "No private key (read-only)"}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={handleGenerateKeypair}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-medium transition-colors"
            >
              Generate new keypair
            </button>
            <div className="text-sm text-neutral-500">or import an existing key:</div>
            <div className="flex gap-2">
              <input
                type="password"
                value={importNsec}
                onChange={(e) => { setImportNsec(e.target.value); setIdentityError(""); }}
                placeholder="nsec1..."
                className="flex-1 px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-sm focus:outline-none focus:border-neutral-500"
              />
              <button
                onClick={handleImportKeypair}
                disabled={!importNsec.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl text-sm font-medium transition-colors"
              >
                Import
              </button>
            </div>
            {identityError && <p className="text-sm text-red-400">{identityError}</p>}
          </div>
        )}
      </section>

      {/* Model */}
      <section className="mb-8">
        <h2 className="text-lg font-medium mb-3">Model</h2>
        <div className="px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-sm">
          <span className="text-neutral-300">Claude Sonnet 4.6</span>
          <span className="text-neutral-500 ml-2">
            (claude-sonnet-4-6-20250514)
          </span>
        </div>
      </section>

      {/* About */}
      <section>
        <h2 className="text-lg font-medium mb-3">About</h2>
        <div className="text-sm text-neutral-400 space-y-1">
          <p>Ghost v0.1.0</p>
          <p>Local-first P2P AI agent</p>
          <p className="text-neutral-500">MIT License</p>
        </div>
      </section>
    </div>
  );
}
