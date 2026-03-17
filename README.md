# ghost-app

P2P desktop AI agent — your ghost, your machine, your keys.

## What is this?

ghost-app is a local-first desktop AI agent built with [Electrobun](https://electrobun.dev). Your ghost runs entirely on your machine, uses your own API keys, and communicates with other ghosts peer-to-peer via [Nostr](https://nostr.com).

No cloud. No subscription. No platform risk.

## Features

- **Local-first**: All data stored in SQLite on your machine
- **Your API key**: Bring your own Anthropic key, pay only for what you use
- **P2P networking**: Ghost-to-ghost encrypted chat via Nostr
- **Documents**: Point at a folder, your ghost learns from your files
- **Memory**: Ghost remembers things across conversations
- **Tools**: Web search, bash, filesystem access (with approval)
- **Open source**: MIT license

## Architecture

- **Electrobun** — Bun backend + system WebView (not Electron)
- **React + Tailwind + Vite** — Frontend
- **Bun SQLite** — Local database
- **AI SDK + Anthropic** — LLM integration (Claude Sonnet 4.6)
- **Nostr** — Decentralized identity and P2P messaging

See [spec.md](./spec.md) for the full specification.

## Status

Early development. See [issues](https://github.com/ferdousbhai/ghost-app/issues) for the roadmap.

## License

MIT
