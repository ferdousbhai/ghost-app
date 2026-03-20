import { BrowserView, BrowserWindow, Updater, Utils } from "electrobun/bun";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "fs";
import { join, dirname, resolve } from "path";
import Database from "bun:sqlite";
import { streamText, tool, jsonSchema, stepCountIs } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { GhostRPC, Conversation, ChatMessage, Memory, Document, Peer } from "../shared/rpc";
import { getDocsDir, indexDocuments, readDocument, watchDocs, extractTitle, hashContent } from "./documents";
import { readFile as readFileFromDisk, writeFile as writeFileToDisk, editFile as editFileOnDisk, executeBash, approveToolCall as approveToolCallFn, denyToolCall as denyToolCallFn, getPendingToolCalls as getPendingToolCallsFn } from "./tools";
import { generateKeypair as genKeypair, identityFromNsec, npubToHex } from "./nostr";
import { buildSystemPrompt } from "./prompt";
import { RelayManager } from "./relay";
import { createGiftWrap, unwrapGiftWrap } from "./encryption";

const DEFAULT_CHARACTER_TEMPLATE = `# Character

This is where you teach your AI who you are. The more you share, the better it represents you.

## About Me

*Who are you? What's your story? Give people context about you.*

[Replace this with a brief intro — your name, what you do, where you're based]

## Personality

*Are you friendly? Direct? Funny? Thoughtful? How do you approach problems?*

[Replace this with a few sentences about your personality]

## Communication Style

*Do you prefer casual or professional? Short replies or detailed explanations? Use humor or emojis?*

[Replace this with how you naturally talk]

## Expertise

*What are you good at? What do you do for work? What topics can you help people with?*

[Replace this with your skills and background]

## Guidelines

*What should your AI avoid? Any topics that are off-limits or things you'd never say?*

[Replace this with any boundaries]

## Example Responses

*Show your AI exactly how you'd reply. This teaches it your voice.*

> **Visitor:** Hey, what are you working on?
> **Me:** [Replace with how you'd actually answer this]

> **Visitor:** What do you think about AI?
> **Me:** [Replace with your real opinion]
`;

// ---------------------------------------------------------------------------
// Data directory + SQLite
// ---------------------------------------------------------------------------
const dataDir = Utils.paths.userData;
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, "ghost.db");
const db = new Database(dbPath, { create: true });

// Enable WAL mode for better concurrent read/write performance
db.exec("PRAGMA journal_mode = WAL");

// Run migrations
db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    peer_npub TEXT,
    is_incoming INTEGER NOT NULL DEFAULT 0,
    message_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages(conversation_id, created_at);

  CREATE VIRTUAL TABLE IF NOT EXISTS conversations_fts USING fts5(title, content='conversations', content_rowid='rowid');

  CREATE TRIGGER IF NOT EXISTS conversations_ai AFTER INSERT ON conversations BEGIN
    INSERT INTO conversations_fts(rowid, title) VALUES (new.rowid, new.title);
  END;

  CREATE TRIGGER IF NOT EXISTS conversations_au AFTER UPDATE ON conversations BEGIN
    INSERT INTO conversations_fts(conversations_fts, rowid, title) VALUES('delete', old.rowid, old.title);
    INSERT INTO conversations_fts(rowid, title) VALUES (new.rowid, new.title);
  END;

  CREATE TRIGGER IF NOT EXISTS conversations_ad AFTER DELETE ON conversations BEGIN
    INSERT INTO conversations_fts(conversations_fts, rowid, title) VALUES('delete', old.rowid, old.title);
  END;

  CREATE TABLE IF NOT EXISTS memories (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    embedding BLOB,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(key, value, content='memories', content_rowid='rowid');

  CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, key, value) VALUES (new.rowid, new.key, new.value);
  END;

  CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, key, value) VALUES('delete', old.rowid, old.key, old.value);
    INSERT INTO memories_fts(rowid, key, value) VALUES (new.rowid, new.key, new.value);
  END;

  CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, key, value) VALUES('delete', old.rowid, old.key, old.value);
  END;

  CREATE TABLE IF NOT EXISTS peers (
    npub TEXT PRIMARY KEY,
    username TEXT,
    about TEXT,
    is_following INTEGER NOT NULL DEFAULT 0,
    last_message_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS documents (
    path TEXT PRIMARY KEY,
    title TEXT,
    content_hash TEXT NOT NULL,
    embedding BLOB,
    indexed_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(path, title, content='documents', content_rowid='rowid');

  CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
    INSERT INTO documents_fts(rowid, path, title) VALUES (new.rowid, new.path, new.title);
  END;

  CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, path, title) VALUES('delete', old.rowid, old.path, old.title);
    INSERT INTO documents_fts(rowid, path, title) VALUES (new.rowid, new.path, new.title);
  END;

  CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, path, title) VALUES('delete', old.rowid, old.path, old.title);
  END;
