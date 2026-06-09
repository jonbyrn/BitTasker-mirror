/**
 * Gasless Controller — HTTP Endpoints
 *
 * Exposes the gasless relay pipeline over REST.
 * Validates DTOs via class-validator, delegates to GaslessService.
 *
 * Reference implementation for the NestJS backend.
 *
 * Endpoints:
 *   POST /gasless/relay       — relay a signed UserOp
 *   POST /gasless/estimate    — estimate gas cost for a UserOp
 *   GET  /gasless/deposit     — get paymaster deposit status
 *   GET  /gasless/deposit/alerts — get recent deposit alerts
 */

import {
	Controller,
	Post,
	Get,
	Body,
	HttpCode,
	HttpStatus,
	Logger,
	UseGuards,
	UsePipes,
	ValidationPipe,
	BadRequestException,
	InternalServerErrorException
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GaslessService } from './gasless.service';
import { DepositMonitorService } from './deposit-monitor.service';
import {
	RelayUserOpDto,
	RelayUserOpResponseDto,
	GasEstimateResponseDto
} from './validators/relay-userop.dto';
import type { UserOp } from '../../../types/gasless.types';

// =============================================================================
// Request DTOs (controller-specific, simpler than validator DTOs)
// =============================================================================

/**
 * Wrapper for the relay endpoint request.
 * Includes the full UserOp plus relay metadata.
 */
export class RelayEndpointDto extends RelayUserOpDto {}

/**
 * Gas estimate request body.
 */
export class EstimateEndpointDto {
	sender!: string;
	nonce!: number;
	callData!: string;
	callGasLimit!: number;
	verificationGasLimit!: number;
	preVerificationGas!: number;
	maxFeePerGas!: number;
	maxPriorityFeePerGas!: number;
	paymasterAndData!: string;
	signature!: string;
	feeTier?: string;
}

// =============================================================================
// Controller
// =============================================================================

@Controller('gasless')
@UseGuards(AuthGuard('jwt'))
@UsePipes(
	new ValidationPipe({
		whitelist: true,
		forbidNonWhitelisted: true,
		transform: true,
		transformOptions: {
			enableImplicitConversion: true
		}
	})
)
export class GaslessController {
	private readonly logger = new Logger(GaslessController.name);

	constructor(
		private readonly gaslessService: GaslessService,
		private readonly depositMonitor: DepositMonitorService
	) {}

	// ---------------------------------------------------------------------------
	// POST /gasless/relay
	// ---------------------------------------------------------------------------

	/**
	 * Relay a signed UserOp.
	 *
	 * Flow:
	 *  1. Validate DTO (class-validator)
	 *  2. Convert DTO → UserOp
	 *  3. Delegate to GaslessService.relay()
	 *  4. Return UserOp hash + status
	 */
	@Post('relay')
	@HttpCode(HttpStatus.OK)
	async relay(@Body() dto: RelayEndpointDto): Promise<RelayUserOpResponseDto> {
		this.logger.log(`POST /gasless/relay from sender=${dto.sender} nonce=${dto.nonce}`);

		try {
			// Build the UserOp from DTO fields
			const userOp: UserOp = {
				sender: dto.sender,
				nonce: dto.nonce,
				callData: dto.callData,
				callGasLimit: dto.callGasLimit,
				verificationGasLimit: dto.verificationGasLimit,
				preVerificationGas: dto.preVerificationGas,
				maxFeePerGas: dto.maxFeePerGas,
				maxPriorityFeePerGas: dto.maxPriorityFeePerGas,
				paymasterAndData: dto.paymasterAndData,
				signature: dto.signature
			};

			// Delegate to service
			const result = await this.gaslessService.relay({
				userOp,
				sender: dto.sender,
				feeTier: dto.feeTier,
				tokenPayment: dto.tokenPayment
					? {
							tokenAddress: dto.tokenPayment.tokenAddress,
							tokenSymbol: dto.tokenPayment.tokenSymbol,
							amount: dto.tokenPayment.amount,
							transferData: dto.tokenPayment.transferData
						}
					: undefined
			});

			return {
				userOpHash: result.userOpHash,
				txHash: result.txHash,
				feeTierUsed: result.feeTierUsed,
				paymasterSigned: result.paymasterSigned,
				simulationPassed: result.simulationPassed,
				message: result.message
			};
		} catch (error) {
			this.logger.error(`Relay failed: ${error}`);

			if (error instanceof BadRequestException) {
				throw error;
			}

			// Map known errors to appropriate HTTP status codes
			const message = error instanceof Error ? error.message : 'Unknown error';

			if (message.includes('simulation') || message.includes('Simulation')) {
				throw new BadRequestException({
					error: 'SIMULATION_FAILED',
					message
				});
			}

			if (message.includes('Insufficient paymaster deposit')) {
				throw new BadRequestException({
					error: 'INSUFFICIENT_DEPOSIT',
					message
				});
			}

			if (message.includes('Invalid fee tier')) {
				throw new BadRequestException({
					error: 'INVALID_FEE_TIER',
					message
				});
			}

			if (message.includes('not allowed for gas payment')) {
				throw new BadRequestException({
					error: 'TOKEN_NOT_ALLOWED',
					message
				});
			}

			if (message.includes('bundler')) {
				throw new InternalServerErrorException({
					error: 'BUNDLER_ERROR',
					message: 'Failed to submit UserOp to bundler. Please retry.'
				});
			}

			throw new InternalServerErrorException({
				error: 'RELAY_FAILED',
				message
			});
		}
	}

