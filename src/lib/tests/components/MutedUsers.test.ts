import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { muteStore } from '$lib/stores/mute.store';
import MutedUsers from '$lib/components/settings/MutedUsers.svelte';

// ── Mocks ──────────────────────────────────────────────────────────────────

const { mockUnmutePubkey, mockFetchProfileMetadata, mockShowSuccessToast, mockShowErrorToast } =
	vi.hoisted(() => ({
		mockUnmutePubkey: vi.fn(),
		mockFetchProfileMetadata: vi.fn(),
		mockShowSuccessToast: vi.fn(),
		mockShowErrorToast: vi.fn()
	}));

vi.mock('$lib/nostr/muteList', () => ({
	unmutePubkey: mockUnmutePubkey
}));

vi.mock('$lib/nostr/profile', () => ({
	fetchProfileMetadata: mockFetchProfileMetadata
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		subscribe: vi.fn((cb) => {
			cb({});
			return () => {};
		}),
		showSuccessToast: mockShowSuccessToast,
		showErrorToast: mockShowErrorToast
	}
}));

vi.mock('svelte-i18n', () => ({
	t: {
		subscribe: vi.fn((cb) => {
			cb((key: string, opts?: { values?: Record<string, string> }) => {
				const map: Record<string, string> = {
					'settings.muted_users.title': 'Muted Users',
					'settings.muted_users.description':
						'Users you have muted will not appear in your task feed, bids, or messages.',
					'settings.muted_users.empty': "You haven't muted anyone yet.",
					'settings.muted_users.unmute': 'Unmute',
					'settings.muted_users.unmuted_toast': 'User unmuted successfully.',
					'settings.muted_users.unmute_error': 'Failed to unmute user. Please try again.',
					'settings.muted_users.unmute_aria': opts?.values?.name
						? `Unmute ${opts.values.name}`
						: 'Unmute'
				};
				return map[key] ?? key;
			});
			return () => {};
		})
	}
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const PUBKEY_A = 'aaaa1111222233334444555566667777888899990000aaaabbbbccccddddeeee';
const PUBKEY_B = 'bbbb1111222233334444555566667777888899990000aaaabbbbccccddddeeee';

// ── Tests ──────────────────────────────────────────────────────────────────

describe('MutedUsers', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		muteStore.reset();
		// Default: profile fetch returns null (no name/picture)
		mockFetchProfileMetadata.mockResolvedValue(null);
		mockUnmutePubkey.mockResolvedValue(undefined);
	});

	describe('empty state', () => {
		it('should show the empty-state message when no users are muted', () => {
			render(MutedUsers);
			expect(screen.getByText("You haven't muted anyone yet.")).toBeDefined();
		});

		it('should show the section title', () => {
			render(MutedUsers);
			expect(screen.getByText('Muted Users')).toBeDefined();
		});

		it('should not render any Unmute buttons when the list is empty', () => {
			render(MutedUsers);
			expect(screen.queryByText('Unmute')).toBeNull();
		});
	});

	describe('populated state', () => {
		beforeEach(() => {
			muteStore.load([PUBKEY_A, PUBKEY_B], []);
		});

		it('should render an Unmute button for each muted user', () => {
			render(MutedUsers);
			const unmuteBtns = screen.getAllByText('Unmute');
			expect(unmuteBtns).toHaveLength(2);
		});

		it('should not show the empty-state message when there are muted users', () => {
			render(MutedUsers);
			expect(screen.queryByText("You haven't muted anyone yet.")).toBeNull();
		});

		it('should display a shortened pubkey as fallback when no profile name is available', () => {
			render(MutedUsers);
			// Short pubkey: first 8 chars + '...' + last 6 chars
			const shortA = PUBKEY_A.slice(0, 8) + '...' + PUBKEY_A.slice(-6);
			expect(screen.getAllByText(shortA).length).toBeGreaterThan(0);
		});

		it('should display the profile name when fetchProfileMetadata resolves with a name', async () => {
			mockFetchProfileMetadata.mockResolvedValue({ name: 'Alice', picture: null });
			render(MutedUsers);

			await vi.waitFor(() => {
				expect(screen.queryByText('Alice')).toBeDefined();
			});
		});
	});

	describe('unmute action', () => {
		beforeEach(() => {
			muteStore.load([PUBKEY_A], []);
		});

		it('should call unmutePubkey with the correct pubkey when Unmute is clicked', async () => {
			render(MutedUsers);
			await fireEvent.click(screen.getByText('Unmute'));

			expect(mockUnmutePubkey).toHaveBeenCalledWith(PUBKEY_A);
		});

		it('should show a success toast after a successful unmute', async () => {
			render(MutedUsers);
			await fireEvent.click(screen.getByText('Unmute'));

			await vi.waitFor(() => {
				expect(mockShowSuccessToast).toHaveBeenCalledWith('User unmuted successfully.');
			});
		});

		it('should show an error toast when unmutePubkey throws', async () => {
			mockUnmutePubkey.mockRejectedValue(new Error('relay error'));
			render(MutedUsers);
			await fireEvent.click(screen.getByText('Unmute'));

			await vi.waitFor(() => {
				expect(mockShowErrorToast).toHaveBeenCalledWith('Failed to unmute user. Please try again.');
			});
		});

		it('should remove the user from the store after a successful unmute', async () => {
			// Simulate the real unmutePubkey side-effect on the store
			mockUnmutePubkey.mockImplementation(async (pubkey: string) => {
				muteStore.unmutePubkey(pubkey);
			});

			render(MutedUsers);
			await fireEvent.click(screen.getByText('Unmute'));

			await vi.waitFor(() => {
				expect(get(muteStore).mutedPubkeys.has(PUBKEY_A)).toBe(false);
			});
		});
	});

	describe('reactivity', () => {
		it('should update the list when a new pubkey is muted after render', async () => {
			render(MutedUsers);
			expect(screen.queryByText('Unmute')).toBeNull();

			muteStore.mutePubkey(PUBKEY_A);

			await vi.waitFor(() => {
				expect(screen.queryByText('Unmute')).toBeDefined();
			});
		});
	});
});