`);

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------
const stmts = {
  getConfig: db.prepare("SELECT value FROM config WHERE key = ?"),
  setConfig: db.prepare(
    "INSERT INTO config (key, value, updated_at) VALUES (?, ?, unixepoch()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()"
  ),
  listConversations: db.prepare(
    "SELECT * FROM conversations ORDER BY updated_at DESC"
  ),
  getConversation: db.prepare("SELECT * FROM conversations WHERE id = ?"),
  createConversation: db.prepare(
    "INSERT INTO conversations (id, title) VALUES (?, ?) RETURNING *"
  ),
  deleteConversation: db.prepare("DELETE FROM conversations WHERE id = ?"),
  getMessages: db.prepare(
    "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
  ),
  insertMessage: db.prepare(
    "INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?) RETURNING *"
  ),
  updateMessageCount: db.prepare(
    "UPDATE conversations SET message_count = (SELECT COUNT(*) FROM messages WHERE conversation_id = ?), updated_at = unixepoch() WHERE id = ?"
  ),
  renameConversation: db.prepare(
    "UPDATE conversations SET title = ?, updated_at = unixepoch() WHERE id = ?"
  ),
  searchConversations: db.prepare(
    "SELECT c.* FROM conversations c JOIN conversations_fts f ON c.rowid = f.rowid WHERE conversations_fts MATCH ? ORDER BY c.updated_at DESC"
  ),
  listMemories: db.prepare(
    "SELECT key, value, updated_at FROM memories ORDER BY updated_at DESC"
  ),
  getMemory: db.prepare(
    "SELECT key, value, updated_at FROM memories WHERE key = ?"
  ),
  setMemory: db.prepare(
    "INSERT INTO memories (key, value, updated_at) VALUES (?, ?, unixepoch()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()"
  ),
  deleteMemory: db.prepare("DELETE FROM memories WHERE key = ?"),
  searchMemories: db.prepare(
    "SELECT m.key, m.value, m.updated_at FROM memories m JOIN memories_fts f ON m.rowid = f.rowid WHERE memories_fts MATCH ? ORDER BY m.updated_at DESC LIMIT 20"
  ),
  listDocuments: db.prepare(
    "SELECT path, title, content_hash, indexed_at FROM documents ORDER BY title ASC"
  ),
  searchDocuments: db.prepare(
    "SELECT d.path, d.title, d.content_hash, d.indexed_at FROM documents d JOIN documents_fts f ON d.rowid = f.rowid WHERE documents_fts MATCH ? ORDER BY d.title ASC LIMIT 20"
  ),
  getCharacter: db.prepare("SELECT value FROM config WHERE key = 'character'"),
  saveCharacter: db.prepare(
    "INSERT INTO config (key, value, updated_at) VALUES ('character', ?, unixepoch()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()"
  ),
  listPeers: db.prepare("SELECT * FROM peers ORDER BY last_message_at DESC NULLS LAST, created_at DESC"),
  addPeer: db.prepare("INSERT INTO peers (npub, username) VALUES (?, ?) ON CONFLICT(npub) DO UPDATE SET username = COALESCE(excluded.username, peers.username)"),
  removePeer: db.prepare("DELETE FROM peers WHERE npub = ?"),
  followPeer: db.prepare("UPDATE peers SET is_following = 1 WHERE npub = ?"),
  unfollowPeer: db.prepare("UPDATE peers SET is_following = 0 WHERE npub = ?"),
  getPeer: db.prepare("SELECT * FROM peers WHERE npub = ?"),
};

// ---------------------------------------------------------------------------
// Document indexing + file watcher
// ---------------------------------------------------------------------------
const docsDir = getDocsDir(dataDir);
const docsDirPrefix = docsDir.endsWith("/") ? docsDir : docsDir + "/";
const initialCount = indexDocuments(db, docsDir);
console.log(`Indexed ${initialCount} documents from ${docsDir}`);
watchDocs(db, docsDir);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Sanitize a query for FTS5 prefix search. */
function ftsQuery(query: string): string {
  return `"${query.trim().replace(/"/g, '""')}"*`;
}

