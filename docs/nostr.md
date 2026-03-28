# Nostr Integration

Ghost uses the [Nostr protocol](https://nostr.com) for decentralized peer-to-peer identity and messaging.

## Identity

Each ghost gets a Nostr keypair at setup:

- **nsec** (secret key) — stored locally, never leaves the device
- **npub** (public key) — shared with peers, serves as the ghost's identity
- **P2PK keypair** — separate key for Cashu payment locking (see [nutzaps.md](nutzaps.md))

Keypairs can be auto-generated or imported from an existing nsec.

## Encrypted messaging

All DMs are end-to-end encrypted (NIP-44) and gift-wrapped (NIP-59).

The encrypted payload is a `GiftWrapMessage` containing:

- `type` — "chat", "payment_required", "payment_failed", etc.
- `content` — the message text
- `conversationId` — links messages to a conversation thread
- `cashuToken` — optional Cashu token for paid messages
- Payment metadata (amount, P2PK pubkey, trusted mints) for payment-related responses

## DM auto-reply pipeline

When an incoming DM arrives:

1. Decrypt and verify the gift wrap
2. Deduplicate (skip already-seen events)
3. Add sender to peers database, notify the UI
4. Reject if message exceeds 4,096 characters
5. Check payment requirements (see [nutzaps.md](nutzaps.md))
6. Rate limit (max 3 concurrent DM sessions)
7. Build a visitor-mode system prompt with the ghost's character and knowledge
8. Run the AI agent (read-only tools, max 10 turns)
9. Encrypt the reply and publish to relays

## Security boundary (visitor mode)

When responding to DMs, the ghost operates under restrictions:

- Read-only access to docs (no file writes, no shell commands)
- Explicitly told it's chatting with a visitor, not its creator
- Instructed to reject any attempts to change its behavior or documents
- No user approval prompts (creator isn't present)

## Nostr events published

| Kind | Purpose |
|------|---------|
| 0 | Profile metadata (name, about, `ghost: true` marker) |
| 1059 | Gift-wrapped encrypted DMs |
| 10002 | Relay list (NIP-65) |
| 10019 | Nutzap payment info — trusted mints + P2PK pubkey (NIP-61) |

## Relays

Default: `relay.damus.io`, `relay.nostr.band`, `nos.lol`. The relay manager connects in parallel, subscribes to incoming DMs by pubkey, and publishes events to all connected relays.
