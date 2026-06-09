// Deposit Monitor Service — Monitors paymaster deposit and auto-pauses relay
// Based on plan Section 4.11

import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { ENTRY_POINT_ADDRESS } from './gasless.config';

// ABI for EntryPoint.balanceOf
const ENTRY_POINT_ABI = ['function balanceOf(address account) view returns (uint256)'];

@Injectable()
export class DepositMonitorService {
	private readonly logger = new Logger(DepositMonitorService.name);
	private isPaused = false;
	private depositThreshold = ethers.parseEther('0.005'); // 0.005 ETH
	private lowThreshold = ethers.parseEther('0.01'); // 0.01 ETH
	private readonly provider: ethers.JsonRpcProvider;
	private readonly entryPoint: ethers.Contract;

	constructor() {
		// Initialize with environment RPC URL
		const rpcUrl = process.env['ARBITRUM_RPC_URL'] || 'https://arb1.arbitrum.io/rpc';
		this.provider = new ethers.JsonRpcProvider(rpcUrl);
		this.entryPoint = new ethers.Contract(ENTRY_POINT_ADDRESS, ENTRY_POINT_ABI, this.provider);

		// Start monitoring loop
		this.startMonitoring();
	}

	private startMonitoring(): void {
		// Check every 5 minutes (300,000 ms)
		setInterval(
			() => {
				this.checkDeposit().catch((err) => {
					this.logger.error(`Deposit check failed: ${err.message}`);
				});
			},
			5 * 60 * 1000
		);

		// Initial check
		this.checkDeposit().catch((err) => {
			this.logger.error(`Initial deposit check failed: ${err.message}`);
		});
	}

	async checkDeposit(): Promise<void> {
		try {
			const paymasterAddress = process.env['PAYMASTER_ADDRESS'];
			if (!paymasterAddress) {
				this.logger.warn('PAYMASTER_ADDRESS not set, skipping deposit check');
				return;
			}

			const deposit = await this.entryPoint.balanceOf(paymasterAddress);

			if (deposit < this.depositThreshold) {
				this.isPaused = true;
				this.logger.warn(
					`Paymaster deposit critically low: ${ethers.formatEther(deposit)} ETH — relay paused`
				);
				await this.notifyOps(
					`Paymaster deposit critically low: ${ethers.formatEther(deposit)} ETH — relay paused`
				);
			} else if (deposit < this.lowThreshold) {
				this.logger.warn(
					`Paymaster deposit low: ${ethers.formatEther(deposit)} ETH — replenish soon`
				);
				await this.notifyOps(`Paymaster deposit running low: ${ethers.formatEther(deposit)} ETH`);
			} else {
				this.isPaused = false;
			}
		} catch (error) {
			this.logger.error(`Failed to check deposit: ${error.message}`);
		}
	}

	async isHealthy(): Promise<boolean> {
		return !this.isPaused;
	}

	private async notifyOps(message: string): Promise<void> {
		// In production, send alert via email, Slack, etc.
		this.logger.warn(`[OPS ALERT] ${message}`);
		// Placeholder for actual notification
		console.error(`[OPS ALERT] ${message}`);
	}
}
