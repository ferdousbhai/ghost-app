import { BrowserView, BrowserWindow, Updater, Utils } from "electrobun/bun";
import { mkdirSync, existsSync, writeFileSync, readFileSync, readSync, openSync, closeSync, readdirSync, unlinkSync } from "fs";
import { join, relative, extname } from "path";
import Database from "bun:sqlite";
import {
  query,
  listSessions,
  getSessionInfo,
  getSessionMessages,
  renameSession,
  type Options as AgentOptions,
} from "@anthropic-ai/claude-agent-sdk";
import type { GhostRPC, Conversation, Document, Peer } from "../shared/rpc";
import { buildSystemPrompt } from "./prompt";
import { RelayManager } from "./relay";
import { generateKeypair as genKeypair, identityFromNsec, npubToHex, hexToNpub } from "./nostr";
import { createGiftWrap, unwrapGiftWrap, type GiftWrapMessage } from "./encryption";

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
// Data directories
// ---------------------------------------------------------------------------
const ghostDir = Utils.paths.userData;
const docsDir = join(ghostDir, "docs");
const characterPath = join(ghostDir, "character.md");
const memoriesPath = join(ghostDir, "memories.json");

if (!existsSync(docsDir)) mkdirSync(docsDir, { recursive: true });

// Initialize default files if missing
if (!existsSync(characterPath)) writeFileSync(characterPath, DEFAULT_CHARACTER_TEMPLATE, "utf-8");
if (!existsSync(memoriesPath)) writeFileSync(memoriesPath, "{}", "utf-8");

// Agent SDK sessions stored alongside ghost data
const claudeConfigDir = join(ghostDir, ".claude");

// Character content cache — invalidated on save
let cachedCharacter: string | null = null;
function getCharacterContent(): string | null {
  if (cachedCharacter !== null) return cachedCharacter;
  try {
    cachedCharacter = readFileSync(characterPath, "utf-8");
  } catch {
    cachedCharacter = null;
  }
  return cachedCharacter;
}

