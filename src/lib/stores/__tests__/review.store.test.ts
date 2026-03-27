import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
	completeTreeUpdate,
	dequeueTreeUpdate,
	failTreeUpdate,
	queueTreeUpdate,
	replaceTreeUpdateQueue,
	resetTreeStatus,
	treeUpdateQueue,
	treeUpdateStatus
} from '../review.store';

describe('review store queue bookkeeping', () => {
	beforeEach(() => {
		resetTreeStatus();
	});

	it('keeps pendingUpdates in sync when queue items are added and removed', () => {
		const first = queueTreeUpdate('first');
		const second = queueTreeUpdate('second');

		expect(get(treeUpdateStatus).pendingUpdates).toBe(2);

		dequeueTreeUpdate(first);
		expect(get(treeUpdateStatus).pendingUpdates).toBe(1);

		dequeueTreeUpdate(second);
		expect(get(treeUpdateStatus).pendingUpdates).toBe(0);
	});

	it('does not clear pending count when an update fails but remains queued', () => {
		queueTreeUpdate('first');

		failTreeUpdate('boom');

		expect(get(treeUpdateQueue)).toHaveLength(1);
		expect(get(treeUpdateStatus).pendingUpdates).toBe(1);
		expect(get(treeUpdateStatus).error).toBe('boom');
	});

	it('recomputes pending count when the queue is externally replaced', () => {
		queueTreeUpdate('first');
		queueTreeUpdate('second');
		queueTreeUpdate('third');

		replaceTreeUpdateQueue(get(treeUpdateQueue).slice(0, 2));

		expect(get(treeUpdateQueue)).toHaveLength(2);
		expect(get(treeUpdateStatus).pendingUpdates).toBe(2);
	});

	it('does not mutate pending count on completion without queue removal', () => {
		queueTreeUpdate('first');

		completeTreeUpdate('v1', '0xroot');

		expect(get(treeUpdateStatus).pendingUpdates).toBe(1);
	});
});
