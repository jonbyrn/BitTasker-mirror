/**
 * Ledger Connector — Unit Tests
 *
 * Tests what CAN be tested without a physical Ledger device:
 *  1. Platform + Transport Detection (webusb, ble, unavailable)
 *  2. connectLedger() — EVM happy path and error paths
 *  3. addBitcoinToLedger() — separate BTC session
 *  4. BitcoinSigner — sendBitcoin with PSBT, getWalletXpub variants
 *  5. EVM Signer — sendTransaction
 *
 * Mock strategy:
 *  - @ledgerhq packages are module-mocked with class constructors
 *  - ethers, bip32, tiny-secp256k1, bitcoinjs-lib, coinselect, bs58check are module-mocked
 *  - @capacitor/core is mocked in vitest-setup-client.ts
 *  - @sentry/sveltekit is module-mocked (no-op)
 *  - Manual mockReset() in beforeEach instead of vi.clearAllMocks() to avoid
 *    breaking dynamic import cache of module-level constructor mocks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { connectLedger, addBitcoinToLedger } from '$lib/services/external-wallet/ledger-connector';
import type { LedgerConnectionConfig } from '$lib/services/external-wallet/ledger-connector';
import { ConnectorRegistry } from '$lib/services/external-wallet/connector-registry';
import type {
	EVMTransactionRequest,
	BitcoinSendRequest
} from '$lib/services/external-wallet/types';
import { Capacitor } from '@capacitor/core';

// ---------------------------------------------------------------------------
// Hoisted mocks (evaluated before module imports)
// ---------------------------------------------------------------------------

const {
	mockTransport,
	mockEth,
	mockBtc,
	mockUsbCreate,
	mockBleCreate,
	mockAccumulative,
	mockPsbtInstance,
	mockBtcJsModule,
	MockEthersTransaction
} = vi.hoisted(() => {
	const transport = { close: vi.fn().mockResolvedValue(undefined) };
	const eth = {
		getAddress: vi.fn(),
		clearSignTransaction: vi.fn(),
		getAppConfiguration: vi.fn()
	};
	// Plain constructor function (NOT vi.fn) for ethers Transaction.
	// vi.fn constructor + dynamic import + getters has edge cases in vitest.
	function MockTx(this: Record<string, unknown>) {
		this.to = '';
		this.value = 0n;
		this.data = '0x';
		this.chainId = 0n;
		this.nonce = 0;
		this.gasLimit = 21000n;
		this.gasPrice = 1_000_000_000n;
		this.signature = null;
		this.unsignedSerialized = '0x02e8deadbeefdeadbeef';
		this.serialized = '0x02f8deadbeefdeadbeefsigned';
		return this;
	}
	const btc = {
		getWalletPublicKey: vi.fn(),
		getWalletXpub: vi.fn(),
		signPSBT: vi.fn()
	};
	const usbCreate = vi.fn().mockResolvedValue(transport);
	const bleCreate = vi.fn().mockResolvedValue(transport);
	const acc = vi.fn();
	const psbtInstance = {
		addInput: vi.fn().mockReturnThis(),
		addOutput: vi.fn().mockReturnThis(),
		toBase64: vi.fn().mockReturnValue('cHNidP8BALsCAAAAAgAAAAAAAAAAAAAA'),
		extractTransaction: vi.fn(() => ({
			toHex: vi.fn().mockReturnValue('020000000001_signed_ledger_tx_hex')
		}))
	};
	const bitcoinjs = {
		initEccLib: vi.fn(),
		payments: {
			p2tr: vi.fn(() => ({
				address: 'bc1peu5k6ytnavr9tqxzp43m6ge9yl0ta6k95acj8xzmjlp6qjx55nvskytjeg'
			})),
			p2wpkh: vi.fn(() => ({
				address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'
			}))
		},
		networks: {
			bitcoin: { bech32: 'bc' },
			testnet: { bech32: 'tb' }
		},
		Psbt: vi.fn().mockImplementation(function () {
			return psbtInstance;
		}),
		address: {
			toOutputScript: vi.fn(() => new Uint8Array([0x00, 0x14]).buffer)
		}
	};
	return {
		mockTransport: transport,
		mockEth: eth,
		mockBtc: btc,
		mockUsbCreate: usbCreate,
		mockBleCreate: bleCreate,
		mockAccumulative: acc,
		mockPsbtInstance: psbtInstance,
		mockBtcJsModule: bitcoinjs,
		MockEthersTransaction: MockTx
	};
});

// Helpers to reset all mock state between tests (avoiding vi.clearAllMocks
// which can break module-level constructor mocks used with dynamic imports)
function resetAllMocks(): void {
	mockTransport.close.mockReset().mockResolvedValue(undefined);
	mockEth.getAddress.mockReset();
	mockEth.clearSignTransaction.mockReset();
	mockEth.getAppConfiguration.mockReset();
	mockBtc.getWalletPublicKey.mockReset();
	mockBtc.getWalletXpub.mockReset();
	mockBtc.signPSBT.mockReset();
	mockUsbCreate.mockReset().mockResolvedValue(mockTransport);
	mockBleCreate.mockReset().mockResolvedValue(mockTransport);
	mockAccumulative.mockReset();
	mockPsbtInstance.addInput.mockReset().mockReturnThis();
	mockPsbtInstance.addOutput.mockReset().mockReturnThis();
	mockPsbtInstance.toBase64.mockReset().mockReturnValue('cHNidP8BALsCAAAAAgAAAAAAAAAAAAAA');
	mockPsbtInstance.extractTransaction.mockReset().mockReturnValue({
		toHex: vi.fn().mockReturnValue('020000000001_signed_ledger_tx_hex')
	});
	// Reset Capacitor mocks to defaults
	vi.mocked(Capacitor.getPlatform).mockReset().mockReturnValue('web');
	vi.mocked(Capacitor.isNativePlatform).mockReset().mockReturnValue(false);
}

// ---------------------------------------------------------------------------
// Module mocks — use class constructors (not vi.fn)
// to survive clear/reset cycles with dynamic imports
// ---------------------------------------------------------------------------

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn()
}));

// Use plain constructors instead of vi.fn for module-level default exports.
// vi.fn() constructor behavior is flaky with dynamic imports after mockClear.
vi.mock('@ledgerhq/hw-app-eth', () => ({
	default: class MockEthApp {
		getAddress = mockEth.getAddress;
		clearSignTransaction = mockEth.clearSignTransaction;
		getAppConfiguration = mockEth.getAppConfiguration;
		transport = null;
	}
}));

vi.mock('@ledgerhq/hw-app-btc', () => ({
	default: class MockBtcApp {
		getWalletPublicKey = mockBtc.getWalletPublicKey;
		getWalletXpub = mockBtc.getWalletXpub;
		signPSBT = mockBtc.signPSBT;
	}
}));

vi.mock('@ledgerhq/hw-transport-webusb', () => ({
	default: { create: mockUsbCreate }
}));

vi.mock('@ledgerhq/hw-transport-web-ble', () => ({
	default: { create: mockBleCreate }
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
	Transaction: MockEthersTransaction
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

vi.mock('coinselect', () => ({
	accumulative: mockAccumulative
}));

vi.mock('bs58check', () => ({
	default: { encode: vi.fn().mockReturnValue('xpub_built_from_pubkey_chaincode_encoded') }
}));

vi.mock('bitcoinjs-lib', () => mockBtcJsModule);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_EVM_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';
const FAKE_XPUB =
	'xpub6CgcbfYQXoNR8AFnGvHGQMtfNqX8kMBj3NR1DSAaTQeM5ZGnV4rTWYeqQDph8oQ2B9RnTLw7MwGjA5ZtjERwLTDFznPmVYoMBhMqHsY2bMu';
const FAKE_BTC_ADDRESS = 'bc1peu5k6ytnavr9tqxzp43m6ge9yl0ta6k95acj8xzmjlp6qjx55nvskytjeg';

/**
 * Build a fresh config with a new mock provider on every call.
 */
