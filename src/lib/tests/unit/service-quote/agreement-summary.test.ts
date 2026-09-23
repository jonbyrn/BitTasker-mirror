import { describe, expect, it } from 'vitest';
import { buildServiceQuoteAgreementSummary } from '$lib/utils/service-quote/agreement-summary';
import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

const timeline: ServiceQuoteTimelineEntry = {
	request: {
		id: 'request-event-1',
		kind: 6420,
		pubkey: 'buyer'.repeat(12).slice(0, 64),
		created_at: 1,
		tags: [],
		content: {
			type: 'service-quote-request',
			quoteRequestId: 'qr_valid123',
			serviceId: '30402:provider:service',
			serviceAddress: '30402:provider:service',
			pricingType: ServicePricingTypeEnum.TIERED,
			tierId: 'premium',
			selectedAddOns: ['source-files'],
			rushDelivery: true,
			inquiry: {
				title: 'Brand system',
				description: 'Need a full brand system.',
				customFormResponses: {
					brandVoice: 'Playful'
				}
			},
			timestamp: 1,
			version: 'v1'
		},
		sig: ''
	},
	proposals: [],
	statusEventsByProposalId: {},
	latestProposal: {
		id: 'proposal-event-1',
		kind: 6421,
		pubkey: 'provider'.repeat(8).slice(0, 64),
		created_at: 2,
		tags: [],
		content: {
			type: 'service-proposal',
			proposalId: 'pr_valid123',
			quoteRequestId: 'qr_valid123',
			serviceId: '30402:provider:service',
			serviceAddress: '30402:provider:service',
			paymentType: 'FIXED',
			amountUsdt: '325.00',
			description: 'Three concepts and a mini style guide.',
			estimatedDuration: '5 business days',
			estimatedStartTime: 1_700_000_000,
			estimatedEndTime: 1_700_432_000,
			expirationDays: 3,
			expirationHours: 0,
			expirationTimestamp: 1_700_500_000,
			freelancerBitcoinAddress: 'tb1qfreelanceraddress0000000000000000000000000',
			freelancerFeeTier: 1,
			pricingSnapshot: {
				serviceVersionRef: 'service-event-1',
				tierId: 'premium',
				selectedAddOns: ['source-files'],
				rushDelivery: true
			},
			timestamp: 2,
			version: 'v1'
		},
		sig: ''
	},
	resolvedStatus: 'pending',
	isExpired: false
};

describe('buildServiceQuoteAgreementSummary', () => {
	it('maps quote timelines into the shared agreement summary contract', () => {
		expect(buildServiceQuoteAgreementSummary(timeline)).toEqual({
			quoteRequestId: 'qr_valid123',
			proposalId: 'pr_valid123',
			selectedTierLabel: 'premium',
			agreementSnapshot: {
				selectedTierId: 'premium',
				selectedAddOns: ['source-files'],
				rushDelivery: true,
				deliverables: 'Three concepts and a mini style guide.',
				inquiryAnswers: {
					brandVoice: 'Playful'
				},
				priceSnapshotLabel: '325.00 USDT'
			},
			pricingSnapshot: {
				serviceVersionRef: 'service-event-1',
				tierId: 'premium',
				selectedAddOns: ['source-files'],
				rushDelivery: true
			},
			estimatedStartTime: 1_700_000_000,
			estimatedCompletionTime: 1_700_432_000,
			estimatedDuration: '5 business days'
		});
	});

	it('returns null when a latest proposal is unavailable', () => {
		expect(
			buildServiceQuoteAgreementSummary({
				...timeline,
				latestProposal: undefined
			})
		).toBeNull();
	});
});
