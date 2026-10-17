import { describe, expect, it } from 'vitest';
import { chainSyncPlan } from '$lib/stores/wallet/chain-sync';

describe('chainSyncPlan', () => {
	it('does not start a second loop when attach already started one', () => {
		expect(chainSyncPlan({ running: true }, true)).toBe('running');
		expect(chainSyncPlan({ status: 'started' }, true)).toBe('running');
	});

	it('starts only when status says the loop is stopped', () => {
		expect(chainSyncPlan({ running: false }, true)).toBe('start');
		expect(chainSyncPlan(undefined, true)).toBe('skip');
		expect(chainSyncPlan({ running: false }, false)).toBe('skip');
	});
});
