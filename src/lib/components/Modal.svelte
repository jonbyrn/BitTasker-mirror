<script lang="ts">
	/**
	 * Reusable Modal Component for BitTasker
	 *
	 * A customizable modal dialog that can be used throughout the application
	 * Handles its own body scroll locking/unlocking and accessibility
	 */
	import { t } from 'svelte-i18n';
	import { fade } from 'svelte/transition';
	import { appScrollContainer } from '$lib/stores/scrollContainer.store';

	// Props
	const props = $props<{
		isOpen: boolean;
		title: string;
		onClose: () => void;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		isScrollable?: boolean;
		/**
		 * When true (default), the modal will not cover the bottom navigation bar (mobile dock).
		 * It will instead reserve `bottomOffset` space at the bottom so the dock remains visible.
		 */
		respectBottomNav?: boolean;
		/**
		 * The CSS bottom offset to reserve when `respectBottomNav` is true.
		 * Defaults to the globally measured footer height.
		 */
		bottomOffset?: string;
		/**
		 * Maximum height for the modal card. Useful when modal is inside drawers or constrained containers.
		 * Defaults to 85vh.
		 */
		maxHeight?: string;
		/**
		 * When true, hides the default header (title and close button). Useful when providing custom header in children.
		 * Defaults to false.
		 */
		hideHeader?: boolean;
		/**
		 * When false, hides the close button in the header. Useful for modals that require user action.
		 * Defaults to true.
		 */
		showCloseButton?: boolean;
		children?: import('svelte').Snippet;
		footer?: import('svelte').Snippet;
	}>();

	let windowWidth = $state(0);
	let dialogEl = $state<HTMLDivElement | null>(null);

	const respectBottomNav = $derived(props.respectBottomNav ?? true);
	const bottomOffset = $derived(props.bottomOffset ?? 'var(--app-footer-height, 0px)');
	const effectiveBottomOffset = $derived(respectBottomNav ? bottomOffset : '0px');
	// On mobile (< 768px), use smaller max-height to ensure modal fits in viewport
	const maxHeight = $derived(
		props.maxHeight ?? (windowWidth < 768 ? '75vh' : windowWidth < 1024 ? '80vh' : '85vh')
	);
	const showCloseButton = $derived(props.showCloseButton ?? true);

	$effect(() => {
		if (typeof window !== 'undefined') {
			const handleResize = () => {
				windowWidth = window.innerWidth;
			};
			window.addEventListener('resize', handleResize);
			windowWidth = window.innerWidth;
			return () => window.removeEventListener('resize', handleResize);
		}
	});

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

	$effect(() => {
		if (!props.isOpen || typeof document === 'undefined') return;
		const previouslyFocused = document.activeElement as HTMLElement | null;
		queueMicrotask(() => dialogEl?.focus());
		return () => {
			previouslyFocused?.focus?.();
		};
	});

	// Handle modal state changes, including scroll locking
	$effect(() => {
		if (props.isOpen) {
			// Lock scroll when modal is open
			disableBodyScroll();
			lockAppScroll();
		} else {
			// Restore scrolling when modal is closed
			enableBodyScroll();
			unlockAppScroll();
		}

		// Handle cleanup when component is unmounted
		return () => {
			enableBodyScroll();
			unlockAppScroll();
		};
	});

	// Escape key handler
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && props.isOpen && showCloseButton) {
			props.onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if props.isOpen}
	<!-- Modal Backdrop/Overlay -->
	<div
		class="fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ease-in-out"
		style={`bottom: ${effectiveBottomOffset};`}
		onclick={showCloseButton ? props.onClose : undefined}
		role="presentation"
		aria-hidden="true"
	></div>

	<!-- Modal Container -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4 {props.isScrollable
			? 'overflow-y-auto'
			: ''}"
		style={`bottom: ${effectiveBottomOffset};`}
		onclick={(event) => event.stopPropagation()}
		onkeydown={(event) => event.stopPropagation()}
		role="presentation"
	>
		<!-- Modal Content -->
		<div
			class="card bg-base-100 flex w-full flex-col shadow-xl {props.size === 'sm'
				? 'max-w-sm'
				: props.size === 'lg'
					? 'max-w-2xl'
					: props.size === 'xl'
						? 'max-w-4xl'
						: 'max-w-md'}"
			style={`max-height: ${maxHeight};`}
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
			tabindex="-1"
			bind:this={dialogEl}
			transition:fade={{ duration: 200 }}
		>
			<!-- Modal Header -->
			<div
				class="card-body flex min-h-0 flex-col {props.isScrollable
					? 'overflow-y-auto'
					: 'overflow-hidden'}"
			>
				{#if !props.hideHeader}
					<div class="mb-4 flex items-center justify-between">
						<span id="modal-title" class="card-title">{props.title}</span>
						{#if showCloseButton}
							<button
								class="btn btn-circle btn-ghost btn-sm"
								onclick={props.onClose}
								aria-label={$t('common.components.modal.close')}
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
						{/if}
					</div>
				{:else if showCloseButton}
					<div class="mb-2 flex justify-end">
						<button
							class="btn btn-circle btn-ghost btn-sm"
							onclick={props.onClose}
							aria-label={$t('common.components.modal.close')}
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
				{/if}

				<!-- Modal Content (Slot) -->
				{@render props.children?.()}

				<!-- Modal Footer (Optional) -->
				{#if props.footer}
					<div class="card-actions mt-6 shrink-0 justify-end">
						{@render props.footer?.()}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
