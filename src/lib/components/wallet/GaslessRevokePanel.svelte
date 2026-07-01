<script lang="ts">
	import { t } from 'svelte-i18n';
	import Icon from '~icons/mdi/shield-check';
	import IconOff from '~icons/mdi/shield-off';

	let {
		isDelegated,
		delegateAddress,
		isRevoking = false,
		onRevoke,
		onReEnable
	}: {
		isDelegated: boolean;
		delegateAddress: string | null;
		isRevoking?: boolean;
		onRevoke: () => void;
		onReEnable: () => void;
	} = $props();

	let showConfirm = $state(false);
</script>

<div
	class="card bg-base-200"
	role="region"
	aria-label={isDelegated
		? $t('wallet.gasless_revoke.active_title')
		: $t('wallet.gasless_revoke.inactive_title')}
>
	<div class="card-body space-y-3">
		<div class="flex items-center gap-2">
			{#if isDelegated}
				<Icon class="text-success h-5 w-5" />
				<h3 class="card-title text-base">{$t('wallet.gasless_revoke.active_title')}</h3>
			{:else}
				<IconOff class="text-base-content/50 h-5 w-5" />
				<h3 class="card-title text-base">{$t('wallet.gasless_revoke.inactive_title')}</h3>
			{/if}
		</div>

		{#if isDelegated && delegateAddress}
			<p class="text-sm opacity-70">
				{$t('wallet.gasless_revoke.delegated_to')}:
				<code class="text-xs">{delegateAddress.slice(0, 10)}...{delegateAddress.slice(-6)}</code>
			</p>
		{/if}

		{#if isDelegated}
			{#if !showConfirm}
				<button
					class="btn btn-warning btn-sm btn-outline min-h-[44px]"
					onclick={() => (showConfirm = true)}
				>
					{$t('wallet.gasless_revoke.revoke')}
				</button>
			{:else}
				<div class="space-y-2" role="alert" aria-live="polite">
					<p class="text-warning text-sm">{$t('wallet.gasless_revoke.confirm_message')}</p>
					<div class="flex gap-2">
						<button class="btn btn-ghost btn-sm min-h-[44px]" onclick={() => (showConfirm = false)}>
							{$t('common.cancel')}
						</button>
						<button
							class="btn btn-warning btn-sm min-h-[44px]"
							onclick={onRevoke}
							disabled={isRevoking}
						>
							{#if isRevoking}
								<span class="loading loading-spinner loading-xs" role="status" aria-hidden="true"
								></span>
							{/if}
							{$t('wallet.gasless_revoke.confirm')}
						</button>
					</div>
				</div>
			{/if}
		{:else}
			<button class="btn btn-primary btn-sm min-h-[44px]" onclick={onReEnable}>
				{$t('wallet.gasless_revoke.re_enable')}
			</button>
		{/if}
	</div>
</div>
