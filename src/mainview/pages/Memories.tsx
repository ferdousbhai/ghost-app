import { useState, useEffect } from "react";
import { rpc } from "../rpc";
import type { Memory } from "../../shared/rpc";

export function Memories() {
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
    setMemories(mems);
  }

  async function handleSearch() {
    if (!searchQuery.trim()) {
      loadMemories();
      return;
    }
    const results = await rpc.request.searchMemories({ query: searchQuery });
    setMemories(results);
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
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Search memories..."
          className="glass-input flex-1 px-4 py-2 text-sm"
        />
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
            <div className="text-3xl mb-3 opacity-30">&#10024;</div>
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
          >
            {editingKey === mem.key ? (
              <div className="space-y-2">
                <div className="text-sm font-display">
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
                  <div className="text-sm font-display">
                    {mem.key}
                  </div>
                  <div className="text-sm text-[var(--ghost-muted)] mt-0.5 whitespace-pre-wrap">
                    {mem.value}
                  </div>
                  <div className="text-xs opacity-40 mt-1">
                    {new Date(mem.updated_at * 1000).toLocaleDateString()}
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
