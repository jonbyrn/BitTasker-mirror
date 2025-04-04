<script lang="ts">
	import type { Task } from '$lib/types/task';
	import type { Bid } from '$lib/types/bid';
	import BidsPanel from '../bidding/BidsPanel.svelte';
	import BidCreationForm from '../bidding/BidCreationForm.svelte';
	import bidService from '$lib/api/services/bid.service';

	// Props
	let { task, isTaskOwner = false } = $props();
	
	// State
	let isCreatingBid: boolean = $state(false);
	let isSubmitting: boolean = $state(false);
	let error: string | null = $state(null);

	// Methods
	function handleCreateBid() {
		isCreatingBid = true;
	}

	function handleCancelBidCreation() {
		isCreatingBid = false;
	}

	async function handleSubmitBid(bid: Bid) {
		isSubmitting = true;
		error = null;

		try {
			await bidService.createBid(bid);
			isCreatingBid = false;
		} catch (err) {
			console.error('Failed to submit bid:', err);
			error = 'Failed to submit bid. Please try again.';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="py-6">
	{#if isCreatingBid}
		<div class="mb-6">
			<button class="btn btn-outline btn-sm mb-4" onclick={handleCancelBidCreation}>
				← Back to bids
			</button>

			{#if error}
				<div class="alert alert-error mb-4">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6 shrink-0 stroke-current"
						fill="none"
						viewBox="0 0 24 24"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
						/></svg
					>
					<span>{error}</span>
				</div>
			{/if}

			<BidCreationForm
				taskId={task.id}
				onSubmit={handleSubmitBid}
				onCancel={handleCancelBidCreation}
			/>
		</div>
	{:else}
		<BidsPanel taskId={task.id} {isTaskOwner} onCreateBid={handleCreateBid} />
	{/if}
</div>
