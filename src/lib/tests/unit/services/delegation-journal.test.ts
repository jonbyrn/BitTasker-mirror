import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Preferences } from '@capacitor/preferences';
import {
	addEntry,
	getEntries,
	getEntry,
	updateEntry,
	getIncompleteDelegations,
	pruneCompleted,
	validateJournalEntry,
	type DelegationJournalEntry,
	type DelegationJournalInput
} from '$lib/services/delegation-journal';

// ---------------------------------------------------------------------------
// In-memory storage mock for Capacitor Preferences
// ---------------------------------------------------------------------------

let storage: Record<string, string> = {};

beforeEach(() => {
	storage = {};
	vi.mocked(Preferences.get).mockImplementation(async ({ key }: { key: string }) => ({
		value: storage[key] ?? null
	}));
	vi.mocked(Preferences.set).mockImplementation(
		async ({ key, value }: { key: string; value: string }) => {
			storage[key] = value;
		}
	);
});

afterEach(() => {
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validInput: DelegationJournalInput = {
	chainId: 56,
	status: 'AUTH_SIGNING' as const,
	senderAddress: '0xsender1234567890abcdef1234567890abcdef12',
	recipientAddress: '0xrecipient1234567890abcdef1234567890abcd',
	amount: '500.00',
	tokenSymbol: 'USDT',
	tx1Hash: null,
	tx2Hash: null
};

describe('delegation-journal', () => {
	describe('addEntry', () => {
		it('creates entry with auto-generated fields', async () => {
			const { data, error } = await addEntry(validInput);

			expect(error).toBeNull();
			expect(data).not.toBeNull();
			expect(data!.id).toBeTruthy();
			expect(data!.id.length).toBeGreaterThan(0);
			expect(data!.createdAt).toBeGreaterThan(0);
			expect(data!.updatedAt).toBeGreaterThan(0);
			expect(data!.completed).toBe(false);
			expect(data!.error).toBeNull();
			expect(data!.retryCount).toBe(0);
		});

		it('persists entry to Capacitor Preferences', async () => {
			const { data } = await addEntry(validInput);

			expect(Preferences.set).toHaveBeenCalledOnce();
			const setCall = vi.mocked(Preferences.set).mock.calls[0]?.[0];
			expect(setCall?.key).toBe('bittasker_delegation_journal');

			const persisted = JSON.parse(setCall?.value ?? '{}');
			expect(persisted).toHaveLength(1);
			expect(persisted[0].id).toBe(data!.id);
		});

		it('preserves all input fields', async () => {
			const { data } = await addEntry(validInput);

			expect(data!.chainId).toBe(56);
			expect(data!.status).toBe('AUTH_SIGNING');
			expect(data!.senderAddress).toBe(validInput.senderAddress);
			expect(data!.recipientAddress).toBe(validInput.recipientAddress);
			expect(data!.amount).toBe('500.00');
			expect(data!.tokenSymbol).toBe('USDT');
			expect(data!.tx1Hash).toBeNull();
			expect(data!.tx2Hash).toBeNull();
		});

		it('appends entries without overwriting existing ones', async () => {
			await addEntry(validInput);
			await addEntry({ ...validInput, amount: '250.00' });

			const { data } = await getEntries();
			expect(data).toHaveLength(2);
		});

		it('returns error when Preferences.get fails', async () => {
			vi.mocked(Preferences.get).mockRejectedValueOnce(new Error('Storage read error'));

			const { data, error } = await addEntry(validInput);
			expect(data).toBeNull();
			expect(error).toBeTruthy();
		});

		it('returns error when Preferences.set fails', async () => {
			vi.mocked(Preferences.set).mockRejectedValueOnce(new Error('Storage write error'));

			const { data, error } = await addEntry(validInput);
			expect(data).toBeNull();
			expect(error).toBeTruthy();
		});
	});

	describe('getEntries', () => {
		it('returns all entries sorted by createdAt descending', async () => {
			// Add entries with slight delay to ensure different timestamps
			await addEntry(validInput);
			await new Promise((r) => setTimeout(r, 5));
			await addEntry({ ...validInput, amount: '250.00' });

			const { data } = await getEntries();
			expect(data).toHaveLength(2);
			expect(data[0].amount).toBe('250.00'); // Most recent first
			expect(data[1].amount).toBe('500.00');
		});

		it('returns empty array when no entries exist', async () => {
			const { data, error } = await getEntries();
			expect(data).toEqual([]);
			expect(error).toBeNull();
		});

		it('returns error when Preferences.get fails', async () => {
			vi.mocked(Preferences.get).mockRejectedValueOnce(new Error('Storage error'));

			const { data, error } = await getEntries();
			expect(data).toEqual([]);
			expect(error).toBeTruthy();
		});
	});

	describe('getEntry', () => {
		it('returns entry by ID', async () => {
			const { data: created } = await addEntry(validInput);
			const { data } = await getEntry(created!.id);

			expect(data).not.toBeNull();
			expect(data!.id).toBe(created!.id);
		});

		it('returns null for non-existent ID', async () => {
			await addEntry(validInput);
			const { data } = await getEntry('nonexistent-id');

			expect(data).toBeNull();
		});

		it('returns null for empty string ID', async () => {
			const { data } = await getEntry('');
			expect(data).toBeNull();
		});
	});

	describe('updateEntry', () => {
		it('updates specified fields', async () => {
			const { data: created } = await addEntry(validInput);

			const { data: updated } = await updateEntry(created!.id, {
				status: 'AUTH_SIGNED',
				tx1Hash: '0xtx1hash'
			});

			expect(updated).not.toBeNull();
			expect(updated!.status).toBe('AUTH_SIGNED');
			expect(updated!.tx1Hash).toBe('0xtx1hash');
		});

		it('updates updatedAt timestamp', async () => {
			const { data: created } = await addEntry(validInput);
			const originalUpdatedAt = created!.updatedAt;

			await new Promise((r) => setTimeout(r, 5));
			const { data: updated } = await updateEntry(created!.id, {
				status: 'AUTH_SIGNED'
			});

			expect(updated!.updatedAt).toBeGreaterThan(originalUpdatedAt);
		});

		it('persists changes to Capacitor Preferences', async () => {
			const { data: created } = await addEntry(validInput);
			vi.clearAllMocks();

			await updateEntry(created!.id, { status: 'TX1_SUBMITTED' });

			expect(Preferences.set).toHaveBeenCalledOnce();
			const setCall = vi.mocked(Preferences.set).mock.calls[0]?.[0];
			const persisted = JSON.parse(setCall?.value ?? '{}');
			expect(persisted[0].status).toBe('TX1_SUBMITTED');
		});

		it('returns error for non-existent ID', async () => {
			await addEntry(validInput);
			const { data, error } = await updateEntry('nonexistent', { status: 'TX1_SUBMITTED' });
			expect(data).toBeNull();
			expect(error).toBeTruthy();
			expect(error!.message).toContain('not found');
		});

		it('returns error when journal is empty', async () => {
			const { data, error } = await updateEntry('some-id', { status: 'TX1_SUBMITTED' });
			expect(data).toBeNull();
			expect(error).toBeTruthy();
			expect(error!.message).toContain('empty');
		});

		it('does not mutate other entries', async () => {
			await addEntry(validInput);
			const { data: second } = await addEntry({ ...validInput, amount: '100.00' });

			await updateEntry(second!.id, { status: 'TX1_MINED' });

			const { data: all } = await getEntries();
			const firstEntry = all.find((e) => e.id !== second!.id);
			expect(firstEntry!.status).toBe('AUTH_SIGNING');
		});

		it('sets completed flag', async () => {
			const { data: created } = await addEntry(validInput);
			const { data: updated } = await updateEntry(created!.id, { completed: true });

			expect(updated!.completed).toBe(true);
		});

		it('sets error message', async () => {
			const { data: created } = await addEntry(validInput);
			const { data: updated } = await updateEntry(created!.id, {
				error: 'Transaction reverted'
			});

			expect(updated!.error).toBe('Transaction reverted');
		});

		it('increments retryCount', async () => {
			const { data: created } = await addEntry(validInput);
			const { data: updated } = await updateEntry(created!.id, { retryCount: 3 });

			expect(updated!.retryCount).toBe(3);
		});
	});

	describe('getIncompleteDelegations', () => {
		it('returns entries that are not completed', async () => {
			await addEntry(validInput);
			const { data: completed } = await addEntry({ ...validInput, amount: '200.00' });
			await updateEntry(completed!.id, { completed: true });

			const { data } = await getIncompleteDelegations();
			expect(data).toHaveLength(1);
			expect(data[0].amount).toBe('500.00');
		});

		it('excludes entries with IDLE status', async () => {
			await addEntry({ ...validInput, status: 'IDLE' });

			const { data } = await getIncompleteDelegations();
			expect(data).toHaveLength(0);
		});

		it('excludes entries with TX2_MINED status', async () => {
			await addEntry({ ...validInput, status: 'TX2_MINED' });

			const { data } = await getIncompleteDelegations();
			expect(data).toHaveLength(0);
		});

		it('includes entries in intermediate states', async () => {
			await addEntry({ ...validInput, status: 'AUTH_SIGNED' });
			await addEntry({ ...validInput, status: 'TX1_SUBMITTED' });

			const { data } = await getIncompleteDelegations();
			expect(data).toHaveLength(2);
		});

		it('returns empty array when all entries are completed', async () => {
			const { data: e1 } = await addEntry(validInput);
			await updateEntry(e1!.id, { completed: true });

			const { data } = await getIncompleteDelegations();
			expect(data).toHaveLength(0);
		});

		it('returns entries sorted by updatedAt descending', async () => {
			const { data: first } = await addEntry(validInput);
			await new Promise((r) => setTimeout(r, 5));
			const { data: second } = await addEntry({ ...validInput, amount: '300.00' });

			// Update the first entry to make it newer
			await new Promise((r) => setTimeout(r, 5));
			await updateEntry(first!.id, { status: 'AUTH_SIGNED' });

			const { data } = await getIncompleteDelegations();
			expect(data[0].id).toBe(first!.id); // Updated most recently
			expect(data[1].id).toBe(second!.id);
		});

		it('returns empty array on storage error', async () => {
			vi.mocked(Preferences.get).mockRejectedValueOnce(new Error('Storage error'));

			const { data, error } = await getIncompleteDelegations();
			expect(data).toEqual([]);
			expect(error).toBeTruthy();
		});
	});

	describe('pruneCompleted', () => {
		it('returns 0 when no entries exist', async () => {
			const { data, error } = await pruneCompleted();
			expect(data).toBe(0);
			expect(error).toBeNull();
		});

		it('does not prune recent completed entries', async () => {
			const { data: entry } = await addEntry(validInput);
			await updateEntry(entry!.id, { completed: true });

			const { data } = await pruneCompleted();
			expect(data).toBe(0);
		});

		it('does not prune incomplete entries regardless of age', async () => {
			// Mock Date.now to make entry appear old but incomplete
			const realNow = Date.now;
			Date.now = vi.fn(() => 0); // epoch = very old

			await addEntry(validInput); // created at epoch, not completed

			Date.now = realNow; // restore

			const { data } = await pruneCompleted();
			expect(data).toBe(0);
		});

		it('caps entries at MAX_ENTRIES (100)', async () => {
			// Add 110 entries
			for (let i = 0; i < 110; i++) {
				await addEntry({ ...validInput, amount: `${i}.00` });
			}

			const { data } = await pruneCompleted();
			expect(data).toBe(10); // 110 - 100 = 10 pruned

			const { data: remaining } = await getEntries();
			expect(remaining).toHaveLength(100);
		});

		it('returns 0 on storage error', async () => {
			vi.mocked(Preferences.get).mockRejectedValueOnce(new Error('Storage error'));

			const { data, error } = await pruneCompleted();
			expect(data).toBe(0);
			expect(error).toBeTruthy();
		});
	});

	describe('corrupt storage recovery', () => {
		it('returns empty array for null storage value', async () => {
			vi.mocked(Preferences.get).mockResolvedValueOnce({ value: null });

			const { data, error } = await getEntries();
			expect(data).toEqual([]);
			expect(error).toBeNull();
		});

		it('returns empty array for undefined storage value', async () => {
			vi.mocked(Preferences.get).mockResolvedValueOnce({ value: undefined as unknown as string });

			const { data, error } = await getEntries();
			expect(data).toEqual([]);
			expect(error).toBeNull();
		});

		it('returns empty array for malformed JSON', async () => {
			vi.mocked(Preferences.get).mockResolvedValueOnce({ value: 'not valid json' });

			const { data, error } = await getEntries();
			expect(data).toEqual([]);
			expect(error).toBeNull();
		});

		it('returns empty array when stored value is not an array', async () => {
			vi.mocked(Preferences.get).mockResolvedValueOnce({
				value: JSON.stringify({ not: 'an array' })
			});

			const { data, error } = await getEntries();
			expect(data).toEqual([]);
			expect(error).toBeNull();
		});

		it('recovers journal after corrupt data is encountered', async () => {
			// First call returns corrupt data
			vi.mocked(Preferences.get).mockResolvedValueOnce({ value: 'corrupt' });

			// Read should return empty
			const { data: firstRead } = await getEntries();
			expect(firstRead).toEqual([]);

			// Now add a new entry - should overwrite corrupt data
			const { data: entry } = await addEntry(validInput);
			expect(entry).not.toBeNull();

			// Subsequent read should return the new entry
			const { data: secondRead } = await getEntries();
			expect(secondRead).toHaveLength(1);
		});
	});

	describe('validateJournalEntry', () => {
		const validEntry: DelegationJournalEntry = {
			id: 'test-uuid-1234',
			chainId: 56,
			status: 'AUTH_SIGNING',
			tx1Hash: null,
			tx2Hash: null,
			senderAddress: '0xsender',
			recipientAddress: '0xrecipient',
			amount: '500.00',
			tokenSymbol: 'USDT',
			createdAt: 1000,
			updatedAt: 1000,
			completed: false,
			error: null,
			retryCount: 0
		};

		it('returns valid for a correctly structured entry', () => {
			const result = validateJournalEntry(validEntry);
			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it('rejects empty id', () => {
			const result = validateJournalEntry({ ...validEntry, id: '' });
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('id must not be empty');
		});

		it('rejects non-positive chainId', () => {
			const result = validateJournalEntry({ ...validEntry, chainId: 0 });
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('chainId must be a positive integer');
		});

		it('rejects empty senderAddress', () => {
			const result = validateJournalEntry({ ...validEntry, senderAddress: '' });
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('senderAddress must not be empty');
		});

		it('rejects empty recipientAddress', () => {
			const result = validateJournalEntry({ ...validEntry, recipientAddress: '' });
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('recipientAddress must not be empty');
		});

		it('rejects empty amount', () => {
			const result = validateJournalEntry({ ...validEntry, amount: '' });
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('amount must not be empty');
		});

		it('rejects empty tokenSymbol', () => {
			const result = validateJournalEntry({ ...validEntry, tokenSymbol: '' });
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('tokenSymbol must not be empty');
		});

		it('rejects non-positive createdAt', () => {
			const result = validateJournalEntry({ ...validEntry, createdAt: 0 });
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('createdAt must be a positive timestamp');
		});

		it('rejects non-positive updatedAt', () => {
			const result = validateJournalEntry({ ...validEntry, updatedAt: 0 });
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('updatedAt must be a positive timestamp');
		});

		it('rejects negative retryCount', () => {
			const result = validateJournalEntry({ ...validEntry, retryCount: -1 });
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('retryCount must not be negative');
		});

		it('accumulates multiple validation errors', () => {
			const result = validateJournalEntry({
				...validEntry,
				chainId: 0,
				senderAddress: '',
				recipientAddress: ''
			});
			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThanOrEqual(3);
		});
	});
});
