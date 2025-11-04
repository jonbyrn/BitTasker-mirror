import type { Event as NostrEvent } from 'nostr-tools';
import { getMessagedPeople, fetchProfileMetadata } from './nostr-message';

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
