import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import DashboardTaskCard from '$lib/components/task/DashboardTaskCard.svelte';
import { TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');

	return {
		t: readable((key: string) => key)
	};
});

vi.mock('$lib/components/task/TranslatableTask.svelte', () => ({
	default: vi.fn()
}));

vi.mock('$lib/components/task/TaskShareButton.svelte', () => ({
	default: vi.fn()
}));

vi.mock('$lib/components/task/TaskDeadlineDisplay.svelte', () => ({
	default: vi.fn()
}));

vi.mock('$lib/components/task/TaskLocationDisplay.svelte', () => ({
	default: vi.fn()
}));

vi.mock('$lib/utils/helpers/crypto', () => ({
	satsFromUsd: vi.fn(() => '123 sats')
}));

vi.mock('~icons/mdi/information-outline', () => ({
	default: vi.fn()
}));

vi.mock('~icons/mdi/eye-outline', () => ({
	default: vi.fn()
}));

describe('DashboardTaskCard BSC rail label', () => {
	it('renders the canonical USDT on BSC label when only the USDT asset is persisted', () => {
		render(DashboardTaskCard, {
			task: {
				id: 'task-dashboard-bsc',
				title: 'Dashboard BSC task',
				description: 'Task description',
				status: TaskStatusEnum.OPEN,
				taskType: TaskTypeEnum.REMOTE,
				budget: {
					amount: 200,
					type: 'FIXED',
					currency: 'USD'
				},
				categories: [],
				skills: [],
				attachments: [],
				paymentAsset: 'USDT'
			},
			btcPrice: 60000,
			activeFilter: 'waiting_for_bids',
			getActionButtons: vi.fn().mockReturnValue([])
		});

		expect(screen.getByText('USDT on BSC')).toBeInTheDocument();
		expect(screen.getByText('$200')).toBeInTheDocument();
		expect(screen.queryByText('123 sats')).not.toBeInTheDocument();
	});
});
