/**
 * Trezor Connector — Unit Tests
 *
 * Tests what CAN be tested without a physical Trezor device:
 *  1. CDN Loading (already cached, script injection, failure)
 *  2. connectTrezor() — EVM happy path and error paths
 *  3. connectTrezorBitcoin() — separate BTC session
 *  4. EVM Signer — sendTransaction happy path and error
 *
 * Mock strategy:
 *  - window.TrezorConnect is stubbed with a hoisted mock
 *  - ethers is module-mocked (both static and dynamic imports)
 *  - bip32 / bitcoinjs-lib / tiny-secp256k1 are module-mocked for BTC derivation
 *  - @capacitor/core is already mocked in vitest-setup-client.ts
 *  - @sentry/sveltekit is module-mocked (no-op)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	connectTrezor,
	connectTrezorBitcoin,
	type TrezorBitcoinResult
} from '$lib/services/external-wallet/trezor-connector';
import type { TrezorConnectionConfig } from '$lib/services/external-wallet/trezor-connector';
import { ConnectorRegistry } from '$lib/services/external-wallet/connector-registry';
import type { EVMTransactionRequest } from '$lib/services/external-wallet/types';
import { Capacitor } from '@capacitor/core';

// ---------------------------------------------------------------------------
// Hoisted mocks (evaluated before module imports)
// ---------------------------------------------------------------------------

const { mockTrezorConnect } = vi.hoisted(() => {
	const tc = {
		init: vi.fn().mockResolvedValue(undefined),
		dispose: vi.fn(),
		ethereumGetAddress: vi.fn(),
		getPublicKey: vi.fn(),
		ethereumSignTransaction: vi.fn(),
		signTransaction: vi.fn()
	};
	return { mockTrezorConnect: tc };
});

const { mockPsbt, mockFromBase64, mockFromOutputScript } = vi.hoisted(() => {
	const psbt: Record<string, unknown> = {
		data: {
			inputs: [
				{
					witnessUtxo: { script: Buffer.alloc(0), value: 100000 },
					tapKeySig: undefined as Buffer | undefined
				}
			]
		},
		__CACHE: {
			__TX: {
				ins: [{ hash: Buffer.alloc(32, 0x01), index: 0 }],
				outs: [{ script: Buffer.alloc(0), value: 50000 }]
			}
		},
		finalizeInput: vi.fn(),
		toBase64: vi.fn()
	};
	return {
		mockPsbt: psbt,
		mockFromBase64: vi.fn().mockReturnValue(psbt),
		mockFromOutputScript: vi.fn(() => 'bc1qtestdestinationaddress12345678')
	};
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn()
}));

vi.mock('ethers', () => ({
	toQuantity: vi.fn((v: unknown) => {
		if (typeof v === 'bigint') return '0x' + v.toString(16);
		if (typeof v === 'number') return '0x' + v.toString(16);
		if (typeof v === 'string' && v.startsWith('0x')) return v;
		return '0x' + String(v);
	}),
	Signature: {
		from: vi.fn(() => ({ r: '0x01', s: '0x02', v: 27 }))
	},
	Transaction: {
		from: vi.fn(() => ({ serialized: '0xdeadbeefdeadbeef' }))
	}
}));

vi.mock('bip32', () => {
	const createNode = (): Record<string, unknown> => ({
		publicKey: new Uint8Array(33).fill(0x02),
		derive: vi.fn(() => createNode())
	});
	return {
		BIP32Factory: vi.fn(() => ({
			fromBase58: vi.fn(() => createNode())
		}))
	};
});

vi.mock('tiny-secp256k1', () => ({}));

vi.mock('bitcoinjs-lib', () => ({
	initEccLib: vi.fn(),
	payments: {
		p2tr: vi.fn(() => ({
			address: 'bc1peu5k6ytnavr9tqxzp43m6ge9yl0ta6k95acj8xzmjlp6qjx55nvskytjeg'
		}))
	},
	networks: {
		bitcoin: { bech32: 'bc' },
		testnet: { bech32: 'tb' }
	},
	Psbt: {
		fromBase64: mockFromBase64
	},
	address: {
		fromOutputScript: mockFromOutputScript,
		toOutputScript: vi.fn(() => Buffer.alloc(0))
	}
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extended window type — allows safe access to the TrezorConnect global. */
interface WindowWithTrezor {
	TrezorConnect?: typeof mockTrezorConnect;
}

