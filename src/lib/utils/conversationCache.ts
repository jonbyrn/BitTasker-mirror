import type { Event as NostrEvent } from 'nostr-tools';

interface CachedConversation {
    pubkey: string;
    lastEvent: NostrEvent & { content: string };
    profile: { name?: string; picture?: string };
    timestamp: number;
}

interface ConversationCacheMetadata {
    lastFetchTime: number;
    userPubkey: string;
}

class SmartConversationCache {
    private cache: Map<string, CachedConversation> = new Map();
    private metadata: Map<string, ConversationCacheMetadata> = new Map();
    
    private readonly TTL = 60 * 1000; // 1 minute for conversations
    
    isStale(conversationKey: string): boolean {
        const cached = this.cache.get(conversationKey);
        if (!cached) return true;
        
        const age = Date.now() - cached.timestamp;
        return age > this.TTL;
    }
    
    getUserConversations(userPubkey: string): CachedConversation[] {
        const prefix = `${userPubkey}:`;
        return Array.from(this.cache.entries())
            .filter(([key]) => key.startsWith(prefix))
            .map(([_, conv]) => conv)
            .sort((a, b) => (b.lastEvent.created_at || 0) - (a.lastEvent.created_at || 0));
    }
    
    getLastFetchTime(userPubkey: string): number {
        return this.metadata.get(userPubkey)?.lastFetchTime || 0;
    }
    
    setLastFetchTime(userPubkey: string, time: number): void {
        this.metadata.set(userPubkey, { userPubkey, lastFetchTime: time });
    }
    
    set(userPubkey: string, conversation: Omit<CachedConversation, 'timestamp'>): void {
        const key = `${userPubkey}:${conversation.pubkey}`;
        this.cache.set(key, {
            ...conversation,
            timestamp: Date.now()
        });
    }
    
    get(userPubkey: string, conversationPubkey: string): CachedConversation | undefined {
        const key = `${userPubkey}:${conversationPubkey}`;
        return this.cache.get(key);
    }
    
    clear(userPubkey?: string): void {
        if (userPubkey) {
            const prefix = `${userPubkey}:`;
            for (const key of this.cache.keys()) {
                if (key.startsWith(prefix)) {
                    this.cache.delete(key);
                }
            }
            this.metadata.delete(userPubkey);
        } else {
            this.cache.clear();
            this.metadata.clear();
        }
    }
}

export const smartConversationCache = new SmartConversationCache();
