<script lang="ts">
	import { slide } from 'svelte/transition';
	import { linear } from 'svelte/easing';
	import type { Snippet } from 'svelte';

	/**
	 * Reusable collapsible section with header button and slide animation.
	 * Matches the "YOUR OFFER" / "Original Bid Proposal" pattern from bids and contracts.
	 */
	let {
		title,
		expanded = $bindable(false),
		children,
		headerClass = '',
		contentClass = ''
	} = $props<{
		title: string;
		expanded?: boolean;
		children: Snippet;
		headerClass?: string;
		contentClass?: string;
	}>();

	function toggle() {
		expanded = !expanded;
	}
</script>

<div class="bg-transparent">
	<button
		class="flex w-full cursor-pointer items-center justify-between gap-2 px-0 py-2 text-sm font-medium {headerClass}"
		onclick={toggle}
		aria-expanded={expanded}
		aria-controls="collapsible-content"
	>
		<span class="text-base-content/70 text-xs font-semibold tracking-wide uppercase">{title}</span>
		<svg
			class="h-4 w-4 shrink-0 transition-transform duration-200 {expanded
				? 'rotate-180'
				: 'rotate-0'}"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>
	{#if expanded}
		<div
			id="collapsible-content"
			class="px-0 pb-0 {contentClass}"
			in:slide={{ duration: 200, easing: linear }}
			out:slide={{ duration: 200, easing: linear }}
		>
			{@render children?.()}
		</div>
	{/if}
</div>
