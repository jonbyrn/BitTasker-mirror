// Gasless Service Tests — Core relay logic

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock @nestjs/common ────────────────────────────────────────────
vi.mock('@nestjs/common', () => ({
	Injectable: () => (target: any) => target,
	BadRequestException: class BadRequestException extends Error {
		constructor(msg: string) {
			super(msg);
			this.name = 'BadRequestException';
		}
	},
	ForbiddenException: class ForbiddenException extends Error {
		constructor(msg: string) {
			super(msg);
			this.name = 'ForbiddenException';
		}
	},
	ServiceUnavailableException: class ServiceUnavailableException extends Error {
		constructor(msg: string) {
			super(msg);
			this.name = 'ServiceUnavailableException';
		}
	},
	Logger: vi.fn().mockImplementation(() => ({
		log: vi.fn(),
		error: vi.fn(),
		warn: vi.fn()
	}))
}));

vi.mock('@nestjs/config', () => ({
	ConfigService: vi.fn().mockImplementation(() => ({ get: vi.fn() }))
}));

// ── Mock gasless.config ──────────────────────────────────────────────
// This is critical: gasless.service.ts imports GAS_TREASURY, GAS_BOUNDS,
// ALLOWED_FEE_TOKENS, FEE_BUFFER_MIN, FEE_BUFFER_MAX, ALTO_URLS,
// ENTRY_POINT_ADDRESS, getNetworkFeeTier, getTokenInfo, convertToTokenFee
// as module-level constants/functions. We must provide all of them.
const MOCK_TREASURY = '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC';
const MOCK_ENTRY_POINT = '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108';
const MOCK_USDT0 = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const MOCK_WBTC = '0x2f2a2543B76A4166549F7aa2e75Bef0aefC5B0f';
const MOCK_TBTC = '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40';

