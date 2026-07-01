/**
 * Swap Chain — Hop Executors
 *
 * Execute individual swap hops via various services (direct transfer,
 * Changelly, LI.FI, Symbiosis). Each hop function handles connected-wallet
 * vs built-in wallet branching internally.
 */

import { get } from 'svelte/store';
import * as Sentry from '@sentry/sveltekit';
import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import { changellyService } from '$lib/services/changelly.service';
import { lifiService } from '$lib/services/lifi.service';
import { symbiosisService } from '$lib/services/symbiosis.service';
import type { SymbiosisSwapStatusResponse } from '$lib/services/symbiosis.service';
import { walletStore, sendRBTC, sendBSCUSDT } from '$lib/stores/wallet.store';
import { getEvmSigner, getHandle } from '$lib/stores/connected-wallets.store';
import type { RouteHop } from '$lib/services/route-resolver';
import type { ChangellySwapStatus } from '$lib/services/changelly.service';
import type { EVMSigner, EVMTransactionRequest } from '$lib/services/external-wallet/types';
import {
	encodeERC20Transfer,
	getBSCUSDTContractAddress
} from '$lib/services/external-wallet/chain-utils';
import { parseDecimalToSmallestUnit } from '$lib/utils/amount-conversion';
import {
	CHAIN_ID_RSK,
	CHAIN_ID_ARB,
	CHAIN_ID_BSC,
	NATIVE_TOKEN,
	GAS_LIMIT_ARB_SWAP,
	CHANGELLY_MAX_WAIT_MS,
	resolveChainId,
	resolveTokenAddress,
	LIFI_ASSET_DECIMALS,
	getSymbiosisDecimals
} from './utils';
import { executeBoltzHop } from './boltz';
import { encodeERC20Approve, encodeUniswapV3ExactInputSingle } from './abi';
import { safeAddress, type SwapChainState, sleep } from './state';
import { resolveUserAddress, sendEvmTransaction, queryERC20Balance } from './tx-helpers';

const d = createDebug('swap-chain');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How often to poll for Changelly swap completion (ms). */
const CHANGELLY_POLL_INTERVAL_MS = 5000;

/** How often to poll for Symbiosis relayer delivery (ms). */
const SYMBIOSIS_POLL_INTERVAL_MS = 5000;

/** Maximum time to wait for Symbiosis relayer delivery (ms). */
const SYMBIOSIS_MAX_WAIT_MS = 600_000;

// ---------------------------------------------------------------------------
// Hop dispatcher
// ---------------------------------------------------------------------------

/**
 * Execute a single hop based on its service type.
 *
 * @param hop - The route hop to execute
 * @param state - Current swap chain state
 * @param hopIndex - Zero-based index of this hop in the route
 * @returns Transaction hash or service swap ID on success
 */
export async function executeHop(
	hop: RouteHop,
	state: SwapChainState,
	hopIndex: number
): Promise<{ data: string | null; error: Error | null }> {
	console.warn(
		'[executeHop] hop%d: service=%s from=%s/%s to=%s/%s connected=%s amount=%s',
		hopIndex,
		hop.service,
		hop.fromAsset,
		hop.fromChain,
		hop.toAsset,
		hop.toChain,
		state.sourceConnectedWalletId ?? 'builtin',
		state.amount
	);
	d.log(
		'executeHop[%d]: service=%s from=%s/%s to=%s/%s connected=%s',
		hopIndex,
		hop.service,
		hop.fromAsset,
		hop.fromChain,
		hop.toAsset,
		hop.toChain,
		state.sourceConnectedWalletId ?? 'builtin'
	);

	Sentry.addBreadcrumb({
		category: 'swap-chain.hop',
		message: `Executing hop ${hopIndex + 1}`,
		data: {
			service: hop.service,
			from: `${hop.fromAsset}/${hop.fromChain}`,
			to: `${hop.toAsset}/${hop.toChain}`
		}
	});

	// Dispatch based on service type
	switch (hop.service) {
		case 'direct':
			return executeDirectHop(hop, state);
		case 'changelly':
			return executeChangellyHop(hop, state, hopIndex);
		case 'boltz':
			console.warn('[executeHop] Dispatching to executeBoltzHop...');
			return executeBoltzHop(hop, state);
		case 'lifi':
			return executeLifiHop(hop, state);
		case 'symbiosis':
			console.warn('[executeHop] Dispatching to executeSymbiosisHop...');
			return executeSymbiosisHop(hop, state);
		case 'uniswap-v3':
			console.warn('[executeHop] Dispatching to executeUniswapV3Hop...');
			return executeUniswapV3Hop(hop, state);
		default:
			return {
				data: null,
				error: new Error(`Unknown hop service: ${hop.service}`)
			};
	}
}

