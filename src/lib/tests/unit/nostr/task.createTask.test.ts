import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readable } from 'svelte/store';
import { BudgetTypeEnum, TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';

const mockPublishEvent = vi.fn();
const mockGetSignedEvent = vi.fn();
const mockGetNpub = vi.fn();
const mockCalculatePow = vi.fn();

vi.mock('$lib/api/services/nostr/events', () => ({
	default: {
		publishEvent: (...args: unknown[]) => mockPublishEvent(...args)
	}
}));

vi.mock('$lib/utils/nostr', () => ({
	getSignedEvent: (...args: unknown[]) => mockGetSignedEvent(...args)
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: (...args: unknown[]) => mockGetNpub(...args)
}));

vi.mock('$lib/nostr', () => ({
	calculatePOW: (...args: unknown[]) => mockCalculatePow(...args)
}));

vi.mock('$lib/services/translation.service', () => ({
	TranslationService: class {
		isAvailable() {
			return false;
		}
	}
}));

vi.mock('$lib/stores/user.store', () => ({
	user: readable({
		name: 'Task Author',
		picture: 'https://example.com/avatar.png'
	})
}));

vi.mock('$lib/stores/task.store', () => ({
	tasksStore: { update: vi.fn() },
	myTasksStore: { update: vi.fn() }
}));

vi.mock('$lib/nostr/findTasks', () => ({
	cleanup: vi.fn()
}));

vi.mock('$lib/nostr/findMyTasks', () => ({
	cleanupMyTasks: vi.fn()
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: readable({
		relays: []
	})
}));

import { createTask } from '$lib/nostr/task';

describe('createTask', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

		mockGetNpub.mockResolvedValue('npub1testwriter000000000000000000000000000000');
		mockCalculatePow.mockResolvedValue(['0', '0']);
		mockGetSignedEvent.mockImplementation(async (event: Record<string, unknown>) => ({
			id: 'signed-event-id',
			pubkey: 'a'.repeat(64),
			sig: 'signature',
			...event
		}));
		mockPublishEvent.mockResolvedValue(undefined);
	});

	it('publishes versioned BSC task metadata with amountAtomic on the initial write path', async () => {
		const taskId = await createTask({
			title: 'Build payout router',
			description: 'Implement the USDT on BSC routing path.',
			taskType: TaskTypeEnum.REMOTE,
			budget: {
				amount: 12.34,
				currency: 'USD',
				type: BudgetTypeEnum.FIXED
			},
			paymentAsset: 'USDT',
			paymentNetwork: 'bsc-testnet',
			skills: ['solidity'],
			categories: ['smart-contracts'] as never[],
			status: TaskStatusEnum.OPEN
		});

		expect(taskId).toMatch(/^build-payout-router-1704067200-/);
		expect(mockPublishEvent).toHaveBeenCalledTimes(1);

		const publishedEvent = mockPublishEvent.mock.calls[0][0] as {
			content: string;
			tags: string[][];
		};
		const content = JSON.parse(publishedEvent.content);

		expect(content).toMatchObject({
			schemaVersion: 'task.v2',
			amountAtomic: '12340000',
			paymentAsset: 'USDT',
			paymentNetwork: 'bsc-testnet'
		});

		expect(publishedEvent.tags).toEqual(
			expect.arrayContaining([
				['v', 'task.v2'],
				['n', 'bsc-testnet'],
				['a', '12340000']
			])
		);
	});
});
