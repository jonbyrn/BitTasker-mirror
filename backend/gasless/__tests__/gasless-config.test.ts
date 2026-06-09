// Backend Gasless Config Tests — Unit tests for gasless.config.ts

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
	getNetworkFeeTier,
	getTokenInfo,
	convertToTokenFee,
	MAX_ORACLE_STALENESS,
	ETH_USD_FEED,
	BTC_USD_FEED
} from '../gasless.config';

describe('Gasless Config', () => {
	describe('Chain Constants', () => {
		it('should have correct Arbitrum One chain ID', () => {
			expect(ARBITRUM_CHAIN_ID).toBe(42161);
		});

		it('should have valid EntryPoint address', () => {
			expect(ENTRY_POINT_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/);
			expect(ENTRY_POINT_ADDRESS).toBe('0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108');
		});

		it('should have valid Simple7702Account implementation address', () => {
			expect(SIMPLE_7702_ACCOUNT_IMPL).toMatch(/^0x[0-9a-fA-F]{40}$/);
		});
	});

	describe('Token Inventory', () => {
		it('should have 3 tokens', () => {
			expect(TOKENS.length).toBe(3);
		});

		it('should have USDT0 with 18 decimals', () => {
			const usdt0 = TOKENS.find((t) => t.symbol === 'USDT0');
			expect(usdt0).toBeDefined();
			expect(usdt0!.decimals).toBe(18);
			expect(usdt0!.address).toBe(USDT0_ADDRESS);
		});

		it('should have WBTC with 8 decimals', () => {
			const wbtc = TOKENS.find((t) => t.symbol === 'WBTC');
			expect(wbtc).toBeDefined();
			expect(wbtc!.decimals).toBe(8);
			expect(wbtc!.address).toBe(WBTC_ADDRESS);
		});

		it('should have TBTC with 18 decimals', () => {
			const tbtc = TOKENS.find((t) => t.symbol === 'TBTC');
			expect(tbtc).toBeDefined();
			expect(tbtc!.decimals).toBe(18);
			expect(tbtc!.address).toBe(TBTC_ADDRESS);
		});

		it('should have ALLOWED_FEE_TOKENS matching token addresses', () => {
			expect(ALLOWED_FEE_TOKENS.length).toBe(3);
			expect(ALLOWED_FEE_TOKENS).toContain(USDT0_ADDRESS.toLowerCase());
			expect(ALLOWED_FEE_TOKENS).toContain(WBTC_ADDRESS.toLowerCase());
			expect(ALLOWED_FEE_TOKENS).toContain(TBTC_ADDRESS.toLowerCase());
		});
	});

	describe('Gas Bounds', () => {
		it('should have MAX_CALL_GAS of 5M', () => {
			expect(GAS_BOUNDS.MAX_CALL_GAS).toBe(5_000_000n);
		});

		it('should have MAX_TOTAL_GAS of 5M', () => {
			expect(GAS_BOUNDS.MAX_TOTAL_GAS).toBe(5_000_000n);
		});

		it('should have MAX_FEE_PER_GAS of 1 gwei', () => {
			expect(GAS_BOUNDS.MAX_FEE_PER_GAS).toBe(1_000_000_000n);
		});

		it('should have MAX_VERIFICATION_GAS of 1M', () => {
			expect(GAS_BOUNDS.MAX_VERIFICATION_GAS).toBe(1_000_000n);
		});

		it('should have MAX_PRE_VERIFICATION_GAS of 100K', () => {
			expect(GAS_BOUNDS.MAX_PRE_VERIFICATION_GAS).toBe(100_000n);
		});
	});

	describe('Fee Tiers', () => {
		it('should have 4 fee tiers', () => {
			expect(FEE_TIERS.length).toBe(4);
		});

		it('should have Low tier: ≤ 200K gas, $0.01', () => {
			const low = FEE_TIERS[0];
			expect(low.label).toBe('Low');
			expect(low.minGas).toBe(0n);
			expect(low.maxGas).toBe(200_000n);
			expect(low.feeUSD).toBe(0.01);
		});

		it('should have Medium tier: 200K-500K gas, $0.03', () => {
			const med = FEE_TIERS[1];
			expect(med.label).toBe('Medium');
			expect(med.minGas).toBe(200_001n);
			expect(med.maxGas).toBe(500_000n);
			expect(med.feeUSD).toBe(0.03);
		});

		it('should have High tier: 500K-1M gas, $0.05', () => {
			const high = FEE_TIERS[2];
			expect(high.label).toBe('High');
			expect(high.minGas).toBe(500_001n);
			expect(high.maxGas).toBe(1_000_000n);
			expect(high.feeUSD).toBe(0.05);
		});

		it('should have Very High tier: 1M-5M gas, $0.10', () => {
			const vh = FEE_TIERS[3];
			expect(vh.label).toBe('Very High');
			expect(vh.minGas).toBe(1_000_001n);
			expect(vh.maxGas).toBe(5_000_000n);
			expect(vh.feeUSD).toBe(0.1);
		});
	});

	describe('Fee Buffer Bounds', () => {
		it('should have min/max for USDT0', () => {
			const key = USDT0_ADDRESS.toLowerCase();
			expect(FEE_BUFFER_MIN[key]).toBe(10_000_000_000_000_000n); // 0.01 USDT0
			expect(FEE_BUFFER_MAX[key]).toBe(150_000_000_000_000_000n); // 0.15 USDT0
		});

		it('should have min/max for WBTC', () => {
			const key = WBTC_ADDRESS.toLowerCase();
			expect(FEE_BUFFER_MIN[key]).toBe(16n); // 16 satoshis
			expect(FEE_BUFFER_MAX[key]).toBe(230n); // 230 satoshis
		});

		it('should have min/max for TBTC', () => {
			const key = TBTC_ADDRESS.toLowerCase();
			expect(FEE_BUFFER_MIN[key]).toBe(10_000_000_000_000_000n); // 0.01 tBTC
			expect(FEE_BUFFER_MAX[key]).toBe(150_000_000_000_000_000n); // 0.15 tBTC
		});
	});

	describe('getNetworkFeeTier', () => {
		it('should return Low for 100K gas', () => {
			expect(getNetworkFeeTier(100_000n)).toEqual({ feeUSD: 0.01, label: 'Low' });
		});

		it('should return Low for exactly 200K gas', () => {
			expect(getNetworkFeeTier(200_000n)).toEqual({ feeUSD: 0.01, label: 'Low' });
		});

		it('should return Medium for 300K gas', () => {
			expect(getNetworkFeeTier(300_000n)).toEqual({ feeUSD: 0.03, label: 'Medium' });
		});

		it('should return High for 750K gas', () => {
			expect(getNetworkFeeTier(750_000n)).toEqual({ feeUSD: 0.05, label: 'High' });
		});

		it('should return Very High for 2M gas', () => {
			expect(getNetworkFeeTier(2_000_000n)).toEqual({ feeUSD: 0.1, label: 'Very High' });
		});

		it('should throw for 6M gas (exceeds 5M)', () => {
			expect(() => getNetworkFeeTier(6_000_000n)).toThrow('Network fee too high');
		});
	});

	describe('getTokenInfo', () => {
		it('should return USDT0 info for USDT0 address', () => {
			const info = getTokenInfo(USDT0_ADDRESS);
			expect(info.symbol).toBe('USDT0');
			expect(info.decimals).toBe(18);
		});

		it('should return WBTC info for WBTC address', () => {
			const info = getTokenInfo(WBTC_ADDRESS);
			expect(info.symbol).toBe('WBTC');
			expect(info.decimals).toBe(8);
		});

		it('should be case-insensitive', () => {
			const info = getTokenInfo(USDT0_ADDRESS.toLowerCase());
			expect(info.symbol).toBe('USDT0');
		});

		it('should throw for unknown address', () => {
			expect(() => getTokenInfo('0x0000000000000000000000000000000000000001')).toThrow(
				'Unknown token'
			);
		});
	});

	describe('convertToTokenFee', () => {
		it('should convert $0.01 USDT0 fee correctly', () => {
			const tokenPrice = 1_000_000_000_000_000_000n; // $1.00
			const fee = convertToTokenFee(0.01, USDT0_ADDRESS, tokenPrice);
			expect(fee).toBe(10_000_000_000_000_001n); // 0.01 USDT0 + 1 (round up)
		});

		it('should convert $0.03 USDT0 fee correctly', () => {
			const tokenPrice = 1_000_000_000_000_000_000n; // $1.00
			const fee = convertToTokenFee(0.03, USDT0_ADDRESS, tokenPrice);
			expect(fee).toBe(30_000_000_000_000_001n); // 0.03 USDT0 + 1
		});

		it('should round UP (favor treasury)', () => {
			const tokenPrice = 3_000_000_000_000_000_000n; // $3.00
			const fee = convertToTokenFee(0.01, USDT0_ADDRESS, tokenPrice);
			// 0.01 / 3.00 = 0.00333... tokens, rounded up
			expect(fee).toBeGreaterThan(0n);
		});
	});

	describe('Chainlink Feeds', () => {
		it('should have valid ETH/USD feed address', () => {
			expect(ETH_USD_FEED).toMatch(/^0x[0-9a-fA-F]{40}$/);
		});

		it('should have valid BTC/USD feed address', () => {
			expect(BTC_USD_FEED).toMatch(/^0x[0-9a-fA-F]{40}$/);
		});

		it('should have MAX_ORACLE_STALENESS of 300 seconds', () => {
			expect(MAX_ORACLE_STALENESS).toBe(300);
		});
	});
});