// ---------------------------------------------------------------------------
// Direct hop
// ---------------------------------------------------------------------------

async function executeDirectHop(
	hop: RouteHop,
	state: SwapChainState
): Promise<{ data: string | null; error: Error | null }> {
	if (!state.destination || state.destination.type !== 'address') {
		return { data: null, error: new Error('Direct hop requires an address destination') };
	}

	const address = state.destination.address;
	const amount = state.amount;

	if (!amount) {
		return { data: null, error: new Error('Amount is required for direct transfer') };
	}

	// If source is a connected wallet, use its EVM signer instead of built-in wallet
	if (state.sourceConnectedWalletId) {
		const evmSigner = getEvmSigner(state.sourceConnectedWalletId);
		d.log('executeDirectHop: using connected wallet %s', state.sourceConnectedWalletId);
		if (!evmSigner) {
			return {
				data: null,
				error: new Error('Connected wallet EVM signer not available')
			};
		}

		if (hop.fromAsset === 'RBTC') {
			return executeConnectedWalletTransfer(evmSigner, address, amount);
		}

		if (hop.fromAsset === 'USDT') {
			// ERC-20 transfer via connected wallet on BSC (chain 56, 18 decimals)
			d.log('executeDirectHop: USDT ERC-20 transfer via connected wallet');
			const usdtContract = getBSCUSDTContractAddress();
			const amountWei = parseDecimalToSmallestUnit(amount, 18);
			return executeConnectedERC20Transfer(
				evmSigner,
				usdtContract,
				address,
				amountWei,
				CHAIN_ID_BSC
			);
		}

		return {
			data: null,
			error: new Error(`Unsupported asset for connected wallet transfer: ${hop.fromAsset}`)
		};
	}

	// Built-in wallet path
	if (hop.fromAsset === 'RBTC') {
		const { data: txHash, error } = await tryCatch(sendRBTC(address, amount));
		if (error !== null) {
			return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
		}
		return { data: txHash ?? null, error: null };
	}

	if (hop.fromAsset === 'USDT') {
		const { data: txHash, error } = await tryCatch(sendBSCUSDT(address, amount));
		if (error !== null) {
			return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
		}
		return { data: txHash ?? null, error: null };
	}

	return { data: null, error: new Error(`Unsupported asset for direct hop: ${hop.fromAsset}`) };
}

/**
 * Execute an rBTC transfer using a connected wallet's EVM signer.
 * Converts the amount from rBTC string → wei, builds the transaction,
 * and sends it via the connector handle.
 */
async function executeConnectedWalletTransfer(
	signer: EVMSigner,
	to: string,
	amount: string
): Promise<{ data: string | null; error: Error | null }> {
	try {
		const amountWei = parseDecimalToSmallestUnit(amount, 18);
		const tx: EVMTransactionRequest = {
			to,
			value: amountWei,
			chainId: CHAIN_ID_RSK,
			data: '0x'
		};
		const result = await signer.sendTransaction(tx);
		return { data: result.txHash, error: null };
	} catch (error) {
		return {
			data: null,
			error: error instanceof Error ? error : new Error(String(error))
		};
	}
}

/**
 * Execute an ERC-20 transfer via a connected wallet's EVM signer.
 * Encodes the standard `transfer(address,uint256)` calldata and sends it
 * to the token contract address.
 */
export async function executeConnectedERC20Transfer(
	signer: EVMSigner,
	tokenAddress: string,
	recipient: string,
	amount: bigint,
	chainId: number
): Promise<{ data: string | null; error: Error | null }> {
	try {
		const data = encodeERC20Transfer(recipient, amount);
		const result = await signer.sendTransaction({
			to: tokenAddress,
			data,
			chainId
		});
		return { data: result.txHash, error: null };
	} catch (error) {
		return {
			data: null,
			error: error instanceof Error ? error : new Error(String(error))
		};
	}
}