function makeConfig(overrides?: Partial<LedgerConnectionConfig>): LedgerConnectionConfig {
	return {
		registry: new ConnectorRegistry(),
		navigator: {
			usb: {}
		} as unknown as Navigator,
		provider: {
			getTransactionCount: vi.fn().mockResolvedValue(5),
			estimateGas: vi.fn().mockResolvedValue(21000n),
			getFeeData: vi.fn().mockResolvedValue({ gasPrice: 1_000_000_000n }),
			broadcastTransaction: vi.fn().mockResolvedValue({ hash: '0xtxhash123' })
		} as unknown as LedgerConnectionConfig['provider'],
		...overrides
	};
}

/** Set up success response for eth.getAddress() */
function mockEthAddressSuccess(address = FAKE_EVM_ADDRESS): void {
	mockEth.getAddress.mockResolvedValue({ address });
}

/** Set up eth.getAddress() throwing a specific error */
function mockEthAddressError(message: string): void {
	mockEth.getAddress.mockRejectedValue(new Error(message));
}

/** Set up BTC wallet derivation success for the first derivation path (Taproot) */
function mockBtcWalletSuccess(address = FAKE_BTC_ADDRESS, xpub = FAKE_XPUB): void {
	mockBtc.getWalletPublicKey.mockResolvedValue({
		bitcoinAddress: address,
		publicKey: '03' + 'aa'.repeat(32),
		chainCode: 'bb'.repeat(32)
	});
	mockBtc.getWalletXpub.mockResolvedValue(xpub);
}

