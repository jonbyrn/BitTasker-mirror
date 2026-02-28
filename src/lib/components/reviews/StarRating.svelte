<script lang="ts">
	import { getStarClassForIndex } from '$lib/utils/review-display';

	/** Star path (viewBox 0 0 24 24) - single source for star icon. */
	const STAR_PATH =
		'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';

	let {
		value = 0,
		max = 5,
		size = 'sm' as 'xs' | 'sm' | 'md' | 'lg',
		showValue = false,
		unfilledClass = 'text-base-content/30',
		valueClass = 'text-base-content/60 ml-1',
		class: className = ''
	} = $props<{
		value?: number;
		max?: number;
		size?: 'xs' | 'sm' | 'md' | 'lg';
		showValue?: boolean;
		unfilledClass?: string;
		valueClass?: string;
		class?: string;
	}>();

	const sizeClasses: Record<string, string> = {
		xs: 'h-2 w-2',
		sm: 'h-3 w-3',
		md: 'h-4 w-4',
		lg: 'h-5 w-5'
	};
	const starClass = $derived(sizeClasses[size] ?? sizeClasses.sm);
	const rounded = $derived(Math.round(value));
</script>

<div class="flex items-center gap-1 {className}" role="img" aria-label="Rating: {value.toFixed(1)} out of {max}">
	{#each Array(max) as _, i}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="{starClass} {getStarClassForIndex(i + 1, value, unfilledClass)}"
			fill="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path d={STAR_PATH} />
		</svg>
	{/each}
	{#if showValue}
		<span class={valueClass}>{value.toFixed(1)}</span>
	{/if}
</div>