// ---------------------------------------------------------------------------
// Changelly hop
// ---------------------------------------------------------------------------

async function executeChangellyHop(
	hop: RouteHop,
	state: SwapChainState,
	hopIndex: number
): Promise<{ data: string | null; error: Error | null }> {
	if (!state.destination || state.destination.type !== 'address') {
		return { data: null, error: new Error('Changelly hop requires an address destination') };
	}

	const amount = state.amount;
	if (!amount) {
		return { data: null, error: new Error('Amount is required for Changelly swap') };
	}

	// Determine destination address based on hop position
	// Intermediate hops send to the user's own wallet; the last hop sends to
	// the user's specified destination address.
	const totalHops = state.route?.hops.length ?? 1;
	const isLastHop = hopIndex >= totalHops - 1;
	const destinationAddress = isLastHop
		? state.destination.address
		: resolveUserAddress(state, hop.toAsset);

	// Create the swap via Changelly
	const { data: swap, error: createError } = await tryCatch(
		changellyService.createSwap({
			from: hop.fromAsset,
			to: hop.toAsset,
			amount,
			address: destinationAddress
		})
	);

	if (createError !== null) {
		return {
			data: null,
			error: createError instanceof Error ? createError : new Error(String(createError))
		};
	}

	if (!swap || !swap.id) {
		return { data: null, error: new Error('Changelly swap creation returned no swap ID') };
	}

	// Poll for swap completion
	const { data: finalStatus, error: pollError } = await pollChangellySwap(swap.id);

	if (pollError !== null) {
		return { data: null, error: pollError };
	}

	if (finalStatus !== 'finished') {
		return {
			data: null,
			error: new Error(`Changelly swap ended with status: ${finalStatus}`)
		};
	}

	return { data: swap.id, error: null };
}

/**
 * Poll a Changelly swap until it reaches a terminal status.
 */
async function pollChangellySwap(
	swapId: string,
	maxWaitMs: number = CHANGELLY_MAX_WAIT_MS
): Promise<{ data: ChangellySwapStatus | null; error: Error | null }> {
	const startTime = Date.now();

	while (Date.now() - startTime < maxWaitMs) {
		const { data: swap, error: statusError } = await tryCatch(
			changellyService.getSwapStatus(swapId)
		);

		if (statusError !== null) {
			// Transient error — keep polling
			await sleep(CHANGELLY_POLL_INTERVAL_MS);
			continue;
		}

		if (swap === null) {
			await sleep(CHANGELLY_POLL_INTERVAL_MS);
			continue;
		}

		const status = swap.status;

		// Terminal success states
		if (status === 'finished') {
			return { data: status, error: null };
		}

		// Terminal failure states
		if (status === 'failed' || status === 'refunded') {
			return {
				data: status,
				error: new Error(`Changelly swap ${swapId} ended with status: ${status}`)
			};
		}

		// Non-terminal — keep waiting
		await sleep(CHANGELLY_POLL_INTERVAL_MS);
	}

	return {
		data: null,
		error: new Error(`Changelly swap ${swapId} did not complete within ${maxWaitMs}ms`)
	};
}

// ---------------------------------------------------------------------------
// LI.FI hop
// ---------------------------------------------------------------------------

/**
 * Execute a LI.FI cross-chain swap hop.
 *
 * LI.FI handles bridging + swapping atomically. The user sends funds
 * to the LI.FI contract with the encoded calldata. LI.FI completes
 * the swap on the destination chain.
 *
 * This is a single-hop execution — LI.FI manages everything internally.
 */
