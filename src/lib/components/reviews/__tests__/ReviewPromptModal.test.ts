import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { nip19 } from 'nostr-tools';
import ReviewPromptModal from '../ReviewPromptModal.svelte';
import type { IContractForReview } from '$lib/utils/reviews/contract-interface';

const mocks = vi.hoisted(() => ({
	getNpub: vi.fn(),
	fetchIContractForReviewByEscrowId: vi.fn(),
	fetchProfileMetadata: vi.fn()
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

vi.mock('$lib/utils/contract/reviewContractsFromNdk', () => ({
	fetchIContractForReviewByEscrowId: mocks.fetchIContractForReviewByEscrowId
}));

vi.mock('$lib/nostr/profile', () => ({
	fetchProfileMetadata: mocks.fetchProfileMetadata,
	getCachedProfile: vi.fn().mockResolvedValue(null)
}));

vi.mock('$lib/nostr/ndk', () => ({
	ndk: {
		getUser: ({ pubkey }: { pubkey: string }) => ({
			npub: pubkey.startsWith('npub') ? pubkey : nip19.npubEncode(pubkey)
		})
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

function mockReviewContract(clientHex: string, freelancerHex: string): IContractForReview {
	const clientNpubLocal = nip19.npubEncode(clientHex);
	const freelancerNpubLocal = nip19.npubEncode(freelancerHex);
	return {
		get contractId() {
			return 'contract-event-1';
		},
		get paymentId() {
			return 'escrow-1';
		},
		get txHash() {
			return '0xescrowtx';
		},
		get status() {
			return 'FundsReleased';
		},
		get clientPubkey() {
			return clientHex;
		},
		get freelancerPubkey() {
			return freelancerHex;
		},
		get settlementType() {
			return 'escrow' as const;
		},
		get chain() {
			return 'rsk' as const;
		},
		get asset() {
			return 'rbtc' as const;
		},
		get contractAddress() {
			return '0xpayment';
		},
		get taskTitle() {
			return 'Mock contract title';
		},
		get taskDescription() {
			return '';
		},
		get taskerWalletAddress() {
			return '0xtasker';
		},
		get taskeeWalletAddress() {
			return '0xtaskee';
		},
		get contractVersion() {
			return 'v2';
		},
		isReviewable() {
			return true;
		},
		getReviewableParty(pubkey: string) {
			const p = pubkey.trim();
			if (p === clientHex || p === clientNpubLocal) return 'client';
			if (p === freelancerHex || p === freelancerNpubLocal) return 'freelancer';
			return null;
		}
	};
}

describe('ReviewPromptModal', () => {
	const clientHex = 'a'.repeat(64);
	const freelancerHex = 'b'.repeat(64);
	const clientNpub = nip19.npubEncode(clientHex);
	const freelancerNpub = nip19.npubEncode(freelancerHex);

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getNpub.mockResolvedValue(clientNpub);
		mocks.fetchProfileMetadata.mockResolvedValue({ name: 'Alice' });
		mocks.fetchIContractForReviewByEscrowId.mockResolvedValue(
			mockReviewContract(clientHex, freelancerHex)
		);
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
		expect(form).toHaveAttribute('data-reviewee-role', 'taskee' as string);
		expect(form).toHaveAttribute('data-reviewee-pubkey', freelancerHex);
		expect(mocks.fetchIContractForReviewByEscrowId).toHaveBeenCalledWith('escrow-1');
		expect(mocks.fetchProfileMetadata).toHaveBeenCalledWith(freelancerNpub);

		await fireEvent.click(screen.getByRole('button', { name: 'Mock submit review' }));

		expect(onSubmit).toHaveBeenCalledWith('mock-event-id');
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('retries loading the contract details after an initial failure', async () => {
		mocks.fetchIContractForReviewByEscrowId
			.mockRejectedValueOnce(new Error('relay unavailable'))
			.mockResolvedValueOnce(mockReviewContract(clientHex, freelancerHex));

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
		expect(mocks.fetchIContractForReviewByEscrowId).toHaveBeenCalledTimes(2);
	});
});
