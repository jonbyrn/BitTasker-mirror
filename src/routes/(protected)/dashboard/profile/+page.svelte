<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import { profileStore } from '$lib/stores/profile.store';
	import { contractStore } from '$lib/stores/contract.store';
	import ProfileHeader from '$lib/components/profile/ProfileHeader.svelte';
	import ProfileStats from '$lib/components/profile/ProfileStats.svelte';
	import ProfileServicesSection from '$lib/components/profile/ProfileServicesSection.svelte';
	import ProfileReviewsSection from '$lib/components/profile/ProfileReviewsSection.svelte';
	import ProfileInfoSection from '$lib/components/profile/ProfileInfoSection.svelte';
	import ProfileSidebar from '$lib/components/profile/ProfileSidebar.svelte';
	import type {
		PendingReviewRecord,
		ReviewViewTab,
		VerifiedReviewRecord
	} from '$lib/components/reviews/reviewTypes';
	import { getCurrentReviewerPubkey, loadReviewFeed } from '$lib/api/reviews/review-api';
	import {
		buildPendingReviewRecords,
		buildReviewStatsSummary,
		buildReviewsUrl,
		readDismissedPendingSlotKeys
	} from '$lib/reviews';

	// Format date (passed to children)
	function formatDate(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
	}

	let activeReviewTab = $state<ReviewViewTab>('received');
	let currentUserPubkey = $state('');
	let receivedReviews = $state<VerifiedReviewRecord[]>([]);
	let givenReviews = $state<VerifiedReviewRecord[]>([]);
	let reviewLoading = $state(true);
	let reviewError = $state<string | null>(null);
	let dismissedPendingSlotKeys = $state<Set<string>>(new Set());

	const pendingReviews = $derived.by(() =>
		currentUserPubkey
			? buildPendingReviewRecords($contractStore.contracts, currentUserPubkey, dismissedPendingSlotKeys)
			: []
	);
	const reviewStats = $derived.by(() => buildReviewStatsSummary(receivedReviews));

	function syncDismissedPendingSlotKeys() {
		dismissedPendingSlotKeys = readDismissedPendingSlotKeys();
	}

	function handleReviewTabChange(tab: ReviewViewTab) {
		activeReviewTab = tab;
	}

	function handleReviewClick(review: VerifiedReviewRecord) {
		const nextUrl = new URL(
			buildReviewsUrl(new URL(window.location.href), {
				tab: activeReviewTab,
				highlight: review.id
			})
		);
		goto(`${nextUrl.pathname}${nextUrl.search}`);
	}

	function handlePendingReviewClick(pendingReview: PendingReviewRecord) {
		const nextUrl = new URL(
			buildReviewsUrl(new URL(window.location.href), {
				tab: 'pending',
				highlight: pendingReview.id
			})
		);
		goto(`${nextUrl.pathname}${nextUrl.search}`);
	}

	function handleViewAllReviews() {
		const nextUrl = new URL(
			buildReviewsUrl(new URL(window.location.href), {
				tab: 'received'
			})
		);
		goto(`${nextUrl.pathname}${nextUrl.search}`);
	}

	async function ensureContractsLoaded() {
		if ($contractStore.isLoading || $contractStore.contracts.length > 0) {
			return;
		}

		try {
			await contractStore.loadContracts();
		} catch (loadError) {
			console.error('Failed to load contracts for profile reviews:', loadError);
		}
	}

	async function loadReviews() {
		reviewLoading = true;
		reviewError = null;

		try {
			currentUserPubkey = await getCurrentReviewerPubkey();
			const reviewFeed = await loadReviewFeed({
				reviewerPubkey: currentUserPubkey
			});
			receivedReviews = reviewFeed.received;
			givenReviews = reviewFeed.given;
		} catch (error) {
			reviewError = error instanceof Error ? error.message : 'Failed to load review data';
			receivedReviews = [];
			givenReviews = [];
		} finally {
			reviewLoading = false;
		}
	}

	// Initialize profile store
	onMount(() => {
		syncDismissedPendingSlotKeys();
		const handleStorage = () => {
			syncDismissedPendingSlotKeys();
		};

		window.addEventListener('storage', handleStorage);
		profileStore.init();
		void ensureContractsLoaded();
		void loadReviews().finally(() => {
			syncDismissedPendingSlotKeys();
		});

		return () => {
			window.removeEventListener('storage', handleStorage);
		};
	});

	// Cleanup on destroy
	onDestroy(() => {
		profileStore.destroy();
	});
</script>

<!-- Mismas dimensiones que Mi Panel -->
<div class="mx-auto h-full max-w-6xl px-2 py-6 md:px-0 md:py-0">
	<div class="mb-8">
		<h3 class="text-2xl font-bold mb-2">{$t('profile.page.title')}</h3>
		<p class="text-base-content/70 text-lg">{$t('profile.page.description')}</p>
	</div>
	<div class="bg-base-100 rounded-xl p-8 shadow-lg">
		<ProfileHeader />

		<ProfileStats
			stats={$profileStore.stats}
			serviceCountState={$profileStore.servicesLoading
				? 'loading'
				: $profileStore.servicesError
					? 'error'
					: 'ready'}
		/>
		<ProfileServicesSection />

		<ProfileReviewsSection
			stats={reviewStats}
			receivedReviews={receivedReviews}
			givenReviews={givenReviews}
			pendingReviews={pendingReviews}
			activeTab={activeReviewTab}
			isCurrentUser={true}
			isLoading={reviewLoading || $profileStore.isLoading}
			error={reviewError}
			onTabChange={handleReviewTabChange}
			onReviewClick={handleReviewClick}
			onPendingReviewClick={handlePendingReviewClick}
			onViewAll={handleViewAllReviews}
		/>

		<ProfileInfoSection {formatDate} />

		<ProfileSidebar {formatDate} />
	</div>
</div>
