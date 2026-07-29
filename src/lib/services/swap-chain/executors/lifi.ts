/**
 * Swap Chain — LI.FI Hop Executor
 *
 * Executes a LI.FI cross-chain swap hop. LI.FI handles bridging + swapping
 * atomically — the user sends funds to the LI.FI contract with encoded
 * calldata, and LI.FI completes the swap on the destination chain.
 *
 * Key design decisions:
 * - Approval + swap are batched into a single executeBatch UserOp to minimize
 *   latency between quote fetch and on-chain execution (quote freshness).
 * - The quote's executionDuration drives freshness checks and retry logic.
 * - No hardcoded gas limits — gas is estimated from actual callData.
 */

import { get } from 'svelte/store';
import * as Sentry from '@sentry/sveltekit';
import { createDebug } from '$lib/utils/debug';
import { lifiService } from '$lib/services/lifi.service';
import { walletStore } from '$lib/stores/wallet.store';
import { getHandle } from '$lib/stores/connected-wallets.store';
import type { RouteHop } from '$lib/services/route-resolver';
import { parseDecimalToSmallestUnit } from '$lib/utils/amount-conversion';
import {
	CHAIN_ID_RSK,
	CHAIN_ID_ARB,
	NATIVE_TOKEN,
	resolveChainId,
	resolveTokenAddress,
	LIFI_ASSET_DECIMALS
} from '../utils';
import { encodeERC20Approve } from '../abi';
import { capBalanceToWalletMax } from './helpers';
import { safeAddress, type SwapChainState } from '../state';
import { sendEvmTransaction } from '../tx-helpers';

let BRIDGE_GAS_RESERVE: Record<string, bigint> | null = null;

const d = createDebug('swap-chain');

/** Max uint256 — infinite approval. */
const MAX_UINT256 = (1n << 256n) - 1n;

/** Maximum number of retry attempts for the swap execution. */
const MAX_SWAP_RETRIES = 2;

/**
 * Safety margin subtracted from the quote's executionDuration (in ms).
 * Accounts for bundler batching delay (~1-2s), Arbitrum block time (~250ms),
 * and network latency (~500ms).
 */
const QUOTE_SAFETY_MARGIN_MS = 2_500;

/**
 * Check whether an error from sendEvmTransaction is retryable.
 *
 * Retryable: stale quote / price movement, network timeouts, bundler busy.
 * Non-retryable: insufficient balance, invalid parameters, no liquidity,
 * gas limit exceeded (will always fail with same parameters).
 */
function isRetryableSwapError(error: Error): boolean {
	const msg = error.message.toLowerCase();
	// Gas limit / paymaster errors are NOT retryable — the same UserOp will
	// fail again. The caller needs to change the parameters, not retry.
	if (msg.includes('gaslimitexceeded')) return false;
	if (msg.includes('gas limit')) return false;
	if (msg.includes('fee per gas exceeded')) return false;
	if (msg.includes('paymaster rejected')) return false;
	if (msg.includes('will fail on-chain')) return false;
	if (msg.includes('bundler rejected')) return false;
	if (msg.includes('insufficient')) return false;
	if (msg.includes('no liquidity')) return false;
	// UserOp revert usually means stale quote or price movement
	if (msg.includes('userop') && msg.includes('revert')) return true;
	if (msg.includes('reverted on-chain')) return true;
	// Network / infra transient failures
	if (msg.includes('timeout')) return true;
	if (msg.includes('network')) return true;
	if (msg.includes('fetch')) return true;
	// Non-retryable by default for unknown errors
	return false;
}

// ---------------------------------------------------------------------------
// LI.FI hop
// ---------------------------------------------------------------------------

/**
 * Execute a LI.FI cross-chain swap hop.
 *
 * Flow:
 *   1. Resolve chain IDs, token addresses, and user address
 *   2. Request step transaction from LI.FI API (quote + calldata)
 *   3. Build approval + swap as a single batched UserOp
 *   4. Check quote freshness before submission
 *   5. Submit via sendEvmTransaction with extraCalls
 *   6. On failure, retry with fresh quote (up to MAX_SWAP_RETRIES)
 */
