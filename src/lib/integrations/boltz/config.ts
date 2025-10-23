/**
 * Boltz and RIF Relay Configuration
 * Environment-specific settings for regtest, testnet, and mainnet
 */

export type BoltzEnvironment = 'regtest' | 'mainnet';

export interface BoltzNetworkConfig {
	// Boltz API
	boltzApiUrl: string;
	
	// RSK Network
	rskRpcUrl: string;
	rskChainId: number;
	
	// RIF Relay
	rifRelayServerUrl: string;
	rifRelayEnabled: boolean;
	contracts: {
		deployHeight: number;
		smartWalletFactory: string;
		deployVerifier: string;
	};
}

export const BOLTZ_NETWORKS: Record<BoltzEnvironment, BoltzNetworkConfig> = {
	regtest: {
		boltzApiUrl: 'http://localhost:9001',
		rskRpcUrl: 'http://localhost:8545',
		rskChainId: 33, // Anvil regtest
		rifRelayServerUrl: 'http://localhost:8090',
		rifRelayEnabled: false, // RIF Relay deprecated on regtest
		contracts: {
			deployHeight: 0,
			smartWalletFactory: '0x59b670e9fA9D0A427751Af201D676719a970857b',
			deployVerifier: '0x0000000000000000000000000000000000000000'
		}
	},
	mainnet: {
		boltzApiUrl: 'https://api.boltz.exchange',
		rskRpcUrl: 'https://public-node.rsk.co',
		rskChainId: 30, // RSK Mainnet
		rifRelayServerUrl: 'https://boltz.mainnet.relay.rifcomputing.net',
		rifRelayEnabled: true,
		contracts: {
			deployHeight: 6747215,
			smartWalletFactory: '0x44944a80861120B58cc48B066d57cDAf5eC213dd',
			deployVerifier: '0xc0F5bEF6b20Be41174F826684c663a8635c6A081'
		}
	}
};

/**
 * Get current network configuration based on environment variable
 */
export function getBoltzConfig(): BoltzNetworkConfig {
	const env = (import.meta.env.VITE_BOLTZ_NETWORK || 'regtest') as BoltzEnvironment;
	
	if (!BOLTZ_NETWORKS[env]) {
		console.warn(`Unknown Boltz network: ${env}, falling back to regtest`);
		return BOLTZ_NETWORKS.regtest;
	}
	
	return BOLTZ_NETWORKS[env];
}

/**
 * Check if RIF Relay is available for current environment
 */
export function isRifRelayAvailable(): boolean {
	const config = getBoltzConfig();
	return config.rifRelayEnabled;
}

/**
 * Conversion factor: 1 satoshi = 10^10 wei on RSK
 */
export const SATOSHI_TO_WEI = 10n ** 10n;

/**
 * Convert satoshis to wei
 */
export function satoshiToWei(sats: number | bigint): bigint {
	return BigInt(sats) * SATOSHI_TO_WEI;
}

/**
 * Convert wei to satoshis
 */
export function weiToSatoshi(wei: bigint): number {
	return Number(wei / SATOSHI_TO_WEI);
}