async function executeLifiHop(
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
			'executeLifiHop: requesting step tx: fromChain=%d toChain=%d fromToken=%s toToken=%s amount=%s',
			fromChainId,
			toChainId,
			fromTokenAddr.substring(0, 10),
			toTokenAddr.substring(0, 10),
			fromAmountWei
		);
		console.warn(
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
		console.warn(
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
			const approveAmount = (1n << 256n) - 1n; // max uint256
			const approveCalldata = encodeERC20Approve(txReq.to, approveAmount);
			console.warn(
				'[executeLifiHop] approving %s for LI.FI router %s',
				fromTokenAddr.substring(0, 10),
				txReq.to.substring(0, 10)
			);

			const { data: approveTxHash, error: approveError } = await sendEvmTransaction({
				to: fromTokenAddr,
				data: approveCalldata,
				value: 0n,
				chain,
				sourceConnectedWalletId: state.sourceConnectedWalletId
			});

			if (approveError) {
				console.warn('[executeLifiHop] APPROVE FAILED: %s', approveError.message);
				return { data: null, error: new Error(`LI.FI approve failed: ${approveError.message}`) };
			}
			console.warn('[executeLifiHop] approve confirmed: %s', approveTxHash?.substring(0, 16));
		}

		console.warn(
			'[executeLifiHop] submitting swap tx: chain=%s to=%s',
			chain,
			txReq.to?.substring(0, 10)
		);

		const { data: txHash, error: txError } = await sendEvmTransaction({
			to: txReq.to,
			data: txReq.data,
			value: txValue,
			chain,
			gasLimit: fromChainId === CHAIN_ID_ARB ? GAS_LIMIT_ARB_SWAP : undefined,
			sourceConnectedWalletId: state.sourceConnectedWalletId
		});

		if (txError || !txHash) {
			console.warn('[executeLifiHop] SWAP FAILED: %s', txError?.message ?? 'no tx hash');
			return { data: null, error: txError ?? new Error('LI.FI tx failed: no tx hash') };
		}

		console.warn('[executeLifiHop] SWAP CONFIRMED: %s', txHash.substring(0, 16));
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

// ---------------------------------------------------------------------------
// Symbiosis hop
// ---------------------------------------------------------------------------

/**
 * Execute a Symbiosis cross-chain swap hop.
 *
 * Symbiosis handles bridging + swapping atomically, similar to LI.FI.
 * The user sends funds to a Symbiosis deposit address.
 *
 * This is a single-hop execution — Symbiosis manages everything internally.
 */
async function executeSymbiosisHop(
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
	console.warn(
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
		console.warn(
			'[executeSymbiosisHop] builtinAddr EMPTY — ws.rsk.address=%s, ws.arb?.address=%s — calling getRSKAddress()',
			ws.rsk.address || 'EMPTY',
			ws.arb?.address || 'EMPTY'
		);
		const { getRSKAddress } = await import('$lib/stores/wallet.store');
		const rskAddr = await getRSKAddress();
		builtinAddr = safeAddress(rskAddr);
		console.warn(
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
	if (fromTokenAddr !== NATIVE_TOKEN) {
		const actualBalance = await queryERC20Balance(fromTokenAddr, symUserAddr, symChain);
		if (actualBalance === null) {
			return { data: null, error: new Error('Failed to query token balance (RPC error)') };
		}
		if (actualBalance > 0n && actualBalance < symFromAmountWei) {
			console.warn(
				'[executeSymbiosisHop] Capping amount: actual=%s wei < requested=%s wei (diff=%s)',
				actualBalance.toString(),
				symFromAmountWei.toString(),
				(symFromAmountWei - actualBalance).toString()
			);
			symFromAmountWei = actualBalance;
		}
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
		console.warn(
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

		// For ERC-20 source tokens, approve the Symbiosis metaRouterGateway to spend.
		// Native tokens (RBTC, BTC) don't need approval.
		if (fromTokenAddr !== NATIVE_TOKEN) {
			// Per Symbiosis docs: "Always approve users' ERC20 tokens for only one
			// contract — the metaRouterGateway." The API returns `approveTo` which
			// is the metaRouterGateway. `tx.to` is the MetaRouter (different contract).
			// Using tx.to causes the MetaRouter's transferFrom to fail because the
			// Gateway (which calls transferFrom) isn't the approved spender.
			const approveTarget = quote.approveTo || tx.to;
			const approveAmount = (1n << 256n) - 1n;
			const approveCalldata = encodeERC20Approve(approveTarget, approveAmount);
			console.warn(
				'[executeSymbiosisHop] Approving %s for approveTo=%s (quote.approveTo=%s, tx.to=%s)',
				fromTokenAddr.slice(0, 10),
				approveTarget,
				quote.approveTo ?? 'null',
				tx.to
			);
			const { data: approveTxHash, error: approveError } = await sendEvmTransaction({
				to: fromTokenAddr,
				data: approveCalldata,
				value: 0n,
				chain: hop.fromChain === 'arbitrum' ? 'arbitrum' : hop.fromChain === 'rsk' ? 'rsk' : 'bsc',
				sourceConnectedWalletId: state.sourceConnectedWalletId
			});
			console.warn(
				'[executeSymbiosisHop] approve result: tx=%s error=%s',
				approveTxHash ?? 'null',
				approveError?.message ?? 'none'
			);
			if (approveError)
				return {
					data: null,
					error: new Error(`Symbiosis approve failed: ${approveError.message}`)
				};
		}

		// Submit the Symbiosis transaction via sendEvmTransaction for receipt verification.
		// sendEvmTransaction handles connected-wallet vs built-in wallet branching AND
		// verifies the on-chain receipt, catching reverts that raw tx submission misses.
		const { data: txHash, error: swapTxError } = await sendEvmTransaction({
			to: tx.to,
			data: tx.data,
			value: tx.value || '0',
			chain: symChain,
			gasLimit: fromChainId === CHAIN_ID_ARB ? GAS_LIMIT_ARB_SWAP : undefined,
			sourceConnectedWalletId: state.sourceConnectedWalletId
		});
		if (swapTxError || !txHash) {
			console.warn(
				'[executeSymbiosisHop] swap tx FAILED: %s',
				swapTxError?.message ?? 'no tx hash'
			);
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
			console.warn('[executeSymbiosisHop] same-chain swap — skipping relayer poll');
			d.log('executeSymbiosisHop: same-chain swap (chainId=%d) — no relayer needed', fromChainId);
		} else {
			console.warn('[executeSymbiosisHop] cross-chain swap, polling for relayer delivery...');
			const { data: swapStatus, error: pollError } = await pollSymbiosisStatus(txHash, fromChainId);
			if (pollError) {
				d.error('executeSymbiosisHop: relayer poll failed: %s', pollError.message);
				return { data: null, error: pollError };
			}
			console.warn('[executeSymbiosisHop] relayer delivery confirmed: %s', swapStatus?.status.text);
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
// Uniswap V3 hop
// ---------------------------------------------------------------------------

/** Uniswap V3 SwapRouter02 on Arbitrum */
const UNISWAP_V3_ROUTER_ARB = '0xE592427A0AEce92De3Edee1F18E0157C05861564';

/** Known pool fee tiers (must match uniswap-v3.provider.ts KNOWN_POOLS) */
const UNISWAP_V3_FEE_TIERS: Record<string, number> = {
	'0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40:0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f': 500,
	'0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f:0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9': 500
};

/**
 * Execute a Uniswap V3 same-chain swap on Arbitrum.
 *
 * Used as hop 2 in Boltz 2-hop routes when LI.FI is unavailable (e.g.,
 * tBTC→WBTC where LI.FI returns 400/404 but the on-chain V3 pool has liquidity).
 *
 * Flow:
 *   1. Approve source token for SwapRouter
 *   2. Call exactInputSingle on SwapRouter
 */
async function executeUniswapV3Hop(
	hop: RouteHop,
	state: SwapChainState
): Promise<{ data: string | null; error: Error | null }> {
	if (!state.destination || state.destination.type !== 'address') {
		return { data: null, error: new Error('Uniswap V3 hop requires an address destination') };
	}

	const fromChainId = resolveChainId(hop.fromChain);
	const toChainId = resolveChainId(hop.toChain);

	if (fromChainId !== CHAIN_ID_ARB || toChainId !== CHAIN_ID_ARB) {
		return {
			data: null,
			error: new Error('Uniswap V3 hop only supports Arbitrum same-chain swaps')
		};
	}

	const fromTokenAddr = resolveTokenAddress(hop.fromAsset, fromChainId);
	const toTokenAddr = resolveTokenAddress(hop.toAsset, toChainId);

	const poolKey = `${fromTokenAddr}:${toTokenAddr}`;
	const poolKeyReverse = `${toTokenAddr}:${fromTokenAddr}`;
	const feeTier = UNISWAP_V3_FEE_TIERS[poolKey] ?? UNISWAP_V3_FEE_TIERS[poolKeyReverse];
	if (!feeTier) {
		return {
			data: null,
			error: new Error(`No known Uniswap V3 pool for ${hop.fromAsset}→${hop.toAsset}`)
		};
	}

	d.log(
		'executeUniswapV3Hop: %s → %s (%s, fee tier %d)',
		hop.fromAsset,
		hop.toAsset,
		state.amount,
		feeTier
	);

	const userAddr = state.sourceConnectedWalletId
		? safeAddress(getHandle(state.sourceConnectedWalletId)?.address)
		: safeAddress(get(walletStore).arb?.address || get(walletStore).rsk.address);

	if (!userAddr) {
		return { data: null, error: new Error('No wallet address for Uniswap V3 swap') };
	}

	try {
		const decimals = LIFI_ASSET_DECIMALS[hop.fromAsset.toUpperCase()] ?? 18;
		let amountIn = parseDecimalToSmallestUnit(state.amount!, decimals);

		// Cap at actual on-chain balance for ERC-20 tokens
		if (fromTokenAddr !== NATIVE_TOKEN) {
			const actualBalance = await queryERC20Balance(fromTokenAddr, userAddr, 'arbitrum');
			if (actualBalance === null) {
				return { data: null, error: new Error('Failed to query token balance (RPC error)') };
			}
			if (actualBalance > 0n && actualBalance < amountIn) {
				console.warn(
					'[executeUniswapV3Hop] Capping amount: actual=%s < requested=%s',
					actualBalance.toString(),
					amountIn.toString()
				);
				amountIn = actualBalance;
			}
		}

		if (amountIn <= 0n) {
			return {
				data: null,
				error: new Error(`Insufficient ${hop.fromAsset} balance for Uniswap V3 swap`)
			};
		}

		// Step 1: Approve source token for SwapRouter
		if (fromTokenAddr !== NATIVE_TOKEN) {
			const approveCalldata = encodeERC20Approve(UNISWAP_V3_ROUTER_ARB, amountIn);
			d.log('executeUniswapV3Hop: approving %s for SwapRouter', hop.fromAsset);
			const { data: approveTxHash, error: approveError } = await sendEvmTransaction({
				to: fromTokenAddr,
				data: approveCalldata,
				value: 0n,
				chain: 'arbitrum',
				sourceConnectedWalletId: state.sourceConnectedWalletId
			});
			if (approveError) {
				return {
					data: null,
					error: new Error(`Uniswap V3 approve failed: ${approveError.message}`)
				};
			}
			d.log('executeUniswapV3Hop: approve confirmed: %s', approveTxHash?.substring(0, 16));
		}

		// Step 2: Call exactInputSingle
		const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 min deadline
		const swapCalldata = encodeUniswapV3ExactInputSingle(
			fromTokenAddr,
			toTokenAddr,
			feeTier,
			userAddr,
			deadline,
			amountIn,
			1n // amountOutMinimum = 1 (accept any output; slippage handled by route quote)
		);

		d.log('executeUniswapV3Hop: submitting swap via sendEvmTransaction');
		const { data: txHash, error: swapError } = await sendEvmTransaction({
			to: UNISWAP_V3_ROUTER_ARB,
			data: swapCalldata,
			value: 0n,
			chain: 'arbitrum',
			gasLimit: GAS_LIMIT_ARB_SWAP,
			sourceConnectedWalletId: state.sourceConnectedWalletId
		});

		if (swapError || !txHash) {
			return { data: null, error: swapError ?? new Error('Uniswap V3 swap failed: no tx hash') };
		}

		d.log('executeUniswapV3Hop: swap confirmed: %s', txHash.substring(0, 16));
		return { data: txHash, error: null };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Uniswap V3 execution failed';
		d.error('executeUniswapV3Hop FAILED: %s', message);
		Sentry.captureException(err, {
			tags: { component: 'swap-chain', executor: 'uniswap-v3' },
			extra: { hopFrom: hop.fromAsset, hopTo: hop.toAsset, amount: state.amount }
		});
		return { data: null, error: new Error(message) };
	}
}

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
		console.warn(
			'[pollSymbiosis] code=%d text=%s elapsed=%ds',
			status.status.code,
			status.status.text,
			elapsed
		);
		await sleep(SYMBIOSIS_POLL_INTERVAL_MS);
	}

	return { data: null, error: new Error('Symbiosis swap timed out') };
}
