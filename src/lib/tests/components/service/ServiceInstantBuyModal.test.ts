import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import ServiceInstantBuyModal from '$lib/components/service/ServiceInstantBuyModal.svelte';

const { runeConstructorArgs, prepareFunding, payFundingFromWallet, lightningState } = vi.hoisted(
	() => {
		function writable<T>(initial: T) {
			let value = initial;
			const subscribers = new Set<(next: T) => void>();
			return {
				set(next: T) {
					value = next;
					for (const run of subscribers) run(value);
				},
				subscribe(run: (next: T) => void) {
					subscribers.add(run);
					run(value);
					return () => {
						subscribers.delete(run);
					};
				}
			};
		}
		return {
			runeConstructorArgs: { current: null as unknown },
			prepareFunding: vi.fn().mockResolvedValue(undefined),
			payFundingFromWallet: vi.fn().mockResolvedValue(undefined),
			lightningState: writable({
				ready: true,
				peerHost: 'lsp-signet.utexo.com',
				channel: 'open' as const,
				lnInvoice: '',
				rgbInvoice: ''
			})
		};
	}
);

vi.mock('$lib/stores/wallet/signet-lsp', () => ({
	lightningStore: lightningState
}));

vi.mock('$lib/runes/contract.svelte', () => ({
	TaskeeInvoiceRequired: class TaskeeInvoiceRequired extends Error {},
	ContractRune: class {
		snapshot = { fundingInvoice: 'rgb:~/~/aa/sb:utxob:taskee-blank' };

		constructor(input: unknown) {
			runeConstructorArgs.current = input;
		}

		async prepareFunding(invoice?: string) {
			return prepareFunding(invoice);
		}

		async payFundingFromWallet() {
			return payFundingFromWallet();
		}
	}
}));

vi.mock('$lib/wasm/init-wasm', () => ({
	initWasm: vi.fn().mockResolvedValue(true)
}));

vi.mock('$lib/stores/wallet/wallet-manager', () => ({
	walletManager: {
		initialize: vi.fn().mockResolvedValue(undefined),
		releaseRgbLock: vi.fn().mockResolvedValue(undefined)
	}
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => {
			if (key === 'common.cancel') {
				return 'Cancel';
			}
			if (key === 'common.components.drawer.close') {
				return 'Close';
			}
			if (key === 'common.buttons.retry') {
				return 'Retry';
			}
			if (key === 'dashboard.services.detail.book_now_drawer.title') {
				return 'Book Service';
			}
			if (key === 'dashboard.services.detail.book_now_drawer.wallet_balance') {
				return 'Wallet balance';
			}
			if (key === 'dashboard.services.detail.book_now_drawer.wallet_icon_alt') {
				return 'Bitcoin';
			}
			if (key === 'dashboard.services.detail.book_now_drawer.wallet_not_connected') {
				return 'Wallet not connected';
			}
			if (key === 'dashboard.services.detail.book_now_drawer.available_balance') {
				return 'Available balance';
			}
			if (key === 'dashboard.services.detail.book_now_drawer.required_balance') {
				return 'Required for this contract';
			}
			if (key === 'dashboard.services.detail.book_now_drawer.sats') {
				return 'sats';
			}
			if (key === 'dashboard.services.detail.book_now_drawer.confirm_cta') {
				return 'Book Now';
			}
			if (key === 'dashboard.services.detail.book_now_drawer.confirm_warning') {
				return 'This will send your payment into the secure payment contract. Please verify all details before confirming.';
			}
			if (key === 'dashboard.services.detail.book_now_drawer.start_date') {
				return 'Start date';
			}
			if (key === 'dashboard.services.detail.book_now_drawer.delivery_date') {
				return 'Delivery date';
			}
			if (key === 'dashboard.services.detail.book_now_drawer.day') {
				return 'day';
			}
			if (key === 'dashboard.services.detail.book_now_drawer.days') {
				return 'days';
			}
			if (key === 'dashboard.services.detail.book_now_drawer.hour') {
				return 'hour';
			}
			if (key === 'dashboard.services.detail.book_now_drawer.hours') {
				return 'hours';
			}
			if (key === 'dashboard.services.detail.book_now_drawer.minute') {
				return 'minute';
			}
			if (key === 'dashboard.services.detail.book_now_drawer.minutes') {
				return 'minutes';
			}
			if (key === 'dashboard.services.detail.book_now_drawer.unavailable') {
				return 'N/A';
			}
			if (key === 'dashboard.services.detail.book_now_drawer.creating_contract') {
				return 'Creating contract...';
			}
			return key;
		}),
		locale: readable('en')
	};
});

