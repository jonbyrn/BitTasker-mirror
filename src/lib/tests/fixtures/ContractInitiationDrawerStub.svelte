<script lang="ts">
	let {
		open = false,
		title = '',
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		canConfirm = true,
		isSubmitting = false,
		drawerTestId = 'contract-initiation-drawer',
		confirmTestId = 'contract-initiation-confirm',
		onConfirm = () => {},
		onClose = () => {},
		children
	} = $props<{
		open?: boolean;
		title?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		canConfirm?: boolean;
		isSubmitting?: boolean;
		drawerTestId?: string;
		confirmTestId?: string;
		onConfirm?: () => void;
		onClose?: () => void;
		children?: import('svelte').Snippet;
	}>();
</script>

{#if open}
	<div data-testid={drawerTestId}>
		<h2>{title}</h2>
		{@render children?.()}
		<button data-testid={confirmTestId} onclick={onConfirm} disabled={!canConfirm || isSubmitting}>
			{confirmLabel}
		</button>
		<button onclick={onClose} disabled={isSubmitting}>
			{cancelLabel}
		</button>
	</div>
{/if}
