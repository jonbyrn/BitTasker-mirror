<script lang="ts">
	import { t } from 'svelte-i18n';
	import Drawer from '$lib/components/Drawer.svelte';

	let {
		open = false,
		title = '',
		subtitle = '',
		confirmLabel = '',
		cancelLabel = '',
		canConfirm = true,
		isSubmitting = false,
		errorMessage = '',
		errorHint = '',
		warningMessage = '',
		warningHint = '',
		hideFooter = false,
		allowCloseWhileSubmitting = false,
		drawerTestId = 'contract-initiation-drawer',
		confirmTestId = 'contract-initiation-confirm',
		retryTestId = 'contract-initiation-retry',
		errorTestId = 'contract-initiation-error',
		errorHintTestId = 'contract-initiation-error-hint',
		warningTestId = 'contract-initiation-warning',
		warningHintTestId = 'contract-initiation-warning-hint',
		onConfirm = () => {},
		onRetry = () => {},
		onClose = () => {},
		children: content
	} = $props<{
		open?: boolean;
		title?: string;
		subtitle?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		canConfirm?: boolean;
		isSubmitting?: boolean;
		errorMessage?: string;
		errorHint?: string;
		warningMessage?: string;
		warningHint?: string;
		hideFooter?: boolean;
		allowCloseWhileSubmitting?: boolean;
		drawerTestId?: string;
		confirmTestId?: string;
		retryTestId?: string;
		errorTestId?: string;
		errorHintTestId?: string;
		warningTestId?: string;
		warningHintTestId?: string;
		onConfirm?: () => void;
		onRetry?: () => void;
		onClose?: () => void;
		children?: import('svelte').Snippet;
	}>();

	const resolvedConfirmLabel = $derived(
		confirmLabel || ($t('common.components.confirm_modal.confirm') as string) || 'Confirm'
	);
	const resolvedCancelLabel = $derived(cancelLabel || ($t('common.cancel') as string) || 'Cancel');
	const showRetry = $derived(Boolean(errorMessage?.trim()) && !isSubmitting);

	function handleClose() {
		if (isSubmitting && !allowCloseWhileSubmitting) {
			return;
		}

		onClose();
	}
</script>

<Drawer isOpen={open} {title} onClose={handleClose} position="right" isScrollable={true}>
	<div class="space-y-4" data-testid={drawerTestId}>
		{#if subtitle}
			<p class="text-base-content/70 text-sm">
				{subtitle}
			</p>
		{/if}

		{@render content?.()}

		{#if errorMessage}
			<div
				class="alert alert-error alert-outline"
				data-testid={errorTestId}
				role="alert"
				aria-live="assertive"
			>
				<div class="space-y-1">
					<p>{errorMessage}</p>
					{#if errorHint}
						<p class="text-xs opacity-80" data-testid={errorHintTestId}>
							{errorHint}
						</p>
					{/if}
				</div>
			</div>
		{:else if warningMessage}
			<div
				class="alert alert-warning alert-outline"
				data-testid={warningTestId}
				role="alert"
				aria-live="polite"
			>
				<div class="space-y-1">
					<p>{warningMessage}</p>
					{#if warningHint}
						<p class="text-xs opacity-80" data-testid={warningHintTestId}>
							{warningHint}
						</p>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		{#if !hideFooter}
			<div class="flex flex-col gap-3 sm:flex-row sm:justify-end">
				<button class="btn btn-ghost" onclick={handleClose} disabled={isSubmitting}>
					{resolvedCancelLabel}
				</button>
				{#if showRetry}
					<button class="btn btn-outline" onclick={onRetry} data-testid={retryTestId}>
						{$t('common.buttons.retry') || 'Retry'}
					</button>
				{/if}
				<button
					class="btn btn-primary"
					onclick={onConfirm}
					disabled={isSubmitting || !canConfirm}
					data-testid={confirmTestId}
				>
					{#if isSubmitting}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					{resolvedConfirmLabel}
				</button>
			</div>
		{/if}
	{/snippet}
</Drawer>
