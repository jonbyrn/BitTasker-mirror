import { describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import MyQuotesPanel from '$lib/components/dashboard/quotes/MyQuotesPanel.svelte';
import FeaturedHomepageSection from '$lib/components/homepage/FeaturedHomepageSection.svelte';
import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

const { FIXED } = ServicePricingTypeEnum;

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en'),
		locales: readable(['en', 'es']),
		isLoading: readable(false)
	};
});

function createTimeline(index: number): ServiceQuoteTimelineEntry {
	return {
		request: {
			id: `request-event-id-${index}`,
			kind: 6420,
			pubkey: 'b'.repeat(64),
			created_at: 1_700_000_000 + index,
			tags: [['a', `30402:${'a'.repeat(64)}:service-${index}`]],
			content: {
				type: 'service-quote-request',
				quoteRequestId: `qr_perf${index}`,
				serviceId: `30402:${'a'.repeat(64)}:service-${index}`,
				serviceAddress: `30402:${'a'.repeat(64)}:service-${index}`,
				pricingType: FIXED,
				tierId: 'Premium',
				selectedAddOns: ['Source files'],
				inquiry: {
					title: `Need a logo refresh ${index}`,
					description: 'Please redesign our logo system for a fintech launch.',
					customFormResponses: {}
				},
				timestamp: 1_700_000_000 + index,
				version: 'v1'
			},
			sig: 'sig'
		},
		proposals: [],
		statusEventsByProposalId: {},
		latestProposal: undefined,
		resolvedStatus: 'pending',
		expirationTimestamp: undefined,
		isExpired: false,
		linkedEscrowId: undefined
	};
}

function measureAverageRender(run: () => void, iterations = 6): number {
	run();
	cleanup();

	const durations: number[] = [];

	for (let index = 0; index < iterations; index += 1) {
		const start = performance.now();
		run();
		durations.push(performance.now() - start);
		cleanup();
	}

	return durations.reduce((sum, value) => sum + value, 0) / durations.length;
}

describe('services render budget smoke', () => {
	it('keeps tasker quote review render cost within the baseline budget', () => {
		const timelines = Array.from({ length: 18 }, (_, index) => createTimeline(index + 1));
		const averageMs = measureAverageRender(() => {
			render(MyQuotesPanel, {
				props: {
					timelines,
					focusedRequestId: 'qr_perf1'
				}
			});
		});

		expect(averageMs).toBeLessThan(350);
	});

	it('keeps homepage featured shell render cost within the baseline budget', () => {
		const averageMs = measureAverageRender(() => {
			render(FeaturedHomepageSection, {
				props: {
					title: 'Featured Services',

					browseHref: '/services',
					browseLabel: 'Browse Services',
					items: [],
					loading: true,
					error: null,
					sectionTestId: 'homepage-featured-services'
				}
			});
		});

		expect(averageMs).toBeLessThan(200);
	});
});
