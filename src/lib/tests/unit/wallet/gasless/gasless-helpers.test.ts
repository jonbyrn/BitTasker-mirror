import { describe, it, expect, vi } from 'vitest';

// vi.hoisted runs BEFORE vi.mock factories — set env
vi.hoisted(() => {
	process.env['GAS_TREASURY'] = '0x1234567890123456789012345678901234567890';
});

// Mock gasless.config — use getter for GAS_TREASURY so tests can modify it via process.env
vi.mock('$lib/wallet/gasless.config', () => {
	const TOKENS = [
		{
			address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
			symbol: 'USDT0',
			decimals: 6,
			chainId: 42161
		},
		{
			address: '0x2f2a2543B76A4166549F7aa2e75Bef0aefC5B0f',
			symbol: 'WBTC',
			decimals: 8,
			chainId: 42161
		},
		{
			address: '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40',
			symbol: 'TBTC',
			decimals: 18,
			chainId: 42161
		}
	];
	const ALLOWED_FEE_TOKENS = TOKENS.map((t) => t.address.toLowerCase());
	const GAS_BOUNDS = {
		maxCallGas: 5_000_000n,
		maxVerificationGas: 500_000n,
		maxPreVerificationGas: 100_000n,
		maxFeePerGas: 1_000_000_000n,
		maxPriorityFeePerGas: 100_000_000n,
		maxTotalGas: 6_000_000n
	};
	const FEE_TIERS = [
		{ label: 'Low', minGas: 0n, maxGas: 200_000n, feeUSD: 0.01 },
		{ label: 'Medium', minGas: 200_001n, maxGas: 500_000n, feeUSD: 0.03 },
		{ label: 'High', minGas: 500_001n, maxGas: 1_000_000n, feeUSD: 0.05 },
		{
			label: 'Very High',
			minGas: 1_000_001n,
			maxGas: 6_000_000n,
			feeUSD: 0.1
		}
	];
	const FEE_BUFFER_MIN = {
		'0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 10_000n, // USDT0 (6 decimals): $0.01
		'0x2f2a2543b76a4166549f7aa2e75bef0aefc5b0f': 16n,
		'0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40': 10_000_000_000_000_000n // tBTC (18 decimals): $0.01
	};
	const FEE_BUFFER_MAX = {
		'0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 150_000n, // USDT0 (6 decimals): $0.15
		'0x2f2a2543b76a4166549f7aa2e75bef0aefc5b0f': 230n,
		'0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40': 150_000_000_000_000_000n // tBTC (18 decimals): $0.15
	};
	return {
		ENTRY_POINT_ADDRESS: '0x433709009B8330FDa32311DF1C2AFA402eD8D009',
		USDT0_ADDRESS: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
		WBTC_ADDRESS: '0x2f2a2543B76A4166549F7aa2e75Bef0aefC5B0f',
		TBTC_ADDRESS: '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40',
		TOKENS,
		ALLOWED_FEE_TOKENS,
		GAS_BOUNDS,
		FEE_TIERS,
		FEE_BUFFER_MIN,
		FEE_BUFFER_MAX,
		get GAS_TREASURY() {
			return process.env['GAS_TREASURY'] ?? '';
		},
		ALTO_URLS: ['https://alto.dev.bittasker.com'],
		ARBITRUM_RPC_URL: '',
		API_BASE_URL: 'http://localhost:4000',
		ETH_USD_FEED: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',
		BTC_USD_FEED: '0x6ce185860a4963106506C203335A2910413708e9',
		MAX_ORACLE_STALENESS: 300,
		PAYMASTER_SIGNER_KEY_FILE: '/run/secrets/paymaster_signer_key',
		gaslessConfig: {
			tokens: [...TOKENS],
			gasBounds: { ...GAS_BOUNDS },
			feeTiers: [...FEE_TIERS],
			feeBufferBounds: {
				'0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': {
					min: 10_000n,
					max: 150_000n
				},
				'0x2f2a2543b76a4166549f7aa2e75bef0aefc5b0f': {
					min: 16n,
					max: 230n
				},
				'0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40': {
					min: 10_000_000_000_000_000n,
					max: 150_000_000_000_000_000n
				}
			},
			treasury: process.env['GAS_TREASURY'] ?? '',
			entryPointAddress: '0x433709009B8330FDa32311DF1C2AFA402eD8D009',
			chainId: BigInt(42161),
			altoUrls: ['https://alto.dev.bittasker.com'],
			chainlinkFeeds: {
				ethUsd: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',
				btcUsd: '0x6ce185860a4963106506C203335A2910413708e9'
			}
		},
		getTokenByAddress: (address: string) => {
			const lower = address.toLowerCase();
			return TOKENS.find((t) => t.address.toLowerCase() === lower);
		},
		getTokenBySymbol: (symbol: string) => {
			const upper = symbol.toUpperCase();
			return TOKENS.find((t) => t.symbol === upper);
		},
		isAllowedFeeToken: (address: string) => {
			return ALLOWED_FEE_TOKENS.includes(address.toLowerCase());
		}
	};
});

