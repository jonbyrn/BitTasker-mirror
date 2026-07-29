import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the entire ethers module
vi.mock('ethers', () => {
	const mockProvider = {
		getNetwork: vi.fn().mockResolvedValue({ chainId: 42161n, name: 'arbitrum' }),
		getBalance: vi.fn().mockResolvedValue(1000000000000000000n),
		getBlock: vi.fn().mockResolvedValue({ number: 100, timestamp: 1700000000 }),
		waitForTransaction: vi.fn().mockResolvedValue({ status: 1 })
	};
	const mockWallet = {
		address: '0x' + 'ab'.repeat(20),
		provider: mockProvider,
		sendTransaction: vi.fn().mockResolvedValue({ hash: '0x' + 'cc'.repeat(32), wait: vi.fn() })
	};
	return {
		ethers: {
			JsonRpcProvider: vi.fn().mockImplementation(function () {
				return mockProvider;
			}),
			Wallet: vi.fn().mockImplementation(function () {
				return mockWallet;
			}),
			formatEther: vi.fn().mockReturnValue('1.0'),
			parseEther: vi.fn().mockReturnValue(1000000000000000000n),
			parseUnits: vi.fn().mockReturnValue(1000000n),
			formatUnits: vi.fn().mockReturnValue('1.0'),
			Contract: vi.fn().mockImplementation(function () {
				return {
					balanceOf: vi.fn().mockResolvedValue(1000000n),
					symbol: vi.fn().mockResolvedValue('USDT0'),
					decimals: vi.fn().mockResolvedValue(18)
				};
			})
		}
	};
});

import { ArbitrumWallet } from '$lib/wallet/arbitrum-wallet';

describe('ArbitrumWallet', () => {
	const MOCK_PRIVATE_KEY = '0x' + '01'.repeat(32);
	const MOCK_RPC_URL = 'https://arb1.arbitrum.io/rpc';

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('constructor', () => {
		it('throws when RPC URL is empty', () => {
			expect(() => new ArbitrumWallet(MOCK_PRIVATE_KEY, '')).toThrow(
				'ARBITRUM_RPC_URL is required'
			);
		});

		it('creates instance with valid params', () => {
			expect(() => new ArbitrumWallet(MOCK_PRIVATE_KEY, MOCK_RPC_URL)).not.toThrow();
		});
	});

	describe('getAddress', () => {
		it('returns a valid Ethereum address', () => {
			const wallet = new ArbitrumWallet(MOCK_PRIVATE_KEY, MOCK_RPC_URL);
			const address = wallet.getAddress();
			expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
		});

		it('returns the correct mock address', () => {
			const wallet = new ArbitrumWallet(MOCK_PRIVATE_KEY, MOCK_RPC_URL);
			const address = wallet.getAddress();
			expect(address).toBe('0x' + 'ab'.repeat(20));
		});
	});

	describe('getProvider', () => {
		it('returns a provider instance', () => {
			const wallet = new ArbitrumWallet(MOCK_PRIVATE_KEY, MOCK_RPC_URL);
			const provider = wallet.getProvider();
			expect(provider).toBeDefined();
		});
	});

	describe('getWallet', () => {
		it('returns a wallet instance', () => {
			const wallet = new ArbitrumWallet(MOCK_PRIVATE_KEY, MOCK_RPC_URL);
			const ethersWallet = wallet.getWallet();
			expect(ethersWallet).toBeDefined();
		});
	});

	describe('getAllTokenBalances', () => {
		it('returns an array of token balances', async () => {
			const wallet = new ArbitrumWallet(MOCK_PRIVATE_KEY, MOCK_RPC_URL);
			const balances = await wallet.getAllTokenBalances();
			expect(Array.isArray(balances)).toBe(true);
		});

		it('each balance has expected structure', async () => {
			const wallet = new ArbitrumWallet(MOCK_PRIVATE_KEY, MOCK_RPC_URL);
			const balances = await wallet.getAllTokenBalances();
			if (balances.length > 0) {
				const balance = balances[0];
				expect(balance).toHaveProperty('address');
				expect(balance).toHaveProperty('symbol');
				expect(balance).toHaveProperty('balance');
				expect(balance).toHaveProperty('decimals');
			}
		});
	});
});
