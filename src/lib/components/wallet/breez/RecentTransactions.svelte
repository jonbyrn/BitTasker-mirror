<script lang="ts">
	import type { Payment } from '@breeztech/breez-sdk-liquid/web';
	import { onMount } from 'svelte';
	import { getTransactions } from '$lib/wallet/breez/walletService';
	import { t } from 'svelte-i18n';

	let transactions = $state<Payment[]>([]);
	let { activeTab = $bindable('') } = $props();

	onMount(async () => {
		transactions = await getTransactions();
	});
</script>

<div>
	<h3 class="mb-3 text-lg font-semibold">{$t('common.components.wallet.recent_transactions.title')}</h3>

	{#if transactions.length > 0}
		<div class="space-y-3">
			{#each transactions as tx}
				<div class="card bg-base-200 shadow-sm">
					<div class="card-body p-3">
						<!-- Header row with type and amount -->
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								{#if tx.paymentType === 'receive'}
									<div class="badge badge-success badge-sm">{$t('common.components.wallet.recent_transactions.received')}</div>
								{:else}
									<div class="badge badge-warning badge-sm">{$t('common.components.wallet.recent_transactions.sent')}</div>
								{/if}
							</div>
							<div class="text-right">
								<span
									class={`font-bold ${tx.paymentType === 'receive' ? 'text-success' : 'text-warning'}`}
								>
									{tx.paymentType === 'receive' ? '+' : '-'}{tx.amountSat} sats
								</span>
							</div>
						</div>

						<!-- Transaction details -->
						<div class="mt-2 flex items-center justify-between text-sm">
							<span class="text-base-content/70"
								>{new Date(tx.timestamp * 1000).toLocaleString()}</span
							>
							<div class="badge badge-sm">{tx.details.type}</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
		<div class="mt-4 text-center">
			<button class="btn btn-ghost btn-outline btn-sm" onclick={() => (activeTab = 'transactions')}>
				{$t('common.components.wallet.recent_transactions.view_all')}
			</button>
		</div>
	{:else}
		<div class="alert">
			<span>{$t('common.components.wallet.recent_transactions.no_transactions')}</span>
		</div>
	{/if}
</div>
