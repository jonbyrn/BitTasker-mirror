import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import DurationPickerModal from '$lib/components/date/DurationPickerModal.svelte';

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

describe('DurationPickerModal', () => {
	const onClose = vi.fn();
	const onSelect = vi.fn();
	const baseStartDate = new Date(2026, 4, 15, 14, 0, 0);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('does not render when open=false', () => {
		render(DurationPickerModal, {
			props: { open: false, baseStartDate, value: null, onClose, onSelect }
		});
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('renders dialog with days, hours, minutes inputs when open', () => {
		render(DurationPickerModal, {
			props: { open: true, baseStartDate, value: null, onClose, onSelect }
		});
		expect(screen.getByRole('dialog')).toBeInTheDocument();
		expect(screen.getByLabelText('common.components.duration_picker.days')).toBeInTheDocument();
		expect(screen.getByLabelText('common.components.duration_picker.hours')).toBeInTheDocument();
		expect(screen.getByLabelText('common.components.duration_picker.minutes')).toBeInTheDocument();
	});

	it('defaults to 0 days, 1 hour, 0 minutes', () => {
		render(DurationPickerModal, {
			props: { open: true, baseStartDate, value: null, onClose, onSelect }
		});
		const daysInput = screen.getByLabelText(
			'common.components.duration_picker.days'
		) as HTMLInputElement;
		const hoursInput = screen.getByLabelText(
			'common.components.duration_picker.hours'
		) as HTMLInputElement;
		const minsInput = screen.getByLabelText(
			'common.components.duration_picker.minutes'
		) as HTMLInputElement;
		expect(daysInput.value).toBe('0');
		expect(hoursInput.value).toBe('01');
		expect(minsInput.value).toBe('00');
	});

	it('shows computed end date/time', () => {
		render(DurationPickerModal, {
			props: {
				open: true,
				baseStartDate,
				value: { days: 0, hours: 2, minutes: 30 },
				onClose,
				onSelect
			}
		});
		expect(screen.getByText(/common\.at/)).toBeInTheDocument();
	});

	it('OK button calls onSelect with duration and onClose', async () => {
		render(DurationPickerModal, {
			props: {
				open: true,
				baseStartDate,
				value: { days: 1, hours: 3, minutes: 30 },
				onClose,
				onSelect
			}
		});
		await fireEvent.click(screen.getByText('common.components.schedule_picker.clock_ok'));
		expect(onSelect).toHaveBeenCalledWith({ days: 1, hours: 3, minutes: 30 });
	});

	it('Cancel button calls onClose without onSelect', async () => {
		render(DurationPickerModal, {
			props: { open: true, baseStartDate, value: null, onClose, onSelect }
		});
		await fireEvent.click(screen.getByText('common.cancel'));
		expect(onClose).toHaveBeenCalledTimes(1);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('Escape key calls onClose', async () => {
		render(DurationPickerModal, {
			props: { open: true, baseStartDate, value: null, onClose, onSelect }
		});
		await fireEvent.keyDown(document, { key: 'Escape' });
		expect(onClose).toHaveBeenCalled();
	});

	it('has no AM/PM toggle', () => {
		render(DurationPickerModal, {
			props: { open: true, baseStartDate, value: null, onClose, onSelect }
		});
		expect(screen.queryByText('common.components.schedule_picker.am')).toBeNull();
		expect(screen.queryByText('common.components.schedule_picker.pm')).toBeNull();
	});
});
