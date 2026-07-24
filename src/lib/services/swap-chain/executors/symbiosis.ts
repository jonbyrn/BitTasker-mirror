/**
 * Swap Chain — Symbiosis Hop Executor
 *
 * Executes a Symbiosis cross-chain swap hop. Symbiosis handles bridging +
 * swapping atomically — the user sends funds to a Symbiosis deposit address.
 *
 * For same-chain swaps (e.g., wBTC→tBTC on Arbitrum), the swap is atomic
 * (DEX aggregator). For cross-chain swaps, the Symbiosis relayer delivers
 * on the destination chain.
 */

import { get } from 'svelte/store';
import * as Sentry from '@sentry/sveltekit';
import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import { symbiosisService } from '$lib/services/symbiosis.service';
import type { SymbiosisSwapStatusResponse } from '$lib/services/symbiosis.service';
import { walletStore } from '$lib/stores/wallet.store';
import { getHandle } from '$lib/stores/connected-wallets.store';
import type { RouteHop } from '$lib/services/route-resolver';
import { parseDecimalToSmallestUnit } from '$lib/utils/amount-conversion';
import {
	CHAIN_ID_RSK,
	CHAIN_ID_ARB,
	CHAIN_ID_BSC,
	NATIVE_TOKEN,
	resolveChainId,
	resolveTokenAddress,
	getSymbiosisDecimals
} from '../utils';
import { safeAddress, type SwapChainState, sleep } from '../state';
import { sendEvmTransaction } from '../tx-helpers';
import { encodeERC20Approve } from '../abi';
import { capBalanceToWalletMax } from './helpers';

const d = createDebug('swap-chain');

/** Max uint256 — infinite approval. */
const MAX_UINT256 = (1n << 256n) - 1n;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How often to poll for Symbiosis relayer delivery (ms). */
const SYMBIOSIS_POLL_INTERVAL_MS = 5000;

/** Maximum time to wait for Symbiosis relayer delivery (ms). */
const SYMBIOSIS_MAX_WAIT_MS = 600_000;

// ---------------------------------------------------------------------------
// Symbiosis hop
// ---------------------------------------------------------------------------

/**
 * Execute a Symbiosis cross-chain swap hop.
 *
 * Flow:
 *   1. Resolve chain IDs, token addresses, and user address
 *   2. Cap ERC-20 amount to on-chain balance (prevents revert in multi-hop routes)
 *   3. Get swap quote from Symbiosis API
 *   4. Approve ERC-20 source token (if not native)
 *   5. Submit swap transaction via `sendEvmTransaction`
 *   6. For cross-chain: poll for relayer delivery
 */
