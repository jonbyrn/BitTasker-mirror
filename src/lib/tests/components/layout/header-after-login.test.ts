import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { goto } from '$app/navigation';

vi.unmock('$lib/stores/auth.store');

vi.mock('$app/state', () => ({
	page: {
		url: new URL('https://rgb.bittasker.com/hiring/my-tasks'),
		route: { id: '/(app)/(protected)/hiring/my-tasks' },
		params: {},
		data: {}
	}
}));

vi.mock('$lib/components/topbar/PublicTopBar.svelte', async () => {
	const { default: LoggedOutHeader } = await import('./LoggedOutHeader.svelte');
	return { default: LoggedOutHeader };
});

vi.mock('$lib/components/topbar/ProtectedTopBar.svelte', async () => {
	const { default: LoggedInHeader } = await import('./LoggedInHeader.svelte');
	return { default: LoggedInHeader };
});

vi.mock('$lib/components/Toast.svelte', async () => {
	const { default: EmptyShell } = await import('./EmptyShell.svelte');
	return { default: EmptyShell };
});

vi.mock('$lib/components/wallet/BlockchainToast.svelte', async () => {
	const { default: EmptyShell } = await import('./EmptyShell.svelte');
	return { default: EmptyShell };
});

vi.mock('$lib/stores/notificationCenter.store', () => ({
	notificationCenterStore: {
		fetchUnreadCount: vi.fn().mockResolvedValue(undefined)
	}
}));

vi.mock('$lib/api/services/notificationSocket.service', () => ({
	connectNotificationSocket: vi.fn().mockResolvedValue(undefined),
	disconnectNotificationSocket: vi.fn()
}));

vi.mock('$lib/utils/helpers/keyboard', () => ({
	initKeyboard: vi.fn().mockResolvedValue(() => undefined)
}));

vi.mock('$lib/stores/wallet/wallet-link', () => ({
	watchWalletLink: () => () => undefined
}));

vi.mock('$lib/utils/helpers/login-method', () => ({
	rememberWalletLogin: vi.fn(),
	refreshWalletLoginKind: vi.fn(),
	walletUnlockRoute: () => 'passkey'
}));

vi.mock('$lib/utils/helpers/biometrics', () => ({
	prefetchPasskeyChallenge: vi.fn()
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNostrKeyPair: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/utils/helpers/migratePasskey', () => ({
	resetMigration: vi.fn()
}));

import AppLayout from '../../../../routes/(app)/+layout.svelte';
import { authState } from '$lib/stores/auth.store';

const npub = 'aabbccddee11223344556677889900aabbccddee11223344556677889900aabb';
const userData = { npub, username: 'qa' };
const biometricData = {
	npub,
	encryptedData: 'encrypted',
	exportedKey: 'exported',
	credentialId: 'credential'
};

async function loggedOutHeader() {
	authState.set({ isAuthenticated: false, isLoading: false, error: null });
	await waitFor(() => {
		expect(screen.getByTestId('login-link')).toBeInTheDocument();
		expect(screen.getByTestId('header-signup')).toHaveTextContent('Sign Up');
	});
	expect(screen.queryByTestId('logged-in-header')).toBeNull();
}

describe('app header after auth', () => {
	beforeEach(() => {
		vi.mocked(goto).mockClear();
		authState.set({ isAuthenticated: false, isLoading: false, error: null });
	});

	it('shows the logged-in header after passkey login and after signup without navigating', async () => {
		render(AppLayout);
		await loggedOutHeader();

		// Passkey login calls setupAuthData with redirect. The destination layout
		// is not loaded here, and the route stays /hiring/my-tasks.
		await authState.setupAuthData(
			'access-token',
			'passkey',
			npub,
			userData,
			biometricData,
			true,
			'refresh-token'
		);

		await waitFor(() => {
			expect(screen.getByTestId('logged-in-header')).toBeInTheDocument();
		});
		expect(screen.queryByTestId('login-link')).toBeNull();
		expect(screen.queryByTestId('header-signup')).toBeNull();
		expect(get(authState).isAuthenticated).toBe(true);
		expect(get(authState).isLoading).toBe(false);

		await loggedOutHeader();
		vi.mocked(goto).mockClear();

		// Signup calls the same function with redirect false, then later leaves onboarding.
		await authState.setupAuthData(
			'access-token',
			'passkey',
			npub,
			userData,
			biometricData,
			false,
			'refresh-token'
		);

		await waitFor(() => {
			expect(screen.getByTestId('logged-in-header')).toBeInTheDocument();
		});
		expect(screen.queryByTestId('login-link')).toBeNull();
		expect(screen.queryByTestId('header-signup')).toBeNull();
		expect(get(authState).isAuthenticated).toBe(true);
		expect(vi.mocked(goto)).not.toHaveBeenCalled();
	});
});
