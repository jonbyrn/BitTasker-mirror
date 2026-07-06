/**
 * Swap Chain — LI.FI Hop Executor
 *
 * Executes a LI.FI cross-chain swap hop. LI.FI handles bridging + swapping
 * atomically — the user sends funds to the LI.FI contract with encoded
 * calldata, and LI.FI completes the swap on the destination chain.
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
	GAS_LIMIT_ARB_SWAP,
	resolveChainId,
	resolveTokenAddress,
	LIFI_ASSET_DECIMALS
} from '../utils';
import { safeAddress, type SwapChainState } from '../state';
import { sendEvmTransaction } from '../tx-helpers';
import { approveErc20Token } from './helpers';

const d = createDebug('swap-chain');

// ---------------------------------------------------------------------------
// LI.FI hop
// ---------------------------------------------------------------------------

/**
 * Execute a LI.FI cross-chain swap hop.
 *
 * Flow:
 *   1. Resolve chain IDs, token addresses, and user address
 *   2. Request step transaction from LI.FI API
 *   3. Approve ERC-20 source token (if not native)
 *   4. Submit swap transaction via `sendEvmTransaction`
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
	const fromAmountWei = parseDecimalToSmallestUnit(state.amount!, decimals).toString();

	try {
		d.log(
			'[executeLifiHop] requesting LI.FI step tx: from=%s→%s amount=%s',
			hop.fromAsset,
			hop.toAsset,
			fromAmountWei
		);
		const txReq = await lifiService.getStepTransaction({
			fromChain: fromChainId,
			toChain: toChainId,
			fromToken: fromTokenAddr,
			toToken: toTokenAddr,
			fromAmount: fromAmountWei,
			fromAddress: userAddr
		});
		d.log(
			'[executeLifiHop] step tx received: to=%s dataLen=%d value=%s',
			txReq.to?.substring(0, 10) ?? 'null',
			txReq.data?.length ?? 0,
			txReq.value ?? '0'
		);

		// All paths route through sendEvmTransaction which verifies on-chain receipt.
		// Previously, raw tx submission (sendArbitrumTransaction, evmSigner.sendTransaction)
		// returned the tx hash without checking if the tx actually succeeded on-chain.
		// This caused reverts to be silently treated as success — loss of funds.
		const txValue = txReq.value ? BigInt(txReq.value) : 0n;
		const chain: 'arbitrum' | 'rsk' | 'bsc' =
			fromChainId === CHAIN_ID_ARB ? 'arbitrum' : fromChainId === CHAIN_ID_RSK ? 'rsk' : 'bsc';

		// For ERC-20 source tokens, approve the LI.FI router to spend before the swap.
		// Native tokens (RBTC, ETH) don't need approval.
		if (fromTokenAddr !== NATIVE_TOKEN) {
			const { error: approveError } = await approveErc20Token({
				tokenAddress: fromTokenAddr,
				spenderAddress: txReq.to,
				chain,
				sourceConnectedWalletId: state.sourceConnectedWalletId,
				label: 'LI.FI'
			});

			if (approveError) {
				return { data: null, error: approveError };
			}
		}

		d.log('[executeLifiHop] submitting swap tx: chain=%s to=%s', chain, txReq.to?.substring(0, 10));

		const { data: txHash, error: txError } = await sendEvmTransaction({
			to: txReq.to,
			data: txReq.data,
			value: txValue,
			chain,
			gasLimit: fromChainId === CHAIN_ID_ARB ? GAS_LIMIT_ARB_SWAP : undefined,
			sourceConnectedWalletId: state.sourceConnectedWalletId
		});

		if (txError || !txHash) {
			d.log('[executeLifiHop] SWAP FAILED: %s', txError?.message ?? 'no tx hash');
			return { data: null, error: txError ?? new Error('LI.FI tx failed: no tx hash') };
		}

		d.log('[executeLifiHop] SWAP CONFIRMED: %s', txHash.substring(0, 16));
		return { data: txHash, error: null };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'LI.FI execution failed';
		d.error('[executeLifiHop] FAILED: %s', message);
		Sentry.captureException(err, {
			tags: { component: 'swap-chain', executor: 'lifi' },
			extra: { hopFrom: hop.fromAsset, hopTo: hop.toAsset, amount: state.amount }
		});
		return { data: null, error: new Error(message) };
	}
}
