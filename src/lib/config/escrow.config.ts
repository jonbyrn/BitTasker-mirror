// Escrow Contract Configuration
// This file handles environment-based configuration for the escrow contract

import { browser } from '$app/environment';
import { 
    TEST_CONTRACT_ADDRESS, 
    TEST_CONTRACT_ABI, 
    type ContractConfig 
} from '$lib/contracts/SimplifiedEscrowContract';

// Environment variable keys
export const ENV_KEYS = {
    ESCROW_CONTRACT_ADDRESS: 'VITE_ESCROW_CONTRACT_ADDRESS',
    ESCROW_CONTRACT_ABI: 'VITE_ESCROW_CONTRACT_ABI',
    RSK_NETWORK: 'VITE_RSK_NETWORK',
    RSK_RPC_URL_MAINNET: 'VITE_RSK_RPC_URL_MAINNET',
    RSK_RPC_URL_TESTNET: 'VITE_RSK_RPC_URL_TESTNET'
} as const;

// Default configuration values
export const DEFAULT_CONFIG = {
    NETWORK: 'testnet' as 'mainnet' | 'testnet',
    RPC_URLS: {
        mainnet: 'https://public-node.rsk.co',
        testnet: 'https://public-node.testnet.rsk.co'
    },
    EXPLORER_URLS: {
        mainnet: 'https://explorer.rsk.co',
        testnet: 'https://explorer.testnet.rsk.co'
    }
} as const;

/**
 * Get environment variable value with fallback
 */
function getEnvVar(key: string, fallback?: string): string | undefined {
    if (!browser) return fallback;
    
    // In Vite, environment variables are available as import.meta.env
    const value = import.meta.env[key];
    return value || fallback;
}

/**
 * Get contract configuration from environment or use test data
 */
export function getEscrowContractConfig(network: 'mainnet' | 'testnet'): ContractConfig {
    const contractAddress = getEnvVar(ENV_KEYS.ESCROW_CONTRACT_ADDRESS, TEST_CONTRACT_ADDRESS);
    const contractABI = getEnvVar(ENV_KEYS.ESCROW_CONTRACT_ABI);
    
    let abi;
    try {
        abi = contractABI ? JSON.parse(contractABI) : TEST_CONTRACT_ABI;
    } catch (error) {
        console.warn('Failed to parse contract ABI from environment, using test ABI:', error);
        abi = TEST_CONTRACT_ABI;
    }
    
    return {
        address: contractAddress,
        abi,
        network
    };
}

/**
 * Get RSK network configuration
 */
export function getRSKNetworkConfig() {
    const network = getEnvVar(ENV_KEYS.RSK_NETWORK, DEFAULT_CONFIG.NETWORK) as 'mainnet' | 'testnet';
    const mainnetRpc = getEnvVar(ENV_KEYS.RSK_RPC_URL_MAINNET, DEFAULT_CONFIG.RPC_URLS.mainnet);
    const testnetRpc = getEnvVar(ENV_KEYS.RSK_RPC_URL_TESTNET, DEFAULT_CONFIG.RPC_URLS.testnet);
    
    return {
        defaultNetwork: network,
        rpcUrls: {
            mainnet: mainnetRpc,
            testnet: testnetRpc
        },
        explorerUrls: DEFAULT_CONFIG.EXPLORER_URLS
    };
}

/**
 * Check if we're using production contract configuration
 */
export function isProductionConfig(): boolean {
    const contractAddress = getEnvVar(ENV_KEYS.ESCROW_CONTRACT_ADDRESS);
    return contractAddress !== undefined && contractAddress !== TEST_CONTRACT_ADDRESS;
}

/**
 * Get contract deployment status
 */
export function getContractDeploymentStatus(): {
    isDeployed: boolean;
    isTestnet: boolean;
    address: string;
    network: 'mainnet' | 'testnet';
} {
    const config = getRSKNetworkConfig();
    const contractConfig = getEscrowContractConfig(config.defaultNetwork);
    
    return {
        isDeployed: isProductionConfig(),
        isTestnet: config.defaultNetwork === 'testnet',
        address: contractConfig.address,
        network: config.defaultNetwork
    };
}

/**
 * Validate contract configuration
 */
export function validateContractConfig(): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
} {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const contractAddress = getEnvVar(ENV_KEYS.ESCROW_CONTRACT_ADDRESS);
    const contractABI = getEnvVar(ENV_KEYS.ESCROW_CONTRACT_ABI);
    
    // Check contract address
    if (!contractAddress) {
        warnings.push('No contract address provided, using test address');
    } else if (contractAddress === TEST_CONTRACT_ADDRESS) {
        warnings.push('Using test contract address');
    } else if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
        errors.push('Invalid contract address format');
    }
    
    // Check contract ABI
    if (!contractABI) {
        warnings.push('No contract ABI provided, using test ABI');
    } else {
        try {
            const parsed = JSON.parse(contractABI);
            if (!Array.isArray(parsed)) {
                errors.push('Contract ABI must be a JSON array');
            }
        } catch (error) {
            errors.push('Invalid JSON format for contract ABI');
        }
    }
    
    // Check network configuration
    const networkConfig = getRSKNetworkConfig();
    if (!networkConfig.rpcUrls.mainnet || !networkConfig.rpcUrls.testnet) {
        errors.push('Missing RPC URL configuration');
    }
    
    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Log configuration status for debugging
 */
export function logConfigurationStatus(): void {
    if (!browser) return;
    
    const validation = validateContractConfig();
    const deployment = getContractDeploymentStatus();
    
    console.group('🔧 Escrow Contract Configuration');
    console.log('Network:', deployment.network);
    console.log('Contract Address:', deployment.address);
    console.log('Is Production:', deployment.isDeployed);
    console.log('Is Testnet:', deployment.isTestnet);
    
    if (validation.warnings.length > 0) {
        console.group('⚠️ Warnings');
        validation.warnings.forEach(warning => console.warn(warning));
        console.groupEnd();
    }
    
    if (validation.errors.length > 0) {
        console.group('❌ Errors');
        validation.errors.forEach(error => console.error(error));
        console.groupEnd();
    } else {
        console.log('✅ Configuration is valid');
    }
    
    console.groupEnd();
}

// Log configuration on module load in development
/* if (browser && import.meta.env.DEV) {
    logConfigurationStatus();
}
 */