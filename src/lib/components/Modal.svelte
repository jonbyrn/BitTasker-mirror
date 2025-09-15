<script lang="ts">
	/**
	 * Reusable Modal Component for BitTasker
	 *
	 * A customizable modal dialog that can be used throughout the application
	 * Handles its own body scroll locking/unlocking and accessibility
	 */
	import { t } from 'svelte-i18n';

	// Props
	const props = $props<{
		isOpen: boolean;
		title: string;
		onClose: () => void;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		isScrollable?: boolean;
		children?: import('svelte').Snippet;
		footer?: import('svelte').Snippet;
	}>();

	// Scroll lock management
	const disableBodyScroll = () => {
		document.body.classList.add('overflow-hidden');
	};

	const enableBodyScroll = () => {
		document.body.classList.remove('overflow-hidden');
	};

	// Handle modal state changes, including scroll locking
	$effect(() => {
		if (props.isOpen) {
			// Lock scroll when modal is open
			disableBodyScroll();
		} else {
			// Restore scrolling when modal is closed
			enableBodyScroll();
		}

		// Handle cleanup when component is unmounted
		return enableBodyScroll;
	});

	// Escape key handler
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && props.isOpen) {
			props.onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if props.isOpen}
	<!-- Modal Backdrop/Overlay -->
	<div
		class="fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ease-in-out"
		onclick={props.onClose}
		onkeydown={(e) => e.key === 'Escape' && props.onClose()}
		role="dialog"
		tabindex="-1"
		aria-modal="true"
	></div>

	<!-- Modal Container -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4 {props.isScrollable
			? 'overflow-y-auto'
			: ''}"
		onclick={(event) => event.stopPropagation()}
		onkeydown={(event) => event.stopPropagation()}
		role="presentation"
	>
		<!-- Modal Content -->
		<div
			class="card bg-base-100 w-full shadow-xl {props.size === 'sm'
				? 'max-w-sm'
				: props.size === 'lg'
					? 'max-w-2xl'
					: props.size === 'xl'
						? 'max-w-4xl'
						: 'max-w-md'}"
		>
			<!-- Modal Header -->
			<div class="card-body">
				<div class="mb-4 flex items-center justify-between">
					<h3 class="card-title">{props.title}</h3>
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

				<!-- Modal Content (Slot) -->
				{@render props.children?.()}

				<!-- Modal Footer (Optional) -->
				{#if props.footer?.()}
					<div class="card-actions mt-6 justify-end">
						{@render props.footer()}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
