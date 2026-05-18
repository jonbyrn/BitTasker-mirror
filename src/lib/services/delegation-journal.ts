/**
 * DelegationJournal — Phase 1.5
 *
 * Persistent record of every EIP-7702 delegation and its outcome, stored in
 * Capacitor Preferences.
 *
 * **Key design decisions:**
 * - The journal is a **recovery hint**, not the source of truth. On-chain state
 *   (`getCode(address)`, transaction receipts) is always authoritative.
 * - Completed entries are pruned after 30 days. The journal retains at most
 *   100 entries at any time.
 * - On app restart, call `getIncompleteDelegations()` to find delegations that
 *   may need recovery.
 * - All async operations use `tryCatch()` from `src/lib/utils/tryCatch.ts`.
 *
 * @see USDT Integration Plan §2.6 (Delegation Recovery Algorithm)
 */

import { Preferences } from '@capacitor/preferences';
import { tryCatch } from '$lib/utils/tryCatch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * EIP-7702 delegation lifecycle states.
 * Maps to the state machine defined in USDT Integration Plan §2.1.
 */
export type DelegationState =
	| 'IDLE'
	| 'AUTH_SIGNING'
	| 'AUTH_SIGNED'
	| 'TX1_SUBMITTED'
	| 'TX1_MINED'
	| 'CLEANUP_NEEDED'
	| 'TX2_SUBMITTED'
	| 'TX2_MINED'
	| 'RECOVERY_NEEDED';

/**
 * A single delegation journal entry.
 *
 * Timestamps are Unix epoch milliseconds (UTC).
 * All monetary amounts are stored as strings to avoid bigint serialisation
 * issues with Capacitor Preferences (which uses JSON.stringify internally).
 */
export interface DelegationJournalEntry {
	/** Unique identifier (UUID v4) */
	id: string;

	/** EVM chain ID where the delegation was created */
	chainId: number;

	/** Current delegation lifecycle state */
	status: DelegationState;

	/** Delegation + business logic transaction hash (Tx1), or null if not yet submitted */
	tx1Hash: string | null;

	/** Cleanup transaction hash (Tx2), or null if not yet submitted */
	tx2Hash: string | null;

	/** Sender / EOA address (lowercased) */
	senderAddress: string;

	/** Recipient address (lowercased) */
	recipientAddress: string;

	/** Human-readable amount string (e.g. '500.00') */
	amount: string;

	/** Token symbol (e.g. 'USDT') */
	tokenSymbol: string;

	/** Creation timestamp (epoch ms) */
	createdAt: number;

	/** Last update timestamp (epoch ms) */
	updatedAt: number;

	/** Whether the full lifecycle (including cleanup) has completed successfully */
	completed: boolean;

	/** Error message from last failed operation, or null */
	error: string | null;

	/** Number of retry attempts for recovery */
	retryCount: number;
}

/**
 * Fields that can be updated on an existing entry.
 */
export type DelegationJournalUpdate = Partial<
	Pick<
		DelegationJournalEntry,
		'status' | 'tx1Hash' | 'tx2Hash' | 'completed' | 'error' | 'retryCount'
	>
>;

/**
 * Fields required when creating a new entry.
 * `id`, `createdAt`, `updatedAt`, and `completed` are auto-generated.
 */
export type DelegationJournalInput = Omit<
	DelegationJournalEntry,
	'id' | 'createdAt' | 'updatedAt' | 'completed' | 'error' | 'retryCount'
>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Capacitor Preferences storage key for the serialised journal. */
const STORAGE_KEY = 'bittasker_delegation_journal';

/** Maximum number of entries retained after pruning. */
const MAX_ENTRIES = 100;

/** Age threshold for pruning completed entries (in days). */
const PRUNE_AGE_DAYS = 30;

/** Milliseconds per day. */
const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Generate a UUID v4 string.
 * Pure function — produces a random UUID deterministically formatted.
 */
function generateId(): string {
	return crypto.randomUUID();
}

/**
 * Compute the current Unix epoch timestamp in milliseconds.
 * Pure function from the runtime perspective.
 */
function now(): number {
	return Date.now();
}

/**
 * Serialise the journal entries array to a JSON string for Capacitor Preferences.
 *
 * @param entries - The journal entries
 * @returns A JSON string
 */
function serialise(entries: DelegationJournalEntry[]): string {
	return JSON.stringify(entries);
}

