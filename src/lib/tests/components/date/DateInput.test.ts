import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import DateInput from '$lib/components/date/DateInput.svelte';

describe('DateInput', () => {
	it('keeps a stored deadline and a newly chosen day', async () => {
		const onChange = vi.fn();
		const { getByTestId, rerender } = render(DateInput, {
			props: {
				value: '2026-11-02T23:59:59.999Z',
				minDate: '2026-10-21T15:04:00.000Z',
				onChange
			}
		});

		const input = getByTestId('date-input') as HTMLInputElement;
		expect(input.value).toBe('2026-11-02');
		expect(input.min).toBe('2026-10-21');

		await fireEvent.input(input, { target: { value: '2026-12-01' } });
		const picked = onChange.mock.calls.at(-1)?.[0] as Date;
		expect(picked.getFullYear()).toBe(2026);
		expect(picked.getMonth()).toBe(11);
		expect(picked.getDate()).toBe(1);

		await rerender({
			value: '2026-12-01T23:59:59.999Z',
			minDate: '2026-10-21T15:04:00.000Z',
			onChange
		});
		expect(input.value).toBe('2026-12-01');
	});

	it('shows the local calendar day of a Date', () => {
		const { getByTestId } = render(DateInput, {
			props: { value: new Date(2026, 10, 2), onChange: () => {} }
		});
		expect((getByTestId('date-input') as HTMLInputElement).value).toBe('2026-11-02');
	});
});