/** Validate a relative path resolves within docsDir. Returns full path or null. */
function resolveDocPath(relPath: string): string | null {
  const full = resolve(docsDir, relPath);
  if (!full.startsWith(docsDirPrefix)) return null;
  return full;
}

/** Index a single document (avoids full directory rescan). */
const upsertDoc = db.prepare(
  "INSERT INTO documents (path, title, content_hash, indexed_at) VALUES (?, ?, ?, unixepoch()) ON CONFLICT(path) DO UPDATE SET title = excluded.title, content_hash = excluded.content_hash, indexed_at = unixepoch()"
);
function indexSingleDoc(relPath: string, content: string) {
  const title = extractTitle(content, relPath);
  const hash = hashContent(content);
  upsertDoc.run(relPath, title, hash);
}

// ---------------------------------------------------------------------------
// Cached Anthropic client (recreated only when API key changes)
// ---------------------------------------------------------------------------
let cachedAnthropic: { key: string; client: ReturnType<typeof createAnthropic> } | null = null;
function getAnthropicClient(apiKey: string) {
  if (!cachedAnthropic || cachedAnthropic.key !== apiKey) {
    cachedAnthropic = { key: apiKey, client: createAnthropic({ apiKey }) };
  }
  return cachedAnthropic.client;
}

