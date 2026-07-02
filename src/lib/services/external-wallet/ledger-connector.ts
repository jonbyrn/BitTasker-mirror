/**
 * Ledger Connector — Hardware wallet for EVM + Bitcoin chains.
 *
 * EVM-first approach:
 * 1. Connect via WebUSB/BLE transport
 * 2. Open the Ethereum app → derive EVM address (m/44'/60'/0'/0/0)
 * 3. Optionally open the Bitcoin app → derive BTC xpub (best-effort, BIP86 → BIP84)
 *
 * Transport: BLE on mobile, WebUSB on desktop.
 * Lazy-loaded: only imported when user taps "Connect Ledger".
 * All signing methods re-establish transport on demand to avoid
 * requiring a specific app to be open during initial connection.
 */

import type {
	ConnectorHandle,
	EVMSigner,
	BitcoinSigner,
	BitcoinSendRequest,
	BitcoinSendResult
} from './types';
import type { Provider } from 'ethers';
import type { ConnectorRegistry } from './connector-registry';
import type Transport from '@ledgerhq/hw-transport';
import { DeviceDisconnectedError } from './types';
import { getPlatformInfo, getLedgerTransport } from './platform-checks';
import * as Sentry from '@sentry/sveltekit';

const ETH_DERIVATION_PATH = "m/44'/60'/0'/0/0";

/** Bitcoin derivation paths tried in order (prefer Taproot, fall back to Native SegWit).
 *  Per Ledger docs, paths are account-level WITHOUT m/ prefix: "86'/0'/0'" */
const BTC_DERIVATION_PATHS = [
	{ path: "86'/0'/0'", purpose: 86, desc: 'Taproot (bc1p)' },
	{ path: "84'/0'/0'", purpose: 84, desc: 'Native SegWit (bc1q)' }
];

/** Bitcoin mainnet xpub version bytes (0x04 0x88 0xb2 0x1e) */
const BTC_XPUB_VERSION = 0x0488b21e;

export interface LedgerConnectionConfig {
	registry: ConnectorRegistry;
	navigator: Navigator;
	provider?: Provider;
}

// ---------------------------------------------------------------------------
// Transport helpers
// ---------------------------------------------------------------------------

async function createLedgerTransport(navigator: Navigator): Promise<Transport> {
	const info = getPlatformInfo(navigator);
	const transportType = getLedgerTransport(info);

	if (transportType === 'unavailable') {
		throw new Error(
			`Ledger not available on this platform (${info.platform || 'unknown'}). ` +
				'Requires Bluetooth (mobile) or USB (desktop).'
		);
	}

	if (transportType === 'ble') {
		const BleTransport = (await import('@ledgerhq/hw-transport-web-ble')).default;
		Sentry.addBreadcrumb({
			category: 'hw-wallet',
			message: 'Ledger BLE transport opened',
			level: 'info'
		});
		return await BleTransport.create();
	}
	const UsbTransport = (await import('@ledgerhq/hw-transport-webusb')).default;
	Sentry.addBreadcrumb({
		category: 'hw-wallet',
		message: 'Ledger USB transport opened',
		level: 'info'
	});
	return await UsbTransport.create();
}

// ---------------------------------------------------------------------------
// EVM: derive address from the Ethereum app
// ---------------------------------------------------------------------------

async function deriveEVMAddress(
	transport: Transport
): Promise<{ address: string; chainId: number }> {
	const EthApp = (await import('@ledgerhq/hw-app-eth')).default;
	const eth = new EthApp(transport);

	// Derive the first address at m/44'/60'/0'/0/0
	try {
		const result = await eth.getAddress(ETH_DERIVATION_PATH);
		Sentry.addBreadcrumb({
			category: 'hw-wallet',
			message: 'Ledger EVM address derived',
			level: 'info'
		});
		return { address: result.address, chainId: 30 };
	} catch (e) {
		if (e instanceof Error) {
			const msg = e.message ?? '';
			// 0x6511 = Ethereum app execution error (wrong app, locked device, etc.)
			if (msg.includes('0x6511') || msg.includes('0x65')) {
				throw new Error(
					'Unable to connect to the Ethereum app. Please make sure the ' +
						'Ethereum (ETH) app is open on your Ledger device, then try again.'
				);
			}
			// 0x6e00 / 0x6d00 = wrong app or INS not supported
			if (msg.includes('0x6e00') || msg.includes('0x6d00')) {
				throw new Error(
					'Please open the Ethereum (ETH) app on your Ledger device and try again. ' +
						'The current app does not support this request.'
				);
			}
			if (msg.includes('disconnect') || msg.includes('DISCONNECT')) {
				throw new DeviceDisconnectedError('Ledger');
			}
		}
		throw e;
	}
}

