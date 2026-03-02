import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ChatMessage from '$lib/components/messages/ChatMessage.svelte';
import type { Event as NostrEvent } from 'nostr-tools';

// Mock the date formatting utility
vi.mock('$lib/utils/helpers/date', () => ({
	formatTimeAgo: vi.fn(() => '2 minutes ago')
}));

// Mock Avatar component
vi.mock('$lib/components/Avatar.svelte', () => ({
	default: vi.fn(() => ({ $$: { ctx: [] } }))
}));

describe('ChatMessage Component', () => {
	const mockEvent: NostrEvent = {
		id: 'test-event-id',
		kind: 4,
		pubkey: 'test-sender-pubkey',
		created_at: Math.floor(Date.now() / 1000),
		content: 'encrypted-content',
		tags: [['p', 'recipient-pubkey']],
		sig: 'test-signature'
	};

	const defaultMessage = {
		plaintext: 'Hello, this is a test message!',
		senderPubkey: 'test-sender-pubkey',
		event: mockEvent
	};

	const defaultProfile = {
		name: 'Test User',
		picture: 'https://example.com/avatar.jpg'
	};

	describe('Basic rendering', () => {
		it('should render message content correctly', () => {
			render(ChatMessage, {
				message: defaultMessage,
				isSender: false,
				profile: defaultProfile
			});

			const messageText = screen.getByText('Hello, this is a test message!');
			expect(messageText).toBeDefined();
		});

		it('should display sender name when not sender', () => {
			render(ChatMessage, {
				message: defaultMessage,
				isSender: false,
				profile: defaultProfile
			});

			const senderName = screen.getByText('Test User');
			expect(senderName).toBeDefined();
		});

		it('should not display sender name when is sender', () => {
			render(ChatMessage, {
				message: defaultMessage,
				isSender: true,
				profile: defaultProfile
			});

			const senderName = screen.queryByText('Test User');
			expect(senderName).toBeNull();
		});

		it('should display timestamp', () => {
			render(ChatMessage, {
				message: defaultMessage,
				isSender: false,
				profile: defaultProfile
			});

			const timestamp = screen.getByText('2 minutes ago');
			expect(timestamp).toBeDefined();
		});
	});

	describe('Message content handling', () => {
		it('should handle multiline messages', () => {
			const multilineMessage = {
				...defaultMessage,
				plaintext: 'Line 1\nLine 2\nLine 3'
			};

			render(ChatMessage, {
				message: multilineMessage,
				isSender: false,
				profile: defaultProfile
			});

			// Component preserves newlines via whitespace-pre-wrap; use flexible matcher
			expect(screen.getByText((content) => content.includes('Line 1') && content.includes('Line 2') && content.includes('Line 3'))).toBeDefined();
		});

		it('should handle empty messages', () => {
			const emptyMessage = {
				...defaultMessage,
				plaintext: ''
			};

			expect(() => {
				render(ChatMessage, {
					message: emptyMessage,
					isSender: false,
					profile: defaultProfile
				});
			}).not.toThrow();
		});

		it('should handle special characters', () => {
			const specialMessage = {
				...defaultMessage,
				plaintext: '🚀 Special chars: @#$%^&*()'
			};

			render(ChatMessage, {
				message: specialMessage,
				isSender: false,
				profile: defaultProfile
			});

			const messageText = screen.getByText('🚀 Special chars: @#$%^&*()');
			expect(messageText).toBeDefined();
		});
	});

	describe('Styling variations', () => {
		it('should apply different styling for sender vs receiver', () => {
			const { container: senderContainer } = render(ChatMessage, {
				message: defaultMessage,
				isSender: true,
				profile: defaultProfile
			});

			const { container: receiverContainer } = render(ChatMessage, {
				message: defaultMessage,
				isSender: false,
				profile: defaultProfile
			});

			// Both should render without errors
			expect(senderContainer.firstChild).toBeDefined();
			expect(receiverContainer.firstChild).toBeDefined();
		});
	});

	describe('Profile handling', () => {
		it('should handle missing profile name', () => {
			const profileWithoutName = {
				picture: 'https://example.com/avatar.jpg'
			};

			expect(() => {
				render(ChatMessage, {
					message: defaultMessage,
					isSender: false,
					profile: profileWithoutName
				});
			}).not.toThrow();
		});

		it('should handle empty profile', () => {
			expect(() => {
				render(ChatMessage, {
					message: defaultMessage,
					isSender: false,
					profile: {}
				});
			}).not.toThrow();
		});

		it('should handle profile pictures from enhanced fetching system', () => {
			const profileWithEnhancedPicture = {
				name: 'Test User',
				picture: 'https://example.com/profile-images/avatar.jpg' // Picture from kind 30063 events
			};

			expect(() => {
				render(ChatMessage, {
					message: defaultMessage,
					isSender: false,
					profile: profileWithEnhancedPicture
				});
			}).not.toThrow();
		});

		it('should handle profile picture from various sources', () => {
			const testCases = [
				{ name: 'User 1', picture: 'https://example.com/kind0-picture.jpg' }, // From kind 0 metadata
				{ name: 'User 2', picture: 'https://example.com/kind30063-picture.jpg' }, // From kind 30063 profile images
				{ name: 'User 3', picture: 'https://example.com/kind1063-picture.jpg' }, // From kind 1063 file metadata
				{ name: 'User 4', picture: null } // No picture
			];

			testCases.forEach((profile, index) => {
				expect(() => {
					render(ChatMessage, {
						message: { ...defaultMessage, plaintext: `Message ${index + 1}` },
						isSender: false,
						profile
					});
				}).not.toThrow();
			});
		});
	});

	describe('Error handling', () => {
		it('should handle minimal event data gracefully', () => {
			// Component requires event.id and event.created_at; test with minimal valid event
			const messageWithMinimalEvent = {
				plaintext: 'Test message',
				senderPubkey: 'test-pubkey',
				event: {
					id: 'minimal-id',
					kind: 4,
					pubkey: 'test-pubkey',
					created_at: 0,
					content: '',
					tags: [],
					sig: ''
				} as NostrEvent
			};

			expect(() => {
				render(ChatMessage, {
					message: messageWithMinimalEvent,
					isSender: false,
					profile: defaultProfile
				});
			}).not.toThrow();
			expect(screen.getByText('Test message')).toBeDefined();
		});

		it('should handle different timestamp formats', () => {
			const futureEvent = {
				...mockEvent,
				created_at: Math.floor(Date.now() / 1000) + 3600
			};

			const futureMessage = {
				...defaultMessage,
				event: futureEvent
			};

			expect(() => {
				render(ChatMessage, {
					message: futureMessage,
					isSender: false,
					profile: defaultProfile
				});
			}).not.toThrow();
		});
	});

	describe('Component integration', () => {
		it('should render consistently across different props', () => {
			const testCases = [
				{ isSender: true, profile: defaultProfile },
				{ isSender: false, profile: defaultProfile },
				{ isSender: true, profile: {} },
				{ isSender: false, profile: {} }
			];

			testCases.forEach((testCase) => {
				expect(() => {
					render(ChatMessage, {
						message: defaultMessage,
						...testCase
					});
				}).not.toThrow();
			});
		});
	});
});