// ---------------------------------------------------------------------------
// Agent tools (defined once at module scope)
// ---------------------------------------------------------------------------
const agentTools = {
  read_file: tool({
    description: "Read the contents of a file at the given path.",
    parameters: jsonSchema({
      type: "object" as const,
      properties: { path: { type: "string", description: "Absolute path to the file to read" } },
      required: ["path"],
    }),
    execute: async ({ path }: { path: string }) => readFileFromDisk(path),
  }),
  write_file: tool({
    description: "Write content to a file. Creates the file and any parent directories if they don't exist.",
    parameters: jsonSchema({
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Absolute path to the file to write" },
        content: { type: "string", description: "The content to write to the file" },
      },
      required: ["path", "content"],
    }),
    execute: async ({ path, content }: { path: string; content: string }) => writeFileToDisk(path, content),
  }),
  edit_file: tool({
    description: "Find and replace text in a file. The old_text must match exactly.",
    parameters: jsonSchema({
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Absolute path to the file to edit" },
        old_text: { type: "string", description: "The exact text to find and replace" },
        new_text: { type: "string", description: "The text to replace it with" },
      },
      required: ["path", "old_text", "new_text"],
    }),
    execute: async ({ path, old_text, new_text }: { path: string; old_text: string; new_text: string }) => editFileOnDisk(path, old_text, new_text),
  }),
  bash: tool({
    description: "Execute a bash command on the user's machine. Use for file operations, system info, package management, running scripts, etc.",
    parameters: jsonSchema({
      type: "object" as const,
      properties: { command: { type: "string", description: "The bash command to execute" } },
      required: ["command"],
    }),
    execute: async ({ command }: { command: string }) => executeBash(command),
  }),
  documents: tool({
    description: "Access your knowledge base documents. Actions: 'list' (all docs), 'search' (find by query), 'read' (get content by path).",
    parameters: jsonSchema({
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["list", "search", "read"], description: "Action to perform" },
        query: { type: "string", description: "Search query (for 'search' action)" },
        path: { type: "string", description: "Document path (for 'read' action)" },
      },
      required: ["action"],
    }),
    execute: async ({ action, query, path }: { action: string; query?: string; path?: string }) => {
      if (action === "list") {
        const docs = stmts.listDocuments.all() as Document[];
        if (!docs.length) return "No documents in your knowledge base. Add files to your docs folder.";
        return docs.map(d => `${d.title || d.path} (${d.path})`).join("\n");
      }
      if (action === "search") {
        if (!query) return "Error: query is required for search action";
        try {
          const results = stmts.searchDocuments.all(ftsQuery(query)) as Document[];
          if (!results.length) return `No documents matching "${query}"`;
          return results.map(d => `${d.title || d.path} (${d.path})`).join("\n");
        } catch { return `No documents matching "${query}"`; }
      }
      if (action === "read") {
        if (!path) return "Error: path is required for read action";
        const docContent = readDocument(docsDir, path);
        if (!docContent) return `Document not found: ${path}`;
        if (docContent.length > 5000) {
          return docContent.slice(0, 5000) + `\n\n... (${docContent.length - 5000} more characters. Use read_file with the full path to read more.)`;
        }
        return docContent;
      }
      return "Error: action must be 'list', 'search', or 'read'";
    },
  }),
  remember: tool({
    description: "Save a memory (key-value pair). Use to store important facts, preferences, or context. Empty value deletes the memory.",
    parameters: jsonSchema({
      type: "object" as const,
      properties: {
        key: { type: "string", description: "Memory key (short, descriptive)" },
        value: { type: "string", description: "Memory value. Empty string to delete." },
      },
      required: ["key", "value"],
    }),
    execute: async ({ key, value }: { key: string; value: string }) => {
      if (!value || value.trim() === "") {
        stmts.deleteMemory.run(key);
        return `Memory deleted: "${key}"`;
      }
      const existing = stmts.getMemory.get(key) as { key: string; value: string } | null;
      stmts.setMemory.run(key, value);
      if (existing) {
        return `Updated "${key}" (previous: "${existing.value}")`;
      }
      return `Remembered: "${key}" = "${value}"`;
    },
  }),
  recall: tool({
    description: "Search your memories by query. Returns matching memories ranked by relevance.",
    parameters: jsonSchema({
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query to find relevant memories" },
      },
      required: ["query"],
    }),
    execute: async ({ query }: { query: string }) => {
      try {
        const results = stmts.searchMemories.all(ftsQuery(query)) as Memory[];
        if (!results.length) {
          const all = stmts.listMemories.all() as Memory[];
          if (!all.length) return "No memories stored yet.";
          return "No exact matches. All memories:\n" + all.slice(0, 20).map(m => `${m.key}: ${m.value}`).join("\n");
        }
        return results.map(m => `${m.key}: ${m.value}`).join("\n");
      } catch {
        return "Memory search failed. Try a different query.";
      }
    },
  }),
  create_doc: tool({
    description: "Create a new document in your knowledge base (docs folder).",
    parameters: jsonSchema({
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Relative path within docs folder (e.g., 'notes/meeting.md')" },
        content: { type: "string", description: "Document content (markdown recommended)" },
      },
      required: ["path", "content"],
    }),
    execute: async ({ path: docPath, content }: { path: string; content: string }) => {
      const fullPath = resolveDocPath(docPath);
      if (!fullPath) return "Error: path must be within docs folder";
      if (existsSync(fullPath)) return `Error: document already exists at ${docPath}. Use edit_doc to modify it.`;
      const dir = dirname(fullPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(fullPath, content, "utf-8");
      indexSingleDoc(docPath, content);
      return `Created document: ${docPath}`;
    },
  }),
  edit_doc: tool({
    description: "Edit a document in your knowledge base using find-and-replace.",
    parameters: jsonSchema({
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Relative path within docs folder" },
        old_text: { type: "string", description: "Exact text to find" },
        new_text: { type: "string", description: "Replacement text" },
      },
      required: ["path", "old_text", "new_text"],
    }),
    execute: async ({ path: docPath, old_text, new_text }: { path: string; old_text: string; new_text: string }) => {
      const fullPath = resolveDocPath(docPath);
      if (!fullPath) return "Error: path must be within docs folder";
      if (!existsSync(fullPath)) return `Error: document not found: ${docPath}`;
      const content = readFileSync(fullPath, "utf-8");
      if (!content.includes(old_text)) return `Error: could not find the specified text in ${docPath}`;
      const updated = content.replace(old_text, new_text);
      writeFileSync(fullPath, updated, "utf-8");
      indexSingleDoc(docPath, updated);
      return `Edited document: ${docPath}`;
    },
  }),
  conversations: tool({
    description: "Search your past conversations or load messages from a specific conversation. Actions: 'search' (find by title query), 'load' (get messages by conversation ID).",
    parameters: jsonSchema({
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["search", "load"], description: "Action to perform" },
        query: { type: "string", description: "Search query for conversation titles (for 'search' action)" },
        conversation_id: { type: "string", description: "Conversation ID to load messages from (for 'load' action)" },
        limit: { type: "number", description: "Max results to return (default 10)" },
      },
      required: ["action"],
    }),
    execute: async ({ action, query, conversation_id, limit }: { action: string; query?: string; conversation_id?: string; limit?: number }) => {
      const maxResults = limit || 10;
      if (action === "search") {
        if (!query) return "Error: query is required for search action";
        try {
          const results = stmts.searchConversations.all(ftsQuery(query)) as Conversation[];
          if (!results.length) return `No conversations matching "${query}"`;
          return results.slice(0, maxResults).map(c =>
            `[${c.id}] ${c.title || "(untitled)"} — ${c.message_count} messages, last active ${new Date(c.updated_at * 1000).toLocaleDateString()}`
          ).join("\n");
        } catch { return `No conversations matching "${query}"`; }
      }
      if (action === "load") {
        if (!conversation_id) return "Error: conversation_id is required for load action";
        const messages = stmts.getMessages.all(conversation_id) as ChatMessage[];
        if (!messages.length) return `No messages found in conversation ${conversation_id}`;
        const limited = messages.slice(-maxResults);
        const prefix = messages.length > maxResults ? `(showing last ${maxResults} of ${messages.length} messages)\n\n` : "";
        return prefix + limited.map(m => `[${m.role}]: ${m.content}`).join("\n\n");
      }
      return "Error: action must be 'search' or 'load'";
    },
  }),
};

