import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import ReviewsPage from '../../../../routes/(protected)/reviews/+page.svelte';
import {
	REVIEWS_SCHEMA_VERSION,
	REVIEW_NOSTR_KINDS,
	buildReviewFixture,
	buildReviewReplyFixture,
	computeReviewDraftHashFromPayload
} from '@reviews-contracts';

const CURRENT_USER_SECRET = Uint8Array.from(Buffer.from('11'.repeat(32), 'hex'));
const CURRENT_USER_PUBKEY = '1'.repeat(64);
const REVIEWER_PUBKEY = '2'.repeat(64);
const ISSUER_PUBKEY = '3'.repeat(64);

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
			}
		};
	}

	let currentUrl = new URL(
		'https://example.test/reviews?tab=received&highlight=placeholder&replyTo=placeholder'
	);
	const pageStore = createStore({ url: currentUrl });

	return {
		querySync: vi.fn(),
		goto: vi.fn(),
		loadContracts: vi.fn().mockResolvedValue(undefined),
		getSignedEvent: vi.fn(),
		publishToMultipleRelays: vi.fn(),
		getNostrKeyPair: vi.fn(),
		getNpub: vi.fn(),
		getWallet: vi.fn(),
		pageStore,
		get currentUrl() {
			return currentUrl;
		},
		setCurrentUrl(url: string) {
			currentUrl = new URL(url);
			pageStore.set({ url: currentUrl });
		}
	};
});

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => {
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
				'reviews.pending.loading': 'Loading pending reviews',
				'reviews.pending.review_now': 'Review now',
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
				'reviews.context.service_booking': 'Service booking',
				'reviews.context.escrow': 'Escrow',
				'reviews.context.service_quote_contract': 'Service contract',
				'reviews.context.completed': 'Completed',
				'reviews.context.subject': 'Subject',
				'reviews.context.reviewee': 'Reviewee',
				'reviews.context.reviewer': 'Reviewer',
				'reviews.verified': 'Verified',
				'common.cancel': 'Cancel',
				'reviews.form.errors.comment_required': 'Comment required',
				'reviews.attachments.reply_image_alt': 'Reply image attachment',
				'reviews.attachments.reply_video_alt': 'Reply video attachment'
			};
			return table[key] ?? key;
		}),
		locale: readable('en')
	};
});

vi.mock('nostr-tools', async () => {
	const actual = await vi.importActual<typeof import('nostr-tools')>('nostr-tools');
	return {
		...actual,
		verifyEvent: vi.fn(() => true)
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
		subscribe: readable({ contracts: [], isLoading: false }).subscribe,
		loadContracts: (...args: Parameters<typeof hoisted.loadContracts>) =>
			hoisted.loadContracts(...args)
	}
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: readable({
		pool: {
			querySync: (...args: Parameters<typeof hoisted.querySync>) => hoisted.querySync(...args)
		},
		relays: ['wss://relay.example.test'],
		showSuccessToast: vi.fn(),
		showErrorToast: vi.fn()
	})
}));

vi.mock('$lib/utils/nostr', () => ({
	getSignedEvent: (...args: Parameters<typeof hoisted.getSignedEvent>) =>
		hoisted.getSignedEvent(...args),
	publishToMultipleRelays: (...args: Parameters<typeof hoisted.publishToMultipleRelays>) =>
		hoisted.publishToMultipleRelays(...args)
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNostrKeyPair: (...args: Parameters<typeof hoisted.getNostrKeyPair>) =>
		hoisted.getNostrKeyPair(...args),
	getNpub: (...args: Parameters<typeof hoisted.getNpub>) => hoisted.getNpub(...args)
}));

vi.mock('$lib/stores/wallet.store', () => ({
	getWallet: (...args: Parameters<typeof hoisted.getWallet>) => hoisted.getWallet(...args)
}));

vi.mock('$lib/components/MediaUploader.svelte', () => ({
	default: () => ({
		$$render: () => '<div data-testid="media-uploader">Uploader</div>'
	})
}));

