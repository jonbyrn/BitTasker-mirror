<script lang="ts">
	import type { TransactionType } from "$lib/types/wallet";

	let { transactions = [] } = $props<{ transactions: TransactionType[] }>();

	let isLoading = $state(false);
	let hasMore = $state(true);
	let containerElement: HTMLElement | null = $state(null);

	// Function to format address for display
	function formatAddress(address: string) {
		if (address?.length <= 12) return address;
		return `${address?.slice(0, 6)}...${address?.slice(-6)}`;
	}

	// Function to load more transactions
	async function loadMore() {
		if (isLoading || !hasMore) return;

		try {
			isLoading = true;
			// TODO: Implement actual API call when available
			await new Promise((resolve) => setTimeout(resolve, 1000));
			// Mock loading more transactions
			// In real implementation, this would be an API call
			hasMore = false;
		} catch (error) {
			console.error('Error loading more transactions:', error);
		} finally {
			isLoading = false;
		}
	}

	// Handle scroll event for infinite loading
	function handleScroll(event: Event) {
		const target = event.target as HTMLElement;
		const threshold = 100; // pixels from bottom
		const bottomPosition = target.scrollHeight - target.scrollTop - target.clientHeight;

		if (bottomPosition < threshold) {
			loadMore();
		}
	}
</script>

{#if transactions && transactions.length === 0}
	<div class="text-base-content/60 flex flex-col items-center justify-center py-8">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="mb-4 h-12 w-12"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
			/>
		</svg>
		<p>No transactions yet</p>
	</div>
{:else}
	<div class="space-y-2 overflow-y-auto" bind:this={containerElement} onscroll={handleScroll}>
		{#each transactions as transaction}
			<div class="bg-base-200 flex items-center justify-between rounded-lg p-4">
				<div class="flex items-center gap-4">
					<div
						class="flex h-10 w-10 items-center justify-center rounded-full {transaction.type ===
						'receive'
							? 'bg-success/20 text-success'
							: 'bg-error/20 text-error'}"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d={transaction.type === 'receive'
									? 'M19 14l-7 7m0 0l-7-7m7 7V3'
									: 'M5 10l7-7m0 0l7 7m-7-7v18'}
							/>
						</svg>
					</div>
					<div>
						<p class="font-medium">
							{transaction.type === 'receive' ? 'Received' : 'Sent'}
						</p>
						<p class="text-base-content/60 text-sm">
							{formatAddress(transaction.address)}
						</p>
					</div>
				</div>
				<div class="text-right">
					<p class="font-medium">
						{transaction.type === 'receive' ? '+' : '-'}{transaction.amount} BTC
					</p>
					<p class="text-base-content/60 text-sm">
						{#if transaction.status === 'pending'}
							<span class="badge badge-warning badge-sm">Pending</span>
						{:else}
							<span class="badge badge-success badge-sm">Confirmed</span>
						{/if}
					</p>
				</div>
			</div>
		{/each}

		{#if isLoading}
			<div class="flex justify-center py-4">
				<span class="loading loading-spinner loading-md text-primary"></span>
			</div>
		{/if}
	</div>
{/if}
