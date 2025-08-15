<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { formatCurrency } from '$lib/utils/helpers/currencyFormatter';
	import { formatTimeAgo } from '$lib/utils/helpers/date';
	import Avatar from '$lib/components/Avatar.svelte';

	// Props
	const { currentUserPubkey } = $props<{ currentUserPubkey: string }>();

	// State
	let receivedBids = $state<any[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	onMount(async () => {
		await loadReceivedBids();
	});

	async function loadReceivedBids() {
		try {
			isLoading = true;
			error = null;

			// For now, we'll show a placeholder since getTaskBids returns empty
			// This will be implemented when we add proper bid querying
			receivedBids = [];
			
			// TODO: Implement loading bids that the current user has received
			// We need to query DMs received by the current user that contain bid data
			
		} catch (err) {
			console.error('Failed to load received bids:', err);
			error = 'Failed to load received bids';
		} finally {
			isLoading = false;
		}
	}

	async function acceptBid(bid: any) {
		try {
			// TODO: Implement bid acceptance logic
			console.log('Accepting bid:', bid);
			
			// Update local state
			receivedBids = receivedBids.map(b => {
				if (b.bidData.bidId === bid.bidData.bidId) {
					return { ...b, status: 'accepted' };
				}
				return b;
			});
		} catch (err) {
			console.error('Failed to accept bid:', err);
		}
	}

	async function rejectBid(bid: any) {
		try {
			// TODO: Implement bid rejection logic
			console.log('Rejecting bid:', bid);
			
			// Update local state
			receivedBids = receivedBids.map(b => {
				if (b.bidData.bidId === bid.bidData.bidId) {
					return { ...b, status: 'rejected' };
				}
				return b;
			});
		} catch (err) {
			console.error('Failed to reject bid:', err);
		}
	}

	function getBidStatus(bid: any): string {
		return bid.status || 'pending';
	}

	function getStatusBadgeClass(status: string): string {
		switch (status) {
			case 'accepted':
				return 'badge-success';
			case 'rejected':
				return 'badge-error';
			case 'pending':
				return 'badge-warning';
			default:
				return 'badge-ghost';
		}
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-2xl font-bold text-primary">{$t('messages.bids_received.title')}</h2>
			<p class="text-base-content/60 mt-1">{$t('messages.bids_received.subtitle')}</p>
		</div>
		<button class="btn btn-primary btn-sm gap-2" onclick={loadReceivedBids}>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
			</svg>
			{$t('common.refresh')}
		</button>
	</div>

	<!-- Loading State -->
	{#if isLoading}
		<div class="flex flex-col items-center justify-center py-16">
			<div class="loading loading-spinner loading-lg text-primary mb-4"></div>
			<p class="text-base-content/60">{$t('messages.bids_received.loading')}</p>
		</div>
	{:else if error}
		<!-- Error State -->
		<div class="alert alert-error shadow-lg">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<span>{error}</span>
		</div>
	{:else if receivedBids.length === 0}
		<!-- Empty State - Mejorado visualmente -->
		<div class="text-center py-20">
			<div class="bg-base-200 rounded-full w-24 h-24 mx-auto mb-6 flex items-center justify-center">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-base-content/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
				</svg>
			</div>
			<h3 class="text-xl font-semibold mb-3">{$t('messages.bids_received.empty.title')}</h3>
			<p class="text-base-content/60 max-w-md mx-auto">{$t('messages.bids_received.empty.message')}</p>
			<div class="mt-6">
				<button class="btn btn-primary btn-outline">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
					</svg>
					{$t('messages.bids_received.empty.create_task')}
				</button>
			</div>
		</div>
	{:else}
		<!-- Bids List - Mejorado visualmente -->
		<div class="grid gap-4">
			{#each receivedBids as bid}
				<div class="card bg-base-100 shadow-lg border border-base-300 hover:shadow-xl transition-shadow duration-200">
					<div class="card-body p-6">
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<div class="flex items-center gap-4 mb-4">
									<Avatar size="sm" />
									<div>
										<h4 class="font-semibold text-lg">Task: {bid.bidData?.taskId || 'Unknown'}</h4>
										<p class="text-sm text-base-content/60">
											{formatTimeAgo(bid.bidData?.timestamp || Date.now())}
										</p>
									</div>
								</div>
								
								<div class="mb-4">
									<p class="text-base-content/80 leading-relaxed">{bid.bidData?.description || 'No description'}</p>
								</div>

								<div class="flex items-center gap-6 text-sm">
									<div class="flex items-center gap-2">
										<span class="text-2xl font-bold text-primary">
											{formatCurrency(bid.bidData?.amount || 0, 'SATS')}
										</span>
									</div>
									<span class="badge badge-outline badge-lg">
										{bid.bidData?.paymentType || 'FIXED'}
									</span>
									{#if bid.bidData?.estimatedDuration}
										<div class="flex items-center gap-2 text-base-content/60">
											<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
											</svg>
											{bid.bidData.estimatedDuration}
										</div>
									{/if}
								</div>
							</div>

							<div class="flex flex-col items-end gap-3">
								<span class="badge {getStatusBadgeClass(getBidStatus(bid))} badge-lg">
									{getBidStatus(bid)}
								</span>
								
								{#if getBidStatus(bid) === 'pending'}
									<div class="flex gap-2">
										<button 
											class="btn btn-success btn-sm gap-2" 
											onclick={() => acceptBid(bid)}
										>
											<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
											</svg>
											{$t('common.accept')}
										</button>
										<button 
											class="btn btn-error btn-sm gap-2" 
											onclick={() => rejectBid(bid)}
										>
											<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
											</svg>
											{$t('common.reject')}
										</button>
									</div>
								{/if}
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