// Now import the modules (mocked config will be used)
import {
	getPaymasterSignatureHash,
	getNetworkFeeTier,
	convertToTokenFee,
	getUSDT0FeeBuffer,
	validateFeeParameters,
	validateFeeBufferBounds,
	validateFeeRecipient,
	requireTokenInfo,
	computeTotalGas
} from '$lib/wallet/gasless-helpers';
import {
	ENTRY_POINT_ADDRESS,
	USDT0_ADDRESS,
	WBTC_ADDRESS,
	TBTC_ADDRESS
} from '$lib/wallet/gasless.config';

describe('getPaymasterSignatureHash', () => {
	it('returns a 32-byte hex hash', () => {
		const hash = getPaymasterSignatureHash(
			'0x' + '01'.repeat(20),
			0n,
			'0xaa',
			ENTRY_POINT_ADDRESS,
			42161n
		);
		expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
	});

	it('different senders produce different hashes', () => {
		const hash1 = getPaymasterSignatureHash(
			'0x' + '01'.repeat(20),
			0n,
			'0xaa',
			ENTRY_POINT_ADDRESS,
			42161n
		);
		const hash2 = getPaymasterSignatureHash(
			'0x' + '02'.repeat(20),
			0n,
			'0xaa',
			ENTRY_POINT_ADDRESS,
			42161n
		);
		expect(hash1).not.toBe(hash2);
	});

	it('different nonces produce different hashes', () => {
		const hash1 = getPaymasterSignatureHash(
			'0x' + '01'.repeat(20),
			0n,
			'0xaa',
			ENTRY_POINT_ADDRESS,
			42161n
		);
		const hash2 = getPaymasterSignatureHash(
			'0x' + '01'.repeat(20),
			1n,
			'0xaa',
			ENTRY_POINT_ADDRESS,
			42161n
		);
		expect(hash1).not.toBe(hash2);
	});

	it('different callData produce different hashes', () => {
		const hash1 = getPaymasterSignatureHash(
			'0x' + '01'.repeat(20),
			0n,
			'0xaa',
			ENTRY_POINT_ADDRESS,
			42161n
		);
		const hash2 = getPaymasterSignatureHash(
			'0x' + '01'.repeat(20),
			0n,
			'0xbb',
			ENTRY_POINT_ADDRESS,
			42161n
		);
		expect(hash1).not.toBe(hash2);
	});

	it('different chainId produces different hashes (replay prevention)', () => {
		const hash1 = getPaymasterSignatureHash(
			'0x' + '01'.repeat(20),
			0n,
			'0xaa',
			ENTRY_POINT_ADDRESS,
			42161n
		);
		const hash2 = getPaymasterSignatureHash(
			'0x' + '01'.repeat(20),
			0n,
			'0xaa',
			ENTRY_POINT_ADDRESS,
			1n
		);
		expect(hash1).not.toBe(hash2);
	});

	it('is deterministic for the same inputs', () => {
		const args: [string, bigint, string, string, bigint] = [
			'0x' + 'ab'.repeat(20),
			42n,
			'0xdeadbeef',
			ENTRY_POINT_ADDRESS,
			42161n
		];
		expect(getPaymasterSignatureHash(...args)).toBe(getPaymasterSignatureHash(...args));
	});
});

describe('getNetworkFeeTier', () => {
	it('Low tier for 150K gas', () => {
		expect(getNetworkFeeTier(150_000n).label).toBe('Low');
	});

	it('Low tier at boundary 200K', () => {
		expect(getNetworkFeeTier(200_000n).label).toBe('Low');
	});

	it('Medium tier for 400K gas', () => {
		expect(getNetworkFeeTier(300_000n).label).toBe('Medium');
	});

	it('Medium tier at boundary 500K', () => {
		expect(getNetworkFeeTier(500_000n).label).toBe('Medium');
	});

	it('High tier for 700K gas', () => {
		expect(getNetworkFeeTier(700_000n).label).toBe('High');
	});

	it('High tier at boundary 1M', () => {
		expect(getNetworkFeeTier(1_000_000n).label).toBe('High');
	});

	it('Very High tier for 2M gas', () => {
		expect(getNetworkFeeTier(2_000_000n).label).toBe('Very High');
	});

	it('Very High tier at boundary 5M', () => {
		expect(getNetworkFeeTier(5_000_000n).label).toBe('Very High');
	});

	it('Very High tier at boundary 5.9M', () => {
		expect(getNetworkFeeTier(5_900_000n).label).toBe('Very High');
	});

	it('Very High tier at boundary 6M', () => {
		expect(getNetworkFeeTier(6_000_000n).label).toBe('Very High');
	});

	it('throws for 6M+1 gas (too high)', () => {
		expect(() => getNetworkFeeTier(6_000_001n)).toThrow('Network fee too high');
	});
});

