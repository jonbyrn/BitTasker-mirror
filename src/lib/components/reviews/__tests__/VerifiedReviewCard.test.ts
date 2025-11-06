import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import VerifiedReviewCard from '../VerifiedReviewCard.svelte';
import { verifyNostrReview } from '$lib/utils/nostr-review';
import type { NostrVerifiedReview } from '$lib/types/review';

// Mock dependencies
vi.mock('$lib/utils/nostr-review', () => ({
	verifyNostrReview: vi.fn()
}));

vi.mock('$lib/stores/translation.store', () => ({
	TranslationStore: {
		getDisplayText: vi.fn((id, text) => Promise.resolve(text))
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
			overallRating: 5,
			categoryRatings: {
				quality: 5,
				professionalism: 4,
				timeliness: 5
			},
			comment: 'Great work!',
			photos: []
		},
		createdAt: Date.now(),
		nostrEventId: 'event-123',
		nostrRelay: 'relay-url'
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(verifyNostrReview).mockResolvedValue(true);
	});

	it('should render review card', () => {
		render(VerifiedReviewCard, { props: { review: mockReview } });
		
		expect(screen.getByText('Great work!')).toBeInTheDocument();
		expect(screen.getByText(/5.0/i)).toBeInTheDocument();
	});

	it('should display category ratings', () => {
		render(VerifiedReviewCard, { props: { review: mockReview } });
		
		expect(screen.getByText(/Quality/i)).toBeInTheDocument();
		expect(screen.getByText(/Professionalism/i)).toBeInTheDocument();
		expect(screen.getByText(/Timeliness/i)).toBeInTheDocument();
	});

	it('should show verification badge when verified', async () => {
		vi.mocked(verifyNostrReview).mockResolvedValue(true);
		
		render(VerifiedReviewCard, { props: { review: mockReview, showVerificationBadge: true } });
		
		// Wait for verification to complete
		await new Promise(resolve => setTimeout(resolve, 100));
		
		// Verification badge should appear
		expect(verifyNostrReview).toHaveBeenCalledWith(mockReview);
	});

	it('should show reply button when onReply is provided', () => {
		const onReply = vi.fn();
		render(VerifiedReviewCard, { props: { review: mockReview, onReply } });
		
		expect(screen.getByText(/Reply/i)).toBeInTheDocument();
	});
});


