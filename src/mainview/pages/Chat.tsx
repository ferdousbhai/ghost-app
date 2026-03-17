import { useState, useEffect, useRef } from "react";
import { rpc } from "../rpc";
import type { ChatMessage, Conversation } from "../../shared/rpc";

export function Chat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversations on mount
  useEffect(() => {
    rpc.request.listConversations({}).then(setConversations);
  }, []);

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

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Conversation list */}
      <div className="w-56 border-r border-neutral-800 flex flex-col bg-neutral-900/50">
        <div className="p-3 border-b border-neutral-800">
          <button
            onClick={newConversation}
            className="w-full px-3 py-2 text-sm bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
          >
            + New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center px-3 py-2 text-sm cursor-pointer ${
                activeId === conv.id
                  ? "bg-neutral-800 text-white"
                  : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
              }`}
              onClick={() => setActiveId(conv.id)}
            >
              <span className="flex-1 truncate">
                {conv.title || "Untitled"}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(conv.id);
                }}
                className="hidden group-hover:block text-neutral-500 hover:text-red-400 ml-1"
              >
                &times;
              </button>
            </div>
          ))}
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
                    className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-neutral-800 text-neutral-100"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-neutral-800">
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
                  className="flex-1 px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-sm focus:outline-none focus:border-neutral-500 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 rounded-xl text-sm font-medium transition-colors"
                >
                  Send
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-neutral-500">
            <div className="text-center">
              <p className="text-lg font-medium">Ghost</p>
              <p className="text-sm mt-1">
                Start a new conversation or select one from the sidebar
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
