/**
 * Swap Chain Orchestrator
 *
 * State machine for executing multi-hop swaps sequentially across different
 * swap services. Supports app-kill resilience via Capacitor Preferences
 * persistence — the chain can be resumed after interruption.
 *
 * States:
 *   IDLE -> SWAP_1_PENDING -> SWAP_1_CONFIRMED -> SWAP_2_PENDING ->
 *   SWAP_2_CONFIRMED -> COMPLETE
 *
 * Failure paths:
 *   - Hop 1 fails:                  IDLE/SWAP_1_PENDING -> FAILED
 *   - Hop 2 fails (1 already done): SWAP_2_PENDING -> PARTIAL
 *
 * @see requirements/usdt-integration-plan.md §Swap chain
 */

import { get } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
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
	createSubmarineSwap,
	lockSubmarineSwapFunds,
	createChainSwap
} from '$lib/stores/wallet.store';
import { getEvmSigner } from '$lib/stores/connected-wallets.store';
import type { Route, RouteHop, SourceWallet, Destination } from '$lib/services/route-resolver';
import type { ChangellySwapStatus } from '$lib/services/changelly.service';
import type { EVMTransactionRequest } from '$lib/services/external-wallet/types';

const d = createDebug('swap-chain');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Capacitor Preferences storage key. */
const STORAGE_KEY = 'bittasker_swap_chain';

/** How often to poll for Changelly swap completion (ms). */
const CHANGELLY_POLL_INTERVAL_MS = 5000;

/** Max time to wait for a Changelly swap (ms). */
const CHANGELLY_MAX_WAIT_MS = 600000;

// ---------------------------------------------------------------------------
// State machine types
// ---------------------------------------------------------------------------

export type SwapChainPhase =
	| 'IDLE'
	| 'SWAP_1_PENDING'
	| 'SWAP_1_CONFIRMED'
	| 'SWAP_2_PENDING'
	| 'SWAP_2_CONFIRMED'
	| 'COMPLETE'
	| 'FAILED'
	| 'PARTIAL';

/**
 * Terminal phases — once reached the chain will not advance further without
 * explicit user action.
 */
export type TerminalSwapChainPhase = 'IDLE' | 'COMPLETE' | 'FAILED' | 'PARTIAL';

/**
 * Persisted swap chain state.
 * Stored in Capacitor Preferences for app-kill resilience.
 */
export interface SwapChainState {
	/** Current phase of the state machine. */
	phase: SwapChainPhase;

	/** The route being executed. */
	route: Route | null;

	/** Source wallet identifier. */
	sourceWallet: SourceWallet | null;

	/** Destination the funds are being sent to. */
	destination: Destination | null;

	/** Connected wallet ID when source is external (null = built-in BitTasker wallet). */
	sourceConnectedWalletId: string | null;

	/** Amount being swapped/sent (decimal string). */
	amount: string | null;

	/** Transaction hash or service swap ID for hop 1. */
	swap1Id: string | null;

	/** Transaction hash or service swap ID for hop 2 (multi-hop only). */
	swap2Id: string | null;

	/** Details payload for hop 1 (service-specific). */
	swap1Details: Record<string, unknown> | null;

	/** Details payload for hop 2 (service-specific). */
	swap2Details: Record<string, unknown> | null;

	/** Error message when phase is FAILED or PARTIAL. */
	error: string | null;

