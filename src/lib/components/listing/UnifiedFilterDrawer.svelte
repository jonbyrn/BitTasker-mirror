<script lang="ts">
	import Drawer from '$lib/components/Drawer.svelte';
	import { tick } from 'svelte';

	let {
		isOpen,
		title,
		onClose,
		onClear,
		onApply,
		clearLabel,
		applyLabel,
		activeFilterCount = 0,
		contentClass = 'px-2',
		actionsClass = 'mt-8 mb-20 flex justify-between mx-4',
		children
	} = $props<{
		isOpen: boolean;
		title: string;
		onClose: () => void;
		onClear: () => void;
		onApply: () => void;
		clearLabel: string;
		applyLabel: string;
		activeFilterCount?: number;
		contentClass?: string;
		actionsClass?: string;
		children?: import('svelte').Snippet;
	}>();

	let drawerElement: HTMLElement | null = null;

	// Focus management: move focus into drawer when it opens
	$effect(() => {
		if (isOpen) {
			tick().then(() => {
				if (drawerElement) {
					// Try to focus the first interactive element in the drawer
					const firstFocusable = drawerElement?.querySelector<HTMLElement>(
						'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
					);
					if (firstFocusable) {
						firstFocusable.focus();
					} else {
						drawerElement?.focus();
					}
				}
			});
		}
	});
</script>

<Drawer {isOpen} {title} {onClose} position="right" isScrollable={true}>
	<div class={contentClass} bind:this={drawerElement}>
		{@render children?.()}

		<div class="divider"></div>
		<div class={actionsClass}>
			<button class="btn btn-ghost btn-outline" onclick={onClear}>{clearLabel}</button>
			<button class="btn btn-primary" onclick={onApply}>
				{applyLabel}
				{#if activeFilterCount > 0}
					<div class="badge badge-secondary ml-2">{activeFilterCount}</div>
				{/if}
			</button>
		</div>
	</div>
</Drawer>
