<script lang="ts">
	import type { Payment } from '@breeztech/breez-sdk-liquid/web';
	import { getRecentTransactions } from '$lib/wallet/helper';
	import { onMount } from 'svelte';

	let transactions = $state<Payment[] | null>(null);
	let isLoading = $state(true);
	let errorMessage = $state<string | null>(null);

	// Truncate address for display
	function truncateAddress(address: string, prefixLength = 8, suffixLength = 4): string {
		if (!address) return '';
		if (address.length <= prefixLength + suffixLength) {
			return address;
		}
		return `${address.substring(0, prefixLength)}...${address.substring(address.length - suffixLength)}`;
	}

	async function loadTransactions() {
		isLoading = true;
		errorMessage = null;

		try {
			transactions = await getRecentTransactions();
			console.log('transactions', transactions);
		} catch (error) {
			console.error('Error fetching transactions', error);
			errorMessage = error instanceof Error ? error.message : 'Error fetching transactions';
			transactions = null;
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		loadTransactions();
	});
</script>

<div class="space-y-6">
	<h3 class="mb-3 text-lg font-semibold">Transaction History</h3>

	{#if isLoading}
		<div class="flex items-center justify-center gap-2 py-8">
			<span class="loading loading-spinner loading-lg text-amber-500"></span>
			<span>Loading transactions... please wait</span>
		</div>
	{:else if errorMessage}
		<div class="alert alert-error shadow-lg">
			<div class="flex items-center gap-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 flex-shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/></svg
				>
				<span>{errorMessage}</span>
			</div>
			<div class="flex-none">
				<button onclick={loadTransactions} class="btn btn-sm">Retry</button>
			</div>
		</div>
	{:else if !transactions || transactions.length === 0}
		<div class="alert alert-info shadow-lg">
			<div class="flex items-center gap-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					class="h-6 w-6 flex-shrink-0 stroke-current"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					></path></svg
				>
				<span>No transactions found.</span>
			</div>
		</div>
	{:else}
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
								<span class="font-mono text-xs">
									Transaction To: {truncateAddress(tx.destination ?? '', 8, 4)}
								</span>
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
	{/if}
</div>
