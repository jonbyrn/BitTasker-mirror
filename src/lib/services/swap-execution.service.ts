/**
 * Swap Execution Service
 *
 * Pure execution logic extracted from SwapForm.svelte.
 * Handles destination address resolution, route building, swap chain invocation,
 * and post-swap balance refresh. No Svelte component state — only stores and params.
 */

import { get } from 'svelte/store';
import { walletStore, walletManager } from '$lib/stores/wallet.store';
import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
import { startSwapChain } from '$lib/services/swap-chain.service';
import type { Route, SourceWallet, Destination, RouteHop } from '$lib/services/route-resolver';
import type { SmartRoute } from '$lib/services/SmartRouter';
import { createDebug } from '$lib/utils/debug';
import { sanitizeSwapError } from '$lib/utils/swap-error';
import * as Sentry from '@sentry/sveltekit';

const d = createDebug('swap-execution');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SwapExecutionParams {
	sourceType: SourceWallet;
	destType: string;
	amountInTokenUnits: number;
	sourceWallet: string;
	destWallet: string;
	isConnectedSource: boolean;
	execRoute: Route | null;
	smartRoute: SmartRoute | null;
	destAddress: string;
	selectedDestId: string;
	selectedDestChainId: number;
	/** Whether this is a same-asset direct transfer (self-send guard). */
	isDirectTransfer: boolean;
}

export interface SwapExecutionResult {
	phase: 'COMPLETE' | 'FAILED';
	swapId?: string;
	txHash?: string;
	error?: string;
}

// ---------------------------------------------------------------------------
// resolveDestAddress
// ---------------------------------------------------------------------------

/**
 * Resolve destination address from wallet store + connected wallets.
 * Bypasses the rune's derived values which can be stale due to Svelte 5
 * $state proxy reactivity issues with deeply nested objects.
 */
export function resolveDestAddress(destType: string, isConn: boolean, wid: string): string {
	if (isConn) {
		const snap = get(connectedWalletsStore);
		const w = snap.wallets.find((w) => w.id === wid);
		return w?.address ?? '';
	}
	const store = get(walletStore);
	if (destType === 'btc-onchain') {
		// External BTC address from connected wallets
		const snap = get(connectedWalletsStore);
		for (const w of snap.wallets) {
			if (w.btcAddress) return w.btcAddress;
		}
		return '';
	}
	if (destType === 'rbtc-rsk') return store.rsk?.address ?? '';
	return store.arb?.address || store.rsk?.address || '';
}

// ---------------------------------------------------------------------------
// executeSwapChain
// ---------------------------------------------------------------------------

/**
 * Execute a swap chain with the given parameters.
 * Returns the result with phase, swapId, txHash, or error.
 *
 * This function encapsulates:
 * 1. Destination address + self-send validation
 * 2. Building the execution destination object
 * 3. Building the route (from execRoute or smartRoute fallback)
 * 4. Calling startSwapChain
 * 5. Post-swap balance refresh
 * 6. Result mapping
 */
