<script lang="ts">
	/**
	 * Reusable Drawer Component for BitTasker
	 *
	 * A customizable side drawer that can be used throughout the application
	 * Handles its own body scroll locking/unlocking and accessibility
	 */
	import { t } from 'svelte-i18n';
	import { appScrollContainer } from '$lib/stores/scrollContainer.store';
	import { onMount, tick } from 'svelte';
	import { browser } from '$app/environment';

	// Props
	const props = $props<{
		isOpen: boolean;
		title?: string;
		onClose: () => void;
		position?: 'left' | 'right';
		isScrollable?: boolean;
		/**
		 * When true (default), the drawer will not cover the bottom navigation bar (mobile dock).
		 * It will instead reserve `bottomOffset` space at the bottom so the dock remains visible.
		 */
		respectBottomNav?: boolean;
		/**
		 * The CSS bottom offset to reserve when `respectBottomNav` is true.
		 * Defaults to the globally measured footer height.
		 */
		bottomOffset?: string;
		children?: import('svelte').Snippet;
		footer?: import('svelte').Snippet;
	}>();

	// Set defaults
	const position = props.position || 'right';
	const respectBottomNav = props.respectBottomNav ?? true;
	const bottomOffset = props.bottomOffset ?? 'var(--app-footer-height, 0px)';
	const effectiveBottomOffset = $derived(respectBottomNav ? bottomOffset : '0px');

	// Scroll lock management
	const disableBodyScroll = () => {
		document.body.classList.add('overflow-hidden');
	};

	const enableBodyScroll = () => {
		document.body.classList.remove('overflow-hidden');
	};

	function lockAppScroll() {
		const el = $appScrollContainer;
		if (!el) return;
		const count = Number(el.dataset.lockCount ?? '0');
		if (count === 0) {
			el.dataset.prevOverflowY = el.style.overflowY || '';
			el.style.overflowY = 'hidden';
		}
		el.dataset.lockCount = String(count + 1);
	}

	function unlockAppScroll() {
		const el = $appScrollContainer;
		if (!el) return;
		const count = Number(el.dataset.lockCount ?? '0');
		const next = Math.max(0, count - 1);
		el.dataset.lockCount = String(next);
		if (next === 0) {
			el.style.overflowY = el.dataset.prevOverflowY ?? '';
			delete el.dataset.prevOverflowY;
			delete el.dataset.lockCount;
		}
	}

	// Handle drawer state changes, including scroll locking
	$effect(() => {
		if (props.isOpen) {
			// Lock scroll when drawer is open
			disableBodyScroll();
			lockAppScroll();
		} else {
			// Restore scrolling when drawer is closed
			enableBodyScroll();
			unlockAppScroll();
		}

		// Handle cleanup when component is unmounted
		return () => {
			enableBodyScroll();
			unlockAppScroll();
		};
	});

	// Fixed width CSS class - 1/3 width on desktop, full width on mobile
	const drawerWidthClass = 'w-full sm:w-[60%]';

	// Track if component has mounted to ensure proper initial state
	let isMounted = $state(false);
	let drawerPanelRef: HTMLDivElement | null = $state(null);

	// Track the visual open state (ensures animation on first open)
	// Start as false to ensure drawer always starts closed visually
	let visualOpenState = $state(false);

	// Ensure drawer starts closed, then sync with props after mount
	onMount(async () => {
		// Ensure drawer starts visually closed
		visualOpenState = false;

		// Wait for DOM to be ready and browser to paint initial closed state
		await tick();
		await new Promise((resolve) => requestAnimationFrame(resolve));

		// Now sync with actual prop state and mark as mounted
		// This will trigger animation if props.isOpen is true
		visualOpenState = props.isOpen;
		isMounted = true;
	});

	// Sync visual state with props after mount (for subsequent opens/closes)
	$effect(() => {
		if (!isMounted || !browser) return;

		// Track props.isOpen to react to changes
		const shouldBeOpen = props.isOpen;

		// Only update if state actually changed
		if (visualOpenState !== shouldBeOpen) {
			// Force a reflow to ensure browser sees the state change and applies transition
			if (drawerPanelRef) {
				void drawerPanelRef.offsetHeight;
			}
			visualOpenState = shouldBeOpen;
		}
	});

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
	class="fixed inset-0 z-60 touch-none bg-black/50 transition-opacity duration-300 ease-in-out"
	style={`bottom: ${effectiveBottomOffset};`}
	class:opacity-0={!visualOpenState}
	class:pointer-events-none={!visualOpenState || !props.isOpen}
	class:invisible={!props.isOpen && !visualOpenState}
	onclick={props.onClose}
	role="presentation"
	aria-hidden="true"
></div>

<!-- Drawer Panel -->
<div
	bind:this={drawerPanelRef}
	class="bg-base-100 fixed top-0 pt-safe {position === 'left'
		? 'left-0'
		: 'right-0'} z-70 {drawerWidthClass}
		{props.isScrollable ? 'overflow-y-auto' : 'overflow-auto'}
		transform shadow-xl transition-transform duration-300 ease-in-out"
	class:translate-x-0={visualOpenState}
	class:-translate-x-full={!visualOpenState && position === 'left'}
	class:translate-x-full={!visualOpenState && position === 'right'}
	style={`bottom: ${effectiveBottomOffset};`}
	role="dialog"
	aria-modal="true"
	aria-labelledby="drawer-title"
	tabindex="-1"
>
	{#if props.isOpen}
		<!-- Header -->
		<div class="bg-base-200 sticky top-0 z-10 flex items-center justify-between p-4">
			<h4 id="drawer-title" class="min-w-0 flex-1 truncate pr-2 text-xl font-bold">
				{#if props.title}
					{props.title}
				{/if}
			</h4>
			<button
				class="btn btn-ghost btn-circle shrink-0"
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
		<div class="drawer-content p-4">
			{@render props.children?.()}
		</div>

		<!-- Footer (Optional) -->
		{#if props.footer}
			<div class="bg-base-200 sticky bottom-0 border-t p-4">
				{@render props.footer?.()}
			</div>
		{/if}
	{/if}
</div>

<style>
	/* Keep content clear of device safe-area insets (not the dock). */
	.drawer-content {
		/* Breathing room at bottom for all drawers + safe-area inset */
		padding-bottom: calc(1rem + env(safe-area-inset-bottom, constant(safe-area-inset-bottom, 0)));
	}
</style>
