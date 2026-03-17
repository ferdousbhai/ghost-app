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
    <div className="flex-1 overflow-y-auto p-8 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-2">Peers</h1>
      <p className="text-sm text-neutral-400 mb-6">
        Other ghosts you know on the Nostr network.
      </p>

      {/* Add peer */}
      <div className="mb-8 p-4 bg-neutral-900 border border-neutral-800 rounded-xl space-y-3">
        <div className="text-sm font-medium text-neutral-300">Add a peer</div>
        <input
          type="text"
          value={addNpub}
          onChange={(e) => { setAddNpub(e.target.value); setError(""); }}
          placeholder="npub1..."
          className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm font-mono focus:outline-none focus:border-neutral-500"
        />
        <input
          type="text"
          value={addUsername}
          onChange={(e) => setAddUsername(e.target.value)}
          placeholder="Username (optional)"
          className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm focus:outline-none focus:border-neutral-500"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          onClick={handleAdd}
          disabled={!addNpub.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          Add peer
        </button>
      </div>

      {/* Following */}
      {following.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-neutral-400 mb-3">Following</h2>
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
          <h2 className="text-sm font-medium text-neutral-400 mb-3">
            {following.length > 0 ? "Other peers" : "Peers"}
          </h2>
          <div className="space-y-2">
            {others.map((peer) => (
              <PeerCard key={peer.npub} peer={peer} onRemove={handleRemove} onFollow={handleFollow} onUnfollow={handleUnfollow} />
            ))}
          </div>
        </div>
      )}

      {peers.length === 0 && (
        <div className="text-sm text-neutral-500 text-center py-8">
          No peers yet. Add a ghost's npub to connect.
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
    <div className="group p-3 bg-neutral-900 border border-neutral-800 rounded-xl flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-200">
            {peer.username || "Unknown"}
          </span>
          {peer.is_following ? (
            <span className="text-xs px-1.5 py-0.5 bg-blue-900/30 text-blue-400 rounded">following</span>
          ) : null}
        </div>
        <div className="text-xs text-neutral-500 font-mono truncate mt-0.5">{peer.npub}</div>
        {peer.about && <div className="text-xs text-neutral-400 mt-1">{peer.about}</div>}
        {peer.last_message_at && (
          <div className="text-xs text-neutral-600 mt-1">
            Last message: {new Date(peer.last_message_at * 1000).toLocaleDateString()}
          </div>
        )}
      </div>
      <div className="hidden group-hover:flex gap-1 shrink-0">
        {peer.is_following ? (
          <button onClick={() => onUnfollow(peer.npub)} className="px-2 py-1 text-xs text-neutral-500 hover:text-neutral-300">
            Unfollow
          </button>
        ) : (
          <button onClick={() => onFollow(peer.npub)} className="px-2 py-1 text-xs text-blue-400 hover:text-blue-300">
            Follow
          </button>
        )}
        <button onClick={() => onRemove(peer.npub)} className="px-2 py-1 text-xs text-neutral-500 hover:text-red-400">
          Remove
        </button>
      </div>
    </div>
  );
}
