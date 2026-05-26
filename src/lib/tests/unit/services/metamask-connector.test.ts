/**
 * MetaMask Connector — Unit Tests
 *
 * Tests what CAN be tested without running the actual @metamask/connect-multichain SDK:
 *  1. chain-utils re-exports (encodeERC20Transfer, getBSCUSDTContractAddress, getChainIdForNetwork)
 *  2. ConnectMetaMaskConfig type interface shape
 *  3. connectMetaMask error paths:
 *     a. Session timeout produces correct error message
 *     b. Empty accounts throws correct error
 *  4. fetchBalances edge cases:
 *     a. Empty result when no matching chainIds are provided
 *     b. Individual RPC failures do not crash the overall fetch
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { connectMetaMask } from '$lib/services/external-wallet/metamask-connector';
import {
	encodeERC20Transfer,
	getBSCUSDTContractAddress,
	getChainIdForNetwork
} from '$lib/services/external-wallet/chain-utils';
import { ConnectorRegistry } from '$lib/services/external-wallet/connector-registry';
import type { ConnectMetaMaskConfig } from '$lib/services/external-wallet/metamask-connector';

// ---------------------------------------------------------------------------
// Mock @metamask/connect-multichain
//
// The connector lazily imports the SDK via await import() inside getClient().
// vi.mock replaces the module at the vitest registry so that both static
// and dynamic imports resolve to our fake.
// ---------------------------------------------------------------------------

const { mockClient } = vi.hoisted(() => {
	const client = {
		on: vi.fn(),
		connect: vi.fn(),
		invokeMethod: vi.fn(),
		disconnect: vi.fn(),
		status: 'connected'
	};
	return { mockClient: client };
});

vi.mock('@metamask/connect-multichain', () => ({
	createMultichainClient: vi.fn(() => Promise.resolve(mockClient))
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(): ConnectMetaMaskConfig {
	return {
		registry: new ConnectorRegistry(),
		onEvent: vi.fn()
	};
}

/** Fire the wallet_sessionChanged callback registered by connectMetaMask. */
function fireSessionEvent(scopes?: Record<string, { accounts?: string[] }>): void {
	const call = mockClient.on.mock.calls.find(
		(call: unknown[]) => call[0] === 'wallet_sessionChanged'
	);
	if (!call) {
		throw new Error('wallet_sessionChanged listener was not registered');
	}
	const callback = call[1] as (...args: unknown[]) => void;
	if (scopes) {
		callback({ sessionScopes: scopes });
	} else {
		// Default: valid session with RSK mainnet + BSC mainnet
		callback({
			sessionScopes: {
				'eip155:30': {
					accounts: ['eip155:30:0x1234567890abcdef1234567890abcdef12345678']
				},
				'eip155:56': {
					accounts: ['eip155:56:0x1234567890abcdef1234567890abcdef12345678']
				}
			}
		});
	}
}

/**
 * Flush pending microtasks so that the SUT's async function progresses
 * past its await points (getClient, connect, etc.) and reaches the
 * sessionPromise await where we can fire the session event.
 */
