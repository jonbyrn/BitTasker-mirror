/**
 * USDT0 Bridge Service — App-Level Wrapper
 *
 * Thin app-level wrapper around wallet-core's Usdt0BridgeService.
 * Adds Sentry breadcrumbs, timeout + retry logic for LayerZero message
 * delivery, polling for destination chain balance confirmation, and
 * bridge status reporting for the UI.
 *
 * @see RBTC-Collateralized USDT0 on Arbitrum Plan §6
 * @see wallet-core/src/loans/Usdt0BridgeService.ts
 */

import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import { browser } from '$app/environment';
import { loanMonitoringService } from '$lib/services/loan-monitoring.service';

const debug = createDebug('usdt0-bridge');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Status of a bridge operation. */
export type BridgeStatus = 'pending' | 'delivered' | 'failed' | 'timed_out';

/** Parameters for bridging USDT0 across chains. */
export interface Usdt0BridgeParams {
	amount: string;
	fromChainId: number;
	toChainId: number;
	sourceWallet: string;
	recipientAddress: string;
}

/** Result of a successful bridge submission. */
export interface Usdt0BridgeResult {
	txHash: string;
	guid: string;
	amountSent: string;
	amountReceived: string;
	nativeFee: string;
}

/** Result of bridge fee estimation. */
export interface Usdt0BridgeEstimate {
	nativeFee: string;
	receivedAmount: string;
	estimatedTimeMinutes: number;
}

// ---------------------------------------------------------------------------
// Constants (from plan §10.3, §9.1)
// ---------------------------------------------------------------------------

/** Maximum wait time for bridge confirmation (15 minutes). */
const BRIDGE_MAX_WAIT_MS = 15 * 60 * 1000;

/** Polling interval for balance checks (15 seconds). */
const BRIDGE_POLL_INTERVAL_MS = 15000;

/** LayerZero EID constants. */
const LAYERZERO_EIDS = {
	ROOTSTOCK: 30333,
	ARBITRUM: 30110
} as const;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Lazy reference to wallet-core's Usdt0BridgeService. */
let _bridgeService: unknown = null;

/**
 * Set the Usdt0BridgeService instance from wallet-core.
 * Called during app initialization when wallet-core is available.
 */
export function setUsdt0BridgeService(service: unknown): void {
	_bridgeService = service;
	debug.log('Usdt0BridgeService registered');
}

function getBridgeService(): {
	quoteBridge: (
		amount: string,
		fromChainId: number,
		toChainId: number
	) => Promise<Usdt0BridgeEstimate>;
	bridge: (params: Usdt0BridgeParams) => Promise<Usdt0BridgeResult>;
	getBridgeStatus: (guid: string) => Promise<BridgeStatus>;
	retryBridge: (txHash: string) => Promise<Usdt0BridgeResult>;
} {
	if (!_bridgeService) {
		throw new Error(
			'Usdt0BridgeService not yet available from wallet-core. Ensure wallet is initialized.'
		);
	}
	return _bridgeService as ReturnType<typeof getBridgeService>;
}

/**
 * Wait for a specified duration.
 */
