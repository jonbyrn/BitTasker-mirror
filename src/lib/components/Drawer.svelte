<script lang="ts">
	/**
	 * Reusable Drawer Component for BitTasker
	 *
	 * A customizable side drawer that can be used throughout the application
	 * Handles its own body scroll locking/unlocking and accessibility
	 */
	import { t } from 'svelte-i18n';
	import { appScrollContainer } from '$lib/stores/scrollContainer.store';
	import { keyboardVisible } from '$lib/utils/helpers/keyboard';
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
		/**
		 * When true, the drawer will not allow closing via overlay click or header button.
		 * This is useful when the drawer is in a submitting state.
		 */
		isSubmitting?: boolean;
		children?: import('svelte').Snippet;
		footer?: import('svelte').Snippet;
	}>();

	// Set defaults
	const position = $derived(props.position || 'right');
	const respectBottomNav = $derived(props.respectBottomNav ?? true);
	const bottomOffset = $derived(props.bottomOffset ?? 'var(--app-footer-height, 0px)');
	// When keyboard is visible, always extend drawer to bottom (0px offset)
	// Otherwise respect the bottom nav setting
	const effectiveBottomOffset = $derived(
		$keyboardVisible ? '0px' : respectBottomNav ? bottomOffset : '0px'
	);

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
	// A passkey popup blurs the page and the browser then clicks whatever is
	// underneath. Ignore that click so the drawer stays open and can show the error.
	let suppressOverlayCloseUntil = 0;

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
	// Uses stopImmediatePropagation to prevent nested drawers from both closing
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && props.isOpen && !props.isSubmitting) {
			e.stopImmediatePropagation();
			props.onClose();
		}
	}
</script>

<svelte:window
	onkeydown={handleKeydown}
	onblur={() => {
		if (props.isOpen) suppressOverlayCloseUntil = Date.now() + 1200;
	}}
/>

<!-- Drawer Overlay -->
<!-- Uses stopPropagation to prevent nested drawer overlays from interfering -->
<div
	class="fixed inset-0 z-60 bg-black/50 transition-opacity duration-300 ease-in-out"
	style={`bottom: ${effectiveBottomOffset};`}
	class:opacity-0={!visualOpenState}
	class:pointer-events-none={!visualOpenState || !props.isOpen}
	class:invisible={!props.isOpen && !visualOpenState}
	onclick={(e) => {
		if (Date.now() < suppressOverlayCloseUntil) {
			e.stopPropagation();
			return;
		}
		if (!props.isSubmitting) {
			e.stopPropagation();
			props.onClose();
		}
	}}
	role="presentation"
	aria-hidden="true"
></div>

<!-- Drawer Panel -->
<div
	bind:this={drawerPanelRef}
	class="bg-base-100 fixed top-0 {position === 'left'
		? 'left-0'
		: 'right-0'} z-70 {drawerWidthClass} 
		flex transform flex-col
		overflow-hidden shadow-xl transition-transform duration-300 ease-in-out"
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
		<div class="bg-base-200 flex flex-none items-center justify-between p-4 shadow-sm">
			<h4 id="drawer-title" class="min-w-0 flex-1 truncate pr-2 text-xl font-bold">
				{#if props.title}
					{props.title}
				{/if}
			</h4>
			<button
				class="btn btn-ghost btn-circle shrink-0"
				onclick={(e) => {
					if (!props.isSubmitting) {
						e.stopPropagation();
						props.onClose();
					}
				}}
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
		<div
			class="drawer-scroll-area flex-1 {props.isScrollable
				? 'overflow-y-auto'
				: 'overflow-auto'} p-4"
		>
			{@render props.children?.()}
		</div>

		<!-- Footer (Optional) -->
		{#if props.footer}
			<div class="drawer-footer bg-base-200 flex-none border-t p-4">
				{@render props.footer?.()}
			</div>
		{/if}
	{/if}
</div>

<style>
	/*
	 * Keep content clear of device safe-area insets.
	 * If there's a footer, footer handles the bottom safe area.
	 * If no footer, content scroll area handles it.
	 *
	 * Uses SystemBars fallback pattern for Android WebView < 140.
	 */
	.drawer-scroll-area:last-child,
	.drawer-footer {
		padding-bottom: calc(1rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
	}
</style>
