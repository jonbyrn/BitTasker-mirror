<script lang="ts">
	import ServiceAgreementSummary from '$lib/components/contracts/ServiceAgreementSummary.svelte';
	import type {
		ServiceContractAgreementSnapshot,
		ServiceContractPricingSnapshot
	} from '$lib/types/contract';

	let {
		open = false,
		title = 'Confirm Instant Buy',
		serviceTitle = '',
		providerName = null,
		selectedTierLabel = null,
		agreementSnapshot = null,
		pricingSnapshot = null,
		instantOrderId = null,
		estimatedStartTime = null,
		estimatedCompletionTime = null,
		isPreparing = false,
		isSubmitting = false,
		isOffline = false,
		showReconnectNotice = false,
		errorMessage = '',
		errorHint = '',
		canConfirm = true,
		onConfirm = () => {},
		onRetry = () => {},
		onClose = () => {}
	} = $props<{
		open?: boolean;
		title?: string;
		serviceTitle?: string;
		providerName?: string | null;
		selectedTierLabel?: string | null;
		agreementSnapshot?: ServiceContractAgreementSnapshot | null;
		pricingSnapshot?: ServiceContractPricingSnapshot | null;
		instantOrderId?: string | null;
		estimatedStartTime?: number | null;
		estimatedCompletionTime?: number | null;
		isPreparing?: boolean;
		isSubmitting?: boolean;
		isOffline?: boolean;
		showReconnectNotice?: boolean;
		errorMessage?: string;
		errorHint?: string;
		canConfirm?: boolean;
		onConfirm?: () => void;
		onRetry?: () => void;
		onClose?: () => void;
	}>();
</script>

{#if open}
	<div class="modal modal-open" data-testid="service-instant-buy-modal">
		<div class="modal-box max-w-lg">
			<h3 class="text-lg font-semibold">{title}</h3>
			<p class="text-base-content/70 mt-1 text-sm">
				Review the service details before funding the escrow.
			</p>

			<div class="bg-base-200 mt-4 space-y-4 rounded-2xl p-4">
				<div>
					<p class="text-sm font-semibold">{serviceTitle}</p>
				</div>

				{#if isOffline}
					<div
						class="alert alert-warning alert-outline text-sm"
						data-testid="service-instant-buy-offline-alert"
					>
						<span>
							You are offline. Reconnect before funding this service contract. Your current review stays open here.
						</span>
					</div>
				{:else if showReconnectNotice}
					<div
						class="alert alert-info alert-outline text-sm"
						data-testid="service-instant-buy-reconnect-alert"
					>
						<span>Back online. Review the latest details, then confirm when ready.</span>
					</div>
				{/if}

				{#if isPreparing}
					<div class="rounded-xl border border-base-300 bg-base-100 p-4 text-sm">
						<div class="flex items-center gap-2" data-testid="service-instant-buy-preparing">
							<span class="loading loading-spinner loading-sm"></span>
							<span>Loading the latest service snapshot…</span>
						</div>
					</div>
				{:else}
					<ServiceAgreementSummary
						{providerName}
						{selectedTierLabel}
						{agreementSnapshot}
						{pricingSnapshot}
						{instantOrderId}
						{estimatedStartTime}
						estimatedCompletionTime={estimatedCompletionTime}
					/>
				{/if}
			</div>

			{#if errorMessage}
				<div class="alert alert-error alert-outline mt-4" data-testid="service-instant-buy-error">
					<div class="space-y-1">
						<p>{errorMessage}</p>
						{#if errorHint}
							<p class="text-xs opacity-80" data-testid="service-instant-buy-error-hint">
								{errorHint}
							</p>
						{/if}
					</div>
				</div>
			{/if}

			<div class="modal-action">
				<button class="btn btn-ghost" onclick={onClose} disabled={isSubmitting}>
					Cancel
				</button>
				{#if errorMessage && !isSubmitting && !isPreparing}
					<button class="btn btn-outline" onclick={onRetry} data-testid="service-instant-buy-retry">
						Retry
					</button>
				{/if}
				<button
					class="btn btn-primary"
					onclick={onConfirm}
					disabled={isSubmitting || isPreparing || !canConfirm || isOffline}
					data-testid="service-instant-buy-confirm"
				>
					{#if isSubmitting}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					Buy Now
				</button>
			</div>
		</div>
	</div>
{/if}
