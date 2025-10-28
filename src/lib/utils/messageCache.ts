import type { Event as NostrEvent } from 'nostr-tools';

interface CachedMessage {
    plaintext: string;
    senderPubkey: string;
    event: NostrEvent;
}

interface ConversationMessages {
    messages: CachedMessage[];
    timestamp: number;
    oldestMessageTimestamp: number;
}

class SmartMessageCache {
    private cache: Map<string, ConversationMessages> = new Map();
    private readonly TTL = 30 * 1000; // 30 seconds for messages
    
    isStale(conversationKey: string): boolean {
        const cached = this.cache.get(conversationKey);
        if (!cached) return true;
        
        const age = Date.now() - cached.timestamp;
        return age > this.TTL;
    }
    
    set(userPubkey: string, recipientPubkey: string, messages: CachedMessage[], oldestTimestamp: number): void {
        const key = `${userPubkey}:${recipientPubkey}`;
        this.cache.set(key, {
            messages,
            timestamp: Date.now(),
            oldestMessageTimestamp: oldestTimestamp
        });
    }
    
    get(userPubkey: string, recipientPubkey: string): ConversationMessages | undefined {
        const key = `${userPubkey}:${recipientPubkey}`;
        return this.cache.get(key);
    }
    
    addMessage(userPubkey: string, recipientPubkey: string, message: CachedMessage): void {
        const key = `${userPubkey}:${recipientPubkey}`;
        const cached = this.cache.get(key);
        
        if (cached) {
            cached.messages.push(message);
            cached.messages.sort((a, b) => a.event.created_at - b.event.created_at);
            cached.timestamp = Date.now();
        }
    }
    
    clear(userPubkey?: string): void {
        if (userPubkey) {
            const prefix = `${userPubkey}:`;
            for (const key of this.cache.keys()) {
                if (key.startsWith(prefix)) {
                    this.cache.delete(key);
                }
            }
        } else {
            this.cache.clear();
        }
    }
}

export const smartMessageCache = new SmartMessageCache();
