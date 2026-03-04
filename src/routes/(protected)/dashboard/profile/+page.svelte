<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';
	import { profileStore } from '$lib/stores/profile.store';
	import { contractStore } from '$lib/stores/contract.store';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { getStatsForUser } from '$lib/utils/review-source';
	import { EscrowStatus } from '$lib/utils/escrow';
	import type { ReviewStats } from '$lib/types/review';
	import ProfileHeader from '$lib/components/profile/ProfileHeader.svelte';
	import ProfileStats from '$lib/components/profile/ProfileStats.svelte';
	import ProfileInfoSection from '$lib/components/profile/ProfileInfoSection.svelte';
	import ProfileSidebar from '$lib/components/profile/ProfileSidebar.svelte';
	import ProfileReviewsSection from '$lib/components/profile/ProfileReviewsSection.svelte';

	const COMPLETED_STATUSES = [
		EscrowStatus.Completed,
		EscrowStatus.FundsReleased,
		EscrowStatus.DisputeResolved
	];

	// Format date (passed to children)
	function formatDate(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
	}

	// Calculate years from date (passed to children)
	function yearsFrom(dateString: string) {
		const then = new Date(dateString);
		const now = new Date();
		return now.getFullYear() - then.getFullYear();
	}

	let reviewStats = $state<ReviewStats | null>(null);

	// Initialize profile store and load review stats so header stats match review section
	onMount(async () => {
		profileStore.init();
		try {
			const npub = await getNpub();
			if (npub) reviewStats = await getStatsForUser(npub);
		} catch {
			// ProfileStats falls back to profile store defaults
		}
	});

	// Merge profile store stats with review stats and completed contracts count (single source for rating and tasks)
	const mergedStats = $derived.by(() => {
		const base = $profileStore.stats;
		const completedCount = $contractStore.contracts.filter((c) =>
			COMPLETED_STATUSES.includes(c.status)
		).length;
		const rating =
			reviewStats?.averageRating != null && Number.isFinite(reviewStats.averageRating)
				? Math.round(reviewStats.averageRating * 10) / 10
				: base.rating;
		return {
			...base,
			rating,
			tasksCompleted: completedCount,
			responseRate: base.responseRate,
			onTimeRate: base.onTimeRate
		};
	});

	onDestroy(() => {
		profileStore.destroy();
	});
</script>

<div class="mx-auto h-full max-w-6xl px-2 py-6 md:px-0 md:py-0">
	<div class="mb-8">
		<h3 class="text-2xl font-bold mb-2">{$t('profile.page.title')}</h3>
		<p class="text-base-content/70 text-lg">{$t('profile.page.description')}</p>
	</div>
	<div class="bg-base-100 rounded-xl p-8 shadow-lg">
		<ProfileHeader />
		<ProfileStats stats={mergedStats} />

		<!-- Single page: overview and reviews in one scroll -->
		<div class="space-y-8 mt-8">
			<ProfileInfoSection {formatDate} {yearsFrom} />
			<ProfileReviewsSection isCurrentUser={true} />
			<ProfileSidebar {formatDate} />
		</div>
	</div>
</div>
