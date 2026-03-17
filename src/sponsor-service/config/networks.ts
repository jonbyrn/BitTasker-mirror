/**
 * Network Configuration for BSC USDT sponsorship
 * Defines RPC endpoints, token addresses, and chain parameters
 */

export interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;           // keep for backwards compat (primary)
  rpcUrls?: string[];       // optional additional fallback URLs
  explorerUrl: string;
  usdtTokenAddress: string;
  routerAddress: string;
  sponsorAddress: string;
  minConfirmations: number;
  blockTime: number; // milliseconds
  confirmationPollInterval: number; // milliseconds
  confirmationMaxRetries: number;
}

const BSC_MAINNET: NetworkConfig = {
  name: 'BSC Mainnet',
  chainId: 56,
  rpcUrl: process.env.BSC_MAINNET_RPC_URL || 'https://bsc-dataseed.binance.org',
  rpcUrls: [
    process.env.BSC_MAINNET_RPC_URL_2 || 'https://bsc-dataseed1.defibit.io',
    process.env.BSC_MAINNET_RPC_URL_3 || 'https://bsc-dataseed1.ninicoin.io'
  ],
  explorerUrl: 'https://bscscan.com',
  usdtTokenAddress: '0x55d398326f99059fF775485246999027B3197955',
  routerAddress: process.env.BSC_MAINNET_ROUTER_ADDRESS || '',
  sponsorAddress: process.env.BSC_MAINNET_SPONSOR_ADDRESS || '',
  minConfirmations: 1,
  blockTime: 3000,
  confirmationPollInterval: 2000,
  confirmationMaxRetries: 15 // ~30 seconds
};

const BSC_TESTNET: NetworkConfig = {
  name: 'BSC Testnet',
  chainId: 97,
  rpcUrl: process.env.BSC_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545',
  rpcUrls: [
    process.env.BSC_TESTNET_RPC_URL_2 || 'https://data-seed-prebsc-1-s2.binance.org:8545',
    process.env.BSC_TESTNET_RPC_URL_3 || 'https://data-seed-prebsc-1-s3.binance.org:8545'
  ],
  explorerUrl: 'https://testnet.bscscan.com',
  usdtTokenAddress: process.env.BSC_TESTNET_USDT_ADDRESS || '0x337610d27ae4ca0cd180003c4de79d4b47663363',
  routerAddress: process.env.BSC_TESTNET_ROUTER_ADDRESS || '',
  sponsorAddress: process.env.BSC_TESTNET_SPONSOR_ADDRESS || '',
  minConfirmations: 1,
  blockTime: 3000,
  confirmationPollInterval: 2000,
  confirmationMaxRetries: 15 // ~30 seconds
};

const NETWORKS: Record<number, NetworkConfig> = {
  56: BSC_MAINNET,
  97: BSC_TESTNET
};

export function getNetworkConfig(chainId: number): NetworkConfig | null {
  return NETWORKS[chainId] || null;
}

export function getAllNetworkConfigs(): NetworkConfig[] {
  return Object.values(NETWORKS);
}

export function isValidChainId(chainId: number): boolean {
  return chainId in NETWORKS;
}
