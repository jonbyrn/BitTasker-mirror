<script lang="ts">
	import { getRecentTransactions } from '$lib/wallet/helper';
	import { onMount } from 'svelte';
	import * as breezSdk from '@breeztech/breez-sdk-liquid/web';

	let transactions = $state<breezSdk.Payment[]>([]);
	let { activeTab = $bindable('') } = $props();

	onMount(async () => {
		transactions = await getRecentTransactions();
	});
</script>

<div>
	<h3 class="mb-3 text-lg font-semibold">Recent Transactions</h3>

	{#if transactions.length > 0}
		<div class="space-y-3">
			{#each transactions as tx}
				<div class="card bg-base-200 shadow-sm">
					<div class="card-body p-3">
						<!-- Header row with type and amount -->
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								{#if tx.paymentType === 'receive'}
									<div class="badge badge-success badge-sm">Received</div>
								{:else}
									<div class="badge badge-warning badge-sm">Sent</div>
								{/if}
							</div>
							<div class="text-right">
								<span class={`font-bold ${tx.paymentType === 'receive' ? 'text-success' : 'text-warning'}`}>
									{tx.paymentType === 'receive' ? '+' : '-'}{tx.amountSat} sats
								</span>
							</div>
						</div>

						<!-- Transaction details -->
						<div class="mt-2 flex justify-between items-center text-sm">
							<span class="text-base-content/70">{new Date(tx.timestamp * 1000).toLocaleString()}</span>
							<div class="badge badge-sm">{tx.details.type}</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
		<div class="mt-4 text-center">
			<button class="btn btn-ghost btn-outline btn-sm" onclick={() => (activeTab = 'transactions')}>
				View all transactions
			</button>
		</div>
	{:else}
		<div class="alert">
			<span>No transactions found.</span>
		</div>
	{/if}
</div>
