<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { formatCurrency } from '$lib/utils/helpers/currencyFormatter';
	import { formatTimeAgo } from '$lib/utils/helpers/date';
	import Avatar from '$lib/components/Avatar.svelte';

	// Props
	const { currentUserPubkey } = $props<{ currentUserPubkey: string }>();

	// State
	let myBids = $state<any[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	onMount(async () => {
		await loadMyBids();
	});

	async function loadMyBids() {
		try {
			isLoading = true;
			error = null;

			// For now, we'll show a placeholder since getTaskBids returns empty
			// This will be implemented when we add proper bid querying
			myBids = [];
			
			// TODO: Implement loading bids that the current user has sent
			// We need to query DMs sent by the current user that contain bid data
			
		} catch (err) {
			console.error('Failed to load my bids:', err);
			error = 'Failed to load your bids';
		} finally {
			isLoading = false;
		}
	}

	function getBidStatus(bid: any): string {
		// TODO: Implement bid status logic
		return 'pending';
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
			<h2 class="text-2xl font-bold text-primary">{$t('messages.my_bids.title')}</h2>
			<p class="text-base-content/60 mt-1">{$t('messages.my_bids.subtitle')}</p>
		</div>
		<button class="btn btn-primary btn-sm gap-2" onclick={loadMyBids}>
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
			<p class="text-base-content/60">{$t('messages.my_bids.loading')}</p>
		</div>
	{:else if error}
		<!-- Error State -->
		<div class="alert alert-error shadow-lg">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<span>{error}</span>
		</div>
	{:else if myBids.length === 0}
		<!-- Empty State - Mejorado visualmente -->
		<div class="text-center py-20">
			<div class="bg-base-200 rounded-full w-24 h-24 mx-auto mb-6 flex items-center justify-center">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-base-content/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
			</div>
			<h3 class="text-xl font-semibold mb-3">{$t('messages.my_bids.empty.title')}</h3>
			<p class="text-base-content/60 max-w-md mx-auto">{$t('messages.my_bids.empty.message')}</p>
			<div class="mt-6">
				<button class="btn btn-primary btn-outline">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
					</svg>
					{$t('messages.my_bids.empty.browse_tasks')}
				</button>
			</div>
		</div>
	{:else}
		<!-- Bids List - Mejorado visualmente -->
		<div class="grid gap-4">
			{#each myBids as bid}
				<div class="card bg-base-100 shadow-lg border border-base-300 hover:shadow-xl transition-shadow duration-200">
					<div class="card-body p-6">
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<div class="flex items-center gap-4 mb-4">
									<div class="avatar">
										<div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
											<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
											</svg>
										</div>
									</div>
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
								<button class="btn btn-ghost btn-sm gap-2">
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
									</svg>
									{$t('common.view')}
								</button>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