async function flush(): Promise<void> {
	for (let i = 0; i < 20; i++) {
		await Promise.resolve();
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('metamask-connector', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv('VITE_RSK_NETWORK', 'testnet');
		vi.stubEnv('VITE_BSC_NETWORK', 'testnet');
		// Clear any per-test configuration on the shared mock client
		mockClient.invokeMethod.mockReset();
		mockClient.status = 'connected';
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// -----------------------------------------------------------------------
	// chain-utils re-exports
	// -----------------------------------------------------------------------
	describe('chain-utils re-exports', () => {
		it('should re-export encodeERC20Transfer and produce correct encoding', () => {
			const result = encodeERC20Transfer('0x742d35cc6634c0532925a3b844bc9e7595f12bed', 1n);
			expect(result).toBe(
				'0xa9059cbb' +
					'000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f12bed' +
					'0000000000000000000000000000000000000000000000000000000000000001'
			);
		});

		it('encodeERC20Transfer output has correct structure and length', () => {
			const result = encodeERC20Transfer('0x742d35cc6634c0532925a3b844bc9e7595f12bed', 1n);
			// 0x (2) + methodId (8) + address padded (64) + amount padded (64) = 138
			expect(result.startsWith('0x')).toBe(true);
			expect(result.length).toBe(138);
			expect(result).toMatch(/^0x[a-fA-F0-9]{136}$/);
		});

		it('encodeERC20Transfer with zero amount', () => {
			const result = encodeERC20Transfer('0x742d35cc6634c0532925a3b844bc9e7595f12bed', 0n);
			expect(result).toBe(
				'0xa9059cbb' +
					'000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f12bed' +
					'0000000000000000000000000000000000000000000000000000000000000000'
			);
		});

		it('should re-export getBSCUSDTContractAddress', () => {
			const addr = getBSCUSDTContractAddress();
			expect(addr).toMatch(/^0x[a-fA-F0-9]{40}$/);
			expect(addr.length).toBe(42);
		});

		it('getBSCUSDTContractAddress returns testnet address by default (testnet env)', () => {
			const addr = getBSCUSDTContractAddress();
			expect(addr).toBe('0x337610d27c682E347C9cD60BD4b3b107C9d34dDd');
		});

		it('getBSCUSDTContractAddress returns mainnet address when BSC_NETWORK=mainnet', () => {
			vi.stubEnv('VITE_BSC_NETWORK', 'mainnet');
			const addr = getBSCUSDTContractAddress();
			expect(addr).toBe('0x55d398326f99059ff775485246999027b3197955');
		});

		it('should re-export getChainIdForNetwork', () => {
			const id = getChainIdForNetwork('rootstock-bitcoin');
			expect(typeof id).toBe('number');
		});

		it('getChainIdForNetwork returns 31 for RSK testnet in default env', () => {
			expect(getChainIdForNetwork('rootstock-bitcoin')).toBe(31);
		});

		it('getChainIdForNetwork returns 97 for BSC testnet in default env', () => {
			expect(getChainIdForNetwork('usdt-bsc')).toBe(97);
		});

		it('all three chain-utils functions are exported as named exports', () => {
			// Runtime check that all three are actually functions
			expect(typeof encodeERC20Transfer).toBe('function');
			expect(typeof getBSCUSDTContractAddress).toBe('function');
			expect(typeof getChainIdForNetwork).toBe('function');
		});
	});

	// -----------------------------------------------------------------------
	// ConnectMetaMaskConfig type interface shape
	// -----------------------------------------------------------------------
	describe('ConnectMetaMaskConfig type', () => {
		it('should accept a valid config object with registry and onEvent', () => {
			const config: ConnectMetaMaskConfig = {
				registry: new ConnectorRegistry(),
				onEvent: vi.fn()
			};
			expect(config.registry).toBeInstanceOf(ConnectorRegistry);
			expect(typeof config.onEvent).toBe('function');
		});

		it('should accept onEvent that receives an event object', () => {
			const onEvent = vi.fn();
			const config: ConnectMetaMaskConfig = {
				registry: new ConnectorRegistry(),
				onEvent
			};
			// Simulate firing an event
			config.onEvent({ type: 'connected', accounts: ['0x1234'], chainId: 30 });
			expect(onEvent).toHaveBeenCalledWith({
				type: 'connected',
				accounts: ['0x1234'],
				chainId: 30
			});
		});
	});

	// -----------------------------------------------------------------------
	// connectMetaMask error paths
	// -----------------------------------------------------------------------
	describe('connectMetaMask error paths', () => {
		it('should reject with session timeout error when session event never fires', async () => {
			vi.useFakeTimers();

			const promise = connectMetaMask(makeConfig());

			// Let the initial async chain resolve (getClient, connect)
			// so connectMetaMask reaches await sessionPromise
			await flush();

			// Attach a noop catch handler to suppress vitest's unhandled
			// rejection detector, which fires synchronously during fake
			// timer advancement BEFORE the rejection propagates through
			// the await in connectMetaMask.
			promise.catch(() => {});

			// Advance past the 10-second timeout
			await vi.advanceTimersByTimeAsync(10_001);

			// One more microtask for the rejection to propagate through
			// the await chain from sessionPromise to the returned promise.
			await Promise.resolve();

			await expect(promise).rejects.toThrow('Session data timeout — try again');

			vi.useRealTimers();
		});

		it('should reject with "No accounts authorized" when session has empty accounts', async () => {
			const promise = connectMetaMask(makeConfig());
			await flush();

			// Fire session with empty accounts
			fireSessionEvent({
				'eip155:30': { accounts: [] }
			});

			await expect(promise).rejects.toThrow('No accounts authorized');
		});

		it('should reject with "No accounts authorized" when sessionScopes is empty', async () => {
			const promise = connectMetaMask(makeConfig());
			await flush();

			// Fire session with no scopes at all (accounts will be empty)
			fireSessionEvent({});

			await expect(promise).rejects.toThrow('No accounts authorized');
		});
	});

	// -----------------------------------------------------------------------
	// fetchBalances edge cases
	// -----------------------------------------------------------------------
	// The real connectMetaMask returns ConnectorHandle & { fetchBalances?: ... }
	// — cast here so test code can access fetchBalances without per-line assertions.
	type HandleWithBalances = Awaited<ReturnType<typeof connectMetaMask>> & {
		fetchBalances(): Promise<Record<string, { raw: string; formatted: string; loading: boolean }>>;
	};

	describe('fetchBalances', () => {
		it('should return empty result when no matching chainIds are provided', async () => {
			const promise = connectMetaMask(makeConfig());
			await flush();

			// Session with chain 999 — not RSK (30/31) or BSC (56/97)
			fireSessionEvent({
				'eip155:999': {
					accounts: ['eip155:999:0x1234567890abcdef1234567890abcdef12345678']
				}
			});

			const handle = await promise;
			const balances = await (handle as HandleWithBalances).fetchBalances();

			expect(balances).toEqual({});
		});

		it('should return empty result for a chainId that exists but is neither RSK nor BSC', async () => {
			const promise = connectMetaMask(makeConfig());
			await flush();

			// Session with Ethereum mainnet (chain 1) — not RSK or BSC
			fireSessionEvent({
				'eip155:1': {
					accounts: ['eip155:1:0x1234567890abcdef1234567890abcdef12345678']
				}
			});

			const handle = await promise;
			const balances = await (handle as HandleWithBalances).fetchBalances();

			expect(balances).toEqual({});
		});

		it('should handle individual chain RPC errors gracefully without crashing', async () => {
			const promise = connectMetaMask(makeConfig());
			await flush();

			// Valid session with RSK (30) and BSC (56)
			fireSessionEvent();

			const handle = await promise;

			// Make BSC RPC fail, RSK succeed
			mockClient.invokeMethod.mockImplementation((params: { scope: string }) => {
				if (params.scope === 'eip155:56') {
					return Promise.reject(new Error('BSC RPC timeout'));
				}
				return Promise.resolve('0x0');
			});

			const balances = await (handle as HandleWithBalances).fetchBalances();

			// RSK balance should still be returned despite BSC failure
			expect(balances.rbtc).toBeDefined();
			expect(balances.rbtc.loading).toBe(false);
			expect(balances.rbtc.formatted).toContain('Sats');
			// USDT should be absent since BSC chain failed
			expect(balances.usdt).toBeUndefined();
		});

		it('should handle all chains failing gracefully and return empty', async () => {
			const promise = connectMetaMask(makeConfig());
			await flush();

			fireSessionEvent();

			const handle = await promise;

			// Make ALL RPCs fail
			mockClient.invokeMethod.mockRejectedValue(new Error('Network error'));

			const balances = await (handle as HandleWithBalances).fetchBalances();

			// Both balances should be undefined, but no crash
			expect(balances.rbtc).toBeUndefined();
			expect(balances.usdt).toBeUndefined();
			expect(balances).toEqual({});
		});

		it('should compute rBTC balance correctly for a nonzero balance', async () => {
			const promise = connectMetaMask(makeConfig());
			await flush();

			fireSessionEvent();

			const handle = await promise;

			// Return 1 RBTC in wei (1e18 wei → 10^8 sats → 100_000_000 sats)
			const oneRbtcWei = '0x0de0b6b3a7640000';
			mockClient.invokeMethod.mockImplementation(
				(params: { scope: string; request: { method: string } }) => {
					if (params.scope === 'eip155:30' && params.request.method === 'eth_getBalance') {
						return Promise.resolve(oneRbtcWei);
					}
					return Promise.resolve('0x0');
				}
			);

			const balances = await (handle as HandleWithBalances).fetchBalances();

			expect(balances.rbtc).toBeDefined();
			expect(balances.rbtc.raw).toBe('100000000');
			expect(balances.rbtc.formatted).toContain('100,000,000 Sats');
		});

		it('should compute USDT balance correctly for a nonzero balance', async () => {
			const promise = connectMetaMask(makeConfig());
			await flush();

			fireSessionEvent();

			const handle = await promise;

			// Return 100 USDT (100 * 1e18 wei)
			const oneHundredUsdtWei = '0x056bc75e2d63100000';
			mockClient.invokeMethod.mockImplementation(
				(params: { scope: string; request: { method: string } }) => {
					if (params.scope === 'eip155:56' && params.request.method === 'eth_call') {
						return Promise.resolve(oneHundredUsdtWei);
					}
					return Promise.resolve('0x0');
				}
			);

			const balances = await (handle as HandleWithBalances).fetchBalances();

			expect(balances.usdt).toBeDefined();
			expect(balances.usdt.raw).toBe('100000000000000000000');
			expect(balances.usdt.formatted).toContain('$100.00');
		});
	});
});
