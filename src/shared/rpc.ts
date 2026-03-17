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

/** A single chat message as stored in SQLite. */
export type ChatMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  created_at: number;
};

/** A memory key-value pair. */
export type Memory = {
  key: string;
  value: string;
  updated_at: number;
};

/** An indexed document from the local docs folder. */
export type Document = {
  path: string;
  title: string | null;
  content_hash: string;
  indexed_at: number;
};

/** Conversation metadata. */
export type Conversation = {
  id: string;
  title: string | null;
  peer_npub: string | null;
  is_incoming: number;
  message_count: number;
  created_at: number;
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

      // Conversations
      listConversations: { params: {}; response: Conversation[] };
      getConversation: {
        params: { id: string };
        response: Conversation | null;
      };
      createConversation: {
        params: { id: string; title?: string };
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
      searchConversations: {
        params: { query: string };
        response: Conversation[];
      };

      // Messages
      getMessages: {
        params: { conversationId: string };
        response: ChatMessage[];
      };

      // Chat (send a user message, triggers AI streaming)
      sendMessage: {
        params: { conversationId: string; content: string };
        response: { messageId: string };
      };

      // Character
      getCharacter: { params: {}; response: string };
      saveCharacter: { params: { content: string }; response: { success: boolean } };

      // Onboarding
      isOnboarded: { params: {}; response: boolean };
      completeOnboarding: { params: {}; response: { success: boolean } };

      // Memories
      listMemories: { params: {}; response: Memory[] };
      setMemory: {
        params: { key: string; value: string };
        response: { success: boolean; previousValue: string | null };
      };
      deleteMemory: { params: { key: string }; response: { success: boolean } };
      searchMemories: { params: { query: string }; response: Memory[] };

      // Documents
      listDocuments: { params: {}; response: Document[] };
      readDocument: { params: { path: string }; response: string | null };
      searchDocuments: { params: { query: string }; response: Document[] };
      getDocsDir: { params: {}; response: string };
      reindexDocuments: { params: {}; response: { indexed: number } };

      // Settings
      hasApiKey: { params: {}; response: boolean };
    };
    messages: {};
  };
  webview: {
    requests: {};
    messages: {
      // Stream tokens from AI to the webview
      streamToken: { conversationId: string; token: string };
      streamDone: { conversationId: string; messageId: string };
      streamError: { conversationId: string; error: string };
    };
  };
};
