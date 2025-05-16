<script lang="ts">
	/**
	 * Reusable Drawer Component for BitTasker
	 *
	 * A customizable side drawer that can be used throughout the application
	 * Handles its own body scroll locking/unlocking and accessibility
	 */

	// Props
	const props = $props<{
		isOpen: boolean;
		title?: string;
		onClose: () => void;
		position?: 'left' | 'right';
		width?: 'sm' | 'md' | 'lg' | 'full' | string;
		isScrollable?: boolean;
		children?: import('svelte').Snippet;
		footer?: import('svelte').Snippet;
	}>();

	// Set defaults
	const position = props.position || 'right';
	const width = props.width || 'md';

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

	// Get CSS classes for width
	function getWidthClass(width: string): string {
		if (width.split('').includes('%')) {
			return `w-[${width}] sm:w-[400px]`;
		}

		switch (width) {
			case 'sm':
				return 'w-full sm:w-[400px]';
			case 'md':
				return 'w-full sm:w-[70%]';
			case 'lg':
				return 'w-full sm:w-[85%]';
			case 'full':
				return 'w-full';
			default:
				return 'w-full sm:w-[70%]';
		}
	}

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
		: 'right-0'} z-50 h-full {getWidthClass(width)} 
		{props.isScrollable ? 'overflow-y-auto' : 'overflow-auto'} 
		transform shadow-xl transition-transform duration-300"
	style="transform: {getPositionTransform(position)};"
>
	<!-- Header -->
	<div
		class="sticky top-0 z-10 flex items-center justify-between p-4 {props.title
			? 'bg-base-200 border-b'
			: ''}"
	>
		<h2 id="drawer-title" class="text-xl font-bold">
			{#if props.title}
				{props.title}
			{/if}
		</h2>
		<button class="btn btn-ghost btn-circle" onclick={props.onClose} aria-label="Close drawer">
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
	<div class="p-4">
		{@render props.children?.()}
	</div>

	<!-- Footer (Optional) -->
	{#if props?.footer?.()}
		<div class="bg-base-200 sticky bottom-0 border-t p-4">
			{@render props.footer?.()}
		</div>
	{/if}
</div>
