<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { Service, QuoteRequestPayload } from '$lib/types/service.d';
	import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
	import { walletStore } from '$lib/stores/wallet/wallet-state';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import ServiceInstantBuyModal from '$lib/components/service/ServiceInstantBuyModal.svelte';
	import RequestQuoteModal from '$lib/components/service/RequestQuoteModal.svelte';
	import SubjectReviews from '$lib/components/reviews/SubjectReviews.svelte';

	let {
		service,
		serviceId = '',
		isPreview = false,
		isDraft = false,
		previewCreator = null,
		onQuoteSubmit = async (_payload: QuoteRequestPayload) => {},
		onContact = undefined
	}: {
		service: Service | null;
		serviceId?: string;
		isPreview?: boolean;
		isDraft?: boolean;
		previewCreator?: {
			username: string;
			avatar?: string;
			rating?: number;
			ratingCount?: number;
		} | null;
		onQuoteSubmit?: (payload: QuoteRequestPayload) => Promise<void> | void;
		onContact?: (() => void) | undefined;
	} = $props();

	const displayTitle = $derived(service?.title || $t('dashboard.services.detail.title'));
	const displayDescription = $derived(service?.description || '');
	const pricingLabel = $derived(service?.pricing?.currency ?? 'USD');

	// ── Checkout state (Book Now → ContractRune funding via UTXEO SDK) ────────
	let instantBuyOpen = $state(false);
	let quoteModalOpen = $state(false);

	const isInteractive = $derived(!isPreview && !isDraft && service?.status === 'active');
	const pricingType = $derived(service?.pricing?.type);

	/** Cheapest tier or fixed price — the amount funded into the RGB escrow. */
	const checkoutAmountUsd = $derived.by(() => {
		if (!service) return null;
		if (pricingType === ServicePricingTypeEnum.TIERED && service.pricing.tiers?.length) {
			return Math.min(...service.pricing.tiers.map((tier) => tier.price));
		}
		return service.pricing?.amount ?? null;
	});
	const cheapestTierLabel = $derived.by(() => {
		if (pricingType !== ServicePricingTypeEnum.TIERED || !service?.pricing.tiers?.length) {
			return null;
		}
		const cheapest = service.pricing.tiers.reduce((a, b) => (a.price <= b.price ? a : b));
		return cheapest.name;
	});
	const canBookNow = $derived(isInteractive && checkoutAmountUsd !== null && checkoutAmountUsd > 0);
	const canRequestQuote = $derived(isInteractive);

	// ── Wallet state passed into the funding drawer ───────────────────────────
	const walletConnected = $derived($walletStore.isConnected && $walletStore.rgb?.initialized);
	const walletSats = $derived($walletStore.rgb?.balanceSats ?? 0);
	const walletBalanceSatsLabel = $derived(walletSats.toLocaleString());
	const walletBalanceUsdLabel = $derived(
		btcPrice.price > 0 ? `$${((walletSats / 100_000_000) * btcPrice.price).toFixed(2)}` : '—'
	);
	const requiredSats = $derived(
		btcPrice.price > 0 && checkoutAmountUsd !== null
			? Math.round(((checkoutAmountUsd * 1.025 + 0.5) / btcPrice.price) * 100_000_000)
			: 0
	);
	const requiredBalanceUsdLabel = $derived(
		checkoutAmountUsd !== null ? `$${(checkoutAmountUsd * 1.025 + 0.5).toFixed(2)}` : '—'
	);

	function openInstantBuy(): void {
		if (canBookNow) instantBuyOpen = true;
	}

	function openQuoteModal(): void {
		if (canRequestQuote) quoteModalOpen = true;
	}
</script>

{#if service}
	<article class="space-y-5" data-service-id={serviceId} data-preview={isPreview || isDraft}>
		<header class="space-y-2">
			<div class="flex items-start justify-between gap-3">
				<div>
					<h1 class="text-2xl font-semibold">{displayTitle}</h1>
					{#if previewCreator}
						<p class="text-base-content/60 text-sm">{previewCreator.username}</p>
					{/if}
				</div>
				<span class="badge badge-outline">{service.status}</span>
			</div>
			<p class="text-base-content/70 text-sm whitespace-pre-wrap">{displayDescription}</p>
		</header>

		<section class="border-base-300 space-y-2 rounded-lg border p-4">
			<h2 class="font-semibold">{$t('dashboard.services.detail.pricing')}</h2>
			<p class="text-base-content/70 text-sm">
				{service.pricing?.type ?? $t('dashboard.services.create.review.not_set')} · {pricingLabel}
			</p>
			{#if service.pricing?.amount != null}
				<p class="text-primary text-xl font-semibold">{service.pricing.amount} {pricingLabel}</p>
			{/if}
		</section>

		<SubjectReviews
			subjectIds={[serviceId, service.id, service.uniqueId].filter(
				(id): id is string => typeof id === 'string' && id.length > 0
			)}
		/>

		{#if service.skills?.length}
			<section class="space-y-2">
				<h2 class="font-semibold">{$t('dashboard.services.detail.skills')}</h2>
				<div class="flex flex-wrap gap-2">
					{#each service.skills as skill (skill)}
						<span class="badge badge-ghost">{skill}</span>
					{/each}
				</div>
			</section>
		{/if}

		{#if isInteractive}
			<section
				class="border-base-300 space-y-3 rounded-lg border p-4"
				data-testid="service-checkout-actions"
			>
				<h2 class="font-semibold">{$t('dashboard.services.detail.interested')}</h2>
				<div class="flex flex-col gap-2 sm:flex-row">
					{#if canBookNow}
						<button
							type="button"
							class="btn btn-primary flex-1"
							onclick={openInstantBuy}
							data-testid="book-now-button"
						>
							{$t('dashboard.services.detail.book_now')}
							{#if checkoutAmountUsd !== null}
								<span class="ml-1 font-bold">${checkoutAmountUsd.toFixed(2)}</span>
							{/if}
						</button>
					{/if}
					{#if canRequestQuote}
						<button
							type="button"
							class="btn btn-outline flex-1"
							onclick={openQuoteModal}
							data-testid="request-quote-button"
						>
							{$t('dashboard.services.detail.request_quote')}
						</button>
					{/if}
					{#if onContact}
						<button
							type="button"
							class="btn btn-ghost flex-1"
							onclick={onContact}
							data-testid="contact-taskee-button"
						>
							{$t('dashboard.services.detail.contact_taskee')}
						</button>
					{/if}
				</div>
			</section>
		{/if}
	</article>

	{#if service}
		<ServiceInstantBuyModal
			open={instantBuyOpen}
			serviceTitle={service.title}
			providerName={service.creator?.username ?? null}
			providerAvatar={service.creator?.avatar ?? null}
			providerPubkey={service.npub ?? null}
			amountUsd={checkoutAmountUsd}
			escrowInvoice={service.escrowInvoice ?? null}
			selectedTierLabel={cheapestTierLabel}
			agreementSnapshot={{
				deliverables: service.description,
				priceSnapshotLabel: checkoutAmountUsd !== null ? `$${checkoutAmountUsd.toFixed(2)}` : ''
			}}
			pricingSnapshot={{ serviceVersionRef: service.id }}
			{walletConnected}
			walletBalanceSats={walletBalanceSatsLabel}
			walletBalanceUsd={walletBalanceUsdLabel}
			requiredBalanceSats={requiredSats.toLocaleString()}
			requiredBalanceUsd={requiredBalanceUsdLabel}
			onClose={() => (instantBuyOpen = false)}
			onConfirm={() => (instantBuyOpen = false)}
		/>

		<RequestQuoteModal
			bind:open={quoteModalOpen}
			{service}
			onConfirm={onQuoteSubmit}
			onClose={() => (quoteModalOpen = false)}
		/>
	{/if}
{:else}
	<div class="p-6 text-center text-sm opacity-70">{$t('dashboard.services.detail.not_found')}</div>
{/if}
