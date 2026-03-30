import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import DashboardTasksPanel from '$lib/components/task/DashboardTasksPanel.svelte';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';

type MockTasksState = {
	items: Array<{ id: string; title: string; status: string }>;
	loading: boolean;
	error: string | null;
	currentPage: number;
	hasMore: boolean;
};

const { myTasksStore, findMyTasks, getCurrentPrice, goto } = vi.hoisted(() => ({
	myTasksStore: (() => {
		let value: MockTasksState = {
			items: [],
			loading: false,
			error: null,
			currentPage: 1,
			hasMore: false
		};
		const subscribers = new Set<(value: MockTasksState) => void>();

		return {
			subscribe(run: (value: MockTasksState) => void) {
				run(value);
				subscribers.add(run);
				return () => subscribers.delete(run);
			},
			set(next: MockTasksState) {
				value = next;
				subscribers.forEach((run) => run(value));
			}
		};
	})(),
	findMyTasks: vi.fn().mockResolvedValue(undefined),
	getCurrentPrice: vi.fn().mockResolvedValue(100000),
	goto: vi.fn()
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key)
	};
});

vi.mock('$lib/stores/task.store', () => ({
	myTasksStore,
	TASKS_PER_PAGE: 20
}));

vi.mock('$app/navigation', () => ({
	goto
}));

vi.mock('$lib/nostr/findMyTasks', () => ({
	findMyTasks
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice
	}
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showSuccessToast: vi.fn(),
		showErrorToast: vi.fn()
	}
}));

vi.mock('$lib/components/task/DashboardTaskCard.svelte', async () => ({
	default: (await import('$lib/tests/fixtures/DashboardTaskCardStub.svelte')).default
}));

describe('DashboardTasksPanel', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		myTasksStore.set({
			items: [],
			loading: false,
			error: null,
			currentPage: 1,
			hasMore: false
		});
	});

	it('shows the shared empty state with a create-task CTA when there are no tasks', async () => {
		const { getByRole, findByTestId } = render(DashboardTasksPanel, {
			openTaskDrawer: vi.fn()
		});

		await waitFor(() => expect(findMyTasks).toHaveBeenCalled());
		expect(await findByTestId('dashboard-tasks-empty-state')).toBeTruthy();
		expect(getByRole('link', { name: 'dashboard.create_task' })).toHaveAttribute(
			'href',
			'/dashboard/create-task'
		);
	});

	it('offers a clear-filters CTA when tasks exist outside the active filter', async () => {
		myTasksStore.set({
			items: [
				{
					id: 'task-1',
					title: 'Completed migration',
					status: TaskStatusEnum.COMPLETED
				}
			],
			loading: false,
			error: null,
			currentPage: 1,
			hasMore: false
		});

		const { getByRole, findByTestId, queryByTestId, queryByRole } = render(DashboardTasksPanel, {
			openTaskDrawer: vi.fn()
		});

		await waitFor(() => expect(findMyTasks).toHaveBeenCalled());
		expect(await findByTestId('dashboard-tasks-empty-state')).toBeTruthy();

		await fireEvent.click(getByRole('button', { name: 'find_tasks.clear_filters' }));

		expect(queryByTestId('dashboard-tasks-empty-state')).toBeNull();
		expect(queryByRole('button', { name: 'find_tasks.clear_filters' })).toBeNull();
	});

	it('filters tasks by actual status buckets instead of bid-state placeholders', async () => {
		myTasksStore.set({
			items: [
				{
					id: 'task-open',
					title: 'Open task',
					status: TaskStatusEnum.OPEN
				},
				{
					id: 'task-progress',
					title: 'Escrow funded task',
					status: TaskStatusEnum.ESCROW_FUNDED
				},
				{
					id: 'task-completed',
					title: 'Completed task',
					status: TaskStatusEnum.COMPLETED
				},
				{
					id: 'task-disputed',
					title: 'Disputed task',
					status: TaskStatusEnum.DISPUTE_PROPOSAL
				},
				{
					id: 'task-cancelled',
					title: 'Cancelled task',
					status: TaskStatusEnum.CANCELLED
				}
			],
			loading: false,
			error: null,
			currentPage: 1,
			hasMore: false
		});

		render(DashboardTasksPanel, {
			openTaskDrawer: vi.fn()
		});

		await waitFor(() => expect(findMyTasks).toHaveBeenCalled());

		expect(screen.getByTestId('task-card')).toHaveTextContent('Open task');
		expect(screen.queryByText('Escrow funded task')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'task.filters.in_progress' }));
		expect(screen.getByText('Escrow funded task')).toBeInTheDocument();
		expect(screen.queryByText('Open task')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'task.filters.completed' }));
		expect(screen.getByText('Completed task')).toBeInTheDocument();
		expect(screen.queryByText('Escrow funded task')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'task.filters.disputed' }));
		expect(screen.getByText('Disputed task')).toBeInTheDocument();
		expect(screen.queryByText('Completed task')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'task.filters.cancelled' }));
		expect(screen.getByText('Cancelled task')).toBeInTheDocument();
		expect(screen.queryByText('Disputed task')).toBeNull();
	});
});
