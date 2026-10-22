import { beforeEach, describe, expect, it, vi } from 'vitest';
import { preloadData } from '$app/navigation';
import type { Task } from '$lib/types/task';
import { prefetchTask, recallTask, rememberTask } from '$lib/utils/tasks/task-detail-cache';

vi.mock('$app/navigation', () => ({
	preloadData: vi.fn().mockResolvedValue(undefined),
	goto: vi.fn()
}));

describe('task detail cache', () => {
	beforeEach(() => {
		vi.mocked(preloadData).mockClear();
	});

	it('remembers a task from the list and recalls it by the route id', () => {
		const task = { id: 'task/1', title: 'Logo design' } as Task;
		rememberTask(task);
		expect(recallTask('task/1')?.title).toBe('Logo design');
		expect(recallTask(encodeURIComponent('task/1'))?.title).toBe('Logo design');
		expect(recallTask('missing')).toBeNull();
	});

	it('prefetches the task page on hover', () => {
		prefetchTask({ id: 'task-9', title: 'WordPress fix' } as Task);
		expect(recallTask('task-9')?.title).toBe('WordPress fix');
		expect(preloadData).toHaveBeenCalledWith('/tasks/task-9');
	});
});