// ---------------------------------------------------------------------------
// SQLite — config + peers only (UI metadata, not agent-accessible)
// ---------------------------------------------------------------------------
const dbPath = join(ghostDir, "ghost.db");
const db = new Database(dbPath, { create: true });
db.exec("PRAGMA journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
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
`);

// Migration: add session_id column to peers (for DM conversations)
try { db.exec("ALTER TABLE peers ADD COLUMN session_id TEXT"); } catch {}

const stmts = {
  getConfig: db.prepare("SELECT value FROM config WHERE key = ?"),
  setConfig: db.prepare(
    "INSERT INTO config (key, value, updated_at) VALUES (?, ?, unixepoch()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()"
  ),
  listPeers: db.prepare("SELECT * FROM peers ORDER BY last_message_at DESC NULLS LAST, created_at DESC"),
  addPeer: db.prepare("INSERT INTO peers (npub, username) VALUES (?, ?) ON CONFLICT(npub) DO UPDATE SET username = COALESCE(excluded.username, peers.username)"),
  removePeer: db.prepare("DELETE FROM peers WHERE npub = ?"),
  followPeer: db.prepare("UPDATE peers SET is_following = 1 WHERE npub = ?"),
  unfollowPeer: db.prepare("UPDATE peers SET is_following = 0 WHERE npub = ?"),
  getPeer: db.prepare("SELECT * FROM peers WHERE npub = ?"),
  setPeerSessionId: db.prepare("UPDATE peers SET session_id = ? WHERE npub = ?"),
  listPeerSessions: db.prepare("SELECT session_id, npub, username FROM peers WHERE session_id IS NOT NULL"),
  updateLastMessageAt: db.prepare("UPDATE peers SET last_message_at = unixepoch() WHERE npub = ?"),
};

// ---------------------------------------------------------------------------
// File-based helpers
// ---------------------------------------------------------------------------
// In-memory cache — avoids re-reading the file on every operation
let memoriesCache: Record<string, string> | null = null;

function readMemories(): Record<string, string> {
  if (memoriesCache !== null) return memoriesCache;
  try {
    memoriesCache = JSON.parse(readFileSync(memoriesPath, "utf-8"));
  } catch {
    memoriesCache = {};
  }
  return memoriesCache!;
}

function writeMemories(mem: Record<string, string>) {
  memoriesCache = mem;
  writeFileSync(memoriesPath, JSON.stringify(mem, null, 2), "utf-8");
}

/** Scan docs directory for supported files. */
const SUPPORTED_EXTENSIONS = new Set([
  ".md", ".txt", ".json", ".ts", ".js", ".py", ".sh", ".yaml", ".yml", ".toml", ".csv",
]);

function scanDocs(): Document[] {
  const docs: Document[] = [];
  function walk(dir: string) {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
          const relPath = relative(docsDir, fullPath);
          let title: string | null = entry.name.replace(/\.[^.]+$/, "");
          try {
            // Read only first 512 bytes — enough to find a # heading
            const fd = openSync(fullPath, "r");
            const buf = Buffer.alloc(512);
            const bytesRead = readSync(fd, buf, 0, 512, 0);
            closeSync(fd);
            const head = buf.slice(0, bytesRead).toString("utf-8");
            const match = head.match(/^#\s+(.+)$/m);
            if (match) title = match[1].trim();
          } catch {}
          docs.push({ path: relPath, title });
        }
      }
    } catch {}
  }
  walk(docsDir);
  return docs.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
}

// ---------------------------------------------------------------------------
// Agent SDK helpers
// ---------------------------------------------------------------------------

/** Extract text content from an Agent SDK message. */
function extractTextFromMessage(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const msg = message as Record<string, unknown>;

  // Anthropic MessageParam format: { role, content: string | ContentBlock[] }
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return (msg.content as Array<Record<string, unknown>>)
      .filter((block) => block.type === "text")
      .map((block) => block.text as string)
      .join("");
  }
  return "";
}

/** Map Agent SDK session info to our Conversation type. */
function sessionToConversation(session: {
  sessionId: string;
  summary: string;
  lastModified: number;
}): Conversation {
  return {
    id: session.sessionId,
    title: session.summary || null,
    peer_npub: null,
    message_count: 0,
    updated_at: Math.floor(session.lastModified / 1000),
  };
}

// Active query abort controllers
const activeQueries = new Map<string, AbortController>();
// Known session IDs — avoids listSessions() on every sendMessage
const knownSessionIds = new Set<string>();

// ---------------------------------------------------------------------------
// Shared agent query helper
// ---------------------------------------------------------------------------

/** Run an Agent SDK query and stream tokens. Returns the final assistant text. */
async function runAgentQuery(
  prompt: string,
  options: AgentOptions,
  onToken: (token: string) => void,
  onDone: () => void,
): Promise<string> {
  let responseText = "";
  let streamedPartials = false;

  for await (const msg of query({ prompt, options })) {
    if (msg.type === "system" && "subtype" in msg && msg.subtype === "init") {
      knownSessionIds.add(msg.session_id);
    }

    if (msg.type === "stream_event" && "event" in msg) {
      const event = msg.event as Record<string, unknown>;
      if (event.type === "content_block_delta") {
        const delta = event.delta as Record<string, unknown>;
        if (delta.type === "text_delta" && typeof delta.text === "string") {
          streamedPartials = true;
          onToken(delta.text);
        }
      }
    }

    if (msg.type === "assistant") {
      const text = extractTextFromMessage(msg.message);
      if (text) {
        if (!streamedPartials) onToken(text);
        responseText = text;
      }
      streamedPartials = false;
    }
  }

  onDone();
  return responseText;
}

/** Build common Agent SDK options for a session. */
function buildAgentOptions(opts: {
  apiKey: string;
  systemPrompt: string;
  sessionId: string;
  tools?: string[];
  permissionMode?: string;
  maxTurns?: number;
  abortController?: AbortController;
}): AgentOptions {
  const isExisting = knownSessionIds.has(opts.sessionId);
  return {
    model: "claude-sonnet-4-6-20250514",
    cwd: ghostDir,
    systemPrompt: opts.systemPrompt,
    tools: opts.tools ?? ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    allowedTools: opts.tools ?? ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    permissionMode: (opts.permissionMode ?? "acceptEdits") as "acceptEdits" | "dontAsk",
    maxTurns: opts.maxTurns ?? 10,
    abortController: opts.abortController,
    includePartialMessages: true,
    executable: "bun",
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: opts.apiKey,
      CLAUDE_CONFIG_DIR: claudeConfigDir,
    },
    ...(isExisting ? { resume: opts.sessionId } : { sessionId: opts.sessionId }),
  };
}

// ---------------------------------------------------------------------------
// Incoming DM handler
// ---------------------------------------------------------------------------

// Dedup: relays often deliver the same event multiple times
const seenEventIds = new Set<string>();
const MAX_SEEN_EVENTS = 1000;

const dmQueue = new Map<string, Promise<void>>();
let activeDmCount = 0;
const MAX_CONCURRENT_DMS = 3;

// rpc is initialized after this block — late-bound via rpcRef
let rpcRef: { send: { streamToken: (d: { conversationId: string; token: string }) => void; streamDone: (d: { conversationId: string }) => void; dmReceived: (d: { conversationId: string; peerNpub: string; peerName: string | null }) => void } } | null = null;

async function handleIncomingDM(
  senderPubkeyHex: string,
  message: GiftWrapMessage,
  nsec: string,
): Promise<void> {
  const senderNpub = hexToNpub(senderPubkeyHex);

  stmts.addPeer.run(senderNpub, null);

  const peer = stmts.getPeer.get(senderNpub) as Peer & { session_id?: string; is_following: number } | null;
  let sessionId = peer?.session_id;
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    stmts.setPeerSessionId.run(sessionId, senderNpub);
  }

  rpcRef?.send.dmReceived({
    conversationId: sessionId,
    peerNpub: senderNpub,
    peerName: peer?.username ?? null,
  });

  // Auto-reply only for followed peers (prevents API credit abuse)
  if (!peer?.is_following) {
    console.log(`DM from ${senderNpub} (not followed) — stored but no auto-reply`);
    return;
  }

  stmts.updateLastMessageAt.run(senderNpub);

  const apiKeyRow = stmts.getConfig.get("api_key") as { value: string } | null;
  if (!apiKeyRow?.value) return;

  if (activeDmCount >= MAX_CONCURRENT_DMS) {
    console.log(`DM from ${senderNpub} — skipped (${MAX_CONCURRENT_DMS} concurrent DM sessions active)`);
    return;
  }

  activeDmCount++;
  try {
    const usernameRow = stmts.getConfig.get("username") as { value: string } | null;
    const systemPrompt = buildSystemPrompt({
      username: usernameRow?.value ?? null,
      character: getCharacterContent(),
      ghostDir,
      peerContext: { peerName: peer?.username ?? null, peerNpub: senderNpub },
    });

    const options = buildAgentOptions({
      apiKey: apiKeyRow.value,
      systemPrompt,
      sessionId,
      tools: [],
      permissionMode: "dontAsk",
      maxTurns: 3,
    });

    const responseText = await runAgentQuery(
      message.content,
      options,
      (token) => rpcRef?.send.streamToken({ conversationId: sessionId!, token }),
      () => rpcRef?.send.streamDone({ conversationId: sessionId! }),
    );

    if (responseText.trim()) {
      const event = createGiftWrap(nsec, senderPubkeyHex, {
        type: "chat",
        content: responseText,
        conversationId: sessionId!,
        timestamp: Math.floor(Date.now() / 1000),
      });
      const mgr = getRelayManager();
      if (mgr.connectedCount > 0) {
        await mgr.publish(event);
      }
    }
  } finally {
    activeDmCount--;
  }
}

// ---------------------------------------------------------------------------
// Relay manager (initialized lazily on first connect)
// ---------------------------------------------------------------------------
let relayManager: RelayManager | null = null;

function getRelayManager(): RelayManager {
  if (!relayManager) {
    relayManager = new RelayManager(undefined, (event, _relay) => {
      // Dedup: skip events we've already processed
      if (seenEventIds.has(event.id)) return;
      seenEventIds.add(event.id);
      if (seenEventIds.size > MAX_SEEN_EVENTS) {
        // Drop oldest 200 entries (Set iterates in insertion order)
        const iter = seenEventIds.values();
        for (let i = 0; i < 200; i++) {
          const { value, done } = iter.next();
          if (done) break;
          seenEventIds.delete(value);
        }
      }

      const nsecRow = stmts.getConfig.get("nsec") as { value: string } | null;
      if (!nsecRow?.value) return;

      const unwrapped = unwrapGiftWrap(nsecRow.value, event);
      if (!unwrapped) return;

      const { senderPubkey, message } = unwrapped;
      const npub = hexToNpub(senderPubkey);

      // Serialize DMs from the same peer
      const prev = dmQueue.get(npub) ?? Promise.resolve();
      const next = prev.then(() =>
        handleIncomingDM(senderPubkey, message, nsecRow.value)
          .catch((err) => console.error(`DM handler error for ${npub}:`, err))
      );
      dmQueue.set(npub, next);
      next.then(() => { if (dmQueue.get(npub) === next) dmQueue.delete(npub); });
    });
  }
  return relayManager;
}

// ---------------------------------------------------------------------------
// RPC handlers
// ---------------------------------------------------------------------------
const rpc = BrowserView.defineRPC<GhostRPC>({
  maxRequestTime: 120000,
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

      // ===================================================================
      // Conversations — backed by Agent SDK sessions
      // ===================================================================
      listConversations: async () => {
        try {
          const sessions = await listSessions({ dir: ghostDir });
          for (const s of sessions) knownSessionIds.add(s.sessionId);

          // Enrich with peer data for DM conversations
          const peerSessions = stmts.listPeerSessions.all() as Array<{
            session_id: string; npub: string; username: string | null;
          }>;
          const peerMap = new Map(peerSessions.map((p) => [p.session_id, p]));

          return sessions.map((s) => {
            const peer = peerMap.get(s.sessionId);
            return {
              id: s.sessionId,
              title: peer
                ? (peer.username || `DM: ${peer.npub.slice(0, 16)}...`)
                : (s.summary || null),
              peer_npub: peer?.npub ?? null,
              message_count: 0,
              updated_at: Math.floor(s.lastModified / 1000),
            };
          });
        } catch {
          return [];
        }
      },

      getConversation: async ({ id }) => {
        try {
          const session = await getSessionInfo(id, { dir: ghostDir });
          return session ? sessionToConversation(session) : null;
        } catch {
          return null;
        }
      },

      createConversation: () => {
        // Agent SDK creates sessions on first query() call.
        // Return a placeholder — the real session ID comes from the init message.
        const id = crypto.randomUUID();
        return {
          id,
          title: null,
          peer_npub: null,
          message_count: 0,
          updated_at: Math.floor(Date.now() / 1000),
        };
      },

      deleteConversation: async ({ id }) => {
        try {
          // SDK doesn't export deleteSession yet — manually remove the JSONL file
          // Path encoding mirrors SDK internals; may break on SDK upgrades
          const encodedDir = ghostDir.replace(/[^a-zA-Z0-9]/g, "-");
          const sessionFile = join(claudeConfigDir, "projects", encodedDir, `${id}.jsonl`);
          unlinkSync(sessionFile);
        } catch (err: any) {
          if (err?.code !== "ENOENT") {
            console.warn(`Failed to delete session ${id}:`, err.message);
          }
        }
        knownSessionIds.delete(id);
        return { success: true };
      },

      renameConversation: async ({ id, title }) => {
        try {
          await renameSession(id, title, { dir: ghostDir });
        } catch {}
        return { success: true };
      },

      // ===================================================================
      // Messages — read from Agent SDK session files
      // ===================================================================
      getMessages: async ({ conversationId }) => {
        try {
          const messages = await getSessionMessages(conversationId, { dir: ghostDir });
          return messages
            .filter((m) => m.type === "user" || m.type === "assistant")
            .map((m) => ({
              id: m.uuid,
              conversation_id: conversationId,
              role: m.type as "user" | "assistant",
              content: extractTextFromMessage(m.message),
            }));
        } catch {
          return [];
        }
      },

      // ===================================================================
      // Chat — Agent SDK query() replaces streamText + all tools
      // ===================================================================
      sendMessage: ({ conversationId, content }) => {
        const apiKeyRow = stmts.getConfig.get("api_key") as { value: string } | null;
        if (!apiKeyRow?.value) {
          rpc.send.streamError({
            conversationId,
            error: "Please add your Anthropic API key in Settings.",
          });
          return { success: false };
        }

        const usernameRow = stmts.getConfig.get("username") as { value: string } | null;
        const systemPrompt = buildSystemPrompt({
          username: usernameRow?.value ?? null,
          character: getCharacterContent(),
          ghostDir,
        });

        (async () => {
          try {
            const abortController = new AbortController();
            activeQueries.set(conversationId, abortController);

            const options = buildAgentOptions({
              apiKey: apiKeyRow.value,
              systemPrompt,
              sessionId: conversationId,
              abortController,
            });

            await runAgentQuery(
              content,
              options,
              (token) => rpc.send.streamToken({ conversationId, token }),
              () => rpc.send.streamDone({ conversationId }),
            );
          } catch (err: any) {
            if (err.name !== "AbortError") {
              rpc.send.streamError({
                conversationId,
                error: err.message || "Failed to generate response",
              });
            }
          } finally {
            activeQueries.delete(conversationId);
          }
        })().catch((e) => console.error("Unhandled streaming error:", e));

        return { success: true };
      },

      // Stop streaming
      stopStreaming: ({ conversationId }) => {
        const controller = activeQueries.get(conversationId);
        if (controller) {
          controller.abort();
          activeQueries.delete(conversationId);
        }
        return { success: true };
      },

      // ===================================================================
      // Character — file-based
      // ===================================================================
      getCharacter: () => {
        return getCharacterContent() ?? DEFAULT_CHARACTER_TEMPLATE;
      },
      saveCharacter: ({ content }) => {
        writeFileSync(characterPath, content, "utf-8");
        cachedCharacter = content;
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

      // ===================================================================
      // Memories — backed by memories.json
      // ===================================================================
      listMemories: () => {
        const mem = readMemories();
        return Object.entries(mem).map(([key, value]) => ({ key, value }));
      },
      setMemory: ({ key, value }) => {
        const mem = readMemories();
        mem[key] = value;
        writeMemories(mem);
        return { success: true };
      },
      deleteMemory: ({ key }) => {
        const mem = readMemories();
        delete mem[key];
        writeMemories(mem);
        return { success: true };
      },

      // ===================================================================
      // Documents — filesystem listing
      // ===================================================================
      listDocuments: () => scanDocs(),
      readDocument: ({ path: docPath }) => {
        try {
          const fullPath = join(docsDir, docPath);
          // Security: ensure path doesn't escape docs directory
          if (!fullPath.startsWith(docsDir)) return null;
          return readFileSync(fullPath, "utf-8");
        } catch {
          return null;
        }
      },
      getDocsDir: () => docsDir,

      // ===================================================================
      // Peers (unchanged — SQLite)
      // ===================================================================
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

      // ===================================================================
      // Settings
      // ===================================================================
      hasApiKey: () => {
        const row = stmts.getConfig.get("api_key") as { value: string } | null;
        return !!row?.value;
      },

      // ===================================================================
      // Nostr identity (unchanged)
      // ===================================================================
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

      // ===================================================================
      // Nostr relay (unchanged)
      // ===================================================================
      connectRelays: async () => {
        const mgr = getRelayManager();
        await mgr.connect();

        const npubRow = stmts.getConfig.get("npub") as { value: string } | null;
        if (npubRow?.value) {
          const pubkeyHex = npubToHex(npubRow.value);
          const lastSync = stmts.getConfig.get("last_nostr_sync") as { value: string } | null;
          const since = lastSync ? parseInt(lastSync.value) : undefined;
          mgr.subscribeToDMs(pubkeyHex, since);
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

      // ===================================================================
      // Updates (unchanged)
      // ===================================================================
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

      // ===================================================================
      // Nostr DMs (unchanged)
      // ===================================================================
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

// Set rpcRef so the DM handler can push events to the webview
rpcRef = rpc;

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

console.log(`Ghost started! Data: ${ghostDir}`);
