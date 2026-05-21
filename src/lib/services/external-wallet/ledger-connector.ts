/**
 * Ledger Connector — Hardware wallet for Bitcoin L1 + EVM chains.
 *
 * Bitcoin: BIP86 Taproot (m/86'/0'/0' — bc1p... addresses)
 * Transport: BLE on mobile, WebUSB on desktop.
 * Lazy-loaded: only imported when user taps "Connect Ledger".
 */

import type { ConnectorHandle, EVMSigner, BitcoinSigner, BitcoinSendRequest } from './types';
import type { Provider } from 'ethers';
import type { ConnectorRegistry } from './connector-registry';
import { DeviceDisconnectedError } from './types';
import { getPlatformInfo, getLedgerTransport } from './platform-checks';

const BTC_TAPROOT_PATH = "m/86'/0'/0'";

export interface LedgerConnectionConfig {
	registry: ConnectorRegistry;
	navigator: Navigator;
	provider?: Provider;
}

export async function connectLedger(config: LedgerConnectionConfig): Promise<ConnectorHandle> {
	const info = getPlatformInfo(config.navigator);
	const transportType = getLedgerTransport(info);

	if (transportType === 'unavailable') {
		throw new Error(
			`Ledger not available on this platform (${info.platform || 'unknown'}). ` +
				'Requires Bluetooth (mobile) or USB (desktop).'
		);
	}

	let transport: { close(): Promise<void> };
	let address: string;
	let xpub: string;

	try {
		if (transportType === 'ble') {
			const BleTransport = (await import('@ledgerhq/hw-transport-web-ble')).default;
			transport = (await BleTransport.create()) as unknown as { close(): Promise<void> };
		} else {
			const UsbTransport = (await import('@ledgerhq/hw-transport-webusb')).default;
			transport = (await UsbTransport.create()) as unknown as { close(): Promise<void> };
		}

		const BtcApp = (await import('@ledgerhq/hw-app-btc')).default;
		const btc = new BtcApp({
			transport: transport as unknown as import('@ledgerhq/hw-transport').default
		}) as unknown as {
			getWalletXpub(params: {
				path: string;
			}): Promise<{ publicKey: string; bitcoinAddress?: string }>;
			close(): Promise<void>;
		};

		const xpubInfo = await btc.getWalletXpub({ path: BTC_TAPROOT_PATH });
		xpub = xpubInfo.publicKey;
		if (!xpubInfo.bitcoinAddress) {
			throw new Error(
				'Failed to derive Ledger Bitcoin address. Ensure the Bitcoin app is open on your device.'
			);
		}
		address = xpubInfo.bitcoinAddress;
	} catch (error) {
		if (error instanceof Error && error.message?.includes('disconnect')) {
			throw new DeviceDisconnectedError('Ledger');
		}
		throw error;
	}

	// Pre-initialize BIP86 derivation for Taproot change addresses (lazy, cached)
	const changeDeriver = await initChangeDerivation(xpub);

	const connectorId = `ledger-${address}`;

	const evmSigner: EVMSigner = {
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
		async sendTransaction(tx): Promise<{ txHash: string; from: string; chainId: number }> {
			const ethersModule = await import('ethers');
			const EthApp = (await import('@ledgerhq/hw-app-eth')).default;

			// Re-establish transport for signing
			const transportType = getLedgerTransport(getPlatformInfo(config.navigator));
			let transport: { close(): Promise<void> };
			if (transportType === 'ble') {
				transport = (await (
					await import('@ledgerhq/hw-transport-web-ble')
				).default.create()) as unknown as { close(): Promise<void> };
			} else {
				transport = (await (
					await import('@ledgerhq/hw-transport-webusb')
				).default.create()) as unknown as { close(): Promise<void> };
			}

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

			const rawTx = unsignedTx.unsignedSerialized.slice(2); // strip 0x
			const resolution = (await eth.resolveTransaction(
				"m/44'/60'/0'/0/0",
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

	const bitcoinSigner: BitcoinSigner = {
		type: 'bitcoin' as const,
		label: 'Ledger',
		address,
		xpub,
		derivationPath: BTC_TAPROOT_PATH,
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

			// Re-establish transport and sign
			const transportType = getLedgerTransport(getPlatformInfo(config.navigator));
			let transport: { close(): Promise<void> };
			if (transportType === 'ble') {
				transport = (await (
					await import('@ledgerhq/hw-transport-web-ble')
				).default.create()) as unknown as { close(): Promise<void> };
			} else {
				transport = (await (
					await import('@ledgerhq/hw-transport-webusb')
				).default.create()) as unknown as { close(): Promise<void> };
			}

			const BtcApp = (await import('@ledgerhq/hw-app-btc')).default;
			const btc = new BtcApp({ transport: transport as unknown as never }) as unknown as {
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
			const transportType = getLedgerTransport(getPlatformInfo(config.navigator));
			let transport: { close(): Promise<void> };
			if (transportType === 'ble') {
				transport = (await (
					await import('@ledgerhq/hw-transport-web-ble')
				).default.create()) as unknown as { close(): Promise<void> };
			} else {
				transport = (await (
					await import('@ledgerhq/hw-transport-webusb')
				).default.create()) as unknown as { close(): Promise<void> };
			}
			const BtcApp = (await import('@ledgerhq/hw-app-btc')).default;
			const btc = new BtcApp({
				transport: transport as unknown as import('@ledgerhq/hw-transport').default
			}) as unknown as {
				signPSBT(psbtBase64: string): Promise<[string, string[]]>;
				close(): Promise<void>;
			};
			await btc.signPSBT(psbtB64);
			transport.close().catch(() => {});
			return psbtB64;
		}
	};

	const handle: ConnectorHandle = {
		id: connectorId,
		walletName: 'Ledger',
		walletType: 'ledger',
		address,
		chainIds: [30, 31, 56, 97],
		provider: config.provider ?? null,
		evmSigner,
		bitcoinSigner,
		onEvent() {},
		unsubscribe() {
			transport.close().catch(() => {});
		}
	};

	return handle;
}

// ---------------------------------------------------------------------------
// Shared helper: BIP86 change-address derivation (lazy, cached)
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
	try {
		const { BIP32Factory } = await import('bip32');
		const ecc = await import('tiny-secp256k1');
		const { payments } = await import('bitcoinjs-lib');

		const bip32 = BIP32Factory(ecc);
		const masterNode = bip32.fromBase58(xpub);
		const changeCache = new Map<number, string>();

		return (index: number): string => {
			const cached = changeCache.get(index);
			if (cached) return cached;

			// Derive m/86'/0'/0'/1/{index}
			const changeNode = masterNode.derive(1).derive(index);

			// toXOnly: strip the first byte (parity prefix) from the
			// 33-byte compressed public key, leaving the 32-byte x-only key.
			const internalPubkey = changeNode.publicKey.subarray(1, 33);
			const address = payments.p2tr({ internalPubkey }).address!;
			changeCache.set(index, address);
			return address;
		};
	} catch (err) {
		throw new Error(
			`Failed to initialize change address derivation: ${err instanceof Error ? err.message : String(err)}`
		);
	}
}
