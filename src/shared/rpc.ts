/**
 * Typed RPC schema between Bun backend and WebView frontend.
 *
 * Bun-side: handles requests from the webview (DB queries, AI calls, etc.)
 * Webview-side: handles messages pushed from Bun (stream tokens, notifications, etc.)
 *
 * NOTE: This file uses plain object types (not RPCSchema<>) so it can be
 * imported from both electrobun/bun and electrobun/view without issues.
 * Each side wraps it with their own API (BrowserView.defineRPC / Electroview.defineRPC).
 */

/** A single chat message for display in the UI. */
export type ChatMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
};

/** A memory key-value pair. */
export type Memory = {
  key: string;
  value: string;
};

/** A document in the local docs folder. */
export type Document = {
  path: string;
  title: string | null;
};

/** A peer on the Nostr network. */
export type Peer = {
  npub: string;
  username: string | null;
  about: string | null;
  is_following: number;
  last_message_at: number | null;
  created_at: number;
};

/** Conversation metadata. */
export type Conversation = {
  id: string;
  title: string | null;
  peer_npub: string | null;
  message_count: number;
  updated_at: number;
};

export type GhostRPC = {
  bun: {
    requests: {
      // Config
      getConfig: { params: { key: string }; response: string | null };
      setConfig: {
        params: { key: string; value: string };
        response: { success: boolean };
      };

      // Conversations (backed by Agent SDK sessions)
      listConversations: { params: {}; response: Conversation[] };
      getConversation: {
        params: { id: string };
        response: Conversation | null;
      };
      createConversation: {
        params: { id?: string };
        response: Conversation;
      };
      deleteConversation: {
        params: { id: string };
        response: { success: boolean };
      };
      renameConversation: {
        params: { id: string; title: string };
        response: { success: boolean };
      };

      // Messages (read from Agent SDK session files)
      getMessages: {
        params: { conversationId: string };
        response: ChatMessage[];
      };

      // Chat (send a user message, triggers Agent SDK streaming)
      sendMessage: {
        params: { conversationId: string; content: string };
        response: { success: boolean };
      };

      // Stop streaming
      stopStreaming: {
        params: { conversationId: string };
        response: { success: boolean };
      };

      // Character
      getCharacter: { params: {}; response: string };
      saveCharacter: { params: { content: string }; response: { success: boolean } };

      // Onboarding
      isOnboarded: { params: {}; response: boolean };
      completeOnboarding: { params: {}; response: { success: boolean } };

      // Memories (backed by memories.json)
      listMemories: { params: {}; response: Memory[] };
      setMemory: {
        params: { key: string; value: string };
        response: { success: boolean };
      };
      deleteMemory: { params: { key: string }; response: { success: boolean } };

      // Documents (backed by filesystem)
      listDocuments: { params: {}; response: Document[] };
      readDocument: { params: { path: string }; response: string | null };
      getDocsDir: { params: {}; response: string };

      // Peers
      listPeers: { params: {}; response: Peer[] };
      addPeer: { params: { npub: string; username?: string }; response: { success: boolean } | { error: string } };
      removePeer: { params: { npub: string }; response: { success: boolean } };
      followPeer: { params: { npub: string }; response: { success: boolean } };
      unfollowPeer: { params: { npub: string }; response: { success: boolean } };

      // Settings
      hasApiKey: { params: {}; response: boolean };

      // Nostr identity
      generateKeypair: { params: {}; response: { npub: string; nsec: string } };
      importKeypair: { params: { nsec: string }; response: { npub: string } | { error: string } };
      getIdentity: { params: {}; response: { npub: string; hasKey: boolean } | null };
      exportNsec: { params: {}; response: string | null };

      // Nostr relay
      connectRelays: { params: {}; response: { connected: number; total: number } };
      disconnectRelays: { params: {}; response: { success: boolean } };
      getRelayStatus: { params: {}; response: { connected: number; relays: string[] } };

      // Nostr DMs
      sendDM: {
        params: { recipientNpub: string; content: string; conversationId: string };
        response: { success: boolean; publishedTo: number } | { error: string };
      };

      // Updates
      checkForUpdate: { params: {}; response: { updateAvailable: boolean; currentVersion: string; latestVersion?: string } };
      downloadUpdate: { params: {}; response: { success: boolean; error?: string } };
      applyUpdate: { params: {}; response: { success: boolean; error?: string } };
      getAppVersion: { params: {}; response: string };
    };
    messages: {};
  };
  webview: {
    requests: {};
    messages: {
      // Stream tokens from AI to the webview
      streamToken: { conversationId: string; token: string };
      streamDone: { conversationId: string };
      streamError: { conversationId: string; error: string };
    };
  };
};
