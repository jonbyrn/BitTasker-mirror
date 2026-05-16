import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import SchedulePeriodPicker from '$lib/components/date/SchedulePeriodPicker.svelte';

vi.mock('svelte-i18n', () => ({
	t: readable((key: string, opts?: { values?: Record<string, unknown> }) => {
		if (opts?.values) {
			let result = key;
			for (const [k, v] of Object.entries(opts.values)) {
				result = result.replace(`{${k}}`, String(v));
			}
			return result;
		}
		return key;
	}),
	locale: readable('en')
}));

vi.mock('$lib/utils/portal', () => ({
	teleport: () => ({})
}));

vi.mock('$lib/utils/helpers/modalScrollLock', () => ({
	acquireScheduleModalScrollLock: () => () => {}
}));

describe('SchedulePeriodPicker', () => {
	const onStartChange = vi.fn();
	const onEndChange = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('rendering', () => {
		it('renders start and end date fields', () => {
			render(SchedulePeriodPicker, {
				props: { startValue: null, endValue: null, onStartChange, onEndChange }
			});

			// Start date field
			expect(
				screen.getByLabelText(/common\.components\.schedule_picker\.date_accessibility_start/)
			).toBeInTheDocument();
			// End date field
			expect(
				screen.getByLabelText(/common\.components\.schedule_picker\.date_accessibility_end/)
			).toBeInTheDocument();
		});

		it('renders with custom heading keys', () => {
			render(SchedulePeriodPicker, {
				props: {
					startValue: null,
					endValue: null,
					onStartChange,
					onEndChange,
					startHeadingKey: 'custom.start',
					endHeadingKey: 'custom.end'
				}
			});

			expect(screen.getByText('custom.start')).toBeInTheDocument();
			expect(screen.getByText('custom.end')).toBeInTheDocument();
		});
	});

	describe('end field disabled state', () => {
		it('disables end field when startValue is null', () => {
			const { container } = render(SchedulePeriodPicker, {
				props: { startValue: null, endValue: null, onStartChange, onEndChange }
			});

			// End field buttons should be disabled — query by aria-label containing "end"
			const endDateBtn = container.querySelector(
				'[aria-label*="date_accessibility_end"]'
			) as HTMLButtonElement | null;
			const endTimeBtn = container.querySelector(
				'[aria-label*="time_label_end"]'
			) as HTMLButtonElement | null;

			expect(endDateBtn).not.toBeNull();
			expect(endTimeBtn).not.toBeNull();
			expect(endDateBtn).toBeDisabled();
			expect(endTimeBtn).toBeDisabled();
		});

		it('enables end field when startValue is set', () => {
			const startDate = new Date(2026, 4, 15, 14, 0, 0);
			render(SchedulePeriodPicker, {
				props: {
					startValue: startDate,
					endValue: null,
					onStartChange,
					onEndChange
				}
			});

			const endDateButton = screen.getByLabelText(
				/common\.components\.schedule_picker\.date_accessibility_end/
			);
			expect(endDateButton).not.toBeDisabled();
		});
	});

	describe('duration display', () => {
		it('does not show duration when values are null', () => {
			const { container } = render(SchedulePeriodPicker, {
				props: { startValue: null, endValue: null, onStartChange, onEndChange }
			});

			expect(container.querySelector('[aria-live="polite"]')).toBeNull();
		});

		it('shows duration when both values are set', () => {
			const startDate = new Date(2026, 4, 15, 14, 0, 0);
			const endDate = new Date(2026, 4, 15, 17, 30, 0);

			const { container } = render(SchedulePeriodPicker, {
				props: {
					startValue: startDate,
					endValue: endDate,
					onStartChange,
					onEndChange
				}
			});

			// Duration text should appear — check the aria-live element has content
			const live = container.querySelector('[aria-live="polite"]');
			expect(live).not.toBeNull();
			expect(live?.textContent).toBeTruthy();
			expect(live?.textContent?.length).toBeGreaterThan(0);
		});

		it('duration has aria-live="polite"', () => {
			const startDate = new Date(2026, 4, 15, 14, 0, 0);
			const endDate = new Date(2026, 4, 15, 17, 0, 0);

			const { container } = render(SchedulePeriodPicker, {
				props: {
					startValue: startDate,
					endValue: endDate,
					onStartChange,
					onEndChange
				}
			});

			const live = container.querySelector('[aria-live="polite"]');
			expect(live).not.toBeNull();
		});
	});
});
