import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { EscrowStatus } from '$lib/utils/escrow/v1/escrow.enum';
import type { ContractWithEvents } from '$lib/types/contract';
import type { ReviewFeedResponse } from '$lib/reviews';

const CURRENT_USER_PUBKEY = '1'.repeat(64);
const REVIEWEE_PUBKEY = '2'.repeat(64);
const REVIEWER_PUBKEY = '3'.repeat(64);
const GIVEN_REVIEW_HASH = '4'.repeat(64);
const RECEIVED_REVIEW_HASH = '5'.repeat(64);

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
		contract: null as ContractWithEvents | null,
		contracts: [] as ContractWithEvents[],
		contractsMap: new Map<string, number>(),
		isLoading: false,
		error: null as string | null,
		isDrawerOpen: false,
		isResolutionFormOpen: false,
		hasMore: false,
		oldestTimestamp: null as number | null,
		isSubscribed: false,
		isLoadingMore: false
	});

	const appStoreState = createStore({
		pool: {
			querySync: vi.fn(),
			subscribe: vi.fn()
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
		createStore,
		contractStore,
		appStore,
		get currentUrl() {
			return currentUrl;
		},
		setCurrentUrl(url: string) {
			currentUrl = new URL(url);
			pageStore.set({ url: currentUrl });
		},
		pageStore,
		goto: vi.fn((url: string) => {
			currentUrl = new URL(url);
			pageStore.set({ url: currentUrl });
		}),
		loadContracts: vi.fn(),
		getCurrentReviewerPubkey: vi.fn(),
		loadReviewFeed: vi.fn(),
		submitAttestedReview: vi.fn(),
		publishReplyEvent: vi.fn(),
		translateReviewCommentOnly: vi.fn()
	};
});

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string, options?: { values?: Record<string, string | number> }) => {
			if (key === 'reviews.management.title') return 'Reviews';
			if (key === 'reviews.page.subtitle')
				return 'Manage pending reviews, published feedback, and public replies from one place.';
			if (key === 'reviews.list.no_given_reviews') return 'No given reviews';
			if (key === 'reviews.management.given_empty_description') return 'No given reviews yet';
			if (key === 'reviews.list.no_reviews') return 'No reviews';
			if (key === 'reviews.management.received_empty_description') return 'No received reviews yet';
			if (key === 'reviews.form.success') return 'Review submitted successfully';
			if (key === 'reviews.reply.success') return 'Reply published successfully';
			if (key === 'reviews.form.errors.submit_failed') return 'Unable to submit review';
			if (key === 'reviews.reply.errors.submit_failed') return 'Unable to submit reply';
			if (key === 'reviews.form.errors.comment_required') return 'Comment is required';
			if (key === 'reviews.form.errors.prepare_failed') return 'Unable to prepare review';
			if (key === 'reviews.reply.errors.empty_reply') return 'Reply cannot be empty';
			if (key === 'reviews.list.load_error') return 'Unable to load reviews';
			if (key === 'reviews.summary.title') return 'Summary';
			if (key === 'reviews.summary.empty_title') return 'No reviews yet';
			if (key === 'reviews.summary.empty_description') return 'Be the first to review';
			if (key === 'reviews.view_all') return 'View all';
			if (key === 'reviews.summary.average_rating') return 'Average';
			if (key === 'reviews.summary.total_reviews') return 'Total reviews';
			if (key === 'reviews.summary.reviews_received') return 'received';
			if (key === 'reviews.summary.rating_distribution') return 'Rating distribution';
			if (key === 'reviews.summary.category_averages') return 'Category averages';
			if (key === 'reviews.summary.category_unavailable') return 'Category data unavailable';
			if (key === 'reviews.reply.composer_title') return 'Write a reply';
			if (key === 'reviews.reply') return 'Reply';
			if (key === 'reviews.reply.submit') return 'Submit reply';
			if (key === 'reviews.reply.submitting') return 'Submitting reply';
			if (key === 'reviews.pending.review_now') return 'Review now';
			if (key === 'reviews.pending.no_pending') return 'No pending reviews';
			if (key === 'reviews.pending.all_caught_up') return 'All caught up';
			if (key === 'reviews.cta.create_task') return 'Create Task';
			if (key === 'reviews.pending.only_current_user') return 'Only current user';
			if (key === 'reviews.pending.review_for') return 'Review for';
			if (key === 'reviews.pending.completed') return 'Completed';
			if (key === 'reviews.pending.completed_on') return 'Completed on';
			if (key === 'reviews.pending.loading') return 'Loading';
			if (key === 'reviews.reply.english_label') return 'English';
			if (key === 'reviews.reply.spanish_label') return 'Spanish';
			if (key === 'reviews.reply.attachments_label') return 'Attachments';
			if (key === 'reviews.reply.upload_label') return 'Upload';
			if (key === 'reviews.reply.subtitle') return 'Reply subtitle';
			if (key === 'reviews.context.task') return 'Task';
			if (key === 'reviews.context.service') return 'Service';
			if (key === 'reviews.form.title') return 'Write a review';
			if (key === 'reviews.form.context_title') return 'Context';
			if (key === 'reviews.form.context_summary') return 'Context summary';
			if (key === 'reviews.form.reviewee_role') return 'Reviewee role';
			if (key === 'reviews.form.reviewing') return 'Reviewing';
			if (key === 'reviews.form.english_placeholder') return 'English text';
			if (key === 'reviews.form.spanish_placeholder') return 'Spanish text';
			if (key === 'reviews.form.overall_rating') return 'Overall rating';
			if (key === 'reviews.form.rate_overall_aria') {
				return `Rate ${options?.values?.rating ?? ''}`;
			}
			return key;
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

vi.mock('@reviews-contracts', async () => {
	const actual = await vi.importActual<typeof import('@reviews-contracts')>('@reviews-contracts');
	return {
		...actual,
		reviewEventPayloadSchema: {
			parse: (value: Record<string, unknown>) => ({
				...value,
				schemaVersion: 1,
				reviewDraftHash: 'a'.repeat(64),
				revieweePubkey:
					typeof value.revieweePubkey === 'string' ? value.revieweePubkey : REVIEWEE_PUBKEY
			})
		},
		reviewReplyEventPayloadSchema: {
			parse: (value: Record<string, unknown>) => ({
				...value,
				schemaVersion: 1,
				revieweePubkey:
					typeof value.revieweePubkey === 'string' ? value.revieweePubkey : CURRENT_USER_PUBKEY
			})
		},
		computeReviewDraftHash: vi.fn(async () => 'a'.repeat(64))
	};
});

vi.mock('$lib/components/reviews/ReviewManagementTabs.svelte', async () => {
	const { default: Stub } = await import('./fixtures/ReviewsPageReviewManagementTabsStub.svelte');
	return { default: Stub };
});

vi.mock('$lib/components/reviews/PendingReviewsList.svelte', async () => {
	const { default: Stub } = await import('./fixtures/ReviewsPagePendingReviewsListStub.svelte');
	return { default: Stub };
});

vi.mock('$lib/components/reviews/ReviewList.svelte', async () => {
	const { default: Stub } = await import('./fixtures/ReviewsPageReviewListStub.svelte');
	return { default: Stub };
});

vi.mock('$lib/components/reviews/ReviewPromptModal.svelte', async () => {
	const { default: Stub } = await import('./fixtures/ReviewsPageReviewPromptModalStub.svelte');
	return { default: Stub };
});

vi.mock('$lib/components/reviews/ReviewReplyComposer.svelte', async () => {
	const { default: Stub } = await import('./fixtures/ReviewsPageReviewReplyComposerStub.svelte');
	return { default: Stub };
});

vi.mock('$lib/components/profile/ReviewSummaryCard.svelte', async () => {
	const { default: Stub } = await import('./fixtures/ReviewsPageReviewSummaryCardStub.svelte');
	return { default: Stub };
});

vi.mock('$lib/api/reviews/review-api', () => ({
	getCurrentReviewerPubkey: (...args: Parameters<typeof hoisted.getCurrentReviewerPubkey>) =>
		hoisted.getCurrentReviewerPubkey(...args),
	loadReviewFeed: (...args: Parameters<typeof hoisted.loadReviewFeed>) =>
		hoisted.loadReviewFeed(...args),
	submitAttestedReview: (...args: Parameters<typeof hoisted.submitAttestedReview>) =>
		hoisted.submitAttestedReview(...args),
	publishReplyEvent: (...args: Parameters<typeof hoisted.publishReplyEvent>) =>
		hoisted.publishReplyEvent(...args),
	translateReviewCommentOnly: (...args: Parameters<typeof hoisted.translateReviewCommentOnly>) =>
		hoisted.translateReviewCommentOnly(...args)
}));

function createContract(): ContractWithEvents {
	return {
		contractEvent: {
			id: 'contract-event-1',
			created_at: 1_700_000_000,
			pubkey: 'contract-author',
			kind: 30001,
			tags: [],
			content: {
				escrowId: 'contract-1',
				contextType: 'service',
				contextId: 'service-1',
				serviceId: 'service-1',
				serviceTitle: 'Brand refresh sprint',
				contextTitle: 'Brand refresh sprint',
				contextDescription: 'Design and delivery',
				clientPubkey: CURRENT_USER_PUBKEY,
				freelancerPubkey: REVIEWEE_PUBKEY,
				currency: 'RBTC',
				contractAddress: '0xcontract',
				purchaseMode: 'quote'
			}
		},
		statusEvents: [],
		isClient: true,
		blockchainStatus: EscrowStatus.FundsReleased,
		escrowData: {
			id: 'contract-1',
			client: '0xclient',
			freelancer: '0xfreelancer'
		} as ContractWithEvents['escrowData'],
		status: EscrowStatus.FundsReleased,
		isPending: false,
		permissions: {
			canComplete: false,
			canAccept: false,
			canDispute: false,
			canPropose: false,
			canAcceptProposal: false,
			canCancel: false,
			canResolveTimelock: false,
			canDelete: false
		},
		disputeProposal: null,
		completionAttachments: null
	} as ContractWithEvents;
}

function createReviewFeed(): ReviewFeedResponse {
	return {
		pending: [],
		given: [
			{
				id: 'given-review-1',
				reviewDraftHash: GIVEN_REVIEW_HASH,
				reviewerPubkey: CURRENT_USER_PUBKEY,
				revieweePubkey: REVIEWEE_PUBKEY,
				subjectType: 'service_booking',
				subjectLabel: 'Brand refresh sprint',
				settlementType: 'service_quote_contract',
				contractOutcome: 'completed',
				verificationState: 'verified',
				createdAt: 1_700_000_100,
				overallRating: 4,
				content: {
					en: 'Great client',
					es: 'Gran cliente',
					authoredLanguage: 'en'
				},
				categoryScores: [],
				attachments: []
			}
		],
		received: [
			{
				id: 'received-review-1',
				reviewDraftHash: RECEIVED_REVIEW_HASH,
				reviewerPubkey: REVIEWER_PUBKEY,
				revieweePubkey: CURRENT_USER_PUBKEY,
				reviewerLabel: 'Reviewer',
				revieweeLabel: 'Current user',
				subjectType: 'service_booking',
				subjectLabel: 'Brand refresh sprint',
				settlementType: 'service_quote_contract',
				contractOutcome: 'completed',
				verificationState: 'verified',
				createdAt: 1_700_000_050,
				overallRating: 5,
				content: {
					en: 'Excellent work',
					es: 'Trabajo excelente',
					authoredLanguage: 'en'
				},
				categoryScores: [],
				attachments: []
			}
		],
		summary: {
			averageRating: 5,
			totalReviews: 1,
			ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 },
			categoryGroups: [],
			recentReviewsCount: 1
		}
	};
}

