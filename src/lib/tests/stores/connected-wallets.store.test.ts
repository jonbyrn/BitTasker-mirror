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
	replaceConnectedWallet,
	unregisterConnectedWallet,
	setConnectingType,
	setConnectedWalletError,
	setActiveWallet,
	updateConnectedBalances,
	restoreConnectedWalletState,
	clearConnectedWalletState
} from '$lib/stores/connected-wallets.store';
import type { ConnectorHandle, BitcoinSigner } from '$lib/services/external-wallet/types';

// ---------------------------------------------------------------------------
// Mock connector-registry module
// ---------------------------------------------------------------------------

const { mockRegistryRegister, mockRegistryUnregister, mockRegistryClear } = vi.hoisted(() => ({
	mockRegistryRegister: vi.fn(),
	mockRegistryUnregister: vi.fn(),
	mockRegistryClear: vi.fn()
}));

const { mockRegistryReplace, mockPollerInit, mockPollerStart, mockPollerStop } = vi.hoisted(() => ({
	mockRegistryReplace: vi.fn(),
	mockPollerInit: vi.fn().mockResolvedValue(undefined),
	mockPollerStart: vi.fn(),
	mockPollerStop: vi.fn()
}));

vi.mock('$lib/services/external-wallet/connector-registry', () => ({
	connectorRegistry: {
		register: mockRegistryRegister,
		unregister: mockRegistryUnregister,
		clear: mockRegistryClear,
		replace: mockRegistryReplace,
		get: vi.fn(),
		has: vi.fn(),
		list: vi.fn().mockReturnValue([]),
		size: 0
	},
	ConnectorRegistry: vi.fn(),
	selectSigner: vi.fn()
}));

