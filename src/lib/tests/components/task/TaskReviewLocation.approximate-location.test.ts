import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TaskReviewLocation from '$lib/components/task/TaskReviewLocation.svelte';
import { TaskTypeEnum } from '$lib/utils/enums/task.enum';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => {
			if (key === 'common.location.approximate_short') {
				return 'Approx.';
			}
			return key;
		})
	};
});

vi.mock('$lib/components/task/TaskLocationViewer.svelte', () => ({
	default: () => null
}));

describe('TaskReviewLocation approximate public location display', () => {
	it('prefers an approximate city-level review label over the exact formatted address when address components are available', () => {
		render(TaskReviewLocation, {
			task: {
				taskType: TaskTypeEnum.IN_PERSON,
				pickupLocation: {
					locationLoaded: true,
					displayName: 'Austin, TX, USA'
				}
			} as never
		});

		const locationSummary = screen.getByText(/task\.location_picker\.location_set/);
		expect(locationSummary).toHaveTextContent('task.location_picker.location_set: Austin, TX, USA');
		expect(screen.getByText(/\(Approx\.\)/)).toBeInTheDocument();
	});
});
