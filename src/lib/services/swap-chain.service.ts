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
	sendArbitrumTransaction,
	createSubmarineSwap,
	lockSubmarineSwapFunds,
	createChainSwap
} from '$lib/stores/wallet.store';
import { getEvmSigner, getHandle } from '$lib/stores/connected-wallets.store';
import type { Route, RouteHop, SourceWallet, Destination } from '$lib/services/route-resolver';
import type { ChangellySwapStatus } from '$lib/services/changelly.service';
import type { EVMSigner, EVMTransactionRequest } from '$lib/services/external-wallet/types';
import {
	encodeERC20Transfer,
	getBSCUSDTContractAddress
} from '$lib/services/external-wallet/chain-utils';
import { saveSwapToNostr, recoverSwapsFromNostr } from '$lib/utils/swapAdapter';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';

const d = createDebug('swap-chain');

/**
 * Storage for claim data keyed by Boltz swap ID.
 * When creating a chain swap, we generate a random preimage and store
 * the full claim details (preimage, claimDetails from API, lockupDetails).
 * These are needed to claim tBTC on Arbitrum after Boltz confirms the lockup.
 */
interface SwapClaimData {
	preimageHex: string;
	claimDetails: {
		lockupAddress: string;
		amount: number;
		refundAddress: string;
		timeoutBlockHeight: number;
	};
	lockupClaimAddress: string; // where TBTC goes on Arbitrum
}
const swapClaimData = new Map<string, SwapClaimData>();

/**
 * Storage for Boltz refund data keyed by swap ID.
 * Needed to call `EtherSwap.refund(preimageHash)` on RSK after the
 * Boltz timelock expires, allowing the user to recover locked rBTC.
 */
interface SwapRefundData {
	/** SHA-256 hash of the preimage — the lock key in EtherSwap.lock() */
	preimageHash: string;
	/** RSK EtherSwap contract address where rBTC was locked */
	lockupAddress: string;
	/** RSK block height after which refund is possible */
	timeoutBlockHeight: number;
	/** Boltz claim address on RSK (used in lock() calldata) */
	claimAddress: string;
}
const swapRefundData = new Map<string, SwapRefundData>();
const REFUND_DATA_KEY = 'bittasker_swap_refund_data';

/**
 * Persist the refund data map to Capacitor Preferences.
 * Called whenever a new Boltz swap is created.
 */
async function persistRefundData(): Promise<void> {
	try {
		const obj = Object.fromEntries(swapRefundData);
		await Preferences.set({ key: REFUND_DATA_KEY, value: JSON.stringify(obj) });
	} catch {
		d.warn('Failed to persist refund data — refund may not be possible after refresh');
	}
}

/**
 * Load persisted refund data from Capacitor Preferences into the in-memory map.
 * Called at module init so refund data survives page refreshes.
 */
async function loadPersistedRefundData(): Promise<void> {
	try {
		const { value } = await Preferences.get({ key: REFUND_DATA_KEY });
		if (value) {
			const obj = JSON.parse(value) as Record<string, SwapRefundData>;
			for (const [key, val] of Object.entries(obj)) {
				if (!swapRefundData.has(key)) {
					swapRefundData.set(key, val);
				}
			}
			d.log('Loaded %d persisted refund data entries', Object.keys(obj).length);
		}
	} catch {
		d.warn('Failed to load persisted refund data');
	}
}

// Load persisted refund data on module init (best-effort)
loadPersistedRefundData();

/**
 * Persist the claim data map to Capacitor Preferences.
 * Called whenever a new Boltz swap is created and claim data is stored.
 */
async function persistClaimData(): Promise<void> {
	try {
		const obj = Object.fromEntries(swapClaimData);
		await Preferences.set({ key: CLAIM_DATA_KEY, value: JSON.stringify(obj) });
	} catch {
		d.warn('Failed to persist claim data — swap may break on refresh');
	}
}

/**
 * Load persisted claim data from Capacitor Preferences into the in-memory map.
 * Called at module init so claim data survives page refreshes.
 */
async function loadPersistedClaimData(): Promise<void> {
	try {
		const { value } = await Preferences.get({ key: CLAIM_DATA_KEY });
		if (value) {
			const obj = JSON.parse(value) as Record<string, SwapClaimData>;
			for (const [key, val] of Object.entries(obj)) {
				if (!swapClaimData.has(key)) {
					swapClaimData.set(key, val);
				}
			}
			d.log('Loaded %d persisted claim data entries', Object.keys(obj).length);
		}
	} catch {
		d.warn('Failed to load persisted claim data');
	}
}

// Load persisted claim data on module init (best-effort)
loadPersistedClaimData();

/**
 * Save a single chain swap's claim data to Nostr (NIP-44 encrypted).
 * This is the primary persistence mechanism — survives app reinstall,
 * device change, and relay replication. Preferences is the fallback.
 *
 * The event is encrypted to the user's own pubkey, so only they can read it.
 * Uses kind 30078 (parameterized replaceable) with `d` tag = swapId,
 * so re-saving the same swap overwrites the previous event.
 */
async function saveClaimDataToNostr(swapId: string, claimData: SwapClaimData): Promise<void> {
	try {
		const { nsec } = await getNostrKeyPair();
		const now = Math.floor(Date.now() / 1000);
		// Build a minimal ChainSwapData-compatible object for the adapter.
		// The adapter serializes all fields into NIP-44 encrypted content.
		const swapRecord = {
			id: swapId,
			type: 'chain' as const,
			preimage: claimData.preimageHex,
			preimageHash: '', // not needed for claim, but satisfies type
			status: 'transaction.server.confirmed' as const,
			createdAt: now,
			updatedAt: now,
			expiresAt: now + 3600,
			// Boltz RBTC→TBTC specific fields (serialized by adapter)
			claimDetails: claimData.claimDetails,
			lockupClaimAddress: claimData.lockupClaimAddress,
			// Required ChainSwapData fields (not used for RBTC→TBTC but needed for type)
			fromAsset: 'L-BTC' as const,
			fromAmount: 0,
			lockupAddress: '',
			blindingKey: '',
			liquidUri: '',
			lockupTimeoutBlockHeight: 0,
			toAsset: 'RBTC' as const,
			toAmount: 0,
			rbtcAddress: '',
			claimTimeoutBlockHeight: 0,
			refundPublicKey: '',
			refundPrivateKey: '',
			refundAddress: ''
		};
		await saveSwapToNostr(
			swapRecord as unknown as Parameters<typeof saveSwapToNostr>[0],
			nsec,
			'boltz-swap-chain'
		);
		d.log('Saved claim data to Nostr for swap %s', swapId);
	} catch (err) {
		d.warn('Failed to save claim data to Nostr for swap %s: %s', swapId, (err as Error).message);
	}
}

/**
 * Load claim data from Nostr for a specific swap ID.
 * Used as a last-resort fallback when both in-memory and Preferences are empty
 * (e.g. after app reinstall or Preferences data loss).
 *
 * Returns the SwapClaimData if found, null otherwise.
 */
async function loadClaimDataFromNostr(swapId: string): Promise<SwapClaimData | null> {
	try {
		const { nsec } = await getNostrKeyPair();
		const swaps = await recoverSwapsFromNostr(nsec, 'boltz-swap-chain', true);

		for (const swap of swaps) {
			const s = swap as unknown as Record<string, unknown>;
			if (s.id === swapId && s.preimage) {
				d.log('Recovered claim data from Nostr for swap %s', swapId);
				return {
					preimageHex: s.preimage as string,
					claimDetails: s.claimDetails as SwapClaimData['claimDetails'],
					lockupClaimAddress: (s.lockupClaimAddress as string) || ''
				};
			}
		}
		return null;
	} catch (err) {
		d.warn('Failed to load claim data from Nostr for swap %s: %s', swapId, (err as Error).message);
		return null;
	}
}

/**
 * Observable swap progress for UI status tracking.
 * Updated at key steps during swap execution so the UI can show a
 * step-by-step tracker instead of just a spinner.
 */
export type SwapProgressStep =
	| 'locking-rbtc'
	| 'locking-tbtc'
	| 'waiting-for-boltz'
	| 'claiming-tbtc'
	| 'claiming-rbtc'
	| 'swapping-tbtc'
	| 'complete'
	| 'failed';

let swapProgressCallback: ((step: SwapProgressStep, message: string) => void) | null = null;

/** Register a callback to receive swap progress updates. Returns unsubscribe. */
export function onSwapProgress(cb: (step: SwapProgressStep, message: string) => void): () => void {
	swapProgressCallback = cb;
	return () => {
		swapProgressCallback = null;
	};
}

/** Get current progress step (for initial state). */
export function getSwapProgressStep(): SwapProgressStep {
	return currentSwapProgressStep;
}

let currentSwapProgressStep: SwapProgressStep = 'locking-rbtc';

function setSwapProgress(step: SwapProgressStep, message: string) {
	currentSwapProgressStep = step;
	d.log('SWAP_PROGRESS: %s — %s', step, message);
	swapProgressCallback?.(step, message);
}

/**
 * Send an Arbitrum transaction from a connected wallet, trying gasless first.
 *
 * If the gasless relay is available and the user has a JWT, wraps the call
 * in `sendGaslessCalls()` (executeBatch with fee buffer). Falls back to
 * direct `evmSigner.sendTransaction()` if gasless fails or is unavailable.
 *
 * @param evmSigner - The connected wallet's EVM signer
 * @param to - Transaction recipient
 * @param data - Transaction calldata
 * @param value - Transaction value (string or bigint)
 * @returns Transaction hash
 */