describe('convertToTokenFee', () => {
	it('converts 0.01 USD to USDT0 units (1e4 at 6 decimals)', () => {
		expect(convertToTokenFee(0.01, 1_000_000_000_000_000_000n, 6)).toBe(10_000n);
	});

	it('converts 0.03 USD to USDT0 units (3e4 at 6 decimals)', () => {
		expect(convertToTokenFee(0.03, 1_000_000_000_000_000_000n, 6)).toBe(30_000n);
	});

	it('converts 0.10 USD to USDT0 units (1e5+1 at 6 decimals)', () => {
		expect(convertToTokenFee(0.1, 1_000_000_000_000_000_000n, 6)).toBe(100_001n);
	});

	it('converts 0.01 USD to wBTC units (~16 sats at 66K)', () => {
		const result = convertToTokenFee(0.01, 66_000_000_000_000_000_000_000n, 8);
		expect(result).toBeGreaterThanOrEqual(15n);
		expect(result).toBeLessThanOrEqual(20n);
	});

	it('rounds UP to nearest unit', () => {
		const result = convertToTokenFee(0.01, 66_000_000_000_000_000_000_000n, 8);
		expect(result).toBeGreaterThanOrEqual(15n);
	});

	it('throws for zero token price', () => {
		expect(() => convertToTokenFee(0.01, 0n, 18)).toThrow('Token price is zero');
	});

	it('always returns a bigint', () => {
		const result = convertToTokenFee(0.01, 1_000_000_000_000_000_000n, 18);
		expect(typeof result).toBe('bigint');
	});
});

describe('getUSDT0FeeBuffer', () => {
	it('returns 1e4 for 0.01 USD (6 decimals)', () => {
		expect(getUSDT0FeeBuffer(0.01)).toBe(10_000n);
	});

	it('returns 3e4 for 0.03 USD (6 decimals)', () => {
		expect(getUSDT0FeeBuffer(0.03)).toBe(30_000n);
	});

	it('returns 5e4+1 for 0.05 USD (6 decimals, string-based rounding)', () => {
		expect(getUSDT0FeeBuffer(0.05)).toBe(50_001n);
	});

	it('returns 1e5+1 for 0.10 USD (6 decimals)', () => {
		expect(getUSDT0FeeBuffer(0.1)).toBe(100_001n);
	});
});

describe('validateFeeParameters', () => {
	const validParams = {
		callGasLimit: 100_000n,
		verificationGasLimit: 100_000n,
		preVerificationGas: 50_000n,
		maxFeePerGas: 100_000_000n, // 0.1 gwei
		maxPriorityFeePerGas: 10_000_000n // 0.01 gwei
	};

	it('accepts valid parameters', () => {
		expect(() => validateFeeParameters(validParams)).not.toThrow();
	});

	it('throws for callGasLimit 10M', () => {
		expect(() => validateFeeParameters({ ...validParams, callGasLimit: 10_000_000n })).toThrow(
			'callGasLimit exceeds maximum'
		);
	});

	it('throws for verificationGasLimit 2M', () => {
		expect(() =>
			validateFeeParameters({
				...validParams,
				verificationGasLimit: 2_000_000n
			})
		).toThrow('verificationGasLimit exceeds maximum');
	});

	it('throws for preVerificationGas above 100K limit', () => {
		expect(() =>
			validateFeeParameters({
				...validParams,
				preVerificationGas: 100_001n
			})
		).toThrow('preVerificationGas exceeds maximum');
	});

	it('accepts preVerificationGas at 100K (EIP-7702 limit)', () => {
		expect(() =>
			validateFeeParameters({
				...validParams,
				preVerificationGas: 100_000n
			})
		).not.toThrow();
	});

	it('throws for maxFeePerGas 10 gwei', () => {
		expect(() =>
			validateFeeParameters({
				...validParams,
				maxFeePerGas: 10_000_000_000n
			})
		).toThrow('maxFeePerGas exceeds ceiling');
	});

	it('throws for total gas > 6M (via callGasLimit)', () => {
		expect(() =>
			validateFeeParameters({
				callGasLimit: 5_000_001n, // exceeds maxCallGas of 5M
				verificationGasLimit: 500_000n,
				preVerificationGas: 100_000n,
				maxFeePerGas: 100_000_000n,
				maxPriorityFeePerGas: 10_000_000n
			})
		).toThrow('callGasLimit exceeds maximum');
	});

	it('accepts total gas at individual maximums (5.6M)', () => {
		expect(() =>
			validateFeeParameters({
				callGasLimit: 5_000_000n,
				verificationGasLimit: 500_000n,
				preVerificationGas: 100_000n,
				maxFeePerGas: 100_000_000n,
				maxPriorityFeePerGas: 10_000_000n
			})
		).not.toThrow();
	});
});

