/**
 * Tests for WalletConnect Connector
 *
 * Covers:
 *  - connectWC: successful pairing, URI callback, timeout, missing project ID,
 *    missing QR URI after connect
 *  - restoreWCSession: session restored, no session, session expired
 *  - disconnectWC / isWCConnected / getWCProvider
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Preferences } from '@capacitor/preferences';

// ---------------------------------------------------------------------------
// Hoisted mocks — must run before vi.mock blocks
// ---------------------------------------------------------------------------

const { mockProvider, mockCryptoSubtle } = vi.hoisted(() => {
	// A mock provider that acts like a WalletConnect EthereumProvider
	const provider = {
		on: vi.fn(),
		connect: vi.fn(),
		disconnect: vi.fn().mockResolvedValue(undefined),
		removeListener: vi.fn(),
		connected: false,
		accounts: [] as string[],
		chainId: 30,
		session: null as { topic: string } | null
	};

	const subtle = {
		importKey: vi.fn(),
		encrypt: vi.fn(),
		decrypt: vi.fn(),
		digest: vi.fn()
	};

	return { mockProvider: provider, mockCryptoSubtle: subtle };
});

const {
	mockEthersGetBalance,
	mockEthersCall,
	mockEncodeFunctionData: _mockEncodeFunctionData,
	mockDecodeFunctionResult,
	mockEthersBrowserProvider,
	mockEthersInterface
} = vi.hoisted(() => {
	const getBalance = vi.fn();
	const call = vi.fn();
	const browserProvider = vi.fn().mockImplementation(function () {
		return {
			getBalance,
			call
		};
	});
	const encodeFn = vi.fn().mockReturnValue('0x70a08231');
	const decodeFn = vi.fn();
	const iface = vi.fn().mockImplementation(function () {
		return {
			encodeFunctionData: encodeFn,
			decodeFunctionResult: decodeFn
		};
	});

	return {
		mockEthersGetBalance: getBalance,
		mockEthersCall: call,
		mockEthersBrowserProvider: browserProvider,
		mockEthersInterface: iface,
		mockEncodeFunctionData: encodeFn,
		mockDecodeFunctionResult: decodeFn
	};
});

// ---------------------------------------------------------------------------
// Mock @walletconnect/ethereum-provider
// ---------------------------------------------------------------------------

vi.mock('@walletconnect/ethereum-provider', () => ({
	EthereumProvider: {
		init: vi.fn(() => Promise.resolve(mockProvider))
	}
}));

// ---------------------------------------------------------------------------
// Mock ethers (used by fetchBalances for BrowserProvider + Interface)
// ---------------------------------------------------------------------------

vi.mock('ethers', () => ({
	ethers: {
		BrowserProvider: mockEthersBrowserProvider,
		Interface: mockEthersInterface
	}
}));

// ---------------------------------------------------------------------------
// Mock send-lock (imported by connector)
// ---------------------------------------------------------------------------

vi.mock('$lib/services/external-wallet/send-lock', () => ({
	sendLock: {
		acquire: vi.fn(),
		release: vi.fn(),
		isLocked: vi.fn().mockReturnValue(false)
	}
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupMockCrypto(): void {
	// crypto.subtle is used for AES-CBC encryption of session data
	Object.defineProperty(globalThis, 'crypto', {
		value: {
			subtle: mockCryptoSubtle,
			getRandomValues: (arr: Uint8Array) => {
				for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
				return arr;
			}
		},
		writable: true,
		configurable: true
	});

	// Default: importKey succeeds with a dummy key
	mockCryptoSubtle.importKey.mockResolvedValue({ type: 'secret', algorithm: { name: 'AES-CBC' } });
	// Default: encrypt returns an ArrayBuffer
	mockCryptoSubtle.encrypt.mockResolvedValue(new Uint8Array([1, 2, 3, 4]).buffer);
	// Default: decrypt returns decoded data
	mockCryptoSubtle.decrypt.mockImplementation(
		async (_algo: unknown, _key: unknown, _data: unknown) => {
			const encoder = new TextEncoder();
			return encoder.encode('mock-decrypted').buffer;
		}
	);
	// Default: digest returns a 32-byte buffer (SHA-256)
	mockCryptoSubtle.digest.mockResolvedValue(new Uint8Array(32).fill(0x42).buffer);
}

function resetMockProvider(): void {
	mockProvider.on.mockReset();
	mockProvider.connect.mockReset();
	mockProvider.disconnect.mockReset();
	mockProvider.removeListener.mockReset();
	mockProvider.connected = false;
	mockProvider.accounts = [];
	mockProvider.chainId = 30;
	mockProvider.session = null;
}

// ---------------------------------------------------------------------------
// Dynamic import helper — the module-level state (providerInstance, etc.)
// is per-process, so we re-import the module for each test to get a clean
// state. In practice we import once and manually reset state via disconnectWC().
// ---------------------------------------------------------------------------

// imported after hoisted mocks and vi.mock blocks
let connectWC: typeof import('$lib/services/external-wallet/walletconnect-connector').connectWC;
let restoreWCSession: typeof import('$lib/services/external-wallet/walletconnect-connector').restoreWCSession;
let disconnectWC: typeof import('$lib/services/external-wallet/walletconnect-connector').disconnectWC;
let isWCConnected: typeof import('$lib/services/external-wallet/walletconnect-connector').isWCConnected;
let getWCProvider: typeof import('$lib/services/external-wallet/walletconnect-connector').getWCProvider;

beforeAll(async () => {
	const mod = await import('$lib/services/external-wallet/walletconnect-connector');
	connectWC = mod.connectWC;
	restoreWCSession = mod.restoreWCSession;
	disconnectWC = mod.disconnectWC;
	isWCConnected = mod.isWCConnected;
	getWCProvider = mod.getWCProvider;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('walletconnect-connector', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetMockProvider();
		setupMockCrypto();

		// Configure Preferences mock for session persistence
		vi.mocked(Preferences.get).mockResolvedValue({ value: null });
		vi.mocked(Preferences.set).mockResolvedValue(undefined);
		vi.mocked(Preferences.remove).mockResolvedValue(undefined);

		// Ensure project ID is set
		vi.stubEnv('VITE_WALLETCONNECT_PROJECT_ID', 'test-project-id');
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		// Clean up any lingering provider connections
		await disconnectWC().catch(() => {});
	});

	// ── connectWC ────────────────────────────────────────────────────────

	describe('connectWC', () => {
		it('returns a ConnectorHandle with walletType "walletconnect" on successful pairing', async () => {
			mockProvider.accounts = ['0xDeadBeefDeadBeefDeadBeefDeadBeefDeadBeef01'];
			mockProvider.chainId = 30;
			mockProvider.connected = true;
			mockProvider.session = { topic: 'test-topic-123' };
			mockProvider.connect.mockResolvedValue(undefined);

			const onQRUri = vi.fn();
			const handle = await connectWC({}, onQRUri);

			expect(handle.walletType).toBe('walletconnect');
			expect(handle.walletName).toBe('WalletConnect');
			expect(handle.address).toBe('0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef01');
			expect(handle.chainIds).toContain(30);
		});

		it('fires the URI callback with a valid WC URI string', async () => {
			mockProvider.accounts = ['0xDeadBeefDeadBeefDeadBeefDeadBeefDeadBeef01'];
			mockProvider.chainId = 30;
			mockProvider.connected = true;
			mockProvider.session = { topic: 'test-topic' };

			// Simulate WalletConnect firing display_uri immediately during connect()
			mockProvider.connect.mockImplementation(() => {
				// Find and fire the display_uri handler registered via provider.on
				const displayUriCalls = mockProvider.on.mock.calls.filter(
					(c: unknown[]) => c[0] === 'display_uri'
				);
				if (displayUriCalls.length > 0) {
					const handler = displayUriCalls[0]![1] as (uri: string) => void;
					handler('wc:abc123@1?relay=wss://relay.walletconnect.com');
				}
				return Promise.resolve();
			});

			const onQRUri = vi.fn();
			await connectWC({}, onQRUri);

			expect(onQRUri).toHaveBeenCalled();
			const uri = onQRUri.mock.calls[0]?.[0];
			expect(typeof uri).toBe('string');
			expect(uri).toContain('wc:');
		});

		it('connection timeout produces appropriate error', async () => {
			vi.useFakeTimers();

			// connect will never resolve — only the timeout will fire
			mockProvider.connect.mockImplementation(() => new Promise(() => {}));
			mockProvider.accounts = [];
			mockProvider.chainId = 30;

			const onQRUri = vi.fn();
			const connectPromise = connectWC({}, onQRUri);

			// Catch the rejection early to prevent unhandled rejection
			const caught = connectPromise.catch((e: Error) => e);

			// Drain any microtasks queued during connectWC initialization
			await vi.runAllTicks();

			// Advance past the 120-second timeout (QR_TIMEOUT_MS)
			await vi.advanceTimersByTimeAsync(130_000);

			const error = await caught;
			expect((error as Error).message).toContain('timed out');

			vi.useRealTimers();
		});

		it('missing project ID environment variable produces error', () => {
			vi.stubEnv('VITE_WALLETCONNECT_PROJECT_ID', '');

			const onQRUri = vi.fn();
			expect(connectWC({}, onQRUri)).rejects.toThrow('projectId is required');
		});

		it('no accounts returned after connect produces error', async () => {
			mockProvider.accounts = [];
			mockProvider.connect.mockResolvedValue(undefined);

			const onQRUri = vi.fn();
			await expect(connectWC({}, onQRUri)).rejects.toThrow('No accounts returned');
		});
	});

	// ── restoreWCSession ─────────────────────────────────────────────────

	describe('restoreWCSession', () => {
		it('restores previous session successfully when stored data exists and provider reconnects', async () => {
			// Set up stored session data
			const sessionData = {
				topic: 'saved-topic',
				accounts: ['0xAbcdefAbcdefAbcdefAbcdefAbcdefAbcdef0001'],
				chainId: 31,
				connectedAt: Date.now()
			};
			const sessionJson = JSON.stringify(sessionData);

			// Build a valid encrypted blob: [16-byte IV][session JSON]
			// This must survive atob() in decryptText, so base64-encode it
			const encoder = new TextEncoder();
			const dataBytes = encoder.encode(sessionJson);
			const iv = new Uint8Array(16);
			const combined = new Uint8Array(iv.length + dataBytes.length);
			combined.set(iv, 0);
			combined.set(dataBytes, iv.length);
			let binary = '';
			for (let i = 0; i < combined.length; i++) {
				binary += String.fromCharCode(combined[i]!);
			}
			const validBase64Encrypted = btoa(binary);

			// Mock crypto.subtle.decrypt to return just the data portion (after the IV)
			mockCryptoSubtle.decrypt.mockImplementationOnce(
				async (_algo: unknown, _key: unknown, _data: unknown) => {
					return dataBytes.buffer;
				}
			);

			// Mock Preferences.get returns a valid stored session
			vi.mocked(Preferences.get).mockResolvedValueOnce({
				value: JSON.stringify({ version: 1, encrypted: validBase64Encrypted })
			});

			// Provider appears connected after init
			mockProvider.connected = true;
			mockProvider.accounts = ['0xAbcdefAbcdefAbcdefAbcdefAbcdefAbcdef0001'];
			mockProvider.chainId = 31;
			mockProvider.session = { topic: 'saved-topic' };

			const onEvent = vi.fn();
			const handle = await restoreWCSession(onEvent);

			expect(handle).not.toBeNull();
			expect(handle!.walletType).toBe('walletconnect');
			expect(handle!.address).toBe('0xabcdefabcdefabcdefabcdefabcdefabcdef0001');
		});

		it('returns null when no previous session exists', async () => {
			vi.mocked(Preferences.get).mockResolvedValue({ value: null });

			const result = await restoreWCSession();
			expect(result).toBeNull();
		});

		it('returns null when session data is corrupted (clears storage)', async () => {
			// Return a value that can't be parsed as valid session data
			vi.mocked(Preferences.get).mockResolvedValueOnce({
				value: JSON.stringify({ version: 1, encrypted: 'garbage-not-valid-encrypted' })
			});

			// Decryption fails
			mockCryptoSubtle.decrypt.mockRejectedValueOnce(new Error('Failed to decrypt'));

			const result = await restoreWCSession();
			expect(result).toBeNull();
			// Should have cleared the corrupted data
			expect(Preferences.remove).toHaveBeenCalled();
		});

		it('returns null after exhausting all reconnect retries (provider never connects)', async () => {
			// Build a valid stored session
			const sessionData = {
				topic: 'stale-topic',
				accounts: ['0xDeadDeadDeadDeadDeadDeadDeadDeadDeadDead0001'],
				chainId: 30,
				connectedAt: Date.now() - 86400000
			};
			const sessionJson = JSON.stringify(sessionData);
			const encoder = new TextEncoder();
			const dataBytes = encoder.encode(sessionJson);
			const combined = new Uint8Array(16 + dataBytes.length);
			combined.set(dataBytes, 16); // skip IV, write data at offset 16
			let binary = '';
			for (let i = 0; i < combined.length; i++) {
				binary += String.fromCharCode(combined[i]!);
			}
			const validBase64 = btoa(binary);

			mockCryptoSubtle.decrypt.mockImplementationOnce(async () => dataBytes.buffer);

			vi.mocked(Preferences.get).mockResolvedValueOnce({
				value: JSON.stringify({ version: 1, encrypted: validBase64 })
			});

			// Provider appears inactive — no auto-restore, and reconnect always fails
			mockProvider.connected = false;
			mockProvider.accounts = [];
			mockProvider.session = null;
			// Each connect({pairingTopic}) call will throw
			mockProvider.connect.mockRejectedValue(new Error('Session expired'));

			vi.useFakeTimers();
			const restorePromise = restoreWCSession();

			// restoreWCSession loops 5 times with exponential backoff delays:
			// attempt 0: delay 1s, attempt 1: 2s, attempt 2: 4s, attempt 3: 8s
			// Total delay: ~15s. Advance in increments to let each delay resolve.
			for (let i = 0; i < 10; i++) {
				await vi.advanceTimersByTimeAsync(5_000);
				// Let any pending microtasks flush between timer advances
				await Promise.resolve();
			}

			const result = await restorePromise;
			expect(result).toBeNull();
			expect(Preferences.remove).toHaveBeenCalled();
			vi.useRealTimers();
		});
	});

	// ── disconnectWC ─────────────────────────────────────────────────────

	describe('disconnectWC', () => {
		it('disconnects the provider and clears stored session', async () => {
			// First, connect to set up provider instance
			mockProvider.accounts = ['0xDeadBeefDeadBeefDeadBeefDeadBeefDeadBeef01'];
			mockProvider.chainId = 30;
			mockProvider.connected = true;
			mockProvider.session = { topic: 'test' };
			mockProvider.connect.mockResolvedValue(undefined);

			const onQRUri = vi.fn();
			await connectWC({}, onQRUri);

			expect(isWCConnected()).toBe(true);

			// Now disconnect
			await disconnectWC();

			expect(mockProvider.disconnect).toHaveBeenCalled();
			expect(Preferences.remove).toHaveBeenCalled();
			expect(isWCConnected()).toBe(false);
		});

		it('is safe to call when no provider exists', async () => {
			await disconnectWC();
			// Should not throw
			expect(isWCConnected()).toBe(false);
		});
	});

	// ── isWCConnected / getWCProvider ────────────────────────────────────

	describe('isWCConnected and getWCProvider', () => {
		it('returns false / null when not connected', () => {
			expect(isWCConnected()).toBe(false);
			expect(getWCProvider()).toBeNull();
		});

		it('returns true / provider after successful connect', async () => {
			mockProvider.accounts = ['0xDeadBeefDeadBeefDeadBeefDeadBeefDeadBeef01'];
			mockProvider.chainId = 30;
			mockProvider.connected = true;
			mockProvider.session = { topic: 'active-topic' };
			mockProvider.connect.mockResolvedValue(undefined);

			const onQRUri = vi.fn();
			await connectWC({}, onQRUri);

			expect(isWCConnected()).toBe(true);
			expect(getWCProvider()).toBeDefined();
		});
	});

	// ── fetchBalances ────────────────────────────────────────────────────

	describe('fetchBalances', () => {
		const WC_ADDRESS = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef01';

		beforeEach(() => {
			// Set up provider to appear connected (required for connectWC to succeed)
			mockProvider.accounts = [WC_ADDRESS];
			mockProvider.chainId = 30;
			mockProvider.connected = true;
			mockProvider.session = { topic: 'fetch-balances-session' };
			mockProvider.connect.mockResolvedValue(undefined);

			// Default ethers mock: getBalance returns 1 RBTC in wei (1e18)
			mockEthersGetBalance.mockResolvedValue(1_000_000_000_000_000_000n);
			// Default: call returns mock hex
			mockEthersCall.mockResolvedValue(
				'0x0000000000000000000000000000000000000000000000000de0b6b3a7640000'
			);
			// Default: decodeFunctionResult returns 1 token unit
			mockDecodeFunctionResult.mockReturnValue([1_000_000_000_000_000_000n]);
			// Default: BrowserProvider constructor succeeds
			mockEthersBrowserProvider.mockImplementation(function () {
				return {
					getBalance: mockEthersGetBalance,
					call: mockEthersCall
				};
			});
		});

		/**
		 * Connect WC with optional chains, then call fetchBalances.
		 * Assumes beforeEach has set up mockProvider for successful connect.
		 */
		async function connectAndFetch(
			chains: number[] = [30]
		): Promise<Record<string, { raw: string; formatted: string; loading: boolean }>> {
			const onQRUri = vi.fn();
			const handle = await connectWC({ chains }, onQRUri);
			expect(handle.fetchBalances).toBeDefined();
			return handle.fetchBalances!();
		}

		it('returns rbtc balance from provider.getBalance', async () => {
			const balances = await connectAndFetch([30]);

			expect(mockEthersGetBalance).toHaveBeenCalledWith(WC_ADDRESS);
			expect(balances.rbtc).toBeDefined();
			// 1e18 wei / 1e10 = 1e8 sats = 100,000,000
			expect(balances.rbtc!.raw).toBe('100000000');
			expect(balances.rbtc!.formatted).toBe('100,000,000 Sats');
			expect(balances.rbtc!.loading).toBe(false);
		});

		it('returns usdt balance from ERC-20 call on BSC chain', async () => {
			// 1 USDT (1e18 raw, 18 decimals → human = 1.0)
			mockDecodeFunctionResult.mockReturnValue([1_000_000_000_000_000_000n]);

			const balances = await connectAndFetch([30, 56]);

			expect(mockEthersCall).toHaveBeenCalled();
			const callArg = vi.mocked(mockEthersCall).mock.calls[0]?.[0] as
				| Record<string, unknown>
				| undefined;
			expect(callArg).toBeDefined();
			// Should be calling the BSC USDT contract
			expect(callArg!.to).toBe('0x55d398326f99059fF775485246999027B3197955');
			expect(callArg!.data).toBe('0x70a08231');

			expect(balances.usdt).toBeDefined();
			expect(balances.usdt!.raw).toBe('1000000000000000000');
			expect(balances.usdt!.formatted).toBe('$1.00');
			expect(balances.usdt!.loading).toBe(false);
		});

		it('returns wbtc balance when Arbitrum chain in session', async () => {
			// 0.5 WBTC (50_000_000 raw, 8 decimals → human = 0.5)
			mockDecodeFunctionResult.mockReturnValue([50_000_000n]);

			const balances = await connectAndFetch([30, 42161]);

			expect(balances.wbtc).toBeDefined();
			expect(balances.wbtc!.raw).toBe('50000000');
			expect(balances.wbtc!.formatted).toBe('0.50000000 WBTC');
			expect(balances.wbtc!.loading).toBe(false);
		});

		it('returns no rbtc when getBalance throws, other tokens still work', async () => {
			mockEthersGetBalance.mockRejectedValue(new Error('RPC unavailable'));
			mockDecodeFunctionResult.mockReturnValue([1_000_000_000_000_000_000n]);

			const balances = await connectAndFetch([30, 56]);

			expect(balances.rbtc).toBeUndefined();
			// USDT should still succeed independently
			expect(balances.usdt).toBeDefined();
		});

		it('returns no balance for a token when ERC-20 call throws', async () => {
			mockEthersCall.mockRejectedValue(new Error('BSC RPC call failed'));

			const balances = await connectAndFetch([30, 56]);

			// rbtc (getBalance) should still succeed
			expect(balances.rbtc).toBeDefined();
			// USDT (via call) should fail gracefully
			expect(balances.usdt).toBeUndefined();
		});

		it('returns empty object when ethers provider is null', async () => {
			// Simulate BrowserProvider constructor throwing, leaving providerField null
			mockEthersBrowserProvider.mockImplementation(() => {
				throw new Error('BrowserProvider not available');
			});

			const balances = await connectAndFetch([30]);

			expect(Object.keys(balances)).toHaveLength(0);
			expect(mockEthersGetBalance).not.toHaveBeenCalled();
			expect(mockEthersCall).not.toHaveBeenCalled();
		});

		it('formats rbtc balance correctly — raw value and formatted string with thousands separator', async () => {
			// 0.5 RBTC = 5e17 wei → 5e17/1e10 = 5e7 = 50,000,000 sats
			mockEthersGetBalance.mockResolvedValue(500_000_000_000_000_000n);

			const balances = await connectAndFetch([30]);

			expect(balances.rbtc!.raw).toBe('50000000');
			expect(balances.rbtc!.formatted).toBe('50,000,000 Sats');
			expect(balances.rbtc!.loading).toBe(false);
		});

		it('does not query rbtc when RSK chain is not in session', async () => {
			// Override mockProvider chainId to 56 so fetchBalancesChainIds = [56] (no RSK)
			mockProvider.chainId = 56;

			const balances = await connectAndFetch([56]);

			expect(mockEthersGetBalance).not.toHaveBeenCalled();
			expect(balances.rbtc).toBeUndefined();
		});

		it('returns only rbtc when no ERC-20 chains are in session', async () => {
			const balances = await connectAndFetch([30]);

			expect(balances.rbtc).toBeDefined();
			expect(balances.usdt).toBeUndefined();
			expect(balances.wbtc).toBeUndefined();
		});
	});
});
