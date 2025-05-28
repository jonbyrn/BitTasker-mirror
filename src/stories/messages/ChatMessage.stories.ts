import ChatMessage from '$lib/components/messages/ChatMessage.svelte';

export default {
	title: 'Messages/ChatMessage',
	component: ChatMessage,
	parameters: {
		layout: 'padded',
		docs: {
			description: {
				component:
					'ChatMessage displays individual messages in a chat conversation with different styling for sent vs received messages.'
			}
		}
	},
	tags: ['autodocs']
};

// Mock Nostr event
const createMockEvent = (timestamp = Math.floor(Date.now() / 1000)) => ({
	id: 'story-event-id',
	kind: 4,
	pubkey: 'story-sender-pubkey',
	created_at: timestamp,
	content: 'encrypted-content',
	tags: [['p', 'recipient-pubkey']],
	sig: 'story-signature'
});

const defaultMessage = {
	plaintext: 'Hello! This is a sample message.',
	senderPubkey: 'sender-pubkey-123',
	event: createMockEvent()
};

const defaultProfile = {
	name: 'Alice Johnson',
	picture:
		'https://images.unsplash.com/photo-1494790108755-2616b612b47c?w=150&h=150&fit=crop&crop=face'
};

export const ReceivedMessage = {
	args: {
		message: defaultMessage,
		isSender: false,
		profile: defaultProfile
	}
};

export const SentMessage = {
	args: {
		message: defaultMessage,
		isSender: true,
		profile: defaultProfile
	}
};

export const LongMessage = {
	args: {
		message: {
			...defaultMessage,
			plaintext:
				'This is a much longer message that demonstrates how the component handles text that spans multiple lines and wraps properly within the message bubble constraints.'
		},
		isSender: false,
		profile: defaultProfile
	}
};

export const WithEmojis = {
	args: {
		message: {
			...defaultMessage,
			plaintext: '🚀 Hey there! How are you doing? 😊'
		},
		isSender: true,
		profile: defaultProfile
	}
};

export const EmptyProfile = {
	args: {
		message: defaultMessage,
		isSender: false,
		profile: {}
	}
};
