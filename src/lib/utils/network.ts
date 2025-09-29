/**
 * Network Configuration
 * 
 * Set this to 'testnet' or 'mainnet' based on your deployment environment.
 * This is used throughout the app to determine if we're running on testnet.
 */

// Set this to 'testnet' for testnet deployments, 'mainnet' for production
export const IS_TESTNET = true;

// Network configuration
export const NETWORK_CONFIG = {
  isTestnet: IS_TESTNET,
  isMainnet: !IS_TESTNET,
  networkName: IS_TESTNET ? 'testnet' : 'mainnet'
} as const;
