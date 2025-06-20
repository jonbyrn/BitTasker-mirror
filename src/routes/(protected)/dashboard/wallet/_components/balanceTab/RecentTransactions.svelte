<script lang="ts">
	import { getRecentTransactions } from '$lib/wallet/helper';
	import { onMount } from 'svelte';
	import * as breezSdk from '@breeztech/breez-sdk-liquid/web';

	let transactions = $state<breezSdk.Payment[]>([]);
	let { activeTab } = $props();

	onMount(async () => {
		transactions = await getRecentTransactions();
	});
</script>

<div>
	<h3 class="mb-3 text-lg font-semibold">Recent Transactions</h3>
	{#if transactions.length > 0}
		<div class="overflow-x-auto">
			<table class="table w-full">
				<thead>
					<tr>
						<th>Type</th>
						<th>Amount</th>
						<th>Date</th>
						<th>Network</th>
					</tr>
				</thead>
				<tbody>
					{#each transactions as tx}
						<tr>
							<td>
								<div class="flex items-center gap-2">
									{#if tx.paymentType === 'receive'}
										<div class="badge badge-success">Received</div>
									{:else}
										<div class="badge badge-warning">Sent</div>
									{/if}
								</div>
							</td>
							<td>
								<span class={tx.paymentType === 'receive' ? 'text-success' : 'text-warning'}>
									{tx.paymentType === 'receive' ? '+' : '-'}{tx.amountSat} sats
								</span>
							</td>
							<td>{new Date(tx.timestamp).toLocaleString()}</td>
							<td>
								<div class="badge">{tx.details.type}</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="mt-4 text-center">
			<button class="btn btn-ghost btn-sm" onclick={() => (activeTab = 'transactions')}>
				View all transactions
			</button>
		</div>
	{:else}
		<div class="alert">
			<span>No transactions found.</span>
		</div>
	{/if}
</div>
