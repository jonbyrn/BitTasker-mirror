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
		] as RSKToken[] */
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
		] as RSKToken[] */
	}
} as const;

export type RSKNetwork = keyof typeof RSK_NETWORKS;