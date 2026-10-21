import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeaturedTasksService, isFeaturedTestTask } from '$lib/services/featuredTasks.service';
import { findTasks } from '$lib/nostr/findTasks';
import type { Task } from '$lib/types/task.d';
import { BudgetTypeEnum, TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';

vi.mock('$lib/nostr/findTasks', () => ({
	findTasks: vi.fn()
}));

function task(overrides: Partial<Task> = {}): Task {
	return {
		id: overrides.id ?? 'task-1',
		npub: 'author-a',
		status: TaskStatusEnum.OPEN,
		title: overrides.title ?? 'Clean the kitchen',
		description: overrides.description ?? 'Need help this Saturday.',
		taskType: TaskTypeEnum.IN_PERSON,
		budget: { amount: 20, currency: 'USD', type: BudgetTypeEnum.FIXED },
		deadline: null,
		dateRange: null,
		pickupLocation: null,
		dropOffLocation: null,
		skills: [],
		categories: [],
		estimatedHours: 1,
		isRemovals: false,
		isBoosted: false,
		boostPercentage: null,
		createdAt: overrides.createdAt ?? 10,
		updatedAt: '',
		completedAt: null,
		cancelledAt: null,
		deletedAt: null,
		isDeleted: false,
		requiredSkills: [],
		...overrides
	};
}

describe('featured homepage tasks', () => {
	beforeEach(() => {
		FeaturedTasksService.clearCache();
		vi.mocked(findTasks).mockReset();
	});

	it('recognizes probe posts, token specs, and email addresses', () => {
		expect(
			isFeaturedTestTask({ title: 'Clean the kitchen', description: 'Saturday morning' })
		).toBe(false);
		expect(isFeaturedTestTask({ title: 'probe task', description: 'ignore' })).toBe(true);
		expect(isFeaturedTestTask({ title: 'Yard work', description: 'ERC-1155 metadata spec' })).toBe(
			true
		);
		expect(
			isFeaturedTestTask({ title: 'Moving help', description: 'Write me at ada@example.com' })
		).toBe(true);
	});

	it('leaves real tasks on the homepage and hides test listings', async () => {
		vi.mocked(findTasks).mockResolvedValue({
			tasks: [
				task({
					id: 'real',
					title: 'Furniture assembly',
					description: 'A bookshelf in the living room'
				}),
				task({ id: 'probe', title: 'probe: homepage check', description: 'temporary' }),
				task({ id: 'token', title: 'Write a spec', description: 'Cover ERC1155 transfers' }),
				task({ id: 'mail', title: 'Design a logo', description: 'Send drafts to sam@studio.co' })
			],
			total: 4,
			page: 1,
			limit: 50
		} as Awaited<ReturnType<typeof findTasks>>);

		const featured = await FeaturedTasksService.getFeaturedTasks(8);

		expect(featured.map((item) => item.id)).toEqual(['real']);
	});
});
