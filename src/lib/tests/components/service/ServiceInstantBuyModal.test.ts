import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import ServiceInstantBuyModal from '$lib/components/service/ServiceInstantBuyModal.svelte';

describe('ServiceInstantBuyModal', () => {
	it('renders the purchase summary when open', () => {
		const { getByText, getByTestId } = render(ServiceInstantBuyModal, {
			open: true,
			serviceTitle: 'Brand Identity Sprint',
			providerName: 'Designer',
			selectedTierLabel: 'Premium',
			instantOrderId: 'sib_1234567890abcdef',
			agreementSnapshot: {
				deliverables: 'Logo system and social avatar pack.',
				priceSnapshotLabel: '$250.00'
			},
			pricingSnapshot: {
				serviceVersionRef: 'service-event-1'
			},
			estimatedStartTime: 1_700_086_400,
			estimatedCompletionTime: 1_700_345_600
		});

		expect(getByText('Confirm Book Now')).toBeTruthy();
		expect(getByText('Brand Identity Sprint')).toBeTruthy();
		expect(getByTestId('service-agreement-provider').textContent).toContain('Designer');
		expect(getByTestId('service-agreement-price').textContent).toContain('$250.00');
		expect(getByTestId('service-agreement-start').textContent).toContain('Nov');
		expect(getByTestId('service-agreement-end').textContent).toContain('Nov');
		expect(getByTestId('service-agreement-tier').textContent).toContain('Premium');
		expect(getByTestId('service-agreement-order').textContent).toContain('sib_1234567890abcdef');
	});

	it('surfaces submission errors and blocks close while submitting', async () => {
		const onClose = vi.fn();
		const onConfirm = vi.fn();
		const { getByTestId, queryByText } = render(ServiceInstantBuyModal, {
			open: true,
			serviceTitle: 'Landing Page Build',
			agreementSnapshot: {
				deliverables: 'Landing page build',
				priceSnapshotLabel: '$120.00'
			},
			pricingSnapshot: {
				serviceVersionRef: 'service-event-1'
			},
			estimatedStartTime: 1_700_086_400,
			estimatedCompletionTime: 1_700_259_200,
			errorMessage: 'Provider wallet is unavailable for Book Now.',
			errorHint: 'Retry after the provider updates the wallet address.',
			isSubmitting: true,
			onClose,
			onConfirm
		});

		expect(getByTestId('service-instant-buy-error').textContent).toContain(
			'Provider wallet is unavailable'
		);
		expect(getByTestId('service-instant-buy-error-hint').textContent).toContain(
			'Retry after the provider updates the wallet address.'
		);

		const confirmButton = getByTestId('service-instant-buy-confirm') as HTMLButtonElement;
		expect(confirmButton.disabled).toBe(true);
		expect(queryByText('Book Now')).toBeTruthy();

		const cancelButton = document.querySelector(
			'.modal-action .btn-ghost'
		) as HTMLButtonElement | null;
		expect(cancelButton?.disabled).toBe(true);

		expect(onConfirm).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
	});

	it('keeps recoverable prepare failures local and exposes a retry action', async () => {
		const onRetry = vi.fn();
		const { getByTestId, getByText } = render(ServiceInstantBuyModal, {
			open: true,
			serviceTitle: 'Landing Page Build',
			errorMessage: 'Unable to prepare Book Now right now.',
			canConfirm: false,
			onRetry
		});

		expect(getByTestId('service-instant-buy-error').textContent).toContain(
			'Unable to prepare Book Now right now.'
		);
		expect(getByText('Retry')).toBeTruthy();
		await fireEvent.click(getByTestId('service-instant-buy-retry'));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it('keeps the review open and disables confirm while offline', () => {
		const { getByTestId } = render(ServiceInstantBuyModal, {
			open: true,
			serviceTitle: 'Landing Page Build',
			isOffline: true,
			agreementSnapshot: {
				deliverables: 'Landing page build',
				priceSnapshotLabel: '$120.00'
			},
			pricingSnapshot: {
				serviceVersionRef: 'service-event-1'
			}
		});

		expect(getByTestId('service-instant-buy-offline-alert')).toBeTruthy();
		expect((getByTestId('service-instant-buy-confirm') as HTMLButtonElement).disabled).toBe(true);
	});

	it('shows reconnect guidance after the browser comes back online', () => {
		const { getByTestId } = render(ServiceInstantBuyModal, {
			open: true,
			serviceTitle: 'Landing Page Build',
			showReconnectNotice: true,
			agreementSnapshot: {
				deliverables: 'Landing page build',
				priceSnapshotLabel: '$120.00'
			},
			pricingSnapshot: {
				serviceVersionRef: 'service-event-1'
			}
		});

		expect(getByTestId('service-instant-buy-reconnect-alert')).toBeTruthy();
		expect((getByTestId('service-instant-buy-confirm') as HTMLButtonElement).disabled).toBe(false);
	});
});
