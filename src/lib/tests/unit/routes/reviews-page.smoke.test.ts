import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import ReviewsPage from '../../../../routes/(protected)/reviews/+page.svelte';
import type { ReviewFeedResponse } from '$lib/reviews';

const CURRENT_USER_PUBKEY = '1'.repeat(64);
const REVIEWEE_PUBKEY = '2'.repeat(64);
const REVIEWER_PUBKEY = '3'.repeat(64);

const hoisted = vi.hoisted(() => {
	function createStore<T>(initialValue: T) {
		let value = initialValue;
		const subscribers = new Set<(nextValue: T) => void>();

		return {
			subscribe(subscriber: (nextValue: T) => void) {
				subscriber(value);
				subscribers.add(subscriber);
				return () => subscribers.delete(subscriber);
			},
			set(nextValue: T) {
				value = nextValue;
				for (const subscriber of subscribers) {
					subscriber(value);
				}
			},
			update(updater: (currentValue: T) => T) {
				this.set(updater(value));
			}
		};
	}

	const contractStore = createStore({
		contracts: [],
		isLoading: false
	});

	const appStoreState = createStore({
		pool: {
			querySync: vi.fn()
		},
		relays: ['wss://relay.example.test']
	});
	const appStore = {
		subscribe: appStoreState.subscribe,
		set: appStoreState.set,
		update: appStoreState.update,
		showSuccessToast: vi.fn(),
		showErrorToast: vi.fn()
	};

	let currentUrl = new URL('https://example.test/reviews');
	const pageStore = createStore({ url: currentUrl });

	return {
		contractStore,
		appStore,
		pageStore,
		get currentUrl() {
			return currentUrl;
		},
		setCurrentUrl(url: string) {
			currentUrl = new URL(url);
			pageStore.set({ url: currentUrl });
		},
		goto: vi.fn((url: string) => {
			currentUrl = new URL(url);
			pageStore.set({ url: currentUrl });
		}),
		loadContracts: vi.fn().mockResolvedValue(undefined),
		getCurrentReviewerPubkey: vi.fn().mockResolvedValue('1'.repeat(64)),
		loadReviewFeed: vi.fn()
	};
});

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string, options?: { values?: Record<string, string | number> }) => {
			const table: Record<string, string> = {
				'reviews.management.title': 'Reviews',
				'reviews.page.subtitle': 'Manage reviews and replies',
				'reviews.page.browser_title': 'Reviews',
				'reviews.summary.title': 'Summary',
				'reviews.summary.empty_title': 'No reviews yet',
				'reviews.summary.empty_description': 'Be the first to review',
				'reviews.summary.average_rating': 'Average rating',
				'reviews.summary.total_reviews': 'Total reviews',
				'reviews.summary.reviews_received': 'reviews received',
				'reviews.summary.rating_distribution': 'Rating distribution',
				'reviews.summary.category_unavailable': 'Category data unavailable',
				'reviews.view_all': 'View all',
				'reviews.management.given_empty_description': 'No given reviews yet',
				'reviews.management.received_empty_description': 'No received reviews yet',
				'reviews.management.highlighted': 'Focused review',
				'reviews.list.no_reviews': 'No reviews',
				'reviews.list.no_given_reviews': 'No given reviews',
				'reviews.list.load_error': 'Unable to load reviews',
				'reviews.pending.no_pending': 'No pending reviews',
				'reviews.pending.all_caught_up': 'All caught up',
				'reviews.cta.create_task': 'Create Task',
				'reviews.pending.loading': 'Loading pending reviews',
				'reviews.pending.review_now': 'Review now',
				'reviews.pending.review_for': 'Review for',
				'reviews.pending.completed': 'Completed',
				'reviews.pending.completed_on': 'Completed on',
				'reviews.pending.only_current_user': 'Only visible for the current user',
				'reviews.verified': 'Verified',
				'reviews.pending_verification': 'Pending verification',
				'reviews.unverified': 'Unverified',
				'reviews.reply': 'Reply',
				'reviews.reply.label': 'Reply',
				'reviews.reply.focused': 'Focused reply',
				'reviews.reply.composer_title': 'Write a reply',
				'reviews.reply.context_title': 'Replying to this review',
				'reviews.reply.context_excerpt_label': 'Original review',
				'reviews.reply.context_excerpt_empty': 'No review text was provided.',
				'reviews.reply.english_label': 'English reply',
				'reviews.reply.spanish_label': 'Spanish reply',
				'reviews.reply.english_placeholder': 'Write your reply in English',
				'reviews.reply.spanish_placeholder': 'Write your reply in Spanish',
				'reviews.reply.attachments_label': 'Reply attachments',
				'reviews.reply.upload_label': 'Add images or video',
				'reviews.reply.submit': 'Submit reply',
				'reviews.reply.submitting': 'Submitting reply',
				'reviews.actions.open_review': 'Open review',
				'reviews.context.task': 'Task',
				'reviews.context.service': 'Service',
				'reviews.context.escrow': 'Escrow',
				'reviews.context.service_quote_contract': 'Service contract',
				'reviews.context.completed': 'Completed',
				'reviews.context.disputed_resolved_payout': 'Resolved with payout',
				'reviews.context.disputed_resolved_refund': 'Resolved with refund',
				'reviews.context.refunded': 'Refunded',
				'common.cancel': 'Cancel'
			};
			const template = table[key] ?? key;
			return template.replace(/\{(\w+)\}/g, (_, name) => String(options?.values?.[name] ?? ''));
		}),
		locale: readable('en')
	};
});

