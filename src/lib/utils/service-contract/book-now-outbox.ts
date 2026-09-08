export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export const BOOK_NOW_OUTBOX_STORAGE_KEY = 'bittasker.book-now-outbox.v1';
export const DEFAULT_BOOK_NOW_SUBMISSION_LOCK_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_BOOK_NOW_RECOVERABLE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type BookNowOutboxState =
	| 'idle'
	| 'submission_locked'
	| 'funding_submitted'
	| 'contract_created'
	| 'escrow_created'
	| 'contract_sync_pending'
	| 'contract_ready'
	| 'contract_creation_failed';

export interface BookNowOutboxEntry {
	fingerprint: string;
	state: BookNowOutboxState;
	createdAtMs: number;
	updatedAtMs: number;
	lockOwnerId?: string;
	lockExpiresAtMs?: number;
	instantOrderId?: string;
	amountBtc?: string;
	transactionHash?: string;
	escrowId?: string;
	needsCleanup?: boolean;
}

export interface AcquireBookNowSubmissionLockResult {
	acquired: boolean;
	entry: BookNowOutboxEntry;
	reason: 'acquired' | 'renewed' | 'already_locked' | 'recoverable_exists';
}

export interface UpdateBookNowOutboxEntryInput {
	fingerprint: string;
	state: BookNowOutboxState;
	nowMs?: number;
	lockOwnerId?: string;
	lockTtlMs?: number;
	instantOrderId?: string | null;
	amountBtc?: string | null;
	transactionHash?: string | null;
	escrowId?: string | null;
	needsCleanup?: boolean | null;
	expectedLockOwnerId?: string;
	expectedUpdatedAtMs?: number;
}

interface BookNowOutboxSnapshot {
	entries: Record<string, BookNowOutboxEntry>;
}

function normalizeFingerprint(fingerprint: unknown): string | null {
	if (typeof fingerprint !== 'string') {
		return null;
	}

	const normalized = fingerprint.trim().toLowerCase();
	return normalized || null;
}

function normalizeOptionalString(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}

	const normalized = value.trim();
	return normalized || undefined;
}

function isFinitePositiveNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

const VALID_TRANSITIONS: Record<BookNowOutboxState, BookNowOutboxState[]> = {
	idle: ['submission_locked'],
	submission_locked: ['funding_submitted', 'idle'],
	funding_submitted: ['contract_created', 'contract_sync_pending', 'idle'],
	contract_created: ['escrow_created', 'contract_sync_pending', 'idle'],
	escrow_created: ['contract_sync_pending', 'idle'],
	contract_sync_pending: ['contract_ready', 'contract_creation_failed', 'idle'],
	contract_ready: [], // terminal
	contract_creation_failed: ['idle'] // can retry
};

function isBookNowOutboxState(value: unknown): value is BookNowOutboxState {
	return (
		value === 'idle' ||
		value === 'submission_locked' ||
		value === 'funding_submitted' ||
		value === 'contract_created' ||
		value === 'escrow_created' ||
		value === 'contract_sync_pending' ||
		value === 'contract_ready' ||
		value === 'contract_creation_failed'
	);
}

function isRecoverableState(state: BookNowOutboxState): boolean {
	if (state === 'idle') return false; // idle entries should be pruned
	return state !== 'contract_ready';
}

function normalizeEntry(entry: unknown): BookNowOutboxEntry | null {
	if (!entry || typeof entry !== 'object') {
		return null;
	}

	const candidate = entry as Partial<BookNowOutboxEntry>;
	const fingerprint = normalizeFingerprint(candidate.fingerprint);
	if (
		!fingerprint ||
		!isBookNowOutboxState(candidate.state) ||
		!isFinitePositiveNumber(candidate.createdAtMs) ||
		!isFinitePositiveNumber(candidate.updatedAtMs)
	) {
		return null;
	}

	const lockOwnerId = normalizeOptionalString(candidate.lockOwnerId);
	const lockExpiresAtMs = isFinitePositiveNumber(candidate.lockExpiresAtMs)
		? candidate.lockExpiresAtMs
		: undefined;

	return {
		fingerprint,
		state: candidate.state,
		createdAtMs: candidate.createdAtMs,
		updatedAtMs: candidate.updatedAtMs,
		lockOwnerId,
		lockExpiresAtMs,
		instantOrderId: normalizeOptionalString(candidate.instantOrderId),
		amountBtc: normalizeOptionalString(candidate.amountBtc),
		transactionHash: normalizeOptionalString(candidate.transactionHash)?.toLowerCase(),
		escrowId: normalizeOptionalString(candidate.escrowId)
	};
}

