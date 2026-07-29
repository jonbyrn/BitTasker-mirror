<script lang="ts">
	import { t } from 'svelte-i18n';
	import Icon from '~icons/mdi/lightning-bolt';

	let {
		onEnable,
		onDismiss,
		isEnabling = false
	}: {
		onEnable: () => void;
		onDismiss: () => void;
		isEnabling?: boolean;
	} = $props();
</script>

<div
	class="card bg-base-200 shadow-lg"
	role="region"
	aria-label={$t('wallet.gasless_enable.title')}
>
	<div class="card-body space-y-4">
		<div class="flex items-center gap-2">
			<Icon class="text-primary h-6 w-6" />
			<h3 class="card-title text-lg">{$t('wallet.gasless_enable.title')}</h3>
		</div>

		<p class="text-sm opacity-80">
			{$t('wallet.gasless_enable.description')}
		</p>

		<ul class="space-y-1 text-sm opacity-70" role="list">
			<li>✓ {$t('wallet.gasless_enable.benefit_1')}</li>
			<li>✓ {$t('wallet.gasless_enable.benefit_2')}</li>
			<li>✓ {$t('wallet.gasless_enable.benefit_3')}</li>
		</ul>

		<p class="text-xs opacity-50">
			{$t('wallet.gasless_enable.reversible')}
		</p>

		<div class="card-actions justify-end gap-2">
			<button class="btn btn-ghost btn-sm min-h-[44px]" onclick={onDismiss} disabled={isEnabling}>
				{$t('common.not_now')}
			</button>
			<button class="btn btn-primary btn-sm min-h-[44px]" onclick={onEnable} disabled={isEnabling}>
				{#if isEnabling}
					<span class="loading loading-spinner loading-xs" role="status" aria-hidden="true"></span>
				{/if}
				{$t('wallet.gasless_enable.enable')}
			</button>
		</div>
	</div>
</div>
