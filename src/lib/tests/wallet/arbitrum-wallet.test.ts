import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (available inside vi.mock factories) ──────
const { mockGetBalance, mockFormatEther, mockFormatUnits, MockContract } = vi.hoisted(() => ({
	mockGetBalance: vi.fn(),
	mockFormatEther: vi.fn((val: bigint) => `ether(${val.toString()})`),
	mockFormatUnits: vi.fn((val: bigint, _dec: number) => `units(${val.toString()})`),
	MockContract: vi.fn(),
}));

// ── Mock ethers ──────────────────────────────────────────────
vi.mock('ethers', () => {
	const address = '0xMOCK_ADDRESS_1234567890abcdef1234567890abcdef';

	class MockJsonRpcProvider {
		constructor(_url: string, _chainId: number) {}
		getBalance = mockGetBalance;
	}

	class MockWallet {
		address = address;
		constructor(_pk: string, _provider: unknown) {}
	}

	return {
		ethers: {
			JsonRpcProvider: MockJsonRpcProvider,
			Wallet: MockWallet,
			Contract: MockContract,
			formatEther: mockFormatEther,
			formatUnits: mockFormatUnits,
		},
	};
});

// ── Mock config ──────────────────────────────────────────────
vi.mock('$lib/wallet/gasless.config', () => ({
	ARBITRUM_CHAIN_ID: 42161,
	ARBITRUM_RPC_URL: 'https://arb-mainnet.example.com',
	TOKENS: [
		{ address: '0xUSDT0_ADDR', symbol: 'USDT0', decimals: 18, chainId: 42161 },
		{ address: '0xWBTC_ADDR', symbol: 'WBTC', decimals: 8, chainId: 42161 },
	],
}));

// ── Import after mocks ───────────────────────────────────────
import { ArbitrumWallet } from '$lib/wallet/arbitrum-wallet';
import { TOKENS } from '$lib/wallet/gasless.config';

const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const MOCK_ADDRESS = '0xMOCK_ADDRESS_1234567890abcdef1234567890abcdef';