function loadSnapshot(storage: StorageLike | null | undefined): BookNowOutboxSnapshot {
	if (!storage) {
		return { entries: {} };
	}

	const serialized = storage.getItem(BOOK_NOW_OUTBOX_STORAGE_KEY);
	if (!serialized) {
		return { entries: {} };
	}

	try {
		const parsed = JSON.parse(serialized) as Partial<BookNowOutboxSnapshot>;
		const rawEntries =
			parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : undefined;

		if (!rawEntries) {
			storage.removeItem(BOOK_NOW_OUTBOX_STORAGE_KEY);
			return { entries: {} };
		}

		const entries = Object.fromEntries(
			Object.entries(rawEntries)
				.map(([key, value]) => {
					const normalizedKey = normalizeFingerprint(key);
					const normalizedEntry = normalizeEntry(value);
					if (!normalizedKey || !normalizedEntry || normalizedEntry.fingerprint !== normalizedKey) {
						return null;
					}
					return [normalizedKey, normalizedEntry];
				})
				.filter((value): value is [string, BookNowOutboxEntry] => Boolean(value))
		);

		return { entries };
	} catch {
		storage.removeItem(BOOK_NOW_OUTBOX_STORAGE_KEY);
		return { entries: {} };
	}
}

function persistSnapshot(
	storage: StorageLike | null | undefined,
	snapshot: BookNowOutboxSnapshot
): void {
	if (!storage) {
		return;
	}

	if (!Object.keys(snapshot.entries).length) {
		storage.removeItem(BOOK_NOW_OUTBOX_STORAGE_KEY);
		return;
	}

	storage.setItem(BOOK_NOW_OUTBOX_STORAGE_KEY, JSON.stringify(snapshot));
}

function isExpiredSubmissionLock(entry: BookNowOutboxEntry, nowMs: number): boolean {
	return (
		entry.state === 'submission_locked' &&
		(!isFinitePositiveNumber(entry.lockExpiresAtMs) || entry.lockExpiresAtMs <= nowMs)
	);
}

function isStaleRecoverableEntry(
	entry: BookNowOutboxEntry,
	nowMs: number,
	maxAgeMs: number
): boolean {
	if (!isRecoverableState(entry.state)) {
		return false;
	}

	if (!isFinitePositiveNumber(nowMs) || !isFinitePositiveNumber(maxAgeMs)) {
		return true;
	}

	if (isExpiredSubmissionLock(entry, nowMs)) {
		return true;
	}

	return nowMs - entry.updatedAtMs > maxAgeMs;
}

function pruneSnapshot(
	snapshot: BookNowOutboxSnapshot,
	nowMs: number,
	maxAgeMs: number
): BookNowOutboxSnapshot {
	const entries = Object.fromEntries(
		Object.entries(snapshot.entries).filter(([, entry]) => {
			// Always remove entries marked for cleanup
			if (entry.needsCleanup) {
				return false;
			}

			if (!isRecoverableState(entry.state)) {
				return false;
			}

			return !isStaleRecoverableEntry(entry, nowMs, maxAgeMs);
		})
	);

	return { entries };
}

export function createBookNowSubmissionLockEntry(
	fingerprint: string,
	lockOwnerId: string,
	nowMs = Date.now(),
	lockTtlMs = DEFAULT_BOOK_NOW_SUBMISSION_LOCK_TTL_MS
): BookNowOutboxEntry {
	const normalizedFingerprint = normalizeFingerprint(fingerprint);
	const normalizedLockOwnerId = normalizeOptionalString(lockOwnerId);
	if (!normalizedFingerprint) {
		throw new Error('Book Now outbox requires a fingerprint.');
	}
	if (!normalizedLockOwnerId) {
		throw new Error('Book Now outbox requires a lock owner id.');
	}
	if (!isFinitePositiveNumber(nowMs)) {
		throw new Error('Book Now outbox requires a valid timestamp.');
	}
	if (!isFinitePositiveNumber(lockTtlMs)) {
		throw new Error('Book Now outbox requires a positive lock TTL.');
	}

	return {
		fingerprint: normalizedFingerprint,
		state: 'submission_locked',
		createdAtMs: nowMs,
		updatedAtMs: nowMs,
		lockOwnerId: normalizedLockOwnerId,
		lockExpiresAtMs: nowMs + lockTtlMs
	};
}

