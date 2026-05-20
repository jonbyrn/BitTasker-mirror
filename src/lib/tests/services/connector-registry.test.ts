/**
 * Tests for ConnectorRegistry and selectSigner
 *
 * Covers:
 *  - ConnectorRegistry: register, unregister, get, has, list, size, clear
 *  - Duplicate register throws
 *  - Unregister idempotent for missing IDs
 *  - clear() calls unsubscribe on all handles
 *  - selectSigner: valid source, missing source, missing EVM/Bitcoin signer
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectorRegistry, selectSigner } from '$lib/services/external-wallet/connector-registry';
import {
	WalletNotConnectedError,
	EVMSignerNotAvailableError,
	BitcoinSignerNotAvailableError,
	type ConnectorHandle,
	type EVMSigner,
	type BitcoinSigner,
	type ConnectorEventCallback
} from '$lib/services/external-wallet/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockEVMSigner(overrides: Partial<EVMSigner> = {}): EVMSigner {
	return {
		type: 'evm' as const,
		label: 'MetaMask',
		address: '0x1234567890abcdef1234567890abcdef12345678',
		chainId: 30,
		sendTransaction: vi.fn().mockResolvedValue({ txHash: '0xtx', from: '', chainId: 30 }),
		getAddress: vi.fn().mockReturnValue('0x1234567890abcdef1234567890abcdef12345678'),
		isConnected: vi.fn().mockReturnValue(true),
		...overrides
	};
}

function createMockBitcoinSigner(overrides: Partial<BitcoinSigner> = {}): BitcoinSigner {
	return {
		type: 'bitcoin' as const,
		label: 'Trezor BTC',
		address: 'bc1q...',
		xpub: 'xpub6...',
		derivationPath: "m/84'/0'/0'/0/0",
		sendBitcoin: vi.fn().mockResolvedValue({
			txHash: '0xbtctx',
			signedPSBT: 'psbt...',
			fee: 1000n,
			change: 5000n,
			inputs: [],
			outputs: []
		}),
		signPSBT: vi.fn().mockResolvedValue('signed-psbt'),
		getXPUB: vi.fn().mockReturnValue('xpub6...'),
		getAddress: vi.fn().mockReturnValue('bc1q...'),
		deriveChangeAddress: vi.fn().mockReturnValue('bc1q...'),
		isConnected: vi.fn().mockReturnValue(true),
		...overrides
	};
}

function createMockHandle(overrides: Partial<ConnectorHandle> = {}): ConnectorHandle {
	return {
		id: 'test-metamask',
		walletName: 'MetaMask',
		walletType: 'metamask',
		address: '0x1234567890abcdef1234567890abcdef12345678',
		chainIds: [30],
		evmSigner: createMockEVMSigner(),
		provider: null,
		onEvent: vi.fn() as ConnectorEventCallback,
		unsubscribe: vi.fn(),
		...overrides
	};
}

// ---------------------------------------------------------------------------
// ConnectorRegistry
// ---------------------------------------------------------------------------

describe('ConnectorRegistry', () => {
	let registry: ConnectorRegistry;

	beforeEach(() => {
		registry = new ConnectorRegistry();
	});

	// ── register ────────────────────────────────────────────────────────

	describe('register', () => {
		it('adds a handle and makes it accessible via get', () => {
			const handle = createMockHandle({ id: 'wallet-a' });
			registry.register(handle);
			expect(registry.get('wallet-a')).toBe(handle);
		});

		it('throws when registering a duplicate ID', () => {
			const handle = createMockHandle({ id: 'dup' });
			registry.register(handle);
			expect(() => registry.register(handle)).toThrow('Connector already registered: dup');
		});

		it('increments size', () => {
			registry.register(createMockHandle({ id: 'a' }));
			registry.register(createMockHandle({ id: 'b' }));
			expect(registry.size).toBe(2);
		});

		it('registers handles without EVM signer', () => {
			const handle = createMockHandle({ id: 'btc-only', evmSigner: undefined });
			registry.register(handle);
			expect(registry.has('btc-only')).toBe(true);
		});

		it('registers handles without Bitcoin signer', () => {
			const handle = createMockHandle({ id: 'evm-only' });
			registry.register(handle);
			expect(registry.has('evm-only')).toBe(true);
		});
	});

	// ── unregister ──────────────────────────────────────────────────────

	describe('unregister', () => {
		it('removes a registered handle and calls unsubscribe', () => {
			const unsubscribe = vi.fn();
			const handle = createMockHandle({ id: 'wallet-a', unsubscribe });
			registry.register(handle);

			registry.unregister('wallet-a');

			expect(registry.has('wallet-a')).toBe(false);
			expect(unsubscribe).toHaveBeenCalledTimes(1);
		});

		it('is idempotent for non-existent IDs (does not throw)', () => {
			expect(() => registry.unregister('i-dont-exist')).not.toThrow();
		});

		it('decrements size', () => {
			registry.register(createMockHandle({ id: 'a' }));
			registry.register(createMockHandle({ id: 'b' }));
			registry.unregister('a');
			expect(registry.size).toBe(1);
		});

		it('does not call unsubscribe for non-existent IDs', () => {
			const unsubscribe = vi.fn();
			const handle = createMockHandle({ id: 'keep', unsubscribe });
			registry.register(handle);

			registry.unregister('nope');

			expect(unsubscribe).not.toHaveBeenCalled();
		});
	});

	// ── get ─────────────────────────────────────────────────────────────

	describe('get', () => {
		it('returns the handle for a registered ID', () => {
			const handle = createMockHandle({ id: 'wallet-a' });
			registry.register(handle);
			expect(registry.get('wallet-a')).toBe(handle);
		});

		it('returns undefined for a missing ID', () => {
			expect(registry.get('missing')).toBeUndefined();
		});

		it('returns undefined after unregister', () => {
			registry.register(createMockHandle({ id: 'bye' }));
			registry.unregister('bye');
			expect(registry.get('bye')).toBeUndefined();
		});
	});

	// ── has ─────────────────────────────────────────────────────────────

	describe('has', () => {
		it('returns true for a registered ID', () => {
			registry.register(createMockHandle({ id: 'present' }));
			expect(registry.has('present')).toBe(true);
		});

		it('returns false for a missing ID', () => {
			expect(registry.has('absent')).toBe(false);
		});
	});

	// ── list ────────────────────────────────────────────────────────────

	describe('list', () => {
		it('returns an empty array when nothing is registered', () => {
			expect(registry.list()).toEqual([]);
		});

		it('returns all registered handles', () => {
			const a = createMockHandle({ id: 'a' });
			const b = createMockHandle({ id: 'b' });
			registry.register(a);
			registry.register(b);
			expect(registry.list()).toEqual([a, b]);
		});

		it('returns a copy (mutating returned array does not affect registry)', () => {
			registry.register(createMockHandle({ id: 'a' }));
			const list = registry.list();
			list.length = 0;
			expect(registry.size).toBe(1);
		});
	});

	// ── size ────────────────────────────────────────────────────────────

	describe('size', () => {
		it('starts at 0', () => {
			expect(registry.size).toBe(0);
		});

		it('reflects the number of registered connectors', () => {
			registry.register(createMockHandle({ id: 'a' }));
			registry.register(createMockHandle({ id: 'b' }));
			registry.register(createMockHandle({ id: 'c' }));
			expect(registry.size).toBe(3);
			registry.unregister('a');
			expect(registry.size).toBe(2);
		});
	});

	// ── clear ───────────────────────────────────────────────────────────

	describe('clear', () => {
		it('removes all handles', () => {
			registry.register(createMockHandle({ id: 'a' }));
			registry.register(createMockHandle({ id: 'b' }));
			registry.clear();
			expect(registry.size).toBe(0);
			expect(registry.list()).toEqual([]);
		});

		it('calls unsubscribe on every registered handle', () => {
			const unsubA = vi.fn();
			const unsubB = vi.fn();
			registry.register(createMockHandle({ id: 'a', unsubscribe: unsubA }));
			registry.register(createMockHandle({ id: 'b', unsubscribe: unsubB }));

			registry.clear();

			expect(unsubA).toHaveBeenCalledTimes(1);
			expect(unsubB).toHaveBeenCalledTimes(1);
		});

		it('is safe to call on an empty registry', () => {
			expect(() => registry.clear()).not.toThrow();
		});
	});
});

// ---------------------------------------------------------------------------
// selectSigner
// ---------------------------------------------------------------------------

describe('selectSigner', () => {
	let registry: ConnectorRegistry;

	beforeEach(() => {
		registry = new ConnectorRegistry();
	});

	it('returns the EVM signer for an EVM chain (rsk)', () => {
		const evmSigner = createMockEVMSigner({ chainId: 30 });
		const handle = createMockHandle({ id: 'wallet', evmSigner });
		registry.register(handle);

		const result = selectSigner(registry, 'wallet', 'rsk');
		expect(result).toBe(evmSigner);
		expect(result.type).toBe('evm');
	});

	it('returns the EVM signer for bsc chain', () => {
		const evmSigner = createMockEVMSigner({ chainId: 56 });
		const handle = createMockHandle({ id: 'wallet', evmSigner });
		registry.register(handle);

		const result = selectSigner(registry, 'wallet', 'bsc');
		expect(result).toBe(evmSigner);
	});

	it('returns the EVM signer for ethereum chain', () => {
		const evmSigner = createMockEVMSigner({ chainId: 1 });
		const handle = createMockHandle({ id: 'wallet', evmSigner });
		registry.register(handle);

		const result = selectSigner(registry, 'wallet', 'ethereum');
		expect(result).toBe(evmSigner);
	});

	it('returns the Bitcoin signer for bitcoin chain', () => {
		const bitcoinSigner = createMockBitcoinSigner();
		const handle = createMockHandle({ id: 'btc-wallet', evmSigner: undefined, bitcoinSigner });
		registry.register(handle);

		const result = selectSigner(registry, 'btc-wallet', 'bitcoin');
		expect(result).toBe(bitcoinSigner);
		expect(result.type).toBe('bitcoin');
	});

	it('throws WalletNotConnectedError when source ID is not found', () => {
		expect(() => selectSigner(registry, 'i-dont-exist', 'rsk')).toThrow(WalletNotConnectedError);
	});

	it('throws WalletNotConnectedError with the source ID in the message', () => {
		try {
			selectSigner(registry, 'missing-id', 'rsk');
		} catch (e) {
			expect(e).toBeInstanceOf(WalletNotConnectedError);
			expect((e as WalletNotConnectedError).message).toContain('missing-id');
		}
	});

	it('throws EVMSignerNotAvailableError when handle has no EVM signer on EVM chain', () => {
		const handle = createMockHandle({ id: 'no-evm', evmSigner: undefined });
		registry.register(handle);

		expect(() => selectSigner(registry, 'no-evm', 'rsk')).toThrow(EVMSignerNotAvailableError);
	});

	it('throws EVMSignerNotAvailableError with the source ID in the message', () => {
		const handle = createMockHandle({ id: 'no-evm', evmSigner: undefined });
		registry.register(handle);

		try {
			selectSigner(registry, 'no-evm', 'rsk');
		} catch (e) {
			expect(e).toBeInstanceOf(EVMSignerNotAvailableError);
			expect((e as EVMSignerNotAvailableError).message).toContain('no-evm');
		}
	});

	it('throws EVMSignerNotAvailableError for bsc chain without EVM signer', () => {
		const handle = createMockHandle({ id: 'no-evm', evmSigner: undefined });
		registry.register(handle);

		expect(() => selectSigner(registry, 'no-evm', 'bsc')).toThrow(EVMSignerNotAvailableError);
	});

	it('throws EVMSignerNotAvailableError for ethereum chain without EVM signer', () => {
		const handle = createMockHandle({ id: 'no-evm', evmSigner: undefined });
		registry.register(handle);

		expect(() => selectSigner(registry, 'no-evm', 'ethereum')).toThrow(EVMSignerNotAvailableError);
	});

	it('throws BitcoinSignerNotAvailableError when handle has no Bitcoin signer on bitcoin chain', () => {
		const handle = createMockHandle({ id: 'no-btc', bitcoinSigner: undefined });
		registry.register(handle);

		expect(() => selectSigner(registry, 'no-btc', 'bitcoin')).toThrow(
			BitcoinSignerNotAvailableError
		);
	});

	it('throws BitcoinSignerNotAvailableError with the source ID in the message', () => {
		const handle = createMockHandle({ id: 'no-btc', bitcoinSigner: undefined });
		registry.register(handle);

		try {
			selectSigner(registry, 'no-btc', 'bitcoin');
		} catch (e) {
			expect(e).toBeInstanceOf(BitcoinSignerNotAvailableError);
			expect((e as BitcoinSignerNotAvailableError).message).toContain('no-btc');
		}
	});

	it('prefers Bitcoin signer over EVM signer when chain is bitcoin (both present)', () => {
		const evmSigner = createMockEVMSigner();
		const bitcoinSigner = createMockBitcoinSigner();
		const handle = createMockHandle({ id: 'both', evmSigner, bitcoinSigner });
		registry.register(handle);

		const result = selectSigner(registry, 'both', 'bitcoin');
		expect(result).toBe(bitcoinSigner);
		expect(result.type).toBe('bitcoin');
	});
});
