import * as nip44 from "nostr-tools/nip44";
import {
  nip19,
  finalizeEvent,
  type Event as NostrEvent,
} from "nostr-tools";

/** Derive a NIP-44 conversation key from an nsec and a counterpart's hex pubkey. */
function deriveConversationKey(nsec: string, pubkeyHex: string): Uint8Array {
  const { data: sk } = nip19.decode(nsec);
  return nip44.v2.utils.getConversationKey(sk as Uint8Array, pubkeyHex);
}

/** Encrypt a message using NIP-44. */
export function encryptMessage(
  senderNsec: string,
  recipientPubkeyHex: string,
  plaintext: string
): string {
  return nip44.v2.encrypt(plaintext, deriveConversationKey(senderNsec, recipientPubkeyHex));
}

/** Decrypt a NIP-44 encrypted message. */
export function decryptMessage(
  receiverNsec: string,
  senderPubkeyHex: string,
  ciphertext: string
): string {
  return nip44.v2.decrypt(ciphertext, deriveConversationKey(receiverNsec, senderPubkeyHex));
}

export type GiftWrapMessage = {
  type: string;
  content: string;
  conversationId: string;
  timestamp: number;
};

/** Create a kind:1059 gift-wrapped encrypted DM. */
export function createGiftWrap(
  senderNsec: string,
  recipientPubkeyHex: string,
  message: GiftWrapMessage
): NostrEvent {
  const { data: sk } = nip19.decode(senderNsec);
  const encrypted = encryptMessage(senderNsec, recipientPubkeyHex, JSON.stringify(message));

  return finalizeEvent(
    {
      kind: 1059,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", recipientPubkeyHex]],
      content: encrypted,
    },
    sk as Uint8Array
  );
}

/** Unwrap a kind:1059 gift-wrapped message. */
export function unwrapGiftWrap(
  receiverNsec: string,
  event: NostrEvent
): { senderPubkey: string; message: GiftWrapMessage } | null {
  try {
    const senderPubkey = event.pubkey;
    const decrypted = decryptMessage(receiverNsec, senderPubkey, event.content);
    const message = JSON.parse(decrypted) as GiftWrapMessage;
    return { senderPubkey, message };
  } catch (err) {
    console.warn("Failed to unwrap gift wrap:", err);
    return null;
  }
}
