<script lang="ts">
	import { t } from 'svelte-i18n';

	let {
		show = false,
		walletName = '',
		walletAddress = '',
		onCancel = () => {},
		onConfirm = () => {}
	}: {
		show?: boolean;
		walletName?: string;
		walletAddress?: string;
		onCancel?: () => void;
		onConfirm?: () => void;
	} = $props();
</script>

{#if show}
	<dialog
		class="modal modal-open"
		onclick={onCancel}
		onkeydown={(e: KeyboardEvent) => {
			if (e.key === 'Escape') onCancel();
		}}
	>
		<div
			class="modal-box max-w-sm"
			onclick={(e: Event) => e.stopPropagation()}
			onkeydown={(e: KeyboardEvent) => e.stopPropagation()}
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="disconnect-dialog-title"
			tabindex={-1}
		>
			<h3 id="disconnect-dialog-title" class="mb-2 text-lg font-bold">
				{$t('wallet.connected.disconnect_title')}
			</h3>
			{#if walletName}
				<p class="mb-2 text-sm opacity-70">
					{walletName} · {walletAddress.slice(0, 10)}...
				</p>
			{/if}
			<p class="mb-4 text-sm">{$t('wallet.connected.disconnect_msg')}</p>
			<div class="flex justify-end gap-2">
				<button class="btn btn-ghost btn-sm min-h-[44px]" onclick={onCancel}
					>{$t('common.cancel')}</button
				>
				<button class="btn btn-error btn-sm min-h-[44px]" onclick={onConfirm}
					>{$t('wallet.connected.remove')}</button
				>
			</div>
		</div>
		<form method="dialog" class="modal-backdrop">
			<button>{$t('wallet.connected.close')}</button>
		</form>
	</dialog>
{/if}
