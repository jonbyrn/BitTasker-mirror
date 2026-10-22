import { beforeEach, describe, expect, it, vi } from 'vitest';
import nostrEventsService from '$lib/api/services/nostr/events';
import type { Task } from '$lib/types/task';
import { rememberTask } from '$lib/utils/tasks/task-detail-cache';
import { load } from '../../../../routes/(app)/tasks/[taskId]/+page';

vi.mock('$lib/api/services/nostr/events', () => ({
	default: {
		findEventById: vi.fn(),
		requestEvents: vi.fn()
	}
}));

describe('task detail load', () => {
	beforeEach(() => {
		vi.mocked(nostrEventsService.findEventById).mockReset();
		vi.mocked(nostrEventsService.requestEvents).mockReset();
	});

	it('returns a skeleton payload without waiting on relays', async () => {
		const started = performance.now();
		const data = await load({ params: { taskId: 'not-cached' } } as never);
		expect(performance.now() - started).toBeLessThan(50);
		expect(data.taskId).toBe('not-cached');
		expect(data.seo.task).toBeNull();
		expect(data.seo.title).toBe('Task Details - BitTasker');
		expect(nostrEventsService.findEventById).not.toHaveBeenCalled();
		expect(nostrEventsService.requestEvents).not.toHaveBeenCalled();
	});

	it('returns the task remembered from the list', async () => {
		rememberTask({
			id: 'cached-task',
			title: 'Logo design',
			description: 'A brand mark',
			budget: { amount: 40 }
		} as Task);

		const data = await load({ params: { taskId: 'cached-task' } } as never);
		expect(data.seo.task?.title).toBe('Logo design');
		expect(data.seo.title).toBe('Logo design - BitTasker');
		expect(data.seo.jsonLd).toMatchObject({ title: 'Logo design' });
		expect(nostrEventsService.findEventById).not.toHaveBeenCalled();
	});
});
