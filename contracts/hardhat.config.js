require('@nomicfoundation/hardhat-toolbox');
// dotenv loaded via environment; not required as dependency

const ARBITRUM_RPC_URL = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
const ARBITRUM_SEPOLIA_RPC_URL =
	process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || '0x' + '0'.repeat(64);
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '';

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
	solidity: {
		version: '0.8.28',
		settings: {
			optimizer: {
				enabled: true,
				runs: 200
			},
			viaIR: false
		}
	},
	networks: {
		hardhat: {
			forking: {
				url: ARBITRUM_RPC_URL,
				enabled: false // Enable with --fork flag
			},
			chainId: 31337
		},
		localhost: {
			url: 'http://127.0.0.1:8545',
			chainId: 31337
		},
		arbitrumSepolia: {
			url: ARBITRUM_SEPOLIA_RPC_URL,
			accounts: DEPLOYER_PRIVATE_KEY !== '0x' + '0'.repeat(64) ? [DEPLOYER_PRIVATE_KEY] : [],
			chainId: 421614,
			gasPrice: 100000000 // 0.1 gwei (Arbitrum Sepolia)
		},
		arbitrumOne: {
			url: ARBITRUM_RPC_URL,
			accounts: DEPLOYER_PRIVATE_KEY !== '0x' + '0'.repeat(64) ? [DEPLOYER_PRIVATE_KEY] : [],
			chainId: 42161,
			gasPrice: 100000000 // 0.1 gwei (Arbitrum One)
		}
	},
	etherscan: {
		customChains: [
			{
				network: 'arbitrumOne',
				chainId: 42161,
				urls: {
					apiURL: 'https://api.arbiscan.io/api',
					browserURL: 'https://arbiscan.io'
				}
			},
			{
				network: 'arbitrumSepolia',
				chainId: 421614,
				urls: {
					apiURL: 'https://api-sepolia.arbiscan.io/api',
					browserURL: 'https://sepolia.arbiscan.io'
				}
			}
		],
		apiKey: ETHERSCAN_API_KEY
	},
	gasReporter: {
		enabled: process.env.REPORT_GAS === 'true',
		currency: 'USD',
		gasPrice: 0.1 // Arbitrum gas price in gwei
	},
	paths: {
		sources: './src',
		tests: './test',
		cache: './cache',
		artifacts: './artifacts'
	}
};
