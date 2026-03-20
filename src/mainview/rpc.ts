/**
 * WebView-side RPC client.
 * Import { rpc, streamEvents } anywhere in the frontend to call Bun-side handlers
 * and subscribe to streaming events.
 */
import Electrobun, { Electroview } from "electrobun/view";
import type { GhostRPC } from "../shared/rpc";

// ---------------------------------------------------------------------------
// Stream event emitter — lets React components subscribe to streaming updates
// ---------------------------------------------------------------------------
type StreamTokenEvent = { conversationId: string; token: string };
type StreamDoneEvent = { conversationId: string; messageId: string };
type StreamErrorEvent = { conversationId: string; error: string };

type StreamEventMap = {
  streamToken: StreamTokenEvent;
  streamDone: StreamDoneEvent;
  streamError: StreamErrorEvent;
};

type StreamEventListener<K extends keyof StreamEventMap> = (
  data: StreamEventMap[K]
) => void;

const listeners: {
  [K in keyof StreamEventMap]: Set<StreamEventListener<K>>;
} = {
  streamToken: new Set(),
  streamDone: new Set(),
  streamError: new Set(),
};

export const streamEvents = {
  on<K extends keyof StreamEventMap>(
    event: K,
    listener: StreamEventListener<K>
  ) {
    (listeners[event] as Set<StreamEventListener<K>>).add(listener);
    return () => {
      (listeners[event] as Set<StreamEventListener<K>>).delete(listener);
    };
  },
};

function emit<K extends keyof StreamEventMap>(
  event: K,
  data: StreamEventMap[K]
) {
  for (const listener of listeners[event]) {
    try {
      (listener as StreamEventListener<K>)(data);
    } catch (e) {
      console.error(`Stream event listener error (${event}):`, e);
    }
  }
}

// ---------------------------------------------------------------------------
// RPC config
// ---------------------------------------------------------------------------
const rpcConfig = Electroview.defineRPC<GhostRPC>({
  maxRequestTime: 30000,
  handlers: {
    requests: {},
    messages: {
      streamToken: (data) => {
        emit("streamToken", data);
      },
      streamDone: (data) => {
        emit("streamDone", data);
      },
      streamError: (data) => {
        emit("streamError", data);
      },
    },
  },
});

const electrobun = new Electrobun.Electroview({ rpc: rpcConfig });

export const rpc = electrobun.rpc!;
