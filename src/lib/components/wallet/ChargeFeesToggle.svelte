<script lang="ts">
	import { t } from 'svelte-i18n';
	import IconCheck from '~icons/mdi/check';

	let {
		enabled,
		disabled = false,
		onToggle
	}: {
		enabled: boolean;
		disabled?: boolean;
		onToggle: () => void;
	} = $props();
</script>

{#if !disabled}
	<button
		type="button"
		class="btn border-primary h-auto min-h-0 w-full touch-manipulation items-center justify-center gap-2 rounded-lg border-2 px-3 py-2 text-sm transition-colors select-none {enabled
			? 'bg-primary text-primary-content hover:bg-primary/90'
			: 'btn-outline bg-base-100'}"
		onclick={onToggle}
	>
		<div
			class="flex h-4 w-4 items-center justify-center rounded border-2 {enabled
				? 'border-primary-content bg-primary-content'
				: 'border-base-content/30'}"
		>
			{#if enabled}
				<IconCheck class="text-primary h-3.5 w-3.5 [&>*]:fill-current [&>*]:stroke-current" />
			{/if}
		</div>
		<span class="label-text">{$t('wallet.receive.charge_fees_to_payer')}</span>
	</button>
{:else}
	<button
		type="button"
		class="btn btn-outline border-primary h-auto min-h-0 w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border-2 px-3 py-2 text-sm opacity-50"
		disabled
	>
		<div
			class="border-base-content/30 flex h-4 w-4 items-center justify-center rounded border-2"
		></div>
		<span class="label-text">{$t('wallet.receive.charge_fees_to_payer')}</span>
	</button>
{/if}