/** Type-safe access to window.TrezorConnect. */
function win(): WindowWithTrezor {
	return window as unknown as WindowWithTrezor;
}

const FAKE_EVM_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';
const FAKE_XPUB =
	'xpub6CgcbfYQXoNR8AFnGvHGQMtfNqX8kMBj3NR1DSAaTQeM5ZGnV4rTWYeqQDph8oQ2B9RnTLw7MwGjA5ZtjERwLTDFznPmVYoMBhMqHsY2bMu';

/**
 * Build a fresh config with a new mock provider on every call.
 * Provider fns are re-created each time so vi.restoreAllMocks() doesn't
 * wipe their implementations.
 */
function makeConfig(overrides?: Partial<TrezorConnectionConfig>): TrezorConnectionConfig {
	return {
		registry: new ConnectorRegistry(),
		navigator: {
			usb: { getDevices: vi.fn() }
		} as unknown as Navigator,
		provider: {
			getTransactionCount: vi.fn().mockResolvedValue(5),
			estimateGas: vi.fn().mockResolvedValue(21000n),
			getFeeData: vi.fn().mockResolvedValue({ gasPrice: 1_000_000_000n }),
			broadcastTransaction: vi.fn().mockResolvedValue({ hash: '0xtxhash123' })
		} as unknown as TrezorConnectionConfig['provider'],
		...overrides
	};
}

function mockEVMAddressSuccess(address = FAKE_EVM_ADDRESS): void {
	mockTrezorConnect.ethereumGetAddress.mockResolvedValue({
		success: true,
		payload: { address }
	});
}

function mockEVMAddressFailure(error = 'Device locked'): void {
	mockTrezorConnect.ethereumGetAddress.mockResolvedValue({
		success: false,
		payload: { error }
	});
}

function mockEVMAddressEmptyPayload(): void {
	mockTrezorConnect.ethereumGetAddress.mockResolvedValue({
		success: false,
		payload: {}
	});
}

function mockXPUBSuccess(xpub = FAKE_XPUB): void {
	mockTrezorConnect.getPublicKey.mockResolvedValue({
		success: true,
		payload: { xpub }
	});
}

function mockXPUBFailure(error = 'Device unavailable'): void {
	mockTrezorConnect.getPublicKey.mockResolvedValue({
		success: false,
		payload: { error }
	});
}

/** Intercept script injection to fire a synthetic event (load or error). */
function interceptScriptInjection(eventType: 'load' | 'error'): void {
	vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node): Node => {
		const script = node as HTMLScriptElement;
		if (script.tagName === 'SCRIPT' && script.src?.includes('trezor-connect')) {
			queueMicrotask(() => {
				if (eventType === 'load') {
					win().TrezorConnect = mockTrezorConnect;
				}
				script[eventType === 'load' ? 'onload' : 'onerror']?.(new Event(eventType));
			});
		}
		return node;
	});
}

