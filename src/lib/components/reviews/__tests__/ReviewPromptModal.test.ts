import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { nip19 } from 'nostr-tools';
import ReviewPromptModal from '../ReviewPromptModal.svelte';

const mocks = vi.hoisted(() => ({
	getNpub: vi.fn(),
	getUserContracts: vi.fn(),
	fetchProfileMetadata: vi.fn(),
	getEscrow: vi.fn()
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'reviews.prompt.title': 'Write a Review',
		'reviews.prompt.loading': 'Loading review details',
		'reviews.prompt.reviewing': 'Reviewing',
		'reviews.actions.retry': 'Retry',
		'reviews.prompt.contract_not_found': 'Contract not found',
		'reviews.prompt.not_participant': 'Not a contract participant',
		'reviews.prompt.escrow_not_found': 'Escrow not found',
		'reviews.prompt.escrow_not_completed': 'Escrow not completed',
		'reviews.prompt.load_error': 'Failed to load contract details'
	};

	return {
		t: readable((key: string) => translations[key] ?? key),
		locale: readable('en'),
		locales: readable(['en']),
		isLoading: readable(false)
	};
});

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: mocks.getNpub
}));

vi.mock('$lib/utils/nostr-bid', () => ({
	getUserContracts: mocks.getUserContracts
}));

vi.mock('$lib/utils/nostr-message', () => ({
	fetchProfileMetadata: mocks.fetchProfileMetadata
}));

vi.mock('$lib/utils/wallet/escrow', () => ({
	escrow: {
		getEscrow: mocks.getEscrow
	}
}));

vi.mock('../VerifiedReviewForm.svelte', async () => {
	const module = await import('./mocks/VerifiedReviewForm.mock.svelte');
	return { default: module.default };
});

vi.mock('$lib/components/Drawer.svelte', async () => {
	const module = await import('./mocks/ReviewPromptDrawer.mock.svelte');
	return { default: module.default };
});

describe('ReviewPromptModal', () => {
	const clientHex = 'a'.repeat(64);
	const freelancerHex = 'b'.repeat(64);
	const clientNpub = nip19.npubEncode(clientHex);
	const freelancerNpub = nip19.npubEncode(freelancerHex);

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getNpub.mockResolvedValue(clientNpub);
		mocks.fetchProfileMetadata.mockResolvedValue({ name: 'Alice' });
		mocks.getEscrow.mockResolvedValue({
			id: 'escrow-1',
			status: 10
		});
		mocks.getUserContracts.mockResolvedValue([
			{
				contractEvent: {
					content: {
						clientPubkey: clientHex,
						freelancerPubkey: freelancerHex,
						transactionHash: '0xescrowtx'
					}
				}
			}
		]);
	});

	it('derives the reviewee role from the loaded contract and passes it to the review form', async () => {
		const onClose = vi.fn();
		const onSubmit = vi.fn();

		render(ReviewPromptModal, {
			props: {
				isOpen: true,
				escrowId: 'escrow-1',
				onClose,
				onSubmit
			}
		});

		const form = await screen.findByTestId('mock-review-form');
		expect(form).toHaveAttribute('data-reviewee-role', 'taskee');
		expect(form).toHaveAttribute('data-reviewee-pubkey', freelancerHex);
		expect(mocks.getUserContracts).toHaveBeenCalledTimes(1);
		expect(mocks.fetchProfileMetadata).toHaveBeenCalledWith(freelancerNpub);

		await fireEvent.click(screen.getByRole('button', { name: 'Mock submit review' }));

		expect(onSubmit).toHaveBeenCalledWith('mock-event-id');
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('retries loading the contract details after an initial failure', async () => {
		mocks.getUserContracts
			.mockRejectedValueOnce(new Error('relay unavailable'))
			.mockResolvedValueOnce([
				{
					contractEvent: {
						content: {
							clientPubkey: clientHex,
							freelancerPubkey: freelancerHex,
							transactionHash: '0xescrowtx'
						}
					}
				}
			]);

		render(ReviewPromptModal, {
			props: {
				isOpen: true,
				escrowId: 'escrow-1',
				onClose: vi.fn()
			}
		});

		await waitFor(() => {
			expect(screen.getByText('relay unavailable')).toBeInTheDocument();
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

		await waitFor(() => {
			expect(screen.getByTestId('mock-review-form')).toBeInTheDocument();
		});
		expect(mocks.getUserContracts).toHaveBeenCalledTimes(2);
	});
});
