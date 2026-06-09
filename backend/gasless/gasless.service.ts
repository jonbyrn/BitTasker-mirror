// Gasless Service — Core relay logic for gasless transactions
// Handles: relay, estimate, validation, signing, simulation

import {
	Injectable,
	BadRequestException,
	ForbiddenException,
	ServiceUnavailableException,
	Logger
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import {
	GAS_BOUNDS,
	GAS_TREASURY,
	ALTO_URLS,
	ENTRY_POINT_ADDRESS,
	getNetworkFeeTier,
	getTokenInfo,
	convertToTokenFee,
	ALLOWED_FEE_TOKENS,
	FEE_BUFFER_MIN,
	FEE_BUFFER_MAX,
	MAX_ORACLE_STALENESS
} from './gasless.config';
import { DepositMonitorService } from './deposit-monitor.service';
import { PreflightSimulationService } from './preflight-simulation.service';
import { ChainlinkOracleService } from './chainlink-oracle.service';
import { PaymasterSigningService } from './paymaster-signing.service';

// ABIs for decoding callData
const SIMPLE_ACCOUNT_ABI = [
	{
		type: 'function' as const,
		name: 'executeBatch',
		inputs: [
			{ type: 'address[]', name: 'dest' },
			{ type: 'uint256[]', name: 'value' },
			{ type: 'bytes[]', name: 'func' }
		],
		outputs: [],
		stateMutability: 'nonpayable' as const
	}
];

const ERC20_ABI = [
	{
		type: 'function' as const,
		name: 'transfer',
		inputs: [
			{ type: 'address', name: 'to' },
			{ type: 'uint256', name: 'amount' }
		],
		outputs: [{ type: 'bool' }],
		stateMutability: 'nonpayable' as const
	}
];

export interface UserOperation {
	sender: string;
	nonce: string;
	callData: string;
	callGasLimit: string;
	verificationGasLimit: string;
	preVerificationGas: string;
	maxFeePerGas: string;
	maxPriorityFeePerGas: string;
	paymasterAndData: string;
	signature: string;
}

export interface RelayUserOpDto {
	sender: string;
	userOp: UserOperation;
}

export interface EstimateDto {
	token: string;
	amount: string;
	recipient: string;
	calls?: Array<{ to: string; data: string; value?: string }>;
}

export interface FeeEstimate {
	feeBuffer: string;
	feeCostUSD: number;
	feeTier: string;
	totalWithBuffer: string;
}

@Injectable()
export class GaslessService {
	private readonly logger = new Logger(GaslessService.name);
	private readonly altoClients: ethers.JsonRpcProvider[];
	private currentAltoIndex = 0;

	constructor(
		private readonly depositMonitor: DepositMonitorService,
		private readonly preflight: PreflightSimulationService,
		private readonly oracle: ChainlinkOracleService,
		private readonly signing: PaymasterSigningService,
		private readonly configService: ConfigService
	) {
		// Initialize Alto bundler clients (with fallback)
		this.altoClients = ALTO_URLS.map((url) => new ethers.JsonRpcProvider(url));
		this.logger.log(`Gasless service initialized with ${this.altoClients.length} Alto clients`);
	}

	// --- Main Relay Endpoint ---
	async relay(dto: RelayUserOpDto, userId: string): Promise<{ userOpHash: string }> {
		try {
			// 1. Verify user owns the smart account (simplified — in production, verify JWT ownership)
			// For now, we accept the sender as provided (validated by upstream auth guard)
			this.logger.log(`Relay request from user ${userId} for sender ${dto.sender}`);

			// 2. Check paymaster deposit is healthy
			if (!(await this.depositMonitor.isHealthy())) {
				throw new ServiceUnavailableException('Paymaster deposit too low — relay paused');
			}

			// 3. Validate fee parameters (prevents paymaster drain)
			this.validateFeeParameters(dto.userOp);

			// 4. Validate callData structure
			this.validateCallData(dto.userOp.callData);

			// 5. Pre-flight simulation (verify execution won't revert)
			await this.preflight.simulate(dto.userOp);

			// 6. Relay-time fee re-estimation (prevent tier boundary exploitation)
			await this.reEstimateFeeAtRelay(dto);

			// 7. Sign paymaster data → set in paymasterAndData
			const paymasterSignature = await this.signing.signPaymasterData(
				dto.userOp,
				ENTRY_POINT_ADDRESS
			);
			dto.userOp.paymasterAndData = ethers.concat([
				ENTRY_POINT_ADDRESS,
				ethers.AbiCoder.defaultAbiCoder().encode(['bytes'], [paymasterSignature])
			]);

			// 8. Submit to Alto bundler (with fallback)
			const userOpHash = await this.sendWithFallback(dto.userOp);

			// 9. Log for monitoring
			this.logger.log(`UserOp relayed successfully: ${userOpHash}`);

			return { userOpHash };
		} catch (e) {
			if (
				e instanceof BadRequestException ||
				e instanceof ForbiddenException ||
				e instanceof ServiceUnavailableException
			) {
				throw e;
			}
			this.logger.error(`Relay failed for user ${userId}: ${e.message}`, e.stack);
			throw new ServiceUnavailableException('Gasless relay temporarily unavailable');
		}
	}

	// --- Fee Estimation Endpoint ---
	async estimate(dto: EstimateDto, userId: string): Promise<FeeEstimate> {
		try {
			this.logger.log(`Fee estimation request from user ${userId}`);

			// Build callData for estimation
			const dummyCallData = this.buildCallData(dto);
			const dummyUserOp = this.buildDummyUserOp(dto.recipient, dummyCallData);

			// Estimate gas via Alto bundler
			const estimate = await this.altoClients[this.currentAltoIndex].send(
				'eth_estimateUserOperationGas',
				[dummyUserOp, ENTRY_POINT_ADDRESS]
			);

			const totalGas =
				BigInt(estimate.preVerificationGas) +
				BigInt(estimate.verificationGasLimit) +
				BigInt(estimate.callGasLimit);

			// Reject operations exceeding 5M gas
			if (totalGas > GAS_BOUNDS.MAX_TOTAL_GAS) {
				throw new BadRequestException('Network fee too high — operation too complex');
			}

			const feeTier = getNetworkFeeTier(totalGas);

			// Get token price from oracle
			const tokenPriceUSD = await this.oracle.getTokenPriceUSD(dto.token);
			const feeBuffer = convertToTokenFee(feeTier.feeUSD, dto.token, tokenPriceUSD);
			const feeCostUSD = feeTier.feeUSD;

			return {
				feeBuffer: feeBuffer.toString(),
				feeCostUSD,
				feeTier: feeTier.label,
				totalWithBuffer: (BigInt(dto.amount) + feeBuffer).toString()
			};
		} catch (e) {
			if (e instanceof BadRequestException) {
				throw e;
			}
			this.logger.error(`Fee estimation failed: ${e.message}`, e.stack);
			throw new BadRequestException('Fee estimation failed');
		}
	}

	// --- Private Helpers ---

	private validateFeeParameters(userOp: UserOperation): void {
		const callGasLimit = BigInt(userOp.callGasLimit);
		const verificationGasLimit = BigInt(userOp.verificationGasLimit);
		const preVerificationGas = BigInt(userOp.preVerificationGas);
		const maxFeePerGas = BigInt(userOp.maxFeePerGas);

		if (callGasLimit > GAS_BOUNDS.MAX_CALL_GAS) {
			throw new BadRequestException('callGasLimit exceeds maximum');
		}
		if (verificationGasLimit > GAS_BOUNDS.MAX_VERIFICATION_GAS) {
			throw new BadRequestException('verificationGasLimit exceeds maximum');
		}
		if (preVerificationGas > GAS_BOUNDS.MAX_PRE_VERIFICATION_GAS) {
			throw new BadRequestException('preVerificationGas exceeds maximum');
		}
		if (maxFeePerGas > GAS_BOUNDS.MAX_FEE_PER_GAS) {
			throw new BadRequestException('maxFeePerGas exceeds ceiling');
		}
		if (BigInt(userOp.maxPriorityFeePerGas) > GAS_BOUNDS.MAX_PRIORITY_FEE_PER_GAS) {
			throw new BadRequestException('maxPriorityFeePerGas exceeds ceiling');
		}

		// Reject total gas exceeding 5M (network fee too high)
		const totalGas = callGasLimit + verificationGasLimit + preVerificationGas;
		if (totalGas > GAS_BOUNDS.MAX_TOTAL_GAS) {
			throw new BadRequestException('Network fee too high — operation exceeds 5M gas limit');
		}
	}

	private validateCallData(callData: string): void {
		try {
			const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
				['address[]', 'uint256[]', 'bytes[]'],
				'0x' + callData.slice(10) // Remove function selector
			);

			// callData must be executeBatch
			const selector = callData.slice(0, 10);
			if (selector !== '0x8d80ff0a') {
				throw new BadRequestException('callData must be executeBatch');
			}

			const [dest, value, func] = decoded;
			if (dest.length < 2) {
				throw new BadRequestException('executeBatch must have at least 2 calls');
			}

			// Last call MUST be fee buffer transfer to GAS_TREASURY
			const lastCallData = func[func.length - 1];
			const lastDest = dest[dest.length - 1];

			if (!ALLOWED_FEE_TOKENS.includes(lastDest.toLowerCase())) {
				throw new BadRequestException('Fee token not in allowed list');
			}

			// Verify ERC-20 transfer selector (0xa9059cbb)
			if (lastCallData.slice(0, 10).toLowerCase() !== '0xa9059cbb') {
				throw new BadRequestException('Fee transfer must use ERC-20 transfer() function');
			}

			// Decode the fee transfer
			const feeTransfer = ethers.AbiCoder.defaultAbiCoder().decode(
				['address', 'uint256'],
				'0x' + lastCallData.slice(10)
			);

			const [feeRecipient, feeAmount] = feeTransfer;
			if (feeRecipient.toLowerCase() !== GAS_TREASURY.toLowerCase()) {
				throw new BadRequestException('Fee buffer must go to GAS_TREASURY');
			}

			const feeAmountBigInt = BigInt(feeAmount);
			const minBuffer = FEE_BUFFER_MIN[lastDest.toLowerCase()];
			const maxBuffer = FEE_BUFFER_MAX[lastDest.toLowerCase()];

			if (minBuffer && feeAmountBigInt < minBuffer) {
				throw new BadRequestException('Fee buffer below minimum for this token');
			}
			if (maxBuffer && feeAmountBigInt > maxBuffer) {
				throw new BadRequestException('Fee buffer above maximum — possible drain attempt');
			}
		} catch (e) {
			if (e instanceof BadRequestException) {
				throw e;
			}
			throw new BadRequestException('Invalid callData format');
		}
	}

	private async reEstimateFeeAtRelay(dto: RelayUserOpDto): Promise<void> {
		try {
			// Decode the claimed fee buffer from the UserOp's callData
			const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
				['address[]', 'uint256[]', 'bytes[]'],
				'0x' + dto.userOp.callData.slice(10)
			);
			const [dest, , func] = decoded;
			const lastCallData = func[func.length - 1];
			const lastDest = dest[dest.length - 1];

			const feeTransfer = ethers.AbiCoder.defaultAbiCoder().decode(
				['address', 'uint256'],
				'0x' + lastCallData.slice(10)
			);
			const [, claimedFeeAmount] = feeTransfer;
			const tokenInfo = getTokenInfo(lastDest);

			// Convert claimed fee amount back to USD for tier comparison
			const tokenPriceUSD = await this.oracle.getTokenPriceUSD(lastDest);
			const claimedFeeUSDWei =
				(BigInt(claimedFeeAmount) * tokenPriceUSD) / BigInt(10 ** tokenInfo.decimals);
			const claimedFeeUSD = Number(claimedFeeUSDWei) / 1e18;

			// Re-estimate gas at relay time
			const estimate = await this.altoClients[this.currentAltoIndex].send(
				'eth_estimateUserOperationGas',
				[dto.userOp, ENTRY_POINT_ADDRESS]
			);
			const actualTotalGas =
				BigInt(estimate.preVerificationGas) +
				BigInt(estimate.verificationGasLimit) +
				BigInt(estimate.callGasLimit);
			const actualTier = getNetworkFeeTier(actualTotalGas);

			// Reject if actual tier exceeds what the user's fee buffer covers
			if (actualTier.feeUSD > claimedFeeUSD) {
				throw new BadRequestException(
					`Fee tier mismatch: your buffer covers $${claimedFeeUSD.toFixed(2)}, ` +
						`but this operation requires $${actualTier.feeUSD.toFixed(2)} (${actualTier.label}). ` +
						`Please re-estimate and retry.`
				);
			}
		} catch (e) {
			if (e instanceof BadRequestException) {
				throw e;
			}
			// Fail closed — relay must not proceed without verified fee tier
			this.logger.error(`Fee re-estimation failed: ${e.message}`);
			throw new ServiceUnavailableException('Fee re-estimation failed — relay aborted for safety');
		}
	}

	private buildCallData(dto: EstimateDto): string {
		if (dto.calls && dto.calls.length > 0) {
			// Build executeBatch with user's calls + fee buffer
			const dest = dto.calls.map((c) => c.to);
			const value = dto.calls.map((c) => c.value || '0');
			const func = dto.calls.map((c) => c.data);

			// Add fee buffer transfer as last call
			// This is a placeholder — in production, compute feeBuffer first
			// For estimation, we'll use a dummy fee buffer
			const dummyFeeBuffer = '1000000000000000'; // 0.001 ETH placeholder
			dest.push(dto.token);
			value.push('0');
			func.push(
				'0x' +
					ethers.AbiCoder.defaultAbiCoder()
						.encode(['address', 'uint256'], [GAS_TREASURY, dummyFeeBuffer])
						.slice(2) +
					'a9059cbb' + // transfer(address,uint256) selector
					ethers.AbiCoder.defaultAbiCoder()
						.encode(['address', 'uint256'], [GAS_TREASURY, dummyFeeBuffer])
						.slice(2)
			);

			return (
				'0x8d80ff0a' + // executeBatch selector
				ethers.AbiCoder.defaultAbiCoder()
					.encode(['address[]', 'uint256[]', 'bytes[]'], [dest, value, func])
					.slice(2)
			);
		} else {
			// Simple token transfer
			return (
				'0x8d80ff0a' + // executeBatch selector
				ethers.AbiCoder.defaultAbiCoder()
					.encode(
						['address[]', 'uint256[]', 'bytes[]'],
						[
							[dto.token, dto.token],
							['0', '0'],
							[
								// transfer(recipient, amount)
								'0xa9059cbb' +
									ethers.AbiCoder.defaultAbiCoder()
										.encode(['address', 'uint256'], [dto.recipient, dto.amount])
										.slice(2),
								// transfer(GAS_TREASURY, dummyFeeBuffer)
								'0xa9059cbb' +
									ethers.AbiCoder.defaultAbiCoder()
										.encode(['address', 'uint256'], [GAS_TREASURY, '1000000000000000'])
										.slice(2)
							]
						]
					)
					.slice(2)
			);
		}
	}

	private buildDummyUserOp(sender: string, callData: string): UserOperation {
		return {
			sender,
			nonce: '0',
			callData,
			callGasLimit: '200000',
			verificationGasLimit: '100000',
			preVerificationGas: '50000',
			maxFeePerGas: '100000000', // 0.1 gwei
			maxPriorityFeePerGas: '10000000', // 0.01 gwei
			paymasterAndData: '0x',
			signature: '0x'
		};
	}

	private async sendWithFallback(userOp: UserOperation): Promise<string> {
		let lastError: Error | null = null;

		for (let i = 0; i < this.altoClients.length; i++) {
			const clientIndex = (this.currentAltoIndex + i) % this.altoClients.length;
			const client = this.altoClients[clientIndex];

			try {
				const result = await client.send('eth_sendUserOperation', [userOp, ENTRY_POINT_ADDRESS]);

				// Update current index for load balancing
				this.currentAltoIndex = clientIndex;
				return result;
			} catch (e) {
				lastError = e as Error;
				this.logger.warn(`Alto client ${clientIndex} failed: ${e.message}`);
				continue;
			}
		}

		throw lastError || new Error('All Alto clients failed');
	}
}
