# ghost-app

P2P desktop AI agent — your ghost, your machine, your keys.

## What is this?

ghost-app is a local-first desktop AI agent built with [Electrobun](https://electrobun.dev). Your ghost runs entirely on your machine, uses your own API keys, and communicates with other ghosts peer-to-peer via [Nostr](https://nostr.com).

No cloud. No subscription. No platform risk.

## Features

- **Chat** — Conversations with your ghost powered by Claude Sonnet 4.6 (AI SDK + Anthropic). Multi-turn with tool use.
- **Character** — 6-section markdown template (About Me, Personality, Communication Style, Expertise, Guidelines, Example Responses) that defines your ghost's personality. Auto-save, section progress tracking.
- **Documents** — File watcher on a local `docs/` folder. Auto-indexes on change (SHA-256 content hashing). FTS5 search. Ghost can read and search your files.
- **Memory** — Key-value store with FTS5 search. Ghost remembers things across conversations. Manual CRUD via the Memories page.
- **Tools** — Ghost can execute bash commands, read/write/edit files on your filesystem. AI SDK tool definitions with multi-step execution (`maxSteps: 5`).
- **Nostr identity** — Each ghost has a Nostr keypair (NIP-01). Auto-generated during onboarding or manually imported.
- **P2P messaging** — NIP-44 encrypted direct messages via Nostr relays (damus, nostr.band, nos.lol). Incoming DMs decrypted and stored automatically.
- **Peers** — Add ghosts by npub, follow/unfollow, peer management UI.
- **Onboarding** — 4-step first-run wizard: welcome, API key, username, character setup.
- **Auto-update** — Checks GitHub releases for updates via Electrobun's Updater API.

## Architecture

```
┌──────────────────────────────────────────┐
│              Electrobun App              │
│                                          │
│  ┌──────────────┐   ┌────────────────┐  │
│  │  Bun Process  │◄─►│    WebView     │  │
│  │              │RPC │  (React app)   │  │
│  │  - AI SDK    │   │  - Chat        │  │
│  │  - SQLite    │   │  - Train       │  │
│  │  - Nostr     │   │  - Documents   │  │
│  │  - File I/O  │   │  - Memories    │  │
│  │  - Tools     │   │  - Peers       │  │
│  └──────┬───────┘   │  - Settings    │  │
│         │           └────────────────┘  │
│    ┌────▼────┐  ┌──────────┐            │
│    │ SQLite  │  │  ~/docs  │            │
│    │  .db    │  │  (watch) │            │
│    └─────────┘  └──────────┘            │
└──────────────────────────────────────────┘
         │
         ▼ (WebSocket)
   ┌─────────────┐
   │ Nostr Relays │
   └─────────────┘
```

| Layer | Technology |
|-------|-----------|
| Desktop runtime | [Electrobun](https://electrobun.dev) (Bun + system WebView) |
| Frontend | React + Tailwind + Vite |
| Backend | Bun (TypeScript) |
| Database | Bun SQLite (`bun:sqlite`) |
| LLM | [AI SDK](https://ai-sdk.dev) + Anthropic (Claude Sonnet 4.6) |
| P2P | Nostr (NIP-01, NIP-44, NIP-65) via `nostr-tools` |
| IPC | Electrobun typed RPC (AES-256-GCM encrypted WebSocket) |

## Project Structure

```
src/
├── bun/                    # Bun backend
│   ├── index.ts            # Entry point, SQLite schema, RPC handlers
│   ├── documents.ts        # File watcher, indexer, content hashing
│   ├── nostr.ts            # Keypair generation, profile events
│   ├── relay.ts            # Relay connection manager
│   ├── encryption.ts       # NIP-44 encrypt/decrypt, gift wrap
│   └── tools.ts            # Bash execution, filesystem tools
├── mainview/               # WebView frontend (React)
│   ├── App.tsx             # Nav shell, onboarding gate
│   ├── main.tsx            # Entry point
│   ├── rpc.ts              # WebView-side RPC client
│   └── pages/
│       ├── Chat.tsx        # Chat with conversation sidebar
│       ├── Train.tsx       # Character editor with section progress
│       ├── Documents.tsx   # Document browser
│       ├── Memories.tsx    # Memory CRUD
│       ├── Peers.tsx       # Peer management
│       ├── Settings.tsx    # API key, Nostr identity, relays, updates
│       └── Onboarding.tsx  # First-run wizard
└── shared/
    └── rpc.ts              # Typed RPC schema (GhostRPC)
```

## SQLite Schema

Single database file in the app's data directory:

- **config** — Key-value app settings (API key, nsec/npub, username, character, etc.)
- **conversations** — Conversation metadata with FTS5 search
- **messages** — Chat messages linked to conversations
- **memories** — Key-value memory store with FTS5 search
- **peers** — Known Nostr peers with follow status
- **documents** — File index mirroring the docs directory

## Development

```bash
bun install
bun run dev:hmr    # Dev with hot reload (Vite HMR + Electrobun)
bun run start      # Dev without HMR
bun run build      # Production build
```

## Packaging

Builds are automated via GitHub Actions on tagged releases:

```bash
git tag v0.1.0
git push origin v0.1.0
```

This triggers builds for macOS, Linux, and Windows. Artifacts are uploaded to a draft GitHub release.

## License

MIT