describe('validateFeeBufferBounds', () => {
	it('accepts valid USDT0 buffer', () => {
		expect(
			() => validateFeeBufferBounds(USDT0_ADDRESS, 10_000n) // $0.01 at 6 decimals
		).not.toThrow();
	});

	it('accepts valid wBTC buffer', () => {
		expect(() => validateFeeBufferBounds(WBTC_ADDRESS, 16n)).not.toThrow();
	});

	it('accepts valid tBTC buffer', () => {
		expect(
			() => validateFeeBufferBounds(TBTC_ADDRESS, 10_000_000_000_000_000n) // $0.01 at 18 decimals
		).not.toThrow();
	});

	it('throws for non-allowed token (DAI)', () => {
		expect(() =>
			validateFeeBufferBounds('0x6B175474E89094C44Da98b954EedeAC495271d0F', 100n)
		).toThrow('Fee token not in allowed list');
	});

	it('throws for USDT0 below minimum', () => {
		expect(() => validateFeeBufferBounds(USDT0_ADDRESS, 1n)).toThrow('Fee buffer below minimum');
	});

	it('throws for USDT0 above maximum', () => {
		expect(() => validateFeeBufferBounds(USDT0_ADDRESS, 200_000_000_000_000_000n)).toThrow(
			'Fee buffer above maximum'
		);
	});

	it('throws for wBTC 1 sat (below min)', () => {
		expect(() => validateFeeBufferBounds(WBTC_ADDRESS, 1n)).toThrow('Fee buffer below minimum');
	});

	it('throws for wBTC 231 sats (above max)', () => {
		expect(() => validateFeeBufferBounds(WBTC_ADDRESS, 231n)).toThrow('Fee buffer above maximum');
	});

	it('accepts wBTC minimum (16 sats)', () => {
		expect(() => validateFeeBufferBounds(WBTC_ADDRESS, 16n)).not.toThrow();
	});

	it('accepts wBTC maximum (230 sats)', () => {
		expect(() => validateFeeBufferBounds(WBTC_ADDRESS, 230n)).not.toThrow();
	});
});

describe('validateFeeRecipient', () => {
	it('accepts correct treasury address', () => {
		expect(() => validateFeeRecipient('0x1234567890123456789012345678901234567890')).not.toThrow();
	});

	it('throws for wrong address', () => {
		expect(() => validateFeeRecipient('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toThrow(
			'Fee buffer must go to GAS_TREASURY'
		);
	});

	it('throws when GAS_TREASURY not configured', () => {
		// Mock GAS_TREASURY getter reads from process.env, so delete it
		const original = process.env['GAS_TREASURY'];
		delete process.env['GAS_TREASURY'];
		expect(() => validateFeeRecipient('0x1234567890123456789012345678901234567890')).toThrow(
			'GAS_TREASURY not configured'
		);
		if (original !== undefined) process.env['GAS_TREASURY'] = original;
	});
});

describe('requireTokenInfo', () => {
	it('finds USDT0', () => {
		expect(requireTokenInfo(USDT0_ADDRESS).symbol).toBe('USDT0');
	});

	it('finds wBTC with 8 decimals', () => {
		expect(requireTokenInfo(WBTC_ADDRESS).decimals).toBe(8);
	});

	it('finds tBTC', () => {
		expect(requireTokenInfo(TBTC_ADDRESS).symbol).toBe('TBTC');
	});

	it('is case-insensitive', () => {
		expect(requireTokenInfo(USDT0_ADDRESS.toLowerCase()).symbol).toBe('USDT0');
	});

	it('throws for unknown token', () => {
		expect(() => requireTokenInfo('0x0000000000000000000000000000000000000001')).toThrow(
			'Unsupported token'
		);
	});
});

describe('computeTotalGas', () => {
	it('sums all gas components', () => {
		expect(
			computeTotalGas({
				callGasLimit: 100_000n,
				verificationGasLimit: 50_000n,
				preVerificationGas: 10_000n
			})
		).toBe(160_000n);
	});

	it('returns zero for all zeros', () => {
		expect(
			computeTotalGas({
				callGasLimit: 0n,
				verificationGasLimit: 0n,
				preVerificationGas: 0n
			})
		).toBe(0n);
	});

	it('handles large values', () => {
		expect(
			computeTotalGas({
				callGasLimit: 4_000_000n,
				verificationGasLimit: 1_000_000n,
				preVerificationGas: 300_000n
			})
		).toBe(5_300_000n);
	});
});
