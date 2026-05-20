/**
 * Ledger Connector — Hardware wallet for Bitcoin L1 + EVM chains.
 *
 * Bitcoin: BIP86 Taproot (m/86'/0'/0' — bc1p... addresses)
 * Transport: BLE on mobile, WebUSB on desktop.
 * Lazy-loaded: only imported when user taps "Connect Ledger".
 */

import type { ConnectorHandle, EVMSigner, BitcoinSigner } from './types';
import type { ConnectorRegistry } from './connector-registry';
import { DeviceDisconnectedError } from './types';
import { getPlatformInfo, getLedgerTransport } from './platform-checks';

const BTC_TAPROOT_PATH = "m/86'/0'/0'";

export interface LedgerConnectionConfig {
	registry: ConnectorRegistry;
	navigator: Navigator;
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
			const BleTransport = (await import('@ledgerhq/hw-transport-webusb')).default;
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
		address = xpubInfo.bitcoinAddress || xpubInfo.publicKey.slice(0, 42);
	} catch (error) {
		if (error instanceof Error && error.message?.includes('disconnect')) {
			throw new DeviceDisconnectedError('Ledger');
		}
		throw error;
	}

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
		async sendTransaction(): Promise<{ txHash: string; from: string; chainId: number }> {
			throw new Error('Ledger EVM send not yet implemented');
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
		deriveChangeAddress(): string {
			return '';
		},
		async sendBitcoin(): Promise<never> {
			throw new Error('Bitcoin send not yet implemented');
		},
		async signPSBT(): Promise<string> {
			throw new Error('PSBT signing not yet implemented');
		}
	};

	const handle: ConnectorHandle = {
		id: connectorId,
		walletName: 'Ledger',
		walletType: 'ledger',
		address,
		chainIds: [30, 31, 56, 97],
		provider: null,
		evmSigner,
		bitcoinSigner,
		onEvent() {},
		unsubscribe() {
			transport.close().catch(() => {});
		}
	};

	return handle;
}
