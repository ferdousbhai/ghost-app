import { useState, useEffect } from "react";
import { rpc } from "../rpc";
import type { Memory } from "../../shared/rpc";

function KeyIcon() {
  return (
    <svg className="w-3 h-3 text-[var(--ghost-amber)] opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
  );
}

export function Memories() {
  const [allMemories, setAllMemories] = useState<Memory[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    loadMemories();
  }, []);

  async function loadMemories() {
    const mems = await rpc.request.listMemories({});
    setAllMemories(mems);
    setMemories(mems);
  }

  function handleSearch() {
    if (!searchQuery.trim()) {
      setMemories(allMemories);
      return;
    }
    const q = searchQuery.toLowerCase();
    setMemories(
      allMemories.filter(
        (m) =>
          m.key.toLowerCase().includes(q) ||
          m.value.toLowerCase().includes(q)
      )
    );
  }

  async function handleAdd() {
    if (!newKey.trim() || !newValue.trim()) return;
    await rpc.request.setMemory({ key: newKey.trim(), value: newValue.trim() });
    setNewKey("");
    setNewValue("");
    loadMemories();
  }

  async function handleUpdate(key: string) {
    if (!editValue.trim()) return;
    await rpc.request.setMemory({ key, value: editValue.trim() });
    setEditingKey(null);
    setEditValue("");
    loadMemories();
  }

  async function handleDelete(key: string) {
    await rpc.request.deleteMemory({ key });
    loadMemories();
  }

  function startEdit(mem: Memory) {
    setEditingKey(mem.key);
    setEditValue(mem.value);
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-3xl animate-whisper-in">
      <h1 className="text-2xl font-display mb-2">Memories</h1>
      <p className="text-sm text-[var(--ghost-muted)] mb-6">
        Key-value pairs your ghost remembers across conversations.
      </p>

      {/* Search */}
      <div className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ghost-muted)] opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search memories..."
            className="glass-input w-full pl-10 pr-4 py-2 text-sm"
          />
        </div>
        <button
          onClick={handleSearch}
          className="btn-ghost px-4 py-2 text-sm"
        >
          Search
        </button>
        {searchQuery && (
          <button
            onClick={() => {
              setSearchQuery("");
              loadMemories();
            }}
            className="px-3 py-2 text-[var(--ghost-muted)] hover:text-[var(--ghost-text)] text-sm transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Add new memory */}
      <div className="mb-6 glass-card p-4 space-y-3 border-t-2 border-[var(--ghost-amber)]/30" style={{ borderTopWidth: '2px', borderTopColor: 'oklch(0.78 0.16 65 / 0.3)' }}>
        <div className="text-sm font-display">Add memory</div>
        <input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="Key (e.g. 'favorite_color')"
          className="glass-input w-full px-3 py-2 text-sm"
        />
        <textarea
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="Value (e.g. 'blue')"
          rows={2}
          className="glass-input w-full px-3 py-2 text-sm resize-none"
        />
        <button
          onClick={handleAdd}
          disabled={!newKey.trim() || !newValue.trim()}
          className="btn-primary px-4 py-2 text-sm"
        >
          Save
        </button>
      </div>

      {/* Memory list */}
      <div className="space-y-2">
        {memories.length === 0 && (
          <div className="text-center py-12">
            <svg className="mx-auto mb-3 w-10 h-10 opacity-20 text-[var(--ghost-amber)]" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
              <path d="M20 4 L32 16 L20 36 L8 16 Z" />
              <path d="M8 16 L32 16" />
              <path d="M14 16 L20 4 L26 16" />
              <path d="M14 16 L20 36" />
              <path d="M26 16 L20 36" />
            </svg>
            <p className="text-sm text-[var(--ghost-muted)]">
              No memories yet. Your ghost will remember things as you chat, or add
              them manually above.
            </p>
          </div>
        )}
        {memories.map((mem) => (
          <div
            key={mem.key}
            className="group glass-card p-3"
            style={{ borderLeft: '2px solid oklch(0.78 0.16 65 / 0.3)' }}
          >
            {editingKey === mem.key ? (
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 text-sm font-display px-2 py-0.5 rounded" style={{ background: 'oklch(0.78 0.16 65 / 0.08)' }}>
                  <KeyIcon />
                  {mem.key}
                </div>
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  rows={2}
                  className="glass-input w-full px-3 py-2 text-sm resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdate(mem.key)}
                    className="btn-primary px-3 py-1 text-xs"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingKey(null)}
                    className="px-3 py-1 text-[var(--ghost-muted)] hover:text-[var(--ghost-text)] text-xs transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="inline-flex items-center gap-1.5 text-sm font-display px-2 py-0.5 rounded" style={{ background: 'oklch(0.78 0.16 65 / 0.08)' }}>
                    <KeyIcon />
                    {mem.key}
                  </div>
                  <div className="text-sm text-[var(--ghost-muted)] mt-0.5 whitespace-pre-wrap">
                    {mem.value}
                  </div>
                </div>
                <div className="hidden group-hover:flex gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(mem)}
                    className="px-2 py-1 text-xs text-[var(--ghost-amber)] opacity-70 hover:opacity-100 transition-opacity"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(mem.key)}
                    className="px-2 py-1 text-xs text-[var(--ghost-muted)] hover:text-[var(--ghost-rose)] transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