vi.mock('$app/state', () => ({
	page: {
		subscribe: hoisted.pageStore.subscribe,
		get url() {
			return hoisted.currentUrl;
		}
	}
}));

vi.mock('$app/navigation', () => ({
	goto: (...args: Parameters<typeof hoisted.goto>) => hoisted.goto(...args)
}));

vi.mock('$lib/stores/contract.store', () => ({
	contractStore: {
		subscribe: hoisted.contractStore.subscribe,
		loadContracts: (...args: Parameters<typeof hoisted.loadContracts>) =>
			hoisted.loadContracts(...args)
	}
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: hoisted.appStore
}));

vi.mock('$lib/components/MediaUploader.svelte', () => ({
	default: () => ({
		$$render: () => '<div data-testid="media-uploader">Uploader</div>'
	})
}));

vi.mock('$lib/api/reviews/review-api', async () => {
	const actual = await vi.importActual<typeof import('$lib/api/reviews/review-api')>(
		'$lib/api/reviews/review-api'
	);
	return {
		...actual,
		getCurrentReviewerPubkey: (...args: Parameters<typeof hoisted.getCurrentReviewerPubkey>) =>
			hoisted.getCurrentReviewerPubkey(...args),
		loadReviewFeed: (...args: Parameters<typeof hoisted.loadReviewFeed>) =>
			hoisted.loadReviewFeed(...args)
	};
});

function createReviewFeed(): ReviewFeedResponse {
	return {
		pending: [],
		given: [
			{
				id: 'given-review-1',
				reviewDraftHash: 'a'.repeat(64),
				reviewerPubkey: CURRENT_USER_PUBKEY,
				revieweePubkey: REVIEWEE_PUBKEY,
				subjectType: 'task',
				subjectLabel: 'Website refresh',
				settlementType: 'escrow',
				contractOutcome: 'completed',
				verificationState: 'verified',
				createdAt: 1_700_000_100,
				overallRating: 4.5,
				content: {
					en: 'Great collaborator',
					es: 'Gran colaborador',
					authoredLanguage: 'en'
				},
				categoryScores: [],
				attachments: []
			}
		],
		received: [
			{
				id: 'received-review-1',
				reviewDraftHash: 'b'.repeat(64),
				reviewerPubkey: REVIEWER_PUBKEY,
				revieweePubkey: CURRENT_USER_PUBKEY,
				subjectType: 'service_booking',
				subjectLabel: 'Brand sprint',
				settlementType: 'service_quote_contract',
				contractOutcome: 'completed',
				verificationState: 'verified',
				createdAt: 1_700_000_200,
				overallRating: 5,
				content: {
					en: 'Excellent delivery and communication',
					es: 'Excelente entrega y comunicacion',
					authoredLanguage: 'en'
				},
				categoryScores: [],
				attachments: [],
				reply: {
					id: 'reply-1',
					parentReviewEventId: 'received-review-1',
					revieweePubkey: CURRENT_USER_PUBKEY,
					revieweeLabel: 'You',
					content: {
						en: 'Thank you for the thoughtful feedback.',
						es: 'Gracias por los comentarios.',
						authoredLanguage: 'en'
					},
					createdAt: 1_700_000_260,
					attachments: []
				}
			}
		],
		summary: {
			totalGiven: 1,
			totalReceived: 1,
			totalPending: 0,
			averageRating: 5
		}
	};
}

describe('/reviews smoke', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hoisted.loadReviewFeed.mockResolvedValue(createReviewFeed());
		hoisted.setCurrentUrl(
			'https://example.test/reviews?tab=received&highlight=received-review-1&replyTo=received-review-1'
		);
	});

	it('renders the real received review, focused reply, and reply composer from a deep link', async () => {
		render(ReviewsPage);

		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Reviews' })).toBeTruthy();
			expect(screen.getAllByText('Excellent delivery and communication').length).toBeGreaterThan(0);
		});

		expect(screen.getByText('Focused review')).toBeTruthy();
		expect(screen.getAllByText('Focused reply').length).toBeGreaterThan(0);
		expect(screen.getByText('Write a reply')).toBeTruthy();
		expect(screen.getByText('Replying to this review')).toBeTruthy();
		expect(screen.getByText('Original review')).toBeTruthy();
		expect(screen.getByText('Thank you for the thoughtful feedback.')).toBeTruthy();
	});

	it('navigates to and focuses a given review using the real open-review action', async () => {
		hoisted.setCurrentUrl('https://example.test/reviews?tab=given');
		render(ReviewsPage);

		await waitFor(() => {
			expect(screen.getByText('Great collaborator')).toBeTruthy();
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Open review' }));

		await waitFor(() => {
			expect(String(hoisted.currentUrl)).toContain('tab=given');
			expect(String(hoisted.currentUrl)).toContain('highlight=given-review-1');
		});
	});

	it('defaults to the pending tab and shows a create-task CTA when there are no pending reviews', async () => {
		hoisted.loadReviewFeed.mockResolvedValue(createReviewFeed());
		hoisted.setCurrentUrl('https://example.test/reviews');
		render(ReviewsPage);

		await waitFor(() => {
			expect(screen.getByText('No pending reviews')).toBeTruthy();
		});

		expect(screen.getByRole('button', { name: 'Create Task' })).toBeTruthy();
		expect(String(hoisted.currentUrl)).toBe('https://example.test/reviews');
	});
});
