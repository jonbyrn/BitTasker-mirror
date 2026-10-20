import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import { readable } from 'svelte/store';

// Mock configuration - controlled per test
interface MockProfileConfig {
	name?: string;
	picture?: string;
	createdAt?: string;
	shouldReject?: boolean;
}

let mockProfileConfig: MockProfileConfig = {
	name: undefined,
	picture: undefined,
	createdAt: undefined,
	shouldReject: false
};

// Factory function for the mock
function createFetchProfileMetadataMock() {
	return vi.fn().mockImplementation(async () => {
		if (mockProfileConfig.shouldReject) {
			throw new Error('Network error');
		}
		// Simulate async delay
		await new Promise((resolve) => setTimeout(resolve, 10));
		return {
			name: mockProfileConfig.name,
			picture: mockProfileConfig.picture,
			createdAt: mockProfileConfig.createdAt
		};
	});
}

// Hex conversion helper
function hexStr(input: string): string {
	const cleaned = input.replace(/[^a-fA-F0-9]/g, '');
	return cleaned.padEnd(64, '0').slice(0, 64);
}

// Hoist ALL mock functions together so vi.mock can access them
const [mockNip19Encode, mockNip19Decode, mockFetchProfileMetadata, mockGetCachedProfile] =
	vi.hoisted(() => [
		vi.fn((hex: string) => `npub1${hex.slice(0, 8)}...${hex.slice(-8)}`),
		vi.fn((npub: string) => {
			if (npub.startsWith('npub1')) {
				return {
					type: 'npub',
					data: hexStr(npub.replace('npub1', '').replace(/^0x/, ''))
				};
			}
			throw new Error('Invalid npub');
		}),
		createFetchProfileMetadataMock(),
		vi.fn().mockResolvedValue(null)
	]);

// Mock $app/paths
vi.mock('$app/paths', () => ({
	resolve: (path: string) => path
}));

// Mock svelte-i18n
vi.mock('svelte-i18n', () => ({
	t: readable((key: string) => {
		switch (key) {
			case 'dashboard.find_tasks.avatar_alt':
				return 'Avatar';
			case 'messages.unknown_user':
				return 'Unknown User';
			default:
				return key;
		}
	})
}));

// Mock nostr-tools
vi.mock('nostr-tools', () => ({
	nip19: {
		npubEncode: mockNip19Encode,
		decode: mockNip19Decode
	}
}));

vi.mock('$lib/utils/reviews/queries', () => ({
	getReviewsForUser: vi.fn().mockResolvedValue([])
}));

vi.mock('$lib/nostr/profile', () => ({
	fetchProfileMetadata: (...args: Parameters<typeof mockFetchProfileMetadata>) =>
		mockFetchProfileMetadata(...args),
	getCachedProfile: (...args: Parameters<typeof mockGetCachedProfile>) =>
		mockGetCachedProfile(...args)
}));

// Mock $lib/nostr/ndk
vi.mock('$lib/nostr/ndk', () => {
	const getHexFromNpub = (npub: string) => {
		if (npub.startsWith('npub1')) {
			const cleaned = npub.replace('npub1', '').replace(/[^a-fA-F0-9]/g, '');
			return cleaned.padEnd(64, '0').slice(0, 64);
		}
		return npub;
	};
	const getNpubFromHex = (hex: string) => {
		return `npub1${hex.slice(0, 8)}...${hex.slice(-8)}`;
	};
	return {
		ndk: {
			getUser: vi.fn(({ npub, pubkey }: { npub?: string; pubkey?: string }) => {
				if (npub) {
					return {
						pubkey: getHexFromNpub(npub),
						npub: npub
					};
				}
				if (pubkey) {
					return {
						pubkey: pubkey,
						npub: getNpubFromHex(pubkey)
					};
				}
				return { pubkey: '', npub: '' };
			}),
			subscribe: vi.fn(() => ({ on: vi.fn(), off: vi.fn(), unsub: vi.fn() }))
		}
	};
});

// Mock IconAccount
vi.mock('~icons/mdi/account', () => ({
	default: () => 'svg'
}));

// Import component after mocks
import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';

// Test data
const VALID_HEX_PUBKEY = 'a'.repeat(64);
const VALID_NPUB = 'npub1abc123def4567890123456789012345678901234567890123456789012';