async function sendConnectedWalletArbitrumTx(
	evmSigner: EVMSigner,
	to: string,
	data: string,
	value?: string | bigint
): Promise<string> {
	// Try gasless relay first
	try {
		const { sendGaslessCalls } = await import('$lib/wallet/gasless-store');
		const jwt = (typeof localStorage !== 'undefined' && localStorage.getItem('auth_token')) || '';
		if (jwt) {
			const { USDT0_ADDRESS, FEE_BUFFER_MIN } = await import('$lib/wallet/gasless.config');
			const feeToken = USDT0_ADDRESS;
			const feeBuffer = FEE_BUFFER_MIN[feeToken.toLowerCase()] ?? 10_000_000_000_000_000n;
			const callValue = value ? BigInt(value) : 0n;

			const txHash = await sendGaslessCalls(
				[{ to, data, value: callValue }],
				feeToken,
				feeBuffer,
				jwt
			);
			d.log('Connected wallet Arbitrum tx via gasless: %s', txHash.substring(0, 16));
			return txHash;
		}
	} catch (gaslessErr) {
		d.warn('Gasless relay failed for connected wallet, falling back to direct: %s', gaslessErr);
	}

	// Direct transaction fallback
	const txValue = value ? BigInt(value) : undefined;
	const result = await evmSigner.sendTransaction({
		to,
		data,
		value: txValue,
		chainId: 42161
	});
	return result.txHash;
}

/**
 * Resolve the user's address for a given chain, checking connected wallet first.
 * Falls back to the built-in wallet store if no connected wallet is active.
 *
 * @param state - Current swap chain state
 * @param asset - The asset ticker (e.g. 'BTC', 'RBTC', 'USDT')
 * @returns The user's wallet address for the given chain
 */
function resolveUserAddress(state: SwapChainState, asset: string): string {
	if (state.sourceConnectedWalletId) {
		const handle = getHandle(state.sourceConnectedWalletId);
		if (handle) {
			// Use the connected wallet's address. The connected wallet may not
			// have chain-specific addresses, but the primary EVM address works
			// for RSK, BSC, and Arbitrum. For BTC, use the BTC address if available.
			if (asset === 'BTC' && handle.bitcoinSigner?.address) {
				return handle.bitcoinSigner.address;
			}
			return handle.address;
		}
	}
	return getUserAddressForChain(asset);
}

/**
 * Execute an ERC-20 transfer via a connected wallet's EVM signer.
 * Encodes the standard `transfer(address,uint256)` calldata and sends it
 * to the token contract address.
 *
 * @param signer - The connected wallet's EVM signer
 * @param tokenAddress - The ERC-20 token contract address
 * @param recipient - The recipient wallet address
 * @param amount - The amount in the token's smallest unit (bigint)
 * @param chainId - The EVM chain ID
 * @returns Transaction hash on success, or an error
 */
