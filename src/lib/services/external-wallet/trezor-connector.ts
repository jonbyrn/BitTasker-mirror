/**
 * Trezor Connector — Hardware wallet for Bitcoin L1 + EVM chains.
 *
 * Bitcoin: BIP86 Taproot (m/86'/0'/0' — bc1p... addresses)
 * Lazy-loaded: only imported when user taps "Connect Trezor".
 */

import type { ConnectorHandle, EVMSigner, BitcoinSigner } from './types';
import type { ConnectorRegistry } from './connector-registry';
import { UserCancelledError } from './types';
import { getPlatformInfo } from './platform-checks';
import type { Provider } from 'ethers';

const BTC_TAPROOT_PATH = "m/86'/0'/0'";
const EVM_PATH = "m/44'/60'/0'/0/0";

export interface TrezorConnectionConfig {
	registry: ConnectorRegistry;
	navigator: Navigator;
	provider?: Provider;
}

export async function connectTrezor(config: TrezorConnectionConfig): Promise<ConnectorHandle> {
	const info = getPlatformInfo(config.navigator);
	if (info.platform === 'ios') {
		throw new Error('Trezor not available on iOS');
	}

	const TrezorConnect = await import('@trezor/connect-web');
	const api = TrezorConnect as unknown as {
		init(params: Record<string, unknown>): Promise<void>;
		dispose(): void;
		getPublicKey(params: {
			path: string;
			coin: string;
			showOnTrezor?: boolean;
		}): Promise<{ success: boolean; payload?: { xpub?: string; error?: string } }>;
		getAddress(params: {
			path: string;
			coin: string;
			showOnTrezor?: boolean;
		}): Promise<{ success: boolean; payload?: { address?: string; error?: string } }>;
	};

	await api.init({
		lazyLoad: true,
		manifest: {
			email: 'dev@bittasker.com',
			appUrl: 'https://bittasker.com'
		}
	});

	const pkResult = await api.getPublicKey({
		path: BTC_TAPROOT_PATH,
		coin: 'btc',
		showOnTrezor: true
	});

	if (!pkResult.success || !pkResult.payload?.xpub) {
		if (pkResult.payload?.error?.includes('cancelled')) throw new UserCancelledError();
		throw new Error(pkResult.payload?.error || 'Failed to get Trezor public key');
	}

	const xpub = pkResult.payload.xpub;

	// Pre-initialize BIP86 derivation for Taproot change addresses (lazy, cached)
	const changeDeriver = await initChangeDerivation(xpub);

	const addrResult = await api.getAddress({
		path: `${BTC_TAPROOT_PATH}/0/0`,
		coin: 'btc',
		showOnTrezor: false
	});

	if (!addrResult.success || !addrResult.payload?.address) {
		throw new Error('Failed to derive Trezor address. Please try again.');
	}
	const address = addrResult.payload.address;

	const connectorId = `trezor-${address}`;

	const evmSigner: EVMSigner = {
		type: 'evm' as const,
		label: 'Trezor',
		address,
		chainId: 30,
		getAddress(): string {
			return address;
		},
		isConnected(): boolean {
			return true;
		},
		async sendTransaction(tx): Promise<{ txHash: string; from: string; chainId: number }> {
			const TrezorConnect = await import('@trezor/connect-web');
			const ethersModule = await import('ethers');

			// Get nonce from config provider if available
			const provider = config.provider as Provider | null;
			const nonce = provider ? await provider.getTransactionCount(address) : 0;

			const txParams = {
				to: tx.to,
				value: tx.value ? ethersModule.toQuantity(tx.value) : '0x0',
				data: tx.data || '0x',
				chainId: tx.chainId,
				nonce: ethersModule.toQuantity(nonce),
				gasLimit:
					(await provider
						?.estimateGas({
							to: tx.to,
							value: tx.value,
							data: tx.data
						})
						.catch(() => ethersModule.toQuantity(21000))) || ethersModule.toQuantity(21000),
				gasPrice: ethersModule.toQuantity(
					(await provider?.getFeeData().catch(() => null))?.gasPrice || 1_000_000_000n
				)
			};

			const result = await (
				TrezorConnect as unknown as {
					ethereumSignTransaction(params: {
						path: string;
						transaction: {
							to: string;
							value: string;
							data: string;
							chainId: number;
							nonce: string;
							gasLimit: string;
							gasPrice: string;
						};
					}): Promise<{
						success: boolean;
						payload?: { r: string; s: string; v: string };
						error?: string;
					}>;
				}
			).ethereumSignTransaction({
				path: `${EVM_PATH}/0/0`,
				transaction: txParams
			});

			if (!result.success) {
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
			}).serialized;

			if (!provider) throw new Error('No provider configured for broadcast');
			const txResponse = await provider.broadcastTransaction(signedTx);
			return { txHash: txResponse.hash, from: address, chainId: tx.chainId };
		}
	};

	const bitcoinSigner: BitcoinSigner = {
		type: 'bitcoin' as const,
		label: 'Trezor',
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
			const bitcoin = await import('bitcoinjs-lib');
			const { fromXpub, toXOnly } = (
				bitcoin as {
					BIP32Factory?: unknown;
					payments?: { p2tr: (params: { internalPubkey: Buffer }) => { address: string } };
					Psbt: {
						new (params: { network: unknown }): {
							addInput(params: unknown): unknown;
							addOutput(params: unknown): unknown;
							signInput(index: number): void;
							finalizeInput(index: number): void;
							extractTransaction(): { toHex(): string };
						};
					};
				}
			).Psbt;

			// Fetch UTXOs and fee rate from mempool.space
			const network = config.provider ? 'mainnet' : 'testnet';
			const apiBase =
				network === 'mainnet' ? 'https://mempool.space/api' : 'https://mempool.space/testnet/api';

			const utxosResp = await fetch(`${apiBase}/address/${address}/utxo`);
			if (!utxosResp.ok) throw new Error('Failed to fetch UTXOs');
			const rawUtxos = (await utxosResp.json()) as Array<{
				txid: string;
				vout: number;
				value: number;
			}>;

			const feeResp = await fetch(`${apiBase}/v1/fees/recommended`);
			if (!feeResp.ok) throw new Error('Failed to fetch fee rate');
			const fees = (await feeResp.json()) as { fastestFee: number };

			// UTXO selection — accumulative algorithm
			const utxosForSelect = rawUtxos.map((u) => ({
				txId: u.txid,
				vout: u.vout,
				value: u.value,
				...(u.value > 0 ? {} : {})
			}));

			const selected = accumulative(utxosForSelect, Number(req.amount), fees.fastestFee);
			if (!selected.inputs || !selected.outputs) throw new Error('Insufficient funds');

			// Build PSBT
			const bitcoinNetwork =
				network === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
			const psbt = new bitcoin.Psbt({ network: bitcoinNetwork });

			// Add inputs
			for (const input of selected.inputs as Array<{ txId: string; vout: number; value: number }>) {
				psbt.addInput({
					hash: input.txId,
					index: input.vout,
					witnessUtxo: {
						script: bitcoin.address.toOutputScript(address, bitcoinNetwork),
						value: BigInt(input.value)
					},
					tapInternalKey: toXOnly(fromXpub(xpub).derive(0).derive(0).publicKey),
					sequence: 0xfffffffd // RBF
				});
			}

			// Add outputs
			for (const output of selected.outputs as Array<{ address?: string; value: number }>) {
				psbt.addOutput({
					address: output.address!,
					value: BigInt(output.value)
				});
			}

			// Sign with Trezor
			const TrezorConnect = await import('@trezor/connect-web');
			const signResult = await (
				TrezorConnect as unknown as {
					signTransaction(params: {
						coin: string;
						inputs: Array<{
							address_n: number[];
							prev_index: number;
							prev_hash: string;
							amount: string;
							script_type: string;
						}>;
						outputs: Array<{
							address: string;
							amount: string;
							script_type: string;
						}>;
						push?: boolean;
					}): Promise<{
						success: boolean;
						payload?: { signatures: string[]; serializedTx: string };
						error?: string;
					}>;
				}
			).signTransaction({
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
				throw new Error(signResult.error || 'Trezor signing rejected');
			}

			return {
				txHash: signResult.payload!.serializedTx,
				signedPSBT: signResult.payload!.serializedTx,
				fee: BigInt(selected.fee),
				change: BigInt(0),
				inputs: [],
				outputs: []
			} as never;
		},
		async signPSBT(): Promise<string> {
			throw new Error('Raw PSBT signing not yet implemented');
		}
	};

	const handle: ConnectorHandle = {
		id: connectorId,
		walletName: 'Trezor',
		walletType: 'trezor',
		address,
		chainIds: [30, 31, 56, 97],
		provider: config.provider ?? null,
		evmSigner,
		bitcoinSigner,
		onEvent() {},
		unsubscribe() {
			api.dispose();
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
