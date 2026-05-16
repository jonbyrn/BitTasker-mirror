import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import CalendarPickerModal from '$lib/components/date/CalendarPickerModal.svelte';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('$lib/utils/portal', () => ({
	teleport: vi.fn(() => ({ destroy: vi.fn() }))
}));

vi.mock('svelte-i18n', () => ({
	t: readable((key: string) => key),
	locale: readable('en')
}));

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CalendarPickerModal', () => {
	const onClose = vi.fn();
	const onSelect = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers().setSystemTime(new Date(2026, 4, 15)); // May 15, 2026
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('does not render when open=false', () => {
		render(CalendarPickerModal, {
			props: { open: false, selectedDate: null, onClose, onSelect }
		});
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	});

	it('renders calendar grid when open', () => {
		render(CalendarPickerModal, {
			props: { open: true, selectedDate: null, onClose, onSelect }
		});
		expect(screen.getByRole('dialog')).toBeInTheDocument();
		expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
		expect(screen.getByRole('grid')).toBeInTheDocument();
	});

	it('shows correct month/year heading', () => {
		render(CalendarPickerModal, {
			props: { open: true, selectedDate: null, onClose, onSelect }
		});

		expect(screen.getByText('May 2026')).toBeInTheDocument();
	});

	it('previous month navigation button changes the heading', () => {
		render(CalendarPickerModal, {
			props: { open: true, selectedDate: null, onClose, onSelect }
		});

		expect(screen.getByText('May 2026')).toBeInTheDocument();

		fireEvent.click(screen.getByLabelText('common.components.schedule_picker.previous_month'));

		expect(screen.getByText('April 2026')).toBeInTheDocument();
	});

	it('next month navigation button changes the heading', () => {
		render(CalendarPickerModal, {
			props: { open: true, selectedDate: null, onClose, onSelect }
		});

		expect(screen.getByText('May 2026')).toBeInTheDocument();

		fireEvent.click(screen.getByLabelText('common.components.schedule_picker.next_month'));

		expect(screen.getByText('June 2026')).toBeInTheDocument();
	});

	it('clicking a day selects it and calls onSelect + onClose', () => {
		render(CalendarPickerModal, {
			props: { open: true, selectedDate: null, onClose, onSelect }
		});

		// Day buttons are role="gridcell" — find by text content
		const day15 = screen.getByText('15');
		fireEvent.click(day15);

		expect(onSelect).toHaveBeenCalledTimes(1);
		const selected = onSelect.mock.calls[0][0] as Date;
		expect(selected.getFullYear()).toBe(2026);
		expect(selected.getMonth()).toBe(4); // May
		expect(selected.getDate()).toBe(15);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('selected date has aria-selected="true"', () => {
		const selectedDate = new Date(2026, 4, 15);

		render(CalendarPickerModal, {
			props: { open: true, selectedDate, onClose, onSelect }
		});

		// Day buttons have role="gridcell", accessible name comes from text content
		const day15 = screen.getByRole('gridcell', { name: '15' });
		expect(day15).toHaveAttribute('aria-selected', 'true');
	});

	it('non-selected day does not have aria-selected', () => {
		const selectedDate = new Date(2026, 4, 10);

		render(CalendarPickerModal, {
			props: { open: true, selectedDate, onClose, onSelect }
		});

		const day15 = screen.getByRole('gridcell', { name: '15' });
		expect(day15).not.toHaveAttribute('aria-selected');

		const day10 = screen.getByRole('gridcell', { name: '10' });
		expect(day10).toHaveAttribute('aria-selected', 'true');
	});

	it('selected day has btn-primary class', () => {
		const selectedDate = new Date(2026, 4, 15);

		render(CalendarPickerModal, {
			props: { open: true, selectedDate, onClose, onSelect }
		});

		const day15 = screen.getByRole('gridcell', { name: '15' });
		expect(day15).toHaveClass('btn-primary');
	});

	it('disabled days (before minDate) have disabled attribute', () => {
		const minDate = new Date(2026, 4, 10); // May 10, 2026

		render(CalendarPickerModal, {
			props: { open: true, selectedDate: null, minDate, onClose, onSelect }
		});

		// Day 9 should be disabled (before minDate)
		const day9 = screen.getByRole('gridcell', { name: '9' });
		expect(day9).toBeDisabled();

		// Day 10 should NOT be disabled (equal to minDate)
		const day10 = screen.getByRole('gridcell', { name: '10' });
		expect(day10).not.toBeDisabled();
	});

	it('disabled days (after maxDate) have disabled attribute', () => {
		const maxDate = new Date(2026, 4, 20); // May 20, 2026

		render(CalendarPickerModal, {
			props: { open: true, selectedDate: null, maxDate, onClose, onSelect }
		});

		// Day 21 should be disabled (after maxDate)
		const day21 = screen.getByRole('gridcell', { name: '21' });
		expect(day21).toBeDisabled();

		// Day 20 should NOT be disabled (equal to maxDate)
		const day20 = screen.getByRole('gridcell', { name: '20' });
		expect(day20).not.toBeDisabled();
	});

	it('minDate constraint: days before minDate have disabled HTML attribute', () => {
		const minDate = new Date(2026, 4, 10);

		render(CalendarPickerModal, {
			props: { open: true, selectedDate: null, minDate, onClose, onSelect }
		});

		const day9 = screen.getByRole('gridcell', { name: '9' });
		expect(day9).toBeDisabled();
	});

	it('maxDate constraint: days after maxDate have disabled HTML attribute', () => {
		const maxDate = new Date(2026, 4, 20);

		render(CalendarPickerModal, {
			props: { open: true, selectedDate: null, maxDate, onClose, onSelect }
		});

		const day25 = screen.getByRole('gridcell', { name: '25' });
		expect(day25).toBeDisabled();
	});

	it('Clear button calls onSelect(null) and onClose', () => {
		render(CalendarPickerModal, {
			props: {
				open: true,
				selectedDate: new Date(2026, 4, 15),
				onClose,
				onSelect
			}
		});

		fireEvent.click(screen.getByText('common.clear'));

		expect(onSelect).toHaveBeenCalledWith(null);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('backdrop click calls onClose', () => {
		render(CalendarPickerModal, {
			props: { open: true, selectedDate: null, onClose, onSelect }
		});

		fireEvent.click(screen.getByLabelText('common.components.modal.close'));

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('Escape key calls onClose', () => {
		render(CalendarPickerModal, {
			props: { open: true, selectedDate: null, onClose, onSelect }
		});

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('Escape key does nothing when closed', () => {
		render(CalendarPickerModal, {
			props: { open: false, selectedDate: null, onClose, onSelect }
		});

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));

		expect(onClose).not.toHaveBeenCalled();
	});

	it('prevents default on Escape key', () => {
		render(CalendarPickerModal, {
			props: { open: true, selectedDate: null, onClose, onSelect }
		});

		const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
		const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

		window.dispatchEvent(event);

		expect(preventDefaultSpy).toHaveBeenCalled();
	});

	it('renders weekday column headers with full weekday aria-labels', () => {
		render(CalendarPickerModal, {
			props: { open: true, selectedDate: null, onClose, onSelect }
		});

		// Column headers have long weekday names as aria-labels
		expect(screen.getByText('Sun')).toHaveAttribute('aria-label', 'Sunday');
		expect(screen.getByText('Mon')).toHaveAttribute('aria-label', 'Monday');
		expect(screen.getByText('Tue')).toHaveAttribute('aria-label', 'Tuesday');
		expect(screen.getByText('Wed')).toHaveAttribute('aria-label', 'Wednesday');
		expect(screen.getByText('Thu')).toHaveAttribute('aria-label', 'Thursday');
		expect(screen.getByText('Fri')).toHaveAttribute('aria-label', 'Friday');
		expect(screen.getByText('Sat')).toHaveAttribute('aria-label', 'Saturday');
	});

	it('today has aria-current="date"', () => {
		// Fake timer set to May 15, so today is May 15
		render(CalendarPickerModal, {
			props: { open: true, selectedDate: null, onClose, onSelect }
		});

		const day15 = screen.getByRole('gridcell', { name: '15' });
		expect(day15).toHaveAttribute('aria-current', 'date');
	});

	it('non-today day does not have aria-current', () => {
		render(CalendarPickerModal, {
			props: { open: true, selectedDate: null, onClose, onSelect }
		});

		const day14 = screen.getByRole('gridcell', { name: '14' });
		expect(day14).not.toHaveAttribute('aria-current');
	});

	it('navigates with previous month button repeatedly across year boundary', () => {
		// Start in January 2026
		vi.useFakeTimers().setSystemTime(new Date(2026, 0, 15));

		render(CalendarPickerModal, {
			props: { open: true, selectedDate: null, onClose, onSelect }
		});

		expect(screen.getByText('January 2026')).toBeInTheDocument();

		fireEvent.click(screen.getByLabelText('common.components.schedule_picker.previous_month'));

		expect(screen.getByText('December 2025')).toBeInTheDocument();
	});

	it('navigates with next month button repeatedly across year boundary', () => {
		// Start in December 2026
		vi.useFakeTimers().setSystemTime(new Date(2026, 11, 15));

		render(CalendarPickerModal, {
			props: { open: true, selectedDate: null, onClose, onSelect }
		});

		expect(screen.getByText('December 2026')).toBeInTheDocument();

		fireEvent.click(screen.getByLabelText('common.components.schedule_picker.next_month'));

		expect(screen.getByText('January 2027')).toBeInTheDocument();
	});

	it('Tab focus wraps within modal: handler is registered and attempts focus', () => {
		render(CalendarPickerModal, {
			props: { open: true, selectedDate: null, onClose, onSelect }
		});

		const dialog = screen.getByRole('dialog');
		const outer = dialog.parentElement;
		if (!outer) return;

		// Query focusable elements BEFORE any interaction
		const focusableSelector =
			'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
		const focusable = outer.querySelectorAll<HTMLElement>(focusableSelector);
		expect(focusable.length).toBeGreaterThan(1);

		const first = focusable[0];
		const last = focusable[focusable.length - 1];

		// Stub focus methods to verify the trap calls them
		const firstFocusSpy = vi.spyOn(first, 'focus');

		// dispatchEvent directly to trigger handler on modalEl
		last.focus();
		outer.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
		);
		expect(firstFocusSpy).toHaveBeenCalled();
	});
});
