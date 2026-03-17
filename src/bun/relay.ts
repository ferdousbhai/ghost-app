import { Relay, type Filter, type Event as NostrEvent } from "nostr-tools";

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://nos.lol",
];

type MessageHandler = (event: NostrEvent, relay: string) => void;

export class RelayManager {
  private relays: Map<string, Relay> = new Map();
  private relayUrls: string[];
  private onMessage: MessageHandler;
  private subscriptions: Map<string, { unsub: () => void }> = new Map();

  constructor(relayUrls: string[] = DEFAULT_RELAYS, onMessage: MessageHandler) {
    this.relayUrls = relayUrls;
    this.onMessage = onMessage;
  }

  /** Connect to all configured relays. */
  async connect(): Promise<void> {
    await Promise.allSettled(
      this.relayUrls.map(async (url) => {
        try {
          const relay = await Relay.connect(url);
          this.relays.set(url, relay);
          console.log(`Connected to relay: ${url}`);
        } catch (err) {
          console.warn(`Failed to connect to ${url}:`, err);
        }
      })
    );
    console.log(
      `Connected to ${this.relays.size}/${this.relayUrls.length} relays`
    );
  }

  /** Subscribe to gift-wrapped DMs (kind:1059) for our pubkey. */
  subscribeToDMs(pubkeyHex: string, since?: number): void {
    for (const [url, relay] of this.relays) {
      const filter: Filter = {
        kinds: [1059], // Gift wrap (NIP-59)
        "#p": [pubkeyHex],
      };
      if (since) filter.since = since;

      const sub = relay.subscribe([filter], {
        onevent: (event: NostrEvent) => {
          this.onMessage(event, url);
        },
        oneose: () => {
          console.log(`EOSE from ${url}`);
        },
      });
      this.subscriptions.set(`dm:${url}`, { unsub: () => sub.close() });
    }
  }

  /** Publish an event to all connected relays. */
  async publish(event: NostrEvent): Promise<string[]> {
    const published: string[] = [];
    for (const [url, relay] of this.relays) {
      try {
        await relay.publish(event);
        published.push(url);
      } catch (err) {
        console.warn(`Failed to publish to ${url}:`, err);
      }
    }
    return published;
  }

  /** Disconnect from all relays. */
  disconnect(): void {
    for (const { unsub } of this.subscriptions.values()) {
      unsub();
    }
    this.subscriptions.clear();
    for (const relay of this.relays.values()) {
      relay.close();
    }
    this.relays.clear();
  }

  get connectedCount(): number {
    return this.relays.size;
  }

  get configuredRelays(): string[] {
    return this.relayUrls;
  }
}
