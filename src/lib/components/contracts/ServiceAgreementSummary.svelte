<script lang="ts">
	import { locale, t } from 'svelte-i18n';
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

		return new Intl.DateTimeFormat($locale || 'en', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(new Date(timestampSeconds * 1000));
	}

	const estimatedStartLabel = $derived(formatTimestamp(estimatedStartTime));
	const estimatedEndLabel = $derived(formatTimestamp(estimatedCompletionTime));

	function tr(key: string, fallback: string): string {
		try {
			const value = $t(key);
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}
</script>

<div class="space-y-3 text-sm" data-testid="service-agreement-summary">
	{#if providerName}
		<div>
			<span class="text-base-content/50 text-xs font-medium">
				{tr('dashboard.contracts.service_agreement.provider', 'Provider')}
			</span>
			<p class="text-base-content/80 mt-1" data-testid="service-agreement-provider">
				{providerName}
			</p>
		</div>
	{/if}

	{#if quoteRequestId}
		<div>
			<span class="text-base-content/50 text-xs font-medium">
				{tr('dashboard.contracts.service_agreement.quote_request', 'Quote request')}
			</span>
			<p class="text-base-content/80 mt-1">{quoteRequestId}</p>
		</div>
	{/if}

	{#if proposalId}
		<div>
			<span class="text-base-content/50 text-xs font-medium">
				{tr('dashboard.contracts.service_agreement.proposal', 'Proposal')}
			</span>
			<p class="text-base-content/80 mt-1">{proposalId}</p>
		</div>
	{/if}

	{#if instantOrderId}
		<div>
			<span class="text-base-content/50 text-xs font-medium">
				{tr('dashboard.contracts.service_agreement.instant_order', 'Instant order')}
			</span>
			<p class="text-base-content/80 mt-1" data-testid="service-agreement-order">
				{instantOrderId}
			</p>
		</div>
	{/if}

	{#if selectedTierLabel}
		<div>
			<span class="text-base-content/50 text-xs font-medium">
				{tr('dashboard.contracts.service_agreement.selected_tier', 'Selected tier')}
			</span>
			<p class="text-base-content/80 mt-1" data-testid="service-agreement-tier">
				{selectedTierLabel}
			</p>
		</div>
	{/if}

	{#if agreementSnapshot?.deliverables}
		<div>
			<span class="text-base-content/50 text-xs font-medium">
				{tr('dashboard.contracts.service_agreement.included_scope', 'Included scope')}
			</span>
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
			<span class="text-base-content/50 text-xs font-medium">
				{tr('dashboard.contracts.service_agreement.add_ons', 'Add-ons')}
			</span>
			<p class="text-base-content/80 mt-1">{agreementSnapshot.selectedAddOns.join(', ')}</p>
		</div>
	{/if}

	{#if agreementSnapshot?.rushDelivery}
		<div>
			<span class="text-base-content/50 text-xs font-medium">
				{tr('dashboard.contracts.service_agreement.rush_delivery', 'Rush delivery')}
			</span>
			<p class="text-base-content/80 mt-1">
				{tr('dashboard.contracts.service_agreement.included', 'Included')}
			</p>
		</div>
	{/if}

	{#if agreementSnapshot?.inquiryAnswers}
		<div>
			<span class="text-base-content/50 text-xs font-medium">
				{tr('dashboard.contracts.service_agreement.inquiry_answers', 'Inquiry answers')}
			</span>
			<div class="text-base-content/80 mt-1 space-y-1">
				{#each Object.entries(agreementSnapshot.inquiryAnswers) as [key, value] (key)}
					<p><strong>{key}:</strong> {Array.isArray(value) ? value.join(', ') : String(value)}</p>
				{/each}
			</div>
		</div>
	{/if}

	{#if agreementSnapshot?.bookedHours}
		<div>
			<span class="text-base-content/50 text-xs font-medium">
				{tr('dashboard.contracts.service_agreement.booked_hours', 'Hours booked')}
			</span>
			<p class="text-base-content/80 mt-1" data-testid="service-agreement-hours">
				{agreementSnapshot.bookedHours}
			</p>
		</div>
	{/if}

	{#if agreementSnapshot?.priceSnapshotLabel || pricingSnapshot?.serviceVersionRef}
		<div>
			<span class="text-base-content/50 text-xs font-medium">
				{tr('dashboard.contracts.service_agreement.price_snapshot', 'Price snapshot')}
			</span>
			<p class="text-base-content/80 mt-1" data-testid="service-agreement-price">
				{agreementSnapshot?.priceSnapshotLabel ?? pricingSnapshot?.serviceVersionRef}
			</p>
		</div>
	{/if}

	{#if estimatedStartLabel}
		<div>
			<span class="text-base-content/50 text-xs font-medium">
				{tr('dashboard.contracts.service_agreement.estimated_start', 'Estimated start')}
			</span>
			<p class="text-base-content/80 mt-1" data-testid="service-agreement-start">
				{estimatedStartLabel}
			</p>
		</div>
	{/if}

	{#if estimatedEndLabel}
		<div>
			<span class="text-base-content/50 text-xs font-medium">
				{tr('dashboard.contracts.service_agreement.estimated_end', 'Estimated end')}
			</span>
			<p class="text-base-content/80 mt-1" data-testid="service-agreement-end">
				{estimatedEndLabel}
			</p>
		</div>
	{/if}
</div>
