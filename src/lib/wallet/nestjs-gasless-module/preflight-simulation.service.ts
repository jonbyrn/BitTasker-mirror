/**
 * Preflight Simulation Service
 *
 * Simulates UserOps via the bundler's simulateHandleOp endpoint before
 * actually submitting them. Catches reverts, gas estimation errors, and
 * signature validation failures early — preventing wasted bundler gas
 * and protecting the paymaster from sponsoring doomed transactions.
 *
 * Reference implementation for the NestJS backend.
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { createPublicClient, http, type PublicClient } from 'viem';
import { arbitrum } from 'viem/chains';
import { GASLESS_CONFIG, type ResolvedGaslessConfig } from './gasless.config';
import type { UserOp, GasEstimate } from '../../../types/gasless.types';

// =============================================================================
// Simulation Result Types
// =============================================================================

export interface SimulationResult {
	/** Whether the UserOp would succeed on-chain */
	success: boolean;

	/** Simulated gas estimates */
	gasEstimate: GasEstimate;

	/** Return data from the UserOp execution */
	returnData?: string;

	/** Revert reason if simulation failed */
	revertReason?: string;

	/** Simulated validation gas used */
	validationGasUsed?: bigint;

	/** Simulated execution gas used */
	executionGasUsed?: bigint;

	/** Total gas cost estimate in wei */
	estimatedCostWei?: bigint;
}

// =============================================================================
// Error Types
// =============================================================================

export class SimulationError extends Error {
	constructor(
		message: string,
		public readonly revertReason: string,
		public readonly userOpHash?: string
	) {
		super(message);
		this.name = 'SimulationError';
	}
}

// =============================================================================
// EntryPoint ABI (simulateHandleOp only)
// =============================================================================

const ENTRY_POINT_ABI = [
	{
		name: 'simulateHandleOp',
		type: 'function',
		stateMutability: 'nonpayable',
		inputs: [
			{
				name: 'op',
				type: 'tuple',
				components: [
					{ name: 'sender', type: 'address' },
					{ name: 'nonce', type: 'uint256' },
					{ name: 'callData', type: 'bytes' },
					{ name: 'callGasLimit', type: 'uint128' },
					{ name: 'verificationGasLimit', type: 'uint128' },
					{ name: 'preVerificationGas', type: 'uint128' },
					{ name: 'maxFeePerGas', type: 'uint128' },
					{ name: 'maxPriorityFeePerGas', type: 'uint128' },
					{ name: 'paymasterAndData', type: 'bytes' },
					{ name: 'signature', type: 'bytes' }
				]
			},
			{
				name: 'targetContract',
				type: 'address'
			},
			{
				name: 'targetCallData',
				type: 'bytes'
			}
		],
		outputs: [
			{
				name: 'targetResult',
				type: 'tuple',
				components: [
					{ name: 'success', type: 'bool' },
					{ name: 'returnData', type: 'bytes' }
				]
			},
			{
				name: 'gasUsedByValidateOp',
				type: 'uint256'
			},
			{
				name: 'gasUsedByExecution',
				type: 'uint256'
			}
		]
	}
] as const;

// =============================================================================
// Service
// =============================================================================

@Injectable()
export class PreflightSimulationService {
	private readonly logger = new Logger(PreflightSimulationService.name);
	private readonly publicClient: PublicClient;

