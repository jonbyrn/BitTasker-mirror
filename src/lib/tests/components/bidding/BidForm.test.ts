import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import BidForm from '$lib/components/bidding/BidForm.svelte';
import { publishNostrEvent } from '$lib/utils/nostr';
import { getBSCAddress, getRSKAddress } from '$lib/stores/wallet.store';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'bid_form.task_you_are_bidding_on': 'Task You Are Bidding On',
		'bid_form.help_tooltip': 'Help',
		'bid_form.help_modal_title': 'Help',
		'bid_form.form.budget': 'Budget',
		'bid_form.form.suggested_price': 'Suggested Price',
		'bid_form.form.usd_placeholder': 'USD amount',
		'bid_form.form.sats_placeholder': 'Sats amount',
		'bid_form.form.btc_price': 'BTC Price',
		'bid_form.form.datetime_range': 'Date and Time',
		'bid_form.form.duration': 'Duration',
		'bid_form.form.description.label': 'Description',
		'bid_form.form.description.placeholder': 'Describe your offer',
		'bid_form.form.submit_bid': 'Submit Bid',
		'bid_form.form.submitting': 'Submitting',
		'bid_form.success.title': 'Bid Submitted',
		'bid_form.success.message': 'Your bid was sent.',
		'bid_form.success.close': 'Close',
		'bid_form.errors.amount_greater_than_zero': 'Amount must be greater than zero',
		'bid_form.errors.datetime_required': 'Date and time are required',
		'bid_form.errors.datetime_invalid': 'End time must be after start time',
		'bid_form.errors.description_required': 'Description is required',
		'bid_form.errors.description_min_length': 'Description is too short',
		'bid_form.errors.description_max_length': 'Description is too long',
		'dashboard.bids.bid_creation.hour': 'hour',
		'dashboard.bids.bid_creation.hours': 'hours',
		'dashboard.bids.bid_creation.minute': 'minute',
		'dashboard.bids.bid_creation.minutes': 'minutes',
		'dashboard.bids.bid_creation.one_hour': '1 hour',
		'dashboard.bids.bid_creation.max': 'max',
		'common.components.date_input.and': 'and'
	};

	return {
		t: readable((key: string) => translations[key] ?? key),
		locale: readable('en'),
		locales: readable(['en']),
		isLoading: readable(false)
	};
});

vi.mock('$lib/utils/nostr', () => ({
	publishNostrEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/utils/nostr-bid', () => ({
	clearBidCache: vi.fn()
}));

vi.mock('$lib/stores/wallet.store', () => ({
	getBSCAddress: vi.fn().mockResolvedValue('0x2222222222222222222222222222222222222222'),
	getRSKAddress: vi.fn().mockResolvedValue('0x1111111111111111111111111111111111111111')
}));

vi.mock('$lib/stores/user.store', async () => {
	const { writable } = await import('svelte/store');
	return {
		user: writable({
			id: 1,
			name: 'Bidder Name',
			username: 'bidder',
			npub: 'npub1bidder',
			picture: 'https://example.com/avatar.png'
		})
	};
});

vi.mock('$lib/nostr/bid', () => ({
	generateBidTranslations: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/api/services/push-notification.service', () => ({
	pushNotificationService: {
		sendNotificationToNpubs: vi.fn().mockResolvedValue(undefined)
	}
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(50000)
	}
}));

vi.mock(
	'$lib/components/date/DateInput.svelte',
	async () => await import('$lib/tests/components/stubs/DateInputStub.svelte')
);

