/**
 * Gasless Service — Orchestration Layer
 *
 * Coordinates the full gasless relay pipeline:
 *  1. Validate incoming UserOp
 *  2. Run preflight simulation
 *  3. Sign paymaster data
 *  4. Forward to Alto bundler
 *  5. Return UserOp hash to client
 *
 * This is the central service that ties together the simulation,
 * signing, and deposit-monitor sub-services.
 *
 * Reference implementation for the NestJS backend.
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import {
	createPublicClient,
	createWalletClient,
	http,
	type PublicClient,
	type WalletClient
} from 'viem';
import { arbitrum } from 'viem/chains';
import {
	GASLESS_CONFIG,
	PAYMASTER_PRIVATE_KEY,
	type ResolvedGaslessConfig,
	getFeeTier,
	isTokenAllowed,
	isGasEstimateValid
} from './gasless.config';
import { PaymasterSigningService } from './paymaster-signing.service';
import { PreflightSimulationService, SimulationError } from './preflight-simulation.service';
import { DepositMonitorService } from './deposit-monitor.service';
import type { UserOp, GasEstimate } from '../../../types/gasless.types';

// =============================================================================
// Request / Response Types
// =============================================================================

export interface RelayRequest {
	userOp: UserOp;
	sender: string;
	feeTier?: string;
	tokenPayment?: {
		tokenAddress: string;
		tokenSymbol: string;
		amount: string;
		transferData: string;
	};
}

export interface RelayResult {
	userOpHash: string;
	txHash?: string;
	feeTierUsed: string;
	paymasterSigned: boolean;
	simulationPassed: boolean;
	message: string;
}

export interface GasEstimateRequest {
	userOp: UserOp;
	feeTier?: string;
}

// =============================================================================
// Entry Point ABI (sendUserOperation)
// =============================================================================

const ENTRY_POINT_ABI = [
	{
		name: 'sendUserOperation',
		type: 'function',
		stateMutability: 'nonpayable',
		inputs: [
			{
				name: 'userOp',
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
			}
		],
		outputs: [{ name: 'userOpHash', type: 'bytes32' }]
	}
] as const;

// =============================================================================
// Service
// =============================================================================

@Injectable()
export class GaslessService {
	private readonly logger = new Logger(GaslessService.name);
	private readonly publicClient: PublicClient;
	private readonly walletClient: WalletClient;

	constructor(
		@Inject(GASLESS_CONFIG) private readonly config: ResolvedGaslessConfig,
		@Inject(PAYMASTER_PRIVATE_KEY) private readonly paymasterKey: string,
		private readonly paymasterSigning: PaymasterSigningService,
		private readonly simulation: PreflightSimulationService,
		private readonly depositMonitor: DepositMonitorService
	) {
		this.publicClient = createPublicClient({
			chain: arbitrum,
			transport: http(this.config.bundlerRpcUrl)
		}) as unknown as PublicClient;

		this.walletClient = createWalletClient({
			chain: arbitrum,
			transport: http(this.config.bundlerRpcUrl)
		}) as unknown as WalletClient;

		this.logger.log('GaslessService initialized — relay pipeline ready');
	}

	// ---------------------------------------------------------------------------
	// Main Relay Pipeline
	// ---------------------------------------------------------------------------

	/**
	 * Relay a signed UserOp through the full pipeline.
	 * Validates → simulates → signs paymaster → forwards to bundler.
	 */
	async relay(request: RelayRequest): Promise<RelayResult> {
		const { userOp, sender, feeTier = 'standard', tokenPayment } = request;
		const startTime = Date.now();

		this.logger.log(
			`Relaying UserOp from sender=${sender} nonce=${userOp.nonce} feeTier=${feeTier}`
		);

		// Step 1: Basic validation
		this.validateUserOp(userOp, sender);

		// Step 2: Token payment validation (if present)
		if (tokenPayment) {
			this.validateTokenPayment(tokenPayment);
		}

		// Step 3: Fee tier validation
		const tier = getFeeTier(this.config, feeTier);
		if (!tier) {
			throw new Error(`Invalid fee tier: ${feeTier}. Must be standard, fast, or urgent.`);
		}

		// Step 4: Check paymaster deposit can cover this batch
		const canSponsor = await this.depositMonitor.canSponsorBatch(
			1,
			userOp.callGasLimit + userOp.verificationGasLimit + userOp.preVerificationGas,
			userOp.maxFeePerGas
		);
		if (!canSponsor.canSponsor) {
			this.logger.warn(
				`Insufficient paymaster deposit: ${canSponsor.currentBalance} ETH ` +
					`needed ${canSponsor.estimatedCost} ETH`
			);
			throw new Error(
				`Insufficient paymaster deposit: ${canSponsor.currentBalance} ETH available, ` +
					`${canSponsor.estimatedCost} ETH needed`
			);
		}

		// Step 5: Preflight simulation
		let simulationPassed = false;
		if (this.config.enableSimulation) {
			const simResult = await this.simulation.simulate(userOp);
			if (!simResult.success) {
				this.logger.warn(`Simulation failed: ${simResult.revertReason}`);
				throw new SimulationError(
					`Preflight simulation failed: ${simResult.revertReason}`,
					simResult.revertReason ?? 'unknown'
				);
			}
			simulationPassed = true;

			// Validate gas estimates
			const gasValidation = this.simulation.validateGasEstimate(simResult.gasEstimate);
			if (!gasValidation.valid) {
				throw new Error(`Gas estimate validation failed: ${gasValidation.reason}`);
			}
		} else {
			simulationPassed = true;
		}

		// Step 6: Sign paymaster data
		const paymasterData = await this.paymasterSigning.signPaymasterData(userOp);
		const paymasterAndData = `${paymasterData.paymasterAddress}${paymasterData.paymasterData.slice(2)}`;

		// Step 7: Merge token payment into paymasterAndData (if present)
		let finalPaymasterAndData = paymasterAndData;
		if (tokenPayment) {
			finalPaymasterAndData = this.mergeTokenPayment(paymasterAndData, tokenPayment);
		}

		// Step 8: Update the UserOp with signed paymaster data
		const relayedUserOp: UserOp = {
			...userOp,
			paymasterAndData: finalPaymasterAndData
		};

		// Step 9: Forward to bundler
		const userOpHash = await this.sendToBundler(relayedUserOp);

		const elapsed = Date.now() - startTime;
		this.logger.log(`UserOp relayed in ${elapsed}ms — hash=${userOpHash} sender=${sender}`);

		return {
			userOpHash,
			feeTierUsed: feeTier,
			paymasterSigned: true,
			simulationPassed,
			message: `UserOp relayed successfully via ${feeTier} fee tier`
		};
	}

	// ---------------------------------------------------------------------------
	// Gas Estimation
	// ---------------------------------------------------------------------------

	/**
	 * Estimate gas cost for a UserOp.
	 */
	async estimateGas(request: GasEstimateRequest): Promise<GasEstimate> {
		const { userOp, feeTier: _feeTier = 'standard' } = request;

		const simResult = await this.simulation.simulate(userOp);
		if (!simResult.success) {
			throw new SimulationError(
				`Gas estimation failed: ${simResult.revertReason}`,
				simResult.revertReason ?? 'unknown'
			);
		}

		return simResult.gasEstimate;
	}

	// ---------------------------------------------------------------------------
	// Deposit Status
	// ---------------------------------------------------------------------------

	/**
	 * Get the current paymaster deposit status.
	 */
	async getDepositStatus() {
		return this.depositMonitor.getDepositStatus();
	}

	// ---------------------------------------------------------------------------
	// Internal Methods
	// ---------------------------------------------------------------------------

	/**
	 * Validate UserOp fields at the service level.
	 */
	private validateUserOp(userOp: UserOp, sender: string): void {
		if (!userOp.sender || !/^0x[0-9a-fA-F]{40}$/.test(userOp.sender)) {
			throw new Error('Invalid sender address');
		}

		if (userOp.sender.toLowerCase() !== sender.toLowerCase()) {
			throw new Error('Sender address mismatch: userOp.sender != request sender');
		}

		if (userOp.nonce < 0) {
			throw new Error('Nonce must be non-negative');
		}

		if (!userOp.callData || !userOp.callData.startsWith('0x')) {
			throw new Error('callData must be hex-encoded bytes');
		}

		if (!isGasEstimateValid(this.config, userOp.callGasLimit)) {
			throw new Error(
				`callGasLimit ${userOp.callGasLimit} outside bounds ` +
					`[${this.config.gasBounds.minGasLimit} — ${this.config.gasBounds.maxGasLimit}]`
			);
		}
	}

	/**
	 * Validate token payment data.
	 */
	private validateTokenPayment(tokenPayment: RelayRequest['tokenPayment']): void {
		if (!tokenPayment) return;

		if (!isTokenAllowed(this.config, tokenPayment.tokenAddress)) {
			throw new Error(
				`Token ${tokenPayment.tokenSymbol} (${tokenPayment.tokenAddress}) is not allowed for gas payment`
			);
		}

		if (!tokenPayment.amount || BigInt(tokenPayment.amount) <= 0n) {
			throw new Error('Token payment amount must be positive');
		}
	}

	/**
	 * Merge token payment data into paymasterAndData.
	 * Format: [paymasterAddress][paymasterData][tokenPaymentData]
	 */
	private mergeTokenPayment(
		paymasterAndData: string,
		tokenPayment: NonNullable<RelayRequest['tokenPayment']>
	): string {
		// Append token payment data after existing paymaster data
		return `${paymasterAndData}${tokenPayment.transferData.slice(2)}`;
	}

	/**
	 * Send UserOp to the bundler via the EntryPoint contract.
	 */
	private async sendToBundler(userOp: UserOp): Promise<string> {
		try {
			const userOpHash = await this.publicClient.readContract({
				address: this.config.entryPointAddress as `0x${string}`,
				abi: ENTRY_POINT_ABI,
				functionName: 'sendUserOperation',
				args: [
					{
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
					}
				]
			});

			return userOpHash as string;
		} catch (error) {
			this.logger.error(`Bundler submission failed: ${error}`);
			throw new Error(`Failed to send UserOp to bundler: ${error}`);
		}
	}
}