vi.mock('$lib/services/external-wallet/balance-poller', () => ({
	balancePoller: {
		init: mockPollerInit,
		start: mockPollerStart,
		stop: mockPollerStop
	}
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

	// -----------------------------------------------------------------------
	// replaceConnectedWallet
	// -----------------------------------------------------------------------

	describe('replaceConnectedWallet', () => {
		it('replaces wallet entry while preserving existing balance data', () => {
			const oldHandle = createMockHandle({
				id: 'wallet-1',
				address: '0xOLD_ADDRESS',
				chainIds: [30]
			});
			registerConnectedWallet(oldHandle);

			// Set up some existing balances
			const rskBalance = { raw: '1000000000000000000', formatted: '1.0', loading: false };
			const bscBalance = { raw: '2000000000000000000', formatted: '2.0', loading: false };
			updateConnectedBalances('wallet-1', { rsk: rskBalance, bsc: bscBalance });

			vi.clearAllMocks();

			const newHandle = createMockHandle({
				id: 'wallet-1',
				address: '0xNEW_ADDRESS',
				chainIds: [31, 137]
			});
			replaceConnectedWallet(newHandle);

			const state = get(connectedWalletsStore);
			expect(state.wallets).toHaveLength(1);
			expect(state.wallets[0].id).toBe('wallet-1');
			expect(state.wallets[0].address).toBe('0xNEW_ADDRESS');
			expect(state.wallets[0].chainIds).toEqual([31, 137]);
			expect(state.wallets[0].balances.rsk).toEqual(rskBalance);
			expect(state.wallets[0].balances.bsc).toEqual(bscBalance);
			expect(mockRegistryReplace).toHaveBeenCalledWith(newHandle);
			expect(mockPollerStop).toHaveBeenCalledWith('wallet-1');
		});

		it("updates walletName to the new handle's value", () => {
			registerConnectedWallet(createMockHandle({ id: 'wallet-1', walletName: 'MetaMask' }));
			vi.clearAllMocks();

			replaceConnectedWallet(createMockHandle({ id: 'wallet-1', walletName: 'Renamed Wallet' }));

			expect(get(connectedWalletsStore).wallets[0].walletName).toBe('Renamed Wallet');
		});

		it('calls fetchBalances when present on the new handle', async () => {
			registerConnectedWallet(createMockHandle({ id: 'wallet-1' }));
			vi.clearAllMocks();

			const mockFetch = vi.fn().mockResolvedValue({
				rsk: { raw: '300', formatted: '0.0003', loading: false }
			});

			replaceConnectedWallet(createMockHandle({ id: 'wallet-1', fetchBalances: mockFetch }));

			expect(mockFetch).toHaveBeenCalledTimes(1);

			// Wait for the async fetchBalances promise to resolve
			await new Promise((r) => setTimeout(r, 50));

			const balances = get(connectedWalletsStore).wallets[0].balances;
			expect(balances.rsk?.raw).toBe('300');
		});

		it('keeps existing balances when fetchBalances is absent on new handle', () => {
			registerConnectedWallet(createMockHandle({ id: 'wallet-1' }));
			updateConnectedBalances('wallet-1', {
				rsk: { raw: 'existing', formatted: '0.5', loading: false }
			});
			vi.clearAllMocks();

			replaceConnectedWallet(createMockHandle({ id: 'wallet-1', address: '0xCHANGED' }));

			const state = get(connectedWalletsStore);
			expect(state.wallets[0].balances.rsk?.raw).toBe('existing');
			expect(state.wallets[0].address).toBe('0xCHANGED');
		});

		it('persists state after replacement', () => {
			registerConnectedWallet(createMockHandle({ id: 'wallet-1' }));
			vi.clearAllMocks();

			replaceConnectedWallet(createMockHandle({ id: 'wallet-1', address: '0xNEW' }));

			expect(Preferences.set).toHaveBeenCalled();
			const callArg = vi.mocked(Preferences.set).mock.calls[0]?.[0];
			expect(callArg).toBeDefined();
			const persisted = JSON.parse(callArg.value as string);
			expect(persisted.version).toBe(2);
			expect(persisted.wallets).toHaveLength(1);
			expect(persisted.wallets[0].address).toBe('0xNEW');
		});

		it('no-ops when wallet ID does not exist in store', () => {
			registerConnectedWallet(createMockHandle({ id: 'wallet-1' }));
			vi.clearAllMocks();

			expect(() => replaceConnectedWallet(createMockHandle({ id: 'non-existent' }))).not.toThrow();

			const state = get(connectedWalletsStore);
			expect(state.wallets).toHaveLength(1);
			expect(state.wallets[0].id).toBe('wallet-1');
		});

		it('clears error and connectingType on replacement', () => {
			registerConnectedWallet(createMockHandle({ id: 'wallet-1' }));
			setConnectedWalletError('Previous error');
			setConnectingType('metamask');
			vi.clearAllMocks();

			replaceConnectedWallet(createMockHandle({ id: 'wallet-1' }));

			const state = get(connectedWalletsStore);
			expect(state.error).toBeNull();
			expect(state.connectingType).toBeNull();
		});

		it('sets activeWalletId to the replaced wallet', () => {
			registerConnectedWallet(createMockHandle({ id: 'wallet-1' }));
			registerConnectedWallet(createMockHandle({ id: 'wallet-2' }));
			vi.clearAllMocks();

			replaceConnectedWallet(createMockHandle({ id: 'wallet-1', address: '0xUPDATED' }));

			expect(get(connectedWalletsStore).activeWalletId).toBe('wallet-1');
		});
	});

	// -----------------------------------------------------------------------
	// Hardware wallet deduplication (registerConnectedWallet)
	// -----------------------------------------------------------------------

	describe('registerConnectedWallet — hardware wallet deduplication', () => {
		it('removes old Ledger entry when registering a new Ledger wallet', () => {
			const oldLedger = createMockHandle({
				id: 'ledger-old',
				walletType: 'ledger',
				walletName: 'Ledger (Old)',
				address: '0xOLD_LEDGER'
			});
			registerConnectedWallet(oldLedger);

			// Register a new Ledger wallet (different ID, different address)
			const newLedger = createMockHandle({
				id: 'ledger-new',
				walletType: 'ledger',
				walletName: 'Ledger (New)',
				address: '0xNEW_LEDGER'
			});
			registerConnectedWallet(newLedger);

			const state = get(connectedWalletsStore);
			const ledgerWallets = state.wallets.filter((w) => w.walletType === 'ledger');
			expect(ledgerWallets).toHaveLength(1);
			expect(ledgerWallets[0].id).toBe('ledger-new');
			expect(ledgerWallets[0].address).toBe('0xNEW_LEDGER');
		});

		it('removes old Trezor entry when registering a new Trezor wallet', () => {
			const oldTrezor = createMockHandle({
				id: 'trezor-old',
				walletType: 'trezor',
				walletName: 'Trezor (Old)',
				address: '0xOLD_TREZOR'
			});
			registerConnectedWallet(oldTrezor);

			const newTrezor = createMockHandle({
				id: 'trezor-new',
				walletType: 'trezor',
				walletName: 'Trezor (New)',
				address: '0xNEW_TREZOR'
			});
			registerConnectedWallet(newTrezor);

			const state = get(connectedWalletsStore);
			const trezorWallets = state.wallets.filter((w) => w.walletType === 'trezor');
			expect(trezorWallets).toHaveLength(1);
			expect(trezorWallets[0].id).toBe('trezor-new');
		});

		it('MetaMask re-register removes by exact ID, not by walletType', () => {
			const mm1 = createMockHandle({
				id: 'mm-1',
				walletType: 'metamask',
				walletName: 'MetaMask 1'
			});
			registerConnectedWallet(mm1);

			const mm1rereg = createMockHandle({
				id: 'mm-1',
				walletType: 'metamask',
				walletName: 'MetaMask 1 Re-reg'
			});
			registerConnectedWallet(mm1rereg);

			// Only one entry because same ID was replaced
			expect(get(connectedWalletsStore).wallets).toHaveLength(1);
			expect(get(connectedWalletsStore).wallets[0].walletName).toBe('MetaMask 1 Re-reg');
		});

		it('MetaMask re-register with different ID creates separate entries', () => {
			registerConnectedWallet(createMockHandle({ id: 'mm-1', walletType: 'metamask' }));
			registerConnectedWallet(createMockHandle({ id: 'mm-2', walletType: 'metamask' }));

			const state = get(connectedWalletsStore);
			expect(state.wallets).toHaveLength(2);
			expect(state.wallets.map((w) => w.id).sort()).toEqual(['mm-1', 'mm-2']);
		});

		it('maintains exactly one wallet of each hardware type after dedup (mixed wallets)', () => {
			// Register initial hardware wallets
			registerConnectedWallet(
				createMockHandle({
					id: 'ledger-1',
					walletType: 'ledger',
					walletName: 'Ledger'
				})
			);
			registerConnectedWallet(
				createMockHandle({
					id: 'trezor-1',
					walletType: 'trezor',
					walletName: 'Trezor'
				})
			);
			registerConnectedWallet(
				createMockHandle({
					id: 'mm-1',
					walletType: 'metamask',
					walletName: 'MetaMask'
				})
			);

			expect(get(connectedWalletsStore).wallets).toHaveLength(3);

			// Replace Ledger — should keep Trezor and MetaMask
			registerConnectedWallet(
				createMockHandle({
					id: 'ledger-2',
					walletType: 'ledger',
					walletName: 'Ledger v2'
				})
			);

			const state = get(connectedWalletsStore);
			expect(state.wallets).toHaveLength(3);

			const ledgerWallets = state.wallets.filter((w) => w.walletType === 'ledger');
			expect(ledgerWallets).toHaveLength(1);
			expect(ledgerWallets[0].id).toBe('ledger-2');

			const trezorWallets = state.wallets.filter((w) => w.walletType === 'trezor');
			expect(trezorWallets).toHaveLength(1);
			expect(trezorWallets[0].id).toBe('trezor-1');

			const mmWallets = state.wallets.filter((w) => w.walletType === 'metamask');
			expect(mmWallets).toHaveLength(1);
			expect(mmWallets[0].id).toBe('mm-1');
		});

		it('new hardware handle is registered in connectorRegistry, old is not unregistered', () => {
			registerConnectedWallet(
				createMockHandle({
					id: 'ledger-1',
					walletType: 'ledger',
					address: '0xLEDGER1'
				})
			);
			vi.clearAllMocks();

			const newHandle = createMockHandle({
				id: 'ledger-2',
				walletType: 'ledger',
				address: '0xLEDGER2'
			});
			registerConnectedWallet(newHandle);

			expect(mockRegistryRegister).toHaveBeenCalledWith(newHandle);
			expect(mockRegistryUnregister).not.toHaveBeenCalledWith('ledger-1');
		});
	});

	// -----------------------------------------------------------------------
	// navigator.onLine guard
	// -----------------------------------------------------------------------

	describe('navigator.onLine guard', () => {
		afterEach(() => {
			vi.unstubAllGlobals();
		});

		describe('registerConnectedWallet', () => {
			it('skips balance fetch and warns when navigator.onLine is false', () => {
				const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
				vi.stubGlobal('navigator', { onLine: false });

				const mockFetch = vi.fn();
				registerConnectedWallet(
					createMockHandle({ id: 'offline-wallet', fetchBalances: mockFetch })
				);

				// Wallet is still registered in the store
				expect(get(connectedWalletsStore).wallets).toHaveLength(1);
				expect(get(connectedWalletsStore).wallets[0].id).toBe('offline-wallet');

				// fetchBalances was NOT called
				expect(mockFetch).not.toHaveBeenCalled();

				// Console warning was issued
				expect(warnSpy).toHaveBeenCalledWith('[Store] Offline — skipping initial balance fetch');

				warnSpy.mockRestore();
			});

			it('proceeds with balance fetch when navigator.onLine is true', () => {
				vi.stubGlobal('navigator', { onLine: true });

				const mockFetch = vi.fn().mockResolvedValue({
					rsk: { raw: '100', formatted: '0.0001', loading: false }
				});
				registerConnectedWallet(
					createMockHandle({ id: 'online-wallet', fetchBalances: mockFetch })
				);

				expect(mockFetch).toHaveBeenCalledTimes(1);
			});
		});

		describe('replaceConnectedWallet', () => {
			it('skips balance fetch and warns when navigator.onLine is false', () => {
				registerConnectedWallet(createMockHandle({ id: 'wallet-1' }));
				vi.clearAllMocks();

				const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
				vi.stubGlobal('navigator', { onLine: false });

				const mockFetch = vi.fn();
				replaceConnectedWallet(createMockHandle({ id: 'wallet-1', fetchBalances: mockFetch }));

				expect(mockFetch).not.toHaveBeenCalled();
				expect(warnSpy).toHaveBeenCalledWith(
					'[Store] Offline — skipping balance fetch after replace'
				);

				warnSpy.mockRestore();
			});

			it('proceeds with balance fetch when navigator.onLine is true', () => {
				registerConnectedWallet(createMockHandle({ id: 'wallet-1' }));
				vi.clearAllMocks();
				vi.stubGlobal('navigator', { onLine: true });

				const mockFetch = vi.fn().mockResolvedValue({
					rsk: { raw: '100', formatted: '0.0001', loading: false }
				});
				replaceConnectedWallet(createMockHandle({ id: 'wallet-1', fetchBalances: mockFetch }));

				expect(mockFetch).toHaveBeenCalledTimes(1);
			});
		});
	});

	// -----------------------------------------------------------------------
	// BTC address persistence
	// -----------------------------------------------------------------------

	describe('BTC address persistence', () => {
		describe('registerConnectedWallet', () => {
			it('stores btcAddress when handle has bitcoinSigner with address', () => {
				const btcSigner: BitcoinSigner = {
					type: 'bitcoin',
					label: 'Ledger',
					address: 'bc1qtestaddress1234567890',
					xpub: 'xpub123',
					derivationPath: "m/84'/0'/0'/0/0",
					getAddress: () => 'bc1qtestaddress1234567890',
					getXPUB: () => 'xpub123',
					isConnected: () => true,
					deriveChangeAddress: () => 'bc1qchange',
					sendBitcoin: async () => {
						throw new Error('mock');
					},
					signPSBT: async () => {
						throw new Error('mock');
					}
				};

				registerConnectedWallet(
					createMockHandle({
						id: 'ledger-btc',
						walletType: 'ledger',
						walletName: 'Ledger',
						bitcoinSigner: btcSigner
					})
				);

				const state = get(connectedWalletsStore);
				expect(state.wallets[0].btcAddress).toBe('bc1qtestaddress1234567890');
			});

			it('btcAddress is undefined when handle has no bitcoinSigner', () => {
				registerConnectedWallet(
					createMockHandle({
						id: 'no-btc',
						walletType: 'metamask',
						walletName: 'MetaMask'
					})
				);

				const state = get(connectedWalletsStore);
				expect(state.wallets[0].btcAddress).toBeUndefined();
			});
		});

		describe('restoreConnectedWalletState', () => {
			it('creates BTC stub handle in registry after restore', async () => {
				const persistedState = {
					version: 2,
					wallets: [
						{
							id: 'ledger-1',
							walletName: 'Ledger',
							walletType: 'ledger',
							address: '0x1234',
							chainIds: [30],
							connectedAt: Date.now(),
							btcAddress: 'bc1qrestoredbtcaddress'
						}
					]
				};
				vi.mocked(Preferences.get).mockResolvedValue({
					value: JSON.stringify(persistedState)
				});
				vi.clearAllMocks();

				await restoreConnectedWalletState();

				expect(mockRegistryRegister).toHaveBeenCalled();
				const stubHandle = mockRegistryRegister.mock.calls[0]?.[0];
				expect(stubHandle).toBeDefined();
				expect(stubHandle.id).toBe('ledger-1');
				expect(stubHandle.walletType).toBe('ledger');
				expect(stubHandle.bitcoinSigner).toBeDefined();
				expect(stubHandle.bitcoinSigner?.address).toBe('bc1qrestoredbtcaddress');
				expect(stubHandle.bitcoinSigner?.type).toBe('bitcoin');
			});

			it('does not create BTC stub handle when btcAddress is missing', async () => {
				const persistedState = {
					version: 2,
					wallets: [
						{
							id: 'mm-1',
							walletName: 'MetaMask',
							walletType: 'metamask',
							address: '0x1234',
							chainIds: [30],
							connectedAt: Date.now()
						}
					]
				};
				vi.mocked(Preferences.get).mockResolvedValue({
					value: JSON.stringify(persistedState)
				});
				vi.clearAllMocks();

				await restoreConnectedWalletState();

				// No stub handles should be created for non-BTC wallet
				expect(mockRegistryRegister).not.toHaveBeenCalled();
			});

			it('restores btcAddress into the store entry after restore', async () => {
				const persistedState = {
					version: 2,
					wallets: [
						{
							id: 'ledger-1',
							walletName: 'Ledger',
							walletType: 'ledger',
							address: '0x1234',
							chainIds: [30],
							connectedAt: Date.now(),
							btcAddress: 'bc1qrestoredbtcaddress'
						}
					]
				};
				vi.mocked(Preferences.get).mockResolvedValue({
					value: JSON.stringify(persistedState)
				});

				await restoreConnectedWalletState();

				const state = get(connectedWalletsStore);
				expect(state.wallets).toHaveLength(1);
				expect(state.wallets[0].btcAddress).toBe('bc1qrestoredbtcaddress');
			});
		});
	});
});