// ---------------------------------------------------------------------------
// Bitcoin: derive xpub + address (optional, best-effort)
// ---------------------------------------------------------------------------

interface BtcResult {
	xpub: string;
	address: string;
	derivationPath: string;
	purpose: number;
}

async function deriveBTCAddress(transport: Transport): Promise<BtcResult | null> {
	try {
		const BtcApp = (await import('@ledgerhq/hw-app-btc')).default;
		const btc = new BtcApp({ transport });

		for (const dp of BTC_DERIVATION_PATHS) {
			try {
				// Get address + xpub from the device.
				// getWalletPublicKey returns { publicKey, bitcoinAddress, chainCode }
				// at a leaf-level path (m/{purpose}'/0'/0'/0/0). Then getWalletXpub
				// returns the account-level xpub for change address derivation.
				const format = (dp.purpose === 86 ? 'bech32m' : 'bech32') as 'bech32m' | 'bech32';
				const leafPath = `${dp.path}/0/0`;
				const pubKeyResult = await btc.getWalletPublicKey(leafPath, { format });
				const address = pubKeyResult.bitcoinAddress;
				if (!address) continue;

				// Get the xpub for change address derivation
				let rawXpub = '';
				try {
					const xpubResult = await btc.getWalletXpub({
						path: dp.path,
						xpubVersion: BTC_XPUB_VERSION
					});
					if (typeof xpubResult === 'string') {
						rawXpub = xpubResult;
					} else {
						rawXpub = (xpubResult as Record<string, string>).publicKey ?? '';
					}
				} catch (e) {
					console.warn(
						'[Ledger] getWalletXpub failed, building xpub from pubkey:',
						(e as Error)?.message
					);
					rawXpub = '';
				}
				if (!rawXpub && pubKeyResult.publicKey && pubKeyResult.chainCode) {
					rawXpub = await buildXpubFromPubkey(pubKeyResult.publicKey, pubKeyResult.chainCode);
				}
				if (!rawXpub) continue;

				return {
					xpub: rawXpub,
					address,
					derivationPath: dp.path,
					purpose: dp.purpose
				};
			} catch (e) {
				if (e instanceof Error) {
					const msg = e.message ?? '';
					if (msg.includes('disconnect')) {
						throw new DeviceDisconnectedError('Ledger');
					}
					if (
						msg.includes('0x6d') ||
						msg.includes('UNKNOWN_ERROR') ||
						msg.includes('TransportError') ||
						msg.includes('device') ||
						msg.includes('APP_NOT_FOUND') ||
						msg.includes('CLA_NOT_SUPPORTED') ||
						msg.includes('xpub version')
					) {
						continue; // try next path
					}
				}
				throw e;
			}
		}
	} catch (e) {
		// Any error during BTC derivation is non-fatal — return null
		console.warn('[Ledger] BTC derivation failed (non-fatal):', (e as Error)?.message);
	}
	return null;
}

// ---------------------------------------------------------------------------
// Main connection entry point
// ---------------------------------------------------------------------------

/**
 * Connect to a Ledger and derive only the Bitcoin address/xpub.
 * Used for the "Connect Bitcoin" sequential step and the "Connect Bitcoin"
 * button on existing Ledger wallet cards.
 */
export async function addBitcoinToLedger(
	config: LedgerConnectionConfig
): Promise<{ bitcoinSigner: BitcoinSigner; xpub: string; btcAddress: string }> {
	const transport = await createLedgerTransport(config.navigator);

	const btcResult = await deriveBTCAddress(transport);
	transport.close().catch((e) => console.warn('[Ledger] Transport close failed:', e));

	if (!btcResult) {
		throw new Error(
			'Could not derive Bitcoin address. Please open the Bitcoin app on your Ledger device.'
		);
	}

	const changeDeriver = await initChangeDerivation(btcResult.xpub, btcResult.purpose);
	const bitcoinSigner = buildBitcoinSigner(
		btcResult.address,
		btcResult.xpub,
		btcResult.derivationPath,
		changeDeriver
	);

	return { bitcoinSigner, xpub: btcResult.xpub, btcAddress: btcResult.address };
}

export async function connectLedger(config: LedgerConnectionConfig): Promise<ConnectorHandle> {
	const transport = await createLedgerTransport(config.navigator);

	// Step 1: Derive EVM address (always succeeds, this is the primary)
	const { address: evmAddress } = await deriveEVMAddress(transport);
	const connectorId = `ledger-${evmAddress}`;

	// Step 2: Optionally derive BTC (best-effort, user must switch to Bitcoin app)
	const btcResult = await deriveBTCAddress(transport).catch(() => null);

	transport.close().catch((e) => console.warn('[Ledger] Transport close failed:', e));

	// Build signers
	const evmSigner = buildEVMSigner(evmAddress, config);

	let bitcoinSigner: BitcoinSigner | undefined;
	if (btcResult) {
		const changeDeriver = await initChangeDerivation(btcResult.xpub, btcResult.purpose);
		bitcoinSigner = buildBitcoinSigner(
			btcResult.address,
			btcResult.xpub,
			btcResult.derivationPath,
			changeDeriver
		);
	}

	const handle: ConnectorHandle = {
		id: connectorId,
		walletName: 'Ledger',
		walletType: 'ledger',
		address: evmAddress,
		chainIds: [30, 31, 56, 97],
		provider: config.provider ?? null,
		evmSigner,
		...(bitcoinSigner ? { bitcoinSigner } : {}),
		onEvent() {},
		unsubscribe() {}
	};

	return handle;
}

// ---------------------------------------------------------------------------
// EVM signer builder
// ---------------------------------------------------------------------------

function buildEVMSigner(address: string, config: LedgerConnectionConfig): EVMSigner {
	return {
		type: 'evm' as const,
		label: 'Ledger',
		address,
		chainId: 30,
		getAddress(): string {
			return address;
		},
		isConnected(): boolean {
			return true;
		},
		async sendTransaction(tx) {
			Sentry.addBreadcrumb({
				category: 'hw-wallet',
				message: 'Ledger EVM transaction signing started',
				level: 'info'
			});
			const ethersModule = await import('ethers');
			const EthApp = (await import('@ledgerhq/hw-app-eth')).default;
			const transport = await createLedgerTransport(config.navigator);
			const eth = new EthApp(transport);

			const provider = config.provider as import('ethers').Provider | null;
			const nonce = provider ? await provider.getTransactionCount(address) : 0;

			const unsignedTx = new ethersModule.Transaction();
			unsignedTx.to = tx.to;
			if (tx.value) unsignedTx.value = tx.value;
			if (tx.data) unsignedTx.data = tx.data;
			unsignedTx.chainId = BigInt(tx.chainId);
			unsignedTx.nonce = nonce;
			unsignedTx.gasLimit =
				(await provider
					?.estimateGas({
						to: tx.to,
						value: tx.value,
						data: tx.data
					})
					.catch(() => 21000n)) || 21000n;
			unsignedTx.gasPrice =
				(await provider?.getFeeData().catch(() => null))?.gasPrice || 1_000_000_000n;

			const rawTx = unsignedTx.unsignedSerialized.slice(2);
			const resolution = await eth.clearSignTransaction(ETH_DERIVATION_PATH, rawTx, {});

			const signature = ethersModule.Signature.from({
				r: resolution.r,
				s: resolution.s,
				v: parseInt(resolution.v, 16)
			});
			unsignedTx.signature = signature;

			if (!provider) throw new Error('No provider for broadcast');
			const txResponse = await provider.broadcastTransaction(unsignedTx.serialized);
			transport.close().catch((e) => console.warn('[Ledger] Transport close failed:', e));

			return { txHash: txResponse.hash, from: address, chainId: tx.chainId };
		}
	};
}

// ---------------------------------------------------------------------------
// Bitcoin signer builder
// ---------------------------------------------------------------------------

function buildBitcoinSigner(
	address: string,
	xpub: string,
	derivationPath: string,
	changeDeriver: (index: number) => string
): BitcoinSigner {
	return {
		type: 'bitcoin' as const,
		label: 'Ledger',
		address,
		xpub,
		derivationPath,
		getAddress(): string {
			return address;
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
			const { accumulative } = await import('coinselect');
			const bitcoinjs = (await import('bitcoinjs-lib')) as typeof import('bitcoinjs-lib');

			const apiBase = 'https://mempool.space/testnet/api';

			const utxosResp = await fetch(`${apiBase}/address/${address}/utxo`);
			if (!utxosResp.ok) throw new Error('Failed to fetch UTXOs');
			const rawUtxos = (await utxosResp.json()) as Array<{
				txid: string;
				vout: number;
				value: number;
			}>;

			const feeResp = await fetch(`${apiBase}/v1/fees/recommended`);
			const fees = (await feeResp.json()) as { fastestFee: number };

			const selected = accumulative(
				rawUtxos.map((u) => ({ txId: u.txid, vout: u.vout, value: u.value })),
				Number(req.amount),
				fees.fastestFee
			);
			if (!selected.inputs || !selected.outputs) throw new Error('Insufficient funds');

			const psbt = new bitcoinjs.Psbt({ network: bitcoinjs.networks.testnet });

			for (const input of selected.inputs as Array<{ txId: string; vout: number; value: number }>) {
				psbt.addInput({
					hash: input.txId,
					index: input.vout,
					witnessUtxo: {
						script: bitcoinjs.address.toOutputScript(address, bitcoinjs.networks.testnet),
						value: input.value
					},
					sequence: 0xfffffffd
				});
			}

			for (const output of selected.outputs as Array<{ address?: string; value: number }>) {
				psbt.addOutput({ address: output.address!, value: output.value });
			}

			const transport = await createLedgerTransport(navigator);
			const BtcApp = (await import('@ledgerhq/hw-app-btc')).default;
			const btc = new BtcApp({ transport }) as unknown as {
				signPSBT(psbtBase64: string): Promise<unknown>;
			};

			await btc.signPSBT(psbt.toBase64());
			transport.close().catch((e) => console.warn('[Ledger] Transport close failed:', e));

			return {
				txHash: psbt.extractTransaction().toHex(),
				signedPSBT: psbt.toBase64(),
				fee: BigInt(selected.fee),
				change: BigInt(0),
				inputs: [],
				outputs: []
			} as BitcoinSendResult;
		},
		async signPSBT(psbtB64: string): Promise<string> {
			const transport = await createLedgerTransport(navigator);
			const BtcApp = (await import('@ledgerhq/hw-app-btc')).default;
			const btc = new BtcApp({ transport }) as unknown as {
				signPSBT(psbtBase64: string): Promise<[string, string[]]>;
				close(): Promise<void>;
			};
			await btc.signPSBT(psbtB64);
			transport.close().catch((e) => console.warn('[Ledger] Transport close failed:', e));
			return psbtB64;
		}
	};
}

// ---------------------------------------------------------------------------
// Construct xpub from publicKey + chainCode (fallback when getWalletXpub
// xpub version validation fails on certain firmware combinations)
// ---------------------------------------------------------------------------

async function buildXpubFromPubkey(publicKeyHex: string, chainCodeHex: string): Promise<string> {
	const bs58check = (await import('bs58check')).default;

	// BIP32 mainnet xpub version bytes: 0x04 0x88 0xb2 0x1e
	const version = Buffer.alloc(4);
	version.writeUInt32BE(0x0488b21e, 0);

	// Depth = 3 (m/purpose'/coin_type'/account')
	const depth = Buffer.from([3]);

	// Parent fingerprint = 0x00000000 (master root fingerprint unknown at account level)
	const parentFingerprint = Buffer.alloc(4, 0);

	// Child number = account index (0 = first account)
	const childNumber = Buffer.alloc(4);
	childNumber.writeUInt32BE(0x80000000, 0); // hardened

	// ChainCode (32 bytes) from getWalletPublicKey result
	const chainCode = Buffer.from(chainCodeHex, 'hex');
	if (chainCode.length !== 32) throw new Error('Invalid chainCode length');

	// PublicKey (33 bytes compressed) from getWalletPublicKey result
	const publicKey = Buffer.from(publicKeyHex, 'hex');
	if (publicKey.length !== 33) throw new Error('Invalid publicKey length');

	const xpubBytes = Buffer.concat([
		version,
		depth,
		parentFingerprint,
		childNumber,
		chainCode,
		publicKey
	]);
	return bs58check.encode(xpubBytes);
}

// ---------------------------------------------------------------------------
// Bitcoin address derivation from xpub (fallback when getWalletPublicKey
// isn't supported by the device firmware)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Change address derivation (BIP86 / BIP84)
// ---------------------------------------------------------------------------

async function initChangeDerivation(
	xpub: string,
	purpose: number
): Promise<(index: number) => string> {
	const { BIP32Factory } = await import('bip32');
	const ecc = await import('tiny-secp256k1');
	const { payments } = await import('bitcoinjs-lib');

	const bip32 = BIP32Factory(ecc);
	const masterNode = bip32.fromBase58(xpub);
	const changeCache = new Map<number, string>();

	return (index: number): string => {
		const cached = changeCache.get(index);
		if (cached) return cached;

		const changeNode = masterNode.derive(1).derive(index);

		let addr: string | undefined;
		if (purpose === 86) {
			const internalPubkey = changeNode.publicKey.subarray(1, 33);
			addr = payments.p2tr({ internalPubkey }).address;
		} else {
			addr = payments.p2wpkh({ pubkey: changeNode.publicKey }).address;
		}

		if (!addr) throw new Error(`Failed to derive change address for index ${index}`);
		changeCache.set(index, addr);
		return addr;
	};
}
