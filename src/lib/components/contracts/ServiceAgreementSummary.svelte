<script lang="ts">
	import { format } from 'date-fns';
	import type {
		ServiceContractAgreementSnapshot,
		ServiceContractPricingSnapshot
	} from '$lib/types/contract';

	const {
		quoteRequestId = null,
		proposalId = null,
		instantOrderId = null,
		providerName = null,
		selectedTierLabel = null,
		agreementSnapshot = null,
		pricingSnapshot = null,
		estimatedStartTime = null,
		estimatedCompletionTime = null
	} = $props<{
		quoteRequestId?: string | null;
		proposalId?: string | null;
		instantOrderId?: string | null;
		providerName?: string | null;
		selectedTierLabel?: string | null;
		agreementSnapshot?: ServiceContractAgreementSnapshot | null;
		pricingSnapshot?: ServiceContractPricingSnapshot | null;
		estimatedStartTime?: number | null;
		estimatedCompletionTime?: number | null;
	}>();

	function formatTimestamp(timestampSeconds: number | null): string | null {
		if (!timestampSeconds || !Number.isFinite(timestampSeconds)) {
			return null;
		}

		return format(new Date(timestampSeconds * 1000), 'MMM d, yyyy h:mm a');
	}

	const estimatedStartLabel = $derived(formatTimestamp(estimatedStartTime));
	const estimatedEndLabel = $derived(formatTimestamp(estimatedCompletionTime));
</script>

<div class="space-y-3 text-sm" data-testid="service-agreement-summary">
	{#if providerName}
		<div>
			<span class="text-xs font-medium uppercase">Provider</span>
			<p class="text-base-content/80 mt-1" data-testid="service-agreement-provider">
				{providerName}
			</p>
		</div>
	{/if}

	{#if quoteRequestId}
		<div>
			<span class="text-xs font-medium uppercase">Quote request</span>
			<p class="text-base-content/80 mt-1">{quoteRequestId}</p>
		</div>
	{/if}

	{#if proposalId}
		<div>
			<span class="text-xs font-medium uppercase">Proposal</span>
			<p class="text-base-content/80 mt-1">{proposalId}</p>
		</div>
	{/if}

	{#if instantOrderId}
		<div>
			<span class="text-xs font-medium uppercase">Instant order</span>
			<p class="text-base-content/80 mt-1" data-testid="service-agreement-order">
				{instantOrderId}
			</p>
		</div>
	{/if}

	{#if selectedTierLabel}
		<div>
			<span class="text-xs font-medium uppercase">Selected tier</span>
			<p class="text-base-content/80 mt-1" data-testid="service-agreement-tier">
				{selectedTierLabel}
			</p>
		</div>
	{/if}

	{#if agreementSnapshot?.deliverables}
		<div>
			<span class="text-xs font-medium uppercase">Included scope</span>
			<p
				class="text-base-content/80 mt-1 whitespace-pre-line"
				data-testid="service-agreement-scope"
			>
				{agreementSnapshot.deliverables}
			</p>
		</div>
	{/if}

	{#if agreementSnapshot?.selectedAddOns?.length}
		<div>
			<span class="text-xs font-medium uppercase">Add-ons</span>
			<p class="text-base-content/80 mt-1">{agreementSnapshot.selectedAddOns.join(', ')}</p>
		</div>
	{/if}

	{#if agreementSnapshot?.rushDelivery}
		<div>
			<span class="text-xs font-medium uppercase">Rush delivery</span>
			<p class="text-base-content/80 mt-1">Included</p>
		</div>
	{/if}

	{#if agreementSnapshot?.inquiryAnswers}
		<div>
			<span class="text-xs font-medium uppercase">Inquiry answers</span>
			<div class="mt-1 space-y-1 text-base-content/80">
				{#each Object.entries(agreementSnapshot.inquiryAnswers) as [key, value]}
					<p><strong>{key}:</strong> {Array.isArray(value) ? value.join(', ') : String(value)}</p>
				{/each}
			</div>
		</div>
	{/if}

	{#if agreementSnapshot?.priceSnapshotLabel || pricingSnapshot?.serviceVersionRef}
		<div>
			<span class="text-xs font-medium uppercase">Price snapshot</span>
			<p class="text-base-content/80 mt-1" data-testid="service-agreement-price">
				{agreementSnapshot?.priceSnapshotLabel ?? pricingSnapshot?.serviceVersionRef}
			</p>
		</div>
	{/if}

	{#if estimatedStartLabel}
		<div>
			<span class="text-xs font-medium uppercase">Estimated start</span>
			<p class="text-base-content/80 mt-1" data-testid="service-agreement-start">
				{estimatedStartLabel}
			</p>
		</div>
	{/if}

	{#if estimatedEndLabel}
		<div>
			<span class="text-xs font-medium uppercase">Estimated end</span>
			<p class="text-base-content/80 mt-1" data-testid="service-agreement-end">
				{estimatedEndLabel}
			</p>
		</div>
	{/if}
</div>
