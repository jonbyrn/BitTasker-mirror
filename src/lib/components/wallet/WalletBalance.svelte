<!-- WalletBalance.svelte -->
<script lang="ts">
	import { walletStore } from '$lib/stores/wallet.store';

	let { onTabChange } = $props<{ onTabChange: (tab: string) => void }>();

	// Format number with a specific number of decimals
	function formatNumber(number: number, decimals: number): string {
		return number.toFixed(decimals);
	}

	// Format timestamp to human-readable date
	function formatDate(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="space-y-6">
	<!-- Balance Card -->
	{#if $walletStore}
		<div class="card bg-primary text-primary-content">
			<div class="card-body">
				<h3 class="card-title mb-2 text-lg">Total Balance</h3>
				<p class="text-4xl font-bold">{formatNumber($walletStore.balance.btc, 8)} BTC</p>
				<p class="opacity-80">{$walletStore.balance.sats.toLocaleString()} sats</p>
				<p class="opacity-80">≈ ${$walletStore.balance.usd.toLocaleString()}</p>
			</div>
		</div>

		<!-- Quick Actions -->
		<div class="grid grid-cols-2 gap-4">
			<button class="btn btn-outline btn-primary" onclick={() => onTabChange('receive')}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="mr-2 h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M19 9l-7 7-7-7"
					/>
				</svg>
				Receive
			</button>
			<button class="btn btn-outline btn-primary" onclick={() => onTabChange('send')}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="mr-2 h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
				</svg>
				Send
			</button>
		</div>

		<!-- Recent Transactions -->
		<div>
			<h3 class="mb-3 text-lg font-semibold">Recent Transactions</h3>
			{#if $walletStore.transactions.length > 0}
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
							{#each $walletStore.transactions.slice(0, 3) as tx}
								<tr>
									<td>
										<div class="flex items-center gap-2">
											{#if tx.type === 'received'}
												<div class="badge badge-success">Received</div>
											{:else}
												<div class="badge badge-warning">Sent</div>
											{/if}
										</div>
									</td>
									<td>
										<span class={tx.type === 'received' ? 'text-success' : 'text-warning'}>
											{tx.type === 'received' ? '+' : '-'}{formatNumber(tx.amount, 8)} BTC
										</span>
									</td>
									<td>{formatDate(tx.timestamp)}</td>
									<td>
										<div class="badge">
											{tx.network}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="mt-4 text-center">
					<button class="btn btn-ghost btn-sm" onclick={() => onTabChange('transactions')}>
						View all transactions
					</button>
				</div>
			{:else}
				<div class="alert">
					<span>No transactions found.</span>
				</div>
			{/if}
		</div>
	{/if}
</div>
