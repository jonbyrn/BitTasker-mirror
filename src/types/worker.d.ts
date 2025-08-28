// Cloudflare Workers TypeScript definitions for BitTasker relay services

declare global {
  interface Env {
    STORAGE_BUCKET?: R2Bucket;
    SEARCH_STORAGE?: R2Bucket;
    RELAY_NAME?: string;
    RELAY_DESCRIPTION?: string;
    RELAY_PUBKEY?: string;
    RELAY_CONTACT?: string;
  }
}

// Nostr event types
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

// Nostr filter types
export interface NostrFilter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  search?: string;
  [key: string]: any;
}

// WebSocket types
export interface WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}

// Export the global types
export {};