function resetEnvironment(url = 'https://example.test/reviews') {
	window.localStorage.removeItem('reviews.dismissed.pending');
	hoisted.setCurrentUrl(url);
	hoisted.contractStore.set({
		contract: null,
		contracts: [],
		contractsMap: new Map(),
		isLoading: false,
		error: null,
		isDrawerOpen: false,
		isResolutionFormOpen: false,
		hasMore: false,
		oldestTimestamp: null,
		isSubscribed: false,
		isLoadingMore: false
	});
	hoisted.loadContracts.mockReset().mockImplementation(async () => {
		hoisted.contractStore.set({
			contract: null,
			contracts: [createContract()],
			contractsMap: new Map([['contract-1', 0]]),
			isLoading: false,
			error: null,
			isDrawerOpen: false,
			isResolutionFormOpen: false,
			hasMore: false,
			oldestTimestamp: 1_700_000_000,
			isSubscribed: true,
			isLoadingMore: false
		});
	});
	hoisted.getCurrentReviewerPubkey.mockReset().mockResolvedValue(CURRENT_USER_PUBKEY);
	hoisted.loadReviewFeed.mockReset().mockResolvedValue(createReviewFeed());
	hoisted.submitAttestedReview.mockReset().mockResolvedValue({
		reviewEventId: 'review-event-new',
		attestationEventId: 'attestation-event-new',
		reviewDraftHash: 'draft-new'
	});
	hoisted.publishReplyEvent.mockReset().mockResolvedValue('reply-event-new');
	hoisted.translateReviewCommentOnly.mockReset().mockResolvedValue({
		sourceLanguage: 'en',
		content: {
			sourceLanguage: 'en',
			en: { comment: 'English text' },
			es: { comment: 'Texto en español' }
		},
		translationMode: 'backend'
	});
	hoisted.appStore.set({
		pool: {
			querySync: vi.fn(),
			subscribe: vi.fn()
		},
		relays: ['wss://relay.example.test']
	});
	hoisted.appStore.showSuccessToast.mockReset();
	hoisted.appStore.showErrorToast.mockReset();
}