/** Same but does NOT set window.TrezorConnect (edge case). */
function interceptScriptInjectionNoGlobal(): void {
	vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node): Node => {
		const script = node as HTMLScriptElement;
		if (script.tagName === 'SCRIPT' && script.src?.includes('trezor-connect')) {
			queueMicrotask(() => {
				script.onload?.(new Event('load'));
			});
		}
		return node;
	});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('trezor-connector', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Default: TrezorConnect already loaded on window
		win().TrezorConnect = mockTrezorConnect;
		// Default: non-iOS platform
		vi.mocked(Capacitor.getPlatform).mockReturnValue('web');
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
		// Default: EVM address success
		mockEVMAddressSuccess();
	});

	afterEach(() => {
		delete win().TrezorConnect;
		vi.restoreAllMocks();
	});

	// =========================================================================
	// CDN Loading
	// =========================================================================
	describe('CDN Loading (_loadTrezorConnectCDN)', () => {
		it('should resolve immediately when window.TrezorConnect is already present', async () => {
			const createElSpy = vi.spyOn(document, 'createElement');

			await connectTrezor(makeConfig());

			const scriptCreates = createElSpy.mock.calls.filter((call) => call[0] === 'script');
			expect(scriptCreates.length).toBe(0);
		});

		it('should load via script injection when window.TrezorConnect is undefined', async () => {
			delete win().TrezorConnect;
			interceptScriptInjection('load');

			await connectTrezor(makeConfig());

			expect(mockTrezorConnect.init).toHaveBeenCalled();
			expect(mockTrezorConnect.ethereumGetAddress).toHaveBeenCalled();
		});

		it('should throw when CDN script fails to load', async () => {
			delete win().TrezorConnect;
			interceptScriptInjection('error');

			await expect(connectTrezor(makeConfig())).rejects.toThrow(/Could not load Trezor Connect/);
		});

		it('should throw when CDN loads but window.TrezorConnect remains undefined', async () => {
			delete win().TrezorConnect;
			interceptScriptInjectionNoGlobal();

			await expect(connectTrezor(makeConfig())).rejects.toThrow(/Could not load Trezor Connect/);
		});
	});

	// =========================================================================
	// connectTrezor() — EVM Happy Path
	// =========================================================================
	describe('connectTrezor() — EVM happy path', () => {
		it('should return a ConnectorHandle with correct shape', async () => {
			const handle = await connectTrezor(makeConfig());

			expect(handle.walletType).toBe('trezor');
			expect(handle.walletName).toBe('Trezor');
			expect(handle.address).toBe(FAKE_EVM_ADDRESS);
			expect(handle.chainIds).toEqual([30, 31, 56, 42161]);
			expect(handle.evmSigner).toBeDefined();
			expect(handle.bitcoinSigner).toBeUndefined();
			expect(handle.provider).toBeDefined();
			expect(handle.id).toBe(`trezor-${FAKE_EVM_ADDRESS}`);
		});

		it('should call TrezorConnect.init() with correct transports', async () => {
			await connectTrezor(makeConfig());

			expect(mockTrezorConnect.init).toHaveBeenCalledTimes(1);
			const initArgs = mockTrezorConnect.init.mock.calls[0][0] as Record<string, unknown>;
			expect(initArgs.manifest).toBeDefined();
			expect(initArgs.transports).toContain('WebUsbTransport');
		});

		it('should use BridgeTransport when WebUSB is unavailable', async () => {
			const config = makeConfig({
				navigator: {} as unknown as Navigator
			});

			await connectTrezor(config);

			const initArgs = mockTrezorConnect.init.mock.calls[0][0] as Record<string, unknown>;
			expect(initArgs.transports).toContain('BridgeTransport');
			expect(initArgs.transports).not.toContain('WebUsbTransport');
		});

		it('should call ethereumGetAddress with EVM derivation path and showOnTrezor', async () => {
			await connectTrezor(makeConfig());

			expect(mockTrezorConnect.ethereumGetAddress).toHaveBeenCalledWith({
				path: "m/44'/60'/0'/0/0",
				showOnTrezor: true
			});
		});

		it('should build an EVM signer that returns correct address', async () => {
			const handle = await connectTrezor(makeConfig());

			expect(handle.evmSigner!.getAddress()).toBe(FAKE_EVM_ADDRESS);
			expect(handle.evmSigner!.isConnected()).toBe(true);
			expect(handle.evmSigner!.type).toBe('evm');
			expect(handle.evmSigner!.label).toBe('Trezor');
		});

		it('should call TrezorConnect.dispose() on unsubscribe', async () => {
			const handle = await connectTrezor(makeConfig());

			expect(mockTrezorConnect.dispose).not.toHaveBeenCalled();
			handle.unsubscribe();
			expect(mockTrezorConnect.dispose).toHaveBeenCalledTimes(1);
		});

		it('should not have provider when config.provider is undefined', async () => {
			const config = makeConfig({ provider: undefined });
			const handle = await connectTrezor(config);

			expect(handle.provider).toBeNull();
		});

		it('should set chainIds to [30, 31, 56, 42161] regardless of network', async () => {
			const handle = await connectTrezor(makeConfig({ network: 'testnet' }));

			expect(handle.chainIds).toEqual([30, 31, 56, 42161]);
		});
	});

	// =========================================================================
	// connectTrezor() — Error Paths
	// =========================================================================
	describe('connectTrezor() — error paths', () => {
		it('should throw on iOS before any TrezorConnect call', async () => {
			vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');

			await expect(connectTrezor(makeConfig())).rejects.toThrow('Trezor not available on iOS');

			expect(mockTrezorConnect.init).not.toHaveBeenCalled();
			expect(mockTrezorConnect.ethereumGetAddress).not.toHaveBeenCalled();
		});

		it('should throw on iOS even for native iOS platform', async () => {
			vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
			vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

			await expect(connectTrezor(makeConfig())).rejects.toThrow('Trezor not available on iOS');
		});

		it('should throw when TrezorConnect.init() fails', async () => {
			mockTrezorConnect.init.mockRejectedValueOnce(new Error('No device found'));

			await expect(connectTrezor(makeConfig())).rejects.toThrow(/Trezor init failed/);
		});

		it('should call TrezorConnect.dispose() after init failure', async () => {
			mockTrezorConnect.init.mockRejectedValueOnce(new Error('No device found'));

			await expect(connectTrezor(makeConfig())).rejects.toThrow();

			expect(mockTrezorConnect.dispose).toHaveBeenCalledTimes(1);
		});

		it('should throw when ethereumGetAddress returns success:false', async () => {
			mockEVMAddressFailure('Device locked');

			await expect(connectTrezor(makeConfig())).rejects.toThrow(/Could not get Ethereum address/);
		});

		it('should throw when ethereumGetAddress payload is empty', async () => {
			mockEVMAddressEmptyPayload();

			await expect(connectTrezor(makeConfig())).rejects.toThrow(/Could not get Ethereum address/);
		});

		it('should throw CDN error when CDN load fails', async () => {
			delete win().TrezorConnect;
			interceptScriptInjection('error');

			await expect(connectTrezor(makeConfig())).rejects.toThrow(/Could not load Trezor Connect/);
		});

		it('should allow Android native (platform is not ios)', async () => {
			vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
			vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

			const handle = await connectTrezor(makeConfig());

			expect(handle.walletType).toBe('trezor');
		});
	});

	// =========================================================================
	// connectTrezorBitcoin() — Separate BTC Session
	// =========================================================================
	describe('connectTrezorBitcoin()', () => {
		beforeEach(() => {
			mockXPUBSuccess();
		});

		it('should return TrezorBitcoinResult with correct shape', async () => {
			const result = await connectTrezorBitcoin(makeConfig());

			expect(result.xpub).toBe(FAKE_XPUB);
			expect(result.btcAddress).toBeTruthy();
			expect(typeof result.btcAddress).toBe('string');
			expect(result.bitcoinSigner).toBeDefined();
			expect(result.bitcoinSigner.type).toBe('bitcoin');
			expect(result.bitcoinSigner.label).toBe('Trezor');
			expect(result.bitcoinSigner.getXPUB()).toBe(FAKE_XPUB);
			expect(result.bitcoinSigner.getAddress()).toBe(result.btcAddress);
			expect(result.bitcoinSigner.derivationPath).toBe("m/86'/0'/0'");
			expect(result.bitcoinSigner.isConnected()).toBe(true);
		});

		it('should call TrezorConnect.init() for a separate BTC session', async () => {
			await connectTrezorBitcoin(makeConfig());

			expect(mockTrezorConnect.init).toHaveBeenCalled();
			const initArgs = mockTrezorConnect.init.mock.calls[0][0] as Record<string, unknown>;
			expect(initArgs.manifest).toBeDefined();
		});

		it('should call getPublicKey with BIP86 Taproot path', async () => {
			await connectTrezorBitcoin(makeConfig());

			expect(mockTrezorConnect.getPublicKey).toHaveBeenCalledWith({
				path: "m/86'/0'/0'",
				coin: 'btc',
				scriptType: 'SPENDTAPROOT',
				showOnTrezor: true
			});
		});

		it('should throw on iOS platform', async () => {
			vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');

			await expect(connectTrezorBitcoin(makeConfig())).rejects.toThrow(
				'Trezor not available on iOS'
			);
		});

		it('should throw when TrezorConnect.init() fails for BTC session', async () => {
			mockTrezorConnect.init.mockRejectedValueOnce(new Error('Device disconnected'));

			await expect(connectTrezorBitcoin(makeConfig())).rejects.toThrow(
				/Trezor Bitcoin init failed/
			);
		});

		it('should throw when getPublicKey returns success:false', async () => {
			mockXPUBFailure('User rejected on device');

			await expect(connectTrezorBitcoin(makeConfig())).rejects.toThrow('User rejected on device');
		});

		it('should throw when getPublicKey has no xpub in payload', async () => {
			mockTrezorConnect.getPublicKey.mockResolvedValue({
				success: true,
				payload: {}
			});

			await expect(connectTrezorBitcoin(makeConfig())).rejects.toThrow(
				/Failed to get Trezor Bitcoin public key/
			);
		});

		it('should derive change address via bitcoinSigner', async () => {
			const result = await connectTrezorBitcoin(makeConfig());

			const changeAddr = result.bitcoinSigner.deriveChangeAddress(0);
			expect(typeof changeAddr).toBe('string');
			expect(changeAddr.length).toBeGreaterThan(0);
		});

		it('should use BridgeTransport when WebUSB unavailable', async () => {
			const config = makeConfig({
				navigator: {} as unknown as Navigator
			});

			await connectTrezorBitcoin(config);

			const initArgs = mockTrezorConnect.init.mock.calls[0][0] as Record<string, unknown>;
			expect(initArgs.transports).toContain('BridgeTransport');
		});
	});

	// =========================================================================
	// EVM Signer — sendTransaction
	// =========================================================================
	describe('EVM Signer — sendTransaction', () => {
		const FAKE_TX: EVMTransactionRequest = {
			to: '0x742d35cc6634c0532925a3b844bc9e7595f12bed',
			value: 1_000_000_000_000_000_000n, // 1 ETH in wei
			data: '0x',
			chainId: 30
		};

		beforeEach(() => {
			mockTrezorConnect.ethereumSignTransaction.mockResolvedValue({
				success: true,
				payload: {
					r: '0x11',
					s: '0x22',
					v: '0x1b'
				}
			});
		});

		it('should sign and broadcast an EVM transaction', async () => {
			const config = makeConfig();
			const handle = await connectTrezor(config);

			const result = await handle.evmSigner!.sendTransaction(FAKE_TX);

			expect(result.txHash).toBe('0xtxhash123');
			expect(result.from).toBe(FAKE_EVM_ADDRESS);
			expect(result.chainId).toBe(30);

			expect(mockTrezorConnect.ethereumSignTransaction).toHaveBeenCalled();
			const signArgs = mockTrezorConnect.ethereumSignTransaction.mock.calls[0][0] as {
				path: string;
				transaction: { to: string; chainId: number };
			};
			expect(signArgs.path).toBe("m/44'/60'/0'/0/0/0/0");
			expect(signArgs.transaction.to).toBe(FAKE_TX.to);
			expect(signArgs.transaction.chainId).toBe(30);
		});

		it('should throw when ethereumSignTransaction returns success:false with error', async () => {
			mockTrezorConnect.ethereumSignTransaction.mockResolvedValue({
				success: false,
				error: 'User rejected'
			});

			const handle = await connectTrezor(makeConfig());

			await expect(handle.evmSigner!.sendTransaction(FAKE_TX)).rejects.toThrow('User rejected');
		});

		it('should throw when ethereumSignTransaction returns no error message', async () => {
			mockTrezorConnect.ethereumSignTransaction.mockResolvedValue({
				success: false,
				payload: {}
			});

			const handle = await connectTrezor(makeConfig());

			await expect(handle.evmSigner!.sendTransaction(FAKE_TX)).rejects.toThrow(
				'Trezor signing rejected'
			);
		});

		it('should throw when no provider is configured for broadcast', async () => {
			const config = makeConfig({ provider: undefined });
			const handle = await connectTrezor(config);

			await expect(handle.evmSigner!.sendTransaction(FAKE_TX)).rejects.toThrow(
				'No provider configured for broadcast'
			);
		});

		it('should use provider.getTransactionCount for nonce', async () => {
			const config = makeConfig();
			const handle = await connectTrezor(config);

			await handle.evmSigner!.sendTransaction(FAKE_TX);

			expect(vi.mocked(config.provider!).getTransactionCount).toHaveBeenCalledWith(
				FAKE_EVM_ADDRESS
			);
		});

		it('should handle estimateGas returning a fallback value', async () => {
			const config = makeConfig();
			vi.mocked(config.provider!).estimateGas.mockRejectedValueOnce(
				new Error('gas estimation failed')
			);

			const handle = await connectTrezor(config);

			const result = await handle.evmSigner!.sendTransaction(FAKE_TX);
			expect(result.txHash).toBe('0xtxhash123');
		});

		it('should handle getFeeData returning null gracefully', async () => {
			const config = makeConfig();
			vi.mocked(config.provider!).getFeeData.mockRejectedValueOnce(
				new Error('fee data unavailable')
			);

			const handle = await connectTrezor(config);

			const result = await handle.evmSigner!.sendTransaction(FAKE_TX);
			expect(result.txHash).toBe('0xtxhash123');
		});
	});

	// =========================================================================
	// BitcoinSigner — signPSBT
	// =========================================================================
	describe('BitcoinSigner — signPSBT', () => {
		const VALID_PSBT_B64 = 'cHNidP8BA...base64mockpsbt==';

		/** Reset the mock PSBT to a clean single-input single-output state */
		function resetMockPsbt(): void {
			const hashBuffer = Buffer.alloc(32, 0);
			hashBuffer[0] = 0xab;
			hashBuffer[31] = 0xcd;

			(mockPsbt as Record<string, unknown>).data = {
				inputs: [
					{
						witnessUtxo: { script: Buffer.alloc(0), value: 100_000 },
						tapKeySig: undefined as Buffer | undefined
					}
				]
			};
			(mockPsbt as Record<string, unknown>).__CACHE = {
				__TX: {
					ins: [{ hash: hashBuffer, index: 0 }],
					outs: [{ script: Buffer.alloc(0), value: 50_000 }]
				}
			};
			mockPsbt.finalizeInput = vi.fn();
			mockPsbt.toBase64 = vi.fn().mockReturnValue('signed-psbt-base64-hash');
		}

		beforeEach(() => {
			mockXPUBSuccess();
			resetMockPsbt();
			vi.mocked(mockFromBase64).mockReturnValue(mockPsbt);
			vi.mocked(mockFromOutputScript).mockReturnValue('bc1qdestination0987654321fedcba');
		});

		// Helper: connect BTC session and return the bitcoinSigner
		async function getBitcoinSigner() {
			const result: TrezorBitcoinResult = await connectTrezorBitcoin(makeConfig());
			return result.bitcoinSigner;
		}

		it('signs a valid PSBT, calls TrezorConnect.signTransaction, and returns signed base64', async () => {
			mockTrezorConnect.signTransaction.mockResolvedValue({
				success: true,
				payload: {
					signatures: [
						'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff0011223344556677889900'
					]
				}
			});

			const signer = await getBitcoinSigner();
			const signed = await signer.signPSBT(VALID_PSBT_B64);

			expect(signed).toBe('signed-psbt-base64-hash');
			expect(mockFromBase64).toHaveBeenCalledWith(VALID_PSBT_B64);
			expect(mockTrezorConnect.signTransaction).toHaveBeenCalledTimes(1);

			const callArgs = vi.mocked(mockTrezorConnect.signTransaction).mock.calls[0]?.[0] as
				| Record<string, unknown>
				| undefined;
			expect(callArgs).toBeDefined();
			expect(callArgs!.coin).toBe('btc');
			expect(callArgs!.push).toBe(false);

			// Verify finalizeInput was called per input
			expect(mockPsbt.finalizeInput).toHaveBeenCalledWith(0);
			// Verify signature was injected
			const psbtInputs = ((mockPsbt as Record<string, unknown>).data as Record<string, unknown>)
				.inputs as Array<{ tapKeySig?: Buffer }>;
			expect(psbtInputs[0]).toBeDefined();
			expect(psbtInputs[0]!.tapKeySig).toBeDefined();
			expect(psbtInputs[0]!.tapKeySig!.length).toBeGreaterThan(0);
		});

		it('throws when TrezorConnect.signTransaction returns success:false with error', async () => {
			mockTrezorConnect.signTransaction.mockResolvedValue({
				success: false,
				error: 'Device rejected signing'
			});

			const signer = await getBitcoinSigner();

			await expect(signer.signPSBT(VALID_PSBT_B64)).rejects.toThrow('Device rejected signing');
		});

		it('throws when TrezorConnect.signTransaction returns success but no signatures in payload', async () => {
			mockTrezorConnect.signTransaction.mockResolvedValue({
				success: true,
				payload: {}
			});

			const signer = await getBitcoinSigner();

			await expect(signer.signPSBT(VALID_PSBT_B64)).rejects.toThrow(
				/Trezor returned 0 signatures but 1 were expected/
			);
		});

		it('throws when TrezorConnect.signTransaction returns mismatched signature count', async () => {
			// Set up PSBT with 2 inputs
			const hashBuf1 = Buffer.alloc(32, 0x01);
			const hashBuf2 = Buffer.alloc(32, 0x02);
			(mockPsbt as Record<string, unknown>).data = {
				inputs: [
					{ witnessUtxo: { script: Buffer.alloc(0), value: 50_000 }, tapKeySig: undefined },
					{ witnessUtxo: { script: Buffer.alloc(0), value: 30_000 }, tapKeySig: undefined }
				]
			};
			(mockPsbt as Record<string, unknown>).__CACHE = {
				__TX: {
					ins: [
						{ hash: hashBuf1, index: 0 },
						{ hash: hashBuf2, index: 1 }
					],
					outs: [{ script: Buffer.alloc(0), value: 70_000 }]
				}
			};

			mockTrezorConnect.signTransaction.mockResolvedValue({
				success: true,
				payload: { signatures: ['only-one-sig'] }
			});

			const signer = await getBitcoinSigner();

			await expect(signer.signPSBT(VALID_PSBT_B64)).rejects.toThrow(
				/Trezor returned 1 signatures but 2 were expected/
			);
		});

		it('parses inputs correctly — passes correct address_n, prev_hash, script_type to Trezor', async () => {
			mockTrezorConnect.signTransaction.mockResolvedValue({
				success: true,
				payload: {
					signatures: [
						'00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
					]
				}
			});

			const signer = await getBitcoinSigner();
			await signer.signPSBT(VALID_PSBT_B64);

			const callArgs = vi.mocked(mockTrezorConnect.signTransaction).mock.calls[0]?.[0] as
				| Record<string, unknown>
				| undefined;
			const trezorInputs = callArgs!.inputs as Array<Record<string, unknown>> | undefined;
			expect(trezorInputs).toBeDefined();
			expect(trezorInputs!.length).toBe(1);

			const input = trezorInputs![0]!;
			// address_n should be the BIP86 Taproot derivation path (all hardened)
			expect(input.address_n).toEqual([86 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0]);
			expect(input.script_type).toBe('SPENDTAPROOT');
			// prev_index should match the mock input
			expect(input.prev_index).toBe(0);
			// prev_hash should be the reversed hash buffer as hex
			expect(typeof input.prev_hash).toBe('string');
			expect((input.prev_hash as string).length).toBe(64);
			// amount should match witnessUtxo value
			expect(input.amount).toBe('100000');
		});

		it('parses outputs correctly — passes correct address and amount to Trezor', async () => {
			mockTrezorConnect.signTransaction.mockResolvedValue({
				success: true,
				payload: {
					signatures: [
						'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100'
					]
				}
			});

			const signer = await getBitcoinSigner();
			await signer.signPSBT(VALID_PSBT_B64);

			const callArgs = vi.mocked(mockTrezorConnect.signTransaction).mock.calls[0]?.[0] as
				| Record<string, unknown>
				| undefined;
			const trezorOutputs = callArgs!.outputs as Array<Record<string, unknown>> | undefined;
			expect(trezorOutputs).toBeDefined();
			expect(trezorOutputs!.length).toBe(1);

			const output = trezorOutputs![0]!;
			// address should come from address.fromOutputScript mock
			expect(output.address).toBe('bc1qdestination0987654321fedcba');
			expect(output.amount).toBe('50000');
			expect(output.script_type).toBe('PAYTOTAPROOT');
		});

		it('throws when PSBT has no inputs', async () => {
			// Override mock PSBT to have zero inputs
			(mockPsbt as Record<string, unknown>).__CACHE = {
				__TX: { ins: [], outs: [] }
			};
			(mockPsbt as Record<string, unknown>).data = { inputs: [] };

			const signer = await getBitcoinSigner();

			await expect(signer.signPSBT(VALID_PSBT_B64)).rejects.toThrow('PSBT has no inputs');
		});

		it('throws when PSBT input is missing witnessUtxo', async () => {
			// Override mock PSBT to have an input without witnessUtxo
			(mockPsbt as Record<string, unknown>).data = {
				inputs: [{ nonWitnessUtxo: Buffer.alloc(0) }]
			};

			const signer = await getBitcoinSigner();

			await expect(signer.signPSBT(VALID_PSBT_B64)).rejects.toThrow(/missing witnessUtxo data/);
		});

		it('handles non-addressable outputs gracefully (OP_RETURN fallback)', async () => {
			// Mock fromOutputScript to throw, simulating an OP_RETURN output
			vi.mocked(mockFromOutputScript).mockImplementation(() => {
				throw new Error('OP_RETURN not an address');
			});

			mockTrezorConnect.signTransaction.mockResolvedValue({
				success: true,
				payload: {
					signatures: [
						'11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff'
					]
				}
			});

			const signer = await getBitcoinSigner();
			await signer.signPSBT(VALID_PSBT_B64);

			// Output address should be empty string for non-addressable outputs
			const callArgs = vi.mocked(mockTrezorConnect.signTransaction).mock.calls[0]?.[0] as
				| Record<string, unknown>
				| undefined;
			const trezorOutputs = callArgs!.outputs as Array<Record<string, unknown>> | undefined;
			expect(trezorOutputs![0]!.address).toBe('');
		});
	});

	// =========================================================================
	// Both connectors export functions (sanity check)
	// =========================================================================
	describe('module exports', () => {
		it('should export connectTrezor as a function', () => {
			expect(typeof connectTrezor).toBe('function');
		});

		it('should export connectTrezorBitcoin as a function', () => {
			expect(typeof connectTrezorBitcoin).toBe('function');
		});
	});
});
