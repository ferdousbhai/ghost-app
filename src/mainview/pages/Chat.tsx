import { useState, useEffect, useRef, useCallback } from "react";
import { rpc } from "../rpc";
import type { ChatMessage, Conversation } from "../../shared/rpc";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export function Chat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Conversation[] | null>(
    null
  );
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = useDebounce(searchQuery, 300);

  // Load conversations on mount
  useEffect(() => {
    rpc.request.listConversations({}).then(setConversations);
  }, []);

  // Search conversations when debounced query changes
  useEffect(() => {
    if (debouncedSearch.trim()) {
      rpc.request
        .searchConversations({ query: debouncedSearch })
        .then(setSearchResults);
    } else {
      setSearchResults(null);
    }
  }, [debouncedSearch]);

  // Load messages when conversation changes
  useEffect(() => {
    if (activeId) {
      rpc.request.getMessages({ conversationId: activeId }).then(setMessages);
    } else {
      setMessages([]);
    }
  }, [activeId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus rename input when renaming starts
  useEffect(() => {
    if (renamingId) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingId]);

  async function newConversation() {
    const id = crypto.randomUUID();
    const conv = await rpc.request.createConversation({ id });
    setConversations((prev) => [conv, ...prev]);
    setActiveId(id);
  }

  async function handleSend() {
    if (!input.trim() || loading) return;

    let conversationId = activeId;
    if (!conversationId) {
      conversationId = crypto.randomUUID();
      const conv = await rpc.request.createConversation({
        id: conversationId,
        title: input.slice(0, 50),
      });
      setConversations((prev) => [conv, ...prev]);
      setActiveId(conversationId);
    }

    const content = input.trim();
    setInput("");
    setLoading(true);

    try {
      await rpc.request.sendMessage({ conversationId, content });
      // Reload messages after send
      const msgs = await rpc.request.getMessages({ conversationId });
      setMessages(msgs);
      // Refresh conversation list (updated_at changed)
      const convs = await rpc.request.listConversations({});
      setConversations(convs);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    await rpc.request.deleteConversation({ id });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
  }

  function startRename(conv: Conversation) {
    setRenamingId(conv.id);
    setRenameValue(conv.title || "");
  }

  async function confirmRename() {
    if (!renamingId) return;
    const title = renameValue.trim();
    if (title) {
      await rpc.request.renameConversation({ id: renamingId, title });
      setConversations((prev) =>
        prev.map((c) => (c.id === renamingId ? { ...c, title } : c))
      );
    }
    setRenamingId(null);
    setRenameValue("");
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue("");
  }

  const displayedConversations = searchResults ?? conversations;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      <div className="w-56 glass sidebar-border flex flex-col">
        <div className="p-3 section-divider space-y-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="glass-input w-full px-3 py-1.5 text-sm font-body"
          />
          <button
            onClick={newConversation}
            className="btn-ghost w-full px-3 py-2 text-sm hover:text-ghost-amber transition-colors"
          >
            + New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {displayedConversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center px-3 py-2 text-sm cursor-pointer transition-all duration-200 ${
                activeId === conv.id
                  ? "bg-ghost-amber/10 text-white border-l-2 border-ghost-amber"
                  : "text-ghost-muted hover:bg-white/[0.03] hover:text-white/80 border-l-2 border-transparent"
              }`}
              onClick={() => setActiveId(conv.id)}
              onDoubleClick={() => startRename(conv)}
            >
              {renamingId === conv.id ? (
                <input
                  ref={renameInputRef}
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmRename();
                    if (e.key === "Escape") cancelRename();
                  }}
                  onBlur={confirmRename}
                  onClick={(e) => e.stopPropagation()}
                  className="glass-input flex-1 min-w-0 px-1 py-0 text-sm text-white"
                />
              ) : (
                <span className="flex-1 truncate font-body">
                  {conv.title || "Untitled"}
                </span>
              )}
              {conv.message_count > 0 && renamingId !== conv.id && (
                <span className="text-xs text-ghost-muted ml-1">
                  {conv.message_count}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(conv.id);
                }}
                className="hidden group-hover:block text-ghost-muted hover:text-ghost-rose ml-1 transition-colors"
              >
                &times;
              </button>
            </div>
          ))}
          {searchResults !== null && searchResults.length === 0 && (
            <div className="px-3 py-4 text-xs text-ghost-muted text-center font-body">
              No conversations found
            </div>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {activeId ? (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm font-body ${
                      msg.role === "user"
                        ? "bg-ghost-amber/10 border border-ghost-amber/20 text-white animate-slide-right"
                        : "glass text-white/90 animate-whisper-in"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-3 animate-whisper-in">
                    <div className="relative w-5 h-5">
                      <div className="absolute inset-0 rounded-full bg-white/10" style={{ animation: 'spectral-pulse 1.8s ease-in-out infinite' }} />
                      <div className="absolute inset-[3px] rounded-full bg-white/20" style={{ animation: 'spectral-pulse 1.8s ease-in-out infinite 0.2s' }} />
                      <div className="absolute inset-[6px] rounded-full bg-white/40" style={{ animation: 'spectral-pulse 1.8s ease-in-out infinite 0.4s' }} />
                    </div>
                    <span className="text-sm text-ghost-muted">Channeling...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 section-divider">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type a message..."
                  disabled={loading}
                  className="glass-input flex-1 px-4 py-2.5 text-sm font-body disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="btn-primary px-5 py-2.5 text-sm"
                >
                  Send
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center animate-materialize">
              {/* Spectral orb */}
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-ghost-amber/5 border border-ghost-amber/10 animate-soul-breathe" />
              <p className="text-3xl font-display text-amber-glow tracking-tight">
                Ghost
              </p>
              <p className="text-sm mt-2 text-ghost-muted font-body">
                Start a new conversation or select one from the sidebar
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
