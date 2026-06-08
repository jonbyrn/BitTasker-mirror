<script lang="ts">
	import type { AttestedReview } from '$lib/types/review';
	import { t } from 'svelte-i18n';
	import { createDebug } from '$lib/utils/debug';
	import { fetchKind0Event } from '$lib/nostr/profile/ndk';

	const d = createDebug('profile:ReviewCard');

	let { review }: { review: AttestedReview } = $props();

	let reviewerName = $state<string>('');
	let reviewerAvatar = $state<string>('');
	let isLoadingProfile = $state(true);
	let showFullComment = $state(false);

	function getRelativeDate(createdAt: number): string {
		const now = Date.now();
		const diffMs = now - createdAt * 1000;
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays >= 30) {
			const months = Math.floor(diffDays / 30);
			return $t('reviews.months_ago', { values: { count: months } });
		}
		if (diffDays >= 7) {
			const weeks = Math.floor(diffDays / 7);
			return $t('reviews.weeks_ago', { values: { count: weeks } });
		}
		if (diffDays >= 1) return $t('reviews.days_ago', { values: { count: diffDays } });
		return $t('reviews.today');
	}

	function getVerifiedBadge(): string {
		const revieweeRole = review.revieweeRole;
		if (revieweeRole === 'tasker') return $t('reviews.verified_task');
		if (revieweeRole === 'taskee') return $t('reviews.verified_service');
		return $t('reviews.verified');
	}

	$effect(() => {
		const pub = review.reviewerPubkey;
		if (!pub) return;
		let cancelled = false;
		isLoadingProfile = true;
		fetchKind0Event(pub)
			.then((event) => {
				if (cancelled) return;
				try {
					const raw = event?.content ? (JSON.parse(event.content) as Record<string, unknown>) : {};
					const name = (raw.display_name ?? raw.name ?? raw.displayName ?? raw.username) as
						| string
						| undefined;
					reviewerName = name || pub.slice(0, 8) + '...' + pub.slice(-4);
					const picture = raw.picture as string | undefined;
					if (
						picture &&
						typeof picture === 'string' &&
						(picture.startsWith('http://') || picture.startsWith('https://'))
					) {
						reviewerAvatar = picture;
					}
				} catch (err) {
					d.log('Failed to parse reviewer profile:', err);
					reviewerName = pub.slice(0, 8) + '...' + pub.slice(-4);
				}
				isLoadingProfile = false;
			})
			.catch((err) => {
				d.log('Failed to fetch reviewer profile:', err);
				if (!cancelled) {
					reviewerName = pub.slice(0, 8) + '...' + pub.slice(-4);
					isLoadingProfile = false;
				}
			});
		return () => {
			cancelled = true;
		};
	});
</script>

<div class="card card-compact bg-base-100 rounded-2xl shadow-sm" data-testid="review-card">
	<div class="card-body">
		<div class="flex items-start gap-3">
			{#if reviewerAvatar}
				<div class="avatar">
					<div class="w-10 rounded-full">
						<img src={reviewerAvatar} alt={reviewerName} loading="lazy" />
					</div>
				</div>
			{:else}
				<div
					class="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-full"
				>
					<span class="text-sm font-bold">
						{reviewerName ? reviewerName[0].toUpperCase() : '?'}
					</span>
				</div>
			{/if}

			<div class="flex-1">
				<div class="flex items-center justify-between">
					<span class="font-semibold">
						{#if isLoadingProfile}
							<span class="skeleton inline-block h-4 w-24"></span>
						{:else}
							{reviewerName}
						{/if}
					</span>
					<span class="text-base-content/60 text-xs">
						{getRelativeDate(review.createdAt)}
					</span>
				</div>

				<div
					class="flex items-center justify-between"
					aria-label="{$t('reviews.rating')}: {review.content.overallRating} {$t(
						'reviews.out_of'
					)} 5"
				>
					<div class="flex items-center gap-1">
						{#each Array(5) as _, i (i)}
							{#if i < Math.round(review.content.overallRating)}
								<span class="text-primary text-sm" aria-hidden="true">★</span>
							{:else}
								<span class="text-base-content/30 text-sm" aria-hidden="true">★</span>
							{/if}
						{/each}
						<span class="ml-1 text-sm">{review.content.overallRating.toFixed(1)}</span>
					</div>
					<span class="badge badge-outline badge-xs text-success border-success gap-0.5">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-3 w-3"
							viewBox="0 0 20 20"
							fill="currentColor"
						>
							<path
								fill-rule="evenodd"
								d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
								clip-rule="evenodd"
							/>
						</svg>
						{getVerifiedBadge()}
					</span>
				</div>

				{#if review.content.comment}
					<div class="relative mt-2">
						<div
							class="overflow-hidden transition-[max-height] duration-300 ease-out {showFullComment
								? 'max-h-[50rem]'
								: 'max-h-[4.5rem]'}"
						>
							<p class="text-base-content/80 text-sm whitespace-pre-line">
								{review.content.comment}
							</p>
							{#if !showFullComment}
								<div
									class="from-base-100 pointer-events-none absolute right-0 bottom-0 left-0 h-6 bg-gradient-to-t to-transparent"
								></div>
							{/if}
						</div>
						<button
							class="text-primary mt-1 text-xs font-semibold"
							onclick={() => (showFullComment = !showFullComment)}
						>
							{showFullComment ? $t('common.show_less') : $t('common.show_more')}
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
