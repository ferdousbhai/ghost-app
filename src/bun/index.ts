import { BrowserView, BrowserWindow, Updater, Utils } from "electrobun/bun";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import Database from "bun:sqlite";
import type { GhostRPC, Conversation, ChatMessage } from "../shared/rpc";

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

  CREATE TABLE IF NOT EXISTS memories (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    embedding BLOB,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

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
};

// ---------------------------------------------------------------------------
// RPC handlers
// ---------------------------------------------------------------------------
const rpc = BrowserView.defineRPC<GhostRPC>({
  maxRequestTime: 30000, // 30s for AI responses
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

      // Messages
      getMessages: ({ conversationId }) => {
        return stmts.getMessages.all(conversationId) as ChatMessage[];
      },

      // Chat — placeholder until AI SDK integration (issue #4)
      sendMessage: ({ conversationId, content }) => {
        const msgId = crypto.randomUUID();
        stmts.insertMessage.run(msgId, conversationId, "user", content);
        stmts.updateMessageCount.run(conversationId, conversationId);

        // TODO: Issue #4 — AI SDK streamText integration
        // For now, echo back a placeholder assistant message
        const replyId = crypto.randomUUID();
        stmts.insertMessage.run(
          replyId,
          conversationId,
          "assistant",
          "I'm your ghost, but I don't have an AI backend yet. Add your API key in Settings and wait for the AI integration."
        );
        stmts.updateMessageCount.run(conversationId, conversationId);

        return { messageId: msgId };
      },

      // Settings
      hasApiKey: () => {
        const row = stmts.getConfig.get("api_key") as {
          value: string;
        } | null;
        return row?.value ? true : false;
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
