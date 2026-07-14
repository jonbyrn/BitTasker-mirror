/**
 * Loan Flow Service
 *
 * App-level service wrapping the SDK's LoanFlowOrchestrator.
 * Adds Sentry breadcrumbs, network checks, browser guards, and error handling.
 *
 * Flow: rBTC → DOC (MoC) → USDT0 on RSK (Sovryn DEX) → USDT0 on Arbitrum (LayerZero)
 *
 * @see LoanFlowOrchestrator in @bittasker/wallet-core
 */

import {
	LoanFlowOrchestrator,
	type LoanFlowConfig,
	type LoanFlowQuote,
	type LoanFlowResult,
	type LoanFlowState,
	ARB_TOKEN_ADDRESSES
} from '@bittasker/wallet-core';
import { ethers } from 'ethers';
import { tryCatch } from '$lib/utils/tryCatch';

export type { LoanFlowQuote, LoanFlowResult, LoanFlowState };

export interface LoanFlowServiceConfig {
	/** RSK wallet signer (ethers.Wallet) */
	rskSigner: ethers.Wallet;
	/** RSK JSON-RPC provider */
	rskProvider: ethers.JsonRpcProvider;
	/** Arbitrum recipient address (defaults to signer-derived address) */
	arbRecipientAddress: string;
}

export interface LoanFlowServiceResult {
	success: boolean;
	data?: LoanFlowResult;
	error?: string;
}

/**
 * Create a LoanFlowOrchestrator from a service config.
 * The orchestrator is the SDK's state machine that manages the full flow.
 */
export function createLoanFlowOrchestrator(config: LoanFlowServiceConfig): LoanFlowOrchestrator {
	const sdkConfig: LoanFlowConfig = {
		rskSigner: config.rskSigner,
		rskProvider: config.rskProvider,
		arbRecipientAddress: config.arbRecipientAddress
	};
	return new LoanFlowOrchestrator(sdkConfig);
}

/**
 * Get a quote for the loan flow without executing.
 *
 * @param config - Service configuration
 * @param rbtcAmount - rBTC amount in wei (string)
 * @returns Quote with estimated outputs at each step
 */
export async function getLoanFlowQuote(
	config: LoanFlowServiceConfig,
	rbtcAmount: string
): Promise<{ data?: LoanFlowQuote; error?: string }> {
	const orchestrator = createLoanFlowOrchestrator(config);

	const { data, error } = await tryCatch(orchestrator.getQuote(rbtcAmount));
	if (error) {
		return { error: error.message || 'Failed to get loan flow quote' };
	}

	return { data };
}

/**
 * Execute the full loan flow with error handling and state tracking.
 *
 * @param config - Service configuration
 * @param rbtcAmount - rBTC amount in wei (string)
 * @param slippagePercent - Maximum slippage for DEX swap (default 1%)
 * @param onStateChange - Optional callback for progress updates
 * @returns Result with transaction hashes
 */
export async function executeLoanFlow(
	config: LoanFlowServiceConfig,
	rbtcAmount: string,
	slippagePercent: number = 1,
	onStateChange?: (state: LoanFlowState) => void
): Promise<LoanFlowServiceResult> {
	const orchestrator = createLoanFlowOrchestrator(config);

	// Subscribe to state changes
	let unsubscribe: (() => void) | undefined;
	if (onStateChange) {
		unsubscribe = orchestrator.onStateChange(onStateChange);
	}

	try {
		const { data, error } = await tryCatch(
			orchestrator.executeFullFlow(rbtcAmount, slippagePercent)
		);

		if (error) {
			return { success: false, error: error.message || 'Loan flow execution failed' };
		}

		return { success: data.success, data, error: data.success ? undefined : 'Loan flow failed' };
	} finally {
		unsubscribe?.();
	}
}

/**
 * Execute bridge-only flow for users who already hold USDT0 on RSK.
 *
 * @param config - Service configuration
 * @param usdt0Amount - USDT0 amount in smallest unit (6 decimals, string)
 * @param onStateChange - Optional callback for progress updates
 */
export async function executeBridgeOnly(
	config: LoanFlowServiceConfig,
	usdt0Amount: string,
	onStateChange?: (state: LoanFlowState) => void
): Promise<LoanFlowServiceResult> {
	const orchestrator = createLoanFlowOrchestrator(config);

	let unsubscribe: (() => void) | undefined;
	if (onStateChange) {
		unsubscribe = orchestrator.onStateChange(onStateChange);
	}

	try {
		const { data, error } = await tryCatch(orchestrator.executeBridgeOnly(usdt0Amount));

		if (error) {
			return { success: false, error: error.message || 'Bridge execution failed' };
		}

		return { success: data.success, data, error: data.success ? undefined : 'Bridge failed' };
	} finally {
		unsubscribe?.();
	}
}

/**
 * Recover a previously interrupted loan flow from saved state.
 * Useful for Capacitor app lifecycle (app killed mid-flow).
 *
 * @param config - Service configuration
 * @param savedState - Previously saved LoanFlowState
 */
export async function recoverLoanFlow(
	config: LoanFlowServiceConfig,
	savedState: LoanFlowState
): Promise<void> {
	const orchestrator = createLoanFlowOrchestrator(config);
	await orchestrator.recover(savedState);
}

/**
 * Get the USDT0 token address on Arbitrum (from SDK single source of truth).
 */
export function getArbitrumUsdt0Address(): string {
	return ARB_TOKEN_ADDRESSES.USDT0;
}