vi.mock('../gasless.config', () => ({
	ARBITRUM_CHAIN_ID: 42161,
	ENTRY_POINT_ADDRESS: MOCK_ENTRY_POINT,
	SIMPLE_7702_ACCOUNT_IMPL: '0xe6Cae83BdE06E4c305530e199D7217f42808555B',
	USDT0_ADDRESS: MOCK_USDT0,
	WBTC_ADDRESS: MOCK_WBTC,
	TBTC_ADDRESS: MOCK_TBTC,
	TOKENS: [
		{ address: MOCK_USDT0, symbol: 'USDT0', decimals: 18, chainId: 42161 },
		{ address: MOCK_WBTC, symbol: 'WBTC', decimals: 8, chainId: 42161 },
		{ address: MOCK_TBTC, symbol: 'TBTC', decimals: 18, chainId: 42161 }
	],
	ALLOWED_FEE_TOKENS: [MOCK_USDT0.toLowerCase(), MOCK_WBTC.toLowerCase(), MOCK_TBTC.toLowerCase()],
	GAS_BOUNDS: {
		MAX_CALL_GAS: 5_000_000n,
		MAX_VERIFICATION_GAS: 1_000_000n,
		MAX_PRE_VERIFICATION_GAS: 100_000n,
		MAX_FEE_PER_GAS: 1_000_000_000n,
		MAX_PRIORITY_FEE_PER_GAS: 100_000_000n,
		MAX_TOTAL_GAS: 5_000_000n
	},
	FEE_TIERS: [
		{ label: 'Low', minGas: 0n, maxGas: 200_000n, feeUSD: 0.01 },
		{ label: 'Medium', minGas: 200_001n, maxGas: 500_000n, feeUSD: 0.03 },
		{ label: 'High', minGas: 500_001n, maxGas: 1_000_000n, feeUSD: 0.05 },
		{ label: 'Very High', minGas: 1_000_001n, maxGas: 5_000_000n, feeUSD: 0.1 }
	],
	FEE_BUFFER_MIN: {
		[MOCK_USDT0.toLowerCase()]: 10_000_000_000_000_000n,
		[MOCK_WBTC.toLowerCase()]: 16n,
		[MOCK_TBTC.toLowerCase()]: 10_000_000_000_000_000n
	},
	FEE_BUFFER_MAX: {
		[MOCK_USDT0.toLowerCase()]: 150_000_000_000_000_000n,
		[MOCK_WBTC.toLowerCase()]: 230n,
		[MOCK_TBTC.toLowerCase()]: 150_000_000_000_000_000n
	},
	GAS_TREASURY: MOCK_TREASURY,
	ALTO_URLS: ['http://alto-1:3000', 'http://alto-2:3000'],
	ARBITRUM_RPC_URL: 'http://localhost:8547',
	API_BASE_URL: 'http://localhost:4000',
	ETH_USD_FEED: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',
	BTC_USD_FEED: '0x6ce185860a4963106506C203335A2910413708e9',
	MAX_ORACLE_STALENESS: 300,
	PAYMASTER_SIGNER_KEY_FILE: '/run/secrets/paymaster_signer_key',
	getNetworkFeeTier(estimatedGas: bigint) {
		const tiers = [
			{ label: 'Low', minGas: 0n, maxGas: 200_000n, feeUSD: 0.01 },
			{ label: 'Medium', minGas: 200_001n, maxGas: 500_000n, feeUSD: 0.03 },
			{ label: 'High', minGas: 500_001n, maxGas: 1_000_000n, feeUSD: 0.05 },
			{ label: 'Very High', minGas: 1_000_001n, maxGas: 5_000_000n, feeUSD: 0.1 }
		];
		for (const tier of tiers) {
			if (estimatedGas >= tier.minGas && estimatedGas <= tier.maxGas) {
				return { feeUSD: tier.feeUSD, label: tier.label };
			}
		}
		throw new Error('Network fee too high — operation too complex');
	},
	getTokenInfo(tokenAddress: string) {
		const tokens: Record<string, any> = {
			[MOCK_USDT0.toLowerCase()]: {
				address: MOCK_USDT0,
				symbol: 'USDT0',
				decimals: 18,
				chainId: 42161
			},
			[MOCK_WBTC.toLowerCase()]: {
				address: MOCK_WBTC,
				symbol: 'WBTC',
				decimals: 8,
				chainId: 42161
			},
			[MOCK_TBTC.toLowerCase()]: {
				address: MOCK_TBTC,
				symbol: 'TBTC',
				decimals: 18,
				chainId: 42161
			}
		};
		const token = tokens[tokenAddress.toLowerCase()];
		if (!token) throw new Error(`Unknown token: ${tokenAddress}`);
		return token;
	},
	convertToTokenFee(feeUSD: number, tokenAddress: string, tokenPriceUSD: bigint) {
		const tokens: Record<string, number> = {
			[MOCK_USDT0.toLowerCase()]: 18,
			[MOCK_WBTC.toLowerCase()]: 8,
			[MOCK_TBTC.toLowerCase()]: 18
		};
		const decimals = tokens[tokenAddress.toLowerCase()];
		if (!decimals) throw new Error(`Unknown token: ${tokenAddress}`);
		const feeUSDWei = BigInt(Math.round(feeUSD * 1e18));
		const tokenAmount = (feeUSDWei * BigInt(10 ** decimals)) / tokenPriceUSD;
		return tokenAmount + 1n;
	}
}));

// ── Mock dependency services ────────────────────────────────────────
vi.mock('../deposit-monitor.service', () => ({
	DepositMonitorService: vi.fn().mockImplementation(() => ({
		isHealthy: vi.fn().mockResolvedValue(true),
		checkDeposit: vi.fn()
	}))
}));

vi.mock('../preflight-simulation.service', () => ({
	PreflightSimulationService: vi.fn().mockImplementation(() => ({
		simulate: vi.fn().mockResolvedValue(undefined)
	}))
}));

