/**
 * Deposit Monitor Service
 *
 * Monitors the paymaster's ETH deposit balance on the EntryPoint contract.
 * Triggers alerts when balance drops below threshold and can initiate
 * automatic replenishment via token swaps.
 *
 * Reference implementation for the NestJS backend.
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createPublicClient, http, parseEther, formatEther, type PublicClient } from 'viem';
import { arbitrum } from 'viem/chains';
import { GASLESS_CONFIG, type ResolvedGaslessConfig } from './gasless.config';
import type { TokenConfig } from '../../../types/gasless.types';

// =============================================================================
// Event Types
// =============================================================================

export interface DepositAlert {
	type: 'low_balance' | 'critical_balance' | 'replenished' | 'check_failed';
	currentBalance: string;
	threshold: string;
	timestamp: number;
	message: string;
}

export interface DepositStatus {
	/** Current ETH deposit in the EntryPoint paymaster staking slot */
	currentDeposit: string;

	/** Minimum threshold below which alerts fire */
	threshold: string;

	/** Whether the deposit is above the threshold */
	healthy: boolean;

	/** Timestamp of last successful check */
	lastChecked: Date;

	/** Treasury token balances */
	treasuryBalances: TreasuryBalance[];

	/** Pending replenishment if any */
	pendingReplenishment?: string;
}

export interface TreasuryBalance {
	token: TokenConfig;
	balance: string;
	balanceUsd?: string;
}

// =============================================================================
// ABI (minimal — only deposit functions)
// =============================================================================

const ENTRY_POINT_DEPOSIT_ABI = [
	{
		name: 'balanceOf',
		type: 'function',
		stateMutability: 'view',
		inputs: [
			{ name: 'account', type: 'address' },
			{ name: 'token', type: 'address' }
		],
		outputs: [{ name: 'balance', type: 'uint256' }]
	}
] as const;

const ERC20_ABI = [
	{
		name: 'balanceOf',
		type: 'function',
		stateMutability: 'view',
		inputs: [{ name: 'account', type: 'address' }],
		outputs: [{ name: 'balance', type: 'uint256' }]
	}
] as const;

/** Zero address — used to query ETH deposit (not ERC-20) */
const ETH_ADDRESS = '0x0000000000000000000000000000000000000000';

// =============================================================================
// Critical Threshold (80% of normal threshold) */
// =============================================================================

const CRITICAL_MULTIPLIER = 0.2; // Critical = 20% of normal threshold

// =============================================================================
// Service
// =============================================================================

@Injectable()
export class DepositMonitorService {
	private readonly logger = new Logger(DepositMonitorService.name);
	private readonly publicClient: PublicClient;
	private readonly thresholdWei: bigint;
	private readonly criticalThresholdWei: bigint;
	private recentAlerts: DepositAlert[] = [];
	private lastStatus?: DepositStatus;

	constructor(@Inject(GASLESS_CONFIG) private readonly config: ResolvedGaslessConfig) {
		this.publicClient = createPublicClient({
			chain: arbitrum,
			transport: http(this.config.bundlerRpcUrl)
		}) as unknown as PublicClient;

		this.thresholdWei = parseEther(this.config.minDepositThreshold);
		this.criticalThresholdWei = (this.thresholdWei * BigInt(CRITICAL_MULTIPLIER * 100)) / 100n;

		this.logger.log(
			`DepositMonitorService initialized — threshold: ${this.config.minDepositThreshold} ETH, ` +
				`critical: ${formatEther(this.criticalThresholdWei)} ETH`
		);
	}

	// ---------------------------------------------------------------------------
	// Scheduled Checks
	// ---------------------------------------------------------------------------