	// ---------------------------------------------------------------------------
	// POST /gasless/estimate
	// ---------------------------------------------------------------------------

	/**
	 * Estimate gas cost for a UserOp without submitting it.
	 *
	 * Runs preflight simulation and returns gas estimates.
	 */
	@Post('estimate')
	@HttpCode(HttpStatus.OK)
	async estimate(@Body() dto: EstimateEndpointDto): Promise<GasEstimateResponseDto> {
		this.logger.log(`POST /gasless/estimate from sender=${dto.sender} nonce=${dto.nonce}`);

		try {
			const userOp: UserOp = {
				sender: dto.sender,
				nonce: dto.nonce,
				callData: dto.callData,
				callGasLimit: dto.callGasLimit,
				verificationGasLimit: dto.verificationGasLimit,
				preVerificationGas: dto.preVerificationGas,
				maxFeePerGas: dto.maxFeePerGas,
				maxPriorityFeePerGas: dto.maxPriorityFeePerGas,
				paymasterAndData: dto.paymasterAndData,
				signature: dto.signature
			};

			const gasEstimate = await this.gaslessService.estimateGas({
				userOp,
				feeTier: dto.feeTier
			});

			const totalGasLimit =
				gasEstimate.callGasLimit +
				gasEstimate.verificationGasLimit +
				gasEstimate.preVerificationGas;

			return {
				callGasLimit: gasEstimate.callGasLimit,
				verificationGasLimit: gasEstimate.verificationGasLimit,
				preVerificationGas: gasEstimate.preVerificationGas,
				totalGasLimit,
				estimatedCostWei: gasEstimate.estimatedCostWei.toString(),
				suggestedFeeTier: dto.feeTier ?? 'standard'
			};
		} catch (error) {
			this.logger.error(`Gas estimation failed: ${error}`);

			const message = error instanceof Error ? error.message : 'Unknown error';

			if (message.includes('simulation') || message.includes('Simulation')) {
				throw new BadRequestException({
					error: 'SIMULATION_FAILED',
					message
				});
			}

			throw new InternalServerErrorException({
				error: 'ESTIMATION_FAILED',
				message
			});
		}
	}

	// ---------------------------------------------------------------------------
	// GET /gasless/deposit
	// ---------------------------------------------------------------------------

	/**
	 * Get current paymaster deposit status.
	 *
	 * Returns ETH balance, threshold, and treasury token balances.
	 */
	@Get('deposit')
	@HttpCode(HttpStatus.OK)
	async getDeposit() {
		this.logger.debug('GET /gasless/deposit');

		try {
			return await this.gaslessService.getDepositStatus();
		} catch (error) {
			this.logger.error(`Deposit status query failed: ${error}`);
			throw new InternalServerErrorException({
				error: 'DEPOSIT_CHECK_FAILED',
				message: 'Failed to query paymaster deposit status'
			});
		}
	}

	// ---------------------------------------------------------------------------
	// GET /gasless/deposit/alerts
	// ---------------------------------------------------------------------------

	/**
	 * Get recent deposit alerts.
	 *
	 * Query params:
	 *   limit — max alerts to return (default: 20)
	 */
	@Get('deposit/alerts')
	@HttpCode(HttpStatus.OK)
	async getDepositAlerts(@Body() body: { limit?: number }) {
		this.logger.debug('GET /gasless/deposit/alerts');

		try {
			return {
				alerts: this.depositMonitor.getRecentAlerts(body.limit ?? 20)
			};
		} catch (error) {
			this.logger.error(`Alert query failed: ${error}`);
			throw new InternalServerErrorException({
				error: 'ALERT_QUERY_FAILED',
				message: 'Failed to retrieve deposit alerts'
			});
		}
	}
}
