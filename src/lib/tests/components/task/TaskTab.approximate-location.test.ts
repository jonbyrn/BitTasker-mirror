import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TaskTab from '$lib/components/task/details/TaskTab.svelte';
import {
	TaskTypeEnum,
	TaskStatusEnum,
	BudgetTypeEnum,
	BudgetCurrencyEnum
} from '$lib/utils/enums/task.enum';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(100000)
	}
}));

vi.mock('$lib/utils/escrow', () => ({
	escrow: {
		contractOps: {
			getContracts: vi.fn().mockResolvedValue([])
		}
	}
}));

vi.mock('$lib/components/shared/UsdSatsDisplay.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/task/TaskDeadlineDisplay.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/task/TranslatableTask.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/location/LocationDetailsCard.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/task/TaskShareButton.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/Gallery.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/task/TaskLocationDisplay.svelte', async () => ({
	default: (await import('$lib/tests/fixtures/TaskLocationDisplayStub.svelte')).default
}));

describe('TaskTab approximate public location display', () => {
	it('passes an approximate city-level location to the public task header when only address components are available', () => {
		render(TaskTab, {
			task: {
				id: 'task-1',
				title: 'Pickup furniture',
				description: 'Move a desk across town.',
				taskType: TaskTypeEnum.IN_PERSON,
				status: TaskStatusEnum.OPEN,
				budget: {
					type: BudgetTypeEnum.FIXED,
					currency: BudgetCurrencyEnum.USDT,
					amount: 80
				},
				pickupLocation: {
					displayName: 'Austin, TX, USA',
					locationLoaded: true
				},
				dropOffLocation: null,
				skills: [],
				categories: []
			} as never,
			isOwner: false
		});

		expect(screen.getByTestId('task-location-text')).toHaveTextContent('Austin, TX, USA');
	});
});
