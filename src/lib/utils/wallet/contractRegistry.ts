/**
 * Contract Registry
 * 
 * Centralized registry for tracking contract addresses across networks and environments.
 * Tracks both current and legacy contract addresses for backward compatibility.
 * Internal use only - contract version information is not exposed to users.
 */

type Network = 'rsk' | 'bsc';
type Environment = 'mainnet' | 'testnet';

interface ContractAddresses {
	current: string | null;
	legacy: string[];
}

interface NetworkContracts {
	escrow: ContractAddresses;
	etherSwap: ContractAddresses;
}

interface ContractRegistry {
	rsk: {
		mainnet: NetworkContracts;
		testnet: NetworkContracts;
	};
	bsc: {
		mainnet: NetworkContracts;
	};
}

// Internal registry (not exposed to users)
const registry: ContractRegistry = {
	rsk: {
		mainnet: {
			escrow: {
				current: null,
				legacy: []
			},
			etherSwap: {
				current: null,
				legacy: []
			}
		},
		testnet: {
			escrow: {
				current: null,
				legacy: []
			},
			etherSwap: {
				current: null,
				legacy: []
			}
		}
	},
	bsc: {
		mainnet: {
			escrow: {
				current: null,
				legacy: []
			},
			etherSwap: {
				current: null,
				legacy: []
			}
		}
	}
};

/**
 * Initialize contract registry with addresses from environment variables
 */
export function initializeContractRegistry(): void {
	const rskNetwork = (import.meta.env.VITE_RSK_NETWORK || 'testnet') as Environment;
	
	// RSK Escrow contracts
	registry.rsk.mainnet.escrow.current = import.meta.env.VITE_RSK_CONTRACT_ADDRESS_MAINNET || null;
	registry.rsk.testnet.escrow.current = import.meta.env.VITE_RSK_CONTRACT_ADDRESS_TESTNET || null;
	
	// BSC Escrow contract
	registry.bsc.mainnet.escrow.current = import.meta.env.VITE_BSC_CONTRACT_ADDRESS || null;
	
	// Normalize addresses to lowercase
	if (registry.rsk.mainnet.escrow.current) {
		registry.rsk.mainnet.escrow.current = registry.rsk.mainnet.escrow.current.toLowerCase();
	}
	if (registry.rsk.testnet.escrow.current) {
		registry.rsk.testnet.escrow.current = registry.rsk.testnet.escrow.current.toLowerCase();
	}
	if (registry.bsc.mainnet.escrow.current) {
		registry.bsc.mainnet.escrow.current = registry.bsc.mainnet.escrow.current.toLowerCase();
	}
}

/**
 * Get escrow contract address for a given network and environment
 */
export function getEscrowContractAddress(
	network: Network,
	environment: Environment
): string | null {
	if (network === 'rsk') {
		return registry.rsk[environment].escrow.current;
	} else if (network === 'bsc' && environment === 'mainnet') {
		return registry.bsc.mainnet.escrow.current;
	}
	return null;
}

/**
 * Get EtherSwap contract address for a given network and environment
 */
export function getEtherSwapContractAddress(
	network: Network,
	environment: Environment
): string | null {
	if (network === 'rsk') {
		return registry.rsk[environment].etherSwap.current;
	}
	return null;
}

/**
 * Set EtherSwap contract address (fetched from Boltz API)
 */
export function setEtherSwapContractAddress(
	network: Network,
	environment: Environment,
	address: string
): void {
	if (network === 'rsk') {
		registry.rsk[environment].etherSwap.current = address.toLowerCase();
	}
}

/**
 * Check if an address is a known contract (current or legacy)
 */
export function isKnownContract(
	address: string,
	network: Network,
	environment: Environment
): { isKnown: boolean; contractType: 'escrow' | 'etherSwap' | null; isCurrent: boolean } {
	const normalizedAddress = address.toLowerCase();
	
	// Check escrow contracts
	const escrowCurrent = getEscrowContractAddress(network, environment);
	if (escrowCurrent && normalizedAddress === escrowCurrent) {
		return { isKnown: true, contractType: 'escrow', isCurrent: true };
	}
	
	const escrowContracts = network === 'rsk' 
		? registry.rsk[environment].escrow
		: registry.bsc.mainnet.escrow;
	
	if (escrowContracts.legacy.includes(normalizedAddress)) {
		return { isKnown: true, contractType: 'escrow', isCurrent: false };
	}
	
	// Check EtherSwap contracts
	const etherSwapCurrent = getEtherSwapContractAddress(network, environment);
	if (etherSwapCurrent && normalizedAddress === etherSwapCurrent) {
		return { isKnown: true, contractType: 'etherSwap', isCurrent: true };
	}
	
	const etherSwapContracts = network === 'rsk'
		? registry.rsk[environment].etherSwap
		: { current: null, legacy: [] };
	
	if (etherSwapContracts.legacy.includes(normalizedAddress)) {
		return { isKnown: true, contractType: 'etherSwap', isCurrent: false };
	}
	
	return { isKnown: false, contractType: null, isCurrent: false };
}

/**
 * Add a legacy contract address (for backward compatibility)
 */
export function addLegacyContract(
	address: string,
	network: Network,
	environment: Environment,
	contractType: 'escrow' | 'etherSwap'
): void {
	const normalizedAddress = address.toLowerCase();
	
	if (network === 'rsk') {
		if (!registry.rsk[environment][contractType].legacy.includes(normalizedAddress)) {
			registry.rsk[environment][contractType].legacy.push(normalizedAddress);
		}
	} else if (network === 'bsc' && environment === 'mainnet') {
		if (contractType === 'escrow' && !registry.bsc.mainnet.escrow.legacy.includes(normalizedAddress)) {
			registry.bsc.mainnet.escrow.legacy.push(normalizedAddress);
		}
	}
}

// Initialize registry on module load
initializeContractRegistry();

