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
}

export const BOLTZ_NETWORKS: Record<BoltzEnvironment, BoltzNetworkConfig> = {
	regtest: {
		boltzApiUrl: 'http://localhost:9001',
		rskRpcUrl: 'http://localhost:8545',
		rskChainId: 33, // Anvil regtest
		rifRelayServerUrl: 'http://localhost:8090',
		rifRelayEnabled: true,
		// MinimalBoltzSmartWalletFactory deployed in regtest
		smartWalletFactoryAddress: '0x59b670e9fA9D0A427751Af201D676719a970857b'
	},
	mainnet: {
		boltzApiUrl: 'https://api.boltz.exchange',
		rskRpcUrl: 'https://public-node.rsk.co',
		rskChainId: 30, // RSK Mainnet
		// TODO: Find actual production RIF Relay URL from Boltz
		// Possible locations to check:
		// - Boltz Web App source: https://github.com/BoltzExchange/boltz-web-app
		// - Boltz documentation
		// - Direct communication with Boltz team
		rifRelayServerUrl: 'https://rif-relay.boltz.exchange', // Placeholder
		rifRelayEnabled: true // Set to false if production URL not available yet
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