/** Make getWalletXpub return an object instead of string */
function mockBtcWalletXpubAsObject(): void {
	mockBtc.getWalletPublicKey.mockResolvedValue({
		bitcoinAddress: FAKE_BTC_ADDRESS,
		publicKey: '03' + 'aa'.repeat(32),
		chainCode: 'bb'.repeat(32)
	});
	mockBtc.getWalletXpub.mockResolvedValue({ publicKey: 'xpub_from_object_extraction' });
}

/**
 * Set up a platform environment via Capacitor mocks.
 * Returns config overrides for the navigator.
 */
function setPlatform(
	platform: string,
	isNative: boolean,
	navigatorOverrides?: Record<string, unknown>
): Partial<LedgerConnectionConfig> {
	vi.mocked(Capacitor.getPlatform).mockReset().mockReturnValue(platform);
	vi.mocked(Capacitor.isNativePlatform).mockReset().mockReturnValue(isNative);
	return {
		navigator: { usb: {}, ...navigatorOverrides } as unknown as Navigator
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ledger-connector', () => {
	beforeEach(() => {
		resetAllMocks();
		// Default: EVM address success (must be AFTER resetAllMocks which resets mocks)
		mockEthAddressSuccess();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// =========================================================================
	// Platform + Transport Detection
	// =========================================================================
	describe('Platform + Transport Detection', () => {
		it('should use WebUSB transport when hasUsb is true and not native', async () => {
			setPlatform('web', false);

			await connectLedger(makeConfig());

			expect(mockUsbCreate).toHaveBeenCalled();
			expect(mockBleCreate).not.toHaveBeenCalled();
		});

		it('should use BLE transport for Android native platform', async () => {
			setPlatform('android', true);

			await connectLedger(makeConfig());

			expect(mockBleCreate).toHaveBeenCalled();
			expect(mockUsbCreate).not.toHaveBeenCalled();
		});

		it('should throw "Ledger not available" on iOS without bluetooth', async () => {
			const overrides = setPlatform('ios', false);
			const config = makeConfig({ ...overrides, navigator: {} as unknown as Navigator });

			await expect(connectLedger(config)).rejects.toThrow(/Ledger not available on this platform/);
		});

		it('should throw "Ledger not available" when no transport is available (no USB, not native)', async () => {
			vi.mocked(Capacitor.getPlatform).mockReturnValue('web');
			vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

			const config = makeConfig({
				navigator: {} as unknown as Navigator
			});

			await expect(connectLedger(config)).rejects.toThrow(/Ledger not available on this platform/);
		});

		it('should use BLE for iOS platform when bluetooth IS available', async () => {
			vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
			vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

			const config = makeConfig({
				navigator: { bluetooth: {} } as unknown as Navigator
			});

			await connectLedger(config);

			expect(mockBleCreate).toHaveBeenCalled();
		});
	});

	// =========================================================================
	// connectLedger() — EVM Happy Path
	// =========================================================================
	describe('connectLedger() — EVM happy path', () => {
		it('should return a ConnectorHandle with correct shape', async () => {
			const handle = await connectLedger(makeConfig());

			expect(handle.walletType).toBe('ledger');
			expect(handle.walletName).toBe('Ledger');
			expect(handle.address).toBe(FAKE_EVM_ADDRESS);
			expect(handle.chainIds).toEqual([30, 31, 56, 97]);
			expect(handle.evmSigner).toBeDefined();
			expect(handle.bitcoinSigner).toBeUndefined();
			expect(handle.provider).toBeDefined();
			expect(handle.id).toBe(`ledger-${FAKE_EVM_ADDRESS}`);
		});

		it('should call eth.getAddress with the correct derivation path', async () => {
			await connectLedger(makeConfig());

			expect(mockEth.getAddress).toHaveBeenCalledWith("m/44'/60'/0'/0/0");
		});

		it('should build an EVM signer with correct methods', async () => {
			const handle = await connectLedger(makeConfig());

			expect(handle.evmSigner!.type).toBe('evm');
			expect(handle.evmSigner!.label).toBe('Ledger');
			expect(handle.evmSigner!.getAddress()).toBe(FAKE_EVM_ADDRESS);
			expect(handle.evmSigner!.isConnected()).toBe(true);
		});

		it('should have a noop unsubscribe function', async () => {
			const handle = await connectLedger(makeConfig());

			expect(handle.unsubscribe).toBeDefined();
			expect(typeof handle.unsubscribe).toBe('function');
			expect(() => handle.unsubscribe()).not.toThrow();
		});

		it('should set provider to null when config.provider is undefined', async () => {
			const config = makeConfig({ provider: undefined });
			const handle = await connectLedger(config);

			expect(handle.provider).toBeNull();
		});

		it('should attempt BTC derivation as best-effort (does not block EVM connection)', async () => {
			// Mock BTC app not available (no Bitcoin app open)
			mockBtc.getWalletPublicKey.mockRejectedValue(
				new Error('APP_NOT_FOUND: Please open Bitcoin app')
			);

			const handle = await connectLedger(makeConfig());

			// EVM connection succeeds regardless
			expect(handle.address).toBe(FAKE_EVM_ADDRESS);
			expect(handle.evmSigner).toBeDefined();
			// BTC signer not present because derivation failed
			expect(handle.bitcoinSigner).toBeUndefined();
		});

		it('should include bitcoinSigner when BTC derivation succeeds', async () => {
			mockBtcWalletSuccess();

			const handle = await connectLedger(makeConfig());

			expect(handle.bitcoinSigner).toBeDefined();
			expect(handle.bitcoinSigner!.type).toBe('bitcoin');
			expect(handle.bitcoinSigner!.label).toBe('Ledger');
		});
	});

	// =========================================================================
	// connectLedger() — Error Paths
	// =========================================================================
	describe('connectLedger() — error paths', () => {
		it('should throw when USB transport creation fails (device not found)', async () => {
			mockUsbCreate.mockReset().mockRejectedValue(new Error('No device selected'));

			await expect(connectLedger(makeConfig())).rejects.toThrow('No device selected');
		});

		it('should throw when eth.getAddress throws device-locked error (0x6511)', async () => {
			mockEthAddressError('Error 0x6511: execution error');

			await expect(connectLedger(makeConfig())).rejects.toThrow(
				/Unable to connect to the Ethereum app/
			);
		});

		it('should throw when eth.getAddress throws wrong-app error (0x6e00)', async () => {
			mockEthAddressError('Error 0x6e00: wrong application');

			await expect(connectLedger(makeConfig())).rejects.toThrow(
				/Please open the Ethereum \(ETH\) app/
			);
		});

		it('should throw DeviceDisconnectedError on disconnect during address derivation', async () => {
			mockEthAddressError('Transport DISCONNECT during operation');

			await expect(connectLedger(makeConfig())).rejects.toThrow(
				'Ledger disconnected during operation'
			);
		});

		it('should re-throw unknown errors from getAddress', async () => {
			mockEthAddressError('Some unknown transport error');

			await expect(connectLedger(makeConfig())).rejects.toThrow('Some unknown transport error');
		});

		it('should throw when BLE transport creation fails on Android', async () => {
			setPlatform('android', true);
			mockBleCreate.mockReset().mockRejectedValue(new Error('BLE device not found'));

			await expect(connectLedger(makeConfig())).rejects.toThrow('BLE device not found');
		});

		it('should throw when platform is unavailable (iOS, no BT, no USB)', async () => {
			setPlatform('ios', true);
			const config = makeConfig({
				navigator: {} as unknown as Navigator
			});

			await expect(connectLedger(config)).rejects.toThrow(/Ledger not available on this platform/);
		});
	});

	// =========================================================================
	// addBitcoinToLedger() — BTC Session
	// =========================================================================
	describe('addBitcoinToLedger() — BTC session', () => {
		beforeEach(() => {
			mockBtcWalletSuccess();
		});

		it('should return bitcoinSigner, xpub, and btcAddress', async () => {
			const result = await addBitcoinToLedger(makeConfig());

			expect(result.xpub).toBe(FAKE_XPUB);
			expect(result.btcAddress).toBe(FAKE_BTC_ADDRESS);
			expect(result.bitcoinSigner).toBeDefined();
		});

		it('should build bitcoinSigner with correct properties', async () => {
			const result = await addBitcoinToLedger(makeConfig());

			expect(result.bitcoinSigner.type).toBe('bitcoin');
			expect(result.bitcoinSigner.label).toBe('Ledger');
			expect(result.bitcoinSigner.address).toBe(FAKE_BTC_ADDRESS);
			expect(result.bitcoinSigner.getAddress()).toBe(FAKE_BTC_ADDRESS);
			expect(result.bitcoinSigner.getXPUB()).toBe(FAKE_XPUB);
			expect(result.bitcoinSigner.isConnected()).toBe(true);
		});

		it('should extract xpub as string when getWalletXpub returns a string', async () => {
			mockBtc.getWalletXpub.mockReset().mockResolvedValue('xpub_direct_string_xpub');
			mockBtc.getWalletPublicKey.mockReset().mockResolvedValue({
				bitcoinAddress: FAKE_BTC_ADDRESS,
				publicKey: '03' + 'aa'.repeat(32),
				chainCode: 'bb'.repeat(32)
			});

			const result = await addBitcoinToLedger(makeConfig());

			expect(result.xpub).toBe('xpub_direct_string_xpub');
			expect(result.bitcoinSigner.getXPUB()).toBe('xpub_direct_string_xpub');
		});

		it('should extract publicKey when getWalletXpub returns an object', async () => {
			mockBtcWalletXpubAsObject();

			const result = await addBitcoinToLedger(makeConfig());

			expect(result.xpub).toBe('xpub_from_object_extraction');
		});

		it('should throw when BTC derivation fails entirely (no address found)', async () => {
			mockBtc.getWalletPublicKey.mockReset().mockResolvedValue({
				bitcoinAddress: null,
				publicKey: '',
				chainCode: ''
			});

			await expect(addBitcoinToLedger(makeConfig())).rejects.toThrow(
				/Could not derive Bitcoin address/
			);
		});

		it('should derive change address via bitcoinSigner', async () => {
			const result = await addBitcoinToLedger(makeConfig());

			const changeAddr = result.bitcoinSigner.deriveChangeAddress(0);
			expect(typeof changeAddr).toBe('string');
			expect(changeAddr.length).toBeGreaterThan(0);
		});
	});

	// =========================================================================
	// BitcoinSigner — sendBitcoin
	// =========================================================================
	describe('BitcoinSigner — sendBitcoin', () => {
		const FAKE_BTC_REQ: BitcoinSendRequest = {
			recipient: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
			amount: 50_000_000n,
			feeRateSatsPerVbyte: 20
		};

		const mockFetch = vi.fn();

		beforeEach(() => {
			mockBtcWalletSuccess();
			mockBtc.signPSBT.mockResolvedValue([{ hex: '010000000001_signed' }, []]);

			// Stub global fetch for UTXO + fee API calls
			vi.stubGlobal('fetch', mockFetch);
			mockFetch.mockImplementation(async (url: string) => {
				if (url.includes('/utxo')) {
					return {
						ok: true,
						json: async () => [
							{ txid: 'utxo_txid_1', vout: 0, value: 100_000_000 },
							{ txid: 'utxo_txid_2', vout: 1, value: 50_000_000 }
						]
					};
				}
				if (url.includes('/fees/recommended')) {
					return {
						ok: true,
						json: async () => ({ fastestFee: 20 })
					};
				}
				throw new Error('Unexpected fetch URL');
			});

			// coinselect accumulative returns valid selection
			mockAccumulative.mockReset().mockReturnValue({
				inputs: [{ txId: 'utxo_txid_1', vout: 0, value: 100_000_000 }],
				outputs: [
					{ address: FAKE_BTC_REQ.recipient, value: 50_000_000 },
					{ address: FAKE_BTC_ADDRESS, value: 49_000_000 }
				],
				fee: 1_000_000
			});

			// Ensure global navigator has usb for sendBitcoin's transport creation
			vi.stubGlobal('navigator', { usb: {} });
		});

		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it('should build PSBT, sign with Ledger, and return result', async () => {
			const { bitcoinSigner } = await addBitcoinToLedger(makeConfig());

			const result = await bitcoinSigner.sendBitcoin(FAKE_BTC_REQ);

			expect(result.txHash).toBe('020000000001_signed_ledger_tx_hex');
			expect(result.signedPSBT).toBe('cHNidP8BALsCAAAAAgAAAAAAAAAAAAAA');
			expect(result.fee).toBe(BigInt(1_000_000));

			// Verify coinselect was called with correct parameters
			expect(mockAccumulative).toHaveBeenCalled();
			const coinselectCall = mockAccumulative.mock.calls[0] as Array<unknown>;
			const utxosArg = coinselectCall[0] as Array<{ txId: string; vout: number; value: number }>;
			expect(utxosArg).toHaveLength(2);
			expect(utxosArg[0].txId).toBe('utxo_txid_1');
			expect(coinselectCall[1]).toBe(50_000_000);
			expect(coinselectCall[2]).toBe(20);

			// Verify PSBT was built and signed
			expect(mockPsbtInstance.addInput).toHaveBeenCalled();
			expect(mockPsbtInstance.addOutput).toHaveBeenCalled();
			expect(mockBtc.signPSBT).toHaveBeenCalledWith('cHNidP8BALsCAAAAAgAAAAAAAAAAAAAA');
		});

		it('should throw when UTXO fetch fails', async () => {
			mockFetch.mockImplementation(async (url: string) => {
				if (url.includes('/utxo')) {
					return { ok: false, json: async () => [] };
				}
				return { ok: true, json: async () => ({ fastestFee: 20 }) };
			});

			const { bitcoinSigner } = await addBitcoinToLedger(makeConfig());

			await expect(bitcoinSigner.sendBitcoin(FAKE_BTC_REQ)).rejects.toThrow(
				'Failed to fetch UTXOs'
			);
		});

		it('should throw when coinselect returns insufficient funds', async () => {
			mockAccumulative.mockReset().mockReturnValue({
				inputs: undefined,
				outputs: undefined
			});

			const { bitcoinSigner } = await addBitcoinToLedger(makeConfig());

			await expect(bitcoinSigner.sendBitcoin(FAKE_BTC_REQ)).rejects.toThrow('Insufficient funds');
		});
	});

	// =========================================================================
	// EVM Signer — sendTransaction
	// =========================================================================
	describe('EVM Signer — sendTransaction', () => {
		const FAKE_TX: EVMTransactionRequest = {
			to: '0x742d35cc6634c0532925a3b844bc9e7595f12bed',
			value: 1_000_000_000_000_000_000n,
			data: '0x',
			chainId: 30
		};

		beforeEach(() => {
			mockEth.clearSignTransaction.mockResolvedValue({
				r: '0x11',
				s: '0x22',
				v: '0x1b'
			});
		});

		it('should sign and broadcast an EVM transaction', async () => {
			const config = makeConfig();
			const handle = await connectLedger(config);

			const result = await handle.evmSigner!.sendTransaction(FAKE_TX);

			expect(result.txHash).toBe('0xtxhash123');
			expect(result.from).toBe(FAKE_EVM_ADDRESS);
			expect(result.chainId).toBe(30);

			expect(mockEth.clearSignTransaction).toHaveBeenCalled();
			const resolveArgs = mockEth.clearSignTransaction.mock.calls[0] as [
				string,
				string,
				Record<string, unknown>
			];
			expect(resolveArgs[0]).toBe("m/44'/60'/0'/0/0");
			expect(resolveArgs[1]).toBe('02e8deadbeefdeadbeef');
		});

		it('should use provider.getTransactionCount for nonce', async () => {
			const config = makeConfig();
			const handle = await connectLedger(config);

			await handle.evmSigner!.sendTransaction(FAKE_TX);

			expect(vi.mocked(config.provider!).getTransactionCount).toHaveBeenCalledWith(
				FAKE_EVM_ADDRESS
			);
		});

		it('should throw "No provider for broadcast" when provider is undefined', async () => {
			const config = makeConfig({ provider: undefined });
			const handle = await connectLedger(config);

			await expect(handle.evmSigner!.sendTransaction(FAKE_TX)).rejects.toThrow(
				'No provider for broadcast'
			);
		});

		it('should handle estimateGas failure gracefully by using fallback', async () => {
			const config = makeConfig();
			vi.mocked(config.provider!).estimateGas.mockRejectedValueOnce(
				new Error('gas estimation failed')
			);
			const handle = await connectLedger(config);

			const result = await handle.evmSigner!.sendTransaction(FAKE_TX);

			expect(result.txHash).toBe('0xtxhash123');
		});

		it('should handle getFeeData failure gracefully by using fallback gas price', async () => {
			const config = makeConfig();
			vi.mocked(config.provider!).getFeeData.mockRejectedValueOnce(
				new Error('fee data unavailable')
			);
			const handle = await connectLedger(config);

			const result = await handle.evmSigner!.sendTransaction(FAKE_TX);

			expect(result.txHash).toBe('0xtxhash123');
		});
	});

	// =========================================================================
	// Module exports
	// =========================================================================
	describe('module exports', () => {
		it('should export connectLedger as a function', () => {
			expect(typeof connectLedger).toBe('function');
		});

		it('should export addBitcoinToLedger as a function', () => {
			expect(typeof addBitcoinToLedger).toBe('function');
		});
	});
});
