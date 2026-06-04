import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import MyQuotesPanel from '$lib/components/dashboard/quotes/MyQuotesPanel.svelte';
import ServiceQuotesInbox from '$lib/components/service/quotes/ServiceQuotesInbox.svelte';
import type { Service } from '$lib/types/service.d';
import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

const { FIXED } = ServicePricingTypeEnum;

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => {
			if (key === 'common.cancel') return 'Cancel';
			if (key === 'common.components.drawer.close') return 'Close';
			if (key === 'dashboard.find_tasks.avatar_alt') return 'Avatar';
			if (key === 'dashboard.services.detail.book_now_drawer.title') return 'Confirm Book Now';
			if (key === 'dashboard.services.detail.book_now_drawer.confirm_cta') return 'Book Now';
			if (key === 'dashboard.services.detail.book_now_drawer.day') return 'day';
			if (key === 'dashboard.services.detail.book_now_drawer.days') return 'days';
			if (key === 'dashboard.services.detail.book_now_drawer.hour') return 'hour';
			if (key === 'dashboard.services.detail.book_now_drawer.hours') return 'hours';
			if (key === 'dashboard.services.detail.book_now_drawer.minute') return 'minute';
			if (key === 'dashboard.services.detail.book_now_drawer.minutes') return 'minutes';
			if (key === 'dashboard.services.detail.book_now_drawer.unavailable') return 'N/A';
			if (key === 'dashboard.services.my_services.quote_inbox.view_proposal')
				return 'View Proposal';
			if (key === 'dashboard.services.my_services.quote_inbox.send_proposal')
				return 'Send Proposal';
			if (key === 'dashboard.services.my_services.quote_inbox.view_proposal_short') return 'View';
			if (key === 'dashboard.services.my_services.quote_inbox.send_proposal_short') return 'Send';
			if (key === 'dashboard.services.my_services.quote_inbox.view_contract_short')
				return 'Contract';
			return key;
		}),
		locale: readable('en'),
		locales: readable(['en', 'es']),
		isLoading: readable(false)
	};
});

vi.mock('$lib/utils/network-status', () => ({
	browserNetworkStatus: {
		subscribe: (callback: (value: { online: boolean; lastTransition: string }) => void) => {
			callback({ online: true, lastTransition: 'initial' });
			return () => {};
		}
	}
}));

const service: Service = {
	id: 'service-event-1',
	npub: 'b'.repeat(64),
	uniqueId: 'service-1234',
	status: 'active',
	title: 'Premium Logo Package',
	description: 'Logo system and brand guide',
	serviceLocationTypes: [ServiceLocationTypeEnum.REMOTE],
	pricing: {
		type: ServicePricingTypeEnum.FIXED,
		currency: 'USD',
		amount: 250
	},
	skills: ['Design'],
	categories: [],
	createdAt: 1_700_000_000
};

function createTimelineWithoutProposal(): ServiceQuoteTimelineEntry {
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
				pricingType: FIXED,
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
		latestProposal: undefined,
		resolvedStatus: 'pending',
		expirationTimestamp: 1_700_345_600,
		isExpired: false,
		linkedEscrowId: undefined
	};
}

function createTimelineWithProposal(): ServiceQuoteTimelineEntry {
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
				pricingType: FIXED,
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
		proposals: [
			{
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
			}
		],
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
	describe('when online', () => {
		it('renders MyQuotesPanel with timeline content', () => {
			render(MyQuotesPanel, {
				timelines: [createTimelineWithProposal()],
				focusedRequestId: 'qr_a11y123'
			});

			// Verify the panel mounts and renders a quote card
			expect(screen.getByTestId('my-quotes-panel')).toBeTruthy();
			const elements = screen.getAllByText('Proposal received');
			expect(elements.length).toBeGreaterThan(0);
		});

		it('keeps provider reply controls named and enabled when proposal exists', () => {
			// Timeline with a proposal shows "View Proposal" button
			render(ServiceQuotesInbox, {
				service,
				timelines: [createTimelineWithProposal()],
				focusedRequestId: 'qr_a11y123',
				walletReady: true,
				feeTierReady: true,
				onSendProposal: async () => ({ success: true })
			});

			expect(screen.getByRole('button', { name: 'View' })).toBeEnabled();
		});

		it('shows Send Proposal button when no proposal exists', () => {
			// Timeline without a proposal shows "Send Proposal" button
			render(ServiceQuotesInbox, {
				service,
				timelines: [createTimelineWithoutProposal()],
				focusedRequestId: 'qr_a11y123',
				walletReady: true,
				feeTierReady: true,
				onSendProposal: async () => ({ success: true })
			});

			expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
		});
	});
});
