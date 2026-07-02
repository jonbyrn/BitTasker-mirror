import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import DashboardQuoteCard from '$lib/components/dashboard/quotes/DashboardQuoteCard.svelte';
import ServiceRequestDrawer from '$lib/components/dashboard/quotes/ServiceRequestDrawer.svelte';
import type { Service, ServicePricing } from '$lib/types/service';
import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

vi.mock('$lib/components/user/UserInfoDisplay.svelte', () => ({
	default: () => ({
		$$render: () => '<div data-testid="user-info-display">User</div>'
	})
}));

vi.mock('$lib/components/service/ServiceTab.svelte', () => ({
	default: () => ({
		$$render: () => '<div data-testid="service-tab">Service tab</div>'
	})
}));

const serviceAddress = `30402:${'a'.repeat(64)}:service-unique-id`;

const service: Service = {
	id: 'service-event-1',
	npub: 'a'.repeat(64),
	uniqueId: 'service-unique-id',
	status: 'active',
	title: 'Migration Service',
	description: 'Move systems carefully.',
	serviceLocationTypes: [],
	pricing: {
		type: ServicePricingTypeEnum.INQUIRY_REQUIRED,
		currency: 'USD',
		tiers: [
			{ id: 'premium', name: 'Premium Plan', price: 250 },
			{ id: 'standard', name: 'Standard Plan', price: 150 }
		]
	} as unknown as ServicePricing,
	skills: [],
	categories: [],
	createdAt: 1
};

const timeline: ServiceQuoteTimelineEntry = {
	request: {
		id: 'request-event-1',
		kind: 6420,
		pubkey: 'b'.repeat(64),
		created_at: 1,
		tags: [],
		content: {
			type: 'service-quote-request',
			quoteRequestId: 'qr_valid123',
			serviceId: serviceAddress,
			serviceAddress,
			pricingType: ServicePricingTypeEnum.INQUIRY_REQUIRED,
			tierId: 'premium',
			inquiry: {
				title: 'Need a migration',
				description: 'Move our docs and preserve redirects.'
			},
			timestamp: 1,
			version: 'v1'
		},
		sig: ''
	},
	proposals: [
		{
			id: 'proposal-event-1',
			kind: 6421,
			pubkey: 'c'.repeat(64),
			created_at: 2,
			tags: [],
			content: {
				type: 'service-proposal',
				proposalId: 'pr_valid123',
				quoteRequestId: 'qr_valid123',
				serviceId: serviceAddress,
				serviceAddress,
				paymentType: 'FIXED',
				amountUsdt: '125.00',
				description: 'Migration plus redirect validation.',
				estimatedDuration: '3 days',
				estimatedStartTime: 1_700_000_000,
				estimatedEndTime: 1_700_259_200,
				expirationDays: 3,
				expirationHours: 0,
				expirationTimestamp: 1_700_300_000,
				freelancerRskAddress: '0x1111111111111111111111111111111111111111',
				freelancerFeeTier: 1,
				pricingSnapshot: {
					serviceVersionRef: 'service-event-1',
					tierId: 'premium'
				},
				timestamp: 2,
				version: 'v1'
			},
			sig: ''
		}
	],
	statusEventsByProposalId: {},
	latestProposal: {
		id: 'proposal-event-1',
		kind: 6421,
		pubkey: 'c'.repeat(64),
		created_at: 2,
		tags: [],
		content: {
			type: 'service-proposal',
			proposalId: 'pr_valid123',
			quoteRequestId: 'qr_valid123',
			serviceId: serviceAddress,
			serviceAddress,
			paymentType: 'FIXED',
			amountUsdt: '125.00',
			description: 'Migration plus redirect validation.',
			estimatedDuration: '3 days',
			estimatedStartTime: 1_700_000_000,
			estimatedEndTime: 1_700_259_200,
			expirationDays: 3,
			expirationHours: 0,
			expirationTimestamp: 1_700_300_000,
			freelancerRskAddress: '0x1111111111111111111111111111111111111111',
			freelancerFeeTier: 1,
			pricingSnapshot: {
				serviceVersionRef: 'service-event-1',
				tierId: 'premium'
			},
			timestamp: 2,
			version: 'v1'
		},
		sig: ''
	},
	resolvedStatus: 'pending',
	resolvedTerminalEvent: undefined,
	expirationTimestamp: 1_700_300_000,
	isExpired: false,
	linkedEscrowId: undefined
};

describe('service quote tier labels', () => {
	it('shows the tier name on the hiring quote card instead of the tier id', () => {
		const { getByText, queryByText } = render(DashboardQuoteCard, {
			timeline,
			service,
			getActionButtons: () => []
		});

		expect(getByText(/Premium Plan/)).toBeTruthy();
		expect(queryByText(/^premium$/i)).toBeNull();
	});

	it('shows the tier name in the hiring request drawer instead of the tier id', () => {
		const { getByText, queryByText } = render(ServiceRequestDrawer, {
			isOpen: true,
			timeline,
			service,
			onClose: vi.fn()
		});

		expect(getByText(/Premium Plan/)).toBeTruthy();
		expect(queryByText(/^premium$/i)).toBeNull();
	});
});