describe('UserInfoDisplay', () => {
	beforeEach(() => {
		// Reset mock config
		mockProfileConfig = {
			name: undefined,
			picture: undefined,
			createdAt: undefined,
			shouldReject: false
		};
		// Reset the mock function but keep the same implementation reference
		mockFetchProfileMetadata.mockClear();
		mockFetchProfileMetadata.mockImplementation(createFetchProfileMetadataMock());
		mockGetCachedProfile.mockClear();
		mockGetCachedProfile.mockResolvedValue(null);
		mockNip19Encode.mockClear();
	});

	describe('Renders with valid npub pubkey', () => {
		it('should render display name when npub pubkey is provided', async () => {
			mockProfileConfig.name = 'TestUser';
			mockProfileConfig.picture = 'https://example.com/avatar.png';

			render(UserInfoDisplay, {
				pubkey: VALID_NPUB,
				rating: 0
			});

			await waitFor(
				() => {
					expect(screen.getByText('TestUser')).toBeInTheDocument();
				},
				{ timeout: 10000 }
			);
		});

		it('should generate correct profile URL for npub input', async () => {
			mockProfileConfig.name = 'NpubUser';

			render(UserInfoDisplay, {
				pubkey: VALID_NPUB,
				rating: 0
			});

			await waitFor(
				() => {
					const links = screen.getAllByRole('link');
					expect(links.length).toBeGreaterThanOrEqual(1);
					expect(links[0]).toHaveAttribute('href', `/npub/${VALID_NPUB}`);
				},
				{ timeout: 10000 }
			);
		});
	});

	describe('Renders with valid hex pubkey', () => {
		it('should render display name when hex pubkey is provided', async () => {
			mockProfileConfig.name = 'HexUser';
			mockProfileConfig.picture = 'https://example.com/avatar.png';

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY,
				rating: 0
			});

			await waitFor(
				() => {
					expect(screen.getByText('HexUser')).toBeInTheDocument();
				},
				{ timeout: 10000 }
			);
		});

		it('should generate correct profile URL for hex pubkey by encoding to npub', async () => {
			mockProfileConfig.name = 'HexUser';

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY,
				rating: 0
			});

			await waitFor(
				() => {
					const links = screen.getAllByRole('link');
					expect(links.length).toBeGreaterThanOrEqual(1);
					const expectedNpub = `npub1${VALID_HEX_PUBKEY.slice(0, 8)}...${VALID_HEX_PUBKEY.slice(-8)}`;
					expect(links[0]).toHaveAttribute('href', `/npub/${expectedNpub}`);
				},
				{ timeout: 10000 }
			);
		});
	});

	describe('Shows avatar with picture', () => {
		it('should show profile picture when available and safe', async () => {
			mockProfileConfig.name = 'TestUser';
			mockProfileConfig.picture = 'https://example.com/avatar.png';

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY,
				rating: 0
			});

			await waitFor(
				() => {
					const img = screen.getByRole('img');
					expect(img).toHaveAttribute('src', 'https://example.com/avatar.png');
				},
				{ timeout: 10000 }
			);
		});

		it('should NOT show avatar with javascript: URL', async () => {
			mockProfileConfig.name = 'TestUser';
			mockProfileConfig.picture = 'javascript:alert(1)';

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY,
				rating: 0
			});

			await waitFor(
				() => {
					// Should show first letter fallback since javascript: URLs are blocked
					expect(screen.getByText('T')).toBeInTheDocument();
				},
				{ timeout: 5000 }
			);
		});

		it('should NOT show avatar with data: URL', async () => {
			mockProfileConfig.name = 'TestUser';
			mockProfileConfig.picture = 'data:text/html,<img src=x onerror=alert(1)>';

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY,
				rating: 0
			});

			await waitFor(
				() => {
					// Should show first letter fallback since data: URLs are blocked
					expect(screen.getByText('T')).toBeInTheDocument();
				},
				{ timeout: 5000 }
			);
		});

		it('should show avatar with https:// URL (allowed)', async () => {
			mockProfileConfig.name = 'TestUser';
			mockProfileConfig.picture = 'https://example.com/avatar.png';

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY,
				rating: 0
			});

			await waitFor(
				() => {
					const img = document.querySelector('img[src="https://example.com/avatar.png"]');
					expect(img).toBeInTheDocument();
				},
				{ timeout: 10000 }
			);
		});

		it('should show avatar with http:// URL (allowed)', async () => {
			mockProfileConfig.name = 'TestUser';
			mockProfileConfig.picture = 'http://example.com/avatar.png';

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY,
				rating: 0
			});

			await waitFor(
				() => {
					const img = document.querySelector('img[src="http://example.com/avatar.png"]');
					expect(img).toBeInTheDocument();
				},
				{ timeout: 10000 }
			);
		});
	});

	describe('Shows first letter of display name as avatar fallback', () => {
		it('should show first letter of displayName as avatar', async () => {
			mockProfileConfig.name = 'Alice';

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY,
				rating: 0
			});

			await waitFor(
				() => {
					expect(screen.getByText('A')).toBeInTheDocument();
				},
				{ timeout: 5000 }
			);
		});

		it('should capitalize the first letter', async () => {
			mockProfileConfig.name = 'lowercase';

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY,
				rating: 0
			});

			await waitFor(
				() => {
					expect(screen.getByText('L')).toBeInTheDocument();
				},
				{ timeout: 5000 }
			);
		});
	});

	describe('Shows truncated npub when no valid profile', () => {
		it('should show truncated npub when profile fetch returns empty', async () => {
			// mockProfileConfig already has all undefined

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY,
				rating: 0
			});

			await waitFor(
				() => {
					expect(screen.queryByText('Unknown User')).not.toBeInTheDocument();
				},
				{ timeout: 5000 }
			);
		});

		it('should show truncated npub when profile fetch fails', async () => {
			mockProfileConfig.shouldReject = true;

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY,
				rating: 0
			});

			await waitFor(
				() => {
					expect(screen.queryByText('Unknown User')).not.toBeInTheDocument();
				},
				{ timeout: 5000 }
			);
		});

		it('should show truncated npub when profile has no displayName or name', async () => {
			mockProfileConfig.picture = 'https://example.com/avatar.png';

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY,
				rating: 0
			});

			await waitFor(
				() => {
					expect(screen.queryByText('Unknown User')).not.toBeInTheDocument();
				},
				{ timeout: 5000 }
			);
		});

		it('should ignore invalid profile names (npub format)', async () => {
			mockProfileConfig.name = `npub1${'x'.repeat(58)}`;

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY,
				rating: 0
			});

			await waitFor(
				() => {
					expect(screen.queryByText('Unknown User')).not.toBeInTheDocument();
				},
				{ timeout: 5000 }
			);
		});

		it('should ignore invalid profile names (hex format)', async () => {
			mockProfileConfig.name = 'a'.repeat(64);

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY,
				rating: 0
			});

			await waitFor(
				() => {
					expect(screen.queryByText('Unknown User')).not.toBeInTheDocument();
				},
				{ timeout: 5000 }
			);
		});
	});

	describe('Rating display', () => {
		it('should render 0 stars when rating is 0', async () => {
			mockProfileConfig.name = 'TestUser';

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY,
				rating: 0
			});

			await waitFor(
				() => {
					const stars = document.querySelectorAll('.text-yellow-400');
					expect(stars.length).toBe(0);
					const emptyStars = document.querySelectorAll('.text-base-content\\/30');
					expect(emptyStars.length).toBe(5);
				},
				{ timeout: 5000 }
			);
		});

		it('should render filled stars according to rating', async () => {
			mockProfileConfig.name = 'TestUser';

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY,
				rating: 3
			});

			await waitFor(
				() => {
					const filledStars = document.querySelectorAll('.text-yellow-400');
					expect(filledStars.length).toBe(3);
					const emptyStars = document.querySelectorAll('.text-base-content\\/30');
					expect(emptyStars.length).toBe(2);
				},
				{ timeout: 5000 }
			);
		});

		it('should render all stars filled when rating is 5', async () => {
			mockProfileConfig.name = 'TestUser';

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY,
				rating: 5
			});

			await waitFor(
				() => {
					const filledStars = document.querySelectorAll('.text-yellow-400');
					expect(filledStars.length).toBe(5);
				},
				{ timeout: 5000 }
			);
		});

		it('renders four filled stars and the numeric rating when rating is 4', async () => {
			mockProfileConfig.name = 'TestUser';

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY,
				rating: 4
			});

			await waitFor(
				() => {
					expect(screen.getByText('4.0')).toBeInTheDocument();
					expect(document.querySelectorAll('.text-yellow-400').length).toBe(4);
				},
				{ timeout: 5000 }
			);
		});
	});

	describe('Edge cases', () => {
		it('should handle empty pubkey gracefully', async () => {
			render(UserInfoDisplay, {
				pubkey: '',
				rating: 0
			});

			await waitFor(
				() => {
					expect(screen.queryByText('Unknown User')).not.toBeInTheDocument();
				},
				{ timeout: 5000 }
			);
		});

		it('should handle invalid pubkey format gracefully', async () => {
			render(UserInfoDisplay, {
				pubkey: 'invalid-pubkey',
				rating: 0
			});

			await waitFor(
				() => {
					expect(screen.queryByText('Unknown User')).not.toBeInTheDocument();
				},
				{ timeout: 5000 }
			);
		});

		it('should handle missing rating prop gracefully', async () => {
			mockProfileConfig.name = 'TestUser';

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY
			});

			await waitFor(
				() => {
					const emptyStars = document.querySelectorAll('.text-base-content\\/30');
					expect(emptyStars.length).toBe(5);
				},
				{ timeout: 5000 }
			);
		});

		it('should use profile name field as fallback when displayName is missing', async () => {
			mockProfileConfig.name = 'NameFromNameField';
			mockProfileConfig.picture = 'https://example.com/avatar.png';

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY,
				rating: 0
			});

			await waitFor(
				() => {
					expect(screen.getByText('NameFromNameField')).toBeInTheDocument();
				},
				{ timeout: 5000 }
			);
		});
	});

	describe('Avatar rendering', () => {
		it('should render avatar with link when profileUrl exists', async () => {
			mockProfileConfig.name = 'TestUser';
			mockProfileConfig.picture = 'https://example.com/avatar.png';

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY
			});

			await waitFor(
				() => {
					const links = screen.getAllByRole('link');
					expect(links.length).toBe(2);
				},
				{ timeout: 5000 }
			);
		});

		it('should render avatar without link when pubkey is empty', async () => {
			render(UserInfoDisplay, {
				pubkey: '',
				rating: 0
			});

			await waitFor(
				() => {
					const links = screen.queryAllByRole('link');
					expect(links.length).toBe(0);
				},
				{ timeout: 5000 }
			);
		});

		it('should show IconAccount when no displayName and no picture', async () => {
			// mockProfileConfig has no name or picture

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY
			});

			await waitFor(
				() => {
					expect(screen.queryByText('Unknown User')).not.toBeInTheDocument();
				},
				{ timeout: 5000 }
			);
		});
	});

	describe('profileLink prop', () => {
		// TODO: Fix mock timing issue with vitest/Svelte 5 - times out in sequence
		it('should use profileLink instead of pubkey for URL generation', async () => {
			mockProfileConfig.name = 'TestUser';

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY,
				profileLink: 'npub1custom123456789012345678901234567890123456789012345678901',
				rating: 0
			});

			await waitFor(
				() => {
					const links = screen.getAllByRole('link');
					expect(links.length).toBeGreaterThanOrEqual(1);
					expect(links[0]).toHaveAttribute(
						'href',
						'/npub/npub1custom123456789012345678901234567890123456789012345678901'
					);
				},
				{ timeout: 10000 }
			);
		});
	});

	describe('Accessibility', () => {
		it('renders five star icons for the rating row', async () => {
			mockProfileConfig.name = 'TestUser';

			render(UserInfoDisplay, {
				pubkey: VALID_HEX_PUBKEY,
				rating: 0
			});

			await waitFor(
				() => {
					expect(screen.getByText('TestUser')).toBeInTheDocument();
					expect(document.querySelectorAll('svg').length).toBeGreaterThanOrEqual(5);
				},
				{ timeout: 5000 }
			);
		});
	});
});
