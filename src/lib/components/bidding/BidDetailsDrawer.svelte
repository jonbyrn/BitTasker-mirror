<script lang="ts">
	import type { Bid, CounterOffer } from '$lib/types/bid';
	import { formatCurrency } from '$lib/utils/helpers/currencyFormatter';
	import { formatDate } from '$lib/utils/helpers/dateFormatter';
	import CounterOfferItem from '$lib/components/bidding/CounterOfferItem.svelte';
	
	// Props using Svelte 5 runes syntax
	const props = $props<{
		bid: Bid | null;
		isOpen: boolean;
		isTaskOwner: boolean;
		counterOffers: CounterOffer[];
		onClose: () => void;
		onAcceptBid: (bid: Bid) => void;
		onRejectBid: (bid: Bid) => void;
		onCounterOffer: (bid: Bid) => void;
	}>();
	
	// Derived values
	const getFormattedPrice = $derived(() => {
		return props.bid ? formatCurrency(props.bid.amount, props.bid.currency) : '';
	});
	
	const getHourlyDetails = $derived(() => {
		if (!props.bid || props.bid.paymentType !== 'HOURLY') return '';
		return `${formatCurrency(props.bid.hourlyRate || 0, props.bid.currency)}/hr × ${props.bid.estimatedHours || 0} hrs`;
	});
	
	const getBidCreationDate = $derived(() => {
		return props.bid?.createdAt ? formatDate(new Date(props.bid.createdAt)) : '';
	});
	
	const canShowActions = $derived(props.isTaskOwner && props.bid?.status === 'pending');
</script>

<!-- Drawer Overlay -->
<div 
	class="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-300 ease-in-out"
	class:opacity-0={!props.isOpen} 
	class:invisible={!props.isOpen}
	onclick={props.onClose}
	onkeydown={(e) => e.key === 'Escape' && props.onClose()}
	role="dialog"
	tabindex="-1"
></div>

<!-- Drawer -->
<div class="fixed inset-y-0 right-0 w-full sm:w-96 bg-base-100 shadow-xl z-50 transition-transform duration-300 ease-in-out overflow-y-auto"
	 class:translate-x-0={props.isOpen}
	 class:translate-x-full={!props.isOpen}>
	
	{#if props.bid}
		<!-- Header -->
		<div class="bg-base-200 p-4 sticky top-0 z-10 border-b">
			<div class="flex justify-between items-center">
				<h2 class="text-xl font-bold">Bid Details</h2>
				<button class="btn btn-ghost btn-circle" onclick={props.onClose} aria-label="Close dialog">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		</div>
		
		<!-- Content -->
		<div class="p-4">
			<!-- Bidder Info -->
			<div class="mb-6">
				<div class="flex justify-between items-start">
					<div>
						<h3 class="text-lg font-semibold">{props.bid.bidderName || 'Anonymous'}</h3>
						<p class="text-sm opacity-70">Submitted: {getBidCreationDate}</p>
					</div>
					
					{#if props.bid.status}
						<span class="badge badge-lg capitalize" 
							class:badge-success={props.bid.status === 'accepted'}
							class:badge-error={props.bid.status === 'rejected'}
							class:badge-warning={props.bid.status === 'withdrawn'}
							class:badge-info={props.bid.status === 'countered'}
							class:badge-primary={props.bid.status === 'pending'}>
							{props.bid.status}
						</span>
					{/if}
				</div>
			</div>
			
			<!-- Price Details -->
			<div class="card bg-base-200 mb-6">
				<div class="card-body p-4">
					<h3 class="card-title text-base mb-2">Price Details</h3>
					<div class="flex justify-between">
						<span>Total price:</span>
						<span class="font-bold">{getFormattedPrice}</span>
					</div>
					{#if props.bid.paymentType === 'HOURLY'}
						<div class="flex justify-between text-sm">
							<span>Rate calculation:</span>
							<span>{getHourlyDetails}</span>
						</div>
					{/if}
					<div class="flex justify-between text-sm">
						<span>Payment method:</span>
						<span>{props.bid.currency}</span>
					</div>
				</div>
			</div>
			
			<!-- Proposal -->
			<div class="mb-6">
				<h3 class="text-base font-semibold mb-2">Proposal</h3>
				<p class="whitespace-pre-line">{props.bid.description}</p>
			</div>
			
			<!-- Approach -->
			<div class="mb-6">
				<h3 class="text-base font-semibold mb-2">Proposed Approach</h3>
				<p class="whitespace-pre-line">{props.bid.proposedApproach}</p>
			</div>
			
			<!-- Timeline -->
			<div class="mb-6">
				<h3 class="text-base font-semibold mb-2">Estimated Timeline</h3>
				<p>{props.bid.estimatedDuration}</p>
			</div>
			
			<!-- Provider Highlights -->
			{#if props.bid.providerHighlights}
				<div class="mb-6">
					<h3 class="text-base font-semibold mb-2">Provider Highlights</h3>
					
					{#if props.bid.providerHighlights.skills && props.bid.providerHighlights.skills.length > 0}
						<div class="mb-3">
							<h4 class="text-sm font-medium mb-1">Skills</h4>
							<div class="flex flex-wrap gap-1">
								{#each props.bid.providerHighlights.skills as skill}
									<span class="badge badge-outline">{skill}</span>
								{/each}
							</div>
						</div>
					{/if}
					
					{#if props.bid.providerHighlights.certifications && props.bid.providerHighlights.certifications.length > 0}
						<div class="mb-3">
							<h4 class="text-sm font-medium mb-1">Certifications</h4>
							<ul class="list-disc list-inside text-sm">
								{#each props.bid.providerHighlights.certifications as cert}
									<li>{cert}</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>
			{/if}
			
			<!-- Counter Offers -->
			{#if props.counterOffers && props.counterOffers.length > 0}
				<div class="mb-6">
					<h3 class="text-base font-semibold mb-2">Negotiation History</h3>
					<div class="space-y-3">
						{#each props.counterOffers.sort((a: CounterOffer, b: CounterOffer) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) as offer}
							<CounterOfferItem 
								offer={offer} 
								bidCurrency={props.bid.currency}
							/>
						{/each}
					</div>
				</div>
			{/if}
			
			<!-- Action buttons -->
			{#if canShowActions}
				<div class="border-t pt-4 mt-8 flex justify-end space-x-2">
					<button class="btn btn-error" onclick={() => props.onRejectBid(props.bid)}>Decline</button>
					<button class="btn btn-outline" onclick={() => props.onCounterOffer(props.bid)}>Counter</button>
					<button class="btn btn-primary" onclick={() => props.onAcceptBid(props.bid)}>Accept</button>
				</div>
			{/if}
		</div>
	{/if}
</div>
