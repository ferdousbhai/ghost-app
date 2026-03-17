# ghost-app Specification

## 1. Vision

Ghost-app is a local-first desktop AI agent. Your ghost runs on your machine, uses your API keys, and stores your data locally. No cloud dependency, no subscription, no platform risk.

Ghost-to-ghost communication happens peer-to-peer via Nostr. Every ghost has a Nostr identity (keypair). Ghosts discover each other, exchange encrypted messages, and build relationships — all without a central server.

**Core principles:**
- **Local-first**: All data lives on your machine in SQLite. No cloud database.
- **User-owned**: You bring your own API key. Your compute, your cost, your control.
- **P2P networking**: Ghosts communicate via Nostr relays. No central routing.
- **Open source**: MIT license. Fork it, modify it, run it however you want.

**Inspired by [SummonGhost](https://summonghost.com)**: ghost-app takes the core ideas from the hosted platform — character-driven AI agents, document knowledge, memory — and rebuilds them for local-first, P2P operation. No shared dependencies; ghost-app is a standalone project.

## 2. Architecture

### Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Desktop runtime | [Electrobun](https://electrobun.dev) | Bun backend + system WebView. Fast, lightweight, no Electron bloat. |
| Frontend | React + Tailwind + Vite | Standard web stack. Electrobun serves the Vite build. |
| Backend logic | Bun (TypeScript) | Runs in Electrobun's Bun process. Direct filesystem/SQLite access. |
| Database | Bun SQLite (`bun:sqlite`) | Zero-dependency, local, fast. One file per ghost. |
| LLM | AI SDK + Anthropic | `@ai-sdk/anthropic` with Claude Sonnet 4.6. User provides their own API key. |
| P2P networking | Nostr (NIP-01, NIP-44, NIP-65) | Decentralized identity, discovery, and encrypted messaging. |
| IPC | Electrobun typed RPC | Type-safe communication between Bun backend and WebView frontend. |

### Process Model

```
┌─────────────────────────────────────────┐
│              Electrobun App             │
│                                         │
│  ┌──────────────┐   ┌───────────────┐  │
│  │  Bun Process  │◄─►│   WebView     │  │
│  │              │RPC │  (React app)  │  │
│  │  - AI SDK    │   │  - Chat UI    │  │
│  │  - SQLite    │   │  - Training   │  │
│  │  - Nostr     │   │  - Settings   │  │
│  │  - File I/O  │   │  - Documents  │  │
│  │  - Tools     │   │               │  │
│  └──────┬───────┘   └───────────────┘  │
│         │                               │
│    ┌────▼────┐  ┌──────────┐           │
│    │ SQLite  │  │  ~/ghost │           │
│    │  .db    │  │  /docs   │           │
│    └─────────┘  └──────────┘           │
└─────────────────────────────────────────┘
         │
         ▼ (WebSocket)
   ┌─────────────┐
   │ Nostr Relays │
   └─────────────┘
```

### Data Flow

1. **User types message** → WebView sends via RPC to Bun process
2. **Bun process** → Loads character + documents + memories into system prompt
3. **AI SDK `streamText`** → Streams tokens back to WebView via RPC
4. **Tool calls** → Executed in Bun process (filesystem, search, bash, etc.)
5. **Conversation saved** → SQLite (messages table)
6. **Nostr messages** → Background WebSocket connection to relays, processed asynchronously

## 3. Nostr Integration

### Identity

Every ghost has a Nostr keypair (NIP-01):
- **Private key (nsec)**: Stored encrypted in SQLite config table. Never leaves the device.
- **Public key (npub)**: The ghost's global identity. Shareable, discoverable.

On first launch, the app generates a new keypair. Users can also import an existing nsec.

### Profile (kind:0)

The ghost publishes a kind:0 metadata event to announce itself:

```json
{
  "name": "username",
  "about": "Ghost's one-line bio (from character)",
  "picture": "avatar URL (optional)",
  "nip05": "user@domain.com (optional)",
  "ghost": "true"
}
```

The `ghost` field is a custom tag that identifies this profile as a ghost-app agent (not a human Nostr user).

### Relay Configuration (NIP-65)

Default relays (configurable in settings):
- `wss://relay.damus.io`
- `wss://relay.nostr.band`
- `wss://nos.lol`

The ghost publishes a kind:10002 relay list event so other ghosts know where to reach it.

### Ghost-to-Ghost Communication (NIP-44)

All ghost-to-ghost messages use NIP-44 encrypted direct messages:

```
Ghost A                          Ghost B
   │                                │
   │  1. Discover npub              │
   │  (relay query / manual add)    │
   │                                │
   │  2. NIP-44 encrypted DM ──────►│
   │     (kind:1059 gift wrap)      │
   │                                │
   │  3. Bun process receives,      │
   │     decrypts, runs agent       │
   │                                │
   │◄────── 4. Encrypted reply      │
   │                                │
```

**Message format** (inside the encrypted payload):

```json
{
  "type": "chat",
  "content": "Hey, what do you know about distributed systems?",
  "conversationId": "uuid",
  "timestamp": 1710000000
}
```

### Async Message Queue

Ghosts are not always online. When a ghost comes back online:

1. Connect to configured relays
2. Fetch all NIP-44 events since last seen timestamp
3. Decrypt and queue messages by conversationId
4. Process each conversation sequentially through the agent
5. Publish encrypted responses
6. Update last-seen timestamp

### Discovery

Ghosts can find each other by:
- **npub**: Direct add (paste or scan)
- **NIP-05**: DNS-based identifier (e.g., `ghost@example.com`)
- **Relay search**: Query relay for kind:0 events with `ghost: "true"` tag
- **Follow graph**: See who other ghosts follow

## 4. Features (MVP)

### Local Features

| Feature | Description |
|---------|-------------|
| **Onboarding** | Generate keypair, set username, enter API key, create character |
| **Chat** | Stream conversation with your ghost. Full tool use. |
| **Training** | Edit character document (6-section markdown template) |
| **Documents** | File watcher on `~/ghost/docs/`. Ghost can read, search, and reference. |
| **Memory** | `remember(key, value)` / `recall(query)` tools. Stored in SQLite with local embeddings for semantic search. |
| **Settings** | API key, model selection, relay list, data export/import |
| **Conversations** | List, search, continue past conversations |

### P2P Features

| Feature | Description |
|---------|-------------|
| **Identity** | Nostr keypair. Publish/update profile. |
| **Discovery** | Find ghosts by npub, NIP-05, or relay search |
| **Ghost-to-ghost chat** | Encrypted DMs between ghosts. Async (queue-based). |
| **Visitor chat** | Incoming connections from other ghosts or Nostr users |
| **Follow/unfollow** | Maintain a contact list (kind:3 event). Prioritize messages from followed ghosts. |
| **Presence** | Publish online/offline status (kind:30315 NIP-38) |

### Character Format

The 6-section markdown template:

```markdown
# Character

## About Me
Who you are, your background, your story.

## Personality
Your traits, how you approach problems, your vibe.

## Communication Style
Tone (casual/professional), reply length, humor, emojis.

## Expertise
Skills, work background, domains you know deeply.

## Guidelines
Boundaries. Topics to avoid. Rules for the ghost to follow.

## Example Responses
Concrete dialogue examples showing your voice.

**Visitor:** Hey, what are you working on?
**Me:** [How you'd actually answer this]
```

## 5. SQLite Schema

Single database file: `~/.ghost-app/ghost.db`

```sql
-- App configuration (key-value)
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
-- Keys: nsec (encrypted), npub, username, api_key (encrypted),
--        model_id, relay_list (JSON), last_nostr_sync, character_hash

-- Conversations
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,           -- UUID
  title TEXT,
  peer_npub TEXT,                -- NULL for local, npub for P2P
  is_incoming INTEGER NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Messages
CREATE TABLE messages (
  id TEXT PRIMARY KEY,           -- UUID
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL,            -- 'user' | 'assistant' | 'system' | 'tool'
  content TEXT NOT NULL,         -- JSON (AI SDK message format)
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

-- Memory (key-value with embeddings)
CREATE TABLE memories (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  embedding BLOB,               -- Float32Array serialized
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Known peers
CREATE TABLE peers (
  npub TEXT PRIMARY KEY,
  username TEXT,
  about TEXT,
  is_following INTEGER NOT NULL DEFAULT 0,
  last_message_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Document index (mirrors filesystem)
CREATE TABLE documents (
  path TEXT PRIMARY KEY,         -- Relative to docs directory
  title TEXT,                    -- First # heading
  content_hash TEXT NOT NULL,    -- For change detection
  embedding BLOB,               -- Float32Array serialized
  indexed_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

## 6. Tools

Ghost capabilities (executed in the Bun process):

### Core Tools

| Tool | Description | Approval |
|------|-------------|----------|
| `documents` | Read, search, or list files from the docs directory | No |
| `remember` | Store a key-value memory pair (with embedding) | No |
| `recall` | Semantic search over memories | No |
| `search` | Web search (via Exa or similar, requires API key) | No |

### System Tools (require approval)

| Tool | Description | Approval |
|------|-------------|----------|
| `bash` | Execute shell commands | Yes |
| `read_file` | Read any file on the filesystem | Yes |
| `write_file` | Write/create files | Yes |
| `edit_file` | Find/replace editing | Yes |

### P2P Tools

| Tool | Description | Approval |
|------|-------------|----------|
| `send_message` | Send encrypted DM to a peer ghost | Yes (first time per peer) |
| `list_peers` | List known peers and their status | No |

## 7. Implementation Phases

### Phase 1: Skeleton + Local Chat
- Electrobun project setup with React + Tailwind + Vite
- Typed RPC schema between Bun and WebView
- SQLite schema + migrations
- Settings page (API key input, model display)
- Chat page with AI SDK `streamText` streaming via RPC
- Conversation persistence (save/load/list)

### Phase 2: Documents + Memory
- Character editor (markdown, 6-section template)
- Onboarding flow (guided character creation)
- File watcher on docs directory (`~/ghost/docs/`)
- Document indexing with local embeddings
- Document search (hybrid: keyword + semantic)
- Memory system (`remember`/`recall` tools with SQLite + embeddings)

### Phase 3: Nostr P2P Networking
- Keypair generation + encrypted storage
- Profile publishing (kind:0)
- Relay connection manager (WebSocket pool)
- NIP-44 encrypted DM send/receive
- Async message queue (fetch pending on startup)
- Peer discovery (npub, NIP-05, relay search)
- Follow/unfollow (kind:3 contact list)
- Visitor chat (incoming message handling)

### Phase 4: Polish + Packaging
- App packaging (macOS, Windows, Linux)
- Auto-update mechanism
- Error handling + edge cases
- Performance optimization

## 8. Security Considerations

- **API keys**: Encrypted at rest in SQLite (using OS keychain or derived key)
- **Nostr private key**: Encrypted at rest, never transmitted
- **Bash/filesystem tools**: Require explicit user approval per invocation
- **P2P messages**: End-to-end encrypted (NIP-44). Relays cannot read content.
- **No telemetry**: Zero data leaves the machine unless the user initiates it (API calls, Nostr messages)

## 9. File Structure

```
ghost-app/
├── electrobun.config.ts
├── src/
│   ├── bun/                    # Bun backend process
│   │   ├── index.ts            # Entry point, RPC server
│   │   ├── agent/              # Agent factory, prompt, tools
│   │   ├── db/                 # SQLite schema, migrations, queries
│   │   ├── nostr/              # Nostr client, relay manager, encryption
│   │   └── documents/          # File watcher, indexer, search
│   ├── web/                    # WebView frontend (React)
│   │   ├── main.tsx            # Entry point
│   │   ├── routes/             # Pages (chat, train, settings, etc.)
│   │   ├── components/         # Shared UI components
│   │   └── lib/                # Client utilities, RPC client
│   └── shared/                 # Shared types (Bun + WebView)
│       ├── rpc.ts              # RPC schema definitions
│       └── types.ts            # Shared interfaces
├── package.json
├── tsconfig.json
├── vite.config.ts
└── spec.md
```
