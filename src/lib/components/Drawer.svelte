<script lang="ts">
	/**
	 * Reusable Drawer Component for BitTasker
	 *
	 * A customizable side drawer that can be used throughout the application
	 * Handles its own body scroll locking/unlocking and accessibility
	 */
	import { t } from 'svelte-i18n';

	// Props
	const props = $props<{
		isOpen: boolean;
		title?: string;
		onClose: () => void;
		position?: 'left' | 'right';
		isScrollable?: boolean;
		children?: import('svelte').Snippet;
		footer?: import('svelte').Snippet;
	}>();

	// Set defaults
	const position = props.position || 'right';

	// Scroll lock management
	const disableBodyScroll = () => {
		document.body.classList.add('overflow-hidden');
	};

	const enableBodyScroll = () => {
		document.body.classList.remove('overflow-hidden');
	};

	// Handle drawer state changes, including scroll locking
	$effect(() => {
		if (props.isOpen) {
			// Lock scroll when drawer is open
			disableBodyScroll();
		} else {
			// Restore scrolling when drawer is closed
			enableBodyScroll();
		}

		// Handle cleanup when component is unmounted
		return enableBodyScroll;
	});

	// Fixed width CSS class - 1/3 width on desktop, full width on mobile
	const drawerWidthClass = 'w-full sm:w-[60%]';

	// Get CSS classes for position transform
	function getPositionTransform(position: string) {
		if (!props.isOpen) {
			if (position === 'left') return 'translateX(-100%)';
			if (position === 'right') return 'translateX(100%)';
		} else {
			return 'translateX(0)';
		}
	}

	// Escape key handler
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && props.isOpen) {
			props.onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Drawer Overlay -->
<div
	class="fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ease-in-out"
	class:opacity-0={!props.isOpen}
	class:invisible={!props.isOpen}
	onclick={props.onClose}
	onkeydown={(e) => e.key === 'Escape' && props.onClose()}
	role="dialog"
	tabindex="-1"
	aria-modal="true"
></div>

<!-- Drawer Panel -->
<div
	class="bg-base-100 fixed top-0 {position === 'left'
		? 'left-0'
		: 'right-0'} z-50 h-full {drawerWidthClass} 
		{props.isScrollable ? 'overflow-y-auto' : 'overflow-auto'} 
		transform shadow-xl transition-transform duration-300"
	style="transform: {getPositionTransform(position)};"
>
	{#if props.isOpen}
		<!-- Header -->
		<div
			class="sticky top-0 z-10 flex items-center justify-between p-4 {props.title
				? 'bg-base-200'
				: ''}"
		>
			<h4 id="drawer-title" class="text-xl font-bold">
				{#if props.title}
					{props.title}
				{/if}
			</h4>
			<button
				class="btn btn-ghost btn-circle"
				onclick={props.onClose}
				aria-label={$t('common.components.drawer.close')}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					/>
				</svg>
			</button>
		</div>

		<!-- Content -->
		<div class="p-4 drawer-content">
			{@render props.children?.()}
		</div>

		<!-- Footer (Optional) -->
		{#if props?.footer?.()}
			<div class="bg-base-200 sticky bottom-0 border-t p-4">
				{@render props.footer?.()}
			</div>
		{/if}
	{/if}
</div>

<style>
	/* Add minimal bottom padding on mobile to account for bottom navigation bar */
	@media (max-width: 1024px) {
		.drawer-content {
			/* Minimal padding for bottom nav - components like BidForm handle their own spacing */
			padding-bottom: calc(0.25rem + var(--bottom-nav-height-safe, 64px));
		}
	}
</style>
