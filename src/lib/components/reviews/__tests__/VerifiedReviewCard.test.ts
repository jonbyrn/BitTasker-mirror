import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import VerifiedReviewCard from '../VerifiedReviewCard.svelte';
import { verifyNostrReview } from '$lib/utils/nostr-review';
import { TranslationStore } from '$lib/stores/translation.store';
import type { NostrVerifiedReview } from '$lib/types/review';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const labels: Record<string, string> = {
		'reviews.verified': 'Verified',
		'reviews.unverified': 'Unverified',
		'reviews.reply': 'Reply',
		'reviews.pending.review_for': 'Review for',
		'reviews.pending.contract': 'Contract',
		'reviews.form.communication': 'Communication',
		'reviews.form.clarity': 'Clarity',
		'reviews.form.payment_timeliness': 'Payment Timeliness',
		'reviews.photo_alt': 'Review photo'
	};

	return {
		t: readable((key: string) => labels[key] ?? key),
		locale: readable('en'),
		locales: readable(['en']),
		isLoading: readable(false)
	};
});

vi.mock('$lib/utils/nostr-review', () => ({
	verifyNostrReview: vi.fn()
}));

vi.mock('$lib/stores/translation.store', () => ({
	TranslationStore: {
		getDisplayText: vi.fn()
	}
}));

describe('VerifiedReviewCard', () => {
	const mockReview: NostrVerifiedReview = {
		commitment: 'a'.repeat(64),
		merkleProof: {
			root: '0x' + 'a'.repeat(64),
			leaf: 'a'.repeat(64),
			proof: [],
			proofFlags: []
		},
		reviewerPubkey: 'npub1reviewer',
		revieweePubkey: 'npub1reviewee',
		content: {
			overallRating: 4.6,
			categoryRatings: {
				communication: 5,
				clarity: 4,
				paymentTimeliness: 5
			},
			revieweeRole: 'tasker',
			comment: 'Great client experience.',
			photos: []
		},
		createdAt: Date.now(),
		nostrEventId: 'event-123',
		nostrRelay: 'relay-url'
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(verifyNostrReview).mockResolvedValue(true);
		vi.mocked(TranslationStore.getDisplayText).mockResolvedValue('Translated comment');
	});

	it('renders translated content and tasker-specific ratings', async () => {
		render(VerifiedReviewCard, { props: { review: mockReview } });

		await waitFor(() => {
			expect(screen.getByText('Translated comment')).toBeInTheDocument();
		});

		expect(screen.getByText('4.6')).toBeInTheDocument();
		expect(screen.getByText('Communication')).toBeInTheDocument();
		expect(screen.getByText('Clarity')).toBeInTheDocument();
		expect(screen.getByText('Payment Timeliness')).toBeInTheDocument();
		expect(TranslationStore.getDisplayText).toHaveBeenCalledWith(
			'event-123',
			'Great client experience.'
		);
	});

	it('shows the verification badge when verification succeeds', async () => {
		render(VerifiedReviewCard, { props: { review: mockReview, showVerificationBadge: true } });

		await waitFor(() => {
			expect(screen.getByText('Verified')).toBeInTheDocument();
		});

		expect(verifyNostrReview).toHaveBeenCalledWith(mockReview);
	});

	it('shows the unverified badge when verification fails', async () => {
		vi.mocked(verifyNostrReview).mockResolvedValue(false);

		render(VerifiedReviewCard, { props: { review: mockReview, showVerificationBadge: true } });

		await waitFor(() => {
			expect(screen.getByText('Unverified')).toBeInTheDocument();
		});
	});

	it('invokes onReply with the Nostr event id', async () => {
		const onReply = vi.fn();
		render(VerifiedReviewCard, { props: { review: mockReview, onReply } });

		await fireEvent.click(screen.getByRole('button', { name: 'Reply' }));

		expect(onReply).toHaveBeenCalledWith('event-123');
	});

	it('renders review photos with non-empty alt text', async () => {
		render(VerifiedReviewCard, {
			props: {
				review: {
					...mockReview,
					content: {
						...mockReview.content,
						photos: ['https://example.com/photo-1.jpg']
					}
				}
			}
		});

		await waitFor(() => {
			expect(screen.getByRole('img').getAttribute('alt')).not.toBe('');
		});
	});

	it('renders authored-review context when requested', async () => {
		render(VerifiedReviewCard, {
			props: {
				review: mockReview,
				showRevieweeContext: true
			}
		});

		await waitFor(() => {
			expect(screen.getByText('Review for')).toBeInTheDocument();
		});
		expect(screen.getByText(/npub1reviewee/i)).toBeInTheDocument();
		expect(screen.queryByText('Contract')).not.toBeInTheDocument();
		expect(screen.queryByText('escrow-123')).not.toBeInTheDocument();
	});

	it('renders optional contract context only when it is actually provided', async () => {
		render(VerifiedReviewCard, {
			props: {
				review: {
					...mockReview,
					escrowId: 'escrow-123'
				} as NostrVerifiedReview & { escrowId: string },
				showRevieweeContext: true
			}
		});

		await waitFor(() => {
			expect(screen.getByText('Contract')).toBeInTheDocument();
		});
		expect(screen.getByText('Contract')).toBeInTheDocument();
		expect(screen.getByText('escrow-123')).toBeInTheDocument();
	});
});
