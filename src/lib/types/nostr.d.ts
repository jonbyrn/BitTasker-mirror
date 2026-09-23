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
      nip44?: {
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

// Interface for Nostr filter
export interface Filter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  '#e'?: string[];
  '#p'?: string[];
  '#d'?: string[];
  since?: number;
  until?: number;
  limit?: number;
  [key: `#${string}`]: string[] | undefined;
}

// Interface for an array with first item as single character string
// and remaining items as string or number
export interface SingleCharArray extends Array<string | number> {
  0: string; // First element must be a string
  length: number;
}

// More specific interface using tuple types with rest elements
export type SingleCharTuple = [string, ...(string | number)[]];

// Even more specific - constraining first element to exactly one character
export type SingleCharConstrainedTuple = [
  string & { length: 1 }, // Single character string
  ...(string | number)[]   // Rest can be string or number
];

// Alternative approach using template literal types for single character
export type SingleChar =
  | 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | 'k' | 'l' | 'm'
  | 'n' | 'o' | 'p' | 'q' | 'r' | 's' | 't' | 'u' | 'v' | 'w' | 'x' | 'y' | 'z'
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M'
  | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';

// Most restrictive version with predefined single characters
export type StrictSingleCharTuple = [SingleChar, ...(string | number)[]];

// Usage examples:
// const example1: SingleCharTuple = ['a', 'hello', 123, 'world', 456];
// const example2: SingleCharConstrainedTuple = ['x', 'test', 42, 'data'];
// const example3: StrictSingleCharTuple = ['!', 'command', 1, 2, 3, 'end']; 
