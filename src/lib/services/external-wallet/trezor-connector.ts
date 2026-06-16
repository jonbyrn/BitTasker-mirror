/**
 * Trezor Connector — Hardware wallet for EVM chains + Bitcoin L1.
 *
 * EVM:   m/44'/60'/0'/0/0 — Standard Ethereum derivation (0x... address)
 *        Used for RSK (chain 30), BSC (chain 56), Arbitrum (chain 42161).
 * BTC:   m/86'/0'/0'     — BIP86 Taproot (bc1p... addresses)
 *
 * Lazy-loaded: only imported when user taps "Connect Trezor".
 *
 * Debug logging: set `localStorage.debug = 'trezor'` to enable.
 */

import type {
	ConnectorHandle,
	EVMSigner,
	BitcoinSigner,
	BitcoinSendRequest,
	BitcoinSendResult
} from './types';
import type { ConnectorRegistry } from './connector-registry';
import { getPlatformInfo } from './platform-checks';
import type { Provider, TransactionLike } from 'ethers';
import * as Sentry from '@sentry/sveltekit';

// ---------------------------------------------------------------------------
// Trezor Connect CDN loader
// ---------------------------------------------------------------------------

const TREZOR_CONNECT_CDN = 'https://connect.trezor.io/9/trezor-connect.js';

/** Load Trezor Connect from CDN and return the global API object.
 *  Caches on `window.TrezorConnect` — only fetches the script once per page load. */
async function _loadTrezorConnectCDN(): Promise<NonNullable<typeof window.TrezorConnect>> {
	if (window.TrezorConnect) {
		_debug('TrezorConnect already loaded from CDN');
		return window.TrezorConnect;
	}

	_debug('loading Trezor Connect from CDN: %s', TREZOR_CONNECT_CDN);
	return new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.src = TREZOR_CONNECT_CDN;
		script.async = true;
		script.onload = () => {
			_debug('Trezor Connect CDN script loaded');
			if (window.TrezorConnect) {
				resolve(window.TrezorConnect);
			} else {
				reject(new Error('Trezor Connect CDN loaded but window.TrezorConnect is undefined'));
			}
		};
		script.onerror = () => reject(new Error('Failed to load Trezor Connect from CDN'));
		document.head.appendChild(script);
	});
}

const BTC_TAPROOT_PATH = "m/86'/0'/0'";
const EVM_PATH = "m/44'/60'/0'/0/0";

// ---------------------------------------------------------------------------
// Debug helpers
// ---------------------------------------------------------------------------

function _debug(msg: string, ...args: unknown[]): void {
	if (typeof localStorage !== 'undefined' && localStorage.debug?.includes('trezor')) {
		console.debug(`[TrezorConnect] ${msg}`, ...args);
	}
}

