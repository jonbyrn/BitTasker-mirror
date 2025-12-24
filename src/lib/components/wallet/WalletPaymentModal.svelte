<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fly, scale } from 'svelte/transition';
	import { t } from 'svelte-i18n';
	import { Capacitor } from '@capacitor/core';
	import { walletStore } from '$lib/stores/wallet.store';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import type { Snippet } from 'svelte';

	interface Props {
		isOpen: boolean;
		mode: 'receive' | 'send';
		onClose: () => void;
		onSuccess?: () => void;
		children?: Snippet;
	}

	const props: Props = $props();

	// Focus trap management
	let modalElement = $state<HTMLElement | null>(null);
	let previousActiveElement: HTMLElement | null = null;

	// Swipe gesture state
	let touchStartY = $state(0);
	let touchStartTime = $state(0);
	let modalTranslateY = $state(0);
	let isDragging = $state(false);
	const SWIPE_THRESHOLD = 100; // pixels
	const SWIPE_THRESHOLD_PERCENT = 0.3; // 30% of screen height
	const isMobile = $derived(Capacitor.getPlatform() !== 'web');

	// Check for reduced motion preference
	const prefersReducedMotion = $derived(
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);

	// Scroll lock management
	const disableBodyScroll = () => {
		if (typeof document !== 'undefined') {
			document.body.style.overflow = 'hidden';
		}
	};

	const enableBodyScroll = () => {
		if (typeof document !== 'undefined') {
			document.body.style.overflow = '';
		}
	};

	// Handle modal state changes
	$effect(() => {
		if (props.isOpen) {
			// Store previous active element for focus return
			previousActiveElement = (document.activeElement as HTMLElement) || null;

			// Lock scroll when modal is open
			disableBodyScroll();

			// Focus modal after a short delay to allow transition
			setTimeout(() => {
				if (modalElement) {
					modalElement.focus();
				}
			}, 100);
		} else {
			// Restore scrolling when modal is closed
			enableBodyScroll();

			// Return focus to previous element
			if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
				previousActiveElement.focus();
			}
		}

		// Cleanup on unmount
		return enableBodyScroll;
	});

	// Escape key handler
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && props.isOpen) {
			props.onClose();
		}
	}

	// Focus trap: keep focus within modal
	function handleTabKey(e: KeyboardEvent) {
		if (!props.isOpen || e.key !== 'Tab') return;

		if (!modalElement) return;

		const focusableElements = modalElement.querySelectorAll(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
		);

		const firstElement = focusableElements[0] as HTMLElement;
		const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

		if (e.shiftKey) {
			// Shift + Tab
			if (document.activeElement === firstElement) {
				e.preventDefault();
				lastElement?.focus();
			}
		} else {
			// Tab
			if (document.activeElement === lastElement) {
				e.preventDefault();
				firstElement?.focus();
			}
		}
	}

	// Handle backdrop click
	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			triggerHaptic(ImpactStyle.Light);
			props.onClose();
		}
	}

	// Swipe gesture handlers
	function handleTouchStart(e: TouchEvent) {
		if (!isMobile || !modalElement) return;
		touchStartY = e.touches[0].clientY;
		touchStartTime = Date.now();
		isDragging = true;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!isMobile || !isDragging || !modalElement) return;

		const currentY = e.touches[0].clientY;
		const deltaY = currentY - touchStartY;

		// Only allow downward swipes
		if (deltaY > 0) {
			modalTranslateY = deltaY;
			// Apply transform to modal
			if (modalElement) {
				modalElement.style.transform = `translateY(${deltaY}px)`;
				modalElement.style.transition = 'none';
			}
		}
	}

	function handleTouchEnd(e: TouchEvent) {
		if (!isMobile || !isDragging || !modalElement) return;

		const currentY = e.changedTouches[0].clientY;
		const deltaY = currentY - touchStartY;
		const screenHeight = window.innerHeight;
		const threshold = Math.max(SWIPE_THRESHOLD, screenHeight * SWIPE_THRESHOLD_PERCENT);

		isDragging = false;

		// Reset transform
		if (modalElement) {
			modalElement.style.transition = '';
		}

		// Check if swipe threshold is met
		if (deltaY > threshold) {
			// Close modal with haptic feedback
			triggerHaptic(ImpactStyle.Medium);
			props.onClose();
		} else {
			// Snap back
			modalTranslateY = 0;
			if (modalElement) {
				modalElement.style.transform = '';
			}
		}
	}

	// Reset modal position when closed
	$effect(() => {
		if (!props.isOpen && modalElement) {
			modalTranslateY = 0;
			modalElement.style.transform = '';
			modalElement.style.transition = '';
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if props.isOpen}
	<!-- Modal Backdrop -->
	<div
		class="fixed inset-0 z-100 bg-black/80 lg:bg-black/50 backdrop-blur-sm lg:backdrop-blur transition-opacity duration-300"
		onclick={handleBackdropClick}
		role="presentation"
		transition:fly={{ y: prefersReducedMotion ? 0 : 20, duration: prefersReducedMotion ? 0 : 300 }}
	></div>

	<!-- Modal Container -->
	<div
		class="fixed inset-0 z-100 flex items-center justify-center lg:p-4"
		role="presentation"
		onclick={handleBackdropClick}
	>
		<!-- Modal Content -->
		<div
			bind:this={modalElement}
			class="fixed inset-0 lg:relative w-full h-full lg:w-[90%] lg:max-w-2xl lg:max-h-[90vh] rounded-none lg:rounded-2xl bg-base-100 shadow-2xl flex flex-col overflow-hidden touch-manipulation"
			style="will-change: transform; transform: translateZ(0);"
			role="dialog"
			aria-modal="true"
			aria-labelledby="wallet-modal-title"
			tabindex="-1"
			onkeydown={handleTabKey}
			ontouchstart={handleTouchStart}
			ontouchmove={handleTouchMove}
			ontouchend={handleTouchEnd}
			transition:scale={{ duration: prefersReducedMotion ? 0 : 300, start: 0.95 }}
		>

			<!-- Content Area -->
			<div
				class="flex-1 overflow-y-auto p-3 space-y-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:space-y-6 sm:p-4 lg:p-6"
			>
				<!-- Wallet Error States (only show errors, not initialization) -->
				{#if $walletStore.error}
					<div class="alert alert-error">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6 shrink-0 stroke-current"
							fill="none"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span>{$t('wallet.error.initialization_failed')}</span>
						<button class="btn btn-sm" onclick={() => window.location.reload()}>
							{$t('wallet.error.retry')}
						</button>
					</div>
				{:else if !$walletStore.isConnected && !$walletStore.isInitializing}
					<div class="alert alert-warning">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6 shrink-0 stroke-current"
							fill="none"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							/>
						</svg>
						<span>{$t('wallet.error.no_connection')}</span>
					</div>
				{/if}
				<!-- Modal Content (Slot) - Always show, initialization handled in child components -->
				{@render props.children?.()}
			</div>
		</div>
	</div>
{/if}

