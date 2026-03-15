import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TaskCard from '$lib/components/task/TaskCard.svelte';
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

vi.mock('$lib/components/shared/UsdSatsDisplay.svelte', () => ({
	default: vi.fn().mockImplementation(() => ({
		$$render: () => '<div>USD_SATS_DISPLAY</div>'
	}))
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

vi.mock('$lib/components/user/UserInfoDisplay.svelte', () => ({
	default: vi.fn()
}));

vi.mock('~icons/mdi/plus', () => ({
	default: vi.fn()
}));

vi.mock('~icons/mdi/eye', () => ({
	default: vi.fn()
}));

describe('TaskCard BSC rail label', () => {
	it('renders the canonical USDT on BSC label when only the BSC network is persisted', () => {
		render(TaskCard, {
			task: {
				id: 'task-bsc-card',
				title: 'BSC task card',
				description: 'Task description',
				status: TaskStatusEnum.OPEN,
				taskType: TaskTypeEnum.REMOTE,
				budget: {
					amount: 125,
					type: 'FIXED',
					currency: 'USD'
				},
				categories: [],
				skills: [],
				attachments: [],
				paymentNetwork: 'bsc-testnet',
				creator: {
					username: 'creator',
					rating: 5
				},
				npub: 'npub-test',
				createdAt: '2025-01-01T00:00:00.000Z'
			},
			selectedTask: null,
			btcPrice: 60000,
			onSelectTask: vi.fn().mockResolvedValue(undefined),
			onViewTask: vi.fn().mockResolvedValue(undefined),
			drawersLoaded: true,
			loadDrawerComponents: vi.fn().mockResolvedValue(undefined),
			onSelectTaskForMap: vi.fn(),
			isMapVisible: false,
			hasBid: false
		});

		expect(screen.getByText('USDT on BSC')).toBeInTheDocument();
		expect(screen.getByText('$125.00')).toBeInTheDocument();
		expect(screen.queryByText('USD_SATS_DISPLAY')).not.toBeInTheDocument();
	});
});
