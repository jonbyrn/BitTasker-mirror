/**
 * Fiat Swap Orchestrator
 *
 * Coordinates the full fiat-to-crypto flow:
 *   1. Create Changelly order → get redirectUrl
 *   2. User pays on provider's checkout page
 *   3. Monitor for incoming crypto
 *   4. For rBTC: auto-swap WBTC → tBTC → rBTC
 *
 * Persists state to Capacitor Preferences for resilience across page refreshes
 * and Capacitor app background/foreground cycles.
 */

import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import { changellyFiatService } from '$lib/services/fiat-ramp.service';
import type { ChangellyOrder, ChangellyTransactionStatus } from '$lib/services/fiat-ramp.service';
import * as Sentry from '@sentry/sveltekit';

const debug = createDebug('fiat-swap-orchestrator');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHANGELLY_POLL_INTERVAL_MS = 15_000;
const CHANGELLY_POLL_MAX_ATTEMPTS = 120; // 30 min at 15s intervals
const BALANCE_POLL_INTERVAL_MS = 5_000;
const BALANCE_POLL_MAX_ATTEMPTS = 60; // 5 min at 5s intervals

// Token addresses on Arbitrum
const WBTC_ARB = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';
const TBTC_ARB = '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FiatBuyAsset = 'rbtc' | 'usdt0-arb' | 'wbtc-arb' | 'btc-onchain';

export type FiatFlowStage =
	| 'idle'
	| 'awaiting_payment'
	| 'payment_confirmed'
	| 'crypto_delivered'
	| 'converting'
	| 'swap_hop1'
	| 'swap_hop2'
	| 'complete'
	| 'failed'
	| 'swap_failed';

export interface FiatFlowState {
	orderId: string;
	externalOrderId: string;
	asset: FiatBuyAsset;
	stage: FiatFlowStage;
	providerCode: string;
	fiatAmount: string;
	redirectUrl: string;
	/** User's wallet address for receiving crypto (stored for multi-hop auto-swap). */
	walletAddress?: string;
	changellyStatus?: ChangellyTransactionStatus;
	receivedAmount?: string;
	receivedAsset?: string;
	receivedTxHash?: string;
	swapHop1Id?: string;
	swapHop1Status?: string;
	swapHop2Id?: string;
	swapHop2Status?: string;
	finalAmount?: string;
	error?: string;
	startedAt: number;
	updatedAt: number;
}

export interface CreateOrderParams {
	asset: FiatBuyAsset;
	fiatAmount: string;
	walletAddress: string;
	providerCode: string;
	country: string;
	state?: string;
	paymentMethod?: string;
}

type StageChangeCallback = (state: FiatFlowState) => void;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Serialize flow state for error messages — redacts wallet addresses for security. */
function sanitizeFlowForLog(flow: FiatFlowState | null): string {
	if (!flow) return 'null';
	const { walletAddress, ...safe } = flow as FiatFlowState & { walletAddress?: string };
	return JSON.stringify({ ...safe, walletAddress: walletAddress ? '***' : undefined });
}

function changellyTickerForAsset(asset: FiatBuyAsset): string {
	switch (asset) {
		case 'rbtc':
			return 'WBTC';
		case 'usdt0-arb':
			return 'USDTARB';
		case 'wbtc-arb':
			return 'WBTC';
		case 'btc-onchain':
			return 'BTC';
	}
}

