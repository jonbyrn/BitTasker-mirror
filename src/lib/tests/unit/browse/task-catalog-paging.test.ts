import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '$lib/types/task.d';

vi.mock('$lib/nostr/findTasks', () => ({
	findTasks: vi.fn()
}));

import { findTasks } from '$lib/nostr/findTasks';
import { readTaskCatalog, resetSharedCatalog } from '$lib/browse/shared-catalog';

function row(id: string, npub: string, createdAt: number): Task {
	return { id, npub, createdAt } as Task;
}

describe('task catalog until paging', () => {
	beforeEach(() => {
		resetSharedCatalog();
		vi.mocked(findTasks).mockReset();
	});

	it('requests until until a relay page is short and keeps the newest pubkey+d', async () => {
		vi.mocked(findTasks)
			.mockResolvedValueOnce({
				tasks: [row('newer', 'author-a', 500), row('older-copy', 'author-a', 400)],
				total: 2,
				hasMore: true,
				filled: true,
				oldestCreatedAt: 100
			})
			.mockResolvedValueOnce({
				tasks: [row('newer', 'author-a', 300), row('relay2-task', 'author-b', 80)],
				total: 2,
				hasMore: false,
				filled: false,
				oldestCreatedAt: 80
			});

		const rows = await readTaskCatalog();

		expect(vi.mocked(findTasks).mock.calls.map((call) => call[0]?.until)).toEqual([undefined, 99]);
		expect(rows.map((task) => `${task.npub}:${task.id}`)).toEqual([
			'author-a:newer',
			'author-a:older-copy',
			'author-b:relay2-task'
		]);
	});
});