describe('BidForm', () => {
	const task = {
		id: 'task-123',
		npub: 'npub1taskcreator',
		title: 'Need a BSC helper',
		description: 'Create a USDT on BSC payment flow.',
		budget: {
			amount: 15,
			currency: 'USD',
			type: 'FIXED'
		},
		paymentAsset: 'USDT',
		paymentNetwork: 'bsc-testnet',
		creator: {
			username: 'task-owner',
			avatar: 'https://example.com/task-owner.png'
		}
	} as any;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('bid-uuid');
	});

	it('publishes versioned BSC bid metadata with amountAtomic on the initial write path', async () => {
		render(BidForm, {
			task,
			onClose: vi.fn(),
			stickySubmit: false
		});

		await tick();

		const usdInput = screen.getByPlaceholderText('USD amount');
		const descriptionInput = screen.getByPlaceholderText('Describe your offer');

		await fireEvent.input(usdInput, { target: { value: '12.34' } });
		await fireEvent.input(descriptionInput, {
			target: {
				value: 'I can deliver this BSC payment work safely and with the required metadata.'
			}
		});

		const submitButton = screen.getByRole('button', { name: 'Submit Bid' });
		await fireEvent.click(submitButton);

		await waitFor(() => {
			expect(publishNostrEvent).toHaveBeenCalledTimes(1);
		});

		expect(getBSCAddress).toHaveBeenCalledTimes(1);
		expect(getRSKAddress).not.toHaveBeenCalled();

		const [kind, content, recipient, tags] = vi.mocked(publishNostrEvent).mock.calls[0];
		expect(kind).toEqual(expect.any(Number));
		expect(recipient).toBe('npub1taskcreator');
		expect(tags).toEqual(
			expect.arrayContaining([
				['n', 'bsc-testnet'],
				['v', 'bid.v2'],
				['a', '12340000']
			])
		);

		expect(JSON.parse(content)).toMatchObject({
			schemaVersion: 'bid.v2',
			type: 'bid',
			taskId: 'task-123',
			taskRef: 'task:task-123',
			bidId: 'bid-uuid',
			bidRef: 'bid:bid-uuid',
			amount: 12.34,
			amountAtomic: '12340000',
			currency: 'USD',
			paymentAsset: 'USDT',
			paymentNetwork: 'bsc-testnet',
			bidderWalletAddress: '0x2222222222222222222222222222222222222222',
			bidderWalletNetwork: 'bsc-testnet'
		});
	});

	it('treats legacy BSC tasks with only paymentNetwork metadata as USDT on BSC during bid publish', async () => {
		render(BidForm, {
			task: {
				...task,
				paymentAsset: undefined,
				paymentNetwork: 'bsc-testnet'
			},
			onClose: vi.fn(),
			stickySubmit: false
		});

		await tick();

		const usdInput = screen.getByPlaceholderText('USD amount');
		const descriptionInput = screen.getByPlaceholderText('Describe your offer');

		await fireEvent.input(usdInput, { target: { value: '7.50' } });
		await fireEvent.input(descriptionInput, {
			target: {
				value: 'I can handle this legacy BSC task metadata safely.'
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Submit Bid' }));

		await waitFor(() => {
			expect(publishNostrEvent).toHaveBeenCalledTimes(1);
		});

		expect(getBSCAddress).toHaveBeenCalledTimes(1);
		expect(getRSKAddress).not.toHaveBeenCalled();

		const [, content] = vi.mocked(publishNostrEvent).mock.calls[0];
		expect(JSON.parse(content)).toMatchObject({
			paymentAsset: 'USDT',
			paymentNetwork: 'bsc-testnet',
			bidderWalletNetwork: 'bsc-testnet'
		});
	});

	describe('Payment metadata capture', () => {
		it('should capture payment asset from task context', async () => {
			render(BidForm, {
				task: {
					...task,
					paymentAsset: 'USDT',
					paymentNetwork: 'bsc-testnet'
				},
				onClose: vi.fn(),
				stickySubmit: false
			});

			await tick();

			const usdInput = screen.getByPlaceholderText('USD amount');
			const descriptionInput = screen.getByPlaceholderText('Describe your offer');

			await fireEvent.input(usdInput, { target: { value: '25.00' } });
			await fireEvent.input(descriptionInput, { target: { value: 'Valid description text here.' } });

			await fireEvent.click(screen.getByRole('button', { name: 'Submit Bid' }));

			await waitFor(() => {
				expect(publishNostrEvent).toHaveBeenCalled();
			});

			const [, content] = vi.mocked(publishNostrEvent).mock.calls[0];
			expect(JSON.parse(content)).toMatchObject({
				paymentAsset: 'USDT',
				paymentNetwork: 'bsc-testnet'
			});
		});

		it('should capture network context from task', async () => {
			const bscTask = { ...task, paymentNetwork: 'bsc-mainnet' };
			render(BidForm, {
				task: bscTask,
				onClose: vi.fn(),
				stickySubmit: false
			});

			await tick();

			const usdInput = screen.getByPlaceholderText('USD amount');
			const descriptionInput = screen.getByPlaceholderText('Describe your offer');

			await fireEvent.input(usdInput, { target: { value: '30.00' } });
			await fireEvent.input(descriptionInput, { target: { value: 'Working with mainnet here.' } });

			await fireEvent.click(screen.getByRole('button', { name: 'Submit Bid' }));

			await waitFor(() => {
				expect(publishNostrEvent).toHaveBeenCalled();
			});

			const [, content] = vi.mocked(publishNostrEvent).mock.calls[0];
			expect(JSON.parse(content)).toMatchObject({
				paymentNetwork: 'bsc-mainnet'
			});
		});

		it('should record atomic amount correctly for USDT (6 decimals)', async () => {
			render(BidForm, {
				task,
				onClose: vi.fn(),
				stickySubmit: false
			});

			await tick();

			const usdInput = screen.getByPlaceholderText('USD amount');
			const descriptionInput = screen.getByPlaceholderText('Describe your offer');

			await fireEvent.input(usdInput, { target: { value: '99.999999' } });
			await fireEvent.input(descriptionInput, { target: { value: 'Precise amount test.' } });

			await fireEvent.click(screen.getByRole('button', { name: 'Submit Bid' }));

			await waitFor(() => {
				expect(publishNostrEvent).toHaveBeenCalled();
			});

			const [, content] = vi.mocked(publishNostrEvent).mock.calls[0];
			const parsed = JSON.parse(content);
			expect(parsed.amountAtomic).toBe('99999999');
		});

		it('should use BSC address for BSC tasks', async () => {
			const bscTask = { ...task, paymentAsset: 'USDT', paymentNetwork: 'bsc-testnet' };
			render(BidForm, {
				task: bscTask,
				onClose: vi.fn(),
				stickySubmit: false
			});

			await tick();

			const usdInput = screen.getByPlaceholderText('USD amount');
			const descriptionInput = screen.getByPlaceholderText('Describe your offer');

			await fireEvent.input(usdInput, { target: { value: '15.00' } });
			await fireEvent.input(descriptionInput, { target: { value: 'Address selection test.' } });

			await fireEvent.click(screen.getByRole('button', { name: 'Submit Bid' }));

			await waitFor(() => {
				expect(publishNostrEvent).toHaveBeenCalled();
			});

			expect(getBSCAddress).toHaveBeenCalled();

			const [, content] = vi.mocked(publishNostrEvent).mock.calls[0];
			expect(JSON.parse(content)).toMatchObject({
				bidderWalletAddress: '0x2222222222222222222222222222222222222222',
				bidderWalletNetwork: 'bsc-testnet'
			});
		});

		it('should include v2 schema version for USDT bids', async () => {
			render(BidForm, {
				task,
				onClose: vi.fn(),
				stickySubmit: false
			});

			await tick();

			const usdInput = screen.getByPlaceholderText('USD amount');
			const descriptionInput = screen.getByPlaceholderText('Describe your offer');

			await fireEvent.input(usdInput, { target: { value: '50.00' } });
			await fireEvent.input(descriptionInput, { target: { value: 'Schema version test.' } });

			await fireEvent.click(screen.getByRole('button', { name: 'Submit Bid' }));

			await waitFor(() => {
				expect(publishNostrEvent).toHaveBeenCalled();
			});

			const [, content] = vi.mocked(publishNostrEvent).mock.calls[0];
			expect(JSON.parse(content)).toMatchObject({
				schemaVersion: 'bid.v2',
				type: 'bid'
			});
		});
	});

	describe('Display of payment asset in form', () => {
		it('should display USDT as payment asset in summary', async () => {
			render(BidForm, {
				task: {
					...task,
					paymentAsset: 'USDT',
					paymentNetwork: 'bsc-testnet'
				},
				onClose: vi.fn(),
				stickySubmit: false
			});

			await tick();

			// Check if USDT is displayed somewhere in the component
			expect(screen.getByText(/USDT|bsc/i)).toBeDefined();
		});
	});
});
