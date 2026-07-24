/**
 * Swap Chain — Shared Executor Helpers
 *
 * Common patterns extracted from individual executor implementations:
 * - ERC-20 approve + send (used by LI.FI, Symbiosis, Uniswap V3)
 * - Balance cap to on-chain max (used by Symbiosis, Uniswap V3)
 */

import { createDebug } from '$lib/utils/debug';
import { encodeERC20Approve } from '../abi';
import { sendEvmTransaction, queryERC20Balance } from '../tx-helpers';

const d = createDebug('swap-chain');

// ---------------------------------------------------------------------------
// ERC-20 Approve
// ---------------------------------------------------------------------------

/** Max uint256 — infinite approval. */
const MAX_UINT256 = (1n << 256n) - 1n;

/**
 * Approve an ERC-20 token for a spender via `sendEvmTransaction`.
 *
 * Handles both infinite approval (LI.FI, Symbiosis) and exact-amount
 * approval (Uniswap V3) via the optional `approveAmount` parameter.
 *
 * Callers must check `tokenAddress !== NATIVE_TOKEN` before calling —
 * native tokens don't need approval.
 *
 * @returns The approve transaction hash on success.
 */
export async function approveErc20Token(params: {
	tokenAddress: string;
	spenderAddress: string;
	approveAmount?: bigint;
	chain: 'arbitrum' | 'rsk' | 'bsc';
	sourceConnectedWalletId: string | null | undefined;
	label: string;
}): Promise<{ data: string | null; error: Error | null }> {
	const {
		tokenAddress,
		spenderAddress,
		approveAmount = MAX_UINT256,
		chain,
		sourceConnectedWalletId,
		label
	} = params;

	const approveCalldata = encodeERC20Approve(spenderAddress, approveAmount);
	d.log(
		'[%s] Approving %s for spender %s (amount=%s)',
		label,
		tokenAddress.substring(0, 10),
		spenderAddress.substring(0, 10),
		approveAmount === MAX_UINT256 ? 'max' : approveAmount.toString()
	);

	const { data: approveTxHash, error: approveError } = await sendEvmTransaction({
		to: tokenAddress,
		data: approveCalldata,
		value: 0n,
		chain,
		sourceConnectedWalletId
	});

	if (approveError) {
		d.log('[%s] APPROVE FAILED: %s', label, approveError.message);
		return { data: null, error: new Error(`${label} approve failed: ${approveError.message}`) };
	}

	d.log('[%s] approve confirmed: %s', label, approveTxHash?.substring(0, 16));
	return { data: approveTxHash, error: null };
}

// ---------------------------------------------------------------------------
// Balance Cap
// ---------------------------------------------------------------------------

/**
 * Cap a requested ERC-20 amount to the actual on-chain balance minus any
 * reserved amount (e.g., relay fee buffer that will be deducted in the same
 * executeBatch).
 *
 * In multi-hop routes (e.g., Boltz → Symbiosis), the intermediate token
 * balance may be less than `requestedAmount` due to fees or partial fills.
 * Using the raw amount would cause `transferFrom` to revert.
 *
 * When the swap input token is also used for gasless fee payment, the
 * executeBatch includes both the swap (pulling `amountIn`) and a fee
 * transfer (pulling `feeBuffer`). The swap amount must be capped to
 * `balance - feeBuffer` to ensure both calls succeed.
 *
 * Callers must check `tokenAddress !== NATIVE_TOKEN` before calling —
 * native token balances are not queried via ERC-20 `balanceOf`.
 *
 * @returns The capped (or original) amount. `error` is non-null on RPC failure.
 */
export async function capBalanceToWalletMax(params: {
	tokenAddress: string;
	userAddress: string;
	chain: 'arbitrum' | 'rsk' | 'bsc';
	requestedAmount: bigint;
	label: string;
	/** Amount to reserve from the balance (e.g., relay fee buffer). */
	reserveAmount?: bigint;
}): Promise<{ data: bigint; error: Error | null }> {
	const { tokenAddress, userAddress, chain, requestedAmount, label, reserveAmount } = params;

	const actualBalance = await queryERC20Balance(tokenAddress, userAddress, chain);
	if (actualBalance === null) {
		return { data: requestedAmount, error: new Error('Failed to query token balance (RPC error)') };
	}

	const reserve = reserveAmount ?? 0n;
	const available = actualBalance > reserve ? actualBalance - reserve : 0n;

	if (available <= 0n) {
		d.log(
			'[%s] Balance too low after reserve: balance=%s reserve=%s available=%s',
			label,
			actualBalance.toString(),
			reserve.toString(),
			available.toString()
		);
		return { data: 0n, error: new Error(`Insufficient balance: have ${actualBalance}, reserve ${reserve}`) };
	}

	if (available < requestedAmount) {
		d.log(
			'[%s] Capping amount: available=%s wei < requested=%s wei (balance=%s reserve=%s)',
			label,
			available.toString(),
			requestedAmount.toString(),
			actualBalance.toString(),
			reserve.toString()
		);
		return { data: available, error: null };
	}

	return { data: requestedAmount, error: null };
}
