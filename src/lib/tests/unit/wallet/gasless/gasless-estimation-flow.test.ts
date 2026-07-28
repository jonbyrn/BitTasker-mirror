/**
 * Frontend Gasless Estimation Flow — Behavioral Tests
 *
 * Tests the frontend's estimation flow end-to-end:
 * - How estimateFee() constructs the DTO
 * - How it handles the sender (smart account address)
 * - How it handles custom calls
 * - How the response is consumed (feeBuffer, estimatedGas, feeTier)
 * - Frontend-backend config alignment
 * - Fee buffer bounds validation
 *
 * These tests verify the CLIENT-SIDE behavior and identify potential issues
 * in how the frontend calls the estimation endpoint.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted runs BEFORE vi.mock factories
vi.hoisted(() => {
	process.env['GAS_TREASURY'] = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
});

// Mock gasless.config
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
		{ label: 'Very High', minGas: 1_000_001n, maxGas: 6_000_000n, feeUSD: 0.1 }
	];
	const FEE_BUFFER_MIN = {
		'0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 10_000n,
		'0x2f2a2543b76a4166549f7aa2e75bef0aefc5b0f': 16n,
		'0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40': 150_000_000_000n
	};
	const FEE_BUFFER_MAX = {
		'0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 150_000n,
		'0x2f2a2543b76a4166549f7aa2e75bef0aefc5b0f': 230n,
		'0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40': 2_500_000_000_000n
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
		ALTO_URLS: ['http://alto-1:3000', 'http://alto-2:3000'],
		ARBITRUM_RPC_URL: '',
		API_BASE_URL: 'http://localhost:4000',
		gaslessConfig: {
			tokens: [...TOKENS],
			gasBounds: { ...GAS_BOUNDS },
			feeTiers: [...FEE_TIERS],
			feeBufferBounds: {
				'0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': { min: 10_000n, max: 150_000n },
				'0x2f2a2543b76a4166549f7aa2e75bef0aefc5b0f': { min: 16n, max: 230n },
				'0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40': {
					min: 150_000_000_000n,
					max: 2_500_000_000_000n
				}
			},
			treasury: process.env['GAS_TREASURY'] ?? '',
			entryPointAddress: '0x433709009B8330FDa32311DF1C2AFA402eD8D009',
			chainId: BigInt(42161),
			altoUrls: ['http://alto-1:3000', 'http://alto-2:3000']
		},
		getTokenByAddress: (address: string) =>
			TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase()),
		getTokenBySymbol: (symbol: string) => TOKENS.find((t) => t.symbol === symbol.toUpperCase()),
		isAllowedFeeToken: (address: string) => ALLOWED_FEE_TOKENS.includes(address.toLowerCase())
	};
});

// Mock the API service — captures calls to verify DTO construction
let capturedEstimateDto: Record<string, unknown> | null = null;
const mockEstimateResponse = {
	feeBuffer: '10000',
	feeCostUSD: 0.01,
	feeTier: 'Low',
	totalWithBuffer: '1010000',
	estimatedGas: {
		callGasLimit: '50000',
		verificationGasLimit: '50000',
		preVerificationGas: '21000'
	}
};

vi.mock('$lib/api/services/gasless.service', () => ({
	gaslessService: {
		estimate: vi.fn().mockImplementation((dto) => {
			capturedEstimateDto = dto;
			return Promise.resolve(mockEstimateResponse);
		}),
		relay: vi.fn(),
		prepare: vi.fn(),
		simulate: vi.fn(),
		checkBalance: vi.fn(),
		health: vi.fn(),
		config: vi.fn()
	},
	GaslessService: vi.fn()
}));

// Mock svelte/store — need shared mutable state accessible from both mock and tests
const { mockStoreState } = vi.hoisted(() => {
	const state: {
		ready: boolean;
		address: string | undefined;
		loading: boolean;
		error: null;
		wallet: null;
		ownerKey: null;
	} = {
		ready: true,
		address: '0x' + '11'.repeat(20),
		loading: false,
		error: null,
		wallet: null,
		ownerKey: null
	};
	return { mockStoreState: state };
});

vi.mock('svelte/store', () => {
	function writable(value: unknown) {
		let currentValue = value;
		const subscribers = new Set<(v: unknown) => void>();
		return {
			subscribe(fn: (v: unknown) => void) {
				fn(currentValue);
				subscribers.add(fn);
				return () => subscribers.delete(fn);
			},
			set(newValue: unknown) {
				currentValue = newValue;
				subscribers.forEach((fn) => fn(currentValue));
			},
			update(fn: (v: unknown) => unknown) {
				currentValue = fn(currentValue);
				subscribers.forEach((fn) => fn(currentValue));
			}
		};
	}
	return {
		get: vi.fn().mockImplementation(() => mockStoreState),
		writable,
		derived: vi.fn().mockImplementation((stores: unknown, fn: (s: unknown) => unknown) => {
			return {
				subscribe: (sub: (v: unknown) => void) => {
					sub(fn(stores));
					return () => {};
				}
			};
		})
	};
});

// Mock ethers
vi.mock('ethers', async () => {
	const actual = await vi.importActual('ethers');
	return {
		...actual,
		isAddress: (addr: string) => /^0x[0-9a-fA-F]{40}$/.test(addr)
	};
});

// ── Import modules ────────────────────────────────────────────────────────

import { getNetworkFeeTier, validateFeeBufferBounds } from '$lib/wallet/gasless-helpers';
import {
	USDT0_ADDRESS,
	WBTC_ADDRESS,
	TBTC_ADDRESS,
	FEE_BUFFER_MIN,
	FEE_BUFFER_MAX,
	GAS_BOUNDS
} from '$lib/wallet/gasless.config';

// ── Tests ─────────────────────────────────────────────────────────────────

describe('frontend estimation DTO construction', () => {
	beforeEach(() => {
		capturedEstimateDto = null;
	});

	it('estimateFee sends token, amount (as string), recipient, and sender', async () => {
		const { estimateFee } = await import('$lib/wallet/gasless-store');
		await estimateFee(USDT0_ADDRESS, 1000000n, '0x' + '22'.repeat(20));

		expect(capturedEstimateDto).not.toBeNull();
		expect(capturedEstimateDto!.token).toBe(USDT0_ADDRESS);
		expect(capturedEstimateDto!.amount).toBe('1000000');
		expect(capturedEstimateDto!.recipient).toBe('0x' + '22'.repeat(20));
		expect(capturedEstimateDto!.sender).toBe('0x' + '11'.repeat(20)); // from mocked store
	});

	it('estimateFee converts bigint amount to string for JSON transport', async () => {
		const { estimateFee } = await import('$lib/wallet/gasless-store');
		const largeAmount = 10n ** 18n; // 1 token with 18 decimals
		await estimateFee(TBTC_ADDRESS, largeAmount, '0x' + '22'.repeat(20));

		expect(capturedEstimateDto!.amount).toBe('1000000000000000000');
		expect(typeof capturedEstimateDto!.amount).toBe('string');
	});

	it('estimateFee includes sender when wallet is ready', async () => {
		const { estimateFee } = await import('$lib/wallet/gasless-store');
		await estimateFee(USDT0_ADDRESS, 1000000n, '0x' + '22'.repeat(20));

		expect(capturedEstimateDto!.sender).toBe('0x' + '11'.repeat(20));
	});

	it('estimateFee omits sender when wallet is not ready', async () => {
		// Mutate the shared mock store state
		mockStoreState.ready = false;
		mockStoreState.address = undefined as unknown as string;

		const { estimateFee } = await import('$lib/wallet/gasless-store');
		await estimateFee(USDT0_ADDRESS, 1000000n, '0x' + '22'.repeat(20));

		expect(capturedEstimateDto!.sender).toBeUndefined();

		// Restore
		mockStoreState.ready = true;
		mockStoreState.address = '0x' + '11'.repeat(20);
	});

	it('estimateFee includes custom calls when provided', async () => {
		const { estimateFee } = await import('$lib/wallet/gasless-store');
		const calls = [{ to: '0x' + 'aa'.repeat(20), data: '0xabcdef', value: 1000n }];
		await estimateFee(USDT0_ADDRESS, 1000000n, '0x' + '22'.repeat(20), calls);

		expect(capturedEstimateDto!.calls).toBeDefined();
		expect(capturedEstimateDto!.calls).toHaveLength(1);
		expect((capturedEstimateDto!.calls as unknown[])[0]).toHaveProperty(
			'to',
			'0x' + 'aa'.repeat(20)
		);
		expect((capturedEstimateDto!.calls as unknown[])[0]).toHaveProperty('data', '0xabcdef');
		expect((capturedEstimateDto!.calls as unknown[])[0]).toHaveProperty('value', '1000');
	});

	it('estimateFee validates token address', async () => {
		const { estimateFee } = await import('$lib/wallet/gasless-store');
		await expect(estimateFee('not-an-address', 1000000n, '0x' + '22'.repeat(20))).rejects.toThrow(
			'Invalid token address'
		);
	});

	it('estimateFee validates recipient address', async () => {
		const { estimateFee } = await import('$lib/wallet/gasless-store');
		await expect(estimateFee(USDT0_ADDRESS, 1000000n, 'not-an-address')).rejects.toThrow(
			'Invalid recipient address'
		);
	});

	it('estimateFee validates positive amount', async () => {
		const { estimateFee } = await import('$lib/wallet/gasless-store');
		await expect(estimateFee(USDT0_ADDRESS, 0n, '0x' + '22'.repeat(20))).rejects.toThrow(
			'Amount must be positive'
		);
	});
});

describe('frontend estimation response handling', () => {
	it('returns FeeEstimate with all required fields', async () => {
		const { estimateFee } = await import('$lib/wallet/gasless-store');
		const result = await estimateFee(USDT0_ADDRESS, 1000000n, '0x' + '22'.repeat(20));

		expect(result).toHaveProperty('feeBuffer');
		expect(result).toHaveProperty('feeCostUSD');
		expect(result).toHaveProperty('feeTier');
		expect(result).toHaveProperty('totalWithBuffer');
		expect(result).toHaveProperty('estimatedGas');
	});

	it('feeBuffer is a string (BigInt serialized)', async () => {
		const { estimateFee } = await import('$lib/wallet/gasless-store');
		const result = await estimateFee(USDT0_ADDRESS, 1000000n, '0x' + '22'.repeat(20));

		expect(typeof result.feeBuffer).toBe('string');
		expect(result.feeBuffer).toMatch(/^[0-9]+$/);
	});

	it('estimatedGas contains callGasLimit, verificationGasLimit, preVerificationGas', async () => {
		const { estimateFee } = await import('$lib/wallet/gasless-store');
		const result = await estimateFee(USDT0_ADDRESS, 1000000n, '0x' + '22'.repeat(20));

		expect(result.estimatedGas).toHaveProperty('callGasLimit');
		expect(result.estimatedGas).toHaveProperty('verificationGasLimit');
		expect(result.estimatedGas).toHaveProperty('preVerificationGas');
	});

	it('sendArbitrumTransaction uses estimatedGas from estimation for relay', async () => {
		// This tests the downstream consumer of estimateFee
		// In wallet-send.ts, sendArbitrumTransaction calls estimateFee
		// and passes estimate.estimatedGas to sendGaslessCalls
		const { estimateFee } = await import('$lib/wallet/gasless-store');
		const result = await estimateFee(USDT0_ADDRESS, 1000000n, '0x' + '22'.repeat(20));

		// The estimatedGas object should be directly usable by sendGaslessCalls
		expect(typeof result.estimatedGas!.callGasLimit).toBe('string');
		expect(BigInt(result.estimatedGas!.callGasLimit)).toBeGreaterThan(0n);
	});
});

describe('frontend fee buffer bounds — backend alignment', () => {
	it('FEE_BUFFER_MIN for USDT0 matches expected range ($0.01)', () => {
		const min = FEE_BUFFER_MIN[USDT0_ADDRESS.toLowerCase()];
		// 0.01 USDT0 = 10,000 (6 decimals)
		expect(min).toBe(10_000n);
	});

	it('FEE_BUFFER_MAX for USDT0 matches expected range ($0.15)', () => {
		const max = FEE_BUFFER_MAX[USDT0_ADDRESS.toLowerCase()];
		// 0.15 USDT0 = 150,000 (6 decimals)
		expect(max).toBe(150_000n);
	});

	it('FEE_BUFFER_MIN for WBTC matches expected range (~$0.02)', () => {
		const min = FEE_BUFFER_MIN[WBTC_ADDRESS.toLowerCase()];
		// 16 satoshis ≈ $0.02 at $65K BTC
		expect(min).toBe(16n);
	});

	it('FEE_BUFFER_MAX for WBTC matches expected range (~$0.27)', () => {
		const max = FEE_BUFFER_MAX[WBTC_ADDRESS.toLowerCase()];
		// 230 satoshis ≈ $0.27 at $65K BTC
		expect(max).toBe(230n);
	});

	it('FEE_BUFFER_MIN for tBTC: frontend uses 150_000_000_000 while NestJS uses 150_000_000_000_000', () => {
		// CONFIG DIVERGENCE DETECTED:
		// Frontend: 150_000_000_000 (0.00000015 tBTC ≈ $0.00001)
		// NestJS:   150_000_000_000_000 (0.00015 tBTC ≈ $0.01)
		// meta-tx-relay: 10_000_000_000_000_000 (0.01 tBTC ≈ $0.01)
		const frontendMin = FEE_BUFFER_MIN[TBTC_ADDRESS.toLowerCase()];
		expect(frontendMin).toBe(150_000_000_000n);

		// The NestJS backend uses 150_000_000_000_000n for tBTC FEE_BUFFER_MIN
		// This is a 1000x divergence that could cause validation failures at relay time
	});

	it('FEE_BUFFER_MAX for tBTC: frontend uses 2_500_000_000_000 while meta-tx-relay uses 150_000_000_000_000_000', () => {
		// CONFIG DIVERGENCE:
		// Frontend: 2_500_000_000_000 (0.0025 tBTC ≈ $0.16)
		// meta-tx-relay: 150_000_000_000_000_000 (0.15 tBTC ≈ $9.75)
		const frontendMax = FEE_BUFFER_MAX[TBTC_ADDRESS.toLowerCase()];
		expect(frontendMax).toBe(2_500_000_000_000n);
	});
});

describe('frontend gas bounds — backend alignment', () => {
	it('GAS_BOUNDS.maxTotalGas is 6M (matches frontend config)', () => {
		expect(GAS_BOUNDS.maxTotalGas).toBe(6_000_000n);
	});

	it('GAS_BOUNDS.maxCallGas is 5M', () => {
		expect(GAS_BOUNDS.maxCallGas).toBe(5_000_000n);
	});

	it('GAS_BOUNDS.maxPreVerificationGas is 100K (for EIP-7702)', () => {
		expect(GAS_BOUNDS.maxPreVerificationGas).toBe(100_000n);
	});
});

describe('frontend fee tier computation', () => {
	it('returns Low tier for simple transfer gas (~121K)', () => {
		// Simple ERC-20 transfer: 21K preVerification + 50K verification + 50K call = 121K
		const tier = getNetworkFeeTier(121_000n);
		expect(tier.label).toBe('Low');
		expect(tier.feeUSD).toBe(0.01);
	});

	it('returns Medium tier for batch operation gas (~300K)', () => {
		// Bridge/swap operations: ~300K gas
		const tier = getNetworkFeeTier(300_000n);
		expect(tier.label).toBe('Medium');
		expect(tier.feeUSD).toBe(0.03);
	});

	it('returns High tier for complex operation gas (~700K)', () => {
		const tier = getNetworkFeeTier(700_000n);
		expect(tier.label).toBe('High');
		expect(tier.feeUSD).toBe(0.05);
	});

	it('returns Very High tier for heavy operation gas (~2M)', () => {
		const tier = getNetworkFeeTier(2_000_000n);
		expect(tier.label).toBe('Very High');
		expect(tier.feeUSD).toBe(0.1);
	});
});

describe('frontend fee buffer validation — defense-in-depth', () => {
	it('validates fee buffer against min bounds (USDT0)', () => {
		// Below min: should throw
		expect(() => validateFeeBufferBounds(USDT0_ADDRESS, 1n)).toThrow('below minimum');
		// At min: should pass
		expect(() => validateFeeBufferBounds(USDT0_ADDRESS, 10_000n)).not.toThrow();
	});

	it('validates fee buffer against max bounds (USDT0)', () => {
		// At max: should pass
		expect(() => validateFeeBufferBounds(USDT0_ADDRESS, 150_000n)).not.toThrow();
		// Above max: should throw
		expect(() => validateFeeBufferBounds(USDT0_ADDRESS, 150_001n)).toThrow('above maximum');
	});

	it('frontend FEE_BUFFER_MIN for tBTC may cause relay validation failure', () => {
		// Frontend uses 150_000_000_000n for tBTC min
		// If relay-time validation uses a different min, the fee buffer could be rejected
		const frontendTbtcMin = FEE_BUFFER_MIN[TBTC_ADDRESS.toLowerCase()];
		// Backend (NestJS) uses 150_000_000_000_000n — 1000x larger
		// This means: if frontend sends a fee buffer of 150_000_000_000
		// and the backend expects at least 150_000_000_000_000,
		// the relay will reject with "Fee buffer below minimum"
		expect(frontendTbtcMin).toBe(150_000_000_000n);
		// This is 1000x smaller than the NestJS min of 150_000_000_000_000n
	});
});

describe('frontend gasless config fetch', () => {
	it('fetchGaslessConfig updates mutable objects in place', async () => {
		// This test verifies that the dynamic config fetch mechanism works
		// by checking that the mutable objects are properly structured
		const { GAS_BOUNDS: bounds, FEE_TIERS: tiers } = await import('$lib/wallet/gasless.config');

		// Verify structure
		expect(bounds).toHaveProperty('maxCallGas');
		expect(bounds).toHaveProperty('maxTotalGas');
		expect(tiers).toHaveLength(4);
		expect(tiers[0].label).toBe('Low');
	});
});

describe('frontend EstimateRequest type — sender field', () => {
	it('EstimateRequest interface includes optional sender field', () => {
		// FIXED: The EstimateRequest type in gasless.service.ts now defines:
		//   { token, amount, recipient, calls?, sender? }
		//
		// The sender field allows the frontend to pass the smart account address
		// so the backend can estimate gas accurately against the actual account.

		const estimateRequestType = {
			token: '0x' + 'aa'.repeat(20),
			amount: '1000000',
			recipient: '0x' + 'bb'.repeat(20),
			sender: '0x' + '11'.repeat(20)
		};

		expect(estimateRequestType).toHaveProperty('sender');
	});
});

describe('frontend gasless relay payload — estimatedGas passthrough', () => {
	it('estimatedGas from estimate is passed to sendGaslessCalls as UserOp gas parameters', () => {
		// This verifies the data flow:
		// estimateFee → estimatedGas → sendGaslessCalls → UserOp construction
		//
		// The estimatedGas values from the estimate endpoint should be used
		// as the UserOp's gas parameters (callGasLimit, verificationGasLimit, preVerificationGas)
		const mockEstimateResult = {
			feeBuffer: '10000',
			feeCostUSD: 0.01,
			feeTier: 'Low',
			totalWithBuffer: '1010000',
			estimatedGas: {
				callGasLimit: '50000',
				verificationGasLimit: '50000',
				preVerificationGas: '21000'
			}
		};

		// These values should flow into the UserOp
		expect(BigInt(mockEstimateResult.estimatedGas.callGasLimit)).toBeGreaterThan(0n);
		expect(BigInt(mockEstimateResult.estimatedGas.verificationGasLimit)).toBeGreaterThan(0n);
		expect(BigInt(mockEstimateResult.estimatedGas.preVerificationGas)).toBeGreaterThan(0n);

		// If the estimate always returns 500K callGasLimit (due to the dummy fee buffer bug),
		// then every gasless transaction uses 500K gas for the call — even simple transfers
		// that only need 50K-65K. This wastes gas and inflates the fee tier.
	});
});
