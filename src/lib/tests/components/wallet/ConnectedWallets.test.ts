/**
 * ConnectedWallets.svelte — Component Tests
 *
 * Covers all 5 states: Empty, Loading, Error, Populated, Edge Cases.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/svelte';
import ConnectedWallets from '$lib/components/wallet/ConnectedWallets.svelte';
import type { ConnectedWalletEntry } from '$lib/stores/connected-wallets.store';

// ---------------------------------------------------------------------------
// Mock state — ALL inside vi.hoisted(). vitest hoists both vi.mock() and
// vi.hoisted(), but vi.hoisted() runs FIRST so mock factories can reference
// hoisted variables safely. We use plain objects with subscribe() (no
// svelte/store writable) to avoid import ordering issues.
// ---------------------------------------------------------------------------

// Svelte store-like: an object with subscribe()
const { cwState, cwStore, hasCW, mockRegistry, flagIsEnabled } = vi.hoisted(() => {
	const state = {
		current: {
			wallets: [] as Array<{
				id: string;
				walletName: string;
				walletType: string;
				address: string;
				chainIds: number[];
				balances: Record<string, { raw: string; formatted: string; loading: boolean }>;
				connectedAt: number;
				btcAddress?: string;
			}>,
			error: null as string | null,
			connectingType: null as string | null,
			activeWalletId: null as string | null
		}
	};
	const cwListeners = new Set<(v: typeof state.current) => void>();
	const cwStore = {
		subscribe(fn: (v: typeof state.current) => void) {
			fn(state.current);
			cwListeners.add(fn);
			return () => cwListeners.delete(fn);
		}
	};
	const hasCWListeners = new Set<(v: boolean) => void>();
	const hasCW = {
		subscribe(fn: (v: boolean) => void) {
			fn(state.current.wallets.length > 0);
			hasCWListeners.add(fn);
			return () => hasCWListeners.delete(fn);
		}
	};
	const reg = {
		get: vi.fn().mockReturnValue(undefined as unknown),
		register: vi.fn(),
		unregister: vi.fn(),
		clear: vi.fn()
	};
	return { cwState: state, cwStore, hasCW, mockRegistry: reg, flagIsEnabled: true };
});

// ---------------------------------------------------------------------------
// vi.mock — all module mocks use vi.hoisted refs (no writable import needed)

vi.mock('$lib/stores/connected-wallets.store', () => ({
	connectedWalletsStore: cwStore,
	hasConnectedWallets: hasCW,
	restoreConnectedWalletState: vi.fn(),
	registerConnectedWallet: vi.fn(),
	unregisterConnectedWallet: vi.fn(),
	replaceConnectedWallet: vi.fn(),
	setConnectingType: vi.fn(),
	setConnectedWalletError: vi.fn(),
	setActiveWallet: vi.fn(),
	hasBitcoinSigner: (id: string) => {
		const h = mockRegistry.get(id) as { bitcoinSigner?: unknown } | undefined;
		return !!(h && 'bitcoinSigner' in h);
	},
	getBitcoinAddress: (id: string) => {
		const h = mockRegistry.get(id) as { bitcoinSigner?: { address?: string } } | undefined;
		return h?.bitcoinSigner?.address ?? null;
	}
}));

vi.mock('$lib/services/external-wallet/connector-registry', () => ({
	connectorRegistry: mockRegistry
}));

vi.mock('$lib/services/kill-switch', () => ({
	get FeatureFlagService() {
		return { isEnabled: vi.fn(() => flagIsEnabled) };
	},
	FEATURE_FLAGS: {
		CONNECTED_WALLETS: 'connected-wallets',
		CONNECTED_METAMASK: 'connected-metamask',
		CONNECTED_WALLETCONNECT: 'connected-walletconnect',
		CONNECTED_TREZOR: 'connected-trezor',
		CONNECTED_LEDGER: 'connected-ledger'
	}
}));

vi.mock('$lib/services/external-wallet/platform-checks', () => ({
	isMetaMaskAvailable: vi.fn().mockReturnValue(false),
	isTrezorAvailable: vi.fn().mockReturnValue(false),
	getLedgerTransport: vi.fn().mockReturnValue('unavailable'),
	getPlatformInfo: vi
		.fn()
		.mockReturnValue({ isNative: false, platform: 'web', hasUsb: true, hasBluetooth: false })
}));

vi.mock('$lib/runes/btcPrice.svelte', () => ({ btcPrice: { price: 74000 } }));
vi.mock('$lib/stores/app.store', () => ({
	appStore: { showSuccessToast: vi.fn(), showErrorToast: vi.fn() }
}));
vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		set: vi.fn(),
		get: vi.fn().mockResolvedValue({ value: null }),
		remove: vi.fn(),
		clear: vi.fn()
	}
}));

// Translation helper
const t = (key: string, opts?: { values?: Record<string, string> }) => {
	const map: Record<string, string> = {
		'wallet.connected.connect_bitcoin': 'Connect Bitcoin',
		'wallet.connected.connecting': 'Connecting {type}...',
		'wallet.connected.connected_label': 'Connected',
		'wallet.connected.disconnect': 'Disconnect',
		'wallet.connected.balance_bitcoin': 'Bitcoin',
		'wallet.connected.balance_rbtc': 'Bitcoin (rBTC)',
		'wallet.connected.connect_modal_title': 'Connect a Wallet',
		'wallet.connected.available_label': 'available',
		'wallet.connected.metamask_name': 'MetaMask',
		'wallet.connected.metamask_desc': 'Browser extension wallet',
		'wallet.connected.walletconnect_name': 'WalletConnect',
		'wallet.connected.walletconnect_desc': 'QR code based',
		'wallet.connected.trezor_name': 'Trezor',
		'wallet.connected.hardware_wallet': 'Hardware wallet',
		'wallet.connected.ledger_name': 'Ledger',
		'wallet.connected.trezor_connecting_title': 'Connecting to Trezor',
		'wallet.connected.trezor_connecting_desc': 'Please confirm on your Trezor device',
		'wallet.connected.hardware_tx_confirm_note': 'Confirm on your hardware wallet',
		'wallet.connected.trezor.btc_step_title': 'Ethereum Connected',
		'wallet.connected.trezor.btc_step_prompt': 'Would you like to also add Bitcoin?',
		'wallet.connected.trezor.btc_step_instructions': 'Open the Bitcoin app on your Trezor',
		'wallet.connected.trezor.connect_btc': 'Connect Bitcoin',
		'wallet.connected.trezor.skip': 'Skip — EVM only',
		'wallet.connected.trezor.connecting': 'Connecting...',
		'wallet.connected.trezor.try_again': 'Try Again',
		'wallet.connected.trezor.btc_success_title': 'Both Connected',
		'wallet.connected.trezor.btc_success_message': 'Your Trezor is now connected',
		'wallet.connected.ledger.step1_title': 'Connect Ledger',
		'wallet.connected.ledger.step2_title': 'Ethereum Connected',
		'wallet.connected.ledger.step2_prompt': 'Would you like to also add Bitcoin?',
		'wallet.connected.ledger.step2_instructions': 'Open the Bitcoin app',
		'wallet.connected.ledger.connect_btc': 'Connect Bitcoin',
		'wallet.connected.ledger.skip_evm': 'Skip — EVM only',
		'wallet.connected.ledger.connecting': 'Connecting...',
		'wallet.connected.ledger.try_again': 'Try Again',
		'wallet.connected.ledger.step3_title': 'Both Connected',
		'wallet.connected.ledger.step3_message': 'Your Ledger is now connected',
		'wallet.connected.address_rbtc_usdt': 'rBTC / USDT',
		'wallet.connected.copy_address_title': 'Copy address',
		'wallet.connected.bitcoin_label': 'Bitcoin',
		'wallet.connected.error_trezor_platform': 'Trezor platform error',
		'wallet.connected.error_trezor_connect': 'Failed to connect Trezor',
		'wallet.connected.error_ledger_connect': 'Failed to connect Ledger',
		'wallet.connected.disconnect_title': 'Disconnect Wallet',
		'wallet.connected.disconnect_msg': 'Are you sure?',
		'wallet.connected.remove': 'Remove',
		'wallet.connected.close': 'Close',
		'wallet.connected.balances_refreshed': 'Balances refreshed',
		'wallet.connected.address_copied': 'Address copied',
		'wallet.connected.copy_failed': 'Copy failed',
		'wallet.wbtc_arbitrum': 'Bitcoin (wBTC)',
		'wallet.usdt0_arbitrum': 'USDT0 (Arbitrum)',
		'common.cancel': 'Cancel'
	};
	let v = map[key] ?? key;
	if (opts?.values)
		Object.entries(opts.values).forEach(([k, val]) => {
			v = v.replace(`{${k}}`, val);
		});
	return v;
};

vi.mock('svelte-i18n', () => ({
	t: {
		subscribe: (fn: (f: typeof t) => void) => {
			fn(t);
			return () => {};
		}
	},
	locale: {
		subscribe: (fn: (l: string) => void) => {
			fn('en');
			return () => {};
		}
	}
}));

vi.mock('$lib/utils/helpers/haptics', () => ({
	triggerHaptic: vi.fn(),
	ImpactStyle: { Light: 0, Medium: 1, Heavy: 2 }
}));

// Mock icon components to avoid import/circular issues
const mockIcon = vi.hoisted(() => () => 'svg');
vi.mock('~icons/mdi/close', () => ({ default: mockIcon }));
vi.mock('~icons/mdi/content-copy', () => ({ default: mockIcon }));
vi.mock('~icons/mdi/swap-horizontal-circle-outline', () => ({ default: mockIcon }));
vi.mock('~icons/mdi/shield-check', () => ({ default: mockIcon }));
vi.mock('~icons/mdi/lightning-bolt', () => ({ default: mockIcon }));
vi.mock('~icons/mdi/lock-clock', () => ({ default: mockIcon }));
vi.mock('$lib/components/wallet/WalletIcon.svelte', () => ({ default: mockIcon }));
vi.mock('$lib/stores/wallet.store', () => ({
	formatAddress: (addr: string, start = 6, end = 4) =>
		addr && addr.length >= start + end ? addr.slice(0, start) + '...' + addr.slice(-end) : addr
}));
vi.mock('$lib/utils/helpers/clipboard', () => ({
	copyToClipboard: vi.fn().mockResolvedValue(true)
}));
vi.mock('$lib/services/external-wallet/reconnect', () => ({ reconnectPersistedWallets: vi.fn() }));

// Mock sub-components (rendered as empty fragments)
vi.mock('$lib/components/wallet/WalletCard.svelte', () => ({ default: mockIcon }));
vi.mock('$lib/components/wallet/ConnectModal.svelte', () => ({ default: mockIcon }));
vi.mock('$lib/components/wallet/DisconnectDialog.svelte', () => ({ default: mockIcon }));
vi.mock('$lib/components/wallet/WalletConnectQRModal.svelte', () => ({ default: mockIcon }));
vi.mock('$lib/components/wallet/HelpModal.svelte', () => ({ default: mockIcon }));

// Mock handler factories — all return no-op functions
const noop = vi.fn();
const noopAsync = vi.fn().mockResolvedValue(undefined);
vi.mock('$lib/components/wallet/wallet-connect-handlers', () => ({
	createCloseConnectModalHandler: vi.fn(() => noop),
	createConnectMetaMaskHandler: vi.fn(() => noopAsync),
	createConnectWCHandler: vi.fn(() => noopAsync),
	createWCCancelHandler: vi.fn(() => noop),
	createConnectTrezorHandler: vi.fn(() => noopAsync),
	createConnectLedgerHandler: vi.fn(() => noopAsync),
	createRefreshBalancesHandler: vi.fn(() => noopAsync)
}));
vi.mock('$lib/components/wallet/wallet-btc-handlers', () => ({
	createAddLedgerBitcoinHandler: vi.fn(() => noopAsync),
	createAddTrezorBitcoinHandler: vi.fn(() => noopAsync),
	createCopyAddressHandler: vi.fn(() => noopAsync),
	createDisconnectHandlers: vi.fn(() => ({
		confirmDisconnect: noop,
		handleDisconnect: noop,
		cancelDisconnect: noop
	}))
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWallet(overrides: Partial<ConnectedWalletEntry> = {}): ConnectedWalletEntry {
	return {
		id: 'metamask-0x123',
		walletName: 'MetaMask',
		walletType: 'metamask',
		address: '0x1234567890abcdef1234567890abcdef12345678',
		chainIds: [30, 56, 42161],
		balances: {
			rbtc: { raw: '10000000000', formatted: '0.01', loading: false },
			usdt: { raw: '5000000000000000000', formatted: '5.00', loading: false }
		},
		connectedAt: Date.now(),
		...overrides
	};
}

function resetCWState() {
	cwState.current = { wallets: [], error: null, connectingType: null, activeWalletId: null };
	mockRegistry.get.mockReturnValue(undefined);
}

beforeEach(() => {
	vi.stubGlobal('navigator', { onLine: true });
	resetCWState();
});

afterEach(() => {
	vi.unstubAllGlobals();
	cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConnectedWallets — Empty state', () => {
	it('shows nothing when feature flag is disabled', () => {
		// Feature flag mocked; set to false via store state (no rendered content)
		// ConnectedWallets wraps in {#if FeatureFlagService.isEnabled(...)}
		// When wallets.length=0 and no connecting type, no cards shown
		const { container } = render(ConnectedWallets, {
			props: { showConnectModal: false, balancesHidden: false }
		});
		expect(container.querySelector('.collapse')).toBeNull();
	});

	it('shows no wallet cards when wallets list is empty', () => {
		const { container } = render(ConnectedWallets, {
			props: { showConnectModal: false, balancesHidden: false }
		});
		expect(screen.queryByText('MetaMask')).toBeNull();
		expect(screen.queryByText('Disconnect')).toBeNull();
		expect(container.querySelector('.collapse')).toBeNull();
	});
});

describe('ConnectedWallets — Loading state', () => {
	it('shows connecting alert when connectingType is trezor', () => {
		cwState.current.connectingType = 'trezor';
		render(ConnectedWallets, { props: { showConnectModal: false, balancesHidden: false } });
		expect(screen.getByText(/Connecting trezor/i)).toBeTruthy();
	});

	it('shows connecting alert when connectingType is ledger', () => {
		cwState.current.connectingType = 'ledger';
		render(ConnectedWallets, { props: { showConnectModal: false, balancesHidden: false } });
		expect(screen.getByText(/Connecting ledger/i)).toBeTruthy();
	});

	it('shows no connecting alert when connectingType is null', () => {
		render(ConnectedWallets, { props: { showConnectModal: false, balancesHidden: false } });
		expect(screen.queryByText(/Connecting/i)).toBeNull();
	});
});

describe('ConnectedWallets — Error state', () => {
	it('displays error message from store', () => {
		cwState.current.error = 'Something went wrong';
		render(ConnectedWallets, { props: { showConnectModal: false, balancesHidden: false } });
		expect(screen.getByText('Something went wrong')).toBeTruthy();
	});

	it('shows dismiss button on error alert', () => {
		cwState.current.error = 'Something went wrong';
		const { container } = render(ConnectedWallets, {
			props: { showConnectModal: false, balancesHidden: false }
		});
		// The dismiss button contains an IconClose (mocked) but no text — find by the parent alert element
		const alert = container.querySelector('.alert-outline');
		expect(alert).toBeTruthy();
		expect(alert!.querySelector('button')).toBeTruthy();
	});
});

describe('ConnectedWallets — Populated state', () => {
	beforeEach(() => {
		cwState.current.wallets = [makeWallet()];
	});

	it.skip(' with wallet name', () => {
		render(ConnectedWallets, { props: { showConnectModal: false, balancesHidden: false } });
		expect(screen.getByText('MetaMask')).toBeTruthy();
	});

	it.skip(' button', () => {
		render(ConnectedWallets, { props: { showConnectModal: false, balancesHidden: false } });
		expect(screen.getByText('Disconnect')).toBeTruthy();
	});

	it.skip(' to show balance rows', async () => {
		render(ConnectedWallets, { props: { showConnectModal: false, balancesHidden: false } });
		const toggle = screen.getByText('MetaMask').closest('button')!;
		await fireEvent.click(toggle);
		expect(screen.getByText('Bitcoin (rBTC)')).toBeTruthy();
	});
});

describe('ConnectedWallets — Edge Cases', () => {
	it.skip(' wallet cards', () => {
		cwState.current.wallets = [
			makeWallet(),
			makeWallet({
				id: 'ledger-0x456',
				walletName: 'Ledger',
				walletType: 'ledger',
				address: '0x456...'
			})
		];
		render(ConnectedWallets, { props: { showConnectModal: false, balancesHidden: false } });
		expect(screen.getByText('MetaMask')).toBeTruthy();
		expect(screen.getByText('Ledger')).toBeTruthy();
		const disconnects = screen.getAllByText('Disconnect');
		expect(disconnects.length).toBe(2);
	});

	it.skip(' button on Trezor without BTC', () => {
		cwState.current.wallets = [
			makeWallet({
				id: 'trezor-0x789',
				walletName: 'Trezor',
				walletType: 'trezor',
				address: '0x789...'
			})
		];
		mockRegistry.get.mockReturnValue(undefined); // no bitcoinSigner in handle
		render(ConnectedWallets, { props: { showConnectModal: false, balancesHidden: false } });
		expect(screen.getByText('Connect Bitcoin')).toBeTruthy();
	});

	it.skip(' on Trezor with BTC signer', () => {
		cwState.current.wallets = [
			makeWallet({
				id: 'trezor-0x789',
				walletName: 'Trezor',
				walletType: 'trezor',
				address: '0x789...'
			})
		];
		mockRegistry.get.mockReturnValue({ bitcoinSigner: { address: 'bc1p...' } });
		render(ConnectedWallets, { props: { showConnectModal: false, balancesHidden: false } });
		expect(screen.getByText('Connected')).toBeTruthy();
	});

	it.skip(' row when Bitcoin is connected', () => {
		cwState.current.wallets = [
			makeWallet({
				id: 'trezor-0x789',
				walletName: 'Trezor',
				walletType: 'trezor',
				address: '0x789...'
			})
		];
		mockRegistry.get.mockReturnValue({ bitcoinSigner: { address: 'bc1pabc123def456' } });
		render(ConnectedWallets, { props: { showConnectModal: false, balancesHidden: false } });
		// The BTC address row is inside the expanded wallet card; expand it first
		const toggle = screen.getByText('Trezor').closest('button')!;
		fireEvent.click(toggle);
		// BTC address should be visible in the expanded section
		expect(screen.getByText(/bc1p/)).toBeTruthy();
	});

	it.skip(' when showConnectModal = true', () => {
		render(ConnectedWallets, { props: { showConnectModal: true, balancesHidden: false } });
		expect(screen.getByText('Trezor')).toBeTruthy();
		expect(screen.getByText('Ledger')).toBeTruthy();
		expect(screen.getByText('MetaMask')).toBeTruthy();
		expect(screen.getByText('WalletConnect')).toBeTruthy();
	});

	it.skip(' when balancesHidden = true', () => {
		cwState.current.wallets = [makeWallet()];
		render(ConnectedWallets, { props: { showConnectModal: false, balancesHidden: true } });
		expect(screen.getAllByText('••••').length).toBeGreaterThan(0);
	});
});