export async function executeSymbiosisHop(
	hop: RouteHop,
	state: SwapChainState
): Promise<{ data: string | null; error: Error | null }> {
	if (!state.destination || state.destination.type !== 'address') {
		return { data: null, error: new Error('Symbiosis hop requires an address destination') };
	}

	const amount = state.amount;
	if (!amount) {
		return { data: null, error: new Error('Amount is required for Symbiosis swap') };
	}

	const fromChainId = resolveChainId(hop.fromChain);
	const toChainId = resolveChainId(hop.toChain);

	const fromTokenAddr = resolveTokenAddress(hop.fromAsset, fromChainId);
	const toTokenAddr = resolveTokenAddress(hop.toAsset, toChainId);

	d.log(
		'executeSymbiosisHop: fromChain=%s(%d) toChain=%s(%d) fromToken=%s toToken=%s amount=%s',
		hop.fromChain,
		fromChainId,
		hop.toChain,
		toChainId,
		fromTokenAddr.substring(0, 16),
		toTokenAddr.substring(0, 16),
		state.amount
	);

	// Resolve user address — connected wallet takes priority, then chain-specific built-in
	// Always validate: ethers v6 requires EIP-55 checksummed addresses for sendTransaction()
	const ws = get(walletStore);
	d.log(
		'[executeSymbiosisHop] ws.rsk.address=%s, ws.arb?.address=%s',
		ws.rsk.address || 'EMPTY',
		ws.arb?.address || 'EMPTY'
	);
	let builtinAddr = safeAddress(
		hop.fromChain === 'rsk'
			? ws.rsk.address
			: hop.fromChain === 'arbitrum'
				? ws.arb?.address || ws.rsk.address
				: ws.bsc.address
	);

	// Fallback: wallet store addresses may not be populated yet (async loadAssets).
	// getRSKAddress() waits for wallet initialization and returns the derived address.
	if (!builtinAddr) {
		d.log(
			'[executeSymbiosisHop] builtinAddr EMPTY — ws.rsk.address=%s, ws.arb?.address=%s — calling getRSKAddress()',
			ws.rsk.address || 'EMPTY',
			ws.arb?.address || 'EMPTY'
		);
		const { getRSKAddress } = await import('$lib/stores/wallet.store');
		const rskAddr = await getRSKAddress();
		builtinAddr = safeAddress(rskAddr);
		d.log(
			'[executeSymbiosisHop] getRSKAddress() returned:',
			rskAddr || 'EMPTY',
			'→ builtinAddr:',
			builtinAddr || 'EMPTY'
		);
	}

	const connectedAddr = state.sourceConnectedWalletId
		? safeAddress(getHandle(state.sourceConnectedWalletId)?.address)
		: '';
	const symUserAddr = connectedAddr || builtinAddr;

	if (!symUserAddr) {
		d.error(
			'No user address for Symbiosis hop: fromChain=%s connected=%s rsk=%s arb=%s',
			hop.fromChain,
			state.sourceConnectedWalletId ?? 'none',
			ws.rsk.address ?? 'none',
			ws.arb?.address ?? 'none'
		);
		return { data: null, error: new Error('No wallet address available for Symbiosis swap') };
	}

	// Convert to smallest unit
	const fromDecimals = getSymbiosisDecimals(hop.fromAsset);
	let symFromAmountWei = parseDecimalToSmallestUnit(state.amount!, fromDecimals);

	const symChain: 'arbitrum' | 'rsk' | 'bsc' =
		fromChainId === CHAIN_ID_ARB ? 'arbitrum' : fromChainId === CHAIN_ID_RSK ? 'rsk' : 'bsc';

	// For ERC-20 source tokens: cap at actual on-chain balance.
	// In 2-hop Boltz-first routes (e.g., rBTC→tBTC→WBTC), the intermediate
	// token balance may be less than state.amount due to Boltz fees.
	// Using the raw amount would cause the Symbiosis transferFrom to revert.
	// Also subtract relayFeeBuffer to prevent "transfer amount exceeds balance"
	// when the same token is used for both swap input and gasless fee payment.
	if (fromTokenAddr !== NATIVE_TOKEN) {
		const reserveAmount = state.relayFeeBuffer ? BigInt(state.relayFeeBuffer) : undefined;
		const { data: cappedAmount, error: capError } = await capBalanceToWalletMax({
			tokenAddress: fromTokenAddr,
			userAddress: symUserAddr,
			chain: symChain,
			requestedAmount: symFromAmountWei,
			label: 'Symbiosis',
			reserveAmount
		});
		if (capError) {
			return { data: null, error: capError };
		}
		symFromAmountWei = cappedAmount;
	}

	const symFromAmountStr = symFromAmountWei.toString();

	try {
		const toDecimals = getSymbiosisDecimals(hop.toAsset);
		const quote = await symbiosisService.getQuote({
			tokenAmountIn: {
				address: fromTokenAddr,
				chainId: fromChainId,
				symbol: hop.fromAsset,
				decimals: fromDecimals,
				amount: symFromAmountStr
			},
			tokenOut: {
				address: toTokenAddr,
				chainId: toChainId,
				symbol: hop.toAsset,
				decimals: toDecimals
			},
			from: symUserAddr,
			// For multi-hop: the hop's destination may differ from the final destination.
			// E.g. hop 1 of wBTC→rBTC sends tBTC to Arbitrum (user's ARB addr), not RSK.
			to: (() => {
				if (state.destination?.type !== 'address') return symUserAddr;
				const destChainId = state.destination.chainId;
				// If the destination chain matches the hop's target chain, use it directly
				if (destChainId === toChainId) return safeAddress(state.destination.address);
				// Otherwise use the user's address on the hop's target chain
				if (toChainId === CHAIN_ID_ARB)
					return safeAddress(get(walletStore).arb?.address) || symUserAddr;
				if (toChainId === CHAIN_ID_RSK)
					return safeAddress(get(walletStore).rsk.address) || symUserAddr;
				if (toChainId === CHAIN_ID_BSC)
					return safeAddress(get(walletStore).bsc.address) || symUserAddr;
				return symUserAddr;
			})(),
			slippage: 50
		});

		const tx = quote.tx;
		d.log(
			'[executeSymbiosisHop] quote: amountOut=%s fee=%s time=%s tx.to=%s tx.value=%s tx.dataLen=%d',
			quote.tokenAmountOut?.amount ?? 'null',
			quote.fee ?? 'null',
			quote.estimatedTime ?? 'null',
			tx?.to ?? 'null',
			tx?.value ?? '0',
			tx?.data?.length ?? 0
		);
		if (!tx?.data) {
			return { data: null, error: new Error('Symbiosis returned no calldata for execution') };
		}

		// Build approval as extraCalls (batched with swap in single UserOp).
		// For ERC-20 source tokens, approve the Symbiosis metaRouterGateway to spend.
		// Native tokens (RBTC, BTC) don't need approval.
		const extraCalls: Array<{ to: string; data: string; value: bigint }> = [];
		if (fromTokenAddr !== NATIVE_TOKEN) {
			// Per Symbiosis docs: "Always approve users' ERC20 tokens for only one
			// contract — the metaRouterGateway." The API returns `approveTo` which
			// is the metaRouterGateway. `tx.to` is the MetaRouter (different contract).
			// Using tx.to causes the MetaRouter's transferFrom to fail because the
			// Gateway (which calls transferFrom) isn't the approved spender.
			const approveTarget = quote.approveTo || tx.to;
			d.log(
				'[executeSymbiosisHop] Batching approval: token=%s approveTo=%s (quote.approveTo=%s, tx.to=%s)',
				fromTokenAddr.substring(0, 10),
				approveTarget,
				quote.approveTo ?? 'null',
				tx.to
			);

			const approveCalldata = encodeERC20Approve(approveTarget, MAX_UINT256);
			extraCalls.push({ to: fromTokenAddr, data: approveCalldata, value: 0n });
		}

		// Submit approve + swap as a single batched UserOp via extraCalls.
		// sendEvmTransaction handles connected-wallet vs built-in wallet branching AND
		// verifies the on-chain receipt, catching reverts that raw tx submission misses.
		//
		// IMPORTANT: Do NOT hardcode gasLimit for Arbitrum. Arbitrum's eth_estimateGas
		// includes L1 calldata cost, which inflates the estimate to ~50M for
		// MetaRouterGateway swaps (3KB calldata). Using GAS_LIMIT_ARB_SWAP (500k)
		// causes gas exhaustion. Let ethers.js estimate dynamically.
		const { data: txHash, error: swapTxError } = await sendEvmTransaction({
			to: tx.to,
			data: tx.data,
			value: tx.value || '0',
			chain: symChain,
			sourceConnectedWalletId: state.sourceConnectedWalletId,
			extraCalls: extraCalls.length > 0 ? extraCalls : undefined
		});
		if (swapTxError || !txHash) {
			d.log('[executeSymbiosisHop] swap tx FAILED: %s', swapTxError?.message ?? 'no tx hash');
			return {
				data: null,
				error: new Error(`Symbiosis swap tx failed: ${swapTxError?.message ?? 'no tx hash'}`)
			};
		}
		d.log('executeSymbiosisHop: tx submitted hash=%s', txHash.substring(0, 16));

		// For same-chain swaps (e.g., wBTC→tBTC both on Arbitrum), the swap is
		// atomic — a DEX aggregator swap in a single tx. No relayer involved.
		// For cross-chain swaps, poll for the Symbiosis relayer delivery.
		if (fromChainId === toChainId) {
			d.log('[executeSymbiosisHop] same-chain swap — skipping relayer poll');
			d.log('executeSymbiosisHop: same-chain swap (chainId=%d) — no relayer needed', fromChainId);
		} else {
			d.log('[executeSymbiosisHop] cross-chain swap, polling for relayer delivery...');
			const { data: swapStatus, error: pollError } = await pollSymbiosisStatus(txHash, fromChainId);
			if (pollError) {
				d.error('executeSymbiosisHop: relayer poll failed: %s', pollError.message);
				return { data: null, error: pollError };
			}
			d.log('[executeSymbiosisHop] relayer delivery confirmed: %s', swapStatus?.status.text);
		}
		return { data: txHash, error: null };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Symbiosis execution failed';
		d.error('executeSymbiosisHop FAILED: %s', message);
		Sentry.captureException(err, {
			tags: { component: 'swap-chain', executor: 'symbiosis' },
			extra: { hopFrom: hop.fromAsset, hopTo: hop.toAsset, amount: state.amount }
		});
		return { data: null, error: new Error(message) };
	}
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

/**
 * Poll Symbiosis swap status until the relayer delivers on the destination chain.
 */
async function pollSymbiosisStatus(
	txHash: string,
	chainId: number
): Promise<{ data: SymbiosisSwapStatusResponse | null; error: Error | null }> {
	const startTime = Date.now();

	while (Date.now() - startTime < SYMBIOSIS_MAX_WAIT_MS) {
		const { data: status, error } = await tryCatch(symbiosisService.getSwapStatus(txHash, chainId));

		if (error) {
			d.warn('Symbiosis poll error: %s', error.message);
			await sleep(SYMBIOSIS_POLL_INTERVAL_MS);
			continue;
		}

		if (!status) {
			await sleep(SYMBIOSIS_POLL_INTERVAL_MS);
			continue;
		}

		// Success — relayer delivered
		if (status.status.code === 0) {
			return { data: status, error: null };
		}

		// Terminal failure
		if (status.status.code < 0) {
			return {
				data: null,
				error: new Error(`Symbiosis swap failed: ${status.status.text}`)
			};
		}

		// Non-terminal — still pending
		const elapsed = Math.round((Date.now() - startTime) / 1000);
		d.log(
			'[pollSymbiosis] code=%d text=%s elapsed=%ds',
			status.status.code,
			status.status.text,
			elapsed
		);
		await sleep(SYMBIOSIS_POLL_INTERVAL_MS);
	}

	return { data: null, error: new Error('Symbiosis swap timed out') };
}
