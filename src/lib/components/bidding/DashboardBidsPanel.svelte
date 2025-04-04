<script lang="ts">
	import { onMount } from 'svelte';
	import { bidStore } from '$lib/stores/bid.store';
	import BidSummaryCard from '$lib/components/bidding/BidSummaryCard.svelte';
	import type { Bid } from '$lib/types/bid';
	import { goto } from '$app/navigation';
	import { user } from '$lib/stores/user.store';

	// State
	let myBids = $state<Bid[]>([]);
	let receivedBids = $state<Bid[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	onMount(async () => {
		await loadBids();
	});

	async function loadBids() {
		try {
			isLoading = true;
			error = null;

			// Load bids from the store
			await bidStore.loadPersistedData();
			
			// Get current user and filter bids
			const currentUser = $user;
			if (currentUser && currentUser.id) {
				// Filter bids by the current user as bidder
				myBids = $bidStore.bids.filter((bid: Bid) => bid.bidderId === currentUser.id);
				
				// Filter bids where the task belongs to the current user
				receivedBids = $bidStore.bids.filter((bid: Bid) => {
					// This would ideally check if the task belongs to the current user
					// For now, we'll check if the taskId is in a list of tasks owned by the user
					// This is a placeholder implementation - in a real app, we would have a proper way 
					// to check if the task belongs to the current user
					return bid.taskId && true; // Always return true for demo purposes
				});
			}
		} catch (err) {
			console.error('Failed to load bids:', err);
			error = 'Failed to load bids data';
		} finally {
			isLoading = false;
		}
	}

	function handleViewTask(taskId: string) {
		goto(`/dashboard/task/${taskId}`);
	}
</script>

<div class="w-full" role="region" aria-label="My bids dashboard">
	<!-- Loading State -->
	{#if isLoading}
		<div class="flex justify-center py-8" aria-live="polite">
			<div class="loading loading-spinner loading-lg" aria-label="Loading your bids"></div>
		</div>
	
	<!-- Error State -->
	{:else if error}
		<div class="alert alert-error" role="alert">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24" aria-hidden="true">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<span>{error}</span>
			<button class="btn btn-sm" onclick={loadBids} aria-label="Retry loading bids">Retry</button>
		</div>
	
	<!-- Bids Content -->
	{:else}
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<!-- My Submitted Bids -->
			<div class="card bg-base-100 shadow-lg">
				<div class="card-body">
					<h3 class="card-title">My Submitted Bids</h3>
					
					{#if myBids.length === 0}
						<div class="text-center py-6">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
							<p class="mt-3 text-base-content/70">You haven't submitted any bids yet.</p>
							<button 
								class="btn btn-primary mt-4" 
								onclick={() => goto('/dashboard/find-tasks')}
								aria-label="Find tasks to bid on"
							>
								Find Tasks to Bid
							</button>
						</div>
					{:else}
						<div class="space-y-4">
							{#each myBids as bid (bid.id)}
								<BidSummaryCard bid={bid} isProvider={true} />
							{/each}
						</div>
					{/if}
				</div>
			</div>
			
			<!-- Bids on My Tasks -->
			<div class="card bg-base-100 shadow-lg">
				<div class="card-body">
					<h3 class="card-title">Bids on My Tasks</h3>
					
					{#if receivedBids.length === 0}
						<div class="text-center py-6">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
							<p class="mt-3 text-base-content/70">You haven't received any bids on your tasks yet.</p>
							<button 
								class="btn btn-primary mt-4" 
								onclick={() => goto('/dashboard/create-task')}
								aria-label="Create a task"
							>
								Post a Task
							</button>
						</div>
					{:else}
						<div class="space-y-4">
							{#each receivedBids as bid (bid.id)}
								<BidSummaryCard bid={bid} isProvider={false} />
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>