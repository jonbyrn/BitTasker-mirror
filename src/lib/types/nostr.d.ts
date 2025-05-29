// Type definitions for Nostr/NIP-07 window object
declare global {
  interface Window {
    nostr?: {
      getPublicKey: () => Promise<string>;
      signEvent: (event: NostrEvent) => Promise<SignedNostrEvent>;
      getRelays: () => Promise<Record<string, { read: boolean; write: boolean }>>;
      nip04?: {
        encrypt: (pubkey: string, plaintext: string) => Promise<string>;
        decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
      };
    };
  }
}

export interface NostrEvent {
  id?: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig?: string;
}

// Interface for a signed Nostr event returned by window.nostr.signEvent()
export interface SignedNostrEvent extends NostrEvent {
  id: string;  // Will always have an ID after signing
  sig: string; // Will always have a signature after signing
}
