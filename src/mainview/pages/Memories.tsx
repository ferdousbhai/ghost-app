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
    <div className="flex-1 overflow-y-auto p-8 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-2">Memories</h1>
      <p className="text-sm text-neutral-400 mb-6">
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
          className="flex-1 px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-sm focus:outline-none focus:border-neutral-500"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-sm transition-colors"
        >
          Search
        </button>
        {searchQuery && (
          <button
            onClick={() => {
              setSearchQuery("");
              loadMemories();
            }}
            className="px-3 py-2 text-neutral-500 hover:text-neutral-300 text-sm"
          >
            Clear
          </button>
        )}
      </div>

      {/* Add new memory */}
      <div className="mb-6 p-4 bg-neutral-900 border border-neutral-800 rounded-xl space-y-3">
        <div className="text-sm font-medium text-neutral-300">Add memory</div>
        <input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="Key (e.g. 'favorite_color')"
          className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm focus:outline-none focus:border-neutral-500"
        />
        <textarea
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="Value (e.g. 'blue')"
          rows={2}
          className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm focus:outline-none focus:border-neutral-500 resize-none"
        />
        <button
          onClick={handleAdd}
          disabled={!newKey.trim() || !newValue.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          Save
        </button>
      </div>

      {/* Memory list */}
      <div className="space-y-2">
        {memories.length === 0 && (
          <div className="text-sm text-neutral-500 text-center py-8">
            No memories yet. Your ghost will remember things as you chat, or add
            them manually above.
          </div>
        )}
        {memories.map((mem) => (
          <div
            key={mem.key}
            className="group p-3 bg-neutral-900 border border-neutral-800 rounded-xl"
          >
            {editingKey === mem.key ? (
              <div className="space-y-2">
                <div className="text-sm font-medium text-neutral-300">
                  {mem.key}
                </div>
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm focus:outline-none focus:border-neutral-500 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdate(mem.key)}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-medium transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingKey(null)}
                    className="px-3 py-1 text-neutral-400 hover:text-neutral-200 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-neutral-300">
                    {mem.key}
                  </div>
                  <div className="text-sm text-neutral-400 mt-0.5 whitespace-pre-wrap">
                    {mem.value}
                  </div>
                  <div className="text-xs text-neutral-600 mt-1">
                    {new Date(mem.updated_at * 1000).toLocaleDateString()}
                  </div>
                </div>
                <div className="hidden group-hover:flex gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(mem)}
                    className="px-2 py-1 text-neutral-500 hover:text-neutral-300 text-xs"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(mem.key)}
                    className="px-2 py-1 text-neutral-500 hover:text-red-400 text-xs"
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
