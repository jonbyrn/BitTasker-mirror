import { describe, expect, it } from 'vitest';
import {
	buildServiceQuoteReentryUrl,
	clearServiceQuoteReentryState,
	parseServiceQuoteReentryState
} from '$lib/utils/service-quote/reentry';

describe('service quote reentry helpers', () => {
	it('builds a canonical service-detail reentry URL with tier and add-on context', () => {
		expect(
			buildServiceQuoteReentryUrl(`30402:${'a'.repeat(64)}:service-123`, {
				openRequestQuote: true,
				tierId: 'premium',
				selectedAddOnIds: ['rush', 'source-files', 'rush']
			})
		).toBe('/services/service-123?quote=request&tier=premium&addons=rush%2Csource-files');
	});

	it('parses only valid reentry identifiers and ignores malformed values', () => {
		const state = parseServiceQuoteReentryState(
			new URL(
				'https://bittasker.test/services/service-123?quote=request&tier=premium&addons=rush,%20source-files,%20bad%20value'
			)
		);

		expect(state).toEqual({
			openRequestQuote: true,
			tierId: 'premium',
			selectedAddOnIds: ['rush', 'source-files']
		});
	});

	it('clears only the reentry params and preserves unrelated search state', () => {
		const cleared = clearServiceQuoteReentryState(
			new URL(
				'https://bittasker.test/services/service-123?quote=request&tier=premium&addons=rush&ref=dashboard'
			)
		);

		expect(`${cleared.pathname}${cleared.search}`).toBe('/services/service-123?ref=dashboard');
	});
});
