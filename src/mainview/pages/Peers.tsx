import { useState, useEffect } from "react";
import { rpc } from "../rpc";
import type { Peer } from "../../shared/rpc";

export function Peers() {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [addNpub, setAddNpub] = useState("");
  const [addUsername, setAddUsername] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { loadPeers(); }, []);

  async function loadPeers() {
    const list = await rpc.request.listPeers({});
    setPeers(list);
  }

  async function handleAdd() {
    if (!addNpub.trim()) return;
    setError("");
    const result = await rpc.request.addPeer({ npub: addNpub.trim(), username: addUsername.trim() || undefined });
    if ("error" in result) {
      setError(result.error);
    } else {
      setAddNpub("");
      setAddUsername("");
      loadPeers();
    }
  }

  async function handleRemove(npub: string) {
    await rpc.request.removePeer({ npub });
    loadPeers();
  }

  async function handleFollow(npub: string) {
    await rpc.request.followPeer({ npub });
    loadPeers();
  }

  async function handleUnfollow(npub: string) {
    await rpc.request.unfollowPeer({ npub });
    loadPeers();
  }

  const following = peers.filter(p => p.is_following);
  const others = peers.filter(p => !p.is_following);

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-3xl animate-whisper-in">
      <h1 className="text-2xl font-display mb-2">Peers</h1>
      <p className="text-sm text-[var(--ghost-muted)] mb-6">
        Other ghosts you know on the Nostr network.
      </p>

      {/* Add peer */}
      <div className="mb-8 glass-card p-4 space-y-3">
        <div className="text-sm font-display">Add a peer</div>
        <input
          type="text"
          value={addNpub}
          onChange={(e) => { setAddNpub(e.target.value); setError(""); }}
          placeholder="npub1..."
          className="glass-input w-full px-3 py-2 text-sm font-mono"
        />
        <input
          type="text"
          value={addUsername}
          onChange={(e) => setAddUsername(e.target.value)}
          placeholder="Username (optional)"
          className="glass-input w-full px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-[var(--ghost-rose)]">{error}</p>}
        <button
          onClick={handleAdd}
          disabled={!addNpub.trim()}
          className="btn-primary px-4 py-2 text-sm"
        >
          Add peer
        </button>
      </div>

      {/* Following */}
      {following.length > 0 && (
        <div className="mb-6">
          <div className="mb-3">
            <h2 className="text-sm font-display text-[var(--ghost-amber)]">Following</h2>
            <div className="mt-1 h-px w-8" style={{ background: 'linear-gradient(to right, oklch(0.78 0.16 65 / 0.5), transparent)' }} />
          </div>
          <div className="space-y-2">
            {following.map((peer) => (
              <PeerCard key={peer.npub} peer={peer} onRemove={handleRemove} onFollow={handleFollow} onUnfollow={handleUnfollow} />
            ))}
          </div>
        </div>
      )}

      {/* Other peers */}
      {others.length > 0 && (
        <div className="mb-6">
          <div className="mb-3">
            <h2 className="text-sm font-display text-[var(--ghost-amber)]">
              {following.length > 0 ? "Other peers" : "Peers"}
            </h2>
            <div className="mt-1 h-px w-8" style={{ background: 'linear-gradient(to right, oklch(0.78 0.16 65 / 0.5), transparent)' }} />
          </div>
          <div className="space-y-2">
            {others.map((peer) => (
              <PeerCard key={peer.npub} peer={peer} onRemove={handleRemove} onFollow={handleFollow} onUnfollow={handleUnfollow} />
            ))}
          </div>
        </div>
      )}

      {peers.length === 0 && (
        <div className="text-center py-12">
          <svg className="mx-auto mb-3 w-10 h-10 opacity-20 text-[var(--ghost-amber)]" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="16" cy="20" r="10" />
            <circle cx="24" cy="20" r="10" />
            <circle cx="20" cy="14" r="10" />
          </svg>
          <p className="text-sm text-[var(--ghost-muted)]">
            No peers yet. Add a ghost's npub to connect.
          </p>
        </div>
      )}
    </div>
  );
}

function PeerCard({ peer, onRemove, onFollow, onUnfollow }: {
  peer: Peer;
  onRemove: (npub: string) => void;
  onFollow: (npub: string) => void;
  onUnfollow: (npub: string) => void;
}) {
  return (
    <div className="group glass-card p-3 flex items-start gap-3 transition-shadow hover:shadow-[0_0_20px_oklch(0.78_0.16_65/0.08)]">
      {/* Avatar placeholder */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-display"
        style={{ background: 'oklch(0.78 0.16 65 / 0.12)', color: 'oklch(0.78 0.16 65)' }}
      >
        {(peer.username || "?")[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {peer.username || "Unknown"}
          </span>
          {peer.is_following > 0 && (
            <span
              className="badge-follow text-xs px-1.5 py-0.5 rounded"
              style={{ boxShadow: '0 0 8px oklch(0.78 0.16 65 / 0.25)' }}
            >following</span>
          )}
        </div>
        <div className="text-xs text-[var(--ghost-muted)] font-mono truncate mt-0.5">{peer.npub}</div>
        {peer.about && <div className="text-xs text-[var(--ghost-muted)] mt-1 opacity-80">{peer.about}</div>}
        {peer.last_message_at && (
          <div className="text-xs opacity-40 mt-1">
            Last message: {new Date(peer.last_message_at * 1000).toLocaleDateString()}
          </div>
        )}
      </div>
      <div className="hidden group-hover:flex gap-1 shrink-0">
        {peer.is_following ? (
          <button onClick={() => onUnfollow(peer.npub)} className="btn-ghost px-2 py-1 text-xs">
            Unfollow
          </button>
        ) : (
          <button onClick={() => onFollow(peer.npub)} className="btn-primary px-2 py-1 text-xs">
            Follow
          </button>
        )}
        <button onClick={() => onRemove(peer.npub)} className="px-2 py-1 text-xs text-[var(--ghost-muted)] hover:text-[var(--ghost-rose)] transition-colors">
          Remove
        </button>
      </div>
    </div>
  );
}