export async function executeLifiHop(
	hop: RouteHop,
	state: SwapChainState
): Promise<{ data: string | null; error: Error | null }> {
	if (!state.destination || state.destination.type !== 'address') {
		return { data: null, error: new Error('LI.FI hop requires an address destination') };
	}

	const amount = state.amount;
	if (!amount) {
		return { data: null, error: new Error('Amount is required for LI.FI swap') };
	}

	const fromChainId = resolveChainId(hop.fromChain);
	const toChainId = resolveChainId(hop.toChain);
	const fromTokenAddr = resolveTokenAddress(hop.fromAsset, fromChainId);
	const toTokenAddr = resolveTokenAddress(hop.toAsset, toChainId);

	// Resolve user address — connected wallet takes priority
	const userAddr = state.sourceConnectedWalletId
		? safeAddress(getHandle(state.sourceConnectedWalletId)?.address)
		: hop.fromAsset === 'RBTC'
			? safeAddress(get(walletStore).rsk.address)
			: safeAddress(get(walletStore).arb?.address || get(walletStore).rsk.address);

	d.log(
		'executeLifiHop: fromChain=%s(%d) toChain=%s(%d) fromToken=%s toToken=%s connected=%s',
		hop.fromChain,
		fromChainId,
		hop.toChain,
		toChainId,
		fromTokenAddr.substring(0, 16),
		toTokenAddr.substring(0, 16),
		state.sourceConnectedWalletId ?? 'builtin'
	);

	// Convert amount to token's smallest unit based on token decimals
	const decimals = LIFI_ASSET_DECIMALS[hop.fromAsset.toUpperCase()] ?? 18;
	let fromAmountWei = parseDecimalToSmallestUnit(state.amount!, decimals);

	const chain: 'arbitrum' | 'rsk' | 'bsc' =
		fromChainId === CHAIN_ID_ARB ? 'arbitrum' : fromChainId === CHAIN_ID_RSK ? 'rsk' : 'bsc';

	// For ERC-20 source tokens on the gasless relay chain: cap at actual
	// on-chain balance minus the relay fee buffer AND bridge gas margin.
	// The executeBatch batches the swap and a fee transfer — the swap amount
	// must leave enough tokens for BOTH the bridge's internal gas fees AND
	// the fee transfer to succeed, otherwise the entire UserOp reverts.
	if (fromTokenAddr !== NATIVE_TOKEN) {
		const reserveAmount = state.relayFeeBuffer ? BigInt(state.relayFeeBuffer) : undefined;

		// For cross-chain bridges, add BRIDGE_GAS_RESERVE to cover the bridge's
		// internal gas/protocol fees (e.g., GasZip LayerZero messaging gas).
		// Same-chain swaps (e.g., Uniswap V3 on Arbitrum) don't need this.
		let bridgeGasMargin: bigint | undefined;
		if (fromChainId !== toChainId) {
			try {
				if (!BRIDGE_GAS_RESERVE) {
					const config = await import('$lib/wallet/gasless.config');
					BRIDGE_GAS_RESERVE = config.BRIDGE_GAS_RESERVE;
				}
				const margin = BRIDGE_GAS_RESERVE?.[fromTokenAddr.toLowerCase()];
				if (margin) {
					bridgeGasMargin = margin;
					d.log(
						'[executeLifiHop] bridge gas reserve: %s wei (%s) for cross-chain %s→%s',
						margin.toString(),
						hop.fromAsset,
						fromChainId,
						toChainId
					);
				}
			} catch {
				// Non-blocking: if config import fails, proceed without bridge gas reserve
				d.warn('[executeLifiHop] BRIDGE_GAS_RESERVE config unavailable');
			}
		}

		const { data: cappedAmount, error: capError } = await capBalanceToWalletMax({
			tokenAddress: fromTokenAddr,
			userAddress: userAddr,
			chain,
			requestedAmount: fromAmountWei,
			label: 'LI.FI',
			reserveAmount,
			bridgeGasMargin
		});
		if (capError) {
			return { data: null, error: capError };
		}

		// Track if the amount was capped so the UI can display the actual swap amount
		if (cappedAmount !== fromAmountWei) {
			const originalAmount = fromAmountWei;
			fromAmountWei = cappedAmount;
			const decimals_for_display = decimals;
			const adjustedDecimal = Number(cappedAmount) / Math.pow(10, decimals_for_display);
			state.adjustedAmount = adjustedDecimal.toFixed(decimals_for_display);
			d.log(
				'[executeLifiHop] amount capped: original=%s wei → adjusted=%s wei (%s)',
				originalAmount.toString(),
				cappedAmount.toString(),
				state.adjustedAmount
			);
		} else {
			fromAmountWei = cappedAmount;
		}
	}

	if (fromAmountWei <= 0n) {
		return {
			data: null,
			error: new Error(`Insufficient ${hop.fromAsset} balance for LI.FI swap`)
		};
	}

	const fromAmountWeiStr = fromAmountWei.toString();

	// Quote fetch parameters (reused on retry)
	const quoteParams = {
		fromChain: fromChainId,
		toChain: toChainId,
		fromToken: fromTokenAddr,
		toToken: toTokenAddr,
		fromAmount: fromAmountWeiStr,
		fromAddress: userAddr
	};

	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= MAX_SWAP_RETRIES; attempt++) {
		try {
			if (attempt > 0) {
				d.log('[executeLifiHop] Retry %d/%d — re-fetching fresh quote', attempt, MAX_SWAP_RETRIES);
			}

			// ── Step 1: Fetch fresh quote from LI.FI ─────────────────────
			d.log(
				'[executeLifiHop] requesting LI.FI step tx: from=%s→%s amount=%s',
				hop.fromAsset,
				hop.toAsset,
				fromAmountWei
			);
			const quoteReceivedAt = Date.now();
			const txReq = await lifiService.getStepTransaction(quoteParams);
			const executionDurationMs = (txReq.executionDuration ?? 5) * 1000;
			const quoteMaxAgeMs = Math.max(executionDurationMs - QUOTE_SAFETY_MARGIN_MS, 1000);

			d.log(
				'[executeLifiHop] step tx received: to=%s dataLen=%d value=%s executionDuration=%sms maxAge=%sms',
				txReq.to?.substring(0, 10) ?? 'null',
				txReq.data?.length ?? 0,
				txReq.value ?? '0',
				executionDurationMs,
				quoteMaxAgeMs
			);

			// ── Step 2a: ETH value check ────────────────────────────────
			// Cross-chain bridges (Stargate V2, etc.) require native ETH for
			// LayerZero/message fees. Gasless smart accounts have 0 ETH by
			// design — the executeBatch cannot forward ETH it doesn't have.
			// Detect this early and return a clear error instead of letting
			// the bridge call revert with an opaque ExecuteError.
			const bridgeValue = txReq.value ? BigInt(txReq.value) : 0n;
			if (bridgeValue > 0n && chain === 'arbitrum') {
				d.log(
					'[executeLifiHop] bridge requires ETH (%s wei) — not available in gasless account',
					bridgeValue.toString()
				);
				return {
					data: null,
					error: new Error(
						`Cross-chain bridge requires native ETH for messaging fees ` +
						`(${bridgeValue} wei ≈ $${(Number(bridgeValue) / 1e18 * 3000).toFixed(2)}). ` +
						`Your gasless wallet cannot provide ETH. Try a smaller amount or a different bridge.`
					)
				};
			}

			// ── Step 2b: Build batched calls (approval + swap) ──────────
			const extraCalls: Array<{ to: string; data: string; value: bigint }> = [];

			// For ERC-20 source tokens, batch the approval into the same UserOp.
			// This eliminates the ~5s latency of a separate approval UserOp,
			// keeping the quote fresh at execution time.
			if (fromTokenAddr !== NATIVE_TOKEN) {
				const approveCalldata = encodeERC20Approve(txReq.to, MAX_UINT256);
				d.log(
					'[executeLifiHop] batching approval: token=%s spender=%s',
					fromTokenAddr.substring(0, 10),
					txReq.to.substring(0, 10)
				);
				extraCalls.push({ to: fromTokenAddr, data: approveCalldata, value: 0n });
			}

			// ── Step 3: Freshness check ──────────────────────────────────
			const quoteAgeMs = Date.now() - quoteReceivedAt;
			if (quoteAgeMs > quoteMaxAgeMs) {
				d.log(
					'[executeLifiHop] quote stale before submission: age=%sms maxAge=%sms',
					quoteAgeMs,
					quoteMaxAgeMs
				);
				lastError = new Error(
					`LI.FI quote expired before execution (${Math.round(quoteAgeMs / 1000)}s old, max ${Math.round(quoteMaxAgeMs / 1000)}s). Retrying...`
				);
				continue; // retry with fresh quote
			}

			// ── Step 4: Submit batched UserOp ────────────────────────────
			d.log(
				'[executeLifiHop] submitting batched swap tx: chain=%s to=%s calls=%d quoteAge=%sms',
				chain,
				txReq.to?.substring(0, 10),
				1 + extraCalls.length,
				quoteAgeMs
			);

			const { data: txHash, error: txError } = await sendEvmTransaction({
				to: txReq.to,
				data: txReq.data,
				value: bridgeValue,
				chain,
				gasLimit: txReq.gasLimit ? Number(txReq.gasLimit) : undefined,
				sourceConnectedWalletId: state.sourceConnectedWalletId,
				extraCalls: extraCalls.length > 0 ? extraCalls : undefined
			});

			if (txError || !txHash) {
				const err = txError ?? new Error('LI.FI tx failed: no tx hash');
				d.log('[executeLifiHop] SWAP FAILED (attempt %d): %s', attempt, err.message);

				if (attempt < MAX_SWAP_RETRIES && isRetryableSwapError(err)) {
					lastError = err;
					continue; // retry with fresh quote
				}
				return { data: null, error: err };
			}

			d.log('[executeLifiHop] SWAP CONFIRMED: %s', txHash.substring(0, 16));
			return { data: txHash, error: null };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'LI.FI execution failed';
			d.error('[executeLifiHop] FAILED (attempt %d): %s', attempt, message);

			const wrappedErr = new Error(message);
			if (attempt < MAX_SWAP_RETRIES && isRetryableSwapError(wrappedErr)) {
				lastError = wrappedErr;
				continue; // retry with fresh quote
			}

			Sentry.captureException(err, {
				tags: { component: 'swap-chain', executor: 'lifi' },
				extra: { hopFrom: hop.fromAsset, hopTo: hop.toAsset, amount: state.amount, attempt }
			});
			return { data: null, error: wrappedErr };
		}
	}

	// All retries exhausted
	const finalError = lastError ?? new Error('LI.FI swap failed after all retry attempts');
	Sentry.captureException(finalError, {
		tags: { component: 'swap-chain', executor: 'lifi', reason: 'exhausted-retries' },
		extra: { hopFrom: hop.fromAsset, hopTo: hop.toAsset, amount: state.amount }
	});
	return { data: null, error: finalError };
}