async function executeConnectedERC20Transfer(
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
// Constants
// ---------------------------------------------------------------------------

/** Capacitor Preferences storage key. */
const STORAGE_KEY = 'bittasker_swap_chain';

/**
 * Storage key for Boltz chain swap claim data.
 * Persists the preimage + claim details so they survive page refreshes.
 * Without this, `pollBoltzChainSwapCompletion` cannot claim tBTC after
 * Boltz confirms the lockup if the user reloads the app mid-swap.
 */
const CLAIM_DATA_KEY = 'bittasker_swap_claim_data';

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
	SWAP_1_PENDING: ['SWAP_1_CONFIRMED', 'FAILED', 'PARTIAL'],
	SWAP_1_CONFIRMED: ['SWAP_2_PENDING', 'COMPLETE', 'FAILED', 'PARTIAL'],
	SWAP_2_PENDING: ['SWAP_2_CONFIRMED', 'FAILED', 'PARTIAL'],
	SWAP_2_CONFIRMED: ['COMPLETE', 'FAILED', 'PARTIAL'],
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
	// Capacitor Preferences not available in browser — skip persistence
	try {
		const serialised = JSON.stringify({
			...state,
			updatedAt: Date.now()
		});
		const { error } = await tryCatch(Preferences.set({ key: STORAGE_KEY, value: serialised }));
		if (error !== null) {
			return { error: error instanceof Error ? error : new Error(String(error)) };
		}
	} catch {
		// Preferences may be unavailable in certain environments (SSR, tests)
		Sentry.addBreadcrumb({
			category: 'persistence',
			message: 'Capacitor Preferences unavailable — swap chain state not persisted',
			level: 'warning'
		});
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
			// ERC-20 transfer via connected wallet on BSC (chain 56, 18 decimals)
			d.log('executeDirectHop: USDT ERC-20 transfer via connected wallet');
			const usdtContract = getBSCUSDTContractAddress();
			const amountWei = BigInt(Math.round(parseFloat(amount) * 1e18));
			return executeConnectedERC20Transfer(evmSigner, usdtContract, address, amountWei, 56);
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

async function executeBoltzHop(
	hop: RouteHop,
	state: SwapChainState
): Promise<{ data: string | null; error: Error | null }> {
	d.log('executeBoltzHop: fromAsset=%s toChain=%s', hop.fromAsset, hop.toChain);

	// Linked swap: tBTC → Lightning (sub) → rBTC (reverse)
	if (hop.fromAsset === 'TBTC' && hop.toChain === 'rsk') {
		const amount = state.amount;
		if (!amount) return { data: null, error: new Error('Amount is required') };
		const amountSats = Math.round(parseFloat(amount) * 100_000_000);
		if (Number.isNaN(amountSats) || amountSats <= 0)
			return { data: null, error: new Error('Invalid amount') };

		try {
			const { BoltzProvider } = await import('$lib/services/BoltzProvider');
			const { ethers } = await import('ethers');
			const boltz = new BoltzProvider();

			const rskAddr = get(walletStore).rsk.address;
			if (!rskAddr) return { data: null, error: new Error('No RSK wallet address') };

			// Step 1: Create reverse swap (LN → rBTC) — generates Lightning invoice
			d.log('Creating reverse swap (LN → rBTC)...');
			const revSwap = await boltz.createReverseSwap(amountSats, rskAddr);
			d.log('Reverse swap: %s invoice=%s...', revSwap.swapId, revSwap.invoice.substring(0, 20));

			// Step 2: Create submarine swap (tBTC → LN) paying the invoice
			const refundWallet = ethers.Wallet.createRandom();
			const subSwap = await boltz.createSubmarineSwap(
				revSwap.invoice,
				refundWallet.publicKey.slice(2)
			);
			d.log('Submarine swap: %s lockup=%s', subSwap.swapId, subSwap.lockupAddress);

			// Step 3: Send tBTC to submarine lockup on Arbitrum
			const tbtcWei = BigInt(amountSats) * BigInt(1e10);
			let txResult: string;

			if (state.sourceConnectedWalletId) {
				d.log(
					'Linked swap step 3: using connected wallet %s for Arbitrum lockup',
					state.sourceConnectedWalletId
				);
				const evmSigner = getEvmSigner(state.sourceConnectedWalletId);
				if (!evmSigner) {
					return {
						data: null,
						error: new Error('Connected wallet EVM signer not available')
					};
				}
				txResult = await sendConnectedWalletArbitrumTx(
					evmSigner,
					subSwap.lockupAddress,
					'0x',
					tbtcWei
				);
			} else {
				txResult = await sendArbitrumTransaction({
					to: subSwap.lockupAddress,
					data: '0x',
					value: tbtcWei.toString(),
					gasLimit: 500000
				});
			}
			d.log('TBTC sent to submarine: %s', txResult);

			return { data: `${revSwap.swapId}/${subSwap.swapId}`, error: null };
		} catch (err) {
			d.error('Linked swap failed: %s', (err as Error).message);
			return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
		}
	}

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
		if (state.sourceConnectedWalletId) {
			d.log(
				'executeBoltzHop submarine: using connected wallet %s for lockup',
				state.sourceConnectedWalletId
			);
			const evmSigner = getEvmSigner(state.sourceConnectedWalletId);
			if (!evmSigner) {
				return { data: null, error: new Error('Connected wallet EVM signer not available') };
			}

			const swapData = swapResult.swapData as unknown as Record<string, unknown> | undefined;
			const lockupAddress =
				(typeof swapData?.lockupAddress === 'string' ? swapData.lockupAddress : undefined) ??
				(typeof swapData?.address === 'string' ? swapData.address : undefined) ??
				(typeof swapData?.lockupDetails === 'object' && swapData.lockupDetails !== null
					? (swapData.lockupDetails as Record<string, unknown>).lockupAddress
					: undefined);
			const lockupAmountRaw =
				swapData?.expectedAmount ?? swapData?.amount ?? swapData?.userLockAmount;

			if (typeof lockupAddress !== 'string') {
				return { data: null, error: new Error('Could not extract lockup address from swap data') };
			}
			if (typeof lockupAmountRaw !== 'number' && typeof lockupAmountRaw !== 'string') {
				return { data: null, error: new Error('Could not extract lockup amount from swap data') };
			}

			const lockupAmountWei =
				typeof lockupAmountRaw === 'number' ? BigInt(lockupAmountRaw) : BigInt(lockupAmountRaw);

			try {
				const result = await evmSigner.sendTransaction({
					to: lockupAddress,
					data: '0x',
					value: lockupAmountWei,
					chainId: 30 // RSK mainnet
				});
				return { data: result.txHash, error: null };
			} catch (err) {
				return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
			}
		}

		// Built-in wallet lockup
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

	// Chain swap: RBTC -> BTC (onchain), via existing createChainSwap
	if (hop.fromAsset === 'RBTC' && hop.toChain === 'bitcoin') {
		const amount = state.amount;
		if (!amount) {
			return { data: null, error: new Error('Amount is required for chain swap') };
		}

		const amountSatsNum = parseFloat(amount);
		if (Number.isNaN(amountSatsNum) || amountSatsNum <= 0) {
			return { data: null, error: new Error('Invalid amount for chain swap') };
		}
		const amountSats = Math.round(amountSatsNum);

		// Connected wallet path: create the swap via Boltz API and send lockup via evmSigner
		if (state.sourceConnectedWalletId) {
			d.log(
				'createChainSwap: using connected wallet %s for RBTC→BTC',
				state.sourceConnectedWalletId
			);
			const evmSigner = getEvmSigner(state.sourceConnectedWalletId);
			if (!evmSigner) {
				return { data: null, error: new Error('Connected wallet EVM signer not available') };
			}

			try {
				// Create the chain swap via Boltz API (RBTC → BTC on-chain)
				const { BoltzProvider } = await import('$lib/services/BoltzProvider');
				const boltz = new BoltzProvider();

				// Generate preimage (same as RBTC→Arbitrum path)
				const preimageBytes = new Uint8Array(32);
				crypto.getRandomValues(preimageBytes);
				const _preimageHex = Array.from(preimageBytes, (b) => b.toString(16).padStart(2, '0')).join(
					''
				);
				const hashBytes = await crypto.subtle.digest('SHA-256', preimageBytes);
				const hashHex = Array.from(new Uint8Array(hashBytes), (b) =>
					b.toString(16).padStart(2, '0')
				).join('');

				// Generate refund key using ethers
				const { ethers } = await import('ethers');
				const refundWallet = ethers.Wallet.createRandom();
				const refundPublicKey = refundWallet.publicKey.slice(2);

				// Get BTC claim address from the user's connected wallet
				const btcAddr = resolveUserAddress(state, 'BTC');
				if (!btcAddr) {
					return { data: null, error: new Error('No BTC address available for claim') };
				}

				// Use BoltzProvider's createSwap with BTC destination (overload: the
				// provider already sends RBTC→TBTC by default; we rely on the API to
				// handle the BTC destination correctly)
				const swapResult = await boltz.createSwap({
					amountSats,
					claimAddress: btcAddr.toLowerCase(),
					preimageHash: hashHex,
					refundPublicKey
				});

				d.log(
					'Boltz chain swap (BTC) created: id=%s lockup=%s claim=%s timeout=%s',
					swapResult.swapId,
					swapResult.lockupAddress,
					swapResult.claimAddress,
					swapResult.timeoutBlockHeight
				);

				// Store refund data so user can recover rBTC if swap fails/times out
				swapRefundData.set(swapResult.swapId, {
					preimageHash: hashHex,
					lockupAddress: swapResult.lockupAddress,
					timeoutBlockHeight: swapResult.timeoutBlockHeight,
					claimAddress: swapResult.claimAddress
				});
				void persistRefundData();

				// ABI-encode the EtherSwap.lock() call (same as RBTC→Arbitrum path)
				const etherSwapIface = new ethers.Interface([
					'function lock(bytes32 preimageHash, address claimAddress, uint256 timelock) payable'
				]);
				const lockCalldata = etherSwapIface.encodeFunctionData('lock', [
					'0x' + hashHex,
					swapResult.claimAddress,
					BigInt(swapResult.timeoutBlockHeight)
				]);

				// Send rBTC to the lockup address via the connected wallet
				const rbtcWei = BigInt(amountSats) * BigInt(1e10);
				const result = await evmSigner.sendTransaction({
					to: swapResult.lockupAddress,
					data: lockCalldata,
					value: rbtcWei,
					chainId: 30 // RSK mainnet
				});
				d.log('Boltz chain swap (BTC) lockup tx: %s', result.txHash);

				return { data: swapResult.swapId, error: null };
			} catch (err) {
				d.error('Boltz chain swap (RBTC→BTC) failed: %s', (err as Error).message);
				return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
			}
		}

		// Built-in wallet path
		const { data: swapResult, error: chainError } = await tryCatch(createChainSwap(amountSats));
		if (chainError !== null) {
			return {
				data: null,
				error: chainError instanceof Error ? chainError : new Error(String(chainError))
			};
		}
		return { data: swapResult?.swapId ?? null, error: null };
	}

	// Chain swap: TBTC on Arbitrum -> RBTC on RSK
	// User sends tBTC to Boltz lockup on Arbitrum, Boltz locks rBTC on RSK.
	// After Boltz confirms lockup, user claims rBTC on RSK by calling EtherSwap.claim().
	if (hop.fromAsset === 'TBTC' && hop.toChain === 'rsk') {
		const amount = state.amount;
		if (!amount) return { data: null, error: new Error('Amount is required') };
		// amount is in tBTC sats (from previous Symbiosis same-chain hop)
		const amountSats = Math.round(parseFloat(amount) * 100_000_000);
		if (Number.isNaN(amountSats) || amountSats <= 0)
			return { data: null, error: new Error('Invalid tBTC amount') };

		d.log('executeBoltzHop TBTC→RSK: amount=%s (%d sats)', amount, amountSats);

		try {
			const { BoltzProvider } = await import('$lib/services/BoltzProvider');
			const boltz = new BoltzProvider();

			// Generate preimage
			const preimageBytes = new Uint8Array(32);
			crypto.getRandomValues(preimageBytes);
			const preimageHex = Array.from(preimageBytes, (b) => b.toString(16).padStart(2, '0')).join(
				''
			);
			const hashBytes = await crypto.subtle.digest('SHA-256', preimageBytes);
			const hashHex = Array.from(new Uint8Array(hashBytes), (b) =>
				b.toString(16).padStart(2, '0')
			).join('');

			// Generate refund key
			const { ethers } = await import('ethers');
			const refundWallet = ethers.Wallet.createRandom();
			const refundPublicKey = refundWallet.publicKey.slice(2);

			// User's RSK address for receiving rBTC
			const rskAddr = state.sourceConnectedWalletId
				? (getHandle(state.sourceConnectedWalletId)?.address ?? '').toLowerCase()
				: (get(walletStore).rsk.address ?? '').toLowerCase();
			if (!rskAddr) return { data: null, error: new Error('No RSK wallet address available') };

			// Create Boltz chain swap: TBTC → RBTC
			const swapResult = await boltz.createSwap({
				amountSats,
				claimAddress: rskAddr,
				preimageHash: hashHex,
				refundPublicKey
			});

			d.log(
				'Boltz TBTC→RBTC swap created: id=%s lockup=%s',
				swapResult.swapId,
				swapResult.lockupAddress
			);
			setSwapProgress('locking-tbtc', `Locking tBTC → ${swapResult.swapId}`);

			// Store claim data (preimage needed to claim rBTC on RSK)
			if (swapResult.claimDetails) {
				swapClaimData.set(swapResult.swapId, {
					preimageHex,
					claimDetails: swapResult.claimDetails,
					lockupClaimAddress: swapResult.claimAddress
				});
				void persistClaimData();
				void saveClaimDataToNostr(swapResult.swapId, swapClaimData.get(swapResult.swapId)!);
			}

			// Store refund data
			swapRefundData.set(swapResult.swapId, {
				preimageHash: hashHex,
				lockupAddress: swapResult.lockupAddress,
				timeoutBlockHeight: swapResult.timeoutBlockHeight,
				claimAddress: swapResult.claimAddress
			});
			void persistRefundData();

			// Send tBTC to Boltz lockup on Arbitrum via ERC-20 transfer
			const TBTC_ARB = '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40';
			const tbtcWei = BigInt(amountSats) * BigInt(1e10); // sats → wei (18 decimals)
			const transferCalldata = encodeERC20Transfer(swapResult.lockupAddress, tbtcWei);

			d.log(
				'Sending tBTC to Boltz lockup: %s (%s wei)',
				swapResult.lockupAddress,
				tbtcWei.toString()
			);

			let lockupTxHash: string;
			if (state.sourceConnectedWalletId) {
				const evmSigner = getEvmSigner(state.sourceConnectedWalletId);
				if (!evmSigner)
					return { data: null, error: new Error('Connected wallet EVM signer not available') };
				const txRequest: EVMTransactionRequest = {
					to: TBTC_ARB,
					data: transferCalldata,
					value: 0n,
					chainId: 42161
				};
				const result = await evmSigner.sendTransaction(txRequest);
				lockupTxHash = result.txHash;
			} else {
				lockupTxHash = await sendArbitrumTransaction({
					to: TBTC_ARB,
					data: transferCalldata,
					value: '0',
					gasLimit: 100000
				});
			}

			d.log('tBTC lockup tx: %s', lockupTxHash);

			return { data: swapResult.swapId, error: null };
		} catch (err) {
			d.error('Boltz TBTC→RBTC swap failed: %s', err instanceof Error ? err.message : String(err));
			return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
		}
	}

	// Chain swap: RBTC or BTC -> TBTC on Arbitrum
	// Handles both 'RBTC' (from SmartRouter boltz+lifi route) and 'BTC' (from legacy boltzQuoteToRoute)
	if ((hop.fromAsset === 'RBTC' || hop.fromAsset === 'BTC') && hop.toChain === 'arbitrum') {
		const amount = state.amount;
		if (!amount) return { data: null, error: new Error('Amount is required') };
		const amountSats = Math.round(parseFloat(amount) * 100_000_000);
		if (Number.isNaN(amountSats) || amountSats <= 0)
			return { data: null, error: new Error('Invalid amount') };

		d.log(
			'executeBoltzHop RBTC/BTC→arbitrum: amount=%s (%d sats) connected=%s',
			amount,
			amountSats,
			state.sourceConnectedWalletId ?? 'builtin'
		);

		try {
			// Use BoltzProvider for chain swap creation
			const { BoltzProvider } = await import('$lib/services/BoltzProvider');
			const boltz = new BoltzProvider();

			// Generate preimage using Web Crypto API (browser-safe)
			const preimageBytes = new Uint8Array(32);
			crypto.getRandomValues(preimageBytes);
			const preimageHex = Array.from(preimageBytes, (b) => b.toString(16).padStart(2, '0')).join(
				''
			);
			const hashBytes = await crypto.subtle.digest('SHA-256', preimageBytes);
			const hashHex = Array.from(new Uint8Array(hashBytes), (b) =>
				b.toString(16).padStart(2, '0')
			).join('');

			// Generate refund key using ethers (browser-safe)
			const { ethers } = await import('ethers');
			const refundWallet = ethers.Wallet.createRandom();
			const refundPublicKey = refundWallet.publicKey.slice(2); // remove 0x prefix

			// Get Arbitrum claim address (connected wallet or built-in, lowercase for Boltz)
			const arbAddr = state.sourceConnectedWalletId
				? (getHandle(state.sourceConnectedWalletId)?.address ?? '').toLowerCase()
				: ((get(walletStore).arb?.address || get(walletStore).rsk.address) ?? '').toLowerCase();
			if (!arbAddr) return { data: null, error: new Error('No Arbitrum wallet address available') };

			// Create the swap via Boltz API
			const swapResult = await boltz.createSwap({
				amountSats,
				claimAddress: arbAddr,
				preimageHash: hashHex,
				refundPublicKey
			});

			d.log(
				'Boltz swap created: id=%s lockup=%s claim=%s timeout=%s',
				swapResult.swapId,
				swapResult.lockupAddress,
				swapResult.claimAddress,
				swapResult.timeoutBlockHeight
			);
			setSwapProgress('locking-rbtc', `Locking rBTC → ${swapResult.swapId}`);

			// Store claim data for later tBTC claiming on Arbitrum
			// claimDetails from Boltz API + preimage needed for ERC20Swap.claim()
			if (swapResult.claimDetails) {
				swapClaimData.set(swapResult.swapId, {
					preimageHex: preimageHex,
					claimDetails: swapResult.claimDetails,
					lockupClaimAddress: swapResult.claimAddress
				});
				void persistClaimData(); // Persist to Preferences (local fallback)
				void saveClaimDataToNostr(swapResult.swapId, swapClaimData.get(swapResult.swapId)!); // Persist to Nostr (survives reinstall)
				d.log('Stored claim data for swap %s (will claim tBTC on Arbitrum)', swapResult.swapId);
			}

			// Store refund data so user can recover rBTC if swap fails/times out
			swapRefundData.set(swapResult.swapId, {
				preimageHash: hashHex,
				lockupAddress: swapResult.lockupAddress,
				timeoutBlockHeight: swapResult.timeoutBlockHeight,
				claimAddress: swapResult.claimAddress
			});
			void persistRefundData();
			d.log(
				'Stored refund data for swap %s (lockup=%s timeout=%s)',
				swapResult.swapId,
				swapResult.lockupAddress,
				swapResult.timeoutBlockHeight
			);

			// ABI-encode the EtherSwap.lock() call:
			//   lock(bytes32 preimageHash, address claimAddress, uint256 timelock) payable
			// The contract holds the rBTC until Boltz claims on Arbitrum using the preimage.
			const etherSwapIface = new ethers.Interface([
				'function lock(bytes32 preimageHash, address claimAddress, uint256 timelock) payable'
			]);
			const lockCalldata = etherSwapIface.encodeFunctionData('lock', [
				'0x' + hashHex, // preimageHash (bytes32)
				swapResult.claimAddress, // claimAddress (where TBTC is sent on Arb)
				BigInt(swapResult.timeoutBlockHeight) // timelock (block height for refund)
			]);

			d.log(
				'ABI-encoded lock() calldata: len=%d selector=%s',
				lockCalldata.length,
				lockCalldata.substring(0, 10)
			);

			// Send rBTC to lockup via lock() — connected wallet or built-in
			const rbtcWei = BigInt(amountSats) * BigInt(1e10);
			try {
				let lockupTxHash: string;
				if (state.sourceConnectedWalletId) {
					const evmSigner = getEvmSigner(state.sourceConnectedWalletId);
					if (!evmSigner) {
						return {
							data: null,
							error: new Error('Connected wallet EVM signer not available for Boltz')
						};
					}
					d.log(
						'Boltz lockup via connected wallet %s: to=%s value=%s wei calldata=%s',
						state.sourceConnectedWalletId,
						swapResult.lockupAddress,
						rbtcWei.toString(),
						lockCalldata.substring(0, 20)
					);
					const result = await evmSigner.sendTransaction({
						to: swapResult.lockupAddress,
						data: lockCalldata,
						value: rbtcWei,
						chainId: 30 // Lockup is rBTC on RSK, not Arbitrum — Boltz handles the Arb claim
					});
					lockupTxHash = result.txHash;
				} else {
					d.log(
						'Boltz lockup via built-in: to=%s value=%s wei calldata=%s',
						swapResult.lockupAddress,
						rbtcWei.toString(),
						lockCalldata.substring(0, 20)
					);
					lockupTxHash = await sendRawTransaction({
						to: swapResult.lockupAddress,
						data: lockCalldata,
						value: rbtcWei.toString(),
						gasLimit: 150000
					});
				}
				d.log('Boltz chain swap lockup tx: %s', lockupTxHash);
				setSwapProgress('locking-rbtc', `Lockup tx sent: ${lockupTxHash.substring(0, 16)}...`);
				return { data: swapResult.swapId, error: null };
			} catch (sendErr) {
				d.error('sendRawTransaction failed: %s', (sendErr as Error).message);
				return {
					data: null,
					error: sendErr instanceof Error ? sendErr : new Error(String(sendErr))
				};
			}
		} catch (err) {
			d.error('Boltz chain swap failed: %s', err instanceof Error ? err.message : String(err));
			return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
		}
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
		if (asset === 'TBTC') return '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40';
		if (asset === 'WBTC') return '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';
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

	// Resolve user address — connected wallet takes priority
	const userAddr = state.sourceConnectedWalletId
		? (getHandle(state.sourceConnectedWalletId)?.address ?? '').toLowerCase()
		: hop.fromAsset === 'RBTC'
			? (get(walletStore).rsk.address ?? '').toLowerCase()
			: ((get(walletStore).arb?.address || get(walletStore).rsk.address) ?? '').toLowerCase();

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
	const amountDecimal = parseFloat(state.amount!);
	const TOKEN_DECIMALS: Record<string, number> = {
		RBTC: 18,
		BTC: 18,
		TBTC: 18,
		WBTC: 8,
		USDT: 6,
		USDT0: 6,
		USDC: 6
	};
	const decimals = TOKEN_DECIMALS[hop.fromAsset] ?? 18;
	const fromAmountWei = BigInt(Math.round(amountDecimal * 10 ** decimals)).toString();

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
			if (fromChainId === 42161) {
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
						gasLimit: 500000
					})
				: await sendRawTransaction({ to: txReq.to, data: txReq.data, value: txReq.value });
		return { data: txHash, error: null };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'LI.FI execution failed';
		console.error('[executeLifiHop] FAILED:', message);
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
	const TBTC_ARB = '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40';
	const WBTC_ARB = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';

	const ASSET_DECIMALS: Record<string, number> = {
		RBTC: 18,
		BTC: 8,
		TBTC: 18,
		WBTC: 8,
		USDT0: 18,
		USDT: 18
	};

	function resolveTokenAddr(asset: string, chainId: number): string {
		if (asset === 'RBTC' || asset === 'BTC') return NATIVE_TOKEN;
		if (asset === 'USDT0') return USDT0_ARB_ADDR;
		if (asset === 'TBTC') return TBTC_ARB;
		if (asset === 'WBTC') return WBTC_ARB;
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

	// Resolve user address — connected wallet takes priority
	const symUserAddr = state.sourceConnectedWalletId
		? (getHandle(state.sourceConnectedWalletId)?.address ?? '')
		: hop.fromAsset === 'RBTC'
			? (get(walletStore).rsk.address ?? '')
			: (get(walletStore).bsc.address ?? '');

	// Convert to smallest unit
	const symAmountDecimal = parseFloat(state.amount!);
	const fromDecimals = ASSET_DECIMALS[hop.fromAsset] ?? 18;
	const symFromAmountWei = BigInt(Math.round(symAmountDecimal * 10 ** fromDecimals)).toString();

	try {
		const toDecimals = ASSET_DECIMALS[hop.toAsset] ?? 18;
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
			to: state.destination?.type === 'address' ? state.destination.address : symUserAddr,
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
			if (fromChainId === 42161) {
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
			if (fromChainId === 42161) {
				txHash = await sendArbitrumTransaction({
					to: tx.to,
					data: tx.data,
					value: tx.value || '0',
					gasLimit: 500000
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

/**
 * Poll a Boltz chain swap until it completes (tBTC arrives on Arbitrum).
 *
 * Boltz chain swaps require the APP to claim tBTC on Arbitrum after the
 * lockup is confirmed. The flow is:
 *   1. User sends rBTC to EtherSwap.lock() on RSK (hop 1)
 *   2. Boltz monitors RSK, detects lockup → status becomes transaction.server.confirmed
 *   3. APP claims tBTC on Arbitrum by calling ERC20Swap.claim() with the preimage
 *   4. tBTC arrives in user's Arbitrum wallet → status becomes transaction.claimed
 *
 * This function polls for status changes and automatically claims when ready.
 *
 * @param swapId - The Boltz swap ID to poll
 * @param maxWaitMs - Maximum time to wait in ms (default: 15 minutes)
 * @returns An error if the swap failed or timed out, or null on success
 */
async function pollBoltzChainSwapCompletion(
	swapId: string,
	sourceConnectedWalletId: string | null,
	maxWaitMs: number = 900_000, // 15 minutes — chain swaps need claim time
	direction: 'rbtc-to-tbtc' | 'tbtc-to-rbtc' = 'rbtc-to-tbtc'
): Promise<{ data: string | null; error: Error | null }> {
	const BOLTZ_POLL_INTERVAL_MS = 5000;
	const startTime = Date.now();
	const dBoltz = createDebug('swap-chain:boltz-poll');

	// tBTC token address on Arbitrum
	const TBTC_ARB = '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40';

	while (Date.now() - startTime < maxWaitMs) {
		const { data: statusResult, error: statusError } = await tryCatch(
			(async () => {
				const { BoltzProvider } = await import('$lib/services/BoltzProvider');
				const boltz = new BoltzProvider();
				return boltz.getSwapStatus(swapId);
			})()
		);

		if (statusError !== null) {
			dBoltz.warn('Boltz status poll error (transient): %s', statusError.message);
			await sleep(BOLTZ_POLL_INTERVAL_MS);
			continue;
		}

		if (!statusResult) {
			await sleep(BOLTZ_POLL_INTERVAL_MS);
			continue;
		}

		const status = statusResult.status;
		const elapsed = Math.round((Date.now() - startTime) / 1000);
		dBoltz.log('Boltz swap %s status: %s (elapsed %ds)', swapId, status, elapsed);

		// Terminal success — tBTC claimed on Arbitrum
		if (status === 'transaction.claimed') {
			dBoltz.log('Boltz swap %s completed successfully (claimed)', swapId);
			swapClaimData.delete(swapId); // Cleanup
			return { data: status, error: null };
		}

		// Terminal failure states
		if (
			status === 'swap.expired' ||
			status === 'transaction.failed' ||
			status === 'swap.failed' ||
			status === 'transaction.lockupFailed'
		) {
			dBoltz.error('Boltz swap %s terminal failure: %s', swapId, status);
			swapClaimData.delete(swapId); // Cleanup
			return { data: null, error: new Error(`Boltz swap ${swapId} failed: ${status}`) };
		}

		// Server confirmed lockup — we need to claim tBTC on Arbitrum
		if (status === 'transaction.server.confirmed') {
			let claimData = swapClaimData.get(swapId);
			if (!claimData) {
				// Try loading persisted claim data (survives page refresh)
				dBoltz.log('No in-memory claim data for %s — attempting persisted load', swapId);
				await loadPersistedClaimData();
				claimData = swapClaimData.get(swapId);
			}
			if (!claimData) {
				// Last resort: load from Nostr (survives app reinstall, device change)
				dBoltz.log('No Preferences claim data for %s — attempting Nostr recovery', swapId);
				const nostrData = await loadClaimDataFromNostr(swapId);
				if (nostrData) {
					swapClaimData.set(swapId, nostrData);
					claimData = nostrData;
					dBoltz.log('Recovered claim data from Nostr for swap %s', swapId);
				}
			}
			if (!claimData) {
				dBoltz.error('No claim data stored for swap %s — cannot claim', swapId);
				return { data: null, error: new Error('Missing claim data for tBTC claim') };
			}

			// Claim on the correct chain based on swap direction
			if (direction === 'tbtc-to-rbtc') {
				// TBTC→RBTC: claim rBTC on RSK by calling EtherSwap.claim()
				dBoltz.log('Claiming rBTC on RSK for swap %s (TBTC→RBTC direction)', swapId);
				setSwapProgress('claiming-rbtc', 'Claiming rBTC on RSK...');

				const claimError = await claimRbtcOnRsk({
					preimageHex: claimData.preimageHex,
					amount: claimData.claimDetails.amount,
					claimAddress: claimData.lockupClaimAddress,
					refundAddress: claimData.claimDetails.refundAddress,
					timelock: claimData.claimDetails.timeoutBlockHeight,
					sourceConnectedWalletId
				});

				if (claimError !== null) {
					dBoltz.error('rBTC claim failed: %s', claimError.message);
					await sleep(BOLTZ_POLL_INTERVAL_MS);
					continue;
				}

				dBoltz.log('rBTC claim submitted on RSK — waiting for confirmation');
				swapClaimData.delete(swapId);
			} else {
				// RBTC→TBTC: claim tBTC on Arbitrum by calling ERC20Swap.claim()
				dBoltz.log(
					'Claiming tBTC on Arbitrum: contract=%s amount=%d token=%s',
					claimData.claimDetails.lockupAddress,
					claimData.claimDetails.amount,
					TBTC_ARB
				);
				setSwapProgress('claiming-tbtc', 'Claiming tBTC on Arbitrum...');

				const claimError = await claimTbtcOnArbitrum({
					contractAddress: claimData.claimDetails.lockupAddress,
					preimageHex: '0x' + claimData.preimageHex,
					amount: claimData.claimDetails.amount,
					tokenAddress: TBTC_ARB,
					claimAddress: claimData.lockupClaimAddress,
					refundAddress: claimData.claimDetails.refundAddress,
					timelock: claimData.claimDetails.timeoutBlockHeight,
					sourceConnectedWalletId
				});

				if (claimError !== null) {
					dBoltz.error('tBTC claim failed: %s', claimError.message);
					await sleep(BOLTZ_POLL_INTERVAL_MS);
					continue;
				}

				dBoltz.log('tBTC claim submitted on Arbitrum — waiting for confirmation');
				swapClaimData.delete(swapId);
			}
		}

		// Non-terminal states: swap.created, swap.mempool, swap.confirmed — keep waiting
		await sleep(BOLTZ_POLL_INTERVAL_MS);
	}

	return {
		data: null,
		error: new Error(`Boltz swap ${swapId} did not complete within ${maxWaitMs / 1000}s`)
	};
}

/**
 * Claim tBTC on Arbitrum by calling ERC20Swap.claim().
 *
 * The ERC20Swap contract on Arbitrum holds tBTC locked by Boltz.
 * After the RSK lockup is confirmed, the user must call claim() with the
 * preimage to release tBTC to their Arbitrum address.
 *
 * Priority:
 * 1. Connected wallet EVM signer (has ETH for gas, or gasless via relay)
 * 2. Built-in wallet via sendArbitrumTransaction (gasless relay via ERC-4337)
 *
 * @returns Error if claim failed, null on success
 */
async function claimTbtcOnArbitrum(params: {
	contractAddress: string;
	preimageHex: string;
	amount: number;
	tokenAddress: string;
	claimAddress: string;
	refundAddress: string;
	timelock: number;
	sourceConnectedWalletId: string | null;
}): Promise<Error | null> {
	const dClaim = createDebug('swap-chain:claim-tbtc');

	try {
		const { ethers } = await import('ethers');
		const iface = new ethers.Interface([
			'function claim(bytes32 preimage, uint256 amount, address tokenAddress, address claimAddress, address refundAddress, uint256 timelock)'
		]);

		const calldata = iface.encodeFunctionData('claim', [
			params.preimageHex,
			BigInt(params.amount),
			params.tokenAddress,
			params.claimAddress,
			params.refundAddress,
			BigInt(params.timelock)
		]);

		dClaim.log(
			'Claim calldata: len=%d selector=%s to=%s wallet=%s',
			calldata.length,
			calldata.substring(0, 10),
			params.contractAddress,
			params.sourceConnectedWalletId ?? 'builtin'
		);

		let txHash: string | null = null;

		// Priority 1: Connected wallet EVM signer (has ETH or gasless relay)
		if (params.sourceConnectedWalletId) {
			const evmSigner = getEvmSigner(params.sourceConnectedWalletId);
			if (evmSigner) {
				dClaim.log('Claiming via connected wallet %s on Arbitrum', params.sourceConnectedWalletId);
				try {
					const result = await sendConnectedWalletArbitrumTx(
						evmSigner,
						params.contractAddress,
						calldata,
						'0'
					);
					txHash = result;
					dClaim.log('Connected wallet claim tx: %s', txHash);
				} catch (connErr) {
					dClaim.warn(
						'Connected wallet claim failed (%s), trying gasless relay',
						(connErr as Error).message
					);
				}
			}
		}

		// Priority 2: Built-in wallet via gasless relay
		if (!txHash) {
			dClaim.log('Claiming via built-in wallet (gasless relay)');
			txHash = await sendArbitrumTransaction({
				to: params.contractAddress,
				data: calldata,
				value: '0',
				gasLimit: 300_000
			});
			dClaim.log('Built-in wallet claim tx: %s', txHash);
		}

		Sentry.addBreadcrumb({
			category: 'boltz',
			message: `tBTC claimed on Arbitrum: ${txHash}`,
			level: 'info',
			data: { swapContract: params.contractAddress }
		});

		return null;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		dClaim.error('claimTbtcOnArbitrum failed: %s', message);
		return new Error(message);
	}
}

/**
 * Claim rBTC on RSK by calling EtherSwap.claim().
 *
 * After Boltz detects the tBTC lockup on Arbitrum, it locks rBTC on RSK.
 * The user calls EtherSwap.claim() with the preimage to release rBTC.
 *
 * The claim call is: claim(bytes32 preimage, uint256 amount, address claimAddress, uint256 timelock)
 * where claimAddress = Boltz's claim address, amount = sats locked, timelock = block height.
 *
 * @returns Error if claim failed, null on success
 */
async function claimRbtcOnRsk(params: {
	preimageHex: string;
	amount: number;
	claimAddress: string;
	refundAddress: string;
	timelock: number;
	sourceConnectedWalletId: string | null;
}): Promise<Error | null> {
	const dClaim = createDebug('swap-chain:claim-rbtc');
	const ETHERSWAP_ADDRESS = '0xe761e1354097757c019855637746e7dd1bef1654';

	try {
		const { ethers } = await import('ethers');

		// EtherSwap.claim(bytes32 preimage, uint256 amount, address claimAddress, uint256 timelock)
		const iface = new ethers.Interface([
			'function claim(bytes32 preimage, uint256 amount, address claimAddress, uint256 timelock)'
		]);

		const amountSats = BigInt(params.amount);
		const calldata = iface.encodeFunctionData('claim', [
			'0x' + params.preimageHex,
			amountSats * BigInt(1e10), // sats → wei
			params.claimAddress,
			BigInt(params.timelock)
		]);

		dClaim.log(
			'Claim calldata: selector=%s to=%s wallet=%s',
			calldata.substring(0, 10),
			ETHERSWAP_ADDRESS,
			params.sourceConnectedWalletId ?? 'builtin'
		);

		let txHash: string;

		if (params.sourceConnectedWalletId) {
			const evmSigner = getEvmSigner(params.sourceConnectedWalletId);
			if (!evmSigner) {
				return new Error('Connected wallet EVM signer not available for RSK claim');
			}
			dClaim.log('Claiming via connected wallet %s on RSK', params.sourceConnectedWalletId);
			const result = await evmSigner.sendTransaction({
				to: ETHERSWAP_ADDRESS,
				data: calldata,
				value: 0n,
				chainId: 30
			});
			txHash = result.txHash;
		} else {
			dClaim.log('Claiming via built-in wallet on RSK');
			txHash = await sendRawTransaction({
				to: ETHERSWAP_ADDRESS,
				data: calldata,
				value: '0',
				gasLimit: 150_000
			});
		}

		dClaim.log('rBTC claim tx: %s', txHash);

		Sentry.addBreadcrumb({
			category: 'boltz',
			message: `rBTC claimed on RSK: ${txHash}`,
			level: 'info',
			data: { contract: ETHERSWAP_ADDRESS }
		});

		return null;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		dClaim.error('claimRbtcOnRsk failed: %s', message);
		return new Error(message);
	}
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
	// 0. Parameter validation
	if (!route || !route.hops || !Array.isArray(route.hops)) {
		return { data: null, error: new Error('Invalid route: missing hops') };
	}
	if (!destination || !destination.type) {
		return { data: null, error: new Error('Invalid destination: missing type') };
	}

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

	d.log(
		'hop 1: service=%s from=%s/%s to=%s/%s',
		hop1.service,
		hop1.fromAsset,
		hop1.fromChain,
		hop1.toAsset,
		hop1.toChain
	);

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
	d.log('hop 1 result: id=%s error=%s', hop1Id ?? 'null', hop1Error?.message ?? 'none');

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

	// For 2-hop routes where hop 1 is Boltz: wait for the Boltz chain swap to
	// complete before executing hop 2. Boltz chain swaps are asynchronous —
	// the user sends rBTC to a lockup, then Boltz detects it, and sends tBTC
	// to the claim address on Arbitrum. This can take several minutes.
	// Without this wait, hop 2 (e.g. LI.FI tBTC→USDT0) would execute against
	// a zero tBTC balance and fail on-chain.
	if (hop1.service === 'boltz' && hop1Id) {
		d.log('hop 1 is Boltz (id=%s) — polling for completion before hop 2', hop1Id);
		setSwapProgress('waiting-for-boltz', 'Waiting for Boltz to confirm lockup on RSK...');
		const pollResult = await pollBoltzChainSwapCompletion(hop1Id, sourceConnectedWalletId);
		if (pollResult.error !== null) {
			d.error('Boltz completion poll failed: %s', pollResult.error.message);
			const { data: partialState, error: ptError } = await transitionTo(
				{ ...confirmedState1, swap1Id: hop1Id },
				'PARTIAL',
				{ error: `Boltz swap did not complete: ${pollResult.error.message}` }
			);
			if (ptError !== null) {
				return { data: null, error: ptError };
			}
			return { data: partialState, error: null };
		}
		d.log('Boltz swap completed — proceeding to hop 2');
		setSwapProgress('swapping-tbtc', 'tBTC claimed — swapping via LI.FI...');
	}

	d.log(
		'hop 2: service=%s from=%s/%s to=%s/%s',
		hop2.service,
		hop2.fromAsset,
		hop2.fromChain,
		hop2.toAsset,
		hop2.toChain
	);

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

	// 6. If hop 2 is Boltz: poll for chain swap completion before marking complete.
	// Boltz chain swaps are asynchronous — the user locks source token, Boltz locks
	// destination token, then the user claims. This can take several minutes.
	if (hop2.service === 'boltz' && hop2Id) {
		d.log('hop 2 is Boltz (id=%s) — polling for completion', hop2Id);
		setSwapProgress('waiting-for-boltz', 'Waiting for Boltz to complete chain swap...');

		const direction = hop2.fromAsset === 'TBTC' ? 'tbtc-to-rbtc' : 'rbtc-to-tbtc';
		const pollResult = await pollBoltzChainSwapCompletion(
			hop2Id,
			sourceConnectedWalletId,
			900_000,
			direction
		);

		if (pollResult.error !== null) {
			d.error('Boltz hop 2 poll failed: %s', pollResult.error.message);
			const { data: partialState, error: ptError } = await transitionTo(
				{ ...pendingState2, swap1Id: hop1Id, swap2Id: hop2Id },
				'PARTIAL',
				{ error: `Boltz swap did not complete: ${pollResult.error.message}` }
			);
			if (ptError !== null) {
				return { data: null, error: ptError };
			}
			return { data: partialState, error: null };
		}

		d.log('Boltz hop 2 completed successfully');
	}

	// 7. Mark complete
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
		const hop1 = state.route.hops[0];
		const hop2 = state.route.hops[1];
		if (!hop2) {
			return { data: null, error: new Error('Route has 2 hops defined but hop 2 is missing') };
		}

		// Poll Boltz completion before hop 2 (same logic as startSwapChain)
		if (hop1?.service === 'boltz' && state.swap1Id) {
			d.log('resume: hop 1 is Boltz (id=%s) — polling for completion', state.swap1Id);
			const pollResult = await pollBoltzChainSwapCompletion(
				state.swap1Id,
				state.sourceConnectedWalletId
			);
			if (pollResult.error !== null) {
				d.error('resume: Boltz poll failed: %s', pollResult.error.message);
				const { data: partialState, error: ptError } = await transitionTo({ ...state }, 'PARTIAL', {
					error: `Boltz swap did not complete: ${pollResult.error.message}`
				});
				if (ptError !== null) {
					return { data: null, error: ptError };
				}
				return { data: partialState, error: null };
			}
			d.log('resume: Boltz swap completed — proceeding to hop 2');
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
		d.log('resume: hop 2 result: id=%s error=%s', hop2Id ?? 'null', hop2Error?.message ?? 'none');

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

		// If hop 2 is Boltz: poll for chain swap completion before marking complete
		if (hop2.service === 'boltz' && hop2Id) {
			d.log('resume: hop 2 is Boltz (id=%s) — polling for completion', hop2Id);
			const direction = hop2.fromAsset === 'TBTC' ? 'tbtc-to-rbtc' : 'rbtc-to-tbtc';
			const pollResult = await pollBoltzChainSwapCompletion(
				hop2Id,
				state.sourceConnectedWalletId,
				900_000,
				direction
			);
			if (pollResult.error !== null) {
				d.error('resume: Boltz hop 2 poll failed: %s', pollResult.error.message);
				const { data: partialState, error: ptError } = await transitionTo(
					{ ...pendingState2, swap2Id: hop2Id },
					'PARTIAL',
					{ error: `Boltz swap did not complete: ${pollResult.error.message}` }
				);
				if (ptError !== null) {
					return { data: null, error: ptError };
				}
				return { data: partialState, error: null };
			}
			d.log('resume: Boltz hop 2 completed');
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

	// SWAP_1_CONFIRMED with single-hop route — hop 1 is done, mark complete
	if (state.phase === 'SWAP_1_CONFIRMED' && state.route && state.route.hops.length === 1) {
		d.log('resume: single-hop SWAP_1_CONFIRMED — marking complete');
		const { data: completed, error: completeError } = await transitionTo(state, 'COMPLETE');
		if (completeError !== null) {
			return { data: null, error: completeError };
		}
		return { data: completed, error: null };
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
 * Check whether a refund is available for the current stuck swap.
 * Returns the refund data and whether the timelock has expired.
 *
 * @returns Refund availability info, or null if no refund data exists
 */
export async function getRefundInfo(): Promise<{
	preimageHash: string;
	lockupAddress: string;
	timeoutBlockHeight: number;
	claimAddress: string;
	canRefund: boolean;
	message: string;
} | null> {
	const state = await loadSwapChainState();
	if (!state.swap1Id) return null;

	// Try in-memory first, then persisted
	let rd = swapRefundData.get(state.swap1Id);
	if (!rd) {
		await loadPersistedRefundData();
		rd = swapRefundData.get(state.swap1Id);
	}
	if (!rd) return null;

	// Check if timelock has expired by querying RSK current block
	let canRefund = false;
	let message = '';
	try {
		const { ethers: ethersLib } = await import('ethers');
		const rskProvider = new ethersLib.JsonRpcProvider('https://mainnet.sovryn.app/rpc');
		const currentBlock = await rskProvider.getBlockNumber();
		if (currentBlock >= rd.timeoutBlockHeight) {
			canRefund = true;
			message = `Timelock expired at block ${rd.timeoutBlockHeight} (current: ${currentBlock}) — refund available`;
		} else {
			const blocksRemaining = rd.timeoutBlockHeight - currentBlock;
			const minutesRemaining = Math.ceil((blocksRemaining * 30) / 60); // ~30s RSK block time
			message = `Timelock at block ${rd.timeoutBlockHeight} (current: ${currentBlock}) — ~${minutesRemaining}m remaining`;
		}
	} catch (err) {
		d.warn('Failed to check RSK block number: %s', (err as Error).message);
		message = 'Unable to check timelock status — try refund anyway';
		canRefund = true; // Let the user try
	}

	return { ...rd, canRefund, message };
}

/**
 * Execute a refund for a stuck Boltz chain swap.
 * Calls EtherSwap.refund(preimageHash) on RSK to recover locked rBTC.
 *
 * @returns The refund transaction hash, or an error
 */
export async function refundSwapChain(): Promise<{
	txHash: string | null;
	error: Error | null;
}> {
	const dRefund = createDebug('swap-chain:refund');
	const state = await loadSwapChainState();
	if (!state.swap1Id) {
		return { txHash: null, error: new Error('No swap ID found in state') };
	}

	// Get refund data
	let rd = swapRefundData.get(state.swap1Id);
	if (!rd) {
		await loadPersistedRefundData();
		rd = swapRefundData.get(state.swap1Id);
	}
	if (!rd) {
		return {
			txHash: null,
			error: new Error(
				'No refund data found — cannot recover funds automatically. Lockup address and preimageHash are needed.'
			)
		};
	}

	dRefund.log(
		'Refunding swap %s: lockup=%s preimageHash=%s timeout=%s',
		state.swap1Id,
		rd.lockupAddress,
		rd.preimageHash.substring(0, 16) + '...',
		rd.timeoutBlockHeight
	);

	try {
		const { ethers } = await import('ethers');

		// ABI-encode the EtherSwap.refund() call
		const etherSwapIface = new ethers.Interface([
			'function refund(bytes32 preimageHash, address claimAddress, uint256 timelock)'
		]);
		const refundCalldata = etherSwapIface.encodeFunctionData('refund', [
			'0x' + rd.preimageHash,
			rd.claimAddress,
			BigInt(rd.timeoutBlockHeight)
		]);

		// Send the refund transaction from the built-in wallet
		const refundTxHash = await sendRawTransaction({
			to: rd.lockupAddress,
			data: refundCalldata,
			value: '0',
			gasLimit: 150000
		});

		dRefund.log('Refund tx sent: %s', refundTxHash);

		// Transition to COMPLETE — funds recovered
		const { data: _completedState, error: completeError } = await transitionTo(state, 'COMPLETE', {
			error: `Refund successful: ${refundTxHash}`
		});
		if (completeError !== null) {
			dRefund.warn('Failed to transition to COMPLETE after refund: %s', completeError.message);
		}

		// Clean up persisted data
		swapRefundData.delete(state.swap1Id);
		void persistRefundData();
		swapClaimData.delete(state.swap1Id);
		void persistClaimData();

		return { txHash: refundTxHash, error: null };
	} catch (err) {
		const errorMsg = (err as Error).message;
		dRefund.error('Refund failed: %s', errorMsg);
		return { txHash: null, error: new Error(`Refund failed: ${errorMsg}`) };
	}
}

/**
 * Recover refund data from RSK on-chain Lockup event logs.
 * Queries the Boltz EtherSwap contract for Lockup events indexed by the
 * user's RSK address, matches the swap amount, and stores the refund data.
 *
 * This is the primary recovery mechanism for EVM chains — Boltz persists
 * all swap parameters in contract event logs.
 *
 * @returns The recovered refund data, or an error
 */
export async function recoverRefundDataFromChain(): Promise<{
	data: SwapRefundData | null;
	error: Error | null;
}> {
	const dRecover = createDebug('swap-chain:recover');
	const state = await loadSwapChainState();

	if (!state.swap1Id || !state.amount) {
		return { data: null, error: new Error('No swap ID or amount in state') };
	}

	// Get user's RSK address
	const { getRSKAddress } = await import('$lib/stores/wallet.store');
	const rskAddress = await getRSKAddress();
	if (!rskAddress) {
		return { data: null, error: new Error('No RSK address available') };
	}

	dRecover.log(
		'Recovering refund data for swap %s (amount=%s, addr=%s)',
		state.swap1Id,
		state.amount,
		rskAddress
	);

	try {
		// Compute the expected amount in wei (state.amount is decimal string of RBTC)
		const expectedAmountWei = BigInt(Math.round(parseFloat(state.amount) * 1e18));

		// Pad RSK address to 32 bytes for topic filtering
		const paddedAddr = '0x' + rskAddress.toLowerCase().slice(2).padStart(64, '0');

		// Lockup event: topic0 = event sig, topic1 = preimageHash (indexed), topic2 = refundAddress (indexed)
		const LOCKUP_TOPIC = '0x15b4b8206809535e547317cd5cedc86cff6e7d203551f93701786ddaf14fd9f9';
		const CLAIM_TOPIC = '0x5664142af3dcfc3dc3de45a43f75c746bd1d8c11170a5037fdf98bdb35775137';
		const ETHERSWAP_ADDRESS = '0xe761e1354097757c019855637746e7dd1bef1654';

		// Query Blockscout for Lockup events
		const lockupUrl = `https://rootstock.blockscout.com/api?module=logs&action=getLogs&address=${ETHERSWAP_ADDRESS}&topic0=${LOCKUP_TOPIC}&topic2=${paddedAddr}&topic0_2_opr=and&fromBlock=0&toBlock=latest`;
		const lockupResp = await fetch(lockupUrl);
		const lockupData = (await lockupResp.json()) as {
			result?: Array<{
				topics: string[];
				data: string;
				blockNumber: string;
				transactionHash: string;
			}>;
		};

		if (!lockupData.result || !Array.isArray(lockupData.result)) {
			return { data: null, error: new Error('Failed to query Lockup events from Blockscout') };
		}

		dRecover.log('Found %d Lockup events for address %s', lockupData.result.length, rskAddress);

		// Create provider + contract once for on-chain existence checks
		const { ethers: ethersCheck } = await import('ethers');
		const checkProvider = new ethersCheck.JsonRpcProvider('https://mainnet.sovryn.app/rpc');
		const swapAbi = [
			'function swaps(bytes32) view returns (uint256, address, address, uint256, bytes32, address)'
		];
		const swapContract = new ethersCheck.Contract(ETHERSWAP_ADDRESS, swapAbi, checkProvider);

		// Parse events and find matching amount
		for (const ev of lockupData.result) {
			const topics = ev.topics;
			const dataHex = ev.data;
			if (topics.length < 2 || dataHex.length < 194) continue;

			const preimageHash = topics[1];
			const amountWei = BigInt('0x' + dataHex.slice(2, 66));
			const claimAddress = '0x' + dataHex.slice(90, 130);
			const timelock = Number(BigInt('0x' + dataHex.slice(130, 194)));

			// Match by amount (within 1% tolerance for dust differences)
			const diff =
				amountWei > expectedAmountWei
					? amountWei - expectedAmountWei
					: expectedAmountWei - amountWei;
			if (diff > expectedAmountWei / 100n) continue;

			dRecover.log(
				'Matching Lockup: amount=%s preimageHash=%s timelock=%s',
				amountWei.toString(),
				preimageHash.substring(0, 18) + '...',
				timelock
			);

			// Check if already claimed
			const claimUrl = `https://rootstock.blockscout.com/api?module=logs&action=getLogs&address=${ETHERSWAP_ADDRESS}&topic0=${CLAIM_TOPIC}&topic1=${preimageHash}&topic0_1_opr=and&fromBlock=0&toBlock=latest`;
			const claimResp = await fetch(claimUrl);
			const claimData = (await claimResp.json()) as { result?: Array<unknown> };

			if (claimData.result && Array.isArray(claimData.result) && claimData.result.length > 0) {
				dRecover.log('Lockup already claimed, skipping');
				continue;
			}

			// Verify the swap still exists in contract storage
			try {
				const onChain = await swapContract.swaps(preimageHash);
				if (onChain[0] === 0n) {
					dRecover.log('Lockup already resolved (no on-chain data), skipping');
					continue;
				}
			} catch {
				// swaps() decode error = all zeros = already resolved
				dRecover.log('Lockup already resolved (decode error), skipping');
				continue;
			}

			// Found an unclaimed lockup — store refund data
			const refundData: SwapRefundData = {
				preimageHash: preimageHash.startsWith('0x') ? preimageHash.slice(2) : preimageHash,
				lockupAddress: ETHERSWAP_ADDRESS,
				timeoutBlockHeight: timelock,
				claimAddress
			};

			swapRefundData.set(state.swap1Id, refundData);
			await persistRefundData();

			dRecover.log(
				'Recovered refund data: preimageHash=%s timelock=%s claimAddress=%s',
				preimageHash.substring(0, 18) + '...',
				timelock,
				claimAddress
			);

			return { data: refundData, error: null };
		}

		return { data: null, error: new Error('No matching unclaimed Lockup event found on-chain') };
	} catch (err) {
		dRecover.error('Recovery failed: %s', (err as Error).message);
		return { data: null, error: new Error(`Recovery failed: ${(err as Error).message}`) };
	}
}

/**
 * Represents an unclaimed Boltz EtherSwap lockup found on-chain.
 */
export interface UnclaimedLockup {
	/** Preimage hash (without 0x prefix) — the lock key */
	preimageHash: string;
	/** RSK EtherSwap contract address */
	lockupAddress: string;
	/** Boltz claim address on RSK */
	claimAddress: string;
	/** Locked amount in satoshis */
	amountSats: number;
	/** RSK block height after which refund is possible */
	timeoutBlockHeight: number;
	/** Current RSK block height */
	currentBlock: number;
	/** Whether the timelock has expired */
	expired: boolean;
	/** RSK transaction hash of the lockup */
	txHash: string;
	/** RSK block number of the lockup */
	blockNumber: number;
	/** Whether the lockup has been resolved (claimed or refunded) on-chain */
	resolved: boolean;
}

/**
 * Scan the RSK blockchain for all unclaimed Boltz EtherSwap lockups
 * belonging to the user's RSK address.
 */
export async function scanUnclaimedLockups(): Promise<{
	data: UnclaimedLockup[];
	error: Error | null;
}> {
	const dScan = createDebug('swap-chain:scan');

	try {
		const { getRSKAddress } = await import('$lib/stores/wallet.store');
		const rskAddress = await getRSKAddress();
		if (!rskAddress) {
			return { data: [], error: new Error('No RSK address available') };
		}

		const paddedAddr = '0x' + rskAddress.toLowerCase().slice(2).padStart(64, '0');
		const LOCKUP_TOPIC = '0x15b4b8206809535e547317cd5cedc86cff6e7d203551f93701786ddaf14fd9f9';
		const ETHERSWAP = '0xe761e1354097757c019855637746e7dd1bef1654';

		const url = `https://rootstock.blockscout.com/api?module=logs&action=getLogs&address=${ETHERSWAP}&topic0=${LOCKUP_TOPIC}&topic2=${paddedAddr}&topic0_2_opr=and&fromBlock=0&toBlock=latest`;
		const resp = await fetch(url);
		const data = (await resp.json()) as {
			result?: Array<{
				topics: string[];
				data: string;
				blockNumber: string;
				transactionHash: string;
			}>;
		};

		if (!data.result || !Array.isArray(data.result)) {
			return { data: [], error: new Error('Failed to query Lockup events') };
		}

		dScan.log('Found %d Lockup events for %s', data.result.length, rskAddress);

		const { ethers: ethersLib } = await import('ethers');
		const provider = new ethersLib.JsonRpcProvider('https://mainnet.sovryn.app/rpc');
		const currentBlock = await provider.getBlockNumber();

		// Create contract instance for on-chain existence checks
		const swapAbi = [
			'function swaps(bytes32) view returns (uint256, address, address, uint256, bytes32, address)'
		];
		const swapContract = new ethersLib.Contract(ETHERSWAP, swapAbi, provider);

		const results: UnclaimedLockup[] = [];

		for (const ev of data.result) {
			const topics = ev.topics;
			const dataHex = ev.data;
			if (topics.length < 2 || dataHex.length < 194) continue;

			const preimageHash = topics[1];
			const amountWei = BigInt('0x' + dataHex.slice(2, 66));
			const claimAddress = '0x' + dataHex.slice(90, 130);
			const timelock = Number(BigInt('0x' + dataHex.slice(130, 194)));

			// Check if already resolved on-chain (claimed or refunded)
			let resolved = false;
			try {
				const onChain = await swapContract.swaps(preimageHash);
				if (onChain[0] === 0n) {
					dScan.log('Lockup %s already resolved (no on-chain data)', preimageHash.slice(0, 10));
					resolved = true;
				}
			} catch {
				// swaps() decode error = all zeros = already resolved
				dScan.log('Lockup %s already resolved (decode error)', preimageHash.slice(0, 10));
				resolved = true;
			}

			results.push({
				preimageHash: preimageHash.startsWith('0x') ? preimageHash.slice(2) : preimageHash,
				lockupAddress: ETHERSWAP,
				claimAddress,
				amountSats: Number(amountWei / 10000000000n),
				timeoutBlockHeight: timelock,
				currentBlock,
				expired: currentBlock >= timelock,
				txHash: ev.transactionHash,
				blockNumber: parseInt(ev.blockNumber, 16),
				resolved
			});
		}

		dScan.log('Found %d unclaimed lockups', results.length);
		return { data: results, error: null };
	} catch (err) {
		dScan.error('Scan failed: %s', (err as Error).message);
		return { data: [], error: new Error(`Scan failed: ${(err as Error).message}`) };
	}
}

/**
 * Refund a specific on-chain lockup directly.
 */
export async function refundLockupDirect(lockup: UnclaimedLockup): Promise<{
	txHash: string | null;
	error: Error | null;
}> {
	const dRefund = createDebug('swap-chain:refund-direct');

	dRefund.log(
		'Refunding lockup: preimageHash=%s timelock=%s amount=%d sats',
		lockup.preimageHash.substring(0, 16) + '...',
		lockup.timeoutBlockHeight,
		lockup.amountSats
	);

	try {
		const { ethers: ethersLib } = await import('ethers');

		const etherSwapIface = new ethersLib.Interface([
			'function refund(bytes32 preimageHash, address claimAddress, uint256 timelock)'
		]);
		const refundCalldata = etherSwapIface.encodeFunctionData('refund', [
			'0x' + lockup.preimageHash,
			lockup.claimAddress,
			BigInt(lockup.timeoutBlockHeight)
		]);

		const refundTxHash = await sendRawTransaction({
			to: lockup.lockupAddress,
			data: refundCalldata,
			value: '0',
			gasLimit: 150000
		});

		dRefund.log('Refund tx sent: %s', refundTxHash);
		return { txHash: refundTxHash, error: null };
	} catch (err) {
		const errorMsg = (err as Error).message;
		dRefund.error('Refund failed: %s', errorMsg);
		return { txHash: null, error: new Error(`Refund failed: ${errorMsg}`) };
	}
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
				message: 'wallet.swap_chain.swap_1_pending'
			};
		case 'SWAP_1_CONFIRMED':
			return {
				isActive: true,
				isComplete: false,
				isFailed: false,
				isPartial: false,
				message: 'wallet.swap_chain.swap_1_confirmed'
			};
		case 'SWAP_2_PENDING':
			return {
				isActive: true,
				isComplete: false,
				isFailed: false,
				isPartial: false,
				message: 'wallet.swap_chain.swap_2_pending'
			};
		case 'SWAP_2_CONFIRMED':
			return {
				isActive: true,
				isComplete: false,
				isFailed: false,
				isPartial: false,
				message: 'wallet.swap_chain.swap_2_confirmed'
			};
		case 'COMPLETE':
			return {
				isActive: false,
				isComplete: true,
				isFailed: false,
				isPartial: false,
				message: 'wallet.swap_chain.complete'
			};
		case 'FAILED':
			return {
				isActive: false,
				isComplete: false,
				isFailed: true,
				isPartial: false,
				message: state.error ?? 'wallet.swap_chain.failed'
			};
		case 'PARTIAL':
			return {
				isActive: false,
				isComplete: false,
				isFailed: false,
				isPartial: true,
				message: state.error ?? 'wallet.swap_chain.partial'
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
