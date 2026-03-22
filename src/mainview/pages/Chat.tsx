import { useState, useEffect, useRef } from "react";
import { rpc, streamEvents } from "../rpc";
import type { ChatMessage, Conversation } from "../../shared/rpc";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

function relativeTime(epochSeconds: number): string {
  const now = Date.now() / 1000;
  const diff = Math.max(0, now - epochSeconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return "yesterday";
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(epochSeconds * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Render message content with basic code block support */
function MessageContent({ content }: { content: string }) {
  if (!content.includes("`")) {
    return <>{content}</>;
  }

  // Split on fenced code blocks (```...```)
  const parts = content.split(/(```[\s\S]*?```)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const inner = part.slice(3, -3);
          // Strip optional language tag on first line
          const newlineIdx = inner.indexOf("\n");
          const code = newlineIdx >= 0 ? inner.slice(newlineIdx + 1) : inner;
          return (
            <pre
              key={i}
              className="my-2 px-3 py-2 rounded-lg bg-black/30 border border-white/[0.06] text-xs font-mono overflow-x-auto whitespace-pre-wrap"
            >
              {code}
            </pre>
          );
        }
        // Handle inline code (`...`)
        const inlineParts = part.split(/(`[^`]+`)/g);
        return (
          <span key={i}>
            {inlineParts.map((ip, j) => {
              if (ip.startsWith("`") && ip.endsWith("`")) {
                return (
                  <code
                    key={j}
                    className="px-1.5 py-0.5 rounded bg-white/[0.07] text-[0.85em] font-mono text-ghost-amber/90"
                  >
                    {ip.slice(1, -1)}
                  </code>
                );
              }
              return ip;
            })}
          </span>
        );
      })}
    </>
  );
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
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const activeIdRef = useRef<string | null>(null);

  // Keep activeIdRef in sync
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const debouncedSearch = useDebounce(searchQuery, 300);

  // Subscribe to stream events
  useEffect(() => {
    const unsubToken = streamEvents.on("streamToken", ({ conversationId, token }) => {
      if (conversationId === activeIdRef.current) {
        setIsStreaming(true);
        setStreamingText((prev) => prev + token);
      }
    });

    function handleStreamEnd(conversationId: string) {
      setIsStreaming(false);
      setStreamingText("");
      setLoading(false);
      rpc.request.getMessages({ conversationId }).then(setMessages);
      rpc.request.listConversations({}).then(setConversations);
    }

    const unsubDone = streamEvents.on("streamDone", ({ conversationId }) => {
      if (conversationId === activeIdRef.current) handleStreamEnd(conversationId);
    });

    const unsubError = streamEvents.on("streamError", ({ conversationId }) => {
      if (conversationId === activeIdRef.current) handleStreamEnd(conversationId);
    });

    return () => {
      unsubToken();
      unsubDone();
      unsubError();
    };
  }, []);

  // Load conversations on mount
  useEffect(() => {
    rpc.request.listConversations({}).then(setConversations);
  }, []);

  // Filter conversations client-side when search query changes
  useEffect(() => {
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      setSearchResults(
        conversations.filter((c) =>
          c.title?.toLowerCase().includes(q)
        )
      );
    } else {
      setSearchResults(null);
    }
  }, [debouncedSearch, conversations]);

  // Load messages when conversation changes
  useEffect(() => {
    if (activeId) {
      rpc.request.getMessages({ conversationId: activeId }).then(setMessages);
    } else {
      setMessages([]);
    }
    // Clear any in-flight streaming state when switching conversations
    setStreamingText("");
    setIsStreaming(false);
  }, [activeId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  // Focus rename input when renaming starts
  useEffect(() => {
    if (renamingId) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingId]);

  async function newConversation() {
    const conv = await rpc.request.createConversation({});
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
  }

  async function handleSend() {
    if (!input.trim() || loading) return;

    let conversationId = activeId;
    if (!conversationId) {
      const conv = await rpc.request.createConversation({});
      conversationId = conv.id;
      setConversations((prev) => [conv, ...prev]);
      setActiveId(conversationId);
    }

    const content = input.trim();
    setInput("");
    setLoading(true);
    setStreamingText("");

    // Optimistically add the user message to the UI
    const optimisticMsg: ChatMessage = {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      role: "user",
      content,
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      // sendMessage returns immediately; streaming happens via RPC messages
      await rpc.request.sendMessage({ conversationId, content });
    } catch {
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
                  ? "bg-ghost-amber/10 text-white border-l-2 border-ghost-amber shadow-[inset_0_0_12px_oklch(0.78_0.16_65_/_0.06)]"
                  : "text-ghost-muted hover:bg-white/[0.03] hover:text-white/80 hover:shadow-[inset_0_0_8px_oklch(1_0_0_/_0.02)] border-l-2 border-transparent"
              }`}
              onClick={() => setActiveId(conv.id)}
              onDoubleClick={() => startRename(conv)}
            >
              {/* Spectral orb */}
              <span
                className={`flex-shrink-0 w-2 h-2 rounded-full mr-2.5 transition-all duration-300 ${
                  activeId === conv.id
                    ? "bg-ghost-amber/70 shadow-[0_0_6px_oklch(0.78_0.16_65_/_0.5)]"
                    : "bg-white/15 group-hover:bg-white/25 group-hover:shadow-[0_0_4px_oklch(1_0_0_/_0.1)]"
                }`}
              />
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
              {renamingId !== conv.id && (
                <span className="text-[10px] text-ghost-muted/70 ml-1 flex-shrink-0">
                  {relativeTime(conv.updated_at)}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(conv.id);
                }}
                className="hidden group-hover:block text-ghost-muted hover:text-ghost-rose ml-1 transition-colors flex-shrink-0"
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
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                  style={{
                    animation: `ghost-whisper-in 0.3s ease-out ${Math.min(idx * 0.04, 0.4)}s both`,
                  }}
                >
                  <div
                    className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm font-body leading-relaxed ${
                      msg.role === "user"
                        ? "bg-ghost-amber/10 border border-ghost-amber/20 text-white border-l-[3px] border-l-ghost-amber/40"
                        : "glass text-white/90 transition-shadow duration-300 hover:shadow-[0_0_20px_oklch(1_0_0_/_0.04)]"
                    }`}
                  >
                    <MessageContent content={msg.content} />
                  </div>
                </div>
              ))}
              {isStreaming && streamingText && (
                <div className="flex justify-start animate-whisper-in">
                  <div className="max-w-[70%] px-4 py-2.5 rounded-2xl text-sm font-body leading-relaxed glass text-white/90">
                    <MessageContent content={streamingText} />
                    <span
                      className="inline-block w-1.5 h-4 ml-0.5 rounded-sm align-text-bottom"
                      style={{
                        background: "oklch(0.78 0.16 65 / 0.5)",
                        boxShadow: "0 0 8px oklch(0.78 0.16 65 / 0.3)",
                        animation: "streaming-cursor 1.2s ease-in-out infinite",
                      }}
                    />
                  </div>
                </div>
              )}
              {loading && !isStreaming && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-3 animate-whisper-in">
                    <div className="relative w-5 h-5">
                      <div className="absolute inset-0 rounded-full bg-white/10" style={{ animation: 'spectral-pulse 1.8s ease-in-out infinite' }} />
                      <div className="absolute inset-[3px] rounded-full bg-white/20" style={{ animation: 'spectral-pulse 1.8s ease-in-out infinite 0.2s' }} />
                      <div className="absolute inset-[6px] rounded-full bg-white/40" style={{ animation: 'spectral-pulse 1.8s ease-in-out infinite 0.4s' }} />
                    </div>
                    <span className="text-sm text-ghost-muted font-body">Channeling...</span>
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
                  className="chat-input flex-1 px-4 py-3 text-sm font-body disabled:opacity-50 rounded-xl"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="btn-primary px-4 py-3 text-sm flex items-center justify-center"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M22 2L11 13" />
                    <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                  </svg>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center animate-materialize">
              {/* Spectral orb with concentric rings */}
              <div className="relative w-24 h-24 mx-auto mb-8">
                <div
                  className="absolute inset-0 rounded-full border border-ghost-amber/[0.06]"
                  style={{ animation: "spectral-pulse 4s ease-in-out infinite" }}
                />
                <div
                  className="absolute inset-2 rounded-full border border-ghost-amber/[0.08]"
                  style={{ animation: "spectral-pulse 4s ease-in-out infinite 0.3s" }}
                />
                <div
                  className="absolute inset-4 rounded-full border border-ghost-amber/[0.12]"
                  style={{ animation: "spectral-pulse 4s ease-in-out infinite 0.6s" }}
                />
                <div
                  className="absolute inset-6 rounded-full bg-ghost-amber/5 border border-ghost-amber/[0.15]"
                  style={{ animation: "spectral-pulse 4s ease-in-out infinite 0.9s" }}
                />
                <div className="absolute inset-8 rounded-full bg-ghost-amber/10 animate-soul-breathe" />
              </div>
              <p className="text-3xl font-display text-amber-glow tracking-tight">
                Ghost
              </p>
              <p className="text-sm mt-2 text-ghost-muted font-body">
                Start a new conversation or select one from the sidebar
              </p>
              <p className="text-xs mt-1 text-ghost-muted/50 font-body tracking-wide">
                Your spectral companion awaits
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
