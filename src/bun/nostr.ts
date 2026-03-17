import { generateSecretKey, getPublicKey, nip19, finalizeEvent, type Event } from "nostr-tools";

export interface NostrIdentity {
  nsec: string;   // bech32-encoded private key
  npub: string;   // bech32-encoded public key
  pubkeyHex: string;
}

/** Generate a new Nostr keypair. */
export function generateKeypair(): NostrIdentity {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  return {
    nsec: nip19.nsecEncode(sk),
    npub: nip19.npubEncode(pk),
    pubkeyHex: pk,
  };
}

/** Decode an nsec string to get the full identity. */
export function identityFromNsec(nsec: string): NostrIdentity {
  const { type, data } = nip19.decode(nsec);
  if (type !== "nsec") throw new Error("Invalid nsec");
  const sk = data as Uint8Array;
  const pk = getPublicKey(sk);
  return {
    nsec,
    npub: nip19.npubEncode(pk),
    pubkeyHex: pk,
  };
}

/** Create a kind:0 metadata event (profile). */
export function createProfileEvent(
  nsec: string,
  metadata: { name: string; about?: string; picture?: string; nip05?: string }
): Event {
  const { data: sk } = nip19.decode(nsec);
  const event = finalizeEvent({
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify({
      ...metadata,
      ghost: "true", // custom tag identifying this as a ghost-app agent
    }),
  }, sk as Uint8Array);
  return event;
}

/** Create a kind:10002 relay list event (NIP-65). */
export function createRelayListEvent(nsec: string, relays: string[]): Event {
  const { data: sk } = nip19.decode(nsec);
  const tags = relays.map(url => ["r", url]);
  const event = finalizeEvent({
    kind: 10002,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  }, sk as Uint8Array);
  return event;
}
