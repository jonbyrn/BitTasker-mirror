import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import type { TaskBodyDto } from '$lib/api/services/saved-search.service';

const hoisted = vi.hoisted(() => {
	let value = {
		task: {
			title: 'Build a modern website',
			description:
				'Need a full-stack developer to build a responsive website with React and Node.js',
			budget: {
				amount: 500,
				currency: 'USD',
				type: 'fixed'
			},
			taskType: 'remote',
			deadline: undefined,
			dateRange: undefined,
			pickupLocation: undefined,
			dropOffLocation: undefined,
			skills: ['JavaScript', 'React'],
			categories: [{ id: 'dev', name: 'Development', slug: 'development' }],
			attachments: []
		},
		id: 'task-event-123',
		currentStep: 'review',
		isRemovals: false,
		recurringTask: { isRecurring: false }
	};
	const subscribers = new Set<(nextValue: typeof value) => void>();
	const taskState = {
		subscribe(run: (nextValue: typeof value) => void) {
			run(value);
			subscribers.add(run);
			return () => subscribers.delete(run);
		},
		set(nextValue: typeof value) {
			value = nextValue;
			subscribers.forEach((run) => run(value));
		},
		update(updater: (currentValue: typeof value) => typeof value) {
			taskState.set(updater(value));
		}
	};

	return {
		taskState,
		createTask: vi.fn().mockResolvedValue('signed-event-id-abc'),
		updateTask: vi.fn().mockResolvedValue('signed-event-id-abc'),
		createRecurringTask: vi.fn().mockResolvedValue('signed-event-id-abc'),
		findMyTasks: vi.fn().mockResolvedValue(undefined),
		goto: vi.fn(),
		showErrorToast: vi.fn(),
		showSuccessToast: vi.fn(),
		showInfoToast: vi.fn(),
		loadDraft: vi.fn().mockResolvedValue(undefined),
		saveDraft: vi.fn().mockResolvedValue(undefined),
		clearDraft: vi.fn().mockResolvedValue(undefined),
		triggerSavedSearchCheck: vi.fn().mockResolvedValue({
			success: true,
			matchCount: 2,
			message: '2 saved search notifications sent'
		})
	};
});

vi.mock('$app/stores', () => ({
	page: readable({
		url: new URL('http://localhost/create-task')
	})
}));

vi.mock('$app/navigation', () => ({
	goto: (...args: Parameters<typeof hoisted.goto>) => hoisted.goto(...args)
}));

vi.mock('$app/environment', () => ({
	browser: true
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showErrorToast: hoisted.showErrorToast,
		showSuccessToast: hoisted.showSuccessToast,
		showInfoToast: hoisted.showInfoToast
	}
}));

vi.mock('$lib/stores/task.store', () => ({
	taskStore: {
		subscribe: hoisted.taskState.subscribe,
		set: hoisted.taskState.set,
		update: hoisted.taskState.update,
		loadDraft: hoisted.loadDraft,
		saveDraft: hoisted.saveDraft,
		clearDraft: hoisted.clearDraft
	},
	STEPS: readable(['basics', 'location', 'budget', 'review'])
}));

vi.mock('$lib/nostr/task', () => ({
	createTask: (...args: Parameters<typeof hoisted.createTask>) => hoisted.createTask(...args),
	updateTask: (...args: Parameters<typeof hoisted.updateTask>) => hoisted.updateTask(...args),
	createRecurringTask: (...args: Parameters<typeof hoisted.createRecurringTask>) =>
		hoisted.createRecurringTask(...args)
}));

vi.mock('$lib/nostr/findMyTasks', () => ({
	findMyTasks: (...args: Parameters<typeof hoisted.findMyTasks>) => hoisted.findMyTasks(...args)
}));

vi.mock('$lib/api/services/saved-search.service', () => ({
	default: {
		triggerSavedSearchCheck: (...args: unknown[]) => hoisted.triggerSavedSearchCheck(...args)
	}
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key)
	};
});