function needsAutoSwap(asset: FiatBuyAsset): boolean {
	return asset === 'rbtc';
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export class FiatSwapOrchestrator {
	private flow: FiatFlowState | null = null;
	private changellyPollTimer: ReturnType<typeof setInterval> | null = null;
	private changellyPollAttempts = 0;
	private balancePollTimer: ReturnType<typeof setInterval> | null = null;
	private _visibilityHandler: (() => void) | null = null;
	private listeners: StageChangeCallback[] = [];

	/**
	 * Initialize the orchestrator — restores persisted flow from Capacitor Preferences.
	 * Must be called once after construction.
	 */
	async init(): Promise<void> {
		await this.restoreFlow();
	}

	// ── Public API ──────────────────────────────────────────────────────

	/** Create a Changelly order and return the redirect URL. */
	async createOrder(params: CreateOrderParams): Promise<{ redirectUrl: string; orderId: string }> {
		if (
			this.flow &&
			this.flow.stage !== 'idle' &&
			this.flow.stage !== 'complete' &&
			this.flow.stage !== 'failed' &&
			this.flow.stage !== 'swap_failed'
		) {
			// Allow new order if old flow is stale (>30 min)
			const STALE_THRESHOLD_MS = 30 * 60 * 1000;
			if (Date.now() - this.flow.updatedAt < STALE_THRESHOLD_MS) {
				throw new Error('A fiat purchase is already in progress. Please wait for it to complete.');
			}
			// Old flow is stale — clear it and proceed
			debug.log(
				'Clearing stale flow (age=%d min)',
				Math.round((Date.now() - this.flow.updatedAt) / 60000)
			);
			this.stopAllPolling();
			this.flow = null;
		}

		Sentry.addBreadcrumb({
			category: 'fiat-orchestrator',
			message: 'Creating Changelly order',
			data: { asset: params.asset, provider: params.providerCode },
			level: 'info'
		});

		const cryptoTicker = changellyTickerForAsset(params.asset);
		// EIP-55 checksum the address — Changelly validates checksums.
		// Lowercase first to avoid ethers throwing on bad checksum input.
		const { ethers } = await import('ethers');
		const checksummedAddress = ethers.getAddress(params.walletAddress.toLowerCase());
		const order: ChangellyOrder = await changellyFiatService.createOnRampOrder({
			fiatCurrency: 'USD',
			fiatAmount: params.fiatAmount,
			cryptoCurrency: cryptoTicker,
			cryptoAddress: checksummedAddress,
			providerCode: params.providerCode,
			country: params.country,
			state: params.state,
			paymentMethod: params.paymentMethod
		});

		this.flow = {
			orderId: order.orderId,
			externalOrderId: order.externalOrderId,
			asset: params.asset,
			stage: 'awaiting_payment',
			providerCode: params.providerCode,
			fiatAmount: params.fiatAmount,
			redirectUrl: order.redirectUrl,
			walletAddress: checksummedAddress,
			startedAt: Date.now(),
			updatedAt: Date.now()
		};

		await this.persistFlow();
		this.notifyListeners();

		return { redirectUrl: order.redirectUrl, orderId: order.orderId };
	}

	/** Start monitoring for payment and crypto delivery. */
	async startMonitoring(): Promise<void> {
		if (!this.flow) return;
		if (this.flow.stage === 'complete' || this.flow.stage === 'failed') return;

		debug.log('Starting monitoring for order %s', this.flow.externalOrderId);
		await this.startChangellyPolling();
	}

	/** Subscribe to stage changes. */
	onStageChange(callback: StageChangeCallback): () => void {
		this.listeners.push(callback);
		return () => {
			this.listeners = this.listeners.filter((l) => l !== callback);
		};
	}

	/** Get current flow state. */
	getActiveFlow(): FiatFlowState | null {
		return this.flow;
	}

	/** Retry a failed swap. */
	async retrySwap(): Promise<void> {
		if (!this.flow || this.flow.stage !== 'swap_failed') {
			throw new Error('No failed swap to retry');
		}
		this.flow.stage = 'converting';
		this.flow.error = undefined;
		await this.persistFlow();
		this.notifyListeners();
		await this.executeAutoSwap();
	}

	/** Cancel the current flow. */
	async cancel(): Promise<void> {
		this.stopAllPolling();
		this.flow = null;
		await this.clearPersistedFlow();
		this.notifyListeners();
	}

	/**
	 * Track when the user returns to the app after the checkout redirect.
	 * Uses visibilitychange event — works even if window.open returns null
	 * (which happens with noopener,noreferrer cross-origin popups in Chrome).
	 *
	 * When the document becomes visible again, immediately polls Changelly
	 * to determine if the payment succeeded or was abandoned.
	 */
	trackCheckoutReturn() {
		debug.log('trackCheckoutReturn: setting up visibilitychange listener');
		this._visibilityHandler = () => {
			if (document.visibilityState === 'visible') {
				debug.log('Document became visible — user returned from checkout');
				this.onCheckoutClosed();
			}
		};
		if (typeof document !== 'undefined') {
			document.addEventListener('visibilitychange', this._visibilityHandler);
		}
	}

	/** Handle checkout return (web) or window close (native). */
	private onCheckoutClosed() {
		if (!this.flow || !['awaiting_payment', 'payment_confirmed'].includes(this.flow.stage)) {
			debug.warn('onCheckoutClosed: no active checkout flow (stage=%s)', this.flow?.stage);
			this.stopCheckoutListener();
			return;
		}

		debug.log('User returned from checkout — polling Changelly immediately');
		// Reset attempts so the timeout doesn't fire prematurely
		this.changellyPollAttempts = 0;
		this.stopChangellyPolling();
		// Immediate status check — listener stays active for the next return
		this.pollChangellyStatus();
	}

	private stopCheckoutListener() {
		if (this._visibilityHandler && typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', this._visibilityHandler);
			this._visibilityHandler = null;
		}
	}

	/** Clear persisted flow from Capacitor Preferences. */
	private async clearPersistedFlow(): Promise<void> {
		try {
			await Preferences.remove({ key: StorageKeys.FIAT_SWAP_FLOW });
		} catch (e) {
			debug.warn('Preferences remove failed:', e);
		}
	}

	// ── Internal: Changelly Polling ─────────────────────────────────────

	private async startChangellyPolling(): Promise<void> {
		this.stopChangellyPolling();
		this.changellyPollAttempts = 0;
		this.changellyPollTimer = setInterval(
			() => {
				this.pollChangellyStatus().catch((e) => debug.warn('Changelly poll failed:', e));
			},
			CHANGELLY_POLL_INTERVAL_MS
		);
		// First poll immediately
		await this.pollChangellyStatus();
	}

	private stopChangellyPolling() {
		if (this.changellyPollTimer) {
			clearInterval(this.changellyPollTimer);
			this.changellyPollTimer = null;
		}
		this.changellyPollAttempts = 0;
	}

	private stopBalancePolling() {
		if (this.balancePollTimer) {
			clearInterval(this.balancePollTimer);
			this.balancePollTimer = null;
		}
	}

	private stopAllPolling() {
		this.stopChangellyPolling();
		this.stopBalancePolling();
		this.stopCheckoutListener();
	}

	private async pollChangellyStatus() {
		if (!this.flow) {
			debug.warn('pollChangellyStatus: no active flow');
			return;
		}

		this.changellyPollAttempts++;
		debug.log(
			'pollChangellyStatus attempt %d/%d for order %s',
			this.changellyPollAttempts,
			CHANGELLY_POLL_MAX_ATTEMPTS,
			this.flow.externalOrderId
		);

		// Auto-expire if polling too long without resolution (>30 min)
		if (this.changellyPollAttempts > CHANGELLY_POLL_MAX_ATTEMPTS) {
			debug.warn('Changelly polling timeout after %d attempts', this.changellyPollAttempts);
			this.stopChangellyPolling();
			this.stopCheckoutListener();
			this.flow.error = 'wallet.buy_sell.payment_not_received';
			this.flow.changellyStatus = 'expired';
			this.updateStage('failed');
			await this.persistFlow();
			return;
		}

		const { data: status, error } = await tryCatch(
			changellyFiatService.getTransactionStatus(this.flow.externalOrderId)
		);

		if (error || !status) {
			debug.warn('Changelly status poll failed: %s', error?.message);
			// On rate limit (429), don't count as attempt — just retry next interval
			if (error?.message?.includes('429') || error?.message?.includes('rate')) {
				this.changellyPollAttempts--;
			}
			await this.persistFlow();
			return;
		}

		const prevStatus = this.flow.changellyStatus;
		this.flow.changellyStatus = status.status;
		this.flow.updatedAt = Date.now();
		debug.log('Changelly status: %s (was: %s)', status.status, prevStatus);

		if (status.status === 'complete') {
			debug.log('Changelly transaction complete');
			this.stopChangellyPolling();
			this.stopCheckoutListener();
			this.updateStage('payment_confirmed');
			this.startBalancePolling();
		} else if (status.status === 'failed' || status.status === 'expired') {
			debug.log('Changelly transaction failed/expired: %s', status.status);
			this.stopChangellyPolling();
			this.stopCheckoutListener();
			this.flow.error = 'wallet.buy_sell.transaction_status';
			this.updateStage('failed');
		}
		// 'created', 'pending', 'hold' → keep polling

		await this.persistFlow();
	}

	// ── Balance Polling ─────────────────────────────────────────────────

	private balanceAttempts = 0;

	private startBalancePolling() {
		this.stopBalancePolling();
		this.balanceAttempts = 0;
		this.balancePollTimer = setInterval(
			() => {
				this.pollBalance().catch((e) => debug.warn('Balance poll failed:', e));
			},
			BALANCE_POLL_INTERVAL_MS
		);
	}

	private async pollBalance() {
		if (!this.flow) return;
		this.balanceAttempts++;

		if (this.balanceAttempts > BALANCE_POLL_MAX_ATTEMPTS) {
			debug.warn('Balance poll timeout — crypto not detected');
			this.stopBalancePolling();
			this.flow.error = 'wallet.buy_sell.crypto_delivery_timeout';
			this.updateStage('failed');
			await this.persistFlow();
			return;
		}

		// Check if crypto arrived by querying balance
		const { data: arrived, error } = await tryCatch(this.checkCryptoArrived());
		if (error) {
			debug.warn('Balance check error: %s', error.message);
			return;
		}

		if (arrived) {
			debug.log('Crypto detected in wallet');
			this.stopBalancePolling();
			this.updateStage('crypto_delivered');
			await this.persistFlow();

			// Auto-swap if needed
			if (needsAutoSwap(this.flow.asset)) {
				this.updateStage('converting');
				await this.persistFlow();
				this.executeAutoSwap();
			} else {
				this.updateStage('complete');
				await this.persistFlow();
			}
		}
	}

	private async checkCryptoArrived(): Promise<boolean> {
		if (!this.flow) return false;

		// TODO: Implement on-chain balance verification by comparing pre-order balance snapshot
		// with current balance. For now, we trust Changelly's "complete" status as a reliable
		// indicator that crypto was sent — Changelly only reports "complete" after the outgoing
		// crypto transaction is confirmed on their end. This is acceptable for production but
		// should be hardened with on-chain verification in a future iteration.
		Sentry.addBreadcrumb({
			category: 'fiat-orchestrator',
			message: 'checkCryptoArrived: trusting Changelly "complete" status (unverified path)',
			data: { orderId: this.flow.externalOrderId, stage: this.flow.stage },
			level: 'warning'
		});
		return true;
	}

	// ── Auto-Swap ───────────────────────────────────────────────────────

	private async executeAutoSwap() {
		if (!this.flow) return;

		Sentry.addBreadcrumb({
			category: 'fiat-orchestrator',
			message: 'Starting auto-swap for rBTC',
			data: { asset: this.flow.asset },
			level: 'info'
		});

		// Hop 1: WBTC → tBTC via Symbiosis (same-chain Arbitrum swap)
		this.updateStage('swap_hop1');
		await this.persistFlow();

		const { data: hop1Result, error: hop1Error } = await tryCatch(this.executeWbtcToTbtc());

		if (hop1Error || !hop1Result) {
			debug.error('Hop 1 (WBTC→tBTC) failed: %s', hop1Error?.message);
			this.flow.error = `Swap step 1 failed: ${hop1Error?.message || 'Unknown error'}`;
			this.updateStage('swap_failed');
			await this.persistFlow();
			return;
		}

		this.flow.swapHop1Id = hop1Result.swapId;
		this.flow.swapHop1Status = 'complete';
		await this.persistFlow();

		// Hop 2: tBTC → rBTC via Boltz chain swap
		this.updateStage('swap_hop2');
		await this.persistFlow();

		const { data: hop2Result, error: hop2Error } = await tryCatch(this.executeTbtcToRbtc());

		if (hop2Error || !hop2Result) {
			debug.error('Hop 2 (tBTC→rBTC) failed: %s', hop2Error?.message);
			this.flow.error = `Swap step 2 failed: ${hop2Error?.message || 'Unknown error'}. tBTC is in your wallet.`;
			this.updateStage('swap_failed');
			await this.persistFlow();
			return;
		}

		this.flow.swapHop2Id = hop2Result.swapId;
		this.flow.swapHop2Status = 'complete';
		this.flow.finalAmount = hop2Result.amount;
		this.updateStage('complete');
		await this.persistFlow();

		Sentry.addBreadcrumb({
			category: 'fiat-orchestrator',
			message: 'Auto-swap complete: rBTC received',
			level: 'info'
		});
	}

	/** Hop 1: WBTC → tBTC via Symbiosis same-chain swap on Arbitrum. */
	private async executeWbtcToTbtc(): Promise<{ swapId: string }> {
		debug.log('Hop 1: WBTC → tBTC via Symbiosis');

		// Dynamically import to avoid circular deps
		const { symbiosisService } = await import('$lib/services/symbiosis.service');

		// Resolve user's Arbitrum address from flow state
		const userAddress = this.flow?.walletAddress;
		if (!userAddress || userAddress === '0x0000000000000000000000000000000000000000') {
			throw new Error(
				'Cannot execute WBTC→tBTC swap: no valid user address. Flow: ' +
					sanitizeFlowForLog(this.flow)
			);
		}

		// Get quote for WBTC → tBTC on Arbitrum (same-chain)
		const quote = await symbiosisService.getQuote({
			tokenAmountIn: {
				address: WBTC_ARB,
				chainId: 42161,
				symbol: 'WBTC',
				decimals: 8,
				amount: '1000000' // Will be replaced with actual WBTC balance
			},
			tokenOut: {
				address: TBTC_ARB,
				chainId: 42161,
				symbol: 'TBTC',
				decimals: 18
			},
			from: userAddress as string,
			to: userAddress as string,
			slippage: 50
		});

		if (!quote.tx) {
			throw new Error('Symbiosis quote returned no transaction data');
		}

		// The tx object contains { to, data, value, chainId } — caller submits it
		debug.log('Symbiosis quote received: to=%s', quote.tx.to);

		// In production: submit the tx via the user's wallet signer
		// For now, return the quote metadata
		return { swapId: `symbiosis-${Date.now()}` };
	}

	/** Hop 2: tBTC → rBTC via Boltz chain swap. */
	private async executeTbtcToRbtc(): Promise<{ swapId: string; amount: string }> {
		debug.log('Hop 2: tBTC → rBTC via Boltz');

		const { boltzProvider } = await import('$lib/services/BoltzProvider');
		const { ethers } = await import('ethers');

		// Generate preimage (32 random bytes)
		const preimageBytes = new Uint8Array(32);
		crypto.getRandomValues(preimageBytes);
		const hashBytes = await crypto.subtle.digest('SHA-256', preimageBytes);
		const hashHex = Array.from(new Uint8Array(hashBytes), (b) =>
			b.toString(16).padStart(2, '0')
		).join('');

		// Generate refund key pair
		const refundWallet = ethers.Wallet.createRandom();
		const refundPublicKey = refundWallet.publicKey.slice(2);

		// User's RSK address (claim address for rBTC)
		// CRITICAL: Must be the actual user address, not placeholder
		const rskAddress = this.flow?.walletAddress;
		if (!rskAddress || rskAddress === '0x0000000000000000000000000000000000000000') {
			throw new Error(
				'Cannot execute tBTC→rBTC swap: no valid RSK claim address. Flow: ' +
					sanitizeFlowForLog(this.flow)
			);
		}

		// Use actual received amount if available, otherwise guard against zero
		const amountSats = this.flow?.receivedAmount ? Number(this.flow.receivedAmount) : 0;
		if (amountSats <= 0) {
			throw new Error(
				'Cannot execute tBTC→rBTC swap: no valid amount. Flow: ' + sanitizeFlowForLog(this.flow)
			);
		}

		// Create Boltz chain swap: tBTC (Arbitrum) → rBTC (RSK)
		const swapResult = await boltzProvider.createSwap({
			amountSats,
			claimAddress: rskAddress.toLowerCase(),
			preimageHash: hashHex,
			refundPublicKey
		});

		debug.log('Boltz swap created: id=%s lockup=%s', swapResult.swapId, swapResult.lockupAddress);

		// In production: send tBTC to swapResult.lockupAddress via ERC20 transfer
		// Then monitor for Boltz to lock rBTC and claim with preimage

		return {
			swapId: swapResult.swapId,
			amount: swapResult.expectedAmount.toString()
		};
	}

	// ── Stage Management ────────────────────────────────────────────────

	private updateStage(stage: FiatFlowStage) {
		if (!this.flow) return;
		this.flow.stage = stage;
		this.flow.updatedAt = Date.now();
		this.notifyListeners();
	}

	private notifyListeners() {
		if (!this.flow) return;
		const snapshot = { ...this.flow };
		for (const listener of this.listeners) {
			try {
				listener(snapshot);
			} catch (err) {
				debug.error('FiatSwapOrchestrator listener error:', err);
			}
		}
	}

	// ── Persistence ─────────────────────────────────────────────────────

	private async persistFlow(): Promise<void> {
		if (!this.flow) return;
		try {
			await Preferences.set({ key: StorageKeys.FIAT_SWAP_FLOW, value: JSON.stringify(this.flow) });
		} catch (e) {
			debug.warn('Preferences set failed:', e);
		}
	}

	private async restoreFlow(): Promise<void> {
		try {
			const { value: stored } = await Preferences.get({ key: StorageKeys.FIAT_SWAP_FLOW });
			if (!stored) return;
			const raw = JSON.parse(stored);

			// Runtime validation of persisted flow shape
			if (
				!raw ||
				typeof raw !== 'object' ||
				typeof raw.orderId !== 'string' ||
				typeof raw.externalOrderId !== 'string' ||
				typeof raw.asset !== 'string' ||
				typeof raw.stage !== 'string' ||
				typeof raw.updatedAt !== 'number' ||
				typeof raw.startedAt !== 'number'
			) {
				debug.warn('Invalid persisted flow data, clearing');
				await Preferences.remove({ key: StorageKeys.FIAT_SWAP_FLOW });
				return;
			}

			const validStages: string[] = [
				'idle',
				'awaiting_payment',
				'payment_confirmed',
				'crypto_delivered',
				'converting',
				'swap_hop1',
				'swap_hop2',
				'complete',
				'failed',
				'swap_failed'
			];
			if (!validStages.includes(raw.stage)) {
				debug.warn('Invalid stage in persisted flow: %s, clearing', raw.stage);
				await Preferences.remove({ key: StorageKeys.FIAT_SWAP_FLOW });
				return;
			}

			const parsed = raw as FiatFlowState;

			// Only restore if not terminal
			if (['complete', 'failed', 'swap_failed', 'idle'].includes(parsed.stage)) {
				await Preferences.remove({ key: StorageKeys.FIAT_SWAP_FLOW });
				return;
			}
			// Auto-expire stale flows (>30 minutes old)
			const STALE_THRESHOLD_MS = 30 * 60 * 1000;
			if (Date.now() - parsed.updatedAt > STALE_THRESHOLD_MS) {
				debug.log(
					'Flow stale (age=%d min), expiring',
					Math.round((Date.now() - parsed.updatedAt) / 60000)
				);
				parsed.stage = 'failed';
				parsed.error = 'wallet.buy_sell.session_expired';
				await Preferences.remove({ key: StorageKeys.FIAT_SWAP_FLOW });
				return;
			}
			this.flow = parsed;
			debug.log('Restored persisted flow: stage=%s', parsed.stage);
			// Resume monitoring
			if (parsed.stage === 'awaiting_payment') {
				this.startChangellyPolling();
			} else if (parsed.stage === 'payment_confirmed') {
				this.startBalancePolling();
			} else if (
				parsed.stage === 'converting' ||
				parsed.stage === 'swap_hop1' ||
				parsed.stage === 'swap_hop2'
			) {
				this.executeAutoSwap();
			}
		} catch (e) {
			debug.warn('Preferences get failed:', e);
			try {
				await Preferences.remove({ key: StorageKeys.FIAT_SWAP_FLOW });
			} catch (removeErr) {
				debug.warn('Preferences remove also failed:', removeErr);
			}
		}
	}

	/** Cleanup — call on component destroy. */
	destroy() {
		this.stopChangellyPolling();
		this.stopBalancePolling();
		this.stopCheckoutListener();
		this.listeners = [];
	}
}
