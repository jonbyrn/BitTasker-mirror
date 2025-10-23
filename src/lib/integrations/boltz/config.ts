/**
 * Boltz and RIF Relay Configuration
 * Environment-specific settings for regtest, testnet, and mainnet
 * 
 * Supported Boltz environments:
 * 
 * - regtest: Local testing with Anvil/Hardhat
 * - mainnet: Production RSK mainnet
 * 
 * Note: Boltz doesn't support RSK testnet
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
		// Local Boltz regtest environment
		boltzApiUrl: 'http://localhost:9001',

		// Local RSK node (Anvil/Hardhat)
		rskRpcUrl: 'http://localhost:8545',
		rskChainId: 33, // Anvil default

		// RIF Relay (deprecated on regtest)
		rifRelayServerUrl: 'http://localhost:8090',
		rifRelayEnabled: false, // RIF Relay deprecated for local testing
		contracts: {
			deployHeight: 0,
			smartWalletFactory: '0x59b670e9fA9D0A427751Af201D676719a970857b',
			deployVerifier: '0x0000000000000000000000000000000000000000'
		}
	},

	mainnet: {
		// Boltz production API
		boltzApiUrl: 'https://api.boltz.exchange',

		// RSK public node
		rskRpcUrl: 'https://public-node.rsk.co',
		rskChainId: 30, // RSK Mainnet

		// RIF Relay (Boltz-hosted for mainnet)
		rifRelayServerUrl: 'https://boltz.mainnet.relay.rifcomputing.net',
		rifRelayEnabled: true,
		contracts: {
			// Contract addresses from Boltz RIF Relay deployment
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
 * 
 * RIF Relay availability:
 * - regtest: Disabled (deprecated for local testing)
 * - mainnet: Enabled (Boltz-hosted relay server)
 * 
 * @returns true if RIF Relay can be used for gasless transactions
 */
export function isRifRelayAvailable(): boolean {
	const config = getBoltzConfig();
	return config.rifRelayEnabled;
}

/**
 * Conversion factor: 1 satoshi = 10^10 wei on RSK
 * 
 * This is because:
 * - 1 BTC = 10^8 satoshis
 * - 1 RBTC = 10^18 wei
 * - Therefore: 1 satoshi = 10^18 / 10^8 = 10^10 wei
 */
export const SATOSHI_TO_WEI = 10n ** 10n;

/**
 * Convert satoshis to wei
 * 
 * @param sats - Amount in satoshis
 * @returns Amount in wei (BigInt)
 * 
 * @example
 * satoshiToWei(1000) // 10000000000000n wei (0.00001 RBTC)
 */
export function satoshiToWei(sats: number | bigint): bigint {
	return BigInt(sats) * SATOSHI_TO_WEI;
}

/**
 * Convert wei to satoshis
 * 
 * @param wei - Amount in wei (BigInt)
 * @returns Amount in satoshis (number)
 * 
 * @example
 * weiToSatoshi(10000000000000n) // 1000 sats
 */
export function weiToSatoshi(wei: bigint): number {
	return Number(wei / SATOSHI_TO_WEI);
}


/**
 * Get WebSocket endpoint for current environment
 * 
 * @returns WebSocket URL for Boltz API
 */
export function getWebSocketEndpoint(): string {
	const network = import.meta.env.VITE_BOLTZ_NETWORK || 'regtest';

	if (network === 'regtest') {
		return 'ws://localhost:9001/v2/ws';
	}

	return 'wss://api.boltz.exchange/v2/ws';
}
