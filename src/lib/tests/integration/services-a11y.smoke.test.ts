import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import MyQuotesPanel from '$lib/components/dashboard/quotes/MyQuotesPanel.svelte';
import ServiceInstantBuyModal from '$lib/components/service/ServiceInstantBuyModal.svelte';
import ServiceQuotesInbox from '$lib/components/service/quotes/ServiceQuotesInbox.svelte';
import type { Service } from '$lib/types/service.d';
import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

const service: Service = {
	id: 'service-event-1',
	npub: 'b'.repeat(64),
	uniqueId: 'service-1234',
	status: 'active',
	title: 'Premium Logo Package',
	description: 'Logo system and brand guide',
	serviceLocationTypes: ['remote'],
	pricing: {
		type: ServicePricingTypeEnum.FIXED,
		currency: 'USD',
		amount: 250
	},
	skills: ['Design'],
	categories: [],
	createdAt: 1_700_000_000
};

function createTimeline(): ServiceQuoteTimelineEntry {
	return {
		request: {
			id: 'request-event-id',
			kind: 6420,
			pubkey: 'b'.repeat(64),
			created_at: 1_700_000_000,
			tags: [['a', `30402:${'a'.repeat(64)}:service-1234`]],
			content: {
				type: 'service-quote-request',
				quoteRequestId: 'qr_a11y123',
				serviceId: `30402:${'a'.repeat(64)}:service-1234`,
				serviceAddress: `30402:${'a'.repeat(64)}:service-1234`,
				pricingType: 'FIXED',
				tierId: 'Premium',
				selectedAddOns: ['Source files'],
				inquiry: {
					title: 'Need a logo refresh',
					description: 'Please redesign our logo system for a fintech launch.',
					customFormResponses: {
						Industry: 'Fintech'
					}
				},
				timestamp: 1_700_000_000,
				version: 'v1'
			},
			sig: 'sig'
		},
		proposals: [],
		statusEventsByProposalId: {},
		latestProposal: {
			id: 'proposal-event-id',
			kind: 6421,
			pubkey: 'a'.repeat(64),
			created_at: 1_700_000_100,
			tags: [['e', 'request-event-id']],
			content: {
				type: 'service-proposal',
				proposalId: 'proposal_a11y123',
				quoteRequestId: 'qr_a11y123',
				serviceId: `30402:${'a'.repeat(64)}:service-1234`,
				serviceAddress: `30402:${'a'.repeat(64)}:service-1234`,
				paymentType: 'FIXED',
				amountUsdt: '250.00',
				description: 'Logo system and brand guide with three concepts.',
				estimatedDuration: '3 days',
				estimatedStartTime: 1_700_086_400,
				estimatedEndTime: 1_700_345_600,
				expirationDays: 3,
				expirationHours: 0,
				expirationTimestamp: 1_700_345_600,
				freelancerRskAddress: '0x1234567890123456789012345678901234567890',
				freelancerFeeTier: 1,
				pricingSnapshot: {
					serviceVersionRef: 'service-event-id'
				},
				timestamp: 1_700_000_100,
				version: 'v1'
			},
			sig: 'sig'
		},
		resolvedStatus: 'pending',
		expirationTimestamp: 1_700_345_600,
		isExpired: false,
		linkedEscrowId: undefined
	};
}

describe('services accessibility smoke', () => {
	beforeEach(() => {
		Object.defineProperty(window.navigator, 'onLine', {
			value: false,
			configurable: true
		});
	});

	it('keeps tasker quote actions discoverable by accessible name while offline', () => {
		render(MyQuotesPanel, {
			timelines: [createTimeline()],
			focusedRequestId: 'qr_a11y123'
		});

		window.dispatchEvent(new Event('offline'));

		expect(screen.getByRole('heading', { name: 'My Quotes' })).toBeTruthy();
		return waitFor(() => {
			expect(screen.getByTestId('my-quotes-offline-alert')).toBeTruthy();
			expect(screen.getByRole('button', { name: 'Accept Proposal' })).toBeDisabled();
			expect(screen.getByRole('button', { name: 'Decline' })).toBeDisabled();
		});
	});

	it('keeps provider reply controls named and blocked in-context while offline', () => {
		render(ServiceQuotesInbox, {
			service,
			timelines: [createTimeline()],
			focusedRequestId: 'qr_a11y123',
			walletReady: true,
			feeTierReady: true,
			onSendProposal: async () => ({ success: true })
		});

		window.dispatchEvent(new Event('offline'));

		expect(screen.getByRole('heading', { name: 'Quotes Inbox' })).toBeTruthy();
		return waitFor(() => {
			expect(screen.getByTestId('service-quotes-offline-alert')).toBeTruthy();
			expect(screen.getByRole('button', { name: 'Send Proposal' })).toBeDisabled();
		});
	});

	it('keeps instant-buy confirmation actions named when the browser is offline', () => {
		render(ServiceInstantBuyModal, {
			open: true,
			serviceTitle: 'Premium Logo Package',
			providerName: 'Designer',
			isOffline: true,
			agreementSnapshot: {
				deliverables: 'Logo system and brand guide',
				priceSnapshotLabel: '$250.00'
			},
			pricingSnapshot: {
				serviceVersionRef: 'service-event-1'
			}
		});

		expect(screen.getByRole('heading', { name: 'Confirm Instant Buy' })).toBeTruthy();
		expect(screen.getByTestId('service-instant-buy-offline-alert')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
		expect(screen.getByRole('button', { name: 'Buy Now' })).toBeDisabled();
	});
});