async function buildReviewFixtures() {
	const reviewBase = buildReviewFixture({
		reviewDraftHash: '0'.repeat(64),
		revieweePubkey: CURRENT_USER_PUBKEY,
		subjectType: 'service_booking',
		settlementType: 'service_quote_contract',
		contractOutcome: 'completed',
		createdAt: 1_700_000_111
	});
	const reviewDraftHash = await computeReviewDraftHashFromPayload(reviewBase);
	const reviewPayload = {
		...reviewBase,
		reviewDraftHash
	};
	const reviewEvent = {
		id: `${reviewDraftHash.slice(0, 63)}a`,
		kind: REVIEW_NOSTR_KINDS.REVIEW,
		pubkey: REVIEWER_PUBKEY,
		created_at: reviewPayload.createdAt,
		tags: [
			['p', CURRENT_USER_PUBKEY],
			['d', reviewDraftHash]
		],
		content: JSON.stringify(reviewPayload),
		sig: '4'.repeat(128)
	};

	const replyPayload = buildReviewReplyFixture({
		parentReviewEventId: reviewEvent.id,
		revieweePubkey: CURRENT_USER_PUBKEY,
		createdAt: 1_700_000_222
	});
	const replyEvent = {
		id: '5'.repeat(64),
		kind: REVIEW_NOSTR_KINDS.REPLY,
		pubkey: CURRENT_USER_PUBKEY,
		created_at: replyPayload.createdAt,
		tags: [
			['e', reviewEvent.id],
			['p', CURRENT_USER_PUBKEY]
		],
		content: JSON.stringify(replyPayload),
		sig: '6'.repeat(128)
	};

	const attestationEvent = {
		id: '7'.repeat(64),
		kind: REVIEW_NOSTR_KINDS.ATTESTATION,
		pubkey: ISSUER_PUBKEY,
		created_at: 1_700_000_333,
		tags: [
			['e', reviewEvent.id],
			['d', reviewDraftHash],
			['p', REVIEWER_PUBKEY],
			['p', CURRENT_USER_PUBKEY]
		],
		content: JSON.stringify({
			schemaVersion: REVIEWS_SCHEMA_VERSION,
			reviewEventId: reviewEvent.id,
			reviewDraftHash,
			subjectType: reviewPayload.subjectType,
			settlementType: reviewPayload.settlementType,
			reviewerPubkey: REVIEWER_PUBKEY,
			revieweePubkey: CURRENT_USER_PUBKEY,
			reviewerRole: reviewPayload.reviewerRole,
			revieweeRole: reviewPayload.revieweeRole,
			contractOutcome: reviewPayload.contractOutcome,
			issuedAt: Date.now(),
			expiresAt: Date.now() + 60_000,
			keyId: 'issuer-v1'
		}),
		sig: '8'.repeat(128)
	};

	return { reviewEvent, replyEvent, attestationEvent };
}

describe('/reviews real feed smoke', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		window.localStorage.clear();
		(globalThis as { __reviewsPublishOutbox?: unknown[] }).__reviewsPublishOutbox = [];
		(globalThis as { __reviewsIssuerRegistryCache?: unknown }).__reviewsIssuerRegistryCache = null;
		hoisted.getNostrKeyPair.mockResolvedValue({
			npub: CURRENT_USER_PUBKEY,
			nsec: CURRENT_USER_SECRET
		});
		hoisted.getNpub.mockResolvedValue(CURRENT_USER_PUBKEY);
	});

	it('renders a focused received review using the real review feed loader', async () => {
		const { reviewEvent, replyEvent, attestationEvent } = await buildReviewFixtures();
		hoisted.setCurrentUrl(
			`https://example.test/reviews?tab=received&highlight=${reviewEvent.id}&replyTo=${reviewEvent.id}`
		);

		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith('/review-attestation-issuers')) {
					return new Response(
						JSON.stringify({
							schemaVersion: REVIEWS_SCHEMA_VERSION,
							issuers: [
								{
									keyId: 'issuer-v1',
									pubkey: ISSUER_PUBKEY,
									status: 'active',
									validFrom: 0,
									validUntil: null
								}
							]
						})
					);
				}

				throw new Error(`Unexpected fetch url: ${url}`);
			})
		);

		hoisted.querySync.mockImplementation(async (_relays, filter) => {
			if (
				(filter as { kinds?: number[]; authors?: string[] }).kinds?.includes(
					REVIEW_NOSTR_KINDS.REVIEW
				)
			) {
				if ((filter as { authors?: string[] }).authors?.length) {
					return [];
				}
				return [reviewEvent];
			}

			if ((filter as { kinds?: number[] }).kinds?.includes(REVIEW_NOSTR_KINDS.ATTESTATION)) {
				return [attestationEvent];
			}

			if ((filter as { kinds?: number[] }).kinds?.includes(REVIEW_NOSTR_KINDS.REPLY)) {
				return [replyEvent];
			}

			return [];
		});

		render(ReviewsPage);

		await waitFor(() => {
			expect(screen.getAllByText('Great work and clear communication.').length).toBeGreaterThan(0);
		});
		expect(screen.getByText('Focused review')).toBeInTheDocument();
		expect(screen.getByText('Focused reply')).toBeInTheDocument();
		expect(screen.getByText('Write a reply')).toBeInTheDocument();
		expect(screen.getByText('Replying to this review')).toBeInTheDocument();
	});
});
