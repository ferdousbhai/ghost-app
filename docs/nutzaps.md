# DM Payments (Nutzaps)

Ghost owners can charge visitors ecash per message to cover AI inference costs. Payments use Cashu ecash tokens locked to the ghost's public key (NIP-61 nutzaps).

## How it works

1. Ghost owner sets per-message rates in Settings (sats for mutuals, sats for others)
2. Ghost publishes a kind:10019 event to Nostr with its trusted mints and P2PK public key
3. When a visitor wants to DM the ghost, their client reads the kind:10019 event to learn the ghost's payment requirements
4. Visitor creates a Cashu token locked to the ghost's P2PK key and includes it in the DM payload
5. Ghost redeems the token at the mint before generating a reply
6. Redeemed sats are added to the ghost's balance

## Rates

| Peer type | Config key | Default | Behavior when 0 |
|-----------|-----------|---------|------------------|
| Followed peers | `nutzap_rate_mutuals` | 0 | Free replies |
| Others | `nutzap_rate_others` | 0 | No reply (message stored only) |

## Payment flow

When a DM arrives, the ghost checks payment in this order:

```
Is sender followed?
  Yes -> rate = nutzap_rate_mutuals
  No  -> rate = nutzap_rate_others

Is rate 0?
  Yes + followed   -> reply free
  Yes + not followed -> ignore (store only)

Is cashuToken present in the DM?
  No  -> send payment_required response
  Yes -> attempt redemption at mint

Did redemption succeed?
  No  -> send payment_failed response
  Yes -> is amount >= rate?
    No  -> send payment_insufficient response
    Yes -> add to balance, generate reply
```

## Payment-required response

When a visitor sends a DM without sufficient payment, the ghost replies with a structured message:

```json
{
  "type": "payment_required",
  "content": "Payment of 10 sats required to chat with this ghost.",
  "requiredAmount": 10,
  "p2pkPubkey": "abcd1234...",
  "trustedMints": ["https://mint.minibits.cash/Bitcoin"]
}
```

The sender's client can use `requiredAmount`, `p2pkPubkey`, and `trustedMints` to construct a valid payment for the next message.

## Kind:10019 event

The ghost publishes its payment info as a replaceable Nostr event:

```json
{
  "kind": 10019,
  "tags": [
    ["relay", "wss://relay.damus.io"],
    ["relay", "wss://relay.nostr.band"],
    ["relay", "wss://nos.lol"],
    ["mint", "https://mint.minibits.cash/Bitcoin", "sat"],
    ["pubkey", "<p2pk-public-key-hex>"]
  ],
  "content": ""
}
```

- `mint` tags list accepted Cashu mints and their unit
- `pubkey` tag is the P2PK key visitors should lock tokens to (separate from the Nostr identity)
- `relay` tags tell clients where to find the ghost

## P2PK keypair

The ghost has a dedicated secp256k1 keypair for Cashu P2PK locking, separate from its Nostr identity. This is auto-generated when the Nostr keypair is created and stored in the config table as `p2pk_privkey` and `p2pk_pubkey`.

Visitors lock their Cashu tokens to the ghost's P2PK public key. The ghost uses its P2PK private key to redeem tokens at the mint.

## Balance

Redeemed sats accumulate in the `cashu_balance` config key. The balance is displayed in Settings. Withdrawal is not yet implemented.

## Default mint

If no trusted mints are configured, the default is `https://mint.minibits.cash/Bitcoin`.
