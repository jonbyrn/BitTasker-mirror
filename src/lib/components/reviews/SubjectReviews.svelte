<script lang="ts">
	import { t } from 'svelte-i18n';
	import VerifiedReviewCard from '$lib/components/reviews/VerifiedReviewCard.svelte';
	import { plainReviewsForSubjects } from '$lib/utils/reviews/plain-reviews';
	import type { AttestedReview } from '$lib/types/review';

	let { subjectIds = [] }: { subjectIds?: string[] } = $props();

	let reviews = $state<AttestedReview[]>([]);
	let loading = $state(true);

	const subjectKey = $derived(subjectIds.filter(Boolean).join('|'));

	$effect(() => {
		const ids = subjectKey ? subjectKey.split('|') : [];
		let cancelled = false;
		loading = true;
		plainReviewsForSubjects(ids)
			.then((found) => {
				if (!cancelled) reviews = found;
			})
			.catch(() => {
				if (!cancelled) reviews = [];
			})
			.finally(() => {
				if (!cancelled) loading = false;
			});
		return () => {
			cancelled = true;
		};
	});
</script>

<section class="border-base-300 mt-4 space-y-3 rounded-lg border p-4" data-testid="subject-reviews">
	<h2 class="font-semibold">{$t('reviews.title', { default: 'Reviews' })}</h2>
	{#if loading}
		<p class="text-base-content/60 text-sm">
			{$t('reviews.loading', { default: 'Loading reviews' })}
		</p>
	{:else if reviews.length === 0}
		<p class="text-base-content/60 text-sm">
			{$t('reviews.empty', { default: 'No reviews yet.' })}
		</p>
	{:else}
		<div class="flex flex-col gap-3">
			{#each reviews as review (review.reviewEventId)}
				<VerifiedReviewCard {review} showVerificationBadge={false} />
			{/each}
		</div>
	{/if}
</section>