vi.mock('$lib/components/task/steps/TaskBasics.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/task/steps/TaskLocation.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/task/steps/TaskBudget.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/task/steps/TaskRecurring.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/task/steps/TaskReview.svelte', () => ({ default: () => null }));

describe('create-task saved search check', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hoisted.triggerSavedSearchCheck.mockResolvedValue({
			success: true,
			matchCount: 2,
			message: '2 saved search notifications sent'
		});
		hoisted.taskState.set({
			task: {
				title: 'Build a modern website',
				description:
					'Need a full-stack developer to build a responsive website with React and Node.js',
				budget: { amount: 500, currency: 'USD', type: 'fixed' },
				taskType: 'remote',
				deadline: undefined,
				dateRange: undefined,
				pickupLocation: undefined,
				dropOffLocation: undefined,
				skills: ['JavaScript', 'React'],
				categories: [{ id: 'dev', name: 'Development', slug: 'development' }],
				attachments: []
			},
			id: 'task-event-123',
			currentStep: 'review',
			isRemovals: false,
			recurringTask: { isRecurring: false }
		});
	});

	it('sends non-empty title and description to saved search check on task creation', async () => {
		const { findByText } = render(
			(await import('../../../../routes/(app)/(protected)/create-task/+page.svelte')).default
		);

		await fireEvent.click(await findByText('task.get_quotes'));

		await waitFor(() => {
			expect(hoisted.createTask).toHaveBeenCalledTimes(1);
		});

		await waitFor(() => {
			expect(hoisted.triggerSavedSearchCheck).toHaveBeenCalledTimes(1);
		});

		const sentPayload = hoisted.triggerSavedSearchCheck.mock.calls[0][0] as TaskBodyDto;
		expect(sentPayload.title).toBe('Build a modern website');
		expect(sentPayload.description).toBe(
			'Need a full-stack developer to build a responsive website with React and Node.js'
		);
		expect(sentPayload.title).not.toBe('');
		expect(sentPayload.description).not.toBe('');
	});

	it('calls clearDraft AFTER saved search check', async () => {
		const callOrder: string[] = [];
		hoisted.triggerSavedSearchCheck.mockImplementation(async () => {
			callOrder.push('triggerSavedSearchCheck');
			return { success: true, matchCount: 0, message: 'ok' };
		});
		hoisted.clearDraft.mockImplementation(async () => {
			callOrder.push('clearDraft');
		});

		const { findByText } = render(
			(await import('../../../../routes/(app)/(protected)/create-task/+page.svelte')).default
		);

		await fireEvent.click(await findByText('task.get_quotes'));

		await waitFor(() => {
			expect(hoisted.clearDraft).toHaveBeenCalledTimes(1);
		});

		expect(callOrder).toEqual(['triggerSavedSearchCheck', 'clearDraft']);
	});

	it('sends correct budget tier in saved search check payload', async () => {
		const { findByText } = render(
			(await import('../../../../routes/(app)/(protected)/create-task/+page.svelte')).default
		);

		await fireEvent.click(await findByText('task.get_quotes'));

		await waitFor(() => {
			expect(hoisted.triggerSavedSearchCheck).toHaveBeenCalledTimes(1);
		});

		const sentPayload = hoisted.triggerSavedSearchCheck.mock.calls[0][0] as TaskBodyDto;
		expect(sentPayload.budget).toEqual({
			currency: 'USDt',
			type: 'fixed',
			tier: 'medium'
		});
	});

	it('sends skills and categories in saved search check payload', async () => {
		const { findByText } = render(
			(await import('../../../../routes/(app)/(protected)/create-task/+page.svelte')).default
		);

		await fireEvent.click(await findByText('task.get_quotes'));

		await waitFor(() => {
			expect(hoisted.triggerSavedSearchCheck).toHaveBeenCalledTimes(1);
		});

		const sentPayload = hoisted.triggerSavedSearchCheck.mock.calls[0][0] as TaskBodyDto;
		expect(sentPayload.skills).toEqual(['JavaScript', 'React']);
		expect(sentPayload.categories).toEqual(['dev']);
	});
});
