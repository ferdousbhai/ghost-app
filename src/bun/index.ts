import { BrowserView, BrowserWindow, Updater, Utils } from "electrobun/bun";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import Database from "bun:sqlite";
import { generateText, tool } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { GhostRPC, Conversation, ChatMessage, Memory, Document, Peer } from "../shared/rpc";
import { getDocsDir, indexDocuments, readDocument, watchDocs } from "./documents";
import { readFile as readFileFromDisk, writeFile as writeFileToDisk, editFile as editFileOnDisk, executeBash, approveToolCall as approveToolCallFn, denyToolCall as denyToolCallFn, getPendingToolCalls as getPendingToolCallsFn } from "./tools";
import { generateKeypair as genKeypair, identityFromNsec } from "./nostr";
import { nip19 } from "nostr-tools";
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
const initialCount = indexDocuments(db, docsDir);
console.log(`Indexed ${initialCount} documents from ${docsDir}`);
watchDocs(db, docsDir);

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
        // Append * for prefix matching in FTS5
        const ftsQuery = query.trim().replace(/"/g, '""');
        return stmts.searchConversations.all(`"${ftsQuery}"*`) as Conversation[];
      },

      // Messages
      getMessages: ({ conversationId }) => {
        return stmts.getMessages.all(conversationId) as ChatMessage[];
      },

      // Chat — AI SDK generateText (issue #4)
      sendMessage: async ({ conversationId, content }) => {
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
          return { messageId: msgId };
        }

        // Load conversation history for context
        const history = stmts.getMessages.all(conversationId) as ChatMessage[];
        const aiMessages = history
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

        // Load character (system prompt)
        const characterRow = stmts.getConfig.get("character") as { value: string } | null;
        const systemPrompt = characterRow?.value || "You are a helpful AI assistant.";

        // Generate response
        try {
          const anthropic = createAnthropic({ apiKey: apiKeyRow.value });
          const { text } = await generateText({
            model: anthropic("claude-sonnet-4-6-20250514"),
            system: systemPrompt,
            messages: aiMessages,
            maxOutputTokens: 4096,
            maxSteps: 5,
            tools: {
              read_file: tool({
                description: "Read the contents of a file at the given path.",
                parameters: z.object({
                  path: z.string().describe("Absolute path to the file to read"),
                }),
                execute: async ({ path }) => {
                  return readFileFromDisk(path);
                },
              }),
              write_file: tool({
                description: "Write content to a file. Creates the file and any parent directories if they don't exist.",
                parameters: z.object({
                  path: z.string().describe("Absolute path to the file to write"),
                  content: z.string().describe("The content to write to the file"),
                }),
                execute: async ({ path, content }) => {
                  return writeFileToDisk(path, content);
                },
              }),
              edit_file: tool({
                description: "Find and replace text in a file. The old_text must match exactly.",
                parameters: z.object({
                  path: z.string().describe("Absolute path to the file to edit"),
                  old_text: z.string().describe("The exact text to find and replace"),
                  new_text: z.string().describe("The text to replace it with"),
                }),
                execute: async ({ path, old_text, new_text }) => {
                  return editFileOnDisk(path, old_text, new_text);
                },
              }),
              bash: tool({
                description: "Execute a bash command on the user's machine. Use for file operations, system info, package management, running scripts, etc.",
                parameters: z.object({
                  command: z.string().describe("The bash command to execute"),
                }),
                execute: async ({ command }) => {
                  return await executeBash(command);
                },
              }),
            },
          });

          const replyId = crypto.randomUUID();
          stmts.insertMessage.run(replyId, conversationId, "assistant", text);
          stmts.updateMessageCount.run(conversationId, conversationId);

          // Auto-title: use first user message as title for untitled conversations
          const conv = stmts.getConversation.get(conversationId) as Conversation | null;
          if (conv && !conv.title) {
            const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
            stmts.renameConversation.run(title, conversationId);
          }
        } catch (err: any) {
          const replyId = crypto.randomUUID();
          const errorMsg = `Error: ${err.message || "Failed to generate response"}`;
          stmts.insertMessage.run(replyId, conversationId, "assistant", errorMsg);
          stmts.updateMessageCount.run(conversationId, conversationId);
        }

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
        const ftsQuery = query.trim().replace(/"/g, '""');
        try {
          return stmts.searchMemories.all(`"${ftsQuery}"*`) as Memory[];
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
        const ftsQuery = query.trim().replace(/"/g, '""');
        try {
          return stmts.searchDocuments.all(`"${ftsQuery}"*`) as Document[];
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
      getPendingToolCalls: ({ conversationId: _conversationId }) => {
        // For now return all pending (later filter by conversation)
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
        const row = stmts.getConfig.get("api_key") as {
          value: string;
        } | null;
        return row?.value ? true : false;
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

      // Nostr relay
      connectRelays: async () => {
        const mgr = getRelayManager();
        await mgr.connect();

        // Subscribe to DMs if we have an identity
        const npubRow = stmts.getConfig.get("npub") as { value: string } | null;
        if (npubRow?.value) {
          const { data: pk } = nip19.decode(npubRow.value);
          const lastSync = stmts.getConfig.get("last_nostr_sync") as { value: string } | null;
          const since = lastSync ? parseInt(lastSync.value) : undefined;
          mgr.subscribeToDMs(pk as string, since);
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

      // Nostr DMs
      sendDM: async ({ recipientNpub, content, conversationId }) => {
        const nsecRow = stmts.getConfig.get("nsec") as { value: string } | null;
        if (!nsecRow?.value) return { error: "No Nostr identity. Generate a keypair first." };

        try {
          const { data: recipientPk } = nip19.decode(recipientNpub);
          const event = createGiftWrap(nsecRow.value, recipientPk as string, {
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
