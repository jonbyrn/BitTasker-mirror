import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import SchemaDrivenFieldRenderer from '$lib/components/forms/SchemaDrivenFieldRenderer.svelte';
import type { InquiryFormField } from '$lib/types/service.d';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key)
	};
});

describe('SchemaDrivenFieldRenderer', () => {
	it('renders text-like fields and forwards updated values', async () => {
		const onValueChange = vi.fn();
		const field: InquiryFormField = {
			id: 'company',
			type: 'text',
			label: 'Company',
			placeholder: 'Acme',
			required: true
		};

		render(SchemaDrivenFieldRenderer, {
			field,
			inputId: 'company-field',
			value: '',
			error: 'Required',
			onValueChange
		});

		const input = screen.getByRole('textbox') as HTMLInputElement;
		expect(screen.getByText('Company')).toBeTruthy();
		expect(screen.getByText('Required')).toBeTruthy();

		await fireEvent.input(input, { target: { value: 'Acme Inc' } });

		expect(onValueChange).toHaveBeenCalledWith('Acme Inc');
	});

	it('renders number fields and preserves empty values as undefined', async () => {
		const onValueChange = vi.fn();
		const field: InquiryFormField = {
			id: 'pages',
			type: 'number',
			label: 'Pages',
			placeholder: '10',
			required: false,
			validation: { min: 1, max: 100 }
		};

		render(SchemaDrivenFieldRenderer, {
			field,
			inputId: 'pages-field',
			value: undefined,
			onValueChange
		});

		const input = screen.getByRole('spinbutton') as HTMLInputElement;
		expect(input.min).toBe('1');
		expect(input.max).toBe('100');

		await fireEvent.input(input, { target: { value: '12' } });
		await fireEvent.input(input, { target: { value: '' } });

		expect(onValueChange).toHaveBeenNthCalledWith(1, 12);
		expect(onValueChange).toHaveBeenNthCalledWith(2, undefined);
	});

	it('renders select fields with the shared choose option', async () => {
		const onValueChange = vi.fn();
		const field: InquiryFormField = {
			id: 'package',
			type: 'select',
			label: 'Package',
			required: true,
			options: ['Starter', 'Growth']
		};

		render(SchemaDrivenFieldRenderer, {
			field,
			inputId: 'package-field',
			value: '',
			onValueChange
		});

		const select = screen.getByRole('combobox') as HTMLSelectElement;
		expect(screen.getByRole('option', { name: 'dashboard.services.detail.request_quote_modal.choose' })).toBeTruthy();

		await fireEvent.change(select, { target: { value: 'Growth' } });

		expect(onValueChange).toHaveBeenCalledWith('Growth');
	});

	it('renders checkbox groups and forwards updated arrays', async () => {
		const onValueChange = vi.fn();
		const field: InquiryFormField = {
			id: 'deliverables',
			type: 'checkbox',
			label: 'Deliverables',
			required: false,
			options: ['Report', 'Recording']
		};

		render(SchemaDrivenFieldRenderer, {
			field,
			inputId: 'deliverables-field',
			value: ['Report'],
			onValueChange
		});

		const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
		expect(checkboxes[0]?.checked).toBe(true);
		expect(checkboxes[1]?.checked).toBe(false);

		await fireEvent.click(checkboxes[1]!);
		await fireEvent.click(checkboxes[0]!);

		expect(onValueChange).toHaveBeenNthCalledWith(1, ['Report', 'Recording']);
		expect(onValueChange).toHaveBeenNthCalledWith(2, []);
	});

	it('renders single checkboxes, dates, times, and fallback text inputs', async () => {
		const onToggle = vi.fn();
		const checkboxRender = render(SchemaDrivenFieldRenderer, {
			field: {
				id: 'nda',
				type: 'checkbox',
				label: 'NDA',
				placeholder: 'I need an NDA',
				required: false
			} satisfies InquiryFormField,
			inputId: 'nda-field',
			value: false,
			onValueChange: onToggle
		});

		await fireEvent.click(checkboxRender.getByRole('checkbox'));
		expect(onToggle).toHaveBeenCalledWith(true);
		checkboxRender.unmount();

		const onDateChange = vi.fn();
		const dateRender = render(SchemaDrivenFieldRenderer, {
			field: {
				id: 'launch-date',
				type: 'date',
				label: 'Launch date',
				required: false
			} satisfies InquiryFormField,
			inputId: 'launch-date-field',
			value: '2026-03-20',
			onValueChange: onDateChange
		});

		const dateInput = dateRender.getByDisplayValue('2026-03-20') as HTMLInputElement;
		await fireEvent.input(dateInput, { target: { value: '2026-03-21' } });
		expect(onDateChange).toHaveBeenCalledWith('2026-03-21');
		dateRender.unmount();

		const onTimeChange = vi.fn();
		const timeRender = render(SchemaDrivenFieldRenderer, {
			field: {
				id: 'launch-time',
				type: 'time',
				label: 'Launch time',
				required: false
			} satisfies InquiryFormField,
			inputId: 'launch-time-field',
			value: '09:30',
			onValueChange: onTimeChange
		});

		const timeInput = timeRender.getByDisplayValue('09:30') as HTMLInputElement;
		await fireEvent.input(timeInput, { target: { value: '10:15' } });
		expect(onTimeChange).toHaveBeenCalledWith('10:15');
		timeRender.unmount();

		const onFallbackChange = vi.fn();
		const fallbackRender = render(SchemaDrivenFieldRenderer, {
			field: {
				id: 'mystery',
				type: 'text',
				label: 'Mystery',
				required: false
			} satisfies InquiryFormField,
			inputId: 'mystery-field',
			value: 'legacy',
			onValueChange: onFallbackChange
		});

		const fallbackInput = fallbackRender.getByDisplayValue('legacy') as HTMLInputElement;
		await fireEvent.input(fallbackInput, { target: { value: 'updated' } });
		expect(onFallbackChange).toHaveBeenCalledWith('updated');
	});
});
