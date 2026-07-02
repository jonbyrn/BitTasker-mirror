/**
 * DerivationMigrator — Phase 3.1
 *
 * Two-phase commit migration from legacy RSK derivation path to standard
 * BIP44 Ethereum path (m/44'/60'/0'/0/0, coin type 60 — the industry-standard
 * EVM derivation path used by MetaMask and all major wallets).
 *
 * **State machine:**
 * ```
 * NOT_STARTED -> DETECTING -> CHECK_BALANCE
 *      |                           |
 *      |                     balance > 0 -> AWAITING_USER -> MIGRATION_STARTED
 *      |                                               -> SWEEP_BROADCAST
 *      |                                               -> SWEEP_CONFIRMING
 *      |                                               -> SWEEP_COMPLETE
 *      |                                               -> MIGRATION_COMPLETE
 *      |                     balance == 0 -> MIGRATE_SILENTLY -> MIGRATION_COMPLETE
 *      +-- Any phase can transition to FAILED (auto-revert to old path)
 * ```
 *
 * **Key safety measures:**
 * - Two-phase commit: on-chain state verified before each transition
 * - Reorg resilience: 12 RSK confirmations before declaring sweep final
 * - Idempotency: resumes from last completed phase after interruption
 * - Escrow inventory check: blocks migration if active escrows exist on old address
 * - Dust tolerance: balances below 0.00001 rBTC are accepted as residual
 * - Old address preserved indefinitely for contract interactions
 * - 180-day monitoring window on old address
 *
 * @see USDT Integration Plan §4
 */

import { Preferences } from '@capacitor/preferences';
import {
	Contract,
	HDNodeWallet,
	JsonRpcProvider,
	Mnemonic,
	type TransactionReceipt,
	type TransactionRequest,
	type TransactionResponse
} from 'ethers';
import { tryCatch } from '$lib/utils/tryCatch';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Standard BIP44 Ethereum derivation path (coin type 60 — all EVM chains). */
export const STANDARD_DERIVATION_PATH = "m/44'/60'/0'/0/0";

/** RSK mainnet chain ID. */
export const RSK_MAINNET_CHAIN_ID = 30;

/** RSK testnet chain ID. */
export const RSK_TESTNET_CHAIN_ID = 31;

/** Number of RSK block confirmations required before declaring sweep final. */
export const REQUIRED_SWEEP_CONFIRMATIONS = 12;

/**
 * Dust threshold — balances below this value (in wei) are too small to sweep.
 * Residual amounts below this after gas deduction are acceptable.
 * 0.00001 rBTC = 10^10 wei.
 */
export const DUST_THRESHOLD_WEI = BigInt('10000000000');

/** Days to continue monitoring the old address post-migration. */
export const MONITORING_PERIOD_DAYS = 180;

/** Storage key for Capacitor Preferences. */
const STORAGE_KEY = 'bittasker_derivation_migration';

// ---------------------------------------------------------------------------
// State Machine Types
// ---------------------------------------------------------------------------

/**
 * Migration phase state machine — exhaustive, no implicit transitions.
 *
 * @see USDT Integration Plan §4.1
 */
export type MigrationPhase =
	| 'NOT_STARTED'
	| 'DETECTING'
	| 'CHECK_BALANCE'
	| 'AWAITING_USER'
	| 'MIGRATION_STARTED'
	| 'MIGRATE_SILENTLY'
	| 'SWEEP_BROADCAST'
	| 'SWEEP_CONFIRMING'
	| 'SWEEP_COMPLETE'
	| 'MIGRATION_COMPLETE'
	| 'FAILED';

/**
 * Discriminated union of all possible migration phase transitions.
 * Maps each source phase to the set of valid target phases.
 */