vi.mock('../chainlink-oracle.service', () => ({
	ChainlinkOracleService: vi.fn().mockImplementation(() => ({
		getTokenPriceUSD: vi.fn().mockResolvedValue(1_000_000_000_000_000_000n),
		clearCache: vi.fn()
	}))
}));

vi.mock('../paymaster-signing.service', () => ({
	PaymasterSigningService: vi.fn().mockImplementation(() => ({
		signPaymasterData: vi.fn().mockResolvedValue('0x' + 'aa'.repeat(65)),
		getSignerAddress: vi.fn().mockReturnValue('0x' + 'ff'.repeat(20))
	}))
}));

// ── Mock ethers ──────────────────────────────────────────────────────
// Use actual AbiCoder for calldata encoding but mock network calls
const mockSend = vi.fn();
vi.mock('ethers', async () => {
	const actual = await vi.importActual('ethers');
	return {
		ethers: {
			...(actual as any).ethers,
			JsonRpcProvider: vi.fn().mockImplementation(() => ({ send: mockSend })),
			concat: vi.fn((parts: any[]) => {
				return '0x' + parts.map((p) => (p.startsWith('0x') ? p.slice(2) : p.toString())).join('');
			})
		}
	};
});

// ── Import AFTER all mocks ──────────────────────────────────────────
const { ethers } = await import('ethers');
const { GaslessService } = await import('../gasless.service');

