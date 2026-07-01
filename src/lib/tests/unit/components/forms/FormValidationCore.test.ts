import { describe, expect, it } from 'vitest';
import {
	collectMissingRequiredInquiryFieldIds,
	hasRequiredInquiryFieldValue,
	hasRequiredTrimmedText,
	validateDateTimeRange
} from '$lib/components/forms/FormValidationCore';
import type { InquiryFormField } from '$lib/types/service.d';

describe('FormValidationCore', () => {
	it('checks required trimmed text deterministically', () => {
		expect(hasRequiredTrimmedText('hello')).toBe(true);
		expect(hasRequiredTrimmedText('   ')).toBe(false);
		expect(hasRequiredTrimmedText(undefined)).toBe(false);
	});

	it('checks required inquiry field values using the existing modal contract', () => {
		expect(hasRequiredInquiryFieldValue('value')).toBe(true);
		expect(hasRequiredInquiryFieldValue(true)).toBe(true);
		expect(hasRequiredInquiryFieldValue(['a'])).toBe(true);
		expect(hasRequiredInquiryFieldValue('')).toBe(false);
		expect(hasRequiredInquiryFieldValue(undefined)).toBe(false);
		expect(hasRequiredInquiryFieldValue([])).toBe(false);
	});

	it('collects missing required inquiry field ids', () => {
		const fields: InquiryFormField[] = [
			{ id: 'company', type: 'text', label: 'Company', required: true },
			{ id: 'budget', type: 'number', label: 'Budget', required: false },
			{ id: 'channels', type: 'checkbox', label: 'Channels', required: true, options: ['seo'] }
		];

		expect(
			collectMissingRequiredInquiryFieldIds(fields, {
				company: '',
				channels: []
			})
		).toEqual(['company', 'channels']);
	});

	it('validates datetime ranges for proposal authoring', () => {
		expect(validateDateTimeRange('', '')).toEqual({
			ok: false,
			errorCode: 'missing'
		});
		expect(validateDateTimeRange('bad', '2026-03-20T10:00')).toEqual({
			ok: false,
			errorCode: 'invalid'
		});
		expect(validateDateTimeRange('2026-03-20T10:00', '2026-03-20T09:00')).toEqual({
			ok: false,
			errorCode: 'end_before_start'
		});

		const valid = validateDateTimeRange('2026-03-20T10:00', '2026-03-20T11:00');
		expect(valid.ok).toBe(true);
		if (valid.ok) {
			expect(valid.endTime).toBeGreaterThan(valid.startTime);
		}
	});
});
