<script lang="ts">
	import { onMount } from 'svelte';
	import { user } from '$lib/stores/user.store';
	import BidsPanel from '$lib/components/bidding/BidsPanel.svelte';
	import BidCreationForm from '$lib/components/bidding/BidCreationForm.svelte';
	import type { Task } from '$lib/types/task';
	import taskService from '$lib/api/services/task.service';

	// Props
	const props = $props<{
		taskId: string;
		selectedBidId?: string;
	}>();

	// State
	let task = $state<Task | null>(null);
	let isTaskOwner = $state(false);
	let showBidForm = $state(false);
	let loading = $state(false);
	let error = $state<string | null>(null);

	// Lifecycle hooks
	onMount(async () => {
		await loadTaskDetails();
	});

	// Methods
	async function loadTaskDetails() {
		try {
			loading = true;
			task = await taskService.getTaskById(props.taskId);
			
			// Check if current user is task owner
			const currentUser = $user;
			if (task && currentUser) {
				// Compare current user info with task clientId
				isTaskOwner = task.clientId?.toString() === currentUser.id?.toString();
			}
		} catch (err) {
			console.error('Failed to load task details:', err);
			error = 'Unable to load task details';
		} finally {
			loading = false;
		}
	}

	function handleCreateBid() {
		showBidForm = true;
	}

	async function handleBidSubmitted(bid: any) {
		showBidForm = false;
		// Refresh the bids panel after submission
		return Promise.resolve();
	}

	function handleCancelBid() {
		showBidForm = false;
	}
</script>

<div class="w-full" role="region" aria-labelledby="task-bids-title">
	<h2 id="task-bids-title" class="sr-only">Task Bids</h2>

	{#if loading}
		<div class="flex justify-center py-8" aria-live="polite">
			<div class="loading loading-spinner loading-lg" aria-label="Loading task details"></div>
		</div>
	{:else if error}
		<div class="alert alert-error" role="alert">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24" aria-hidden="true">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<span>{error}</span>
			<button class="btn btn-sm" onclick={loadTaskDetails} aria-label="Retry loading task details">
				Retry
			</button>
		</div>
	{:else if task}
		{#if showBidForm}
			<div class="mb-4 flex justify-between">
				<h3 class="text-xl font-bold">Submit a Bid</h3>
				<button 
					class="btn btn-sm btn-ghost" 
					onclick={handleCancelBid}
					aria-label="Cancel bid submission"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
					Cancel
				</button>
			</div>
			<BidCreationForm 
				taskId={props.taskId} 
				onSubmit={handleBidSubmitted}
				onCancel={handleCancelBid}
			/>
		{:else}
			<BidsPanel
				taskId={props.taskId}
				isTaskOwner={isTaskOwner}
				onCreateBid={handleCreateBid}
			/>
		{/if}
	{/if}
</div>