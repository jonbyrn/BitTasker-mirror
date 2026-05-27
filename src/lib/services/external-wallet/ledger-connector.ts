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

import type { ConnectorHandle, EVMSigner, BitcoinSigner, BitcoinSendRequest } from './types';
import type { Provider } from 'ethers';
import type { ConnectorRegistry } from './connector-registry';
import type Transport from '@ledgerhq/hw-transport';
import { DeviceDisconnectedError } from './types';
import { getPlatformInfo, getLedgerTransport } from './platform-checks';

const ETH_DERIVATION_PATH = "m/44'/60'/0'/0/0";

/** Bitcoin derivation paths tried in order (prefer Taproot, fall back to Native SegWit) */
const BTC_DERIVATION_PATHS = [
	{ path: "m/86'/0'/0'", purpose: 86, desc: 'Taproot (bc1p)' },
	{ path: "m/84'/0'/0'", purpose: 84, desc: 'Native SegWit (bc1q)' }
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
		return (await BleTransport.create()) as unknown as Transport;
	}
	const UsbTransport = (await import('@ledgerhq/hw-transport-webusb')).default;
	return (await UsbTransport.create()) as unknown as Transport;
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
				const result = await btc.getWalletXpub({
					path: dp.path,
					xpubVersion: BTC_XPUB_VERSION
				});

				// BtcNew returns a raw xpub string; BtcOld returns an object
				let rawXpub: string;
				if (typeof result === 'string') {
					rawXpub = result;
				} else {
					rawXpub = (result as Record<string, string>).publicKey ?? '';
				}
				if (!rawXpub) continue;

				// Derive the base address locally from xpub
				const address = await deriveBitcoinAddress(rawXpub, dp.purpose);

				return { xpub: rawXpub, address, derivationPath: dp.path, purpose: dp.purpose };
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
						msg.includes('CLA_NOT_SUPPORTED')
					) {
						continue; // try next path
					}
				}
				throw e;
			}
		}
	} catch {
		// Any error during BTC derivation is non-fatal — return null
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
	transport.close().catch(() => {});

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

	transport.close().catch(() => {});

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
			const ethersModule = await import('ethers');
			const EthApp = (await import('@ledgerhq/hw-app-eth')).default;
			const transport = await createLedgerTransport(config.navigator);
			const eth = new EthApp(transport);

			const provider = config.provider as ethers.Provider | null;
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
			const resolution = (await eth.resolveTransaction(
				ETH_DERIVATION_PATH,
				rawTx,
				{}
			)) as unknown as { r: string; s: string; v: string };

			const signature = ethersModule.Signature.from({
				r: resolution.r,
				s: resolution.s,
				v: parseInt(resolution.v, 16)
			});
			unsignedTx.signature = signature;

			if (!provider) throw new Error('No provider for broadcast');
			const txResponse = await provider.broadcastTransaction(unsignedTx.serialized);
			transport.close().catch(() => {});

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
		async sendBitcoin(req: BitcoinSendRequest): Promise<never> {
			const { accumulative } = await import('coinselect');
			const bitcoinjs = (await import('bitcoinjs-lib')) as unknown as {
				networks: { testnet: unknown; bitcoin: unknown };
				Psbt: {
					new (params: { network: unknown }): {
						addInput(params: unknown): unknown;
						addOutput(params: unknown): unknown;
						toBase64(): string;
						extractTransaction(): { toHex(): string };
					};
				};
				address: { toOutputScript(addr: string, network: unknown): Buffer };
			};

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
				} as unknown);
			}

			for (const output of selected.outputs as Array<{ address?: string; value: number }>) {
				psbt.addOutput({ address: output.address!, value: output.value } as unknown);
			}

			const transport = await createLedgerTransport(navigator);
			const BtcApp = (await import('@ledgerhq/hw-app-btc')).default;
			const btc = new BtcApp({ transport }) as unknown as {
				signPSBT(psbtBase64: string): Promise<unknown>;
			};

			await btc.signPSBT(psbt.toBase64());
			transport.close().catch(() => {});

			return {
				txHash: psbt.extractTransaction().toHex(),
				signedPSBT: psbt.toBase64(),
				fee: BigInt(selected.fee),
				change: BigInt(0),
				inputs: [],
				outputs: []
			} as never;
		},
		async signPSBT(psbtB64: string): Promise<string> {
			const transport = await createLedgerTransport(navigator);
			const BtcApp = (await import('@ledgerhq/hw-app-btc')).default;
			const btc = new BtcApp({ transport }) as unknown as {
				signPSBT(psbtBase64: string): Promise<[string, string[]]>;
				close(): Promise<void>;
			};
			await btc.signPSBT(psbtB64);
			transport.close().catch(() => {});
			return psbtB64;
		}
	};
}

// ---------------------------------------------------------------------------
// Bitcoin address derivation from xpub
// ---------------------------------------------------------------------------

async function deriveBitcoinAddress(xpub: string, purpose: number): Promise<string> {
	const { BIP32Factory } = await import('bip32');
	const ecc = await import('tiny-secp256k1');
	const { payments } = await import('bitcoinjs-lib');

	const bip32 = BIP32Factory(ecc);
	const masterNode = bip32.fromBase58(xpub);
	const addressNode = masterNode.derive(0).derive(0);

	if (purpose === 86) {
		const internalPubkey = addressNode.publicKey.subarray(1, 33);
		const addr = payments.p2tr({ internalPubkey }).address;
		if (!addr) throw new Error('Failed to derive Taproot address');
		return addr;
	}

	const addr = payments.p2wpkh({ pubkey: addressNode.publicKey }).address;
	if (!addr) throw new Error('Failed to derive Native SegWit address');
	return addr;
}

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