describe('ServiceInstantBuyModal', () => {
	beforeEach(() => {
		lightningState.set({
			ready: true,
			peerHost: 'lsp-signet.utexo.com',
			channel: 'open',
			lnInvoice: '',
			rgbInvoice: ''
		});
	});
	it('creates an RGB contract with service title and proposal scope', async () => {
		const onConfirm = vi.fn();
		const { getByTestId, getByText } = render(ServiceInstantBuyModal, {
			open: true,
			serviceTitle: 'Brand Identity Sprint',
			providerPubkey: 'a'.repeat(64),
			amountUsd: 250,
			agreementSnapshot: {
				deliverables: 'Logo system and social avatar pack.',
				priceSnapshotLabel: '$250.00'
			},
			escrowInvoice: 'rgb:~/~/aa/sb:utxob:taskee-blank',
			walletConnected: true,
			walletVerificationStatus: 'ready',
			canConfirm: true,
			onConfirm
		});

		await fireEvent.click(getByTestId('service-instant-buy-confirm'));
		await waitFor(() => expect(prepareFunding).toHaveBeenCalledTimes(1));
		expect(prepareFunding).toHaveBeenCalledWith('rgb:~/~/aa/sb:utxob:taskee-blank');
		expect(runeConstructorArgs.current).toMatchObject({
			contractTitle: 'Brand Identity Sprint',
			bidderComments: 'Logo system and social avatar pack.',
			totalAmountUsd: 275.5,
			partyPubkeys: ['a'.repeat(64)],
			split: {
				primaryAsset: 'usdt_rgb',
				primaryPercentage: 100,
				secondaryAsset: 'btc_onchain',
				secondaryPercentage: 0
			}
		});

		await waitFor(() =>
			expect(getByTestId('service-instant-buy-confirm').textContent).toContain(
				'dashboard.bids.bid_acceptance.step_pay'
			)
		);
		await fireEvent.click(getByTestId('service-instant-buy-confirm'));
		await fireEvent.click(getByText('dashboard.services.detail.book_now_confirm_modal.confirm'));

		await waitFor(() => expect(payFundingFromWallet).toHaveBeenCalledTimes(1));
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});

	it('renders the purchase summary when open', () => {
		const { getByText, getByTestId } = render(ServiceInstantBuyModal, {
			open: true,
			serviceTitle: 'Brand Identity Sprint',
			providerName: 'Designer',
			providerAvatar: 'https://example.com/avatar.png',
			providerPubkey: 'a'.repeat(64),
			amountUsd: 250,
			selectedTierLabel: 'Premium',
			agreementSnapshot: {
				deliverables: 'Logo system and social avatar pack.',
				priceSnapshotLabel: '$250.00'
			},
			pricingSnapshot: {
				serviceVersionRef: 'service-event-1'
			},
			estimatedStartTime: 1_700_086_400,
			estimatedCompletionTime: 1_700_345_600,
			walletConnected: true,
			walletBalanceSats: '500,000',
			walletBalanceUsd: '$250.00',
			usdtBalanceUsd: '$250.00',
			requiredBalanceSats: '411,000',
			requiredBalanceUsd: '$205.50',
			walletVerificationStatus: 'ready',
			walletVerificationMessage: 'Your available balance covers this service contract.'
		});

		expect(getByText('Book Service')).toBeTruthy();
		expect(getByText('Brand Identity Sprint')).toBeTruthy();
		expect(getByTestId('service-agreement-provider').textContent).toContain('Designer');
		expect(getByTestId('service-agreement-base-amount').textContent).toContain('$250.00');
		expect(getByTestId('service-agreement-usdt-platform-fee').textContent).toContain('$25.00');
		expect(getByTestId('service-agreement-gas-fee').textContent).toContain('$0.50');
		expect(getByTestId('service-agreement-price').textContent).toContain('$275.50');
		expect(getByTestId('service-agreement-start').textContent).toContain('Start date');
		expect(getByTestId('service-agreement-start').textContent).toContain('Nov');
		expect(getByTestId('service-agreement-delivery').textContent).toContain('Delivery date');
		expect(getByTestId('service-agreement-delivery').textContent).toContain('Nov');
		expect(getByTestId('service-agreement-tier').textContent).toContain('Premium');
		expect(getByTestId('service-agreement-scope').textContent).toContain(
			'Logo system and social avatar pack.'
		);
		const walletCard = getByTestId('contract-funding-wallet-card').textContent ?? '';
		expect(walletCard).toContain('Wallet balance');
		expect(walletCard).toContain('Available balance');
		expect(walletCard).toContain('Required for this contract');
		expect(walletCard).toMatch(/\$250\.00/);
		expect(walletCard).toMatch(/\$205\.50/);
		expect(document.body.textContent).not.toContain('Instant order');
	});

	it('surfaces submission errors and blocks close while submitting', async () => {
		const onClose = vi.fn();
		const onConfirm = vi.fn();
		const { getByTestId, queryByText } = render(ServiceInstantBuyModal, {
			open: true,
			serviceTitle: 'Landing Page Build',
			amountUsd: 120,
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

		const cancelButtons = Array.from(
			document.querySelectorAll('button.btn-error')
		) as HTMLButtonElement[];
		const cancelButton = cancelButtons[cancelButtons.length - 1] ?? null;
		expect(cancelButton?.disabled).toBe(true);

		expect(onConfirm).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
	});

	it('renders inline errors in the review drawer', () => {
		const { getByTestId } = render(ServiceInstantBuyModal, {
			open: true,
			serviceTitle: 'Landing Page Build',
			walletVerificationStatus: 'error',
			walletVerificationMessage: 'Provider wallet is unavailable for this service.',
			errorMessage: 'Provider wallet is unavailable for this service.',
			errorHint: 'Retry after the provider updates the wallet address.'
		});

		expect(getByTestId('service-instant-buy-error').textContent).toContain(
			'Provider wallet is unavailable for this service.'
		);
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
			amountUsd: 120,
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

	it('switches to a contract-creation progress view after funding starts', () => {
		const { getByTestId, queryByTestId } = render(ServiceInstantBuyModal, {
			open: true,
			serviceTitle: 'Landing Page Build',
			showContractCreationProgress: true,
			contractCreationStatus: 'creating',
			contractCreationMessage: '',
			isSubmitting: true
		});

		expect(getByTestId('service-contract-creation-progress')).toBeTruthy();
		expect(getByTestId('service-contract-creation-status').textContent).toContain(
			'Creating contract...'
		);
		expect(queryByTestId('service-instant-buy-confirm')).toBeNull();
		expect(queryByTestId('contract-funding-wallet-card')).toBeNull();
		expect(queryByTestId('service-instant-buy-confirm-warning')).toBeNull();
	});

	it('disables instant buy while the LSP channel is closed', () => {
		lightningState.set({
			ready: false,
			peerHost: '',
			channel: 'missing',
			lnInvoice: '',
			rgbInvoice: ''
		});
		const { getByTestId } = render(ServiceInstantBuyModal, {
			open: true,
			serviceTitle: 'Landing Page Build',
			amountUsd: 120,
			canConfirm: true
		});
		expect(getByTestId('lsp-channel-closed').textContent).toContain(
			'wallet.lightning_channel_closed'
		);
		expect((getByTestId('service-instant-buy-confirm') as HTMLButtonElement).disabled).toBe(true);
	});

	it('shows reconnect guidance after the browser comes back online', () => {
		const { getByTestId } = render(ServiceInstantBuyModal, {
			open: true,
			serviceTitle: 'Landing Page Build',
			amountUsd: 120,
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