const PHASE_TRANSITIONS: Record<MigrationPhase, MigrationPhase[]> = {
	NOT_STARTED: ['DETECTING'],
	DETECTING: ['CHECK_BALANCE'],
	CHECK_BALANCE: ['AWAITING_USER', 'MIGRATE_SILENTLY'],
	AWAITING_USER: ['MIGRATION_STARTED'],
	MIGRATE_SILENTLY: ['MIGRATION_COMPLETE'],
	MIGRATION_STARTED: ['SWEEP_BROADCAST'],
	SWEEP_BROADCAST: ['SWEEP_CONFIRMING'],
	SWEEP_CONFIRMING: ['SWEEP_COMPLETE'],
	SWEEP_COMPLETE: ['MIGRATION_COMPLETE'],
	MIGRATION_COMPLETE: [],
	FAILED: []
};

/**
 * Phases that represent a terminal state (migration will not resume).
 */
export type TerminalPhase = 'NOT_STARTED' | 'MIGRATION_COMPLETE' | 'FAILED';

/**
 * All phases that involve a sweep transaction component.
 */
export const SWEEP_PHASES: ReadonlySet<MigrationPhase> = new Set([
	'MIGRATION_STARTED',
	'SWEEP_BROADCAST',
	'SWEEP_CONFIRMING',
	'SWEEP_COMPLETE'
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Persisted migration state.
 * Stored in Capacitor Preferences so the migration can resume after
 * interruption (e.g. app backgrounding, crash, or process kill).
 *
 * On-chain state is always the source of truth; this is a recovery hint.
 */
export interface MigrationState {
	/** Current phase of the state machine. */
	phase: MigrationPhase;

	/** The legacy (current) RSK wallet address (lowercased). */
	oldAddress: string | null;

	/** The standard-path-derived RSK address — target of migration (lowercased). */
	newAddress: string | null;

	/** Hash of the sweep transaction, once broadcast. */
	sweepTxHash: string | null;

	/** Number of block confirmations observed for the sweep tx. */
	confirmations: number;

	/** The derivation path used by the old/current wallet. */
	oldDerivationPath: string | null;

	/** The standard derivation path for the new wallet. */
	newDerivationPath: string;

	/** rBTC balance at the time of migration (wei string for bigint portability). */
	balanceAtMigration: string | null;

	/** If phase === FAILED, the error message explaining why. */
	error: string | null;

	/** Last update timestamp (epoch ms). */
	updatedAt: number;
}

/**
 * Input required to start a migration.
 */
export interface MigrationInput {
	oldAddress: string;
	newAddress: string;
	oldDerivationPath: string;
	newDerivationPath: string;
}

/**
 * Result of a legacy path detection.
 */
export interface PathDetectionResult {
	/** Whether a legacy (non-standard) path was detected. */
	isLegacy: boolean;

	/** The current RSK wallet address from the active SDK wallet. */
	currentAddress: string;

	/** The address derived from the standard BIP44 Ethereum path. */
	standardAddress: string;

	/** Whether the two addresses match. `false` means migration is needed. */
	addressesMatch: boolean;
}

/**
 * An active escrow found during the inventory check.
 */
export interface ActiveEscrow {
	/** On-chain escrow identifier (numeric string). */
	id: string;

	/** Counterparty address (lowercased). */
	counterparty: string;

	/** Escrow amount in wei (string for bigint portability). */
	amount: string;

	/** Current on-chain escrow status (0 = Funded, 1 = InDispute, etc.). */
	status: number;
}

/**
 * Result of an escrow inventory check.
 */
export interface EscrowInventory {
	/** Number of active escrows tied to the old address. */
	count: number;

	/** List of active escrows tied to the old address. */
	escrows: ActiveEscrow[];

	/** Whether migration is safe to proceed (no unresolved escrows). */
	safeToMigrate: boolean;

	/** Warning message if not safe to migrate; null if safe. */
	warning: string | null;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export const INITIAL_MIGRATION_STATE: MigrationState = {
	phase: 'NOT_STARTED',
	oldAddress: null,
	newAddress: null,
	sweepTxHash: null,
	confirmations: 0,
	oldDerivationPath: null,
	newDerivationPath: STANDARD_DERIVATION_PATH,
	balanceAtMigration: null,
	error: null,
	updatedAt: 0
};

// ---------------------------------------------------------------------------
// Pure Functions (deterministic, no side effects)
// ---------------------------------------------------------------------------

/**
 * Calculate the sweep amount: balance minus estimated gas cost.
 * Pure function — deterministic for given inputs.
 *
 * @param balanceWei - Full rBTC balance in wei
 * @param estimatedGasWei - Estimated gas cost in wei
 * @returns Amount to transfer (balance - gas), or 0n if gas exceeds or equals
 *          balance
 *
 * @example
 * ```ts
 * calculateSweepAmount(100000n, 21000n) // => 79000n
 * calculateSweepAmount(10000n, 21000n)  // => 0n (gas exceeds balance)
 * ```
 */
export function calculateSweepAmount(balanceWei: bigint, estimatedGasWei: bigint): bigint {
	if (balanceWei < 0n || estimatedGasWei < 0n) {
		return 0n;
	}
	if (estimatedGasWei >= balanceWei) {
		return 0n;
	}
	return balanceWei - estimatedGasWei;
}

/**
 * Check whether an amount in wei is at or below the dust threshold.
 * Pure function — deterministic for given input.
 *
 * @param amountWei - The amount to check in wei
 * @returns `true` if `amountWei` <= {@link DUST_THRESHOLD_WEI}
 *
 * @example
 * ```ts
 * isDust(1n)               // => true
 * isDust(10000000000n)     // => true (exactly at threshold)
 * isDust(10000000001n)     // => false (one wei above threshold)
 * ```
 */
export function isDust(amountWei: bigint): boolean {
	if (amountWei < 0n) {
		return true;
	}
	return amountWei <= DUST_THRESHOLD_WEI;
}

/**
 * Check whether a derivation path is the standard BIP44 Ethereum path.
 * Pure function — string equality.
 *
 * @param path - The derivation path to check
 * @returns `true` if the path is the standard EVM path
 */
export function isStandardPath(path: string): boolean {
	return path === STANDARD_DERIVATION_PATH;
}

/**
 * Derive an RSK wallet address from a mnemonic phrase using a specific
 * derivation path. Pure function — deterministic for given inputs.
 *
 * @param mnemonicPhrase - BIP39 mnemonic phrase (space-separated words)
 * @param derivationPath - BIP44 derivation path (e.g. `"m/44'/60'/0'/0/0"`)
 * @returns The derived wallet address (checksummed)
 * @throws If the mnemonic is invalid or the path cannot be derived
 */
export function deriveAddress(mnemonicPhrase: string, derivationPath: string): string {
	const mnemonicObj = Mnemonic.fromPhrase(mnemonicPhrase);
	const hdNode = HDNodeWallet.fromMnemonic(mnemonicObj, derivationPath);
	return hdNode.address;
}

/**
 * Detect whether the current RSK wallet uses a legacy derivation path by
 * comparing its address against the standard BIP44 Ethereum path address.
 * Pure function — deterministic for given inputs.
 *
 * @param mnemonicPhrase - BIP39 mnemonic phrase
 * @param currentAddress - Current RSK wallet address from the active SDK wallet
 * @returns Detection result with both addresses for comparison
 *
 * @example
 * ```ts
 * const result = detectLegacyPath(mnemonic, '0xOldLegacyAddr...');
 * // If result.isLegacy, the wallet needs migration
 * ```
 */
export function detectLegacyPath(
	mnemonicPhrase: string,
	currentAddress: string
): PathDetectionResult {
	const standardAddress = deriveAddress(mnemonicPhrase, STANDARD_DERIVATION_PATH);
	const addressesMatch = standardAddress.toLowerCase() === currentAddress.toLowerCase();

	return {
		isLegacy: !addressesMatch,
		currentAddress,
		standardAddress,
		addressesMatch
	};
}

/**
 * Validate that a transition from one migration phase to another is legal
 * according to the state machine definition.
 * Pure function — deterministic.
 *
 * Transition to `FAILED` is valid from any non-terminal, non-FAILED phase.
 *
 * @param current - The current phase
 * @param next - The proposed next phase
 * @returns `true` if the transition is valid
 */
export function isValidTransition(current: MigrationPhase, next: MigrationPhase): boolean {
	// FAILED is reachable from any non-terminal, non-FAILED phase
	if (next === 'FAILED') {
		return current !== 'FAILED' && current !== 'MIGRATION_COMPLETE';
	}

	const allowed = PHASE_TRANSITIONS[current];
	if (allowed === undefined) {
		return false;
	}
	return allowed.includes(next);
}

/**
 * Determine the next phase from the balance check result.
 * Pure function — deterministic.
 *
 * @param balanceWei - The rBTC balance in wei
 * @returns `'AWAITING_USER'` if balance > 0, `'MIGRATE_SILENTLY'` if balance == 0
 */
export function determineNextPhaseFromBalance(
	balanceWei: bigint
): 'AWAITING_USER' | 'MIGRATE_SILENTLY' {
	return balanceWei > 0n ? 'AWAITING_USER' : 'MIGRATE_SILENTLY';
}

/**
 * Estimate gas cost for a simple rBTC value transfer (21000 gas).
 * Pure function — deterministic.
 *
 * In production the exact gas price comes from `provider.getFeeData()`.
 *
 * @param gasPriceWei - Current gas price in wei (from provider)
 * @returns Estimated gas cost in wei
 */
export function estimateTransferGas(gasPriceWei: bigint): bigint {
	if (gasPriceWei < 0n) {
		return 0n;
	}
	// A simple value transfer uses 21000 gas
	const GAS_LIMIT_SIMPLE_TRANSFER = 21000n;
	return gasPriceWei * GAS_LIMIT_SIMPLE_TRANSFER;
}

/**
 * Build a migration input object from detection results.
 * Pure function — deterministic.
 *
 * @param result - The path detection result
 * @param oldDerivationPath - The detected legacy derivation path
 * @returns A migration input ready to pass to `startMigration`
 */
export function buildMigrationInput(
	result: PathDetectionResult,
	oldDerivationPath: string
): MigrationInput {
	return {
		oldAddress: result.currentAddress,
		newAddress: result.standardAddress,
		oldDerivationPath,
		newDerivationPath: STANDARD_DERIVATION_PATH
	};
}

// ---------------------------------------------------------------------------
// State Management
// ---------------------------------------------------------------------------

/**
 * Load persisted migration state from Capacitor Preferences.
 *
 * @returns The stored migration state, or `INITIAL_MIGRATION_STATE` if none
 *          exists or loading fails (corrupt data is treated as no data).
 */
export async function loadState(): Promise<MigrationState> {
	const { error: getError, data: getResult } = await tryCatch(
		Preferences.get({ key: STORAGE_KEY })
	);

	if (getError !== null || getResult === null) {
		return { ...INITIAL_MIGRATION_STATE };
	}

	const json = getResult.value;

	if (json === null || json === undefined) {
		return { ...INITIAL_MIGRATION_STATE };
	}

	try {
		const parsed: unknown = JSON.parse(json);

		if (parsed === null || typeof parsed !== 'object') {
			return { ...INITIAL_MIGRATION_STATE };
		}

		const raw = parsed as Record<string, unknown>;

		if (typeof raw.phase !== 'string') {
			return { ...INITIAL_MIGRATION_STATE };
		}

		return {
			phase: raw.phase as MigrationPhase,
			oldAddress: typeof raw.oldAddress === 'string' ? raw.oldAddress : null,
			newAddress: typeof raw.newAddress === 'string' ? raw.newAddress : null,
			sweepTxHash: typeof raw.sweepTxHash === 'string' ? raw.sweepTxHash : null,
			confirmations: typeof raw.confirmations === 'number' ? raw.confirmations : 0,
			oldDerivationPath: typeof raw.oldDerivationPath === 'string' ? raw.oldDerivationPath : null,
			newDerivationPath:
				typeof raw.newDerivationPath === 'string'
					? raw.newDerivationPath
					: STANDARD_DERIVATION_PATH,
			balanceAtMigration:
				typeof raw.balanceAtMigration === 'string' ? raw.balanceAtMigration : null,
			error: typeof raw.error === 'string' ? raw.error : null,
			updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0
		};
	} catch {
		console.warn('[DerivationMigrator] Failed to parse persisted migration state from Preferences');
		return { ...INITIAL_MIGRATION_STATE };
	}
}

/**
 * Persist migration state to Capacitor Preferences.
 * Automatically updates `updatedAt` to the current time.
 *
 * @param state - The migration state to persist
 * @returns An error if the write fails, or `null` on success
 */
export async function saveState(state: MigrationState): Promise<{ error: Error | null }> {
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
 * Reset migration state to initial (NOT_STARTED).
 * Call after migration completes or when the user cancels.
 *
 * @returns An error if the clear fails, or `null` on success
 */
export async function resetState(): Promise<{ error: Error | null }> {
	const { error } = await tryCatch(Preferences.remove({ key: STORAGE_KEY }));

	if (error !== null) {
		return { error: error instanceof Error ? error : new Error(String(error)) };
	}

	return { error: null };
}

/**
 * Transition the state machine to the next phase.
 *
 * Validates the transition against the state machine definition.
 * Persists the updated state to Capacitor Preferences.
 * `FAILED` is reachable from any non-terminal phase.
 *
 * @param current - Current migration state
 * @param nextPhase - Target phase to transition to
 * @param updates - Additional state fields to update atomically with the transition
 * @returns The new migration state, or an error if the transition is invalid
 *          or persistence fails
 */
export async function transitionTo(
	current: MigrationState,
	nextPhase: MigrationPhase,
	updates: Partial<MigrationState> = {}
): Promise<{ data: MigrationState | null; error: Error | null }> {
	if (!isValidTransition(current.phase, nextPhase)) {
		return {
			data: null,
			error: new Error(`Invalid transition: ${current.phase} -> ${nextPhase}`)
		};
	}

	const newState: MigrationState = {
		...current,
		...updates,
		phase: nextPhase,
		error: nextPhase === 'FAILED' ? (updates.error ?? 'Migration failed') : (updates.error ?? null),
		updatedAt: Date.now()
	};

	const { error: saveError } = await saveState(newState);
	if (saveError !== null) {
		return { data: null, error: saveError };
	}

	return { data: newState, error: null };
}

// ---------------------------------------------------------------------------
// Migration Operations
// ---------------------------------------------------------------------------

/**
 * Detect whether the current wallet uses a legacy derivation path and return
 * the comparison result. Pure detection — does not modify any state.
 *
 * @param mnemonicPhrase - BIP39 mnemonic phrase
 * @param currentAddress - Current RSK wallet address from the active SDK wallet
 * @returns Detection result, or an error if address derivation fails
 */
export async function detectAndCheckMigration(
	mnemonicPhrase: string,
	currentAddress: string
): Promise<{ data: PathDetectionResult | null; error: Error | null }> {
	try {
		const result = detectLegacyPath(mnemonicPhrase, currentAddress);
		return { data: result, error: null };
	} catch (error) {
		return {
			data: null,
			error: error instanceof Error ? error : new Error(String(error))
		};
	}
}

/**
 * Check the rBTC balance of a wallet address using the given provider.
 *
 * @param provider - A connected JsonRpcProvider for RSK
 * @param address - The address to check
 * @returns The balance in wei, or an error
 */
export async function checkBalance(
	provider: JsonRpcProvider,
	address: string
): Promise<{ data: bigint | null; error: Error | null }> {
	const { data, error } = await tryCatch(provider.getBalance(address));

	if (error !== null) {
		return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
	}

	return { data, error: null };
}

/**
 * Sweep all rBTC from the old (legacy) address to the new (standard) address,
 * subtracting an estimated gas fee.
 *
 * @param provider - A connected JsonRpcProvider for RSK
 * @param wallet - An ethers HDNodeWallet connected to the old (legacy) address
 * @param newAddress - The target address (derived from standard path)
 * @returns The transaction response, or an error
 */
export async function sweepFunds(
	provider: JsonRpcProvider,
	wallet: HDNodeWallet,
	newAddress: string
): Promise<{ data: TransactionResponse | null; error: Error | null }> {
	// 1. Get current balance
	const { data: balance, error: balanceError } = await checkBalance(provider, wallet.address);
	if (balanceError !== null) {
		return { data: null, error: balanceError };
	}
	if (balance === null) {
		return { data: null, error: new Error('Failed to fetch balance') };
	}

	// 2. Get gas price from provider
	const { data: feeData, error: feeError } = await tryCatch(provider.getFeeData());
	if (feeError !== null) {
		return { data: null, error: new Error('Failed to fetch gas price') };
	}

	const gasPrice = feeData?.gasPrice ?? BigInt('100000000'); // 0.1 gwei fallback
	const estimatedGas = estimateTransferGas(gasPrice);
	const sweepAmount = calculateSweepAmount(balance, estimatedGas);

	// 3. Validate sweep amount
	if (sweepAmount <= 0n) {
		return {
			data: null,
			error: new Error(
				`Balance (${balance} wei) too low to cover estimated gas (${estimatedGas} wei)`
			)
		};
	}

	if (isDust(sweepAmount)) {
		return {
			data: null,
			error: new Error(
				`Sweep amount (${sweepAmount} wei) is below dust threshold (${DUST_THRESHOLD_WEI} wei). ` +
					`Balance: ${balance} wei, estimated gas: ${estimatedGas} wei.`
			)
		};
	}

	// 4. Build and sign the sweep transaction
	const connectedWallet = wallet.connect(provider);
	const txRequest: TransactionRequest = {
		to: newAddress,
		value: sweepAmount,
		gasPrice
	};

	const { data: tx, error: txError } = await tryCatch(connectedWallet.sendTransaction(txRequest));
	if (txError !== null) {
		return { data: null, error: txError instanceof Error ? txError : new Error(String(txError)) };
	}

	return { data: tx, error: null };
}

/**
 * Poll for a sweep transaction receipt and wait for the required number of
 * block confirmations.
 *
 * Polls every 2 seconds up to `maxWaitMs`. Returns whatever confirmations
 * are available on timeout, with a partial-result error so the caller can
 * decide whether to retry.
 *
 * @param provider - A connected JsonRpcProvider for RSK
 * @param txHash - The sweep transaction hash
 * @param requiredConfirmations - Confirmations required (default: 12)
 * @param maxWaitMs - Maximum total wait time in ms (default: 300000 = 5 min)
 * @returns Receipt + confirmation count, or an error
 */
export async function confirmSweep(
	provider: JsonRpcProvider,
	txHash: string,
	requiredConfirmations: number = REQUIRED_SWEEP_CONFIRMATIONS,
	maxWaitMs: number = 300000
): Promise<{
	data: { receipt: TransactionReceipt; confirmations: number } | null;
	error: Error | null;
}> {
	const startTime = Date.now();
	const POLL_INTERVAL_MS = 2000;

	while (Date.now() - startTime < maxWaitMs) {
		const { data: receipt, error: receiptError } = await tryCatch(
			provider.getTransactionReceipt(txHash)
		);

		if (receiptError !== null) {
			// Transient RPC error — keep polling
			await sleep(POLL_INTERVAL_MS);
			continue;
		}

		if (receipt === null) {
			// Transaction not yet mined
			await sleep(POLL_INTERVAL_MS);
			continue;
		}

		// Check for reverted transaction
		if (receipt.status === 0) {
			return {
				data: null,
				error: new Error(`Sweep transaction reverted: ${txHash}`)
			};
		}

		// Compute confirmations from current block
		const { data: currentBlock, error: blockError } = await tryCatch(provider.getBlockNumber());

		if (blockError !== null) {
			// Transient — keep polling
			await sleep(POLL_INTERVAL_MS);
			continue;
		}

		const confirmations = currentBlock - receipt.blockNumber + 1;

		if (confirmations >= requiredConfirmations) {
			return {
				data: { receipt, confirmations },
				error: null
			};
		}

		// Not enough confirmations yet
		await sleep(POLL_INTERVAL_MS);
	}

	// Timeout: get best-effort confirmation count
	const { data: finalReceipt } = await tryCatch(provider.getTransactionReceipt(txHash));

	if (finalReceipt === null) {
		return {
			data: null,
			error: new Error(`Sweep transaction not found after ${maxWaitMs}ms: ${txHash}`)
		};
	}

	const latestBlock = await provider.getBlockNumber().catch(() => finalReceipt.blockNumber);
	const partialConfirmations = latestBlock - finalReceipt.blockNumber + 1;

	return {
		data: { receipt: finalReceipt, confirmations: partialConfirmations },
		error: new Error(
			`Sweep reached ${partialConfirmations}/${requiredConfirmations} confirmations in ${maxWaitMs}ms`
		)
	};
}

// ---------------------------------------------------------------------------
// Escrow Inventory Check
// ---------------------------------------------------------------------------

/**
 * Minimal ABI fragment for RSK escrow contract event + state queries.
 */
const ESCROW_ABI_FRAGMENT = [
	'event EscrowCreated(uint256 indexed escrowId, address indexed tasker, address indexed taskee, uint256 amount, uint256 estimatedStartTime, uint256 estimatedCompletionTime, uint256 timelock)',
	'function getEscrow(uint256 escrowId) view returns (address tasker, address taskee, uint256 amount, uint256 estimatedStartTime, uint256 estimatedCompletionTime, uint256 timelockEnd, uint256 createdAt, uint256 taskerFeeTier, uint256 taskeeFeeTier, uint256 state, bool noShowMarked)'
];

/**
 * Check for active escrows tied to the given address on RSK.
 *
 * Queries the escrow contract for past `EscrowCreated` events where the
 * address was either tasker or taskee, then checks each escrow's current
 * on-chain state to determine if it is still active.
 *
 * @param provider - A connected JsonRpcProvider for RSK
 * @param escrowContractAddress - The RSK escrow contract address (checksummed)
 * @param address - The address to inspect (typically the legacy old address)
 * @returns Escrow inventory result, or an error
 */
export async function checkEscrowInventory(
	provider: JsonRpcProvider,
	escrowContractAddress: string,
	address: string
): Promise<{ data: EscrowInventory | null; error: Error | null }> {
	try {
		const contract = new Contract(escrowContractAddress, ESCROW_ABI_FRAGMENT, provider);

		const addrLower = address.toLowerCase();

		// Query past EscrowCreated events where address is tasker or taskee
		const taskerFilter = contract.filters.EscrowCreated(null, addrLower, null);
		const taskeeFilter = contract.filters.EscrowCreated(null, null, addrLower);

		// Query the last ~50000 blocks for escrow events
		const [taskerEvents, taskeeEvents] = await Promise.all([
			contract.queryFilter(taskerFilter, -50000),
			contract.queryFilter(taskeeFilter, -50000)
		]);

		const allEvents = [...taskerEvents, ...taskeeEvents];
		const seenIds = new Set<string>();
		const escrows: ActiveEscrow[] = [];

		for (const event of allEvents) {
			const eventArgs = (event as unknown as Record<string, unknown>).args as
				| Record<string, unknown>
				| undefined;
			if (!eventArgs) continue;

			const escrowId = eventArgs.escrowId?.toString();
			if (!escrowId || seenIds.has(escrowId)) continue;
			seenIds.add(escrowId);

			// Fetch current on-chain state
			const escrowData = await contract.getEscrow(escrowId);
			const state = Number(escrowData.state);

			// States >= 2 (DisputeResolved) are final — escrow is resolved
			const isActive = state < 2;

			if (isActive) {
				const tasker = (escrowData.tasker ?? '').toLowerCase();
				const taskee = (escrowData.taskee ?? '').toLowerCase();
				const counterparty = tasker === addrLower ? taskee : tasker;

				escrows.push({
					id: escrowId,
					counterparty,
					amount: escrowData.amount?.toString() ?? '0',
					status: state
				});
			}
		}

		const count = escrows.length;

		return {
			data: {
				count,
				escrows,
				safeToMigrate: count === 0,
				warning:
					count > 0
						? `There ${count === 1 ? 'is 1 active escrow' : `are ${count} active escrows`} ` +
							`tied to your current address. These must be resolved before migration. ` +
							`The old address will remain accessible for contract interactions.`
						: null
			},
			error: null
		};
	} catch (error) {
		return {
			data: null,
			error: error instanceof Error ? error : new Error(String(error))
		};
	}
}

// ---------------------------------------------------------------------------
// Wallet & Provider Helpers
// ---------------------------------------------------------------------------

/**
 * Create an HDNodeWallet from a mnemonic and derivation path, connected to
 * the given provider.
 *
 * @param mnemonicPhrase - BIP39 mnemonic phrase
 * @param derivationPath - BIP44 derivation path
 * @param provider - Provider to connect the wallet to
 * @returns A connected HDNodeWallet
 */
export function buildWallet(
	mnemonicPhrase: string,
	derivationPath: string,
	provider: JsonRpcProvider
): HDNodeWallet {
	const mnemonicObj = Mnemonic.fromPhrase(mnemonicPhrase);
	const hdNode = HDNodeWallet.fromMnemonic(mnemonicObj, derivationPath);
	return hdNode.connect(provider) as HDNodeWallet;
}

/**
 * Get the RSK RPC URL and chain ID from the environment configuration.
 *
 * @returns An object with `rpcUrl` and `chainId` for the configured RSK network
 */
export function getRSKConfig(): { rpcUrl: string; chainId: number } {
	const network =
		typeof import.meta !== 'undefined' && import.meta.env
			? ((import.meta.env.VITE_RSK_NETWORK as string | undefined) ?? 'testnet')
			: 'testnet';

	if (network === 'mainnet') {
		return {
			rpcUrl: 'https://public-node.rsk.co',
			chainId: RSK_MAINNET_CHAIN_ID
		};
	}

	return {
		rpcUrl: 'https://public-node.testnet.rsk.co',
		chainId: RSK_TESTNET_CHAIN_ID
	};
}

/**
 * Get the current migration status from the persisted state.
 * Provides summary booleans for the UI layer.
 *
 * @returns The current state with convenience flags
 */
export async function getMigrationStatus(): Promise<{
	state: MigrationState;
	needsResume: boolean;
	requiresUserConsent: boolean;
	isComplete: boolean;
	isFailed: boolean;
}> {
	const state = await loadState();

	const resumablePhases: MigrationPhase[] = [
		'DETECTING',
		'CHECK_BALANCE',
		'MIGRATION_STARTED',
		'SWEEP_BROADCAST',
		'SWEEP_CONFIRMING'
	];

	return {
		state,
		needsResume: resumablePhases.includes(state.phase),
		requiresUserConsent: state.phase === 'AWAITING_USER',
		isComplete: state.phase === 'MIGRATION_COMPLETE',
		isFailed: state.phase === 'FAILED'
	};
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