describe('GaslessService', () => {
	let service: any;

	beforeEach(() => {
		vi.clearAllMocks();
		mockSend.mockReset();
		service = new GaslessService(
			{ isHealthy: vi.fn().mockResolvedValue(true), checkDeposit: vi.fn() } as any,
			{ simulate: vi.fn().mockResolvedValue(undefined) } as any,
			{
				getTokenPriceUSD: vi.fn().mockResolvedValue(1_000_000_000_000_000_000n),
				clearCache: vi.fn()
			} as any,
			{
				signPaymasterData: vi.fn().mockResolvedValue('0x' + 'aa'.repeat(65)),
				getSignerAddress: vi.fn()
			} as any,
			{ get: vi.fn() } as any
		);
	});

	// ── Helpers ────────────────────────────────────────────────────────
	function buildValidCallData(
		feeToken: string = MOCK_USDT0,
		feeAmount: string = '10000000000000000',
		treasury: string = MOCK_TREASURY
	): string {
		const { AbiCoder } = ethers;
		const selector = '0x8d80ff0a';
		const dest = ['0x' + 'aa'.repeat(20), feeToken];
		const values = ['0', '0'];
		const transferData =
			'0xa9059cbb' +
			AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [treasury, feeAmount]).slice(2);
		const funcs = ['0x' + 'bb'.repeat(32), transferData];
		return (
			selector +
			AbiCoder.defaultAbiCoder()
				.encode(['address[]', 'uint256[]', 'bytes[]'], [dest, values, funcs])
				.slice(2)
		);
	}

	function makeUserOp(overrides: Record<string, string> = {}) {
		return {
			sender: '0x' + 'aa'.repeat(20),
			nonce: '0',
			callData: '0x' + 'bb'.repeat(32),
			callGasLimit: '200000',
			verificationGasLimit: '100000',
			preVerificationGas: '50000',
			maxFeePerGas: '100000000',
			maxPriorityFeePerGas: '10000000',
			paymasterAndData: '0x',
			signature: '0x',
			...overrides
		};
	}

	// ── validateFeeParameters ──────────────────────────────────────────
	describe('validateFeeParameters', () => {
		it('should accept valid fee parameters', () => {
			expect(() => (service as any).validateFeeParameters(makeUserOp())).not.toThrow();
		});
		it('should reject callGasLimit exceeding max', () => {
			expect(() =>
				(service as any).validateFeeParameters(makeUserOp({ callGasLimit: '6000000' }))
			).toThrow('callGasLimit exceeds maximum');
		});
		it('should reject verificationGasLimit exceeding max', () => {
			expect(() =>
				(service as any).validateFeeParameters(makeUserOp({ verificationGasLimit: '2000000' }))
			).toThrow('verificationGasLimit exceeds maximum');
		});
		it('should reject preVerificationGas exceeding max', () => {
			expect(() =>
				(service as any).validateFeeParameters(makeUserOp({ preVerificationGas: '200000' }))
			).toThrow('preVerificationGas exceeds maximum');
		});
		it('should reject maxFeePerGas exceeding ceiling', () => {
			expect(() =>
				(service as any).validateFeeParameters(makeUserOp({ maxFeePerGas: '2000000000' }))
			).toThrow('maxFeePerGas exceeds ceiling');
		});
		it('should reject maxPriorityFeePerGas exceeding ceiling', () => {
			expect(() =>
				(service as any).validateFeeParameters(makeUserOp({ maxPriorityFeePerGas: '200000000' }))
			).toThrow('maxPriorityFeePerGas exceeds ceiling');
		});
		it('should reject total gas exceeding 5M', () => {
			expect(() =>
				(service as any).validateFeeParameters(
					makeUserOp({
						callGasLimit: '4500000',
						verificationGasLimit: '900000',
						preVerificationGas: '90000'
					})
				)
			).toThrow('exceeds 5M gas limit');
		});
		it('should accept exactly at boundary', () => {
			expect(() =>
				(service as any).validateFeeParameters(
					makeUserOp({
						callGasLimit: '4900000',
						verificationGasLimit: '50000',
						preVerificationGas: '50000'
					})
				)
			).not.toThrow();
		});
	});

	// ── validateCallData ───────────────────────────────────────────────
	describe('validateCallData', () => {
		it('should accept valid executeBatch with fee transfer', () => {
			expect(() => (service as any).validateCallData(buildValidCallData())).not.toThrow();
		});
		it('should reject non-executeBatch selector', () => {
			expect(() => (service as any).validateCallData('0x12345678' + '00'.repeat(300))).toThrow(
				'callData must be executeBatch'
			);
		});
		it('should reject fee token not in allowed list', () => {
			const { AbiCoder } = ethers;
			const transferData =
				'0xa9059cbb' +
				AbiCoder.defaultAbiCoder()
					.encode(['address', 'uint256'], [MOCK_TREASURY, '10000000000000000'])
					.slice(2);
			const callData =
				'0x8d80ff0a' +
				AbiCoder.defaultAbiCoder()
					.encode(
						['address[]', 'uint256[]', 'bytes[]'],
						[
							['0x' + 'aa'.repeat(20), '0x' + 'dd'.repeat(20)],
							['0', '0'],
							['0x' + 'bb'.repeat(32), transferData]
						]
					)
					.slice(2);
			expect(() => (service as any).validateCallData(callData)).toThrow(
				'Fee token not in allowed list'
			);
		});
		it('should reject fee transfer not using ERC-20 transfer()', () => {
			const { AbiCoder } = ethers;
			const badTransfer =
				'0x12345678' +
				AbiCoder.defaultAbiCoder()
					.encode(['address', 'uint256'], [MOCK_TREASURY, '10000000000000000'])
					.slice(2);
			const callData =
				'0x8d80ff0a' +
				AbiCoder.defaultAbiCoder()
					.encode(
						['address[]', 'uint256[]', 'bytes[]'],
						[
							['0x' + 'aa'.repeat(20), MOCK_USDT0],
							['0', '0'],
							['0x' + 'bb'.repeat(32), badTransfer]
						]
					)
					.slice(2);
			expect(() => (service as any).validateCallData(callData)).toThrow(
				'Fee transfer must use ERC-20 transfer()'
			);
		});
		it('should reject fee not going to GAS_TREASURY', () => {
			const { AbiCoder } = ethers;
			const transferData =
				'0xa9059cbb' +
				AbiCoder.defaultAbiCoder()
					.encode(['address', 'uint256'], ['0x' + 'ee'.repeat(20), '10000000000000000'])
					.slice(2);
			const callData =
				'0x8d80ff0a' +
				AbiCoder.defaultAbiCoder()
					.encode(
						['address[]', 'uint256[]', 'bytes[]'],
						[
							['0x' + 'aa'.repeat(20), MOCK_USDT0],
							['0', '0'],
							['0x' + 'bb'.repeat(32), transferData]
						]
					)
					.slice(2);
			expect(() => (service as any).validateCallData(callData)).toThrow(
				'Fee buffer must go to GAS_TREASURY'
			);
		});
		it('should reject fee buffer below minimum', () => {
			const { AbiCoder } = ethers;
			const transferData =
				'0xa9059cbb' +
				AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [MOCK_TREASURY, '100']).slice(2);
			const callData =
				'0x8d80ff0a' +
				AbiCoder.defaultAbiCoder()
					.encode(
						['address[]', 'uint256[]', 'bytes[]'],
						[
							['0x' + 'aa'.repeat(20), MOCK_USDT0],
							['0', '0'],
							['0x' + 'bb'.repeat(32), transferData]
						]
					)
					.slice(2);
			expect(() => (service as any).validateCallData(callData)).toThrow('Fee buffer below minimum');
		});
		it('should reject fee buffer above maximum', () => {
			const { AbiCoder } = ethers;
			const transferData =
				'0xa9059cbb' +
				AbiCoder.defaultAbiCoder()
					.encode(['address', 'uint256'], [MOCK_TREASURY, '99999999999999999999'])
					.slice(2);
			const callData =
				'0x8d80ff0a' +
				AbiCoder.defaultAbiCoder()
					.encode(
						['address[]', 'uint256[]', 'bytes[]'],
						[
							['0x' + 'aa'.repeat(20), MOCK_USDT0],
							['0', '0'],
							['0x' + 'bb'.repeat(32), transferData]
						]
					)
					.slice(2);
			expect(() => (service as any).validateCallData(callData)).toThrow('Fee buffer above maximum');
		});
		it('should reject invalid callData format', () => {
			expect(() => (service as any).validateCallData('0x8d80ff0a' + 'zz')).toThrow(
				'Invalid callData format'
			);
		});
		it('should reject executeBatch with fewer than 2 calls', () => {
			const { AbiCoder } = ethers;
			const callData =
				'0x8d80ff0a' +
				AbiCoder.defaultAbiCoder()
					.encode(
						['address[]', 'uint256[]', 'bytes[]'],
						[['0x' + 'aa'.repeat(20)], ['0'], ['0x' + 'bb'.repeat(32)]]
					)
					.slice(2);
			expect(() => (service as any).validateCallData(callData)).toThrow('at least 2 calls');
		});
	});

	// ── relay ──────────────────────────────────────────────────────────
	describe('relay', () => {
		it('should check deposit health before relay', async () => {
			const unhealthyService = new GaslessService(
				{ isHealthy: vi.fn().mockResolvedValue(false), checkDeposit: vi.fn() } as any,
				{ simulate: vi.fn() } as any,
				{ getTokenPriceUSD: vi.fn(), clearCache: vi.fn() } as any,
				{ signPaymasterData: vi.fn(), getSignerAddress: vi.fn() } as any,
				{ get: vi.fn() } as any
			);
			await expect(
				unhealthyService.relay({ sender: '0x' + 'aa'.repeat(20), userOp: makeUserOp() }, 'user-1')
			).rejects.toThrow('Paymaster deposit too low');
		});
		it('should validate fee parameters before relay', async () => {
			await expect(
				service.relay(
					{ sender: '0x' + 'aa'.repeat(20), userOp: makeUserOp({ callGasLimit: '6000000' }) },
					'user-1'
				)
			).rejects.toThrow('callGasLimit exceeds maximum');
		});
	});

	// ── estimate ───────────────────────────────────────────────────────
	describe('estimate', () => {
		it('should return fee estimate for valid request', async () => {
			// Mock the alto bundler estimate call
			mockSend.mockResolvedValue({
				preVerificationGas: '50000',
				verificationGasLimit: '100000',
				callGasLimit: '200000'
			});
			const result = await service.estimate(
				{ token: MOCK_USDT0, amount: '1000000000000000000', recipient: '0x' + 'bb'.repeat(20) },
				'user-1'
			);
			expect(result).toHaveProperty('feeBuffer');
			expect(result).toHaveProperty('feeCostUSD');
			expect(result).toHaveProperty('feeTier');
			expect(result).toHaveProperty('totalWithBuffer');
			expect(result.feeCostUSD).toBeGreaterThan(0);
		});
		it('should reject when total gas exceeds MAX_TOTAL_GAS', async () => {
			mockSend.mockResolvedValue({
				preVerificationGas: '2000000',
				verificationGasLimit: '2000000',
				callGasLimit: '2000000'
			});
			await expect(
				service.estimate(
					{ token: MOCK_USDT0, amount: '1000000000000000000', recipient: '0x' + 'bb'.repeat(20) },
					'user-1'
				)
			).rejects.toThrow();
		});
	});

	// ── sendWithFallback ──────────────────────────────────────────────
	describe('sendWithFallback', () => {
		it('should succeed with first Alto client', async () => {
			mockSend.mockResolvedValue('0x' + 'ee'.repeat(32));
			const result = await (service as any).sendWithFallback(makeUserOp());
			expect(result).toBe('0x' + 'ee'.repeat(32));
		});
		it('should throw when all Alto clients fail', async () => {
			mockSend.mockRejectedValue(new Error('All down'));
			await expect((service as any).sendWithFallback(makeUserOp())).rejects.toThrow();
		});
		it('should fallback to second Alto client when first fails', async () => {
			// First call fails, second succeeds
			mockSend
				.mockRejectedValueOnce(new Error('First client failed'))
				.mockResolvedValueOnce('0x' + 'ff'.repeat(32));
			const result = await (service as any).sendWithFallback(makeUserOp());
			expect(result).toBe('0x' + 'ff'.repeat(32));
			expect(mockSend).toHaveBeenCalledTimes(2);
		});
		it('should update currentAltoIndex after successful send', async () => {
			mockSend.mockResolvedValue('0x' + 'ee'.repeat(32));
			await (service as any).sendWithFallback(makeUserOp());
			// currentAltoIndex should be 0 (first client)
			expect((service as any).currentAltoIndex).toBe(0);
		});
	});

	// ── reEstimateFeeAtRelay ──────────────────────────────────────────
	describe('reEstimateFeeAtRelay', () => {
		it('should reject when actual gas tier exceeds claimed fee buffer', async () => {
			// Create a callData with a low fee buffer (0.01 USDT0 = 10_000_000_000_000_000n)
			const lowFeeAmount = '10000000000000000'; // 0.01 USDT0 (Low tier)
			const callData = buildValidCallData(MOCK_USDT0, lowFeeAmount);
			const userOp = makeUserOp({ callData });

			// Mock oracle to return $1.00 price
			service.oracle.getTokenPriceUSD = vi.fn().mockResolvedValue(1_000_000_000_000_000_000n);

			// Mock alto client to return High tier gas (750K gas)
			mockSend.mockResolvedValue({
				preVerificationGas: '200000',
				verificationGasLimit: '300000',
				callGasLimit: '250000'
			});

			await expect(
				(service as any).reEstimateFeeAtRelay({ sender: '0x' + 'aa'.repeat(20), userOp })
			).rejects.toThrow('Fee tier mismatch');
		});

		it('should throw ServiceUnavailableException when RPC fails', async () => {
			const callData = buildValidCallData();
			const userOp = makeUserOp({ callData });

			// Mock alto client to throw
			mockSend.mockRejectedValue(new Error('RPC error'));

			await expect(
				(service as any).reEstimateFeeAtRelay({ sender: '0x' + 'aa'.repeat(20), userOp })
			).rejects.toThrow('Fee re-estimation failed');
		});
	});

	// ── relay happy path and error handling ────────────────────────────
	describe('relay', () => {
		it('should complete full relay happy path', async () => {
			// Mock all dependencies for success
			const callData = buildValidCallData();
			const userOp = makeUserOp({ callData });

			// Mock alto client for re-estimation and send
			let callCount = 0;
			mockSend.mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// reEstimateFeeAtRelay call - Low tier (100K total gas = Low)
					return {
						preVerificationGas: '30000',
						verificationGasLimit: '30000',
						callGasLimit: '40000'
					};
				}
				// sendWithFallback call
				return '0x' + 'dd'.repeat(32);
			});

			const result = await service.relay({ sender: '0x' + 'aa'.repeat(20), userOp }, 'user-123');

			expect(result).toHaveProperty('userOpHash', '0x' + 'dd'.repeat(32));
			expect(service.depositMonitor.isHealthy).toHaveBeenCalled();
			expect(service.preflight.simulate).toHaveBeenCalledWith(userOp);
			expect(service.signing.signPaymasterData).toHaveBeenCalled();
		});

		it('should abort when preflight simulation fails', async () => {
			const callData = buildValidCallData();
			const userOp = makeUserOp({ callData });

			// Mock preflight to throw
			service.preflight.simulate = vi.fn().mockRejectedValue(new Error('Simulation failed'));

			// The relay method wraps non-BadRequest/Forbidden exceptions as ServiceUnavailableException
			await expect(
				service.relay({ sender: '0x' + 'aa'.repeat(20), userOp }, 'user-123')
			).rejects.toThrow('Gasless relay temporarily unavailable');
		});

		it('should wrap generic errors as ServiceUnavailableException', async () => {
			const callData = buildValidCallData();
			const userOp = makeUserOp({ callData });

			// Mock preflight to throw generic Error
			service.preflight.simulate = vi.fn().mockRejectedValue(new Error('Something unexpected'));

			await expect(
				service.relay({ sender: '0x' + 'aa'.repeat(20), userOp }, 'user-123')
			).rejects.toThrow('Gasless relay temporarily unavailable');
		});
	});

	// ── estimate error handling ───────────────────────────────────────
	describe('estimate', () => {
		it('should wrap generic errors as BadRequestException', async () => {
			// Mock alto client to throw generic Error
			mockSend.mockRejectedValue(new Error('RPC connection failed'));

			await expect(
				service.estimate(
					{ token: MOCK_USDT0, amount: '1000000000000000000', recipient: '0x' + 'bb'.repeat(20) },
					'user-1'
				)
			).rejects.toThrow('Fee estimation failed');
		});
	});

	// ── buildCallData paths ───────────────────────────────────────────
	describe('buildCallData', () => {
		it('should handle multi-call path with calls array', () => {
			const dto = {
				token: MOCK_USDT0,
				amount: '1000000000000000000',
				recipient: '0x' + 'bb'.repeat(20),
				calls: [
					{ to: '0x' + 'cc'.repeat(20), data: '0x' + 'dd'.repeat(32), value: '0' },
					{ to: '0x' + 'ee'.repeat(20), data: '0x' + 'ff'.repeat(32), value: '0' }
				]
			};

			const callData = (service as any).buildCallData(dto);
			expect(callData).toMatch(/^0x8d80ff0a/);
			expect(callData.length).toBeGreaterThan(10);
		});

		it('should handle simple transfer path without calls', () => {
			const dto = {
				token: MOCK_USDT0,
				amount: '1000000000000000000',
				recipient: '0x' + 'bb'.repeat(20)
			};

			const callData = (service as any).buildCallData(dto);
			expect(callData).toMatch(/^0x8d80ff0a/);
			expect(callData.length).toBeGreaterThan(10);
		});
	});
});
