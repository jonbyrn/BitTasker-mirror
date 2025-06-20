<script lang="ts">
	import { getRecentTransactions } from '$lib/wallet/helper';
	import * as breezSdk from '@breeztech/breez-sdk-liquid/web';
	import { onMount } from 'svelte';

	let transactions = $state<breezSdk.Payment[]>([]);

	// Truncate address for display
	function truncateAddress(address: string, prefixLength = 8, suffixLength = 4): string {
		if (address.length <= prefixLength + suffixLength) {
			return address;
		}
		return `${address.substring(0, prefixLength)}...${address.substring(address.length - suffixLength)}`;
	}

	onMount(async () => {
		transactions = await getRecentTransactions();
	});
</script>

<div class="space-y-6">
	<h3 class="mb-3 text-lg font-semibold">Transaction History</h3>

	{#if transactions.length > 0}
		<div class="overflow-x-auto">
			<table class="table w-full">
				<thead>
					<tr>
						<th>Type</th>
						<th>Amount</th>
						<th>Date</th>
						<th>Address</th>
						<th>Status</th>
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
								{#if tx.paymentType === 'receive'}
									<span class="font-mono text-xs"
										>Transaction To: {truncateAddress(tx.destination ?? '', 8, 4)}</span
									>
								{:else}
									<span class="font-mono text-xs"
										>Transaction To: {truncateAddress(tx.destination ?? '', 8, 4)}</span
									>
								{/if}
							</td>
							<td>
								{#if tx.details.type === 'lightning'}
									<div class="badge badge-success">Confirmed</div>
								{:else if tx.status === 'pending'}
									<div class="badge badge-warning">Pending</div>
								{:else if tx.status === 'failed'}
									<div class="badge badge-error">Failed</div>
								{:else}
									<div class="indicator">
										<span class="indicator-item badge badge-xs">
											{tx.status}
										</span>
										<div class="badge badge-success">Confirmations</div>
									</div>
								{/if}
							</td>
							<td>
								<div class="badge">
									{tx.details.type}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="alert">
			<span>No transactions found.</span>
		</div>
	{/if}
</div>