describe('reviews page integration', () => {
	beforeEach(() => {
		resetEnvironment();
	});

	it('loads direct Nostr review data and opens the pending review modal from a deep link', async () => {
		resetEnvironment('https://example.test/reviews?tab=pending&highlight=contract-1');

		const { default: ReviewsPage } = await import(
			'../../../../routes/(protected)/reviews/+page.svelte'
		);
		render(ReviewsPage);

		await tick();
		await waitFor(
			() => {
				expect(screen.getByTestId('review-summary-card')).toBeTruthy();
			},
			{ timeout: 10_000 }
		);

		await waitFor(
			() => {
				expect(screen.getByTestId('review-prompt-modal')).toBeTruthy();
			},
			{ timeout: 10_000 }
		);

		expect(hoisted.getCurrentReviewerPubkey).toHaveBeenCalledTimes(1);
		expect(hoisted.loadReviewFeed).toHaveBeenCalledWith({ reviewerPubkey: CURRENT_USER_PUBKEY });
		expect(hoisted.loadContracts).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('review-prompt-modal')).toHaveAttribute(
			'data-reviewee-pubkey',
			REVIEWEE_PUBKEY
		);
	}, 10_000);

	it('keeps reply deep links on the received tab and opens the reply composer', async () => {
		resetEnvironment(
			'https://example.test/reviews?tab=received&highlight=received-review-1&replyTo=received-review-1'
		);

		const { default: ReviewsPage } = await import(
			'../../../../routes/(protected)/reviews/+page.svelte'
		);
		render(ReviewsPage);

		await tick();
		await waitFor(() => {
			expect(screen.getByTestId('review-reply-composer')).toBeTruthy();
		});

		expect(screen.getByTestId('review-reply-composer')).toHaveAttribute(
			'data-parent-review-id',
			'received-review-1'
		);
		expect(screen.getByTestId('review-reply-composer')).toHaveAttribute(
			'data-parent-review-subject-type',
			'service_booking'
		);
		expect(screen.getByTestId('review-reply-composer')).toHaveAttribute(
			'data-parent-review-outcome',
			'completed'
		);
	});

	it('updates the URL when the user opens a pending review', async () => {
		resetEnvironment('https://example.test/reviews?tab=pending');

		const { default: ReviewsPage } = await import(
			'../../../../routes/(protected)/reviews/+page.svelte'
		);
		render(ReviewsPage);

		await tick();
		await waitFor(() => {
			expect(screen.getByTestId('reviews-pending-list')).toBeTruthy();
		});

		await fireEvent.click(screen.getByRole('button', { name: 'review-now' }));
		expect(hoisted.goto).toHaveBeenCalledWith(
			'https://example.test/reviews?tab=pending&highlight=contract-1',
			expect.objectContaining({ replaceState: true, noScroll: true, keepFocus: true })
		);
	});

	it('updates the URL when the user opens a reply composer', async () => {
		resetEnvironment('https://example.test/reviews?tab=received');

		const { default: ReviewsPage } = await import(
			'../../../../routes/(protected)/reviews/+page.svelte'
		);
		render(ReviewsPage);

		await tick();
		await waitFor(() => {
			expect(screen.getByTestId('reviews-list')).toBeTruthy();
		});

		await fireEvent.click(screen.getByRole('button', { name: 'reply' }));
		expect(hoisted.goto).toHaveBeenCalledWith(
			'https://example.test/reviews?tab=received&highlight=received-review-1&replyTo=received-review-1',
			expect.objectContaining({ replaceState: true, noScroll: true, keepFocus: true })
		);
	});

	it('renders the localized reviews shell heading without the subtitle copy', async () => {
		resetEnvironment('https://example.test/reviews?tab=received');

		const { default: ReviewsPage } = await import(
			'../../../../routes/(protected)/reviews/+page.svelte'
		);
		render(ReviewsPage);

		await tick();
		await waitFor(() => {
			expect(screen.getByRole('heading', { name: 'Reviews' })).toBeTruthy();
		});
		expect(
			screen.queryByText(
				'Manage pending reviews, published feedback, and public replies from one place.'
			)
		).toBeNull();
	});

	it('surfaces bootstrap failures instead of leaving the page in a loading state', async () => {
		resetEnvironment('https://example.test/reviews');
		hoisted.getCurrentReviewerPubkey.mockRejectedValueOnce(new Error('Missing Nostr public key'));

		const { default: ReviewsPage } = await import(
			'../../../../routes/(protected)/reviews/+page.svelte'
		);
		render(ReviewsPage);

		await tick();
		await waitFor(() => {
			expect(screen.getByText('Missing Nostr public key')).toBeTruthy();
		});

		expect(screen.queryByText('loading')).toBeNull();
	});

	it('updates the URL when the user focuses a given review card', async () => {
		resetEnvironment('https://example.test/reviews?tab=given');

		const { default: ReviewsPage } = await import(
			'../../../../routes/(protected)/reviews/+page.svelte'
		);
		render(ReviewsPage);

		await tick();
		await waitFor(() => {
			expect(screen.getByTestId('reviews-list')).toBeTruthy();
		});

		await fireEvent.click(screen.getByRole('button', { name: 'open' }));
		expect(hoisted.goto).toHaveBeenCalledWith(
			'https://example.test/reviews?tab=given&highlight=given-review-1',
			expect.objectContaining({ replaceState: true, noScroll: true, keepFocus: true })
		);
	});

	it('visibly forwards given-review deep links into the review list highlight state', async () => {
		resetEnvironment('https://example.test/reviews?tab=given&highlight=given-review-1');

		const { default: ReviewsPage } = await import(
			'../../../../routes/(protected)/reviews/+page.svelte'
		);
		render(ReviewsPage);

		await tick();
		await waitFor(() => {
			expect(screen.getByTestId('reviews-list')).toHaveAttribute(
				'data-highlighted-review-id',
				'given-review-1'
			);
		});
	});

	it('clears unresolved received-review highlights so entry links land on stable UI', async () => {
		resetEnvironment('https://example.test/reviews?tab=received&highlight=missing-review');

		const { default: ReviewsPage } = await import(
			'../../../../routes/(protected)/reviews/+page.svelte'
		);
		render(ReviewsPage);

		await tick();
		await waitFor(() => {
			expect(hoisted.goto).toHaveBeenCalledWith(
				'https://example.test/reviews?tab=received',
				expect.objectContaining({ replaceState: true, noScroll: true, keepFocus: true })
			);
		});
	});

	it('submits a translated review draft and redirects to the given tab', async () => {
		resetEnvironment('https://example.test/reviews?tab=pending&highlight=contract-1');

		const { default: ReviewsPage } = await import(
			'../../../../routes/(protected)/reviews/+page.svelte'
		);
		render(ReviewsPage);

		await tick();
		await waitFor(() => {
			expect(screen.getByTestId('review-prompt-modal')).toBeTruthy();
		});

		await fireEvent.click(screen.getByRole('button', { name: 'submit-review' }));

		await waitFor(() => {
			expect(hoisted.translateReviewCommentOnly).toHaveBeenCalledWith({
				sourceLanguage: 'en',
				comment: 'English review draft'
			});
		});

		await waitFor(() => {
			expect(hoisted.submitAttestedReview).toHaveBeenCalledTimes(1);
		});

		expect(hoisted.submitAttestedReview).toHaveBeenCalledWith(
			expect.objectContaining({
				subjectId: 'service-1',
				settlementId: 'contract-1',
				chain: 'rsk',
				asset: 'rbtc',
				contractAddress: '0xcontract',
				reviewerWallet: '0xclient',
				revieweeWallet: '0xfreelancer',
				revieweeNpub: REVIEWEE_PUBKEY,
				review: expect.objectContaining({
					subjectType: 'service_booking',
					settlementType: 'service_quote_contract',
					revieweePubkey: REVIEWEE_PUBKEY,
					contractOutcome: 'completed',
					content: {
						sourceLanguage: 'en',
						en: { comment: 'English text' },
						es: { comment: 'Texto en español' }
					},
					attachments: [
						expect.objectContaining({
							url: 'https://cdn.example.test/review-attachment.jpg',
							key: 'review-attachment.jpg',
							type: 'image',
							alt: 'Review attachment',
							size: 1024
						})
					]
				})
			})
		);
		expect(hoisted.appStore.showSuccessToast).toHaveBeenCalledWith('Review submitted successfully');
		expect(hoisted.goto).toHaveBeenCalledWith(
			'https://example.test/reviews?tab=given&highlight=review-event-new',
			expect.objectContaining({ replaceState: true, noScroll: true, keepFocus: true })
		);
	});

	it('skips translation when a bilingual review draft is already present', async () => {
		resetEnvironment('https://example.test/reviews?tab=pending&highlight=contract-1');

		const { default: ReviewsPage } = await import(
			'../../../../routes/(protected)/reviews/+page.svelte'
		);
		render(ReviewsPage);

		await tick();
		await waitFor(() => {
			expect(screen.getByTestId('review-prompt-modal')).toBeTruthy();
		});

		await fireEvent.click(screen.getByRole('button', { name: 'submit-bilingual-review' }));

		await waitFor(() => {
			expect(hoisted.submitAttestedReview).toHaveBeenCalledTimes(1);
		});

		expect(hoisted.translateReviewCommentOnly).not.toHaveBeenCalled();
		expect(hoisted.submitAttestedReview).toHaveBeenCalledWith(
			expect.objectContaining({
				review: expect.objectContaining({
					content: {
						sourceLanguage: 'en',
						en: { comment: 'Already translated review' },
						es: { comment: 'Reseña ya traducida' }
					}
				})
			})
		);
	});

	it('submits a translated reply and keeps the received review highlighted', async () => {
		resetEnvironment(
			'https://example.test/reviews?tab=received&highlight=received-review-1&replyTo=received-review-1'
		);

		const { default: ReviewsPage } = await import(
			'../../../../routes/(protected)/reviews/+page.svelte'
		);
		render(ReviewsPage);

		await tick();
		await waitFor(() => {
			expect(screen.getByTestId('review-reply-composer')).toBeTruthy();
		});

		await fireEvent.click(screen.getByRole('button', { name: 'submit-reply' }));

		await waitFor(() => {
			expect(hoisted.translateReviewCommentOnly).toHaveBeenCalledWith({
				sourceLanguage: 'es',
				comment: 'Respuesta de seguimiento'
			});
		});
		await waitFor(() => {
			expect(hoisted.publishReplyEvent).toHaveBeenCalledTimes(1);
		});

		expect(hoisted.publishReplyEvent).toHaveBeenCalledWith({
			schemaVersion: 1,
			parentReviewEventId: 'received-review-1',
			revieweePubkey: CURRENT_USER_PUBKEY,
			createdAt: expect.any(Number),
			content: {
				sourceLanguage: 'en',
				en: { comment: 'English text' },
				es: { comment: 'Texto en español' }
			},
			attachments: [
				expect.objectContaining({
					url: 'https://cdn.example.test/reply-attachment.jpg',
					key: 'reply-attachment.jpg',
					type: 'image',
					alt: 'Reply attachment',
					size: 2048
				})
			]
		});
		expect(hoisted.appStore.showSuccessToast).toHaveBeenCalledWith('Reply published successfully');
		expect(hoisted.goto).toHaveBeenCalledWith(
			'https://example.test/reviews?tab=received&highlight=received-review-1',
			expect.objectContaining({ replaceState: true, noScroll: true, keepFocus: true })
		);
	});

	it('rewrites reply deep links onto the received tab', async () => {
		resetEnvironment(
			'https://example.test/reviews?tab=given&highlight=received-review-1&replyTo=received-review-1'
		);

		const { default: ReviewsPage } = await import(
			'../../../../routes/(protected)/reviews/+page.svelte'
		);
		render(ReviewsPage);

		await tick();
		await waitFor(() => {
			expect(hoisted.goto).toHaveBeenCalledWith(
				'https://example.test/reviews?tab=received&highlight=received-review-1&replyTo=received-review-1',
				expect.objectContaining({ replaceState: true, noScroll: true, keepFocus: true })
			);
		});
	});
});