/**
 * Deserialise a JSON string back into a journal entries array.
 * Returns an empty array for null/undefined input.
 *
 * @param json - The JSON string from Capacitor Preferences
 * @returns The deserialised entries array (empty on parse failure)
 */
function deserialise(json: string | null): DelegationJournalEntry[] {
	if (json === null || json === undefined) {
		return [];
	}

	try {
		const parsed: unknown = JSON.parse(json);

		if (!Array.isArray(parsed)) {
			return [];
		}

		return parsed as DelegationJournalEntry[];
	} catch {
		console.warn('[DelegationJournal] Failed to deserialise journal entries from Preferences');
		return [];
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Add a new delegation journal entry.
 *
 * @param input - The entry data (without auto-generated fields)
 * @returns A `Result` containing the created entry, or an error
 *
 * @example
 * ```ts
 * const { data, error } = await addEntry({
 *   chainId: 56,
 *   status: 'AUTH_SIGNING',
 *   senderAddress: '0xabc...',
 *   recipientAddress: '0xdef...',
 *   amount: '500.00',
 *   tokenSymbol: 'USDT',
 *   tx1Hash: null,
 *   tx2Hash: null,
 * });
 * ```
 */
export async function addEntry(
	input: DelegationJournalInput
): Promise<{ data: DelegationJournalEntry | null; error: Error | null }> {
	const { data: existing, error: readError } = await readAllEntries();
	if (readError !== null) {
		return { data: null, error: readError };
	}

	const entries = existing ?? [];

	const entry: DelegationJournalEntry = {
		...input,
		id: generateId(),
		createdAt: now(),
		updatedAt: now(),
		completed: false,
		error: null,
		retryCount: 0
	};

	entries.push(entry);

	const { error: writeError } = await writeAllEntries(entries);
	if (writeError !== null) {
		return { data: null, error: writeError };
	}

	return { data: entry, error: null };
}

/**
 * Retrieve all journal entries (most recently created first).
 *
 * @returns A `Result` containing all entries, or an error
 */
export async function getEntries(): Promise<{
	data: DelegationJournalEntry[];
	error: Error | null;
}> {
	const { data, error } = await readAllEntries();
	if (error !== null) {
		return { data: [], error };
	}

	const entries = data ?? [];

	// Sort by createdAt descending (newest first)
	entries.sort((a, b) => b.createdAt - a.createdAt);

	return { data: entries, error: null };
}

/**
 * Retrieve a single entry by its ID.
 *
 * @param id - The entry's UUID
 * @returns A `Result` containing the entry, or `null` if not found
 */
export async function getEntry(
	id: string
): Promise<{ data: DelegationJournalEntry | null; error: Error | null }> {
	const { data: entries, error } = await readAllEntries();
	if (error !== null) {
		return { data: null, error };
	}

	const entry = (entries ?? []).find((e) => e.id === id);
	return { data: entry ?? null, error: null };
}

/**
 * Update an existing journal entry.
 *
 * Only the fields in `updates` are modified; all other fields remain unchanged.
 * `updatedAt` is automatically set to the current time.
 *
 * @param id - The entry's UUID
 * @param updates - The fields to update
 * @returns A `Result` containing the updated entry, or an error
 */
export async function updateEntry(
	id: string,
	updates: DelegationJournalUpdate
): Promise<{ data: DelegationJournalEntry | null; error: Error | null }> {
	const { data: entries, error: readError } = await readAllEntries();
	if (readError !== null) {
		return { data: null, error: readError };
	}

	if (entries === null || entries.length === 0) {
		return { data: null, error: new Error('Journal is empty; cannot update entry') };
	}

	const index = entries.findIndex((e) => e.id === id);
	if (index === -1) {
		return { data: null, error: new Error(`Entry not found: ${id}`) };
	}

	entries[index] = {
		...entries[index],
		...updates,
		updatedAt: now()
	};

	const { error: writeError } = await writeAllEntries(entries);
	if (writeError !== null) {
		return { data: null, error: writeError };
	}

	return { data: entries[index], error: null };
}

/**
 * Retrieve all incomplete (not yet fully cleaned up) delegations.
 * Used during app startup to find pending recovery work.
 *
 * The caller (DelegationManager) should verify on-chain state before acting.
 *
 * @returns A `Result` containing incomplete entries
 */
export async function getIncompleteDelegations(): Promise<{
	data: DelegationJournalEntry[];
	error: Error | null;
}> {
	const { data: entries, error } = await readAllEntries();
	if (error !== null) {
		return { data: [], error };
	}

	const incomplete = (entries ?? []).filter(
		(e) => !e.completed && e.status !== 'IDLE' && e.status !== 'TX2_MINED'
	);

	return { data: incomplete.sort((a, b) => b.updatedAt - a.updatedAt), error: null };
}

/**
 * Prune completed entries that are older than 30 days, then enforce the
 * maximum entry cap of 100 (keeping only the most recent entries).
 *
 * @returns A `Result` containing the number of pruned entries
 */
export async function pruneCompleted(): Promise<{
	data: number;
	error: Error | null;
}> {
	const { data: entries, error: readError } = await readAllEntries();
	if (readError !== null) {
		return { data: 0, error: readError };
	}

	if (entries === null || entries.length === 0) {
		return { data: 0, error: null };
	}

	const cutoff = now() - PRUNE_AGE_DAYS * MS_PER_DAY;
	let prunedCount = 0;

	// Step 1: Remove completed entries older than 30 days
	const afterAgePrune = entries.filter((e) => {
		if (e.completed && e.updatedAt < cutoff) {
			prunedCount++;
			return false;
		}
		return true;
	});

	// Step 2: Enforce max entry cap (keep the most recent entries)
	let afterCapPrune: DelegationJournalEntry[];
	if (afterAgePrune.length > MAX_ENTRIES) {
		afterAgePrune.sort((a, b) => b.updatedAt - a.updatedAt);
		afterCapPrune = afterAgePrune.slice(0, MAX_ENTRIES);
		prunedCount += afterAgePrune.length - MAX_ENTRIES;
	} else {
		afterCapPrune = afterAgePrune;
	}

	const { error: writeError } = await writeAllEntries(afterCapPrune);
	if (writeError !== null) {
		return { data: prunedCount, error: writeError };
	}

	return { data: prunedCount, error: null };
}

// ---------------------------------------------------------------------------
// Internal storage helpers
// ---------------------------------------------------------------------------

/**
 * Read all entries from Capacitor Preferences.
 */
async function readAllEntries(): Promise<{
	data: DelegationJournalEntry[] | null;
	error: Error | null;
}> {
	const result = await tryCatch(Preferences.get({ key: STORAGE_KEY }));

	if (result.error !== null) {
		return {
			data: null,
			error: result.error instanceof Error ? result.error : new Error(String(result.error))
		};
	}

	const json = result.data?.value ?? null;
	const entries = deserialise(json);

	return { data: entries, error: null };
}

/**
 * Write the full entries array to Capacitor Preferences.
 */
async function writeAllEntries(
	entries: DelegationJournalEntry[]
): Promise<{ error: Error | null }> {
	const json = serialise(entries);

	const result = await tryCatch(Preferences.set({ key: STORAGE_KEY, value: json }));

	if (result.error !== null) {
		return {
			error: result.error instanceof Error ? result.error : new Error(String(result.error))
		};
	}

	return { error: null };
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export interface JournalValidationResult {
	valid: boolean;
	errors: string[];
}

/**
 * Validate a journal entry for structural correctness.
 * Pure function — no side effects, deterministic output for a given input.
 *
 * @param entry - The journal entry to validate
 * @returns Validation result with list of errors (empty if valid)
 */
export function validateJournalEntry(entry: DelegationJournalEntry): JournalValidationResult {
	const errors: string[] = [];

	if (entry.id.length === 0) {
		errors.push('id must not be empty');
	}

	if (entry.chainId <= 0) {
		errors.push('chainId must be a positive integer');
	}

	if (entry.senderAddress.length === 0) {
		errors.push('senderAddress must not be empty');
	}

	if (entry.recipientAddress.length === 0) {
		errors.push('recipientAddress must not be empty');
	}

	if (entry.amount.length === 0) {
		errors.push('amount must not be empty');
	}

	if (entry.tokenSymbol.length === 0) {
		errors.push('tokenSymbol must not be empty');
	}

	if (entry.createdAt <= 0) {
		errors.push('createdAt must be a positive timestamp');
	}

	if (entry.updatedAt <= 0) {
		errors.push('updatedAt must be a positive timestamp');
	}

	if (entry.retryCount < 0) {
		errors.push('retryCount must not be negative');
	}

	return { valid: errors.length === 0, errors };
}
