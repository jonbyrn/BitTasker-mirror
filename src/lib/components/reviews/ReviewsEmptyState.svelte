<script lang="ts">
	import { t } from 'svelte-i18n';

	/** Single star path (viewBox 0 0 24 24) - outline style for empty state. */
	const STAR_PATH =
		'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';

	let { showHint = true } = $props<{ showHint?: boolean }>();
</script>

<div
	class="flex flex-col items-center justify-center rounded-xl bg-base-200/50 px-4 py-8 sm:px-6 sm:py-10 text-center min-w-0 w-full max-w-full"
	role="status"
>
	<!-- Five outline stars: "reviews will go here" -->
	<div class="flex items-center justify-center gap-0.5 sm:gap-1 text-base-content/40" aria-hidden="true">
		{#each Array(5) as _}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5 sm:h-6 sm:w-6 shrink-0"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				viewBox="0 0 24 24"
			>
				<path d={STAR_PATH} />
			</svg>
		{/each}
	</div>
	<p class="mt-3 text-sm font-medium text-base-content/80">
		{$t('reviews.list.no_reviews')}
	</p>
	{#if showHint}
		<p class="mt-1 max-w-xs text-xs text-base-content/50">
			{$t('reviews.list.no_reviews_hint')}
		</p>
	{/if}
</div>
