import type { Event as NostrEvent } from 'nostr-tools';
import { getMessagedPeople, fetchProfileMetadata, getMessagedPeopleOptimized } from './nostr-message';
import { smartConversationCache } from './conversationCache';
import { withTimeout } from './wallet/timeoutHelpers';

export interface ConversationMetadata {
	pubkey: string;
	lastEvent: NostrEvent;
	lastMessage: string;
	lastMessageTime: number;
	profile: { name?: string; picture?: string };
}

export class ConversationManager {
	async getConversations(options?: {
		limit?: number;
		offset?: number;
	}): Promise<ConversationMetadata[]> {
		try {
			// Get all conversation partners
			const people = await getMessagedPeople();

			// Convert to ConversationMetadata format
			const conversations: ConversationMetadata[] = people.map((person) => ({
				pubkey: person.pubkey,
				lastEvent: person.lastEvent,
				lastMessage: person.lastEvent.content || '', // This will be the decrypted content
				lastMessageTime: person.lastEvent.created_at,
				profile: person.profile
			}));

			// Sort by last message time (most recent first)
			conversations.sort((a, b) => b.lastMessageTime - a.lastMessageTime);

			// Apply pagination if specified
			if (options?.offset || options?.limit) {
				const start = options.offset || 0;
				const end = options.limit ? start + options.limit : undefined;
				return conversations.slice(start, end);
			}

			return conversations;
		} catch (error) {
			console.error('Failed to get conversations:', error);
			return [];
		}
	}

	async refreshConversation(pubkey: string): Promise<ConversationMetadata | null> {
		try {
			// Refresh profile data for a specific conversation
			const profile = await fetchProfileMetadata(pubkey);

			// Get updated conversation list and find this conversation
			const conversations = await this.getConversations();
			const conversation = conversations.find((c) => c.pubkey === pubkey);

			if (conversation) {
				// Update profile with fresh data
				conversation.profile = profile;
				return conversation;
			}

			return null;
		} catch (error) {
			console.error('Failed to refresh conversation:', error);
			return null;
		}
	}

	// Utility method to search conversations
	searchConversations(
		conversations: ConversationMetadata[],
		query: string
	): ConversationMetadata[] {
		if (!query.trim()) {
			return conversations;
		}

		const searchQuery = query.toLowerCase();
		return conversations.filter(
			(conversation) =>
				conversation.profile.name?.toLowerCase().includes(searchQuery) ||
				conversation.pubkey.toLowerCase().includes(searchQuery) ||
				conversation.lastMessage.toLowerCase().includes(searchQuery)
		);
	}
}

// Create a singleton instance
export const conversationManager = new ConversationManager();

// Optimized getConversations function with caching and progressive loading
export async function getConversations(options?: {
    progressive?: boolean;
    onProgress?: (conversations: ConversationMetadata[]) => void;
    userPubkey: string;
}): Promise<ConversationMetadata[]> {
    const { progressive, onProgress, userPubkey } = options || {};
    
    if (!userPubkey) {
        throw new Error('userPubkey is required');
    }
    
    // STEP 1: Load cached conversations instantly (stale-while-revalidate)
    const cachedConversations = smartConversationCache.getUserConversations(userPubkey);
    if (cachedConversations.length > 0 && onProgress) {
        onProgress(cachedConversations.map(c => ({
            pubkey: c.pubkey,
            lastEvent: c.lastEvent,
            lastMessage: c.lastEvent.content || '',
            lastMessageTime: c.lastEvent.created_at,
            profile: c.profile
        })));
    }
    
    // STEP 2: Refresh in background
    try {
        await refreshConversationsIncremental(userPubkey, progressive, onProgress);
    } catch (error) {
        console.error('Failed to refresh conversations:', error);
        // Return cached conversations on error
        if (cachedConversations.length > 0) {
            return cachedConversations.map(c => ({
                pubkey: c.pubkey,
                lastEvent: c.lastEvent,
                lastMessage: c.lastEvent.content || '',
                lastMessageTime: c.lastEvent.created_at,
                profile: c.profile
            }));
        }
        throw error;
    }
    
    // STEP 3: Return updated conversations
    return smartConversationCache.getUserConversations(userPubkey).map(c => ({
        pubkey: c.pubkey,
        lastEvent: c.lastEvent,
        lastMessage: c.lastEvent.content || '',
        lastMessageTime: c.lastEvent.created_at,
        profile: c.profile
    }));
}

async function refreshConversationsIncremental(
    userPubkey: string,
    progressive?: boolean,
    onProgress?: (conversations: ConversationMetadata[]) => void
): Promise<void> {
    // Get messaged people with timeout (already implemented with 5s timeout!)
    const people = await withTimeout(
        getMessagedPeopleOptimized(),
        8000,
        'Timeout getting messaged people'
    );
    
    // Filter out JSON-only conversations WITHOUT fetching full history
    const validConversations = people.filter(person => {
        const lastContent = person.lastEvent?.content || '';
        
        // Quick check: if last message is not JSON, it's a valid conversation
        const isJsonMessage = lastContent.startsWith('[') || lastContent.startsWith('{');
        return !isJsonMessage;
    });
    
    // Update cache and trigger progressive updates
    for (const person of validConversations) {
        smartConversationCache.set(userPubkey, {
            pubkey: person.pubkey,
            lastEvent: person.lastEvent,
            profile: person.profile
        });
        
        // Progressive update
        if (progressive && onProgress) {
            const currentConversations = smartConversationCache.getUserConversations(userPubkey);
            onProgress(currentConversations.map(c => ({
                pubkey: c.pubkey,
                lastEvent: c.lastEvent,
                lastMessage: c.lastEvent.content || '',
                lastMessageTime: c.lastEvent.created_at,
                profile: c.profile
            })));
        }
    }
    
    smartConversationCache.setLastFetchTime(userPubkey, Date.now());
}