export function acquireBookNowSubmissionLock(
	storage: StorageLike | null | undefined,
	fingerprint: string,
	lockOwnerId: string,
	nowMs = Date.now(),
	lockTtlMs = DEFAULT_BOOK_NOW_SUBMISSION_LOCK_TTL_MS,
	maxAgeMs = DEFAULT_BOOK_NOW_RECOVERABLE_MAX_AGE_MS
): AcquireBookNowSubmissionLockResult {
	const normalizedFingerprint = normalizeFingerprint(fingerprint);
	const normalizedLockOwnerId = normalizeOptionalString(lockOwnerId);
	if (!normalizedFingerprint) {
		throw new Error('Book Now outbox requires a fingerprint.');
	}
	if (!normalizedLockOwnerId) {
		throw new Error('Book Now outbox requires a lock owner id.');
	}

	const snapshot = pruneSnapshot(loadSnapshot(storage), nowMs, maxAgeMs);
	const existingEntry = snapshot.entries[normalizedFingerprint];

	// Capture version timestamp for TOCTOU check
	const originalUpdatedAtMs = existingEntry?.updatedAtMs;

	if (existingEntry) {
		if (existingEntry.state === 'submission_locked') {
			if (existingEntry.lockOwnerId === normalizedLockOwnerId) {
				// Check if lock has expired before allowing renewal
				if (isExpiredSubmissionLock(existingEntry, nowMs)) {
					// Lock expired, don't allow renewal - let another session acquire
					persistSnapshot(storage, snapshot);
					return { acquired: false, entry: existingEntry, reason: 'already_locked' };
				}
				// Reload to detect concurrent modification (TOCTOU protection)
				const reloadedSnapshot = loadSnapshot(storage);
				const reloadedEntry = reloadedSnapshot.entries[normalizedFingerprint];
				// Check both updatedAtMs and lockExpiresAtMs to detect any concurrent modification
				// including lock renewals by other sessions that changed the expiration time
				if (
					reloadedEntry &&
					(reloadedEntry.updatedAtMs !== originalUpdatedAtMs ||
						reloadedEntry.lockExpiresAtMs !== existingEntry.lockExpiresAtMs)
				) {
					// Entry was modified by another process - abort
					return {
						acquired: false,
						entry: reloadedEntry,
						reason: 'already_locked'
					};
				}

				const renewedEntry = createBookNowSubmissionLockEntry(
					normalizedFingerprint,
					normalizedLockOwnerId,
					nowMs,
					lockTtlMs
				);
				renewedEntry.createdAtMs = existingEntry.createdAtMs;
				renewedEntry.updatedAtMs = nowMs;
				snapshot.entries[normalizedFingerprint] = renewedEntry;
				persistSnapshot(storage, snapshot);
				return { acquired: true, entry: renewedEntry, reason: 'renewed' };
			}

			persistSnapshot(storage, snapshot);
			return { acquired: false, entry: existingEntry, reason: 'already_locked' };
		}

		persistSnapshot(storage, snapshot);
		return { acquired: false, entry: existingEntry, reason: 'recoverable_exists' };
	}

	const entry = createBookNowSubmissionLockEntry(
		normalizedFingerprint,
		normalizedLockOwnerId,
		nowMs,
		lockTtlMs
	);
	snapshot.entries[normalizedFingerprint] = entry;
	persistSnapshot(storage, snapshot);
	return { acquired: true, entry, reason: 'acquired' };
}

export function readRecoverableBookNowOutboxEntries(
	storage: StorageLike | null | undefined,
	nowMs = Date.now(),
	maxAgeMs = DEFAULT_BOOK_NOW_RECOVERABLE_MAX_AGE_MS
): BookNowOutboxEntry[] {
	const snapshot = pruneSnapshot(loadSnapshot(storage), nowMs, maxAgeMs);
	persistSnapshot(storage, snapshot);

	return Object.values(snapshot.entries).sort(
		(left, right) => left.updatedAtMs - right.updatedAtMs
	);
}

export function readRecoverableBookNowOutboxEntry(
	storage: StorageLike | null | undefined,
	fingerprint: string,
	nowMs = Date.now(),
	maxAgeMs = DEFAULT_BOOK_NOW_RECOVERABLE_MAX_AGE_MS
): BookNowOutboxEntry | null {
	const normalizedFingerprint = normalizeFingerprint(fingerprint);
	if (!normalizedFingerprint) {
		return null;
	}

	const snapshot = pruneSnapshot(loadSnapshot(storage), nowMs, maxAgeMs);
	persistSnapshot(storage, snapshot);
	return snapshot.entries[normalizedFingerprint] ?? null;
}

