<script lang="ts">
	import type { Bid, CounterOffer } from '$lib/types/bid';
	import { formatCurrency } from '$lib/utils/helpers/currencyFormatter';
	import { formatDate } from '$lib/utils/helpers/dateFormatter';
	import CounterOfferItem from '$lib/components/bidding/CounterOfferItem.svelte';
	import TranslatableBidContent from '$lib/components/bidding/TranslatableBidContent.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import { t } from 'svelte-i18n';
	import { getBidderDisplayName } from '$lib/utils/helpers/userDisplayName';

	// Props using Svelte 5 runes syntax
	const props = $props<{
		bid: Bid | null;
		isOpen: boolean;
		counterOffers: CounterOffer[];
		onClose: () => void;
		onAcceptBid: (bid: Bid) => void;
		onRejectBid: (bid: Bid) => void;
		onCounterOffer: (bid: Bid) => void;
	}>();

	const getHourlyDetails = () => {
		if (!props.bid || props.bid.paymentType !== 'HOURLY') return '';
		return `${formatCurrency(props.bid.hourlyRate || 0, props.bid.currency)}{$t('dashboard.bids.bid_details.per_hour')} × ${props.bid.estimatedHours || 0} {$t('dashboard.bids.bid_details.hours')}`;
	};
</script>

<Drawer
	isOpen={props.isOpen}
	title={$t('dashboard.bids.bid_details.title')}
	onClose={props.onClose}
	position="right"
	isScrollable={true}
>
	{#snippet children()}
		{#if props.bid}
			<!-- Bidder Info -->
			<div class="mb-6">
				<div class="flex items-start justify-between">
					<div>
						<h3 class="text-lg font-semibold">{getBidderDisplayName(props.bid.bidderName, props.bid.userProfile)}</h3>
						<p class="text-sm opacity-70">
							{$t('dashboard.bids.bid_details.submitted')} {props.bid?.createdAt ? formatDate(new Date(props.bid.createdAt)) : ''}
						</p>
					</div>

					{#if props.bid.status}
						<span
							class="badge badge-lg capitalize"
							class:badge-success={props.bid.status === 'accepted'}
							class:badge-error={props.bid.status === 'rejected'}
							class:badge-warning={props.bid.status === 'withdrawn'}
							class:badge-info={props.bid.status === 'countered'}
							class:badge-primary={props.bid.status === 'pending'}
						>
							{props.bid.status}
						</span>
					{/if}
				</div>
			</div>

			<!-- Price Details -->
			<div class="card bg-base-200 mb-6">
				<div class="card-body p-4">
					<h3 class="card-title mb-2 text-base">{$t('dashboard.bids.bid_details.price_details')}</h3>
					<div class="flex justify-between">
						<span>{$t('dashboard.bids.bid_details.total_price')}</span>
						<span class="font-bold">
							{props.bid ? formatCurrency(props.bid.amount, props.bid.currency) : ''}
						</span>
					</div>
					{#if props.bid.paymentType === 'HOURLY'}
						<div class="flex justify-between text-sm">
							<span>{$t('dashboard.bids.bid_details.rate_calculation')}</span>
							<span>{getHourlyDetails()}</span>
						</div>
					{/if}
					<div class="flex justify-between text-sm">
						<span>{$t('dashboard.bids.bid_details.payment_method')}</span>
						<span>{props.bid.currency}</span>
					</div>
				</div>
			</div>

			<!-- Proposal -->
			<div class="mb-6">
				<h3 class="mb-2 text-base font-semibold">{$t('dashboard.bids.bid_details.proposal')}</h3>
				<div class="whitespace-pre-line">
					<TranslatableBidContent 
						bid={props.bid as any}
						content={props.bid.description} 
						contentType="description"
					/>
				</div>
			</div>

			<!-- Approach -->
			{#if props.bid.proposedApproach && props.bid.proposedApproach.trim() !== ''}
				<div class="mb-6">
					<h3 class="mb-2 text-base font-semibold">{$t('dashboard.bids.bid_details.proposed_approach')}</h3>
					<div class="whitespace-pre-line">
						<TranslatableBidContent 
							bid={props.bid as any}
							content={props.bid.proposedApproach} 
							contentType="proposedApproach"
						/>
					</div>
				</div>
			{/if}

			<!-- Timeline -->
			<div class="mb-6">
				<h3 class="mb-2 text-base font-semibold">{$t('dashboard.bids.bid_details.estimated_timeline')}</h3>
				<p>{props.bid.estimatedDuration}</p>
			</div>

			<!-- Provider Highlights -->
			{#if props.bid.providerHighlights}
				<div class="mb-6">
					<h3 class="mb-2 text-base font-semibold">{$t('dashboard.bids.bid_details.provider_highlights')}</h3>

					{#if props.bid.providerHighlights.skills && props.bid.providerHighlights.skills.length > 0}
						<div class="mb-3">
							<h4 class="mb-1 text-sm font-medium">{$t('dashboard.bids.bid_details.skills')}</h4>
							<div class="flex flex-wrap gap-1">
								{#each props.bid.providerHighlights.skills as skill}
									<span class="badge badge-outline">{skill}</span>
								{/each}
							</div>
						</div>
					{/if}

					{#if props.bid.providerHighlights.certifications && props.bid.providerHighlights.certifications.length > 0}
						<div class="mb-3">
							<h4 class="mb-1 text-sm font-medium">{$t('dashboard.bids.bid_details.certifications')}</h4>
							<ul class="list-inside list-disc text-sm">
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
					<h3 class="mb-2 text-base font-semibold">{$t('dashboard.bids.bid_details.negotiation_history')}</h3>
					<div class="space-y-3">
						{#each props.counterOffers.sort((a: CounterOffer, b: CounterOffer) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) as offer}
							<CounterOfferItem {offer} bidCurrency={props.bid.currency} />
						{/each}
					</div>
				</div>
			{/if}

			<!-- Action buttons -->
			{#if props.bid?.status === 'PENDING'}
				<div class="mt-8 flex justify-end space-x-2 border-t pt-4">
					<button class="btn btn-error" onclick={() => props.onRejectBid(props.bid)}>{$t('dashboard.bids.bid_details.decline')}</button
					>
					<button class="btn btn-outline" onclick={() => props.onCounterOffer(props.bid)}
						>{$t('dashboard.bids.bid_details.counter')}</button
					>
					<button class="btn btn-primary" onclick={() => props.onAcceptBid(props.bid)}
						>{$t('dashboard.bids.bid_details.accept')}</button
					>
				</div>
			{/if}
		{/if}
	{/snippet}
</Drawer>