	/** Last update timestamp (epoch ms). */
	updatedAt: number;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export const INITIAL_SWAP_CHAIN_STATE: SwapChainState = {
	phase: 'IDLE',
	route: null,
	sourceWallet: null,
	destination: null,
	sourceConnectedWalletId: null,
	amount: null,
	swap1Id: null,
	swap2Id: null,
	swap1Details: null,
	swap2Details: null,
	error: null,
	updatedAt: 0
};

// ---------------------------------------------------------------------------
// Phase transition validation
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<SwapChainPhase, SwapChainPhase[]> = {
	IDLE: ['SWAP_1_PENDING'],
	SWAP_1_PENDING: ['SWAP_1_CONFIRMED', 'FAILED'],
	SWAP_1_CONFIRMED: ['SWAP_2_PENDING', 'COMPLETE', 'FAILED'],
	SWAP_2_PENDING: ['SWAP_2_CONFIRMED', 'FAILED', 'PARTIAL'],
	SWAP_2_CONFIRMED: ['COMPLETE', 'FAILED'],
	COMPLETE: [],
	FAILED: [],
	PARTIAL: []
};

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

/**
 * Load persisted swap chain state from Capacitor Preferences.
 *
 * @returns The stored state, or `INITIAL_SWAP_CHAIN_STATE` if none exists or
 *          the stored data is corrupt.
 */
export async function loadSwapChainState(): Promise<SwapChainState> {
	const { error: getError, data: getResult } = await tryCatch(
		Preferences.get({ key: STORAGE_KEY })
	);

	if (getError !== null || getResult === null) {
		return { ...INITIAL_SWAP_CHAIN_STATE };
	}

	const json = getResult.value;

	if (json === null || json === undefined) {
		return { ...INITIAL_SWAP_CHAIN_STATE };
	}

	try {
		const parsed: unknown = JSON.parse(json);

		if (parsed === null || typeof parsed !== 'object') {
			return { ...INITIAL_SWAP_CHAIN_STATE };
		}

		const raw = parsed as Record<string, unknown>;

		if (typeof raw.phase !== 'string') {
			return { ...INITIAL_SWAP_CHAIN_STATE };
		}

		return {
			phase: raw.phase as SwapChainPhase,
			route: raw.route as Route | null,
			sourceWallet: raw.sourceWallet as SourceWallet | null,
			destination: raw.destination as Destination | null,
			sourceConnectedWalletId:
				typeof raw.sourceConnectedWalletId === 'string' ? raw.sourceConnectedWalletId : null,
			amount: typeof raw.amount === 'string' ? raw.amount : null,
			swap1Id: typeof raw.swap1Id === 'string' ? raw.swap1Id : null,
			swap2Id: typeof raw.swap2Id === 'string' ? raw.swap2Id : null,
			swap1Details: raw.swap1Details as Record<string, unknown> | null,
			swap2Details: raw.swap2Details as Record<string, unknown> | null,
			error: typeof raw.error === 'string' ? raw.error : null,
			updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0
		};
	} catch {
		return { ...INITIAL_SWAP_CHAIN_STATE };
	}
}

/**
 * Persist swap chain state to Capacitor Preferences.
 * Automatically stamps `updatedAt`.
 *
 * @param state - The state to persist
 * @returns An error if the write fails, or `null` on success
 */
export async function saveSwapChainState(state: SwapChainState): Promise<{ error: Error | null }> {
	const serialised = JSON.stringify({
		...state,
		updatedAt: Date.now()
	});

	const { error } = await tryCatch(Preferences.set({ key: STORAGE_KEY, value: serialised }));

	if (error !== null) {
		return { error: error instanceof Error ? error : new Error(String(error)) };
	}

	return { error: null };
}

/**
 * Reset swap chain state to initial (IDLE).
 * Call after the chain completes or when the user cancels.
 *
 * @returns An error if the clear fails, or `null` on success
 */
export async function resetSwapChainState(): Promise<{ error: Error | null }> {
	const { error } = await tryCatch(Preferences.remove({ key: STORAGE_KEY }));

	if (error !== null) {
		return { error: error instanceof Error ? error : new Error(String(error)) };
	}

	return { error: null };
}

// ---------------------------------------------------------------------------
// Pure state machine helpers
// ---------------------------------------------------------------------------

/**
 * Validate that a transition from one swap chain phase to another is legal.
 * Pure function — deterministic.
 *
 * Transition to `FAILED` is valid from any non-terminal, non-FAILED phase.
 * Transition to `PARTIAL` is valid only from SWAP_2_PENDING.
 *
 * @param current - The current phase
 * @param next - The proposed next phase
 * @returns `true` if the transition is valid
 */
export function isValidSwapChainTransition(current: SwapChainPhase, next: SwapChainPhase): boolean {
	if (next === 'FAILED') {
		return current !== 'FAILED' && current !== 'COMPLETE' && current !== 'PARTIAL';
	}

	const allowed = VALID_TRANSITIONS[current];
	if (allowed === undefined) {
		return false;
	}
	return allowed.includes(next);
}

/**
 * Determine whether a phase is terminal and should not be resumed.
 */
export function isTerminalPhase(phase: SwapChainPhase): boolean {
	return phase === 'IDLE' || phase === 'COMPLETE' || phase === 'FAILED' || phase === 'PARTIAL';
}

/**
 * Determine whether the chain needs a resume (interrupted mid-execution).
 */
export function needsResume(phase: SwapChainPhase): boolean {
	const resumable: SwapChainPhase[] = [
		'SWAP_1_PENDING',
		'SWAP_1_CONFIRMED',
		'SWAP_2_PENDING',
		'SWAP_2_CONFIRMED'
	];
	return resumable.includes(phase);
}

// ---------------------------------------------------------------------------
// Internal transition helper
// ---------------------------------------------------------------------------

async function transitionTo(
	current: SwapChainState,
	nextPhase: SwapChainPhase,
	updates: Partial<SwapChainState> = {}
): Promise<{ data: SwapChainState | null; error: Error | null }> {
	if (!isValidSwapChainTransition(current.phase, nextPhase)) {
		return {
			data: null,
			error: new Error(`Invalid swap chain transition: ${current.phase} -> ${nextPhase}`)
		};
	}

	const newState: SwapChainState = {
		...current,
		...updates,
		phase: nextPhase,
		error:
			nextPhase === 'FAILED'
				? (updates.error ?? 'Swap chain failed')
				: nextPhase === 'PARTIAL'
					? (updates.error ?? 'Partial completion — hop 2 failed')
					: null,
		updatedAt: Date.now()
	};

	const { error: saveError } = await saveSwapChainState(newState);
	if (saveError !== null) {
		return { data: null, error: saveError };
	}

	return { data: newState, error: null };
}

// ---------------------------------------------------------------------------
// Hop execution helpers
// ---------------------------------------------------------------------------

/**
 * Get the user's own wallet address for a given asset/chain.
 *
 * For intermediate multi-hop swaps, Changelly should send the swapped funds
 * to the user's own wallet (not the final destination) so that the next hop
 * can process them.
 *
 * @param asset - The asset ticker (e.g. 'BTC', 'RBTC', 'USDT')
 * @returns The user's wallet address for the given asset
 */
function getUserAddressForChain(asset: string): string {
	const $wallet = get(walletStore);

	switch (asset) {
		case 'BTC':
			// Use BTC wallet address when a native Bitcoin wallet is available.
			// The same BIP-44 seed is used for all chains; RSK address is the
			// fallback until a dedicated BTC wallet is added to the store.
			return ($wallet as { btc?: { address?: string } }).btc?.address ?? $wallet.rsk.address ?? '';
		case 'RBTC':
			return $wallet.rsk.address ?? '';
		case 'USDT':
			return $wallet.bsc.address ?? '';
		default:
			return $wallet.rsk.address ?? '';
	}
}

/**
 * Execute a single hop based on its service type.
 *
 * @param hop - The route hop to execute
 * @param state - Current swap chain state
 * @param hopIndex - Zero-based index of this hop in the route
 * @returns Transaction hash or service swap ID on success
 */
async function executeHop(
	hop: RouteHop,
	state: SwapChainState,
	hopIndex: number
): Promise<{ data: string | null; error: Error | null }> {
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
			// Connected wallet ERC-20 transfer — not yet supported via direct hop
			return {
				data: null,
				error: new Error('USDT transfer from connected wallet is not yet supported')
			};
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
	signer: import('$lib/services/external-wallet/types').EVMSigner,
	to: string,
	amount: string
): Promise<{ data: string | null; error: Error | null }> {
	try {
		const amountWei = BigInt(Math.round(parseFloat(amount) * 1e18));
		const tx: EVMTransactionRequest = {
			to,
			value: amountWei,
			chainId: 30, // RSK mainnet
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
		: getUserAddressForChain(hop.toAsset);

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

async function executeBoltzHop(
	hop: RouteHop,
	state: SwapChainState
): Promise<{ data: string | null; error: Error | null }> {
	// Submarine swap: RBTC -> Lightning
	if (hop.fromAsset === 'RBTC' && hop.toChain === 'lightning') {
		if (!state.destination || state.destination.type !== 'invoice') {
			return { data: null, error: new Error('Lightning hop requires an invoice destination') };
		}

		const { data: swapResult, error: createError } = await tryCatch(
			createSubmarineSwap(state.destination.invoice)
		);

		if (createError !== null) {
			return {
				data: null,
				error: createError instanceof Error ? createError : new Error(String(createError))
			};
		}

		// Lock funds to execute the swap
		const { data: lockResult, error: lockError } = await tryCatch(
			lockSubmarineSwapFunds(swapResult.swapData)
		);

		if (lockError !== null) {
			return {
				data: null,
				error: lockError instanceof Error ? lockError : new Error(String(lockError))
			};
		}

		return { data: lockResult?.txHash ?? null, error: null };
	}

	// Chain swap: RBTC -> BTC (onchain)
	if (hop.fromAsset === 'RBTC' && hop.toChain === 'bitcoin') {
		const amount = state.amount;
		if (!amount) {
			return { data: null, error: new Error('Amount is required for chain swap') };
		}

		// Parse amount from decimal string to satoshis
		const amountSats = parseFloat(amount);

		if (Number.isNaN(amountSats) || amountSats <= 0) {
			return { data: null, error: new Error('Invalid amount for chain swap') };
		}

		const { data: swapResult, error: chainError } = await tryCatch(createChainSwap(amountSats));

		if (chainError !== null) {
			return {
				data: null,
				error: chainError instanceof Error ? chainError : new Error(String(chainError))
			};
		}

		return { data: swapResult?.swapId ?? null, error: null };
	}

	return {
		data: null,
		error: new Error(`Unsupported Boltz swap: ${hop.fromAsset} -> ${hop.toChain}`)
	};
}

/**
 * Execute a LI.FI cross-chain swap hop.
 *
 * LI.FI handles bridging + swapping atomically. The user sends funds
 * to the LI.FI contract with the encoded calldata. LI.FI completes
 * the swap on the destination chain.
 *
 * This is a single-hop execution — LI.FI manages everything internally.
 *
 * @param hop - The LI.FI route hop
 * @param state - Current swap chain state
 * @returns Transaction hash on success
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

	// Chain ID mapping — supports RSK (30), BSC (56), Arbitrum (42161)
	const CHAIN_ID_RSK = 30;
	const CHAIN_ID_BSC = 56;
	const CHAIN_ID_ARB = 42161;
	const USDT0_ARB_ADDR = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';

	function resolveChain(chainName: string): number {
		if (chainName === 'rsk') return CHAIN_ID_RSK;
		if (chainName === 'bsc') return CHAIN_ID_BSC;
		if (chainName === 'arbitrum') return CHAIN_ID_ARB;
		if (chainName.startsWith('chain-')) return parseInt(chainName.slice(6), 10) || 0;
		return 0;
	}

	function resolveToken(asset: string, chainId: number): string {
		if (asset === 'RBTC' || asset === 'BTC') return '0x0000000000000000000000000000000000000000';
		if (asset === 'USDT0') return USDT0_ARB_ADDR;
		if (asset === 'USDT')
			return chainId === CHAIN_ID_ARB
				? USDT0_ARB_ADDR
				: '0x55d398326f99059fF775485246999027B3197955';
		return '0x0000000000000000000000000000000000000000';
	}

	const fromChainId = resolveChain(hop.fromChain);
	const toChainId = resolveChain(hop.toChain);
	const fromTokenAddr = resolveToken(hop.fromAsset, fromChainId);
	const toTokenAddr = resolveToken(hop.toAsset, toChainId);

	const userAddr =
		hop.fromAsset === 'RBTC'
			? (get(walletStore).rsk.address ?? '').toLowerCase()
			: ((get(walletStore).arb?.address || get(walletStore).rsk.address) ?? '').toLowerCase();

	d.log(
		'executeLifiHop: fromChain=%s(%d) toChain=%s(%d) fromToken=%s toToken=%s',
		hop.fromChain,
		fromChainId,
		hop.toChain,
		toChainId,
		fromTokenAddr.substring(0, 16),
		toTokenAddr.substring(0, 16)
	);

	// Convert amount to token's smallest unit (wei for 18 decimals, 1e6 for USDT)
	const amountDecimal = parseFloat(state.amount!);
	const fromAmountWei =
		hop.fromAsset === 'RBTC'
			? BigInt(Math.round(amountDecimal * 1e18)).toString()
			: BigInt(Math.round(amountDecimal * 1e18)).toString();

	try {
		const txReq = await lifiService.getStepTransaction({
			fromChain: fromChainId,
			toChain: toChainId,
			fromToken: fromTokenAddr,
			toToken: toTokenAddr,
			fromAmount: fromAmountWei,
			fromAddress: userAddr
		});
		const txHash = await sendRawTransaction({
			to: txReq.to,
			data: txReq.data,
			value: txReq.value
		});
		return { data: txHash, error: null };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'LI.FI execution failed';
		return { data: null, error: new Error(message) };
	}
}

/**
 * Execute a Symbiosis cross-chain swap hop.
 *
 * Symbiosis handles bridging + swapping atomically, similar to LI.FI.
 * The user sends funds to a Symbiosis deposit address.
 *
 * This is a single-hop execution — Symbiosis manages everything internally.
 *
 * @param hop - The Symbiosis route hop
 * @param state - Current swap chain state
 * @returns Transaction hash on success
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

	// Chain ID mapping — supports RSK (30), BSC (56), Arbitrum (42161)
	const CHAIN_ID_RSK = 30;
	const CHAIN_ID_BSC = 56;
	const CHAIN_ID_ARB = 42161;
	const USDT0_ARB_ADDR = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';

	function resolveChainId(chainName: string): number {
		if (chainName === 'rsk') return CHAIN_ID_RSK;
		if (chainName === 'bsc') return CHAIN_ID_BSC;
		if (chainName === 'arbitrum') return CHAIN_ID_ARB;
		// Fallback: parse from `chain-NNN` format used for cross-chain EVM
		if (chainName.startsWith('chain-')) return parseInt(chainName.slice(6), 10) || 0;
		return 0;
	}

	const fromChainId = resolveChainId(hop.fromChain);
	const toChainId = resolveChainId(hop.toChain);

	// Token address mapping
	const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000';
	const USDT_BSC = '0x55d398326f99059fF775485246999027B3197955';

	function resolveTokenAddr(asset: string, chainId: number): string {
		if (asset === 'RBTC' || asset === 'BTC') return NATIVE_TOKEN;
		if (asset === 'USDT0') return USDT0_ARB_ADDR;
		if (asset === 'USDT') {
			if (chainId === CHAIN_ID_ARB) return USDT0_ARB_ADDR;
			return USDT_BSC;
		}
		return NATIVE_TOKEN;
	}

	const fromTokenAddr = resolveTokenAddr(hop.fromAsset, fromChainId);
	const toTokenAddr = resolveTokenAddr(hop.toAsset, toChainId);

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

	const symUserAddr =
		hop.fromAsset === 'RBTC'
			? (get(walletStore).rsk.address ?? '')
			: (get(walletStore).bsc.address ?? '');

	// Convert to smallest unit
	const symAmountDecimal = parseFloat(state.amount!);
	const symFromAmountWei =
		hop.fromAsset === 'RBTC'
			? BigInt(Math.round(symAmountDecimal * 1e18)).toString()
			: BigInt(Math.round(symAmountDecimal * 1e18)).toString();

	try {
		const quote = await symbiosisService.getQuote({
			tokenAmountIn: {
				address: fromTokenAddr,
				chainId: fromChainId,
				symbol: hop.fromAsset,
				decimals: 18,
				amount: symFromAmountWei
			},
			tokenOut: {
				address: toTokenAddr,
				chainId: toChainId,
				symbol: hop.toAsset,
				decimals: hop.toAsset === 'BTC' ? 8 : 18
			},
			from: symUserAddr,
			to: state.destination?.type === 'address' ? state.destination.address : symUserAddr,
			slippage: 50
		});

		const tx = quote.tx;
		if (!tx?.data) {
			return { data: null, error: new Error('Symbiosis returned no calldata for execution') };
		}

		// Submit the Symbiosis transaction with the exact tx data from the API
		const txHash = await sendRawTransaction({
			to: tx.to,
			data: tx.data,
			value: tx.value
		});
		d.log('executeSymbiosisHop: tx submitted hash=%s', txHash.substring(0, 16));
		return { data: txHash, error: null };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Symbiosis execution failed';
		d.error('executeSymbiosisHop FAILED: %s', message);
		return { data: null, error: new Error(message) };
	}
}

/**
 * Poll a Changelly swap until it reaches a terminal status.
 *
 * @param swapId - The Changelly swap ID to poll
 * @param maxWaitMs - Maximum time to wait in ms
 * @returns The terminal status, or an error on timeout
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
// Core operations
// ---------------------------------------------------------------------------

/**
 * Start executing a swap chain for the given route.
 *
 * Persists the initial state to Capacitor Preferences before executing the
 * first hop, so the chain can be resumed after interruption.
 *
 * @param route - The route to execute
 * @param sourceWallet - Source wallet identifier
 * @param destination - Destination for the funds
 * @param amount - Amount to swap/send (decimal string)
 * @returns The final swap chain state, or an error
 */
export async function startSwapChain(
	route: Route,
	sourceWallet: SourceWallet,
	destination: Destination,
	amount: string,
	sourceConnectedWalletId: string | null = null
): Promise<{ data: SwapChainState | null; error: Error | null }> {
	// 0. Amount validation
	const amountNum = parseFloat(amount);
	d.log(
		'startSwapChain: route=%s source=%s dest=%s amount=%s wallet=%s hops=%d',
		route.id,
		sourceWallet,
		destination.type,
		amount,
		sourceConnectedWalletId || 'builtin',
		route.hops.length
	);
	if (Number.isNaN(amountNum) || !Number.isFinite(amountNum)) {
		return { data: null, error: new Error('Invalid amount: must be a finite number') };
	}
	if (amountNum <= 0) {
		return { data: null, error: new Error('Invalid amount: must be greater than zero') };
	}
	if (amountNum > 1_000_000_000) {
		return {
			data: null,
			error: new Error('Invalid amount: exceeds maximum allowed (1,000,000,000)')
		};
	}

	// 1. Save initial state
	const initialState: SwapChainState = {
		...INITIAL_SWAP_CHAIN_STATE,
		route,
		sourceWallet,
		destination,
		amount,
		sourceConnectedWalletId,
		updatedAt: Date.now()
	};

	const { error: saveError } = await saveSwapChainState(initialState);
	if (saveError !== null) {
		return { data: null, error: saveError };
	}

	// 2. Execute hop 1
	const hop1 = route.hops[0];
	if (!hop1) {
		return { data: null, error: new Error('Route has no hops') };
	}

	const pendingState1: SwapChainState = {
		...initialState,
		phase: 'SWAP_1_PENDING',
		updatedAt: Date.now()
	};

	const { error: savePendingError } = await saveSwapChainState(pendingState1);
	if (savePendingError !== null) {
		return { data: null, error: savePendingError };
	}

	const { data: hop1Id, error: hop1Error } = await executeHop(hop1, pendingState1, 0);

	if (hop1Error !== null) {
		const { data: failedState, error: transitionError } = await transitionTo(
			{ ...pendingState1, route, sourceWallet, destination, amount },
			'FAILED',
			{ error: hop1Error.message }
		);
		if (transitionError !== null) {
			return { data: null, error: transitionError };
		}
		return { data: failedState, error: null };
	}

	// 3. Confirm hop 1
	const confirmedState1: SwapChainState = {
		...pendingState1,
		phase: 'SWAP_1_CONFIRMED',
		swap1Id: hop1Id,
		updatedAt: Date.now()
	};

	const { error: saveConfirmedError } = await saveSwapChainState(confirmedState1);
	if (saveConfirmedError !== null) {
		return { data: null, error: saveConfirmedError };
	}

	// 4. If single-hop route, mark complete
	if (route.hops.length === 1) {
		const { data: completeState, error: completeError } = await transitionTo(
			confirmedState1,
			'COMPLETE'
		);
		if (completeError !== null) {
			return { data: null, error: completeError };
		}
		return { data: completeState, error: null };
	}

	// 5. Execute hop 2 (multi-hop route)
	const hop2 = route.hops[1];
	if (!hop2) {
		return { data: null, error: new Error('Route has 2 hops defined but hop 2 is missing') };
	}

	const pendingState2: SwapChainState = {
		...confirmedState1,
		phase: 'SWAP_2_PENDING',
		updatedAt: Date.now()
	};

	const { error: savePending2Error } = await saveSwapChainState(pendingState2);
	if (savePending2Error !== null) {
		return { data: null, error: savePending2Error };
	}

	const { data: hop2Id, error: hop2Error } = await executeHop(hop2, pendingState2, 1);

	if (hop2Error !== null) {
		const { data: partialState, error: partialTransitionError } = await transitionTo(
			{ ...pendingState2, swap1Id: hop1Id },
			'PARTIAL',
			{ error: hop2Error.message }
		);
		if (partialTransitionError !== null) {
			return { data: null, error: partialTransitionError };
		}
		return { data: partialState, error: null };
	}

	// 6. Mark complete
	const { data: finalState, error: finalError } = await transitionTo(
		{
			...pendingState2,
			swap1Id: hop1Id,
			swap2Id: hop2Id
		},
		'COMPLETE'
	);

	if (finalError !== null) {
		return { data: null, error: finalError };
	}

	return { data: finalState, error: null };
}

/**
 * Resume an interrupted swap chain from persisted state.
 *
 * Checks the current phase and attempts to advance if possible:
 * - SWAP_1_CONFIRMED with 2-hop route: executes hop 2
 * - SWAP_2_CONFIRMED: marks complete
 * - Terminal phases: returns as-is
 * - Pending phases: returns as-is (caller should verify externally)
 *
 * @returns The current (possibly advanced) state, or an error
 */
export async function resumeSwapChain(): Promise<{
	data: SwapChainState | null;
	error: Error | null;
}> {
	const state = await loadSwapChainState();

	if (isTerminalPhase(state.phase)) {
		return { data: state, error: null };
	}

	// SWAP_2_CONFIRMED -> COMPLETE
	if (state.phase === 'SWAP_2_CONFIRMED') {
		const { data: completed, error: completeError } = await transitionTo(state, 'COMPLETE');
		if (completeError !== null) {
			return { data: null, error: completeError };
		}
		return { data: completed, error: null };
	}

	// SWAP_1_CONFIRMED with 2-hop route — execute hop 2
	if (state.phase === 'SWAP_1_CONFIRMED' && state.route && state.route.hops.length === 2) {
		const hop2 = state.route.hops[1];
		if (!hop2) {
			return { data: null, error: new Error('Route has 2 hops defined but hop 2 is missing') };
		}

		const pendingState2: SwapChainState = {
			...state,
			phase: 'SWAP_2_PENDING',
			updatedAt: Date.now()
		};

		const { error: saveError } = await saveSwapChainState(pendingState2);
		if (saveError !== null) {
			return { data: null, error: saveError };
		}

		const { data: hop2Id, error: hop2Error } = await executeHop(hop2, pendingState2, 1);

		if (hop2Error !== null) {
			const { data: partialState, error: ptError } = await transitionTo(
				{ ...pendingState2 },
				'PARTIAL',
				{ error: hop2Error.message }
			);
			if (ptError !== null) {
				return { data: null, error: ptError };
			}
			return { data: partialState, error: null };
		}

		const { data: completedState, error: completeError } = await transitionTo(
			{ ...pendingState2, swap2Id: hop2Id },
			'COMPLETE'
		);

		if (completeError !== null) {
			return { data: null, error: completeError };
		}

		return { data: completedState, error: null };
	}

	// SWAP_1_PENDING or SWAP_2_PENDING — return as-is for caller to verify
	return { data: state, error: null };
}

/**
 * Get the current swap chain state without performing any operations.
 *
 * @returns The persisted state, or the initial state if none exists
 */
export async function getSwapChainState(): Promise<SwapChainState> {
	return loadSwapChainState();
}

/**
 * Get whether the swap chain is currently in a state that needs user attention.
 * Returns `true` if the chain is FAILED, PARTIAL, or in a pending phase.
 *
 * @param state - The swap chain state to check
 * @returns Contextual status for UI display
 */
export function getSwapChainStatus(state: SwapChainState): {
	isActive: boolean;
	isComplete: boolean;
	isFailed: boolean;
	isPartial: boolean;
	message: string;
} {
	switch (state.phase) {
		case 'IDLE':
			return { isActive: false, isComplete: false, isFailed: false, isPartial: false, message: '' };
		case 'SWAP_1_PENDING':
			return {
				isActive: true,
				isComplete: false,
				isFailed: false,
				isPartial: false,
				message: 'First swap in progress...'
			};
		case 'SWAP_1_CONFIRMED':
			return {
				isActive: true,
				isComplete: false,
				isFailed: false,
				isPartial: false,
				message: 'First swap confirmed'
			};
		case 'SWAP_2_PENDING':
			return {
				isActive: true,
				isComplete: false,
				isFailed: false,
				isPartial: false,
				message: 'Second swap in progress...'
			};
		case 'SWAP_2_CONFIRMED':
			return {
				isActive: true,
				isComplete: false,
				isFailed: false,
				isPartial: false,
				message: 'Second swap confirmed'
			};
		case 'COMPLETE':
			return {
				isActive: false,
				isComplete: true,
				isFailed: false,
				isPartial: false,
				message: 'Swap chain complete'
			};
		case 'FAILED':
			return {
				isActive: false,
				isComplete: false,
				isFailed: true,
				isPartial: false,
				message: state.error ?? 'Swap chain failed'
			};
		case 'PARTIAL':
			return {
				isActive: false,
				isComplete: false,
				isFailed: false,
				isPartial: true,
				message: state.error ?? 'Partial completion'
			};
	}
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Promise-based sleep helper.
 *
 * @param ms - Milliseconds to sleep
 * @returns A promise that resolves after `ms` milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
