<script lang="ts">
	import { t } from 'svelte-i18n';
	import VerifiedReviewCard from '$lib/components/reviews/VerifiedReviewCard.svelte';
	import { plainReviewsForSubjects } from '$lib/utils/reviews/plain-reviews';
	import type { AttestedReview } from '$lib/types/review';

	let { subjectIds = [] }: { subjectIds?: string[] } = $props();

	let reviews = $state<AttestedReview[]>([]);

	const subjectKey = $derived(subjectIds.filter(Boolean).join('|'));

	$effect(() => {
		const ids = subjectKey ? subjectKey.split('|') : [];
		let cancelled = false;
		let ignoreLate = false;
		const timeout = setTimeout(() => {
			ignoreLate = true;
		}, 2000);
		const start = setTimeout(() => {
			plainReviewsForSubjects(ids)
				.then((found) => {
					if (!cancelled && !ignoreLate) reviews = found;
				})
				.catch(() => {
					if (!cancelled) reviews = [];
				});
		}, 0);
		return () => {
			cancelled = true;
			clearTimeout(timeout);
			clearTimeout(start);
		};
	});
</script>

<section class="border-base-300 mt-4 space-y-3 rounded-lg border p-4" data-testid="subject-reviews">
	<h2 class="font-semibold">{$t('reviews.list_title', { default: 'Reviews' })}</h2>
	{#if reviews.length === 0}
		<p class="text-base-content/60 text-sm" data-testid="reviews-empty">
			{$t('reviews.list_empty', { default: 'No reviews yet.' })}
		</p>
	{:else}
		<div class="flex flex-col gap-3">
			{#each reviews as review (review.reviewEventId)}
				<VerifiedReviewCard {review} showVerificationBadge={false} />
			{/each}
		</div>
	{/if}
</section>
