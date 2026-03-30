import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { readable } from 'svelte/store';

const mockFetchProfileMetadata = vi.hoisted(() => vi.fn());

vi.mock('$app/paths', () => ({
	resolve: (path: string) => path
}));

vi.mock('svelte-i18n', () => ({
	t: readable((key: string) => {
		switch (key) {
			case 'dashboard.find_tasks.avatar_alt':
				return 'Avatar';
			case 'common.profile.member_since':
				return 'Member since';
			case 'messages.unknown_user':
				return 'Unknown User';
			default:
				return key;
		}
	})
}));

vi.mock('$lib/utils/nostr-message', () => ({
	fetchProfileMetadata: (...args: Parameters<typeof mockFetchProfileMetadata>) =>
		mockFetchProfileMetadata(...args)
}));

vi.mock('~icons/mdi/account', () => ({
	default: () => 'svg'
}));

import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;

	const promise = new Promise<T>((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});

	return { promise, resolve, reject };
}

describe('UserInfoDisplay', () => {
	const firstPubkey = 'a'.repeat(64);
	const secondPubkey = 'b'.repeat(64);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('ignores invalid fetched profile names and keeps the caller-provided display name', async () => {
		const deferredProfile = createDeferred<{
			name?: string;
			picture?: string;
			createdAt?: string;
		}>();
		mockFetchProfileMetadata.mockReturnValueOnce(deferredProfile.promise);

		render(UserInfoDisplay, {
			pubkey: firstPubkey,
			username: 'Reliable Display Name',
			rating: 0
		});

		await waitFor(() => {
			expect(mockFetchProfileMetadata).toHaveBeenCalledTimes(1);
		});

		deferredProfile.resolve({
			name: `npub1${'q'.repeat(58)}`,
			picture: 'https://example.com/avatar.png'
		});

		await waitFor(() => {
			expect(screen.getByText('Reliable Display Name')).toBeInTheDocument();
		});
		expect(screen.queryByText(`npub1${'q'.repeat(58)}`)).toBeNull();
	});

	it('starts a new profile load when the pubkey changes and ignores stale responses', async () => {
		const firstProfile = createDeferred<{ name?: string; picture?: string; createdAt?: string }>();
		const secondProfile = createDeferred<{ name?: string; picture?: string; createdAt?: string }>();
		mockFetchProfileMetadata
			.mockReturnValueOnce(firstProfile.promise)
			.mockReturnValueOnce(secondProfile.promise);

		const { rerender } = render(UserInfoDisplay, {
			pubkey: firstPubkey,
			username: 'First Fallback',
			rating: 0
		});

		await waitFor(() => {
			expect(mockFetchProfileMetadata).toHaveBeenCalledTimes(1);
		});

		await rerender({
			pubkey: secondPubkey,
			username: 'Second Fallback',
			rating: 0
		});

		await waitFor(() => {
			expect(mockFetchProfileMetadata).toHaveBeenCalledTimes(2);
		});

		secondProfile.resolve({ name: 'Second Display Name' });
		await waitFor(() => {
			expect(screen.getByText('Second Display Name')).toBeInTheDocument();
		});

		firstProfile.resolve({ name: 'First Display Name' });
		await tick();

		expect(screen.queryByText('First Display Name')).toBeNull();
		expect(screen.getByText('Second Display Name')).toBeInTheDocument();
	});

	it('renders a deterministic fallback label instead of a blank name when profile metadata is unavailable', async () => {
		mockFetchProfileMetadata.mockResolvedValueOnce({});

		render(UserInfoDisplay, {
			pubkey: firstPubkey,
			rating: 0
		});

		await waitFor(() => {
			expect(mockFetchProfileMetadata).toHaveBeenCalledTimes(1);
		});

		await waitFor(() => {
			expect(screen.getByText('Unknown User')).toBeInTheDocument();
		});
	});
});
