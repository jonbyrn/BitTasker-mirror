import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TaskLocationDisplay from '$lib/components/task/TaskLocationDisplay.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => {
			if (key === 'common.location.approximate_short') {
				return 'Approx.';
			}
			if (key === 'dashboard.task_details_by_task.remote') {
				return 'Remote';
			}
			return key;
		})
	};
});

describe('TaskLocationDisplay approximate public location note', () => {
	it('shows a brief note when the displayed public task location is approximate', () => {
		render(TaskLocationDisplay, {
			pickupLocation: {
				displayName: 'Austin, TX, USA',
				locationLoaded: true,
				zipCode: ''
			} as never
		});

		expect(screen.getByText('Austin, TX, USA')).toBeInTheDocument();
		expect(screen.getByText(/\(Approx\.\)/)).toBeInTheDocument();
	});
});