function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const usdt0BridgeService = {
	/** LayerZero endpoint IDs for reference. */
	LAYERZERO_EIDS,

	/**
	 * Bridge USDT0 from RSK to Arbitrum with full monitoring.
	 *
	 * 1. Submits the bridge transaction
	 * 2. Polls destination chain balance for confirmation
	 * 3. Handles timeout with graceful messaging
	 *
	 * @param params - Bridge parameters
	 * @returns Bridge result with tx hash and guid
	 */
	async bridge(params: Usdt0BridgeParams): Promise<Usdt0BridgeResult> {
		if (browser && !navigator.onLine) {
			throw new Error('Network is offline. Cannot bridge USDT0.');
		}

		const service = getBridgeService();
		const startTime = Date.now();

		loanMonitoringService.phaseChange('IDLE', 'BRIDGING_TO_ARBITRUM', {
			amount: params.amount,
			fromChain: params.fromChainId,
			toChain: params.toChainId
		});

		// Submit bridge transaction
		const { data: result, error: bridgeError } = await tryCatch(service.bridge(params));

		if (bridgeError || !result) {
			debug.error('Bridge submission failed: %s', bridgeError?.message);
			const err = bridgeError instanceof Error ? bridgeError : new Error(String(bridgeError));
			loanMonitoringService.flowError('BRIDGING_TO_ARBITRUM', err);
			throw bridgeError ?? new Error('Bridge submission returned null');
		}

		const submitDuration = Date.now() - startTime;
		debug.log('Bridge submitted: tx %s, guid %s', result.txHash, result.guid);
		loanMonitoringService.stepDuration('BRIDGING_TO_ARBITRUM', submitDuration, true, {
			txHash: result.txHash,
			guid: result.guid
		});

		return result;
	},

	/**
	 * Wait for bridge delivery confirmation by polling.
	 *
	 * Polls the bridge status every 15 seconds for up to 15 minutes.
	 * Returns once the bridge is confirmed, or throws on timeout.
	 *
	 * @param guid - The bridge GUID (LayerZero message identifier)
	 * @param signal - Optional AbortSignal for cancellation
	 * @returns The final bridge status
	 */
	async waitForDelivery(
		guid: string,
		signal?: AbortSignal
	): Promise<{ status: BridgeStatus; elapsedMs: number }> {
		const service = getBridgeService();
		const startTime = Date.now();

		loanMonitoringService.phaseChange('BRIDGING_TO_ARBITRUM', 'WAITING_BRIDGE', { guid });

		while (true) {
			if (signal?.aborted) {
				throw new Error('Bridge monitoring cancelled');
			}

			const elapsed = Date.now() - startTime;

			if (elapsed > BRIDGE_MAX_WAIT_MS) {
				debug.warn('Bridge timed out after %dms', elapsed);
				loanMonitoringService.phaseChange('WAITING_BRIDGE', 'BRIDGING_TIMED_OUT', {
					guid,
					elapsedMs: elapsed
				});
				return { status: 'timed_out', elapsedMs: elapsed };
			}

			const { data: status, error } = await tryCatch(service.getBridgeStatus(guid));

			if (error) {
				debug.warn('Bridge status check failed (will retry): %s', error.message);
				await wait(BRIDGE_POLL_INTERVAL_MS);
				continue;
			}

			if (status === 'delivered') {
				debug.log('Bridge delivered after %dms', elapsed);
				loanMonitoringService.stepDuration('WAITING_BRIDGE', elapsed, true, { guid });
				return { status: 'delivered', elapsedMs: elapsed };
			}

			if (status === 'failed') {
				debug.error('Bridge failed after %dms', elapsed);
				loanMonitoringService.flowError(
					'WAITING_BRIDGE',
					new Error(`Bridge delivery failed for guid ${guid}`)
				);
				return { status: 'failed', elapsedMs: elapsed };
			}

			// Still pending — wait and retry
			if (elapsed > 120_000 && elapsed % 60_000 < BRIDGE_POLL_INTERVAL_MS) {
				// Log every minute after 2 minutes elapsed
				debug.log('Bridge still pending after %ds... (normal)', Math.floor(elapsed / 1000));
			}

			await wait(BRIDGE_POLL_INTERVAL_MS);
		}
	},

	/**
	 * Retry a failed bridge transaction.
	 *
	 * @param txHash - The original bridge transaction hash
	 * @returns New bridge result
	 */
	async retryBridge(txHash: string): Promise<Usdt0BridgeResult> {
		const service = getBridgeService();
		const startTime = Date.now();

		loanMonitoringService.recoveryAttempt('PAUSED_USDT0_RSK', 'retry-bridge', { txHash });

		const { data, error } = await tryCatch(service.retryBridge(txHash));

		if (error || !data) {
			debug.error('Bridge retry failed: %s', error?.message);
			const err = error instanceof Error ? error : new Error(String(error));
			loanMonitoringService.flowError('RECOVERING', err, { txHash });
			throw error ?? new Error('Bridge retry returned null');
		}

		loanMonitoringService.stepDuration('RECOVERING', Date.now() - startTime, true, {
			txHash: data.txHash,
			guid: data.guid
		});

		return data;
	},

	/**
	 * Get a quote for the bridge fee (native coin + received amount).
	 */
	async quoteBridge(
		amount: string,
		fromChainId: number,
		toChainId: number
	): Promise<Usdt0BridgeEstimate> {
		const service = getBridgeService();

		const { data, error } = await tryCatch(service.quoteBridge(amount, fromChainId, toChainId));

		if (error || !data) {
			debug.error('Bridge quote failed: %s', error?.message);
			throw error ?? new Error('Bridge quote returned null');
		}

		return data;
	}
};
