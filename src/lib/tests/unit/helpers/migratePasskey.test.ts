import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import {
	passkeyMigration,
	startMigrationCountdown,
	resetMigration
} from '$lib/utils/helpers/migratePasskey';

describe('migratePasskey', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		resetMigration();
	});

	describe('resetMigration', () => {
		it('clears the countdown interval so it does not keep firing after reset', () => {
			startMigrationCountdown();
			expect(get(passkeyMigration).countdown).toBe(30);

			resetMigration();
			expect(get(passkeyMigration).countdown).toBe(30);
			expect(get(passkeyMigration).isOpen).toBe(false);

			// Advance time; if interval were still active, countdown would decrement
			vi.advanceTimersByTime(5000);

			// Countdown should still be 30 (interval was cleared, so no ticks ran)
			expect(get(passkeyMigration).countdown).toBe(30);
		});

		it('resets store state to initial values', () => {
			passkeyMigration.update((s) => ({
				...s,
				isOpen: true,
				state: 'error',
				countdown: 5,
				error: 'Something failed',
				shouldProceed: true,
				context: {
					npub: 'x',
					decryptedData: { nsec: 'y', mnemonic: 'z' },
					deviceId: 'd',
					deviceName: 'n',
					platform: 'web'
				}
			}));

			resetMigration();

			expect(get(passkeyMigration)).toEqual({
				isOpen: false,
				state: 'info',
				countdown: 30,
				error: null,
				shouldProceed: false,
				context: null
			});
		});
	});
});
