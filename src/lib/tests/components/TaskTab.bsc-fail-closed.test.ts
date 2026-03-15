import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import TaskTab from '$lib/components/task/details/TaskTab.svelte';
import { TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';

const mockGetContracts = vi.fn();
const mockCheckEscrowFundingStatus = vi.fn();

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'dashboard.task_details_by_task.delete_task': 'Delete Task',
		'dashboard.task_details_by_task.edit_task': 'Edit Task',
		'dashboard.task_details_by_task.task_attachment': 'Attachment'
	};

	return {
		t: readable((key: string) => translations[key] ?? key),
		locale: readable('en')
	};
});

vi.mock('$app/environment', () => ({
	browser: true
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(60000)
	}
}));

vi.mock('$lib/utils/escrow', () => ({
	escrow: {
		contractOps: {
			getContracts: (...args: unknown[]) => mockGetContracts(...args)
		},
		escrowOps: {
			checkEscrowFundingStatus: (...args: unknown[]) => mockCheckEscrowFundingStatus(...args)
		}
	}
}));

vi.mock('$lib/utils/helpers/dateFormatter', () => ({
	formatStandardDateTime: vi.fn(() => 'formatted-date')
}));

vi.mock('$lib/utils/location/maps', () => ({
	formatLocationAddress: vi.fn(() => ''),
	generateGoogleMapsDirectionsLink: vi.fn(() => null)
}));

vi.mock('$lib/utils/constants/categories', () => ({
	TASK_CATEGORIES: []
}));

vi.mock('$lib/components/shared/UsdSatsDisplay.svelte', () => ({ default: vi.fn() }));
vi.mock('$lib/components/task/TaskDeadlineDisplay.svelte', () => ({ default: vi.fn() }));
vi.mock('$lib/components/task/TranslatableTask.svelte', () => ({ default: vi.fn() }));
vi.mock('$lib/components/location/LocationDetailsCard.svelte', () => ({ default: vi.fn() }));
vi.mock('$lib/components/task/TaskLocationDisplay.svelte', () => ({ default: vi.fn() }));
vi.mock('$lib/components/task/TaskShareButton.svelte', () => ({ default: vi.fn() }));
vi.mock('$lib/components/Gallery.svelte', () => ({ default: vi.fn() }));
vi.mock('~icons/mdi/plus', () => ({ default: vi.fn() }));

describe('TaskTab BSC fail-closed delete checks', () => {
	const baseTask = {
		id: 'task-1',
		title: 'BSC task',
		description: 'Task description',
		status: TaskStatusEnum.OPEN,
		taskType: TaskTypeEnum.REMOTE,
		budget: {
			amount: 125,
			currency: 'USD'
		},
		categories: [],
		skills: [],
		attachments: [],
		paymentAsset: 'USDT',
		paymentNetwork: 'bsc-testnet'
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockCheckEscrowFundingStatus.mockResolvedValue({
			wasFunded: false,
			escrowData: null
		});
	});

	it('disables delete for explicit BSC contracts without calling Rootstock funding checks', async () => {
		mockGetContracts.mockResolvedValue([
			{
				contractEvent: {
					content: {
						paymentAsset: 'USDT',
						paymentNetwork: 'bsc-testnet'
					}
				},
				blockchainStatus: null
			}
		]);

		render(TaskTab, {
			task: baseTask,
			isOwner: true,
			onRequestDeleteConfirm: vi.fn()
		});

		await waitFor(() => {
			expect(screen.getByRole('button', { name: /Delete Task/i })).toBeDisabled();
		});

		expect(mockCheckEscrowFundingStatus).not.toHaveBeenCalled();
	});

	it('disables delete for legacy contracts missing explicit rail context without calling Rootstock funding checks', async () => {
		mockGetContracts.mockResolvedValue([
			{
				contractEvent: {
					content: {
						currency: 'RBTC'
					}
				},
				blockchainStatus: null
			}
		]);

		render(TaskTab, {
			task: baseTask,
			isOwner: true,
			onRequestDeleteConfirm: vi.fn()
		});

		await waitFor(() => {
			expect(screen.getByRole('button', { name: /Delete Task/i })).toBeDisabled();
		});

		expect(mockCheckEscrowFundingStatus).not.toHaveBeenCalled();
	});
});
