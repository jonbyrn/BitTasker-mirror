<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from 'svelte-i18n';

	let {
		isOpen = false,
		title = '',
		message = '',
		confirmText = $t('common.components.confirm_modal.confirm'),
		cancelText = $t('common.components.confirm_modal.cancel'),
		confirmButtonClass = 'btn-error',
		modalBoxClass = 'max-w-md',
		onConfirm,
		onCancel,
		onBackdrop,
		children
	} = $props<{
		isOpen?: boolean;
		title?: string;
		message?: string;
		confirmText?: string;
		cancelText?: string;
		confirmButtonClass?: string;
		/** Daisy/Tailwind classes for `.modal-box` (e.g. `max-w-lg` when showing extra content). */
		modalBoxClass?: string;
		onConfirm?: () => void;
		onCancel?: () => void;
		/** Backdrop click. Defaults to cancel. Logout uses this to confirm. */
		onBackdrop?: () => void;
		/** Optional body below the message (e.g. resolution split preview). */
		children?: Snippet;
	}>();
</script>

{#if isOpen}
	<div class="modal modal-open">
		<div class="modal-box {modalBoxClass}">
			<h3 class="text-lg font-bold">{title}</h3>
			<p class="py-4">{message}</p>
			{#if children}
				<div class="mb-4 min-w-0">
					{@render children?.()}
				</div>
			{/if}
			<div class="modal-action">
				<button class="btn btn-ghost" onclick={onCancel}>
					{cancelText}
				</button>
				<button class="btn {confirmButtonClass}" onclick={onConfirm}>
					{confirmText}
				</button>
			</div>
		</div>
		<button class="modal-backdrop" onclick={onBackdrop ?? onCancel} aria-label="Close modal"></button>
	</div>
{/if}