export function updateBookNowOutboxEntry(
	storage: StorageLike | null | undefined,
	input: UpdateBookNowOutboxEntryInput
): BookNowOutboxEntry {
	const normalizedFingerprint = normalizeFingerprint(input.fingerprint);
	if (!normalizedFingerprint) {
		throw new Error('Book Now outbox requires a fingerprint.');
	}

	const nowMs = input.nowMs ?? Date.now();
	if (!isFinitePositiveNumber(nowMs)) {
		throw new Error('Book Now outbox requires a valid timestamp.');
	}

	const snapshot = loadSnapshot(storage);
	const existingEntry = snapshot.entries[normalizedFingerprint];

	// TOCTOU protection: check if entry was modified concurrently
	if (
		input.expectedUpdatedAtMs !== undefined &&
		existingEntry &&
		existingEntry.updatedAtMs !== input.expectedUpdatedAtMs
	) {
		throw new Error('Concurrent modification detected');
	}

	const expectedLockOwnerId = normalizeOptionalString(input.expectedLockOwnerId);

	if (
		expectedLockOwnerId &&
		existingEntry?.state === 'submission_locked' &&
		existingEntry.lockOwnerId !== expectedLockOwnerId
	) {
		throw new Error('Book Now outbox submission lock is owned by another session.');
	}

	const nextLockOwnerId = normalizeOptionalString(input.lockOwnerId);
	const nextLockTtlMs = input.lockTtlMs ?? DEFAULT_BOOK_NOW_SUBMISSION_LOCK_TTL_MS;
	if (input.state === 'submission_locked' && !nextLockOwnerId) {
		throw new Error('Book Now outbox submission lock updates require a lock owner id.');
	}

	// Validate state transition
	if (existingEntry) {
		const allowedTransitions = VALID_TRANSITIONS[existingEntry.state];
		if (!allowedTransitions.includes(input.state)) {
			throw new Error(
				`Invalid state transition from '${existingEntry.state}' to '${input.state}'. Allowed: [${allowedTransitions.join(', ')}]`
			);
		}
	}

	const nextEntry: BookNowOutboxEntry = {
		fingerprint: normalizedFingerprint,
		state: input.state,
		createdAtMs: existingEntry?.createdAtMs ?? nowMs,
		updatedAtMs: nowMs,
		lockOwnerId: input.state === 'submission_locked' ? nextLockOwnerId : undefined,
		lockExpiresAtMs: input.state === 'submission_locked' ? nowMs + nextLockTtlMs : undefined,
		instantOrderId:
			input.instantOrderId === null
				? undefined
				: (normalizeOptionalString(input.instantOrderId) ?? existingEntry?.instantOrderId),
		amountBtc:
			input.amountBtc === null
				? undefined
				: (normalizeOptionalString(input.amountBtc) ?? existingEntry?.amountBtc),
		transactionHash:
			input.transactionHash === null
				? undefined
				: (normalizeOptionalString(input.transactionHash)?.toLowerCase() ??
					existingEntry?.transactionHash),
		escrowId:
			input.escrowId === null
				? undefined
				: (normalizeOptionalString(input.escrowId) ?? existingEntry?.escrowId),
		needsCleanup:
			input.needsCleanup === null ? undefined : (input.needsCleanup ?? existingEntry?.needsCleanup)
	};

	snapshot.entries[normalizedFingerprint] = nextEntry;
	persistSnapshot(storage, snapshot);
	return nextEntry;
}

export function clearBookNowOutboxEntry(
	storage: StorageLike | null | undefined,
	fingerprint: string
): void {
	const normalizedFingerprint = normalizeFingerprint(fingerprint);
	if (!storage || !normalizedFingerprint) {
		return;
	}

	// Note: No expectedUpdatedAtMs check needed here because deletion is idempotent.
	// If the entry was already deleted by another process, deleting it again has no effect.
	// This is fundamentally different from update operations where concurrent modifications
	// could cause data loss. For deletion, the end state is the same regardless of
	// whether another deletion occurred first.

	const snapshot = loadSnapshot(storage);
	delete snapshot.entries[normalizedFingerprint];
	persistSnapshot(storage, snapshot);
}

export function clearTerminalOrStaleBookNowOutboxEntries(
	storage: StorageLike | null | undefined,
	nowMs = Date.now(),
	maxAgeMs = DEFAULT_BOOK_NOW_RECOVERABLE_MAX_AGE_MS
): BookNowOutboxEntry[] {
	const snapshot = loadSnapshot(storage);
	const removedEntries = Object.values(snapshot.entries).filter(
		(entry) => !isRecoverableState(entry.state) || isStaleRecoverableEntry(entry, nowMs, maxAgeMs)
	);
	const nextSnapshot = pruneSnapshot(snapshot, nowMs, maxAgeMs);
	persistSnapshot(storage, nextSnapshot);
	return removedEntries.sort((left, right) => left.updatedAtMs - right.updatedAtMs);
}
