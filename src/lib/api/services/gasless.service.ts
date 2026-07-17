/**
 * Gasless Service — axios-based client for the NestJS gasless relay endpoints.
 *
 * Follows the established BaseApiService architecture:
 * - Auth (JWT) is handled automatically by the axios interceptor
 * - Token refresh on 401 is handled by the axios interceptor
 * - No manual Authorization header construction
 * - No localStorage reads for auth tokens
 *
 * Backend endpoints (NestJS JwtAuthGuard):
 *   POST /api/v1/gasless/relay    — relay a signed UserOp to the Alto bundler
 *   POST /api/v1/gasless/estimate — estimate fee for a gasless transfer
 *   POST /api/v1/gasless/balance  — check token balance sufficiency
 *   GET  /api/v1/gasless/health   — paymaster + bundler health check (public)
 */

import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';
import type {
	SerializableUserOperation,
	FeeEstimate,
	EIP7702Auth
} from '$lib/types/gasless.types';

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

/** POST /gasless/relay request body */
export interface RelayRequest {
	sender: string;
	userOp: SerializableUserOperation;
	eip7702Auth?: EIP7702Auth;
}

/** POST /gasless/relay response */
export interface RelayResponse {
	userOpHash: string;
}

/** POST /gasless/estimate request body */
export interface EstimateRequest {
	token: string;
	amount: string;
	recipient: string;
	calls?: Array<{ to: string; data: string; value?: string }>;
}

/** POST /gasless/balance request body */
export interface BalanceCheckRequest {
	token: string;
	amount: string;
	feeBuffer: string;
	sender?: string;
}

/** POST /gasless/balance response */
export interface BalanceCheckResult {
	sufficient: boolean;
	balance: string;
	required: string;
}

/** GET /gasless/health response */
export interface GaslessHealthReport {
	status: 'healthy' | 'degraded' | 'unhealthy';
	timestamp: string;
	checks: {
		env: { ok: boolean; missing: string[] };
		deposit: { healthy: boolean; detail: string };
		bundler: { reachable: boolean; url: string; detail?: string };
	};
}

/** GET /gasless/config response */
export interface GaslessConfigResponse {
	gasBounds: {
		maxCallGas: string;
		maxVerificationGas: string;
		maxPreVerificationGas: string;
		maxFeePerGas: string;
		maxPriorityFeePerGas: string;
		maxTotalGas: string;
	};
	feeTiers: Array<{
		label: string;
		minGas: string;
		maxGas: string;
		feeUSD: number;
	}>;
	feeBufferMin: Record<string, string>;
	feeBufferMax: Record<string, string>;
	tokens: Array<{
		address: string;
		symbol: string;
		decimals: number;
		chainId: number;
	}>;
	allowedFeeTokens: string[];
	treasury: string;
	entryPointAddress: string;
	simple7702AccountImpl: string;
	chainId: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class GaslessService extends BaseApiService {
	/**
	 * Relay a signed UserOperation to the Alto bundler via the NestJS backend.
	 * Auth is handled automatically by the axios interceptor.
	 */
	async relay(dto: RelayRequest): Promise<RelayResponse> {
		const response = await this.post<RelayResponse>(ENDPOINTS.GASLESS.RELAY, dto);
		return response.data;
	}

	/**
	 * Estimate the fee for a gasless token transfer.
	 * Auth is handled automatically by the axios interceptor.
	 */
	async estimate(dto: EstimateRequest): Promise<FeeEstimate> {
		const response = await this.post<FeeEstimate>(ENDPOINTS.GASLESS.ESTIMATE, dto);
		return response.data;
	}

	/**
	 * Check if the user's token balance covers transfer + fee buffer.
	 * This endpoint is public (no auth required) on the backend.
	 */
	async checkBalance(dto: BalanceCheckRequest): Promise<BalanceCheckResult> {
		const response = await this.post<BalanceCheckResult>(ENDPOINTS.GASLESS.BALANCE, dto);
		return response.data;
	}

	/**
	 * Check paymaster and bundler health.
	 * This endpoint is public (no auth required) on the backend.
	 */
	async health(): Promise<GaslessHealthReport> {
		const response = await this.get<GaslessHealthReport>(ENDPOINTS.GASLESS.HEALTH);
		return response.data;
	}

	/**
	 * Fetch gasless config (gas bounds, fee tiers, buffer bounds) from the backend.
	 * This endpoint is public (no auth required) on the backend.
	 * Used to keep frontend config in sync with backend without hardcoded values.
	 */
	async config(): Promise<GaslessConfigResponse> {
		const response = await this.get<GaslessConfigResponse>(ENDPOINTS.GASLESS.CONFIG);
		return response.data;
	}
}

/** Singleton instance for use throughout the app. */
export const gaslessService = new GaslessService();
