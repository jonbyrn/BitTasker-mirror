import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { BudgetTypeEnum, TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
import type { Task } from '$lib/types/task.d';
import TaskCard from '$lib/components/task/TaskCard.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'find_tasks.view_task': 'View',
		'dashboard.find_tasks.sign_up_to_bid': 'Bid',
		'dashboard.find_tasks.sign_up_to_bid_aria': 'Sign up to bid on this task',
		'dashboard.find_tasks.bid_sent': 'Bid sent',
		'dashboard.find_tasks.bidding_closed': 'Bidding closed',
		'common.status.open': 'Open'
	};
	return {
		t: readable((key: string) => translations[key] ?? key),
		locale: readable('en')
	};
});

vi.mock('$lib/services/task-translation.service', () => ({
	taskTranslationService: {
		getStoredTranslation: vi.fn().mockReturnValue(null)
	}
}));

vi.mock('$lib/stores/translation.store', () => ({
	currentUserLanguage: {
		subscribe: (callback: (value: string) => void) => {
			callback('en');
			return () => {};
		}
	}
}));

vi.mock('$lib/components/task/TaskShareButton.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/moderation/ActionsMenu.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/user/UserInfoDisplay.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/shared/UsdSatsDisplay.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/task/TaskDeadlineDisplay.svelte', () => ({ default: () => null }));
vi.mock('$lib/components/task/TaskLocationDisplay.svelte', () => ({ default: () => null }));

function createTask(overrides: Partial<Task> = {}): Task {
	return {
		id: 'task-1',
		npub: 'npub1test',
		status: TaskStatusEnum.OPEN,
		title: 'Paint the fence',
		description: 'Two coats, white.',
		taskType: TaskTypeEnum.REMOTE,
		budget: {
			amount: 100,
			currency: 'USD',
			type: BudgetTypeEnum.FIXED
		},
		deadline: '2099-12-31',
		dateRange: null,
		pickupLocation: null,
		dropOffLocation: {
			displayName: 'Test Location',
			longitude: -122.4194,
			latitude: 37.7749,
			zipCode: '94102',
			locationLoaded: true
		},
		skills: [],
		categories: [],
		attachments: [],
		isRemovals: false,
		isBoosted: false,
		boostPercentage: null,
		createdAt: Date.now(),
		updatedAt: new Date().toISOString(),
		completedAt: null,
		cancelledAt: null,
		deletedAt: null,
		isDeleted: false,
		requiredSkills: [],
		estimatedHours: 2,
		...overrides
	};
}

function renderCard(props: Record<string, unknown> = {}) {
	return render(TaskCard, {
		task: createTask(),
		selectedTask: null,
		btcPrice: 100_000,
		onSelectTask: vi.fn(async () => {}),
		onViewTask: vi.fn(async () => {}),
		...props
	});
}

describe('TaskCard', () => {
	it('opens the task from one title link, with buttons outside that link', () => {
		renderCard();

		const link = screen.getByRole('link', { name: 'Paint the fence' });
		expect(link).toHaveAttribute('href', '/tasks/task-1');
		expect(link).toHaveAttribute('data-testid', 'task-card-link');
		expect(screen.getAllByRole('link')).toHaveLength(1);
		expect(screen.queryByRole('button', { name: /Paint the fence/i })).toBeNull();

		const view = screen.getByRole('button', { name: 'View' });
		const bid = screen.getByRole('button', { name: 'Sign up to bid on this task' });
		expect(link.contains(view)).toBe(false);
		expect(link.contains(bid)).toBe(false);
		expect(view.closest('a')).toBeNull();
		expect(bid.closest('a')).toBeNull();
	});

	it('keeps that task link when the map is visible', () => {
		renderCard({
			isMapVisible: true,
			onSelectTaskForMap: vi.fn()
		});

		const link = screen.getByRole('link', { name: 'Paint the fence' });
		expect(link).toHaveAttribute('href', '/tasks/task-1');
		expect(screen.queryByRole('button', { name: /Paint the fence/i })).toBeNull();
	});
});
