import { describe, it, expect } from 'vitest';
import {
	ARBITRUM_CHAIN_ID,
	ENTRY_POINT_ADDRESS,
	SIMPLE_7702_ACCOUNT_IMPL,
	USDT0_ADDRESS,
	WBTC_ADDRESS,
	TBTC_ADDRESS,
	TOKENS,
	ALLOWED_FEE_TOKENS,
	GAS_BOUNDS,
	FEE_TIERS,
	FEE_BUFFER_MIN,
	FEE_BUFFER_MAX,
	ETH_USD_FEED,
	BTC_USD_FEED,
	MAX_ORACLE_STALENESS,
	getTokenByAddress,
	getTokenBySymbol,
	isAllowedFeeToken,
	gaslessConfig
} from '../../../../../wallet/gasless.config';

describe('gasless.config', () => {
	describe('chain constants', () => {
		it('has correct Arbitrum One chain ID', () => {
			expect(ARBITRUM_CHAIN_ID).toBe(42161);
		});
		it('has correct EntryPoint v0.8 address', () => {
			expect(ENTRY_POINT_ADDRESS).toBe('0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108');
		});
		it('has correct Simple7702Account implementation address', () => {
			expect(SIMPLE_7702_ACCOUNT_IMPL).toBe('0xe6Cae83BdE06E4c305530e199D7217f42808555B');
		});
	});

	describe('token inventory', () => {
		it('has exactly 3 tokens', () => {
			expect(TOKENS).toHaveLength(3);
		});
		it('USDT0 has 6 decimals', () => {
			const usdt0 = TOKENS.find((t) => t.symbol === 'USDT0');
			expect(usdt0).toBeDefined();
			expect(usdt0!.decimals).toBe(6);
			expect(usdt0!.address).toBe('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9');
		});
		it('wBTC has 8 decimals', () => {
			const wbtc = TOKENS.find((t) => t.symbol === 'WBTC');
			expect(wbtc).toBeDefined();
			expect(wbtc!.decimals).toBe(8);
			expect(wbtc!.address).toBe('0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f');
		});
		it('tBTC has 18 decimals', () => {
			const tbtc = TOKENS.find((t) => t.symbol === 'TBTC');
			expect(tbtc).toBeDefined();
			expect(tbtc!.decimals).toBe(18);
			expect(tbtc!.address.toLowerCase()).toBe('0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40');
		});
		it('all tokens are on Arbitrum One', () => {
			TOKENS.forEach((t) => expect(t.chainId).toBe(42161));
		});
		it('ALLOWED_FEE_TOKENS has 3 lowercase addresses', () => {
			expect(ALLOWED_FEE_TOKENS).toHaveLength(3);
			ALLOWED_FEE_TOKENS.forEach((addr) => {
				expect(addr).toBe(addr.toLowerCase());
			});
		});
	});

	describe('gas bounds', () => {
		it('maxCallGas is 5M', () => {
			expect(GAS_BOUNDS.maxCallGas).toBe(5_000_000n);
		});
		it('maxVerificationGas is 1M', () => {
			expect(GAS_BOUNDS.maxVerificationGas).toBe(1_000_000n);
		});
		it('maxPreVerificationGas is 400K (EIP-7702)', () => {
			expect(GAS_BOUNDS.maxPreVerificationGas).toBe(400_000n);
		});
		it('maxFeePerGas is 1 gwei', () => {
			expect(GAS_BOUNDS.maxFeePerGas).toBe(1_000_000_000n);
		});
		it('maxTotalGas is 6.4M', () => {
			expect(GAS_BOUNDS.maxTotalGas).toBe(6_400_000n);
		});
	});

	describe('fee tiers', () => {
		it('has 4 tiers', () => {
			expect(FEE_TIERS).toHaveLength(4);
		});
		it('Low tier: <=200K gas, $0.01', () => {
			expect(FEE_TIERS[0].label).toBe('Low');
			expect(FEE_TIERS[0].minGas).toBe(0n);
			expect(FEE_TIERS[0].maxGas).toBe(200_000n);
			expect(FEE_TIERS[0].feeUSD).toBe(0.01);
		});
		it('Medium tier: 200K-500K gas, $0.03', () => {
			expect(FEE_TIERS[1].label).toBe('Medium');
			expect(FEE_TIERS[1].minGas).toBe(200_001n);
			expect(FEE_TIERS[1].maxGas).toBe(500_000n);
			expect(FEE_TIERS[1].feeUSD).toBe(0.03);
		});
		it('High tier: 500K-1M gas, $0.05', () => {
			expect(FEE_TIERS[2].label).toBe('High');
			expect(FEE_TIERS[2].minGas).toBe(500_001n);
			expect(FEE_TIERS[2].maxGas).toBe(1_000_000n);
			expect(FEE_TIERS[2].feeUSD).toBe(0.05);
		});
		it('Very High tier: 1M-6.4M gas, $0.10', () => {
			expect(FEE_TIERS[3].label).toBe('Very High');
			expect(FEE_TIERS[3].minGas).toBe(1_000_001n);
			expect(FEE_TIERS[3].maxGas).toBe(6_400_000n);
			expect(FEE_TIERS[3].feeUSD).toBe(0.1);
		});
	});

	describe('fee buffer bounds', () => {
		it('USDT0 min is $0.01 (6 decimals)', () => {
			const key = USDT0_ADDRESS.toLowerCase();
			expect(FEE_BUFFER_MIN[key]).toBe(10_000n);
		});
		it('USDT0 max is $0.15 (6 decimals)', () => {
			const key = USDT0_ADDRESS.toLowerCase();
			expect(FEE_BUFFER_MAX[key]).toBe(150_000n);
		});
		it('wBTC min is 16 satoshis', () => {
			const key = WBTC_ADDRESS.toLowerCase();
			expect(FEE_BUFFER_MIN[key]).toBe(16n);
		});
		it('wBTC max is 230 satoshis', () => {
			const key = WBTC_ADDRESS.toLowerCase();
			expect(FEE_BUFFER_MAX[key]).toBe(230n);
		});
		it('tBTC min is $0.01 (18 decimals)', () => {
			const key = TBTC_ADDRESS.toLowerCase();
			expect(FEE_BUFFER_MIN[key]).toBe(10_000_000_000_000_000n);
		});
		it('tBTC max is $0.15 (18 decimals)', () => {
			const key = TBTC_ADDRESS.toLowerCase();
			expect(FEE_BUFFER_MAX[key]).toBe(150_000_000_000_000_000n);
		});
		it('min < max for all tokens', () => {
			for (const key of ALLOWED_FEE_TOKENS) {
				expect(FEE_BUFFER_MIN[key]).toBeLessThan(FEE_BUFFER_MAX[key]);
			}
		});
	});

	describe('Chainlink feeds', () => {
		it('has correct ETH/USD feed address', () => {
			expect(ETH_USD_FEED).toBe('0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612');
		});
		it('has correct BTC/USD feed address', () => {
			expect(BTC_USD_FEED).toBe('0x6ce185860a4963106506C203335A2910413708e9');
		});
		it('max oracle staleness is 5 minutes', () => {
			expect(MAX_ORACLE_STALENESS).toBe(300);
		});
	});

	describe('helpers', () => {
		it('getTokenByAddress finds USDT0 (case-insensitive)', () => {
			expect(getTokenByAddress(USDT0_ADDRESS)).toBeDefined();
			expect(getTokenByAddress(USDT0_ADDRESS.toLowerCase())).toBeDefined();
			expect(getTokenByAddress(USDT0_ADDRESS.toUpperCase())).toBeDefined();
		});
		it('getTokenByAddress returns undefined for unknown', () => {
			expect(getTokenByAddress('0x0000000000000000000000000000000000000001')).toBeUndefined();
		});
		it('getTokenBySymbol finds WBTC (case-insensitive)', () => {
			expect(getTokenBySymbol('WBTC')).toBeDefined();
			expect(getTokenBySymbol('wbtc')).toBeDefined();
		});
		it('getTokenBySymbol returns undefined for unknown', () => {
			expect(getTokenBySymbol('DOGE')).toBeUndefined();
		});
		it('isAllowedFeeToken returns true for valid tokens', () => {
			expect(isAllowedFeeToken(USDT0_ADDRESS)).toBe(true);
			expect(isAllowedFeeToken(WBTC_ADDRESS)).toBe(true);
			expect(isAllowedFeeToken(TBTC_ADDRESS)).toBe(true);
		});
		it('isAllowedFeeToken returns false for unknown token', () => {
			expect(isAllowedFeeToken('0x0000000000000000000000000000000000000001')).toBe(false);
		});
	});

	describe('gaslessConfig object', () => {
		it('has correct structure', () => {
			expect(gaslessConfig.tokens).toHaveLength(3);
			expect(gaslessConfig.gasBounds.maxTotalGas).toBe(6_400_000n);
			expect(gaslessConfig.feeTiers).toHaveLength(4);
			expect(gaslessConfig.entryPointAddress).toBe(ENTRY_POINT_ADDRESS);
			expect(gaslessConfig.chainId).toBe(42161n);
		});
	});
});
