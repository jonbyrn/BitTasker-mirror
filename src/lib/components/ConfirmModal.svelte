<script lang="ts">
	import { onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';

	let {
		isOpen = false,
		title = '',
		message = '',
		confirmText = $t('common.components.confirm_modal.confirm'),
		cancelText = $t('common.components.confirm_modal.cancel'),
		confirmButtonClass = 'btn-error',
		onConfirm,
		onCancel
	} = $props<{
		isOpen?: boolean;
		title?: string;
		message?: string;
		confirmText?: string;
		cancelText?: string;
		confirmButtonClass?: string;
		onConfirm?: () => void;
		onCancel?: () => void;
	}>();

	let isLoading = $state(false);

	const handleConfirm = () => {
		isLoading = true;
		onConfirm?.();
	};

	onDestroy(() => {
		isLoading = false;
	});
</script>

{#if isOpen}
	<div class="modal modal-open">
		<div class="modal-box max-w-md">
			<h3 class="text-lg font-bold">{title}</h3>
			<p class="py-4">{message}</p>
			<div class="modal-action">
				<button class="btn btn-ghost" onclick={onCancel}>
					{cancelText}
				</button>
				<button class="btn {confirmButtonClass}" onclick={handleConfirm}>
					{#if isLoading}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					{confirmText}
				</button>
			</div>
		</div>
		<button class="modal-backdrop" onclick={onCancel} aria-label="Close modal"></button>
	</div>
{/if}