	constructor(@Inject(GASLESS_CONFIG) private readonly config: ResolvedGaslessConfig) {
		this.publicClient = createPublicClient({
			chain: arbitrum,
			transport: http(this.config.bundlerRpcUrl)
		}) as unknown as PublicClient;

		this.logger.log('PreflightSimulationService initialized');
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------

	/**
	 * Simulate a UserOp before relay.
	 * Returns detailed gas estimates and catches reverts.
	 */
	async simulate(userOp: UserOp): Promise<SimulationResult> {
		if (!this.config.enableSimulation) {
			this.logger.debug('Simulation disabled — skipping');
			return this.buildSuccessResult(userOp);
		}

		const startTime = Date.now();
		this.logger.debug(`Simulating UserOp sender=${userOp.sender} nonce=${userOp.nonce}`);

		try {
			const result = await this.runSimulation(userOp);
			const elapsed = Date.now() - startTime;

			this.logger.debug(
				`Simulation complete in ${elapsed}ms — ` +
					`success=${result.success} gas=${result.gasEstimate.totalGasLimit}`
			);

			return result;
		} catch (error) {
			const elapsed = Date.now() - startTime;
			const revertReason = this.extractRevertReason(error);

			this.logger.warn(
				`Simulation failed in ${elapsed}ms for sender=${userOp.sender}: ${revertReason}`
			);

			return {
				success: false,
				gasEstimate: this.buildZeroGasEstimate(),
				revertReason
			};
		}
	}

	/**
	 * Simulate and throw if unsuccessful.
	 * Use this when simulation is mandatory before relay.
	 */
	async simulateOrThrow(userOp: UserOp): Promise<SimulationResult> {
		const result = await this.simulate(userOp);

		if (!result.success) {
			throw new SimulationError(
				`UserOp simulation failed: ${result.revertReason ?? 'unknown'}`,
				result.revertReason ?? 'unknown'
			);
		}

		return result;
	}

	/**
	 * Validate gas estimates against config bounds.
	 * Returns true if estimates are acceptable.
	 */
	validateGasEstimate(estimate: GasEstimate): {
		valid: boolean;
		reason?: string;
	} {
		const { gasBounds } = this.config;

		if (estimate.totalGasLimit < gasBounds.minGasLimit) {
			return {
				valid: false,
				reason: `Total gas ${estimate.totalGasLimit} below minimum ${gasBounds.minGasLimit}`
			};
		}

		if (estimate.totalGasLimit > gasBounds.maxGasLimit) {
			return {
				valid: false,
				reason: `Total gas ${estimate.totalGasLimit} exceeds maximum ${gasBounds.maxGasLimit}`
			};
		}

		if (estimate.callGasLimit > this.config.maxAcceptedGasLimit) {
			return {
				valid: false,
				reason: `callGasLimit ${estimate.callGasLimit} exceeds max accepted ${this.config.maxAcceptedGasLimit}`
			};
		}

		return { valid: true };
	}

	// ---------------------------------------------------------------------------
	// Internal Methods
	// ---------------------------------------------------------------------------

	/**
	 * Run the actual simulation via the bundler.
	 */
	private async runSimulation(userOp: UserOp): Promise<SimulationResult> {
		// Encode the UserOp for the EntryPoint contract call
		const opTuple = this.encodeUserOpTuple(userOp);

		// Call simulateHandleOp on the EntryPoint
		const result = await this.publicClient.readContract({
			address: this.config.entryPointAddress as `0x${string}`,
			abi: ENTRY_POINT_ABI,
			functionName: 'simulateHandleOp',
			args: [
				opTuple,
				'0x0000000000000000000000000000000000000000' as `0x${string}`,
				'0x' as `0x${string}`
			]
		});

		const [targetResult, validationGas, executionGas] = result;

		const gasEstimate: GasEstimate = {
			callGasLimit: Number(executionGas),
			verificationGasLimit: Number(validationGas),
			preVerificationGas: userOp.preVerificationGas,
			totalGasLimit: Number(validationGas) + Number(executionGas) + userOp.preVerificationGas,
			estimatedCostWei:
				(Number(validationGas) + Number(executionGas) + userOp.preVerificationGas) *
				userOp.maxFeePerGas
		};

		// Validate against config bounds
		const validation = this.validateGasEstimate(gasEstimate);
		if (!validation.valid) {
			return {
				success: false,
				gasEstimate,
				revertReason: validation.reason
			};
		}

		return {
			success: true,
			gasEstimate,
			returnData: targetResult.returnData,
			validationGasUsed: validationGas,
			executionGasUsed: executionGas,
			estimatedCostWei: BigInt(gasEstimate.estimatedCostWei)
		};
	}

	/**
	 * Encode UserOp as a tuple for the EntryPoint contract.
	 */
	private encodeUserOpTuple(userOp: UserOp) {
		return {
			sender: userOp.sender as `0x${string}`,
			nonce: BigInt(userOp.nonce),
			callData: userOp.callData as `0x${string}`,
			callGasLimit: BigInt(userOp.callGasLimit),
			verificationGasLimit: BigInt(userOp.verificationGasLimit),
			preVerificationGas: BigInt(userOp.preVerificationGas),
			maxFeePerGas: BigInt(userOp.maxFeePerGas),
			maxPriorityFeePerGas: BigInt(userOp.maxPriorityFeePerGas),
			paymasterAndData: userOp.paymasterAndData as `0x${string}`,
			signature: userOp.signature as `0x${string}`
		};
	}

	/**
	 * Extract a human-readable revert reason from an error.
	 */
	private extractRevertReason(error: unknown): string {
		if (error instanceof Error) {
			// Look for common revert patterns in error messages
			const message = error.message;

			if (message.includes('execution reverted:')) {
				const match = message.match(/execution reverted:\s*(.+)/);
				return match?.[1] ?? 'execution reverted';
			}

			if (message.includes('userop-reverted')) {
				return 'UserOp execution reverted on-chain';
			}

			if (message.includes('signature')) {
				return 'Signature validation failed';
			}

			if (message.includes('nonce')) {
				return 'Nonce validation failed';
			}

			if (message.includes('paymaster')) {
				return 'Paymaster validation failed';
			}

			if (message.includes('timeout')) {
				return 'Simulation timed out';
			}

			return message.slice(0, 200);
		}

		return 'Unknown simulation error';
	}

	/**
	 * Build a zero gas estimate for disabled/error scenarios.
	 */
	private buildZeroGasEstimate(): GasEstimate {
		return {
			callGasLimit: 0,
			verificationGasLimit: 0,
			preVerificationGas: 0,
			totalGasLimit: 0,
			estimatedCostWei: 0
		};
	}

	/**
	 * Build a success result when simulation is skipped.
	 */
	private buildSuccessResult(userOp: UserOp): SimulationResult {
		const gasEstimate: GasEstimate = {
			callGasLimit: userOp.callGasLimit,
			verificationGasLimit: userOp.verificationGasLimit,
			preVerificationGas: userOp.preVerificationGas,
			totalGasLimit: userOp.callGasLimit + userOp.verificationGasLimit + userOp.preVerificationGas,
			estimatedCostWei:
				(userOp.callGasLimit + userOp.verificationGasLimit + userOp.preVerificationGas) *
				userOp.maxFeePerGas
		};

		return {
			success: true,
			gasEstimate
		};
	}
}
