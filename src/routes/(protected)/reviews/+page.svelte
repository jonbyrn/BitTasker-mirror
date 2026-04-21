<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import { SvelteSet } from 'svelte/reactivity';
	import { appStore } from '$lib/stores/app.store';
	import { contractStore } from '$lib/stores/contract.store';
	import ReviewManagementTabs from '$lib/components/reviews/ReviewManagementTabs.svelte';
	import ReviewList from '$lib/components/reviews/ReviewList.svelte';
	import PendingReviewsList from '$lib/components/reviews/PendingReviewsList.svelte';
	import ReviewPromptModal from '$lib/components/reviews/ReviewPromptModal.svelte';
	import ReviewReplyComposer from '$lib/components/reviews/ReviewReplyComposer.svelte';
	import ReviewSummaryCard from '$lib/components/profile/ReviewSummaryCard.svelte';
	import {
		buildPendingReviewState,
		buildReviewComposerCategoryGroups,
		buildReviewStatsSummary,
		getPendingReviewSlotKey,
		persistDismissedPendingSlotKeys,
		readDismissedPendingSlotKeys,
		toCategoryRatings
	} from '$lib/reviews';
	import { buildReviewsUrl, parseReviewRoute } from '$lib/reviews';
	import type { ReviewBilingualContent } from '$lib/reviews';
	import type {
		PendingReviewRecord,
		ReviewStatsSummary,
		VerifiedReviewRecord
	} from '$lib/components/reviews/reviewTypes';
	import {
		getCurrentReviewerPubkey,
		loadReviewFeed,
		submitAttestedReview,
		publishReplyEvent,
		translateReviewCommentOnly
	} from '$lib/api/reviews/review-api';
	import { reviewEventPayloadSchema, reviewReplyEventPayloadSchema } from '@reviews-contracts';

	type ReviewContentDraft = {
		en: string;
		es: string;
	};

	let currentUserPubkey = $state('');
	let givenReviews = $state<VerifiedReviewRecord[]>([]);
	let receivedReviews = $state<VerifiedReviewRecord[]>([]);
	let stats = $state<ReviewStatsSummary>({
		averageRating: 0,
		totalReviews: 0,
		ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
	});
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let isSubmittingReply = $state(false);
	let dismissedPendingSlotKeys = new SvelteSet<string>();

	const routeState = $derived(parseReviewRoute(page.url));
	const activeTab = $derived(routeState.tab);
	const createTaskHref = resolve('/dashboard/create-task');

	const selectedPendingReviewId = $derived(
		routeState.tab === 'pending' ? routeState.highlight : null
	);
	const selectedReplyReviewId = $derived(routeState.replyTo);

	const pendingReviewState = $derived.by(() => {
		if (!currentUserPubkey) {
			return buildPendingReviewState([], '', [], dismissedPendingSlotKeys);
		}

		// Collect all review/attestation IDs to cross-reference
		const existingAttestations = [...givenReviews, ...receivedReviews].map((r) => ({
			subjectId: r.id, // Or other mapping logic if available
			settlementId: r.id
		}));

		return buildPendingReviewState(
			$contractStore.contracts,
			currentUserPubkey,
			existingAttestations,
			dismissedPendingSlotKeys
		);
	});
	const pendingReviews = $derived(pendingReviewState.records);
	const selectedPendingReview = $derived(
		pendingReviews.find((record) => record.id === selectedPendingReviewId) ?? null
	);
	const selectedPendingTarget = $derived(
		pendingReviewState.targetsById.get(selectedPendingReviewId ?? '') ?? null
	);
	const selectedReplyReview = $derived(
		receivedReviews.find((review) => review.id === selectedReplyReviewId) ?? null
	);
	const highlightedReviewId = $derived.by(() => {
		if (activeTab === 'given') {
			return givenReviews.some((review) => review.id === routeState.highlight)
				? routeState.highlight
				: null;
		}

		if (activeTab === 'received') {
			return receivedReviews.some((review) => review.id === routeState.highlight)
				? routeState.highlight
				: null;
		}

		return null;
	});

	function syncDismissedPendingSlotKeys() {
		const keys = readDismissedPendingSlotKeys();
		dismissedPendingSlotKeys = new SvelteSet(keys);
	}

	async function loadReviewData() {
		if (!currentUserPubkey) {
			return;
		}

		isLoading = true;
		error = null;
		try {
			const reviews = await loadReviewFeed({ reviewerPubkey: currentUserPubkey });
			givenReviews = reviews.given;
			receivedReviews = reviews.received;
			stats = buildReviewStatsSummary(reviews.received);
		} catch (loadError) {
			error = loadError instanceof Error ? loadError.message : $t('reviews.list.load_error');
		} finally {
			isLoading = false;
		}
	}

	async function ensureContractsLoaded() {
		if ($contractStore.isLoading || $contractStore.contracts.length > 0) {
			return;
		}

		try {
			await contractStore.loadContracts();
		} catch (loadError) {
			console.error('Failed to load contracts for reviews:', loadError);
		}
	}

	function openPendingReview(record: PendingReviewRecord) {
		goto(
			buildReviewsUrl(page.url, {
				tab: 'pending',
				highlight: record.id,
				replyTo: null
			}),
			{ replaceState: true, noScroll: true, keepFocus: true }
		);
	}

	function highlightReview(tab: 'given' | 'received', reviewId: string) {
		goto(
			buildReviewsUrl(page.url, {
				tab,
				highlight: reviewId,
				replyTo: tab === 'received' && routeState.replyTo === reviewId ? routeState.replyTo : null
			}),
			{ replaceState: true, noScroll: true, keepFocus: true }
		);
	}

	function closePendingReview() {
		goto(
			buildReviewsUrl(page.url, {
				tab: 'pending',
				highlight: null,
				replyTo: null
			}),
			{ replaceState: true, noScroll: true, keepFocus: true }
		);
	}

	function openReplyComposer(reviewId: string) {
		goto(
			buildReviewsUrl(page.url, {
				tab: 'received',
				highlight: reviewId,
				replyTo: reviewId
			}),
			{ replaceState: true, noScroll: true, keepFocus: true }
		);
	}

	function closeReplyComposer() {
		goto(
			buildReviewsUrl(page.url, {
				tab: 'received',
				highlight: routeState.highlight,
				replyTo: null
			}),
			{ replaceState: true, noScroll: true, keepFocus: true }
		);
	}

	async function ensureBilingualComment(
		content: ReviewContentDraft
	): Promise<ReviewBilingualContent> {
		const en = content.en.trim();
		const es = content.es.trim();

		if (en && es) {
			return {
				sourceLanguage: 'en',
				en: { comment: en },
				es: { comment: es }
			};
		}

		if (en) {
			const translation = await translateReviewCommentOnly({
				sourceLanguage: 'en',
				comment: en
			});
			return translation.content;
		}

		if (es) {
			const translation = await translateReviewCommentOnly({
				sourceLanguage: 'es',
				comment: es
			});
			return translation.content;
		}

		throw new Error($t('reviews.form.errors.comment_required'));
	}

	async function handleReviewSubmit(payload: {
		overallRating: number;
		content: ReviewContentDraft;
		categoryScores?: { id: string; value: number; label: string; description?: string }[];
		attachments?: {
			url: string;
			type: 'image' | 'video';
			alt?: string;
			name?: string;
			size?: number;
		}[];
	}) {
		if (!selectedPendingReview || !selectedPendingTarget || !currentUserPubkey) {
			return;
		}

		try {
			const bilingualContent = await ensureBilingualComment(payload.content);
			const reviewPayload = {
				schemaVersion: 1,
				subjectType: selectedPendingReview.subjectType,
				settlementType: selectedPendingReview.settlementType,
				revieweePubkey: selectedPendingReview.revieweePubkey,
				reviewerRole: selectedPendingTarget.reviewerRole,
				revieweeRole: selectedPendingTarget.revieweeRole,
				contractOutcome: selectedPendingReview.contractOutcome,
				createdAt: Math.floor(Date.now() / 1000),
				rating: {
					overallRating: payload.overallRating,
					categoryRatings: toCategoryRatings(
						payload.categoryScores ?? [],
						selectedPendingTarget.revieweeRole
					)
				},
				content: bilingualContent,
				attachments: (payload.attachments ?? []).map((attachment) => ({
					url: attachment.url,
					key: attachment.name ?? attachment.url,
					type: attachment.type,
					alt: attachment.alt ?? $t('reviews.attachments.review_generic_alt'),
					size: attachment.size ?? 0
				}))
			};
			const reviewDraftHash = await import('@reviews-contracts').then(
				({ computeReviewDraftHashFromPayload }) => computeReviewDraftHashFromPayload(reviewPayload)
			);
			const review = reviewEventPayloadSchema.parse({
				...reviewPayload,
				reviewDraftHash
			});

			const result = await submitAttestedReview({
				review,
				subjectId: selectedPendingTarget.subjectId,
				settlementId: selectedPendingTarget.settlementId,
				chain: selectedPendingTarget.chain,
				asset: selectedPendingTarget.asset,
				contractAddress: selectedPendingTarget.contractAddress,
				reviewerWallet: selectedPendingTarget.reviewerWallet,
				revieweeWallet: selectedPendingTarget.revieweeWallet,
				revieweeNpub: selectedPendingReview.revieweePubkey
			});

			const relatedContract = $contractStore.contracts.find(
				(contract) =>
					(contract.escrowData?.id ?? contract.contractEvent.content.escrowId) ===
					selectedPendingReview.id
			);
			if (!relatedContract) {
				throw new Error($t('reviews.form.errors.prepare_failed'));
			}

			const slotKey = getPendingReviewSlotKey(relatedContract);
			dismissedPendingSlotKeys.add(slotKey);
			persistDismissedPendingSlotKeys(dismissedPendingSlotKeys);
			appStore.showSuccessToast($t('reviews.form.success'));
			await loadReviewData();
			await goto(
				buildReviewsUrl(page.url, {
					tab: 'given',
					highlight: result.reviewEventId,
					replyTo: null
				}),
				{ replaceState: true, noScroll: true, keepFocus: true }
			);
		} catch (submitError) {
			const message =
				submitError instanceof Error
					? submitError.message
					: $t('reviews.form.errors.submit_failed');
			appStore.showErrorToast(message);
			throw submitError;
		}
	}

	async function handleReplySubmit(payload: {
		parentReviewId: string;
		content: ReviewContentDraft;
		attachments: {
			url: string;
			type: 'image' | 'video';
			alt?: string;
			name?: string;
			size?: number;
		}[];
	}) {
		if (!selectedReplyReview) {
			return;
		}

		isSubmittingReply = true;
		try {
			const bilingualContent = await ensureBilingualComment(payload.content);
			const replyPayload = reviewReplyEventPayloadSchema.parse({
				schemaVersion: 1,
				parentReviewEventId: payload.parentReviewId,
				revieweePubkey: selectedReplyReview.revieweePubkey,
				createdAt: Math.floor(Date.now() / 1000),
				content: bilingualContent,
				attachments: (payload.attachments ?? []).map((attachment) => ({
					url: attachment.url,
					key: attachment.name ?? attachment.url,
					type: attachment.type,
					alt: attachment.alt ?? $t('reviews.attachments.reply_generic_alt'),
					size: attachment.size ?? 0
				}))
			});
			await publishReplyEvent(replyPayload);
			appStore.showSuccessToast($t('reviews.reply.success'));
			closeReplyComposer();
			await loadReviewData();
		} catch (submitError) {
			const message =
				submitError instanceof Error
					? submitError.message
					: $t('reviews.reply.errors.submit_failed');
			appStore.showErrorToast(message);
			throw submitError;
		} finally {
			isSubmittingReply = false;
		}
	}

	function handleTabChange(tab: 'pending' | 'given' | 'received') {
		goto(
			buildReviewsUrl(page.url, {
				tab,
				highlight: routeState.highlight,
				replyTo: routeState.replyTo
			}),
			{
				replaceState: true,
				noScroll: true,
				keepFocus: true
			}
		);
	}

	$effect(() => {
		if (routeState.replyTo && routeState.tab !== 'received') {
			goto(
				buildReviewsUrl(page.url, {
					tab: 'received',
					highlight: routeState.replyTo,
					replyTo: routeState.replyTo
				}),
				{ replaceState: true, noScroll: true, keepFocus: true }
			);
		}
	});

	$effect(() => {
		if (!routeState.highlight && !routeState.replyTo) {
			return;
		}

		const nextHighlight =
			routeState.tab === 'pending'
				? (selectedPendingReview?.id ?? null)
				: routeState.tab === 'given'
					? highlightedReviewId
					: routeState.replyTo && receivedReviews.some((review) => review.id === routeState.replyTo)
						? routeState.replyTo
						: highlightedReviewId;
		const nextReplyTo =
			routeState.tab === 'received' &&
			routeState.replyTo &&
			receivedReviews.some((review) => review.id === routeState.replyTo)
				? routeState.replyTo
				: null;

		if (nextHighlight === routeState.highlight && nextReplyTo === routeState.replyTo) {
			return;
		}

		goto(
			buildReviewsUrl(page.url, {
				tab: routeState.tab,
				highlight: nextHighlight,
				replyTo: nextReplyTo
			}),
			{ replaceState: true, noScroll: true, keepFocus: true }
		);
	});

	onMount(() => {
		syncDismissedPendingSlotKeys();
		getCurrentReviewerPubkey().then((pk) => {
			currentUserPubkey = pk;
			loadReviewData();
			ensureContractsLoaded();
		});
	});

	const composerCategoryGroups = $derived(
		selectedPendingTarget
			? buildReviewComposerCategoryGroups(selectedPendingTarget.revieweeRole)
			: []
	);