function _warn(msg: string, ...args: unknown[]): void {
	console.warn(`[TrezorConnect] ${msg}`, ...args);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TrezorConnectionConfig {
	registry: ConnectorRegistry;
	navigator: Navigator;
	provider?: Provider;
	network?: 'mainnet' | 'testnet';
}

export async function connectTrezor(config: TrezorConnectionConfig): Promise<ConnectorHandle> {
	_debug('connectTrezor called');

	const info = getPlatformInfo(config.navigator);
	if (info.platform === 'ios') {
		throw new Error('Trezor not available on iOS');
	}
	_debug('platform check passed: %s', info.platform);

	// -----------------------------------------------------------------------
	// Step 0: Load Trezor Connect from CDN + init
	// -----------------------------------------------------------------------
	_debug('loading Trezor Connect CDN...');
	let TrezorConnect;
	try {
		TrezorConnect = await _loadTrezorConnectCDN();
		_debug('TrezorConnect CDN loaded successfully');
		Sentry.addBreadcrumb({ category: 'hw-wallet', message: 'Trezor CDN loaded', level: 'info' });
	} catch (e) {
		_warn('failed to load Trezor Connect CDN: %s', (e as Error)?.message);
		Sentry.addBreadcrumb({
			category: 'hw-wallet',
			message: 'Trezor CDN load failed',
			level: 'error'
		});
		throw new Error(`Could not load Trezor Connect: ${(e as Error)?.message}`);
	}

	// Chrome/Edge: use WebUSB only (Bridge CORS-blocked on dev at 127.0.0.1:21325).
	// Firefox/Safari: WebUSB unavailable, fall through to BridgeTransport.
	const _hasWebUSB = typeof navigator !== 'undefined' && 'usb' in config.navigator;
	const transports: string[] = _hasWebUSB ? ['WebUsbTransport'] : ['BridgeTransport'];
	_debug('initializing with transports: %s', transports.join(', '));
	try {
		await TrezorConnect.init({
			lazyLoad: true,
			coreMode: 'auto',
			manifest: {
				appName: 'BitTasker',
				email: 'dev@bittasker.com',
				appUrl: 'https://bittasker.com'
			},
			transports
		});
		_debug('Trezor Connect initialized (%s)', _hasWebUSB ? 'WebUsbTransport' : 'BridgeTransport');
		Sentry.addBreadcrumb({
			category: 'hw-wallet',
			message: 'Trezor Connect initialized',
			level: 'info'
		});
	} catch (e) {
		_warn('Trezor Connect init failed: %s', (e as Error)?.message);
		TrezorConnect.dispose();
		throw new Error(`Trezor init failed: ${(e as Error)?.message}`);
	}

	// -----------------------------------------------------------------------
	// Step 1: Ethereum address — establishes the WebUSB session.
	// BTC is handled separately via connectTrezorBitcoin() to work around
	// the single-app limitation (Trezor runs ETH or BTC, not both at once).
	// -----------------------------------------------------------------------
	_debug('requesting ETH address at path %s, showOnTrezor=true', EVM_PATH);
	const ethResult = await TrezorConnect.ethereumGetAddress({
		path: EVM_PATH,
		showOnTrezor: true
	});
	_debug('ethereumGetAddress response: success=%s', ethResult.success);

	if (!ethResult.success || !ethResult.payload?.address) {
		const err = ethResult.payload?.error || 'Trezor did not return an Ethereum address';
		_warn('ETH address unavailable: %s — is the Ethereum app open on your Trezor?', err);
		throw new Error(
			`Could not get Ethereum address from Trezor. ${err}. Ensure the Ethereum app is open and the device is unlocked.`
		);
	}

	const evmAddress = ethResult.payload.address;
	_debug('EVM address: %s', evmAddress);
	Sentry.addBreadcrumb({
		category: 'hw-wallet',
		message: 'Trezor EVM address derived',
		level: 'info'
	});

	// -----------------------------------------------------------------------
	// Build EVM-only handle — bitcoinSigner is added later via
	// connectTrezorBitcoin() when the user clicks "Connect Bitcoin".
	// -----------------------------------------------------------------------
	const connectorId = `trezor-${evmAddress}`;
	_debug('connectorId: %s', connectorId);

	const evmSigner = buildEVMSigner(evmAddress, config);

	const handle: ConnectorHandle = {
		id: connectorId,
		walletName: 'Trezor',
		walletType: 'trezor',
		address: evmAddress,
		chainIds: [30, 31, 56, 42161],
		provider: config.provider ?? null,
		evmSigner,
		bitcoinSigner: undefined,
		onEvent() {},
		unsubscribe() {
			_debug('disposing Trezor Connect');
			TrezorConnect.dispose();
		}
	};

	_debug(
		'connection complete: handle.address=%s (EVM only — BTC requires separate Trezor connection)',
		handle.address
	);
	return handle;
}

// ---------------------------------------------------------------------------
// EVM Signer
// ---------------------------------------------------------------------------

function buildEVMSigner(evmAddress: string, config: TrezorConnectionConfig): EVMSigner {
	return {
		type: 'evm' as const,
		label: 'Trezor',
		address: evmAddress,
		chainId: 30,
		getAddress(): string {
			return evmAddress;
		},
		isConnected(): boolean {
			return true;
		},
		async sendTransaction(tx): Promise<{ txHash: string; from: string; chainId: number }> {
			_debug('sendTransaction: to=%s value=%s chainId=%s', tx.to, tx.value, tx.chainId);
			Sentry.addBreadcrumb({
				category: 'hw-wallet',
				message: 'Trezor EVM transaction signing started',
				level: 'info'
			});
			const ethersModule = await import('ethers');
			const TrezorConnect = await _loadTrezorConnectCDN();

			const provider = config.provider as Provider | null;
			const nonce = provider ? await provider.getTransactionCount(evmAddress) : 0;

			const txParams = {
				to: tx.to,
				value: tx.value ? ethersModule.toQuantity(tx.value) : '0x0',
				data: tx.data || '0x',
				chainId: tx.chainId,
				nonce: ethersModule.toQuantity(nonce),
				gasLimit: ethersModule.toQuantity(
					(await provider
						?.estimateGas({
							to: tx.to,
							value: tx.value,
							data: tx.data
						})
						.catch(() => 21000n)) || 21000n
				),
				gasPrice: ethersModule.toQuantity(
					(await provider?.getFeeData().catch(() => null))?.gasPrice || 1_000_000_000n
				)
			};

			_debug(
				'txParams: nonce=%s gasLimit=%s gasPrice=%s',
				txParams.nonce,
				txParams.gasLimit,
				txParams.gasPrice
			);

			const result = await TrezorConnect.ethereumSignTransaction({
				path: `${EVM_PATH}/0/0`,
				transaction: txParams
			});

			if (!result.success) {
				_warn('ethereumSignTransaction failed: %s', result.error);
				throw new Error(result.error || 'Trezor signing rejected');
			}

			const signature = ethersModule.Signature.from({
				r: result.payload!.r,
				s: result.payload!.s,
				v: parseInt(result.payload!.v, 16)
			});

			const signedTx = ethersModule.Transaction.from({
				...txParams,
				signature
			} as unknown as TransactionLike).serialized;

			if (!provider) throw new Error('No provider configured for broadcast');
			const txResponse = await provider.broadcastTransaction(signedTx);
			_debug('transaction broadcast: %s', txResponse.hash);
			return { txHash: txResponse.hash, from: evmAddress, chainId: tx.chainId };
		}
	};
}

// ---------------------------------------------------------------------------
// Bitcoin Signer
// ---------------------------------------------------------------------------

function buildBitcoinSigner(
	btcAddress: string,
	xpub: string,
	changeDeriver: (index: number) => string,
	config: TrezorConnectionConfig
): BitcoinSigner {
	return {
		type: 'bitcoin' as const,
		label: 'Trezor',
		address: btcAddress,
		xpub,
		derivationPath: BTC_TAPROOT_PATH,
		getAddress(): string {
			return btcAddress;
		},
		getXPUB(): string {
			return xpub;
		},
		isConnected(): boolean {
			return true;
		},
		deriveChangeAddress(index: number): string {
			return changeDeriver(index);
		},
		async sendBitcoin(req: BitcoinSendRequest): Promise<BitcoinSendResult> {
			_debug('sendBitcoin: amount=%s', req.amount.toString());
			const { accumulative } = await import('coinselect');
			const bitcoin = await import('bitcoinjs-lib');
			const { fromXpub, toXOnly } = bitcoin as unknown as {
				fromXpub: (xpub: string) => {
					derive: (index: number) => {
						derive: (index: number) => { publicKey: Buffer };
					};
				};
				toXOnly: (pubkey: Buffer) => Buffer;
			};

			const network = config.network ?? (config.provider ? 'mainnet' : 'testnet');
			const apiBase =
				network === 'mainnet' ? 'https://mempool.space/api' : 'https://mempool.space/testnet/api';

			// Fetch UTXOs
			_debug('fetching UTXOs for %s...', btcAddress);
			const utxosResp = await fetch(`${apiBase}/address/${btcAddress}/utxo`);
			if (!utxosResp.ok) throw new Error('Failed to fetch UTXOs');
			const rawUtxos = (await utxosResp.json()) as Array<{
				txid: string;
				vout: number;
				value: number;
			}>;
			_debug('fetched %s UTXOs', rawUtxos.length);

			const feeResp = await fetch(`${apiBase}/v1/fees/recommended`);
			if (!feeResp.ok) throw new Error('Failed to fetch fee rate');
			const fees = (await feeResp.json()) as { fastestFee: number };
			_debug('fee rate: %s sat/vB', fees.fastestFee);

			const utxosForSelect = rawUtxos.map((u) => ({
				txId: u.txid,
				vout: u.vout,
				value: u.value,
				...(u.value > 0 ? {} : {})
			}));

			const selected = accumulative(utxosForSelect, Number(req.amount), fees.fastestFee);
			if (!selected.inputs || !selected.outputs) throw new Error('Insufficient funds');
			_debug(
				'selected %s inputs, %s outputs, fee=%s',
				selected.inputs.length,
				selected.outputs.length,
				selected.fee
			);

			const bitcoinNetwork =
				network === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
			const psbt = new bitcoin.Psbt({ network: bitcoinNetwork });

			for (const input of selected.inputs as Array<{ txId: string; vout: number; value: number }>) {
				psbt.addInput({
					hash: input.txId,
					index: input.vout,
					witnessUtxo: {
						script: bitcoin.address.toOutputScript(btcAddress, bitcoinNetwork),
						value: input.value
					},
					tapInternalKey: toXOnly(fromXpub(xpub).derive(0).derive(0).publicKey),
					sequence: 0xfffffffd
				});
			}

			for (const output of selected.outputs as Array<{ address?: string; value: number }>) {
				psbt.addOutput({
					address: output.address!,
					value: output.value
				});
			}

			// Sign with Trezor
			_debug('sending BTC transaction to Trezor for signing...');
			const TrezorConnect = await _loadTrezorConnectCDN();
			const signResult = await TrezorConnect.signTransaction({
				coin: 'btc',
				inputs: (selected.inputs as Array<{ txId: string; vout: number; value: number }>).map(
					(input, _i) => ({
						address_n: [86 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0],
						prev_index: input.vout,
						prev_hash: input.txId,
						amount: String(input.value),
						script_type: 'SPENDTAPROOT'
					})
				),
				outputs: (selected.outputs as Array<{ address?: string; value: number }>).map((output) => ({
					address: output.address!,
					amount: String(output.value),
					script_type: 'PAYTOTAPROOT'
				})),
				push: true
			});

			if (!signResult.success) {
				_warn('BTC sign failed: %s', signResult.error);
				throw new Error(signResult.error || 'Trezor signing rejected');
			}
			_debug('BTC transaction signed');

			return {
				txHash: signResult.payload!.serializedTx,
				signedPSBT: signResult.payload!.serializedTx,
				fee: BigInt(selected.fee),
				change: BigInt(0),
				inputs: [],
				outputs: []
			} as BitcoinSendResult;
		},
		async signPSBT(psbtB64: string): Promise<string> {
			_debug('signPSBT called');
			Sentry.addBreadcrumb({
				category: 'hw-wallet',
				message: 'Trezor PSBT signing started',
				level: 'info'
			});

			try {
				const bitcoin = await import('bitcoinjs-lib');
				const TrezorConnect = await _loadTrezorConnectCDN();

				// Parse the PSBT from base64
				const psbt = bitcoin.Psbt.fromBase64(psbtB64);
				const network =
					config.network === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;

				// Access the internal unsigned transaction to extract per-input hash/index.
				// bitcoinjs-lib stores the transaction in __CACHE.__TX — not on the
				// public API surface. We access it structurally to avoid `any` casts
				// while remaining compatible with bitcoinjs-lib v6+ internals.
				const internal = psbt as unknown as {
					data: {
						inputs: Array<{
							witnessUtxo?: { script: Buffer; value: number };
							nonWitnessUtxo?: Buffer;
							tapKeySig?: Buffer;
						}>;
					};
					__CACHE: {
						__TX: {
							ins: Array<{ hash: Buffer; index: number }>;
							outs: Array<{ script: Buffer; value: number }>;
						};
					};
				};

				const txInputs = internal.__CACHE.__TX.ins;
				const psbtInputs = internal.data.inputs;
				const txOutputs = internal.__CACHE.__TX.outs;

				if (txInputs.length === 0) {
					throw new Error('PSBT has no inputs');
				}

				// Build Trezor-compatible inputs using the BIP86 Taproot derivation.
				// Each input is assumed to be a SPENDTAPROOT (Taproot key-path spend).
				// The derivation address_n follows the same fixed pattern as sendBitcoin
				// — all UTXOs in the same BIP86 account share the same internal key.
				const trezorInputs = txInputs.map((input, i) => {
					const psbtInput = psbtInputs[i];
					const witnessUtxo = psbtInput?.witnessUtxo;
					if (!witnessUtxo) {
						throw new Error(
							`PSBT input ${i} missing witnessUtxo data — Trezor requires witnessUtxo for Taproot signing`
						);
					}

					// bitcoinjs-lib stores tx hashes in internal (reversed) byte order.
					// Trezor expects the standard (RPC) byte order.
					const prevHash = Buffer.from(input.hash).reverse().toString('hex');

					return {
						address_n: [86 | 0x80000000, 0 | 0x80000000, 0 | 0x80000000, 0, 0] as number[],
						prev_index: input.index,
						prev_hash: prevHash,
						amount: String(witnessUtxo.value),
						script_type: 'SPENDTAPROOT' as const
					};
				});

				// Build Trezor-compatible outputs — resolve addresses from output scripts.
				const trezorOutputs = txOutputs.map((output) => {
					let outAddr = '';
					try {
						outAddr = bitcoin.address.fromOutputScript(output.script, network);
					} catch {
						// Non-addressable outputs (e.g. OP_RETURN) are left with an
						// empty address string — Trezor handles these at the protocol level.
					}

					return {
						address: outAddr,
						amount: String(output.value),
						script_type: 'PAYTOTAPROOT' as const
					};
				});

				_debug('signPSBT: %d inputs, %d outputs', trezorInputs.length, trezorOutputs.length);

				// Sign with Trezor — push:false so we add signatures to the PSBT
				// ourselves rather than broadcasting.
				const signResult = await TrezorConnect.signTransaction({
					coin: 'btc',
					inputs: trezorInputs,
					outputs: trezorOutputs,
					push: false
				});

				if (!signResult.success) {
					_warn('signPSBT Trezor signing failed: %s', signResult.error);
					throw new Error(signResult.error || 'Trezor PSBT signing rejected by device');
				}

				const signatures = signResult.payload?.signatures;
				if (!signatures || signatures.length !== txInputs.length) {
					throw new Error(
						`Trezor returned ${signatures?.length ?? 0} signatures but ${txInputs.length} were expected`
					);
				}

				// Inject each Schnorr signature into the PSBT as tapKeySig and finalize.
				for (let i = 0; i < signatures.length; i++) {
					internal.data.inputs[i].tapKeySig = Buffer.from(signatures[i], 'hex');
					psbt.finalizeInput(i);
				}

				_debug('signPSBT: successfully signed %d inputs', signatures.length);
				Sentry.addBreadcrumb({
					category: 'hw-wallet',
					message: 'Trezor PSBT signed successfully',
					level: 'info'
				});

				return psbt.toBase64();
			} catch (e) {
				_warn('signPSBT error: %s', (e as Error)?.message);
				Sentry.addBreadcrumb({
					category: 'hw-wallet',
					message: `Trezor PSBT signing failed: ${(e as Error)?.message}`,
					level: 'error'
				});
				throw e;
			}
		}
	};
}

// ---------------------------------------------------------------------------
// Shared helpers: local Taproot address derivation from xpub
// ---------------------------------------------------------------------------

/**
 * Derive a BIP86 Taproot (bech32m) address from an xpub at the given
 * receive/change sub-path. No device call needed — purely local derivation.
 *
 * Path: m/86'/0'/0'/{change}/{index}
 */
function deriveAddressFromXpub(xpub: string, change: number, index: number): Promise<string> {
	// This dynamically imports the same libraries as initChangeDerivation.
	// First call triggers the import; subsequent calls use the cached module.
	return _deriveAddressFromXpub(xpub, change, index);
}

// Module-level cache for the lazy imports — same as initChangeDerivation
let _bip32Factory: ReturnType<typeof import('bip32').BIP32Factory> | null = null;
let _bip32Master: ReturnType<ReturnType<typeof import('bip32').BIP32Factory>['fromBase58']> | null =
	null;
let _cachedXpub: string | null = null;

async function _deriveAddressFromXpub(
	xpub: string,
	change: number,
	index: number
): Promise<string> {
	if (xpub !== _cachedXpub || !_bip32Master) {
		const { BIP32Factory } = await import('bip32');
		const ecc = await import('tiny-secp256k1');
		const { initEccLib } = await import('bitcoinjs-lib');
		initEccLib(ecc);
		const bip32 = BIP32Factory(ecc);
		_bip32Master = bip32.fromBase58(xpub);
		_cachedXpub = xpub;
		_bip32Factory = bip32;
	}

	const childNode = _bip32Master!.derive(change).derive(index);
	const internalPubkey = childNode.publicKey.subarray(1, 33); // x-only
	const { payments } = await import('bitcoinjs-lib');
	return payments.p2tr({ internalPubkey }).address!;
}

// ---------------------------------------------------------------------------
// BIP86 change-address derivation (lazy, cached)
// ---------------------------------------------------------------------------

/**
 * Initialize BIP86 change address derivation from an xpub.
 *
 * Dynamically imports bip32 + bitcoinjs-lib at connection time so the
 * large libraries are never loaded unless a hardware wallet is connected.
 * Results are cached by address index.
 *
 * Derivation path: m/86'/0'/0'/1/{index}  (BIP86 change chain)
 */
async function initChangeDerivation(xpub: string): Promise<(index: number) => string> {
	_debug('initializing BIP86 change derivation...');
	try {
		const { BIP32Factory } = await import('bip32');
		const ecc = await import('tiny-secp256k1');
		const { payments, initEccLib } = await import('bitcoinjs-lib');
		initEccLib(ecc);

		const bip32 = BIP32Factory(ecc);
		const masterNode = bip32.fromBase58(xpub);
		const changeCache = new Map<number, string>();

		return (index: number): string => {
			const cached = changeCache.get(index);
			if (cached) return cached;

			const changeNode = masterNode.derive(1).derive(index);
			const internalPubkey = changeNode.publicKey.subarray(1, 33);
			const address = payments.p2tr({ internalPubkey }).address!;
			changeCache.set(index, address);
			return address;
		};
	} catch (err) {
		_warn('change derivation init failed: %s', (err as Error)?.message);
		throw new Error(
			`Failed to initialize change address derivation: ${err instanceof Error ? err.message : String(err)}`
		);
	}
}

// ---------------------------------------------------------------------------
// Standalone Bitcoin connection (separate session — Trezor runs one app at a time)
// ---------------------------------------------------------------------------

export interface TrezorBitcoinResult {
	bitcoinSigner: BitcoinSigner;
	xpub: string;
	btcAddress: string;
}

/**
 * Connect to the Trezor Bitcoin app in a SEPARATE transport session.
 * Call this AFTER connectTrezor() succeeded with ETH.
 * The user must open the Bitcoin app on their Trezor device first.
 */
export async function connectTrezorBitcoin(
	config: TrezorConnectionConfig
): Promise<TrezorBitcoinResult> {
	const info = getPlatformInfo(config.navigator);
	if (info.platform === 'ios') {
		throw new Error('Trezor not available on iOS');
	}

	// Load Trezor Connect (cached from first CDN load)
	const TrezorConnect = await _loadTrezorConnectCDN();

	const _hasWebUSB = typeof navigator !== 'undefined' && 'usb' in config.navigator;

	_debug('[BTC] initializing Trezor Connect for Bitcoin session...');
	const transports: string[] = _hasWebUSB ? ['WebUsbTransport'] : ['BridgeTransport'];
	try {
		await TrezorConnect.init({
			lazyLoad: false,
			coreMode: 'auto',
			manifest: {
				appName: 'BitTasker',
				email: 'dev@bittasker.com',
				appUrl: 'https://bittasker.com'
			},
			transports
		});
		_debug('[BTC] Trezor Connect initialized (separate BTC session)');
	} catch (e) {
		_warn('[BTC] init failed: %s', (e as Error)?.message);
		throw new Error(`Trezor Bitcoin init failed: ${(e as Error)?.message}`);
	}

	// Request xpub with device confirmation (user switches to BTC app)
	_debug('[BTC] requesting BTC xpub at path %s...', BTC_TAPROOT_PATH);
	const pkResult = await TrezorConnect.getPublicKey({
		path: BTC_TAPROOT_PATH,
		coin: 'btc',
		scriptType: 'SPENDTAPROOT',
		showOnTrezor: true
	});

	if (!pkResult.success || !pkResult.payload?.xpub) {
		const err = pkResult.payload?.error || 'Failed to get Trezor Bitcoin public key';
		_warn('[BTC] public key failed: %s', err);
		Sentry.addBreadcrumb({
			category: 'hw-wallet',
			message: 'Trezor BTC public key failed',
			level: 'error'
		});
		throw new Error(err);
	}

	const xpub = pkResult.payload.xpub;
	_debug('[BTC] xpub received');
	Sentry.addBreadcrumb({
		category: 'hw-wallet',
		message: 'Trezor BTC xpub received',
		level: 'info'
	});

	const changeDeriver = await initChangeDerivation(xpub);
	const btcAddress = await deriveAddressFromXpub(xpub, 0, 0);
	_debug('[BTC] address (locally derived): %s', btcAddress);

	const bitcoinSigner = buildBitcoinSigner(btcAddress, xpub, changeDeriver, config);

	return { bitcoinSigner, xpub, btcAddress };
}
