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
import {
	walletStore,
	sendRBTC,
	sendBSCUSDT,
	sendRawTransaction,
	sendArbitrumTransaction
} from '$lib/stores/wallet.store';
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
	GAS_LIMIT_ARB_SWAP,
	CHANGELLY_MAX_WAIT_MS,
	resolveChainId,
	resolveTokenAddress,
	LIFI_ASSET_DECIMALS,
	SYMBIOSIS_ASSET_DECIMALS
} from './utils';
import { executeBoltzHop } from './boltz';
import { safeAddress, type SwapChainState, sleep } from './state';
import { sendConnectedWalletArbitrumTx, resolveUserAddress } from './tx-helpers';

const d = createDebug('swap-chain');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How often to poll for Changelly swap completion (ms). */
const CHANGELLY_POLL_INTERVAL_MS = 5000;

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
			return executeBoltzHop(hop, state);
		case 'lifi':
			return executeLifiHop(hop, state);
		case 'symbiosis':
			return executeSymbiosisHop(hop, state);
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
	const decimals = LIFI_ASSET_DECIMALS[hop.fromAsset] ?? 18;
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
		const txReq = await lifiService.getStepTransaction({
			fromChain: fromChainId,
			toChain: toChainId,
			fromToken: fromTokenAddr,
			toToken: toTokenAddr,
			fromAmount: fromAmountWei,
			fromAddress: userAddr
		});
		d.log(
			'executeLifiHop: step tx received: to=%s dataLen=%d value=%s',
			txReq.to?.substring(0, 10) ?? 'null',
			txReq.data?.length ?? 0,
			txReq.value ?? '0'
		);

		// Connected wallet path: sign via evmSigner
		if (state.sourceConnectedWalletId) {
			const evmSigner = getEvmSigner(state.sourceConnectedWalletId);
			if (!evmSigner) {
				return {
					data: null,
					error: new Error('Connected wallet EVM signer not available for LI.FI')
				};
			}

			d.log(
				'executeLifiHop: submitting via connected wallet %s (chainId=%d)',
				state.sourceConnectedWalletId,
				fromChainId
			);

			// Use gasless relay for Arbitrum transactions
			if (fromChainId === CHAIN_ID_ARB) {
				const txHash = await sendConnectedWalletArbitrumTx(
					evmSigner,
					txReq.to,
					txReq.data,
					txReq.value
				);
				d.log('executeLifiHop: gasless tx hash=%s', txHash.substring(0, 16));
				return { data: txHash, error: null };
			}

			const txValue = txReq.value ? BigInt(txReq.value) : undefined;
			const result = await evmSigner.sendTransaction({
				to: txReq.to,
				data: txReq.data,
				value: txValue,
				chainId: fromChainId
			});
			d.log('executeLifiHop: direct tx hash=%s', result.txHash.substring(0, 16));
			return { data: result.txHash, error: null };
		}

		// Built-in wallet path
		const txHash =
			fromChainId === CHAIN_ID_ARB
				? await sendArbitrumTransaction({
						to: txReq.to,
						data: txReq.data,
						value: txReq.value,
						gasLimit: GAS_LIMIT_ARB_SWAP
					})
				: await sendRawTransaction({ to: txReq.to, data: txReq.data, value: txReq.value });
		return { data: txHash, error: null };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'LI.FI execution failed';
		d.error('[executeLifiHop] FAILED: %s', message);
		Sentry.captureException(err, {
			tags: { component: 'swap-chain', executor: 'lifi' },
			data: { hopFrom: hop.fromAsset, hopTo: hop.toAsset, amount: state.amount }
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
	const symUserAddr = state.sourceConnectedWalletId
		? safeAddress(getHandle(state.sourceConnectedWalletId)?.address)
		: safeAddress(
				hop.fromChain === 'rsk'
					? ws.rsk.address
					: hop.fromChain === 'arbitrum'
						? ws.arb?.address || ws.rsk.address
						: ws.bsc.address
			);

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
	const fromDecimals = SYMBIOSIS_ASSET_DECIMALS[hop.fromAsset] ?? 18;
	const symFromAmountWei = parseDecimalToSmallestUnit(state.amount!, fromDecimals).toString();

	try {
		const toDecimals = SYMBIOSIS_ASSET_DECIMALS[hop.toAsset] ?? 18;
		const quote = await symbiosisService.getQuote({
			tokenAmountIn: {
				address: fromTokenAddr,
				chainId: fromChainId,
				symbol: hop.fromAsset,
				decimals: fromDecimals,
				amount: symFromAmountWei
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
		if (!tx?.data) {
			return { data: null, error: new Error('Symbiosis returned no calldata for execution') };
		}

		// Submit the Symbiosis transaction with the exact tx data from the API
		let txHash: string;
		if (state.sourceConnectedWalletId) {
			const evmSigner = getEvmSigner(state.sourceConnectedWalletId);
			if (!evmSigner) {
				return {
					data: null,
					error: new Error('Connected wallet EVM signer not available for Symbiosis')
				};
			}

			// Use gasless relay for Arbitrum transactions
			if (fromChainId === CHAIN_ID_ARB) {
				txHash = await sendConnectedWalletArbitrumTx(evmSigner, tx.to, tx.data, tx.value);
			} else {
				const txValue = tx.value ? BigInt(tx.value) : undefined;
				const result = await evmSigner.sendTransaction({
					to: tx.to,
					data: tx.data,
					value: txValue,
					chainId: fromChainId
				});
				txHash = result.txHash;
			}
		} else {
			// Built-in wallet path: use sendArbitrumTransaction for Arbitrum chains (tries gasless first)
			if (fromChainId === CHAIN_ID_ARB) {
				txHash = await sendArbitrumTransaction({
					to: tx.to,
					data: tx.data,
					value: tx.value || '0',
					gasLimit: GAS_LIMIT_ARB_SWAP
				});
			} else {
				txHash = await sendRawTransaction({
					to: tx.to,
					data: tx.data,
					value: tx.value
				});
			}
		}
		d.log('executeSymbiosisHop: tx submitted hash=%s', txHash.substring(0, 16));
		return { data: txHash, error: null };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Symbiosis execution failed';
		d.error('executeSymbiosisHop FAILED: %s', message);
		Sentry.captureException(err, {
			tags: { component: 'swap-chain', executor: 'symbiosis' },
			data: { hopFrom: hop.fromAsset, hopTo: hop.toAsset, amount: state.amount }
		});
		return { data: null, error: new Error(message) };
	}
}