</script>

<svelte:head>
	<title>{$t('reviews.page.title')} | BitTasker</title>
</svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-6 pb-24 md:py-10">
	<header class="mb-8">
		<h1 class="text-3xl font-bold tracking-tight">{$t('reviews.page.title')}</h1>
		<p class="text-base-content/60 mt-2">{$t('reviews.page.subtitle')}</p>
	</header>

	<div class="grid grid-cols-1 gap-8 lg:grid-cols-3">
		<div class="lg:col-span-1">
			<ReviewSummaryCard {stats} onViewAll={() => handleTabChange('received')} />
		</div>

		<div class="lg:col-span-2">
			<ReviewManagementTabs {activeTab} {pendingReviews} onTabChange={handleTabChange} />

			<div class="mt-6">
				{#if activeTab === 'pending'}
					<PendingReviewsList {pendingReviews} onReviewClick={openPendingReview} />
				{:else if activeTab === 'given'}
					<ReviewList
						reviews={givenReviews}
						{highlightedReviewId}
						loading={isLoading}
						{error}
						emptyTitle={$t('reviews.list.empty_given')}
						showCreateTaskCta={true}
						{createTaskHref}
						onReviewClick={(review) => highlightReview('given', review.id)}
					/>
				{:else}
					<ReviewList
						reviews={receivedReviews}
						{highlightedReviewId}
						highlightedReplyReviewId={routeState.replyTo}
						loading={isLoading}
						{error}
						emptyTitle={$t('reviews.list.empty_received')}
						onReviewClick={(review) => highlightReview('received', review.id)}
						onReply={openReplyComposer}
					/>
				{/if}
			</div>
		</div>
	</div>
</div>

{#if selectedPendingReview && selectedPendingTarget}
	<ReviewPromptModal
		isOpen={true}
		{isLoading}
		target={selectedPendingTarget}
		categoryGroups={composerCategoryGroups}
		onClose={closePendingReview}
		onSubmit={handleReviewSubmit}
	/>
{/if}

{#if selectedReplyReview}
	<div
		class="modal modal-bottom sm:modal-middle"
		class:modal-open={!!routeState.replyTo}
		role="dialog"
	>
		<div class="modal-box p-0">
			<div class="p-6">
				<h3 class="text-lg font-bold">{$t('reviews.reply.title')}</h3>
				<p class="text-base-content/60 py-1 text-sm">
					{$t('reviews.reply.subtitle', {
						values: { reviewer: selectedReplyReview.reviewerLabel }
					})}
				</p>
			</div>

			<ReviewReplyComposer
				parentReview={selectedReplyReview}
				isSubmitting={isSubmittingReply}
				onCancel={closeReplyComposer}
				onSubmit={handleReplySubmit}
			/>
		</div>
		<button class="modal-backdrop" onclick={closeReplyComposer}>
			{$t('common.actions.close')}
		</button>
	</div>
{/if}