	/**
	 * Periodic deposit check — runs on the configured cron schedule.
	 */
	@Cron(CronExpression.EVERY_6_HOURS)
	async checkDepositBalance(): Promise<DepositStatus> {
		this.logger.debug('Running scheduled deposit balance check');

		try {
			const status = await this.getDepositStatus();
			this.lastStatus = status;

			if (!status.healthy) {
				const alertType =
					BigInt(status.currentDeposit.replace('.', '')) < this.criticalThresholdWei
						? 'critical_balance'
						: 'low_balance';

				const alert: DepositAlert = {
					type: alertType,
					currentBalance: status.currentDeposit,
					threshold: this.config.minDepositThreshold,
					timestamp: Date.now(),
					message:
						alertType === 'critical_balance'
							? `CRITICAL: Paymaster deposit ${status.currentDeposit} ETH is critically low (threshold: ${this.config.minDepositThreshold} ETH)`
							: `WARNING: Paymaster deposit ${status.currentDeposit} ETH below threshold ${this.config.minDepositThreshold} ETH`
				};

				this.recentAlerts.push(alert);

				if (alertType === 'critical_balance') {
					this.logger.error(alert.message);
				} else {
					this.logger.warn(alert.message);
				}

				// Keep only last 100 alerts
				if (this.recentAlerts.length > 100) {
					this.recentAlerts = this.recentAlerts.slice(-100);
				}
			} else {
				this.logger.debug(
					`Deposit healthy: ${status.currentDeposit} ETH (threshold: ${this.config.minDepositThreshold} ETH)`
				);
			}

			return status;
		} catch (error) {
			this.logger.error(`Deposit check failed: ${error}`);

			const failAlert: DepositAlert = {
				type: 'check_failed',
				currentBalance: 'unknown',
				threshold: this.config.minDepositThreshold,
				timestamp: Date.now(),
				message: `Deposit balance check failed: ${error}`
			};
			this.recentAlerts.push(failAlert);

			throw error;
		}
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------

	/**
	 * Get the current deposit status (on-demand, not scheduled).
	 */
	async getDepositStatus(): Promise<DepositStatus> {
		// Query paymaster's ETH deposit in the EntryPoint
		const depositBalance = await this.publicClient.readContract({
			address: this.config.entryPointAddress as `0x${string}`,
			abi: ENTRY_POINT_DEPOSIT_ABI,
			functionName: 'balanceOf',
			args: [this.config.paymasterAddress as `0x${string}`, ETH_ADDRESS as `0x${string}`]
		});

		const currentDeposit = formatEther(depositBalance);
		const healthy = depositBalance >= this.thresholdWei;

		// Query treasury token balances
		const treasuryBalances = await this.queryTreasuryBalances();

		const status: DepositStatus = {
			currentDeposit,
			threshold: this.config.minDepositThreshold,
			healthy,
			lastChecked: new Date(),
			treasuryBalances
		};

		this.lastStatus = status;
		return status;
	}

	/**
	 * Get recent alerts.
	 */
	getRecentAlerts(limit = 20): DepositAlert[] {
		return this.recentAlerts.slice(-limit);
	}

	/**
	 * Get cached status without hitting the chain.
	 */
	getCachedStatus(): DepositStatus | undefined {
		return this.lastStatus;
	}

	/**
	 * Check if the paymaster deposit is sufficient for the next batch.
	 * Estimates gas cost for `estimatedOps` operations at the given fee tier.
	 */
	async canSponsorBatch(
		estimatedOps: number,
		avgGasPerOp: number,
		maxFeePerGas: number
	): Promise<{ canSponsor: boolean; estimatedCost: string; currentBalance: string }> {
		const estimatedCostWei = BigInt(estimatedOps) * BigInt(avgGasPerOp) * BigInt(maxFeePerGas);
		const depositBalance = await this.publicClient.readContract({
			address: this.config.entryPointAddress as `0x${string}`,
			abi: ENTRY_POINT_DEPOSIT_ABI,
			functionName: 'balanceOf',
			args: [this.config.paymasterAddress as `0x${string}`, ETH_ADDRESS as `0x${string}`]
		});

		return {
			canSponsor: depositBalance >= estimatedCostWei,
			estimatedCost: formatEther(estimatedCostWei),
			currentBalance: formatEther(depositBalance)
		};
	}

	// ---------------------------------------------------------------------------
	// Internal Methods
	// ---------------------------------------------------------------------------

	/**
	 * Query balances of tokens in the treasury address.
	 */
	private async queryTreasuryBalances(): Promise<TreasuryBalance[]> {
		const results: TreasuryBalance[] = [];

		for (const token of this.config.allowedTokens) {
			try {
				const balance = await this.publicClient.readContract({
					address: token.address as `0x${string}`,
					abi: ERC20_ABI,
					functionName: 'balanceOf',
					args: [this.config.gasTreasuryAddress as `0x${string}`]
				});

				const decimals = BigInt(10 ** token.decimals);
				const formatted = Number(balance) / Number(decimals);

				results.push({
					token,
					balance: formatted.toString()
				});
			} catch (error) {
				this.logger.warn(`Failed to query balance for ${token.symbol}: ${error}`);
				results.push({
					token,
					balance: 'error'
				});
			}
		}

		return results;
	}
}
