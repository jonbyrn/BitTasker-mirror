<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { t } from 'svelte-i18n';
	import { goto, afterNavigate } from '$app/navigation';
	import { findPendingReviews, PartialPendingReviewsError } from '$lib/utils/reviews/helpers';
	import { appStore } from '$lib/stores/app.store';
	import { createDebug } from '$lib/utils/debug';

	const d = createDebug('reviews:banner');

	let pendingCount = $state(0);
	let isVisible = $state(false);
	let hasInitialFetch = $state(false);

	async function fetchPending() {
		d.log('fetchPending: start');
		isVisible = false;
		try {
			const reviews = await findPendingReviews();
			pendingCount = reviews.length;
			d.log('fetchPending: success, count=%d', reviews.length);
		} catch (err) {
			if (err instanceof PartialPendingReviewsError) {
				pendingCount = err.partialResult.length;
				d.warn('fetchPending: partial, count=%d', err.partialResult.length);
			} else {
				pendingCount = 0;
				d.error('fetchPending: error=%s', err instanceof Error ? err.message : String(err));
			}
		}

		hasInitialFetch = true;
		d.log('fetchPending: pendingCount=%d', pendingCount);
		if (pendingCount > 0) {
			await tick();
			isVisible = true;
			d.log('fetchPending: banner visible');
		}
	}

	// Wait for auth to be ready before the initial fetch.
	// On full page refresh auth may still be initializing when the
	// component mounts — subscribe to the store and fire once npub is set.
	onMount(() => {
		d.log('onMount: subscribing to appStore');
		const unsub = appStore.subscribe((store) => {
			const npub = store.nostrKeys.npub;
			d.log('appStore update: npub=%s', npub ? npub.slice(0, 12) + '...' : 'null');
			if (npub) {
				d.log('appStore: auth ready, fetching');
				unsub();
				fetchPending();
			}
		});
		return unsub;
	});

	// Re-fetch after client-side navigations so the banner stays
	// current when the user reviews contracts and returns.
	// Skip the initial afterNavigate that fires on page refresh —
	// onMount + appStore.subscribe handles the initial fetch.
	afterNavigate(() => {
		if (!hasInitialFetch) return;
		d.log('afterNavigate: re-fetching');
		fetchPending();
	});

	function goToReviews() {
		goto('/reviews');
	}
</script>

{#if pendingCount > 0}
	<div
		class="mb-4 overflow-hidden transition-all duration-500 ease-out"
		class:translate-y-0={isVisible}
		class:opacity-100={isVisible}
		class:-translate-y-4={!isVisible}
		class:opacity-0={!isVisible}
	>
		<div class="alert alert-info flex items-center justify-between gap-3 shadow-sm">
			<div class="flex items-center gap-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
					/>
				</svg>
				<span class="text-sm font-medium">
					{$t(
						pendingCount === 1
							? 'reviews.pending.banner_count_one'
							: 'reviews.pending.banner_count_other',
						{ values: { count: pendingCount } }
					)}
				</span>
			</div>
			<button class="btn btn-primary btn-sm" onclick={goToReviews}>
				{$t('reviews.pending.review_now')}
			</button>
		</div>
	</div>
{/if}