// ---------------------------------------------------------------------------
// Relay manager (initialized lazily on first connect)
// ---------------------------------------------------------------------------
let relayManager: RelayManager | null = null;

function getRelayManager(): RelayManager {
  if (!relayManager) {
    relayManager = new RelayManager(undefined, (event, _relay) => {
      // Handle incoming gift-wrapped DMs
      const nsecRow = stmts.getConfig.get("nsec") as { value: string } | null;
      if (!nsecRow?.value) return;

      const unwrapped = unwrapGiftWrap(nsecRow.value, event);
      if (!unwrapped) return;

      console.log(
        `Received DM from ${unwrapped.senderPubkey}: ${unwrapped.message.content.slice(0, 50)}...`
      );

      // Ensure conversation exists
      const convId = unwrapped.message.conversationId;
      try {
        stmts.createConversation.get(
          convId,
          `DM from ${unwrapped.senderPubkey.slice(0, 8)}...`
        );
      } catch {
        // Conversation may already exist
      }

      // Store as incoming message
      const msgId = crypto.randomUUID();
      stmts.insertMessage.run(msgId, convId, "user", unwrapped.message.content);
      stmts.updateMessageCount.run(convId, convId);
    });
  }
  return relayManager;
}

// ---------------------------------------------------------------------------
// RPC handlers
// ---------------------------------------------------------------------------
const rpc = BrowserView.defineRPC<GhostRPC>({
  maxRequestTime: 120000, // 2 min for AI responses
  handlers: {
    requests: {
      // Config
      getConfig: ({ key }) => {
        const row = stmts.getConfig.get(key) as { value: string } | null;
        return row?.value ?? null;
      },
      setConfig: ({ key, value }) => {
        stmts.setConfig.run(key, value);
        return { success: true };
      },

      // Conversations
      listConversations: () => {
        return stmts.listConversations.all() as Conversation[];
      },
      getConversation: ({ id }) => {
        return (stmts.getConversation.get(id) as Conversation) ?? null;
      },
      createConversation: ({ id, title }) => {
        return stmts.createConversation.get(id, title ?? null) as Conversation;
      },
      deleteConversation: ({ id }) => {
        stmts.deleteConversation.run(id);
        return { success: true };
      },
      renameConversation: ({ id, title }) => {
        stmts.renameConversation.run(title, id);
        return { success: true };
      },
      searchConversations: ({ query }) => {
        return stmts.searchConversations.all(ftsQuery(query)) as Conversation[];
      },

      // Messages
      getMessages: ({ conversationId }) => {
        return stmts.getMessages.all(conversationId) as ChatMessage[];
      },

      // Chat — AI SDK streamText with RPC push (issues #4, #5, #6)
      sendMessage: ({ conversationId, content }) => {
        const msgId = crypto.randomUUID();
        stmts.insertMessage.run(msgId, conversationId, "user", content);
        stmts.updateMessageCount.run(conversationId, conversationId);

        // Check for API key
        const apiKeyRow = stmts.getConfig.get("api_key") as { value: string } | null;
        if (!apiKeyRow?.value) {
          const replyId = crypto.randomUUID();
          stmts.insertMessage.run(
            replyId,
            conversationId,
            "assistant",
            "Please add your Anthropic API key in Settings to start chatting."
          );
          stmts.updateMessageCount.run(conversationId, conversationId);
          rpc.send.streamDone({ conversationId, messageId: replyId });
          return { messageId: msgId };
        }

        // Load conversation history for context
        const history = stmts.getMessages.all(conversationId) as ChatMessage[];
        const aiMessages = history
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

        // Build system prompt from character, username, documents, and memories
        const characterRow = stmts.getConfig.get("character") as { value: string } | null;
        const usernameRow = stmts.getConfig.get("username") as { value: string } | null;
        const allDocuments = stmts.listDocuments.all() as Document[];
        const allMemories = stmts.listMemories.all() as Memory[];
        const systemPrompt = buildSystemPrompt({
          username: usernameRow?.value ?? null,
          character: characterRow?.value ?? null,
          documents: allDocuments,
          memories: allMemories,
        });

        // Start streaming in background (don't block the RPC response)
        (async () => {
          try {
            const anthropic = getAnthropicClient(apiKeyRow.value);
            const result = streamText({
              model: anthropic("claude-sonnet-4-6-20250514"),
              system: systemPrompt,
              messages: aiMessages,
              maxOutputTokens: 4096,
              stopWhen: stepCountIs(5),
              providerOptions: {
                anthropic: {
                  contextManagement: {
                    edits: [{
                      type: "compact_20260112",
                      trigger: { type: "input_tokens", value: 150_000 },
                      instructions: "Preserve: key decisions, facts learned, documents read, tool outcomes, unresolved questions. Drop: verbose tool output, repetitive exchanges, greeting pleasantries."
                    }]
                  }
                }
              },
              tools: agentTools,
            });

            // Stream text deltas to frontend
            let fullText = "";
            for await (const delta of result.textStream) {
              fullText += delta;
              rpc.send.streamToken({ conversationId, token: delta });
            }

            // Save completed message
            const replyId = crypto.randomUUID();
            stmts.insertMessage.run(replyId, conversationId, "assistant", fullText);
            stmts.updateMessageCount.run(conversationId, conversationId);

            // Auto-title: use first user message as title for untitled conversations
            const conv = stmts.getConversation.get(conversationId) as Conversation | null;
            if (conv && !conv.title) {
              const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
              stmts.renameConversation.run(title, conversationId);
            }

            rpc.send.streamDone({ conversationId, messageId: replyId });
          } catch (err: any) {
            const replyId = crypto.randomUUID();
            const errorMsg = `Error: ${err.message || "Failed to generate response"}`;
            stmts.insertMessage.run(replyId, conversationId, "assistant", errorMsg);
            stmts.updateMessageCount.run(conversationId, conversationId);
            rpc.send.streamError({ conversationId, error: errorMsg });
          }
        })().catch((e) => console.error("Unhandled streaming error:", e));

        return { messageId: msgId };
      },

      // Character
      getCharacter: () => {
        const row = stmts.getCharacter.get() as { value: string } | null;
        return row?.value || DEFAULT_CHARACTER_TEMPLATE;
      },
      saveCharacter: ({ content }) => {
        stmts.saveCharacter.run(content);
        return { success: true };
      },

      // Onboarding
      isOnboarded: () => {
        const row = stmts.getConfig.get("onboarded") as { value: string } | null;
        return row?.value === "true";
      },
      completeOnboarding: () => {
        stmts.setConfig.run("onboarded", "true");
        return { success: true };
      },

      // Memories
      listMemories: () => {
        return stmts.listMemories.all() as Memory[];
      },
      setMemory: ({ key, value }) => {
        const existing = stmts.getMemory.get(key) as Memory | null;
        stmts.setMemory.run(key, value);
        return { success: true, previousValue: existing?.value ?? null };
      },
      deleteMemory: ({ key }) => {
        stmts.deleteMemory.run(key);
        return { success: true };
      },
      searchMemories: ({ query }) => {
        try {
          return stmts.searchMemories.all(ftsQuery(query)) as Memory[];
        } catch {
          return [];
        }
      },

      // Documents
      listDocuments: () => {
        return stmts.listDocuments.all() as Document[];
      },
      readDocument: ({ path }) => {
        return readDocument(docsDir, path);
      },
      searchDocuments: ({ query }) => {
        try {
          return stmts.searchDocuments.all(ftsQuery(query)) as Document[];
        } catch {
          return [];
        }
      },
      getDocsDir: () => {
        return docsDir;
      },
      reindexDocuments: () => {
        const indexed = indexDocuments(db, docsDir);
        return { indexed };
      },

      // Tool approval
      approveToolCall: async ({ callId }) => {
        const result = await approveToolCallFn(callId);
        return { result };
      },
      denyToolCall: ({ callId }) => {
        denyToolCallFn(callId);
        return { success: true };
      },
      getPendingToolCalls: (_params) => {
        return getPendingToolCallsFn();
      },

      // Peers
      listPeers: () => {
        return stmts.listPeers.all() as Peer[];
      },
      addPeer: ({ npub, username }) => {
        if (!npub.startsWith("npub1")) {
          return { error: "Invalid npub. Must start with 'npub1'" };
        }
        try {
          stmts.addPeer.run(npub, username ?? null);
          return { success: true };
        } catch (err: any) {
          return { error: err.message || "Failed to add peer" };
        }
      },
      removePeer: ({ npub }) => {
        stmts.removePeer.run(npub);
        return { success: true };
      },
      followPeer: ({ npub }) => {
        stmts.followPeer.run(npub);
        return { success: true };
      },
      unfollowPeer: ({ npub }) => {
        stmts.unfollowPeer.run(npub);
        return { success: true };
      },

      // Settings
      hasApiKey: () => {
        const row = stmts.getConfig.get("api_key") as { value: string } | null;
        return !!row?.value;
      },

      // Nostr identity
      generateKeypair: () => {
        const identity = genKeypair();
        stmts.setConfig.run("nsec", identity.nsec);
        stmts.setConfig.run("npub", identity.npub);
        return { npub: identity.npub, nsec: identity.nsec };
      },
      importKeypair: ({ nsec }) => {
        try {
          const identity = identityFromNsec(nsec);
          stmts.setConfig.run("nsec", identity.nsec);
          stmts.setConfig.run("npub", identity.npub);
          return { npub: identity.npub };
        } catch (err: any) {
          return { error: err.message || "Invalid nsec" };
        }
      },
      getIdentity: () => {
        const npubRow = stmts.getConfig.get("npub") as { value: string } | null;
        const nsecRow = stmts.getConfig.get("nsec") as { value: string } | null;
        if (!npubRow?.value) return null;
        return { npub: npubRow.value, hasKey: !!nsecRow?.value };
      },
      exportNsec: () => {
        const row = stmts.getConfig.get("nsec") as { value: string } | null;
        return row?.value ?? null;
      },

      // Nostr relay
      connectRelays: async () => {
        const mgr = getRelayManager();
        await mgr.connect();

        // Subscribe to DMs if we have an identity
        const npubRow = stmts.getConfig.get("npub") as { value: string } | null;
        if (npubRow?.value) {
          const pubkeyHex = npubToHex(npubRow.value);
          const lastSync = stmts.getConfig.get("last_nostr_sync") as { value: string } | null;
          const since = lastSync ? parseInt(lastSync.value) : undefined;
          mgr.subscribeToDMs(pubkeyHex, since);
          // Update last sync time
          stmts.setConfig.run("last_nostr_sync", String(Math.floor(Date.now() / 1000)));
        }

        return { connected: mgr.connectedCount, total: mgr.configuredRelays.length };
      },
      disconnectRelays: () => {
        if (relayManager) {
          relayManager.disconnect();
          relayManager = null;
        }
        return { success: true };
      },
      getRelayStatus: () => {
        if (!relayManager) return { connected: 0, relays: [] };
        return { connected: relayManager.connectedCount, relays: relayManager.configuredRelays };
      },

      // Updates
      checkForUpdate: async () => {
        try {
          const info = await Updater.checkForUpdate();
          const versionInfo = await Updater.localInfo.version();
          return {
            updateAvailable: info.updateAvailable,
            currentVersion: versionInfo,
            latestVersion: info.updateAvailable ? "newer version available" : undefined,
          };
        } catch {
          return { updateAvailable: false, currentVersion: "dev", latestVersion: undefined };
        }
      },
      downloadUpdate: async () => {
        try {
          await Updater.downloadUpdate();
          return { success: true };
        } catch (err: any) {
          return { success: false, error: err.message || "Download failed" };
        }
      },
      applyUpdate: async () => {
        try {
          await Updater.applyUpdate();
          return { success: true };
        } catch (err: any) {
          return { success: false, error: err.message || "Update failed" };
        }
      },
      getAppVersion: async () => {
        try {
          return await Updater.localInfo.version();
        } catch {
          return "0.1.0-dev";
        }
      },

      // Nostr DMs
      sendDM: async ({ recipientNpub, content, conversationId }) => {
        const nsecRow = stmts.getConfig.get("nsec") as { value: string } | null;
        if (!nsecRow?.value) return { error: "No Nostr identity. Generate a keypair first." };

        try {
          const recipientPkHex = npubToHex(recipientNpub);
          const event = createGiftWrap(nsecRow.value, recipientPkHex, {
            type: "chat",
            content,
            conversationId,
            timestamp: Math.floor(Date.now() / 1000),
          });

          const mgr = getRelayManager();
          if (mgr.connectedCount === 0) await mgr.connect();
          const published = await mgr.publish(event);
          return { success: true, publishedTo: published.length };
        } catch (err: any) {
          return { error: err.message || "Failed to send DM" };
        }
      },
    },
    messages: {},
  },
});

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    } catch {
      console.log("Vite dev server not running. Run 'bun run dev:hmr' for HMR.");
    }
  }
  return "views://mainview/index.html";
}

const url = await getMainViewUrl();

new BrowserWindow({
  title: "Ghost",
  url,
  rpc,
  frame: {
    width: 1000,
    height: 700,
    x: 200,
    y: 100,
  },
});

console.log(`Ghost started! Database: ${dbPath}`);
