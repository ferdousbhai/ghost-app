/**
 * WebView-side RPC client.
 * Import { rpc } anywhere in the frontend to call Bun-side handlers.
 */
import Electrobun, { Electroview } from "electrobun/view";
import type { GhostRPC } from "../shared/rpc";

const rpcConfig = Electroview.defineRPC<GhostRPC>({
  maxRequestTime: 30000,
  handlers: {
    requests: {},
    messages: {
      streamToken: ({ conversationId, token }) => {
        // TODO: Issue #4 — handle streaming tokens for real-time display
        console.log(`[stream:${conversationId}] ${token}`);
      },
      streamDone: ({ conversationId, messageId }) => {
        console.log(`[stream:${conversationId}] done (${messageId})`);
      },
      streamError: ({ conversationId, error }) => {
        console.error(`[stream:${conversationId}] error: ${error}`);
      },
    },
  },
});

const electrobun = new Electrobun.Electroview({ rpc: rpcConfig });

export const rpc = electrobun.rpc!;