export async function executeSwapChain(params: SwapExecutionParams): Promise<SwapExecutionResult> {
	const {
		sourceType,
		destType,
		amountInTokenUnits,
		sourceWallet,
		isConnectedSource,
		execRoute,
		smartRoute,
		destAddress,
		selectedDestId,
		selectedDestChainId
	} = params;

	// Validate amount
	if (!Number.isFinite(amountInTokenUnits) || amountInTokenUnits <= 0) {
		return { phase: 'FAILED', error: 'wallet.swap.error.invalid_amount' };
	}

	// Validate destination address
	if (!destAddress) {
		return { phase: 'FAILED', error: 'wallet.swap.error.no_dest_address' };
	}

	// Self-send guard is handled by the caller (SwapForm) which has access to rune state.
	// The service trusts that the caller validated this before calling.

	// Build execution destination
	const execDest: Destination =
		selectedDestId === 'btc-onchain'
			? { type: 'invoice', network: 'onchain', invoice: destAddress }
			: selectedDestId === 'wbtc-arb'
				? {
						type: 'address',
						chainId: selectedDestChainId ?? 42161,
						address: destAddress,
						asset: 'WBTC'
					}
				: {
						type: 'address',
						chainId: selectedDestChainId ?? 42161,
						address: destAddress
					};

	const execAmount = amountInTokenUnits.toString();
	const connectedSourceId = isConnectedSource ? sourceWallet : null;

	d.log(
		'executeSwapChain: source=%s dest=%s amount=%s connected=%s',
		sourceType,
		destType,
		execAmount,
		connectedSourceId || 'builtin'
	);

	// Build route for execution — prefer rune's executable route; fallback to local smartRoute override for SwapFallback retry path.
	let route = execRoute;
	if (!route && smartRoute) {
		// Convert local fallback Smart to Route shape (minimal, for retry path)
		route = {
			id: `smart-${smartRoute.provider}`,
			label: smartRoute.provider,
			hops: [
				{
					service: (smartRoute.provider as RouteHop['service']) || 'lifi',
					fromAsset: smartRoute.fromAsset,
					fromChain: 'arbitrum',
					toAsset: smartRoute.toAsset,
					toChain: 'rsk',
					feePercent: 0,
					estimatedTimeMin: smartRoute.estimatedTimeMinutes || 1,
					estimatedTimeMax: (smartRoute.estimatedTimeMinutes || 1) + 1
				}
			],
			totalFeePercent: 0,
			estimatedTime: `${smartRoute.estimatedTimeMinutes || 5} min`,
			recommended: true
		};
	}

	if (!route) {
		Sentry.addBreadcrumb({
			category: 'wallet.swap',
			message: 'swap failed - no route',
			data: { sourceType, destType }
		});
		return { phase: 'FAILED', error: 'wallet.swap.error.no_routes' };
	}

	Sentry.addBreadcrumb({
		category: 'wallet.swap',
		message: 'swap execute started',
		data: { sourceType, destType, amount: amountInTokenUnits, connected: !!isConnectedSource }
	});

	const { data: result, error } = await startSwapChain(
		route,
		sourceType,
		execDest,
		execAmount,
		connectedSourceId
	);

	d.log(
		'executeSwap result: phase=%s error=%s swap1=%s swap2=%s',
		result?.phase ?? 'null',
		error?.message ?? result?.error ?? 'none',
		result?.swap1Id?.substring(0, 16) ?? 'null',
		result?.swap2Id?.substring(0, 16) ?? 'null'
	);

	// Refresh balances regardless of outcome — tokens may have been consumed/received on-chain.
	// (e.g., Symbiosis approve+swap consumed wBTC before the flow errored.)
	// Clears token balance cache so next wallet load shows actual on-chain state.
	walletManager.loadAssets(true).catch((e) => {
		Sentry.addBreadcrumb({
			category: 'wallet.swap',
			message: 'Post-swap balance refresh failed',
			level: 'warning',
			data: { error: e instanceof Error ? e.message : String(e) }
		});
	});

	if (error || !result) {
		d.error('executeSwapChain FAILED: %s', error?.message || 'no result');
		Sentry.addBreadcrumb({
			category: 'wallet.swap',
			message: 'swap execute failed',
			data: { error: error?.message }
		});
		return {
			phase: 'FAILED',
			error: sanitizeSwapError(error?.message) || 'wallet.swap.error.swap_failed'
		};
	}

	if (result.phase === 'COMPLETE') {
		d.log(
			'executeSwapChain COMPLETE: txHash=%s swapId=%s',
			result.swap1Id?.substring(0, 16),
			result.swap2Id?.substring(0, 16)
		);
		return {
			phase: 'COMPLETE',
			swapId: result.swap1Id ?? undefined,
			txHash: result.swap1Id ?? undefined
		};
	}

	return {
		phase: 'FAILED',
		error: sanitizeSwapError(result.error) || 'wallet.swap.error.swap_failed'
	};
}
