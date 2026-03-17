import * as nip44 from "nostr-tools/nip44";
import {
  nip19,
  finalizeEvent,
  type Event as NostrEvent,
} from "nostr-tools";

/** Encrypt a message using NIP-44. */
export function encryptMessage(
  senderNsec: string,
  recipientPubkeyHex: string,
  plaintext: string
): string {
  const { data: sk } = nip19.decode(senderNsec);
  const conversationKey = nip44.v2.utils.getConversationKey(
    sk as Uint8Array,
    recipientPubkeyHex
  );
  return nip44.v2.encrypt(plaintext, conversationKey);
}

/** Decrypt a NIP-44 encrypted message. */
export function decryptMessage(
  receiverNsec: string,
  senderPubkeyHex: string,
  ciphertext: string
): string {
  const { data: sk } = nip19.decode(receiverNsec);
  const conversationKey = nip44.v2.utils.getConversationKey(
    sk as Uint8Array,
    senderPubkeyHex
  );
  return nip44.v2.decrypt(ciphertext, conversationKey);
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

  // Encrypt inner content (kind:14 sealed DM per NIP-17)
  const innerContent = JSON.stringify(message);
  const encrypted = encryptMessage(
    senderNsec,
    recipientPubkeyHex,
    innerContent
  );

  // Outer event (kind:1059 gift wrap)
  const event = finalizeEvent(
    {
      kind: 1059,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", recipientPubkeyHex]],
      content: encrypted,
    },
    sk as Uint8Array
  );

  return event;
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
