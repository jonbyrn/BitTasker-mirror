import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ServiceAgreementSummary from '$lib/components/contracts/ServiceAgreementSummary.svelte';

describe('ServiceAgreementSummary', () => {
	it('renders the shared service agreement snapshot fields', () => {
		render(ServiceAgreementSummary, {
			providerName: 'Designer',
			selectedTierLabel: 'Premium',
			instantOrderId: 'sib_1234567890abcdef',
			agreementSnapshot: {
				deliverables: 'Logo system and brand guide',
				priceSnapshotLabel: '$250.00',
				selectedAddOns: ['Source files'],
				rushDelivery: true,
				inquiryAnswers: {
					Industry: 'Fintech'
				}
			},
			pricingSnapshot: {
				serviceVersionRef: 'service-event-1'
			},
			estimatedStartTime: 1_700_086_400,
			estimatedCompletionTime: 1_700_345_600
		});

		expect(screen.getByTestId('service-agreement-provider').textContent).toContain('Designer');
		expect(screen.getByTestId('service-agreement-tier').textContent).toContain('Premium');
		expect(screen.getByTestId('service-agreement-order').textContent).toContain(
			'sib_1234567890abcdef'
		);
		expect(screen.getByTestId('service-agreement-scope').textContent).toContain(
			'Logo system and brand guide'
		);
		expect(screen.getByTestId('service-agreement-price').textContent).toContain('$250.00');
		expect(screen.queryByTestId('service-agreement-hours')).toBeNull();
		expect(screen.getByTestId('service-agreement-start').textContent).toContain('Nov');
		expect(screen.getByTestId('service-agreement-end').textContent).toContain('Nov');
		expect(screen.getByText('Source files')).toBeInTheDocument();
		expect(screen.getByText(/Industry:/)).toBeInTheDocument();
	});

	it('shows the hours booked on an hourly service agreement', () => {
		render(ServiceAgreementSummary, {
			providerName: 'Designer',
			agreementSnapshot: {
				bookedHours: 3,
				priceSnapshotLabel: '$30.00'
			}
		});

		expect(screen.getByTestId('service-agreement-hours').textContent).toContain('3');
	});
});
