/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import EscrowSuccessScreen from '$lib/components/bidding/EscrowSuccessScreen.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'common.components.bidding.escrow_success.title': 'Escrow created',
		'common.components.bidding.escrow_success.close_dialog': 'Close dialog',
		'common.components.bidding.escrow_success.success_title': 'Success',
		'common.components.bidding.escrow_success.success_message': 'Escrow creation completed.',
		'common.components.bidding.escrow_success.payment_summary': 'Payment summary',
		'common.components.bidding.escrow_success.bid_price': 'Bid price',
		'common.components.bidding.escrow_success.platform_fee': 'Platform fee',
		'common.components.bidding.escrow_success.transaction_fee': 'Transaction fee',
		'common.components.bidding.escrow_success.total_price': 'Total price',
		'common.components.bidding.escrow_success.blockchain_verification': 'Blockchain verification',
		'common.components.bidding.escrow_success.verification_message': 'Verify the transaction.',
		'common.components.bidding.escrow_success.copy_hash': 'Copy hash',
		'common.components.bidding.escrow_success.view_explorer': 'View explorer',
		'common.components.bidding.escrow_success.gamification_title': 'Progress',
		'common.components.bidding.escrow_success.gamification_message':
			'{tasks} tasks to {tier} by {date}',
		'common.components.bidding.escrow_success.go_dashboard': 'Go to dashboard',
		'common.components.bidding.escrow_success.create_new_task': 'Create new task',
		'wallet.address_copied': 'Address copied'
	};

	const tStore = readable((key: string, options?: { values?: Record<string, string | number> }) => {
		let result = translations[key] ?? key;

		if (options?.values) {
			for (const [placeholder, value] of Object.entries(options.values)) {
				result = result.replace(`{${placeholder}}`, String(value));
			}
		}

		return result;
	});

	return {
		t: tStore,
		locale: readable('en'),
		locales: readable(['en']),
		isLoading: readable(false)
	};
});

vi.mock('$lib/utils/helpers/clipboard', () => ({
	copyToClipboard: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showSuccessToast: vi.fn(),
		showErrorToast: vi.fn()
	}
}));

describe('EscrowSuccessScreen', () => {
	const defaultProps = {
		bid: {
			amount: 100000000,
			paymentNetwork: 'bsc-testnet'
		} as any,
		taskTitle: 'Legacy BSC task',
		escrowDetails: {
			method: 'bittasker' as const
		},
		btcPrice: 65000,
		onGoToDashboard: vi.fn(),
		onCreateNewTask: vi.fn()
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(async () => {
		await vi.runOnlyPendingTimersAsync();
		vi.useRealTimers();
	});

	it('treats legacy BSC bid metadata with only paymentNetwork as USDT on BSC', async () => {
		render(EscrowSuccessScreen, defaultProps);
		await tick();

		await vi.runAllTimersAsync();
		await tick();

		expect(screen.getAllByText('USDT on BSC').length).toBeGreaterThan(0);
		expect(screen.queryByText('RBTC on BSC')).toBeNull();
		expect(screen.queryByText(/sats/i)).toBeNull();
		expect(screen.getByRole('link', { name: 'View explorer' })).toHaveAttribute(
			'href',
			'https://testnet.bscscan.com/tx/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
		);
	});

	it('updates the rail and explorer target when bid props switch from Rootstock to USDT on BSC', async () => {
		const rendered = render(EscrowSuccessScreen, {
			...defaultProps,
			bid: {
				amount: 100000000,
				paymentAsset: 'RBTC',
				paymentNetwork: 'rsk-testnet'
			} as any
		});
		await tick();

		await vi.runAllTimersAsync();
		await tick();

		expect(screen.getAllByText('rBTC on Rootstock').length).toBeGreaterThan(0);
		expect(screen.getByRole('link', { name: 'View explorer' })).toHaveAttribute(
			'href',
			'https://rootstock.blockscout.com/tx/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
		);

		await rendered.rerender({
			...defaultProps,
			bid: {
				amount: 100000000,
				paymentAsset: 'USDT',
				paymentNetwork: 'bsc-testnet'
			} as any
		});
		await tick();

		expect(screen.getAllByText('USDT on BSC').length).toBeGreaterThan(0);
		expect(screen.getByRole('link', { name: 'View explorer' })).toHaveAttribute(
			'href',
			'https://testnet.bscscan.com/tx/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
		);
	});
});
