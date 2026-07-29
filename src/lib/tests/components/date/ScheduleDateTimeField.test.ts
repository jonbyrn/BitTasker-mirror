import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import ScheduleDateTimeField from '$lib/components/date/ScheduleDateTimeField.svelte';

vi.mock('svelte-i18n', () => ({
	t: readable((key: string) => key),
	locale: readable('en')
}));

vi.mock('$lib/utils/portal', () => ({
	teleport: () => ({})
}));

vi.mock('$lib/utils/helpers/modalScrollLock', () => ({
	acquireScheduleModalScrollLock: () => () => {}
}));

describe('ScheduleDateTimeField', () => {
	const onChange = vi.fn();
	const _baseDate = new Date(2026, 4, 11, 12, 0, 0);
	const sampleDate = new Date(2026, 4, 15, 14, 30, 0);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('rendering', () => {
		it('renders date and time trigger buttons when open', () => {
			render(ScheduleDateTimeField, {
				props: { value: null, onChange, period: 'start' }
			});

			expect(
				screen.getByLabelText(/common\.components\.schedule_picker\.date_accessibility_start/)
			).toBeInTheDocument();
			expect(
				screen.getByLabelText(/common\.components\.schedule_picker\.time_label_start/)
			).toBeInTheDocument();
		});

		it('shows placeholder text in date button when value is null', () => {
			render(ScheduleDateTimeField, {
				props: { value: null, onChange, period: 'start' }
			});

			expect(
				screen.getByText('common.components.schedule_picker.placeholder_date_start')
			).toBeInTheDocument();
		});

		it('shows formatted date when value is set', () => {
			render(ScheduleDateTimeField, {
				props: { value: sampleDate, onChange, period: 'start' }
			});

			// Date should be displayed (May 15, 2026 formatted)
			expect(screen.getByText(/May 15, 2026|15 de mayo de 2026/)).toBeInTheDocument();
		});

		it('shows time micro label when headingKey is not provided', () => {
			render(ScheduleDateTimeField, {
				props: { value: null, onChange }
			});

			expect(screen.getByText('common.components.schedule_picker.time')).toBeInTheDocument();
		});

		it('shows heading label when headingKey is provided', () => {
			render(ScheduleDateTimeField, {
				props: { value: null, onChange, headingKey: 'test.heading' }
			});

			expect(screen.getByText('test.heading')).toBeInTheDocument();
		});

		it('uses end-period placeholders when period is "end"', () => {
			render(ScheduleDateTimeField, {
				props: { value: null, onChange, period: 'end' }
			});

			expect(
				screen.getByText('common.components.schedule_picker.placeholder_date_end')
			).toBeInTheDocument();
			expect(
				screen.getByLabelText(/common\.components\.schedule_picker\.date_accessibility_end/)
			).toBeInTheDocument();
		});
	});

	describe('disabled state', () => {
		it('applies disabled attribute to both trigger buttons', () => {
			render(ScheduleDateTimeField, {
				props: { value: null, onChange, disabled: true }
			});

			const buttons = screen.getAllByRole('button');
			for (const btn of buttons) {
				expect(btn).toBeDisabled();
			}
		});

		it('does not open calendar modal when disabled', async () => {
			render(ScheduleDateTimeField, {
				props: { value: null, onChange, disabled: true }
			});

			const dateButton = screen.getByLabelText(/common\.components\.schedule_picker\.date/);
			await fireEvent.click(dateButton);

			expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		});

		it('does not open time modal when disabled', async () => {
			render(ScheduleDateTimeField, {
				props: { value: null, onChange, disabled: true }
			});

			const timeButton = screen.getByLabelText(/common\.components\.schedule_picker\.time/);
			await fireEvent.click(timeButton);

			expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		});
	});

	describe('modal interaction', () => {
		it('opens calendar modal when date button is clicked', async () => {
			render(ScheduleDateTimeField, {
				props: { value: null, onChange }
			});

			const dateButton = screen.getByLabelText(/common\.components\.schedule_picker\.date/);
			await fireEvent.click(dateButton);

			expect(screen.getByRole('dialog')).toBeInTheDocument();
		});

		it('opens time modal when time button is clicked', async () => {
			render(ScheduleDateTimeField, {
				props: { value: null, onChange }
			});

			const timeButton = screen.getByLabelText(/common\.components\.schedule_picker\.time/);
			await fireEvent.click(timeButton);

			expect(screen.getByRole('dialog')).toBeInTheDocument();
		});

		it('sets aria-expanded on date button when calendar opens', async () => {
			render(ScheduleDateTimeField, {
				props: { value: null, onChange }
			});

			const dateButton = screen.getByLabelText(/common\.components\.schedule_picker\.date/);
			expect(dateButton).toHaveAttribute('aria-expanded', 'false');

			await fireEvent.click(dateButton);
			expect(dateButton).toHaveAttribute('aria-expanded', 'true');
		});

		it('sets aria-haspopup="dialog" on both trigger buttons', () => {
			render(ScheduleDateTimeField, {
				props: { value: null, onChange }
			});

			const buttons = screen.getAllByRole('button');
			for (const btn of buttons) {
				expect(btn).toHaveAttribute('aria-haspopup', 'dialog');
			}
		});
	});

	describe('group semantics', () => {
		it('renders without role="group" when no headingKey', () => {
			const { container } = render(ScheduleDateTimeField, {
				props: { value: null, onChange }
			});

			expect(container.querySelector('[role="group"]')).toBeNull();
		});

		it('renders with role="group" and aria-labelledby when headingKey and period are provided', () => {
			const { container } = render(ScheduleDateTimeField, {
				props: { value: null, onChange, headingKey: 'test.heading', period: 'start' }
			});

			const group = container.querySelector('[role="group"]');
			expect(group).not.toBeNull();
			expect(group).toHaveAttribute('aria-labelledby');
		});
	});
});
