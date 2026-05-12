import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import TimeSlotPickerModal from '$lib/components/date/TimeSlotPickerModal.svelte';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('$lib/utils/portal', () => ({
	teleport: vi.fn(() => ({ destroy: vi.fn() }))
}));

vi.mock('svelte-i18n', () => ({
	t: readable((key: string) => key),
	locale: readable('en')
}));

// ── Tests ──────────────────────────────────────────────────────────────────

describe('TimeSlotPickerModal', () => {
	const onClose = vi.fn();
	const onSelect = vi.fn();
	const baseDate = new Date(2026, 4, 15); // May 15, 2026

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers().setSystemTime(new Date(2026, 0, 1)); // Jan 1, 2026
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('does not render when open=false', () => {
		render(TimeSlotPickerModal, {
			props: { open: false, baseDate, value: null, onClose, onSelect }
		});
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	});

	it('renders hour/minute inputs when open', () => {
		render(TimeSlotPickerModal, {
			props: { open: true, baseDate, value: null, onClose, onSelect }
		});
		expect(screen.getByRole('dialog')).toBeInTheDocument();
		expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
	});

	it('renders hour and minute input fields', () => {
		render(TimeSlotPickerModal, {
			props: { open: true, baseDate, value: null, onClose, onSelect }
		});

		const hourInput = screen.getByLabelText('common.components.schedule_picker.hour_short_label');
		const minInput = screen.getByLabelText('common.components.schedule_picker.minute_short_label');
		expect(hourInput).toBeInTheDocument();
		expect(minInput).toBeInTheDocument();
	});

	it('defaults hour to 12 and minute to 00 with PM selected', () => {
		render(TimeSlotPickerModal, {
			props: { open: true, baseDate, value: null, onClose, onSelect }
		});

		const hourInput = screen.getByLabelText(
			'common.components.schedule_picker.hour_short_label'
		) as HTMLInputElement;
		const minInput = screen.getByLabelText(
			'common.components.schedule_picker.minute_short_label'
		) as HTMLInputElement;

		// Default value is noon base, so 12:00 PM
		expect(hourInput.value).toBe('12');
		expect(minInput.value).toBe('00');
	});

	it('AM/PM toggle works: clicking PM sets PM active', () => {
		render(TimeSlotPickerModal, {
			props: { open: true, baseDate, value: null, onClose, onSelect }
		});

		const pmButton = screen.getByText('common.components.schedule_picker.pm');
		const amButton = screen.getByText('common.components.schedule_picker.am');

		// Default is PM (noon), so PM should be pressed
		expect(pmButton).toHaveAttribute('aria-pressed', 'true');
		expect(amButton).toHaveAttribute('aria-pressed', 'false');

		// Click AM
		fireEvent.click(amButton);
		expect(amButton).toHaveAttribute('aria-pressed', 'true');
		expect(pmButton).toHaveAttribute('aria-pressed', 'false');

		// Click PM back
		fireEvent.click(pmButton);
		expect(pmButton).toHaveAttribute('aria-pressed', 'true');
		expect(amButton).toHaveAttribute('aria-pressed', 'false');
	});

	it('typing hour value updates the input', () => {
		render(TimeSlotPickerModal, {
			props: { open: true, baseDate, value: null, onClose, onSelect }
		});

		const hourInput = screen.getByLabelText(
			'common.components.schedule_picker.hour_short_label'
		) as HTMLInputElement;

		fireEvent.input(hourInput, { target: { value: '08' } });
		expect(hourInput.value).toBe('08');
	});

	it('typing minute value updates the input', () => {
		render(TimeSlotPickerModal, {
			props: { open: true, baseDate, value: null, onClose, onSelect }
		});

		const minInput = screen.getByLabelText(
			'common.components.schedule_picker.minute_short_label'
		) as HTMLInputElement;

		fireEvent.input(minInput, { target: { value: '45' } });
		expect(minInput.value).toBe('45');
	});

	it('OK button calls onSelect with merged date and onClose', () => {
		render(TimeSlotPickerModal, {
			props: { open: true, baseDate, value: null, onClose, onSelect }
		});

		const okButton = screen.getByText('common.components.schedule_picker.clock_ok');
		fireEvent.click(okButton);

		expect(onSelect).toHaveBeenCalledTimes(1);
		const selected = onSelect.mock.calls[0][0] as Date;

		// Default is 12:00 PM (noon) on baseDate (May 15, 2026)
		// After clamping and snapping: May 15, 2026 at 12:00
		expect(selected.getFullYear()).toBe(2026);
		expect(selected.getMonth()).toBe(4);
		expect(selected.getDate()).toBe(15);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('OK button with AM selected sets correct hour', () => {
		render(TimeSlotPickerModal, {
			props: { open: true, baseDate, value: null, onClose, onSelect }
		});

		// Set hour to 9, AM
		const hourInput = screen.getByLabelText(
			'common.components.schedule_picker.hour_short_label'
		) as HTMLInputElement;
		fireEvent.input(hourInput, { target: { value: '09' } });

		const amButton = screen.getByText('common.components.schedule_picker.am');
		fireEvent.click(amButton);

		const okButton = screen.getByText('common.components.schedule_picker.clock_ok');
		fireEvent.click(okButton);

		expect(onSelect).toHaveBeenCalledTimes(1);
		const selected = onSelect.mock.calls[0][0] as Date;
		// 9 AM = 09:00
		expect(selected.getHours()).toBe(9);
	});

	it('OK button with PM selected sets correct 24h hour', () => {
		render(TimeSlotPickerModal, {
			props: { open: true, baseDate, value: null, onClose, onSelect }
		});

		// Set hour to 3, PM
		const hourInput = screen.getByLabelText(
			'common.components.schedule_picker.hour_short_label'
		) as HTMLInputElement;
		fireEvent.input(hourInput, { target: { value: '03' } });

		// Default is already PM, but ensure it
		const pmButton = screen.getByText('common.components.schedule_picker.pm');
		fireEvent.click(pmButton);

		const okButton = screen.getByText('common.components.schedule_picker.clock_ok');
		fireEvent.click(okButton);

		expect(onSelect).toHaveBeenCalledTimes(1);
		const selected = onSelect.mock.calls[0][0] as Date;
		// 3 PM = 15:00
		expect(selected.getHours()).toBe(15);
	});

	it('12 AM maps to 0:00 internally', () => {
		render(TimeSlotPickerModal, {
			props: { open: true, baseDate, value: null, onClose, onSelect }
		});

		// Default hour is 12, so switch to AM
		const amButton = screen.getByText('common.components.schedule_picker.am');
		fireEvent.click(amButton);

		const okButton = screen.getByText('common.components.schedule_picker.clock_ok');
		fireEvent.click(okButton);

		expect(onSelect).toHaveBeenCalledTimes(1);
		const selected = onSelect.mock.calls[0][0] as Date;
		// 12 AM = 00:00 (midnight)
		expect(selected.getHours()).toBe(0);
	});

	it('12 PM maps to 12:00 internally', () => {
		render(TimeSlotPickerModal, {
			props: { open: true, baseDate, value: null, onClose, onSelect }
		});

		// Default is 12 PM (noon), just click OK
		const okButton = screen.getByText('common.components.schedule_picker.clock_ok');
		fireEvent.click(okButton);

		expect(onSelect).toHaveBeenCalledTimes(1);
		const selected = onSelect.mock.calls[0][0] as Date;
		// 12 PM = 12:00
		expect(selected.getHours()).toBe(12);
	});

	it('Cancel button calls onClose without selecting', () => {
		render(TimeSlotPickerModal, {
			props: { open: true, baseDate, value: null, onClose, onSelect }
		});

		fireEvent.click(screen.getByText('common.components.confirm_modal.cancel'));

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('Close (X) button calls onClose', () => {
		render(TimeSlotPickerModal, {
			props: { open: true, baseDate, value: null, onClose, onSelect }
		});

		fireEvent.click(screen.getByLabelText('common.components.schedule_picker.close_picker'));

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('Escape key calls onClose', () => {
		render(TimeSlotPickerModal, {
			props: { open: true, baseDate, value: null, onClose, onSelect }
		});

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('Escape key does nothing when closed', () => {
		render(TimeSlotPickerModal, {
			props: { open: false, baseDate, value: null, onClose, onSelect }
		});

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));

		expect(onClose).not.toHaveBeenCalled();
	});

	it('invalid hour input resets to previous valid value on blur', () => {
		render(TimeSlotPickerModal, {
			props: { open: true, baseDate, value: null, onClose, onSelect }
		});

		const hourInput = screen.getByLabelText(
			'common.components.schedule_picker.hour_short_label'
		) as HTMLInputElement;

		// Type invalid value
		fireEvent.input(hourInput, { target: { value: '99' } });
		expect(hourInput.value).toBe('99');

		// Blur triggers commitHourFromInput which clamps to 1-12
		fireEvent.blur(hourInput);

		// Should reset to 12 (previous valid, clamped from 99)
		expect(hourInput.value).toBe('12');
	});

	it('invalid minute input resets to previous valid value on blur', () => {
		render(TimeSlotPickerModal, {
			props: { open: true, baseDate, value: null, onClose, onSelect }
		});

		const minInput = screen.getByLabelText(
			'common.components.schedule_picker.minute_short_label'
		) as HTMLInputElement;

		// Type invalid value
		fireEvent.input(minInput, { target: { value: '99' } });
		expect(minInput.value).toBe('99');

		// Blur triggers commitMinFromInput which clamps to 0-59
		fireEvent.blur(minInput);

		// Should clamp to 59
		expect(minInput.value).toBe('59');
	});

	it('non-numeric hour input resets to previous valid value on blur', () => {
		render(TimeSlotPickerModal, {
			props: { open: true, baseDate, value: null, onClose, onSelect }
		});

		const hourInput = screen.getByLabelText(
			'common.components.schedule_picker.hour_short_label'
		) as HTMLInputElement;

		// Type empty string (non-numeric gets stripped to empty by onHourInput)
		fireEvent.input(hourInput, { target: { value: '' } });
		expect(hourInput.value).toBe('');

		// Blur should restore to previous valid value (12)
		fireEvent.blur(hourInput);
		expect(hourInput.value).toBe('12');
	});

	it('shows correct title for start period', () => {
		render(TimeSlotPickerModal, {
			props: {
				open: true,
				baseDate,
				value: null,
				period: 'start',
				onClose,
				onSelect
			}
		});

		expect(
			screen.getByText('common.components.schedule_picker.time_label_start')
		).toBeInTheDocument();
	});

	it('shows correct title for end period', () => {
		render(TimeSlotPickerModal, {
			props: {
				open: true,
				baseDate,
				value: null,
				period: 'end',
				onClose,
				onSelect
			}
		});

		expect(
			screen.getByText('common.components.schedule_picker.time_label_end')
		).toBeInTheDocument();
	});

	it('shows default title when no period is specified', () => {
		render(TimeSlotPickerModal, {
			props: { open: true, baseDate, value: null, onClose, onSelect }
		});

		expect(screen.getByText('common.components.schedule_picker.time')).toBeInTheDocument();
	});

	it('non-numeric characters are stripped from hour input', () => {
		render(TimeSlotPickerModal, {
			props: { open: true, baseDate, value: null, onClose, onSelect }
		});

		const hourInput = screen.getByLabelText(
			'common.components.schedule_picker.hour_short_label'
		) as HTMLInputElement;

		// Type digits with non-numeric characters mixed in
		fireEvent.input(hourInput, { target: { value: '1a2b' } });
		// onHourInput strips non-digits: '12'
		expect(hourInput.value).toBe('12');
	});

	it('non-numeric characters are stripped from minute input', () => {
		render(TimeSlotPickerModal, {
			props: { open: true, baseDate, value: null, onClose, onSelect }
		});

		const minInput = screen.getByLabelText(
			'common.components.schedule_picker.minute_short_label'
		) as HTMLInputElement;

		fireEvent.input(minInput, { target: { value: '3a0' } });
		// onMinInput strips non-digits: '30'
		expect(minInput.value).toBe('30');
	});

	it('Tab focus wraps within modal: handler is registered and attempts focus', () => {
		render(TimeSlotPickerModal, {
			props: { open: true, baseDate, value: null, onClose, onSelect }
		});

		const dialog = screen.getByRole('dialog');
		const outer = dialog.parentElement;
		if (!outer) return;

		const focusableSelector =
			'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
		const focusable = outer.querySelectorAll<HTMLElement>(focusableSelector);
		expect(focusable.length).toBeGreaterThan(1);

		const first = focusable[0];
		const last = focusable[focusable.length - 1];

		const firstFocusSpy = vi.spyOn(first, 'focus');

		last.focus();
		outer.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
		);
		expect(firstFocusSpy).toHaveBeenCalled();
	});
});
