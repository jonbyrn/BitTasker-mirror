/**
 * Tests for Connected Wallets Store
 *
 * Covers:
 *  - registerConnectedWallet adds to store and registry
 *  - unregisterConnectedWallet removes from both
 *  - setConnectingType / setError / clear error
 *  - hasConnectedWallets derived store
 *  - activeConnectedWallet derived store
 *  - updateConnectedBalances updates correct wallet
 *  - Feature flag disabled = no-op
 *  - Persistence validation rejects corrupted data
 *  - clearConnectedWalletState
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import {
	connectedWalletsStore,
	hasConnectedWallets,
	activeConnectedWallet,
	registerConnectedWallet,
	unregisterConnectedWallet,
	setConnectingType,
	setConnectedWalletError,
	setActiveWallet,
	updateConnectedBalances,
	restoreConnectedWalletState,
	clearConnectedWalletState
} from '$lib/stores/connected-wallets.store';
import type { ConnectorHandle } from '$lib/services/external-wallet/types';

// ---------------------------------------------------------------------------
// Mock connector-registry module
// ---------------------------------------------------------------------------

const { mockRegistryRegister, mockRegistryUnregister, mockRegistryClear } = vi.hoisted(() => ({
	mockRegistryRegister: vi.fn(),
	mockRegistryUnregister: vi.fn(),
	mockRegistryClear: vi.fn()
}));

vi.mock('$lib/services/external-wallet/connector-registry', () => ({
	connectorRegistry: {
		register: mockRegistryRegister,
		unregister: mockRegistryUnregister,
		clear: mockRegistryClear,
		get: vi.fn(),
		has: vi.fn(),
		list: vi.fn().mockReturnValue([]),
		size: 0
	},
	ConnectorRegistry: vi.fn(),
	selectSigner: vi.fn()
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockHandle(overrides: Partial<ConnectorHandle> = {}): ConnectorHandle {
	return {
		id: 'test-metamask',
		walletName: 'MetaMask',
		walletType: 'metamask',
		address: '0x1234567890abcdef1234567890abcdef12345678',
		chainIds: [30],
		provider: null,
		onEvent: vi.fn(),
		unsubscribe: vi.fn(),
		...overrides
	};
}

const EMPTY_STATE = {
	wallets: [],
	activeWalletId: null,
	error: null,
	connectingType: null
} as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('connected-wallets.store', () => {
	beforeEach(() => {
		connectedWalletsStore.set({ ...EMPTY_STATE, wallets: [...EMPTY_STATE.wallets] });
		vi.clearAllMocks();
		vi.mocked(Preferences.get).mockResolvedValue({ value: null });
		vi.stubEnv('VITE_CONNECTED_WALLETS_ENABLED', 'true');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// ── registerConnectedWallet ─────────────────────────────────────────

	describe('registerConnectedWallet', () => {
		it('adds wallet to store and calls registry.register', () => {
			const handle = createMockHandle({ id: 'mm-1' });

			registerConnectedWallet(handle);

			const state = get(connectedWalletsStore);
			expect(state.wallets).toHaveLength(1);
			expect(state.wallets[0].id).toBe('mm-1');
			expect(state.wallets[0].walletName).toBe('MetaMask');
			expect(state.wallets[0].address).toBe('0x1234567890abcdef1234567890abcdef12345678');
			expect(mockRegistryRegister).toHaveBeenCalledWith(handle);
		});

		it('sets activeWalletId to the new wallet', () => {
			registerConnectedWallet(createMockHandle({ id: 'wallet-1' }));
			expect(get(connectedWalletsStore).activeWalletId).toBe('wallet-1');
		});

		it('clears error and connectingType on successful registration', () => {
			setConnectedWalletError('Something went wrong');
			setConnectingType('metamask');

			registerConnectedWallet(createMockHandle({ id: 'new-wallet' }));

			const state = get(connectedWalletsStore);
			expect(state.error).toBeNull();
			expect(state.connectingType).toBeNull();
		});

		it('persists state to Preferences after registration', () => {
			registerConnectedWallet(createMockHandle({ id: 'persist-me' }));

			expect(Preferences.set).toHaveBeenCalled();
			const callArg = vi.mocked(Preferences.set).mock.calls[0]?.[0];
			expect(callArg).toBeDefined();
			const persisted = JSON.parse(callArg.value as string);
			expect(persisted.version).toBe(2);
			expect(persisted.wallets).toHaveLength(1);
			expect(persisted.wallets[0].id).toBe('persist-me');
		});

		it('is a no-op when feature flag is disabled', () => {
			vi.stubEnv('VITE_CONNECTED_WALLETS_ENABLED', 'false');

			registerConnectedWallet(createMockHandle({ id: 'should-not-appear' }));

			expect(get(connectedWalletsStore).wallets).toHaveLength(0);
			expect(mockRegistryRegister).not.toHaveBeenCalled();
		});
	});

	// ── unregisterConnectedWallet ───────────────────────────────────────

	describe('unregisterConnectedWallet', () => {
		it('removes wallet from store and calls registry.unregister', () => {
			registerConnectedWallet(createMockHandle({ id: 'remove-me' }));
			expect(get(connectedWalletsStore).wallets).toHaveLength(1);

			unregisterConnectedWallet('remove-me');

			expect(get(connectedWalletsStore).wallets).toHaveLength(0);
			expect(mockRegistryUnregister).toHaveBeenCalledWith('remove-me');
		});

		it('clears activeWalletId when removing the active wallet', () => {
			registerConnectedWallet(createMockHandle({ id: 'active-one' }));
			expect(get(connectedWalletsStore).activeWalletId).toBe('active-one');

			unregisterConnectedWallet('active-one');

			expect(get(connectedWalletsStore).activeWalletId).toBeNull();
		});

		it('does not clear activeWalletId when removing a non-active wallet', () => {
			registerConnectedWallet(createMockHandle({ id: 'wallet-a' }));
			registerConnectedWallet(createMockHandle({ id: 'wallet-b' }));
			// wallet-b is the active (last registered)
			setActiveWallet('wallet-a');

			unregisterConnectedWallet('wallet-b');

			expect(get(connectedWalletsStore).activeWalletId).toBe('wallet-a');
		});

		it('clears error on unregister', () => {
			registerConnectedWallet(createMockHandle({ id: 'err-wallet' }));
			setConnectedWalletError('Connection lost');

			unregisterConnectedWallet('err-wallet');

			expect(get(connectedWalletsStore).error).toBeNull();
		});

		it('persists state after removal', () => {
			registerConnectedWallet(createMockHandle({ id: 'gone' }));
			vi.mocked(Preferences.set).mockClear();

			unregisterConnectedWallet('gone');

			expect(Preferences.set).toHaveBeenCalled();
		});

		it('is safe to call for a non-existent wallet', () => {
			expect(() => unregisterConnectedWallet('never-existed')).not.toThrow();
		});
	});

	// ── setConnectingType ───────────────────────────────────────────────

	describe('setConnectingType', () => {
		it('sets the connecting type', () => {
			setConnectingType('metamask');
			expect(get(connectedWalletsStore).connectingType).toBe('metamask');
		});

		it('clears error when setting connecting type', () => {
			setConnectedWalletError('Previous error');
			setConnectingType('walletconnect');
			expect(get(connectedWalletsStore).error).toBeNull();
		});

		it('accepts null to clear connecting type', () => {
			setConnectingType('metamask');
			setConnectingType(null);
			expect(get(connectedWalletsStore).connectingType).toBeNull();
		});
	});

	// ── setConnectedWalletError ─────────────────────────────────────────

	describe('setConnectedWalletError', () => {
		it('sets the error message', () => {
			setConnectedWalletError('Connection refused');
			expect(get(connectedWalletsStore).error).toBe('Connection refused');
		});

		it('clears connectingType when setting error', () => {
			setConnectingType('trezor');
			setConnectedWalletError('Device disconnected');
			expect(get(connectedWalletsStore).connectingType).toBeNull();
		});
	});

	// ── setActiveWallet ─────────────────────────────────────────────────

	describe('setActiveWallet', () => {
		it('sets the active wallet ID', () => {
			registerConnectedWallet(createMockHandle({ id: 'wallet-a' }));
			registerConnectedWallet(createMockHandle({ id: 'wallet-b' }));
			setActiveWallet('wallet-a');
			expect(get(connectedWalletsStore).activeWalletId).toBe('wallet-a');
		});

		it('accepts null to clear active wallet', () => {
			registerConnectedWallet(createMockHandle({ id: 'wallet-a' }));
			setActiveWallet(null);
			expect(get(connectedWalletsStore).activeWalletId).toBeNull();
		});
	});

	// ── hasConnectedWallets (derived) ───────────────────────────────────

	describe('hasConnectedWallets', () => {
		it('is false when there are no wallets', () => {
			expect(get(hasConnectedWallets)).toBe(false);
		});

		it('is true after adding a wallet', () => {
			registerConnectedWallet(createMockHandle({ id: 'wallet-a' }));
			expect(get(hasConnectedWallets)).toBe(true);
		});

		it('is false after removing all wallets', () => {
			registerConnectedWallet(createMockHandle({ id: 'wallet-a' }));
			unregisterConnectedWallet('wallet-a');
			expect(get(hasConnectedWallets)).toBe(false);
		});
	});

	// ── activeConnectedWallet (derived) ─────────────────────────────────

	describe('activeConnectedWallet', () => {
		it('returns null when there is no active wallet', () => {
			expect(get(activeConnectedWallet)).toBeNull();
		});

		it('returns the active wallet entry', () => {
			registerConnectedWallet(createMockHandle({ id: 'active-wallet' }));
			const active = get(activeConnectedWallet);
			expect(active).not.toBeNull();
			expect(active?.id).toBe('active-wallet');
			expect(active?.walletName).toBe('MetaMask');
		});

		it('returns null when activeWalletId points to a removed wallet', () => {
			registerConnectedWallet(createMockHandle({ id: 'gone' }));
			unregisterConnectedWallet('gone');
			expect(get(activeConnectedWallet)).toBeNull();
		});
	});

	// ── updateConnectedBalances ─────────────────────────────────────────

	describe('updateConnectedBalances', () => {
		it('updates balances for the correct wallet', () => {
			registerConnectedWallet(createMockHandle({ id: 'wallet-a' }));
			registerConnectedWallet(createMockHandle({ id: 'wallet-b' }));

			const rskBalance = { raw: '1000000000000000000', formatted: '1.0', loading: false };
			updateConnectedBalances('wallet-a', { rsk: rskBalance });

			const state = get(connectedWalletsStore);
			const walletA = state.wallets.find((w) => w.id === 'wallet-a');
			const walletB = state.wallets.find((w) => w.id === 'wallet-b');
			expect(walletA?.balances.rsk).toEqual(rskBalance);
			expect(walletB?.balances).toEqual({});
		});

		it('merges new balances with existing ones', () => {
			registerConnectedWallet(createMockHandle({ id: 'multi-wallet' }));

			updateConnectedBalances('multi-wallet', {
				rsk: { raw: '1', formatted: '0.000001', loading: false }
			});
			updateConnectedBalances('multi-wallet', {
				bsc: { raw: '2', formatted: '2.0', loading: false }
			});

			const state = get(connectedWalletsStore);
			const wallet = state.wallets[0];
			expect(wallet.balances.rsk).toBeDefined();
			expect(wallet.balances.bsc).toBeDefined();
			expect(wallet.balances.rsk.raw).toBe('1');
			expect(wallet.balances.bsc.raw).toBe('2');
		});

		it('overwrites existing balance for a chain', () => {
			registerConnectedWallet(createMockHandle({ id: 'to-update' }));

			updateConnectedBalances('to-update', {
				rsk: { raw: 'old', formatted: '0.5', loading: false }
			});
			updateConnectedBalances('to-update', {
				rsk: { raw: 'new', formatted: '1.5', loading: false }
			});

			const state = get(connectedWalletsStore);
			expect(state.wallets[0].balances.rsk.raw).toBe('new');
		});

		it('does nothing for a non-existent wallet', () => {
			registerConnectedWallet(createMockHandle({ id: 'real' }));

			updateConnectedBalances('non-existent', {
				rsk: { raw: '1', formatted: '1.0', loading: false }
			});

			const state = get(connectedWalletsStore);
			expect(state.wallets[0].balances).toEqual({});
		});
	});

	// ── restoreConnectedWalletState ─────────────────────────────────────

	describe('restoreConnectedWalletState', () => {
		it('is a no-op when feature flag is disabled', async () => {
			vi.stubEnv('VITE_CONNECTED_WALLETS_ENABLED', 'false');

			await restoreConnectedWalletState();

			expect(Preferences.get).not.toHaveBeenCalled();
		});

		it('is a no-op when no persisted state exists', async () => {
			vi.mocked(Preferences.get).mockResolvedValue({ value: null });

			await restoreConnectedWalletState();

			expect(Preferences.remove).not.toHaveBeenCalled();
		});

		it('is a no-op when persisted state is valid', async () => {
			const validState = {
				version: 2,
				wallets: [
					{
						id: 'wallet-1',
						walletName: 'MetaMask',
						walletType: 'metamask',
						address: '0x1234',
						chainIds: [30],
						connectedAt: 1700000000000
					}
				]
			};
			vi.mocked(Preferences.get).mockResolvedValue({
				value: JSON.stringify(validState)
			});

			await restoreConnectedWalletState();

			expect(Preferences.remove).not.toHaveBeenCalled();
		});

		it('removes corrupted state when stored value is not valid JSON', async () => {
			vi.mocked(Preferences.get).mockResolvedValue({ value: 'not-valid-json' });

			await restoreConnectedWalletState();

			expect(Preferences.remove).toHaveBeenCalled();
		});

		it('removes corrupted state when value is a string (JSON.parse does not throw)', async () => {
			vi.mocked(Preferences.get).mockResolvedValue({ value: '"just-a-string"' });

			await restoreConnectedWalletState();

			expect(Preferences.remove).toHaveBeenCalled();
		});

		it('removes corrupted state when version is missing', async () => {
			vi.mocked(Preferences.get).mockResolvedValue({
				value: JSON.stringify({ wallets: [] })
			});

			await restoreConnectedWalletState();

			expect(Preferences.remove).toHaveBeenCalled();
		});

		it('removes corrupted state when version is less than 1', async () => {
			vi.mocked(Preferences.get).mockResolvedValue({
				value: JSON.stringify({ version: 0, wallets: [] })
			});

			await restoreConnectedWalletState();

			expect(Preferences.remove).toHaveBeenCalled();
		});

		it('removes corrupted state when version is not a number', async () => {
			vi.mocked(Preferences.get).mockResolvedValue({
				value: JSON.stringify({ version: 'v1', wallets: [] })
			});

			await restoreConnectedWalletState();

			expect(Preferences.remove).toHaveBeenCalled();
		});

		it('removes corrupted state when wallets is not an array', async () => {
			vi.mocked(Preferences.get).mockResolvedValue({
				value: JSON.stringify({ version: 1, wallets: 'not-an-array' })
			});

			await restoreConnectedWalletState();

			expect(Preferences.remove).toHaveBeenCalled();
		});

		it('removes corrupted state when a wallet entry is missing id', async () => {
			vi.mocked(Preferences.get).mockResolvedValue({
				value: JSON.stringify({
					version: 1,
					wallets: [{ address: '0x1234', walletType: 'metamask' }]
				})
			});

			await restoreConnectedWalletState();

			expect(Preferences.remove).toHaveBeenCalled();
		});

		it('removes corrupted state when a wallet entry is missing address', async () => {
			vi.mocked(Preferences.get).mockResolvedValue({
				value: JSON.stringify({
					version: 1,
					wallets: [{ id: 'w1', walletType: 'metamask' }]
				})
			});

			await restoreConnectedWalletState();

			expect(Preferences.remove).toHaveBeenCalled();
		});

		it('removes corrupted state when a wallet entry is missing walletType', async () => {
			vi.mocked(Preferences.get).mockResolvedValue({
				value: JSON.stringify({
					version: 1,
					wallets: [{ id: 'w1', address: '0x1234' }]
				})
			});

			await restoreConnectedWalletState();

			expect(Preferences.remove).toHaveBeenCalled();
		});

		it('removes corrupted state when data is null', async () => {
			vi.mocked(Preferences.get).mockResolvedValue({
				value: JSON.stringify(null)
			});

			await restoreConnectedWalletState();

			expect(Preferences.remove).toHaveBeenCalled();
		});

		it('removes corrupted state when response contains non-object data', async () => {
			vi.mocked(Preferences.get).mockResolvedValue({
				value: JSON.stringify({
					version: 1,
					wallets: [{ id: 123, address: true, walletType: 456 }]
				})
			});

			await restoreConnectedWalletState();

			expect(Preferences.remove).toHaveBeenCalled();
		});
	});

	// ── clearConnectedWalletState ───────────────────────────────────────

	describe('clearConnectedWalletState', () => {
		it('resets the store to initial state', async () => {
			registerConnectedWallet(createMockHandle({ id: 'wallet-a' }));
			registerConnectedWallet(createMockHandle({ id: 'wallet-b' }));

			await clearConnectedWalletState();

			const state = get(connectedWalletsStore);
			expect(state.wallets).toEqual([]);
			expect(state.activeWalletId).toBeNull();
			expect(state.error).toBeNull();
			expect(state.connectingType).toBeNull();
		});

		it('calls connectorRegistry.clear()', async () => {
			await clearConnectedWalletState();
			expect(mockRegistryClear).toHaveBeenCalledTimes(1);
		});

		it('removes the Preferences persistence key', async () => {
			await clearConnectedWalletState();

			expect(Preferences.remove).toHaveBeenCalled();
			const callArg = vi.mocked(Preferences.remove).mock.calls[0]?.[0];
			expect(callArg).toEqual({ key: 'bittasker_connected_wallets' });
		});
	});
});
