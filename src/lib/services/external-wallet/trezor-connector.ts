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

const BTC_TAPROOT_PATH = "m/86'/0'/0'";

export interface TrezorConnectionConfig {
	registry: ConnectorRegistry;
	navigator: Navigator;
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
		async sendTransaction(): Promise<{ txHash: string; from: string; chainId: number }> {
			throw new Error('Trezor EVM send not yet implemented');
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
		walletName: 'Trezor',
		walletType: 'trezor',
		address,
		chainIds: [30, 31, 56, 97],
		provider: null,
		evmSigner,
		bitcoinSigner,
		onEvent() {},
		unsubscribe() {
			api.dispose();
		}
	};

	return handle;
}
