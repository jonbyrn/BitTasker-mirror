<script lang="ts">
	import { fly, scale } from 'svelte/transition';
	import { t } from 'svelte-i18n';
	import { walletStore } from '$lib/stores/wallet.store';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import type { Snippet } from 'svelte';

	interface Props {
		isOpen: boolean;
		// mode: 'receive' | 'send'; unused prop
		onClose: () => void;
		// onSuccess?: () => void; unused prop
		children?: Snippet;
		sheet?: boolean;
	}

	const props: Props = $props();

	// Focus trap management
	let modalElement = $state<HTMLElement | null>(null);
	let previousActiveElement: HTMLElement | null = null;

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

			// Focus modal after next frame to allow transition (avoids setTimeout inside $effect)
			const rafId = requestAnimationFrame(() => {
				if (modalElement) {
					modalElement.focus();
				}
			});

			return () => {
				cancelAnimationFrame(rafId);
				enableBodyScroll();
			};
		} else {
			// Restore scrolling when modal is closed
			enableBodyScroll();

			// Return focus to previous element
			if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
				previousActiveElement.focus();
			}
			return enableBodyScroll;
		}
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

	// Reset modal position when closed
	$effect(() => {
		if (!props.isOpen && modalElement) {
			modalElement.style.transform = '';
			modalElement.style.transition = '';
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if props.isOpen}
	<!-- Modal Backdrop -->
	<div
		class="fixed inset-0 z-99 bg-black/80 backdrop-blur-sm transition-opacity duration-300 lg:bg-black/50 lg:backdrop-blur"
		onclick={handleBackdropClick}
		role="presentation"
		transition:fly={{ y: prefersReducedMotion ? 0 : 20, duration: prefersReducedMotion ? 0 : 300 }}
	></div>

	<!-- Modal Container -->
	<div
		class="pointer-events-none fixed inset-0 z-100 flex justify-center {props.sheet
			? 'items-end'
			: 'items-center lg:p-4'}"
		role="presentation"
	>
		<!-- Modal Content -->
		<div
			bind:this={modalElement}
			class="bg-base-100 pointer-events-auto isolate flex w-full touch-manipulation flex-col overflow-hidden shadow-2xl {props.sheet
				? 'relative max-h-[92vh] max-w-md rounded-t-3xl'
				: 'fixed inset-0 h-full rounded-none lg:relative lg:max-h-[90vh] lg:w-[90%] lg:max-w-4xl lg:rounded-2xl'}"
			data-testid={props.sheet ? 'wallet-sheet' : undefined}
			style="will-change: transform; transform: translateZ(0);"
			role="dialog"
			aria-modal="true"
			aria-labelledby="wallet-modal-title"
			tabindex="-1"
			onkeydown={handleTabKey}
			onclick={(e) => e.stopPropagation()}
			transition:scale={{ duration: prefersReducedMotion ? 0 : 300, start: 0.95 }}
		>
			<!-- Content Area -->
			<div
				class="wallet-modal-content flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto p-3 sm:space-y-6 sm:p-4 lg:p-6"
			>
				{#if props.sheet}
					<div class="flex items-center justify-between">
						<span class="bg-base-300 h-1.5 w-10 rounded-full" aria-hidden="true"></span>
						<button
							type="button"
							class="btn btn-ghost min-h-12"
							data-testid="wallet-sheet-close"
							onclick={() => props.onClose()}
						>
							{$t('common.close')}
						</button>
					</div>
				{/if}
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
						<span>{$walletStore.error || $t('wallet.error.initialization_failed')}</span>
						<button class="btn btn-sm" type="button" onclick={() => window.location.reload()}>
							{$t('wallet.error.reload')}
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

<style>
	/*
	 * Safe area padding with SystemBars fallback pattern.
	 * Uses CSS variable injection from Capacitor SystemBars plugin
	 * for Android WebView < 140 where env() returns 0px.
	 */
	.wallet-modal-content {
		padding-top: max(0.75rem, var(--safe-area-inset-top, env(safe-area-inset-top, 0px)));
		padding-bottom: max(0.75rem, var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
	}
</style>
