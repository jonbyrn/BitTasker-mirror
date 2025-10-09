/**
 * This file contains RSK and BSC network configurations.
 * Includes fee tier configurations, timelock constants, ERC-20 ABI, EIP-7702 Paymaster ABI,
 */

import type { ERC20Token, NetworkType, PaymasterConfig } from "$lib/types/wallet";
import { ethers } from 'ethers';

// Fee tier configurations
export const FEE_TIERS = {
	1: { percentage: 250, label: '2.5%' }, // Tier 1: 2.5%
	2: { percentage: 200, label: '2.0%' }, // Tier 2: 2.0%
	3: { percentage: 150, label: '1.5%' }  // Tier 3: 1.5%
} as const;

export type FeeTier = keyof typeof FEE_TIERS;

// Timelock constants (in seconds)
export const TIMELOCK_PERIODS = {
	COMPLETION: 7 * 24 * 60 * 60, // 7 days
	DISPUTE: 14 * 24 * 60 * 60    // 14 days
} as const;

// ERC-20 ABI (minimal for basic operations)
export const ERC20_ABI = [
	'function name() view returns (string)',
	'function symbol() view returns (string)',
	'function decimals() view returns (uint8)',
	'function totalSupply() view returns (uint256)',
	'function balanceOf(address owner) view returns (uint256)',
	'function transfer(address to, uint256 amount) returns (bool)',
	'function transferFrom(address from, address to, uint256 amount) returns (bool)',
	'function approve(address spender, uint256 amount) returns (bool)',
	'function allowance(address owner, address spender) view returns (uint256)',
	'event Transfer(address indexed from, address indexed to, uint256 value)',
	'event Approval(address indexed owner, address indexed spender, uint256 value)'
];

// EIP-7702 Paymaster ABI for gas fee abstraction
export const PAYMASTER_ABI = [
	'function payForTransaction(address user, bytes calldata transaction) external payable',
	'function validatePaymasterUserOp(UserOperation userOp, bytes32 userOpHash, uint256 maxCost) external view returns (bytes memory context, uint256 validationData)',
	'function postOp(PostOpMode mode, bytes calldata context, uint256 actualGasCost) external',
	'function deposit() external payable',
	'function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external',
	'function getDeposit() external view returns (uint256)'
];

// RSK Network Configuration
export const RSK_NETWORKS = {
	mainnet: {
		name: 'RSK Mainnet',
		chainId: 30,
		rpcUrl: 'https://public-node.rsk.co',
		explorerUrl: 'https://explorer.rsk.co',
		currency: {
			name: 'Smart Bitcoin',
			symbol: 'RBTC',
			decimals: 18
		},
		/* tokens: [
			{
				address: '0xEf213441a85dF4d7acBdAe0Cf78004E1e486BB96',
				symbol: 'USDT',
				name: 'Tether USD',
				decimals: 18
			},
			{
				address: '0x1BdA44fDA023F2aF8280A16fd1b01d1A493Ba6C4',
				symbol: 'USDC',
				name: 'USD Coin',
				decimals: 18
			},
			{
				address: '0x967f8799aF07DF1534d48A95a5C9FEBE92c53ae0',
				symbol: 'WETH',
				name: 'Wrapped Ether',
				decimals: 18
			}
		] as ERC20Token[] */
	},
	testnet: {
		name: 'RSK Testnet',
		chainId: 31,
		rpcUrl: 'https://public-node.testnet.rsk.co',
		explorerUrl: 'https://explorer.testnet.rsk.co',
		currency: {
			name: 'Testnet Smart Bitcoin',
			symbol: 'tRBTC',
			decimals: 18
		},
		/* tokens: [
			{
				address: '0x19F64674D8A5B4E652319F5e239eFd3bc969A1fE',
				symbol: 'tUSDT',
				name: 'Testnet Tether USD',
				decimals: 18
			},
			{
				address: '0x5A0b54D5dc17e0AadC383d2db43B0a0D3E029c4c',
				symbol: 'tUSDC',
				name: 'Testnet USD Coin',
				decimals: 18
			}
		] as ERC20Token[] */
	}
} as const;

export type RSKNetwork = keyof typeof RSK_NETWORKS;

// BSC Network Configuration
export const BSC_NETWORKS = {
	mainnet: {
		name: 'BSC Mainnet',
		chainId: 56,
		rpcUrl: 'https://bsc-rpc.publicnode.com',
		explorerUrl: 'https://bscscan.com',
		currency: {
			name: 'BNB',
			symbol: 'BNB',
			decimals: 18
		},
		tokens: [
			{
				address: '0x55d398326f99059fF775485246999027B3197955', // USDT on BSC
				symbol: 'USDT',
				name: 'Tether USD',
				decimals: 18
			},
			{
				address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // USDC on BSC
				symbol: 'USDC',
				name: 'USD Coin',
				decimals: 18
			},
			{
				address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB on BSC
				symbol: 'WBNB',
				name: 'Wrapped BNB',
				decimals: 18
			}
		] as ERC20Token[]
	},
	testnet: {
		name: 'BSC Testnet',
		chainId: 97,
		rpcUrl: 'https://bsc-testnet-rpc.publicnode.com',
		explorerUrl: 'https://testnet.bscscan.com',
		currency: {
			name: 'tBNB',
			symbol: 'tBNB',
			decimals: 18
		},
		tokens: [
			{
				address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', // Testnet USDT on BSC
				symbol: 'tUSDT',
				name: 'Testnet Tether USD',
				decimals: 18
			},
			{
				address: '0x64544969ed7EBf5f083679233325356EbE738930', // Testnet USDC on BSC
				symbol: 'tUSDC',
				name: 'Testnet USD Coin',
				decimals: 18
			}
		] as ERC20Token[]
	}
} as const;

// BSC Paymaster Contract configurations
export const BSC_PAYMASTER_CONFIGS: Record<NetworkType, PaymasterConfig> = {
    mainnet: {
        address: '0x0000000000000000000000000000000000000000', // Placeholder - needs to be deployed
        usdtTokenAddress: '0x55d398326f99059fF775485246999027B3197955',
        minDeposit: ethers.parseEther('1'), // 1 BNB minimum deposit
        maxGasPrice: ethers.parseUnits('50', 'gwei'), // 50 gwei max gas price
        usdtPriceOracle: '0x0000000000000000000000000000000000000000' // Placeholder
    },
    testnet: {
        address: '0x0000000000000000000000000000000000000000', // Placeholder - needs to be deployed
        usdtTokenAddress: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
        minDeposit: ethers.parseEther('0.1'), // 0.1 BNB minimum deposit
        maxGasPrice: ethers.parseUnits('20', 'gwei'), // 20 gwei max gas price
        usdtPriceOracle: '0x0000000000000000000000000000000000000000' // Placeholder
    }
};

export function getBSCPaymasterConfig(network: NetworkType): PaymasterConfig {
    return BSC_PAYMASTER_CONFIGS[network];
}

export function getUSDTToken(network: NetworkType): ERC20Token | undefined {
    const networkConfig = BSC_NETWORKS[network];
    return networkConfig.tokens.find(token => token.symbol === 'USDT' || token.symbol === 'tUSDT');
}