import type { InquiryFormField } from '$lib/types/service.d';

export type InquiryFieldValue = string | number | boolean | string[] | undefined;

export interface DateTimeRangeValidationSuccess {
	ok: true;
	startTime: number;
	endTime: number;
}

export interface DateTimeRangeValidationFailure {
	ok: false;
	errorCode: 'missing' | 'invalid' | 'end_before_start';
}

export type DateTimeRangeValidationResult =
	| DateTimeRangeValidationSuccess
	| DateTimeRangeValidationFailure;

export function hasRequiredTrimmedText(value: string | null | undefined): boolean {
	return typeof value === 'string' && value.trim().length > 0;
}

export function hasRequiredInquiryFieldValue(value: InquiryFieldValue): boolean {
	return !(value === undefined || value === '' || (Array.isArray(value) && value.length === 0));
}

export function collectMissingRequiredInquiryFieldIds(
	fields: InquiryFormField[],
	values: Record<string, InquiryFieldValue>
): string[] {
	return fields
		.filter((field) => field.required && !hasRequiredInquiryFieldValue(values[field.id]))
		.map((field) => field.id);
}

export function validateDateTimeRange(
	startDateTime: string,
	endDateTime: string
): DateTimeRangeValidationResult {
	if (!startDateTime || !endDateTime) {
		return {
			ok: false,
			errorCode: 'missing'
		};
	}

	const startTime = Math.floor(new Date(startDateTime).getTime() / 1000);
	const endTime = Math.floor(new Date(endDateTime).getTime() / 1000);

	if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
		return {
			ok: false,
			errorCode: 'invalid'
		};
	}

	if (endTime <= startTime) {
		return {
			ok: false,
			errorCode: 'end_before_start'
		};
	}

	return {
		ok: true,
		startTime,
		endTime
	};
}