// ── Tests ────────────────────────────────────────────────────
describe('ArbitrumWallet', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── Constructor ──────────────────────────────────────────────
	describe('constructor', () => {
		it('should create a wallet instance with valid params', () => {
			const wallet = new ArbitrumWallet(PRIVATE_KEY);
			expect(wallet).toBeInstanceOf(ArbitrumWallet);
		});

		it('should create a wallet instance with custom RPC URL', () => {
			const wallet = new ArbitrumWallet(PRIVATE_KEY, 'https://custom-rpc.example.com');
			expect(wallet).toBeInstanceOf(ArbitrumWallet);
		});

		it('should throw when rpcUrl is empty string', () => {
			expect(() => new ArbitrumWallet(PRIVATE_KEY, '')).toThrow('ARBITRUM_RPC_URL is required');
		});

		it('should use default RPC URL from config when none provided', () => {
			const wallet = new ArbitrumWallet(PRIVATE_KEY);
			expect(wallet).toBeInstanceOf(ArbitrumWallet);
		});
	});

	// ── getAddress ───────────────────────────────────────────────
	describe('getAddress', () => {
		it('should return a valid checksummed address', () => {
			const wallet = new ArbitrumWallet(PRIVATE_KEY);
			expect(wallet.getAddress()).toBe(MOCK_ADDRESS);
		});

		it('should return the same address on repeated calls', () => {
			const wallet = new ArbitrumWallet(PRIVATE_KEY);
			expect(wallet.getAddress()).toBe(wallet.getAddress());
		});
	});

	// ── getProvider ──────────────────────────────────────────────
	describe('getProvider', () => {
		it('should return a provider instance with getBalance', () => {
			const wallet = new ArbitrumWallet(PRIVATE_KEY);
			const provider = wallet.getProvider();
			expect(provider).toBeDefined();
			expect(typeof provider.getBalance).toBe('function');
		});

		it('should return the same provider instance on multiple calls', () => {
			const wallet = new ArbitrumWallet(PRIVATE_KEY);
			expect(wallet.getProvider()).toBe(wallet.getProvider());
		});
	});

	// ── getWallet ────────────────────────────────────────────────
	describe('getWallet', () => {
		it('should return a wallet instance with address', () => {
			const wallet = new ArbitrumWallet(PRIVATE_KEY);
			const ethWallet = wallet.getWallet();
			expect(ethWallet).toBeDefined();
			expect(ethWallet.address).toBe(MOCK_ADDRESS);
		});

		it('should return the same wallet instance on multiple calls', () => {
			const wallet = new ArbitrumWallet(PRIVATE_KEY);
			expect(wallet.getWallet()).toBe(wallet.getWallet());
		});
	});

	// ── getETHBalance ────────────────────────────────────────────
	describe('getETHBalance', () => {
		it('should return formatted ETH balance', async () => {
			mockGetBalance.mockResolvedValueOnce(1000000000000000000n);
			const wallet = new ArbitrumWallet(PRIVATE_KEY);
			const balance = await wallet.getETHBalance();
			expect(mockGetBalance).toHaveBeenCalledWith(MOCK_ADDRESS);
			expect(balance).toBe('ether(1000000000000000000)');
		});

		it('should return zero for empty balance', async () => {
			mockGetBalance.mockResolvedValueOnce(0n);
			const wallet = new ArbitrumWallet(PRIVATE_KEY);
			const balance = await wallet.getETHBalance();
			expect(balance).toBe('ether(0)');
		});

		it('should handle large balance values without overflow', async () => {
			mockGetBalance.mockResolvedValueOnce(2n ** 96n);
			const wallet = new ArbitrumWallet(PRIVATE_KEY);
			const balance = await wallet.getETHBalance();
			expect(balance).toContain('ether(');
		});
	});

	// ── getTokenBalance ─────────────────────────────────────────
	describe('getTokenBalance', () => {
		it('should return formatted balance for a single token', async () => {
			MockContract.mockImplementationOnce(() => ({
				balanceOf: vi.fn().mockResolvedValue(123456n),
				decimals: vi.fn().mockResolvedValue(6),
			}));

			const wallet = new ArbitrumWallet(PRIVATE_KEY);
			const balance = await wallet.getTokenBalance('0xSomeToken');
			expect(balance).toBe('units(123456)');
		});

		it('should use provided decimals override when given', async () => {
			const mockDecimalsFn = vi.fn();
			MockContract.mockImplementationOnce(() => ({
				balanceOf: vi.fn().mockResolvedValue(999n),
				decimals: mockDecimalsFn,
			}));

			const wallet = new ArbitrumWallet(PRIVATE_KEY);
			const balance = await wallet.getTokenBalance('0xSomeToken', 18);
			expect(mockDecimalsFn).not.toHaveBeenCalled();
			expect(balance).toBe('units(999)');
		});
	});

	// ── getAllTokenBalances ──────────────────────────────────────
	describe('getAllTokenBalances', () => {
		it('should return balances for all configured tokens', async () => {
			MockContract
				.mockImplementationOnce(() => ({
					balanceOf: vi.fn().mockResolvedValue(5000000000000000000n),
					decimals: vi.fn().mockResolvedValue(18),
				}))
				.mockImplementationOnce(() => ({
					balanceOf: vi.fn().mockResolvedValue(250000000n),
					decimals: vi.fn().mockResolvedValue(8),
				}));

			const wallet = new ArbitrumWallet(PRIVATE_KEY);
			const balances = await wallet.getAllTokenBalances();

			expect(balances).toHaveLength(TOKENS.length);
			expect(balances[0]).toEqual({
				symbol: 'USDT0',
				address: '0xUSDT0_ADDR',
				balance: 'units(5000000000000000000)',
				decimals: 18,
			});
			expect(balances[1]).toEqual({
				symbol: 'WBTC',
				address: '0xWBTC_ADDR',
				balance: 'units(250000000)',
				decimals: 8,
			});
		});

		it('should return zero balance when token call fails', async () => {
			MockContract.mockImplementation(() => ({
				balanceOf: vi.fn().mockRejectedValue(new Error('RPC error')),
				decimals: vi.fn(),
			}));

			const wallet = new ArbitrumWallet(PRIVATE_KEY);
			const balances = await wallet.getAllTokenBalances();

			expect(balances).toHaveLength(TOKENS.length);
			balances.forEach((b) => {
				expect(b.balance).toBe('0');
			});
		});

		it('should include decimals from config for each token', async () => {
			MockContract.mockImplementation(() => ({
				balanceOf: vi.fn().mockResolvedValue(100n),
				decimals: vi.fn(),
			}));

			const wallet = new ArbitrumWallet(PRIVATE_KEY);
			const balances = await wallet.getAllTokenBalances();

			expect(balances[0].decimals).toBe(18);
			expect(balances[1].decimals).toBe(8);
		});

		it('should return symbol and address for each token', async () => {
			MockContract.mockImplementation(() => ({
				balanceOf: vi.fn().mockResolvedValue(0n),
				decimals: vi.fn(),
			}));

			const wallet = new ArbitrumWallet(PRIVATE_KEY);
			const balances = await wallet.getAllTokenBalances();

			expect(balances[0].symbol).toBe('USDT0');
			expect(balances[0].address).toBe('0xUSDT0_ADDR');
			expect(balances[1].symbol).toBe('WBTC');
			expect(balances[1].address).toBe('0xWBTC_ADDR');
		});
	});
});
