<script lang="ts">
	import { t } from 'svelte-i18n';
	import IconCheckCircle from '~icons/mdi/check-circle';
	import IconAlertCircle from '~icons/mdi/alert-circle';
	import {
		friendlyAssetName,
		formatProviderName,
		formatSatsAmount,
		formatUsdFromSats,
		calculateFee,
		isLowestFee
	} from '$lib/utils/fiat-helpers';
	import type { ChangellyOfferSuccess } from '$lib/services/fiat-ramp.service';

	let {
		filteredOffers,
		allPaymentMethods,
		activePaymentFilter,
		selectedOffer,
		quoteLoading,
		quoteError,
		supportedCryptoError,
		providerExpanded,
		amount,
		isBtcAsset,
		selectedCrypto,
		activeTab,
		btcPrice,
		onFilterChange,
		onOfferSelect,
		onExpandToggle
	}: {
		filteredOffers: ChangellyOfferSuccess[];
		allPaymentMethods: { method: string; methodName: string }[];
		activePaymentFilter: string | null;
		selectedOffer: ChangellyOfferSuccess | null;
		quoteLoading: boolean;
		quoteError: boolean;
		supportedCryptoError: string | null;
		providerExpanded: boolean;
		amount: string;
		isBtcAsset: boolean;
		selectedCrypto: string;
		activeTab: 'buy' | 'sell';
		btcPrice: number;
		onFilterChange: (method: string | null) => void;
		onOfferSelect: (offer: ChangellyOfferSuccess) => void;
		onExpandToggle: () => void;
	} = $props();
</script>

<!-- Payment method filter badges -->
<div class="flex flex-wrap gap-1.5">
	<button
		type="button"
		class="badge min-h-[36px] cursor-pointer border px-2 py-1 text-xs transition-colors"
		class:badge-primary={!activePaymentFilter && filteredOffers.length > 0}
		class:badge-ghost={activePaymentFilter !== null || filteredOffers.length === 0}
		class:border-primary={!activePaymentFilter && filteredOffers.length > 0}
		class:border-base-300={activePaymentFilter !== null || filteredOffers.length === 0}
		class:opacity-50={filteredOffers.length === 0}
		disabled={filteredOffers.length === 0}
		onclick={() => {
			onFilterChange(null);
			if (filteredOffers.length > 0) {
				onOfferSelect(filteredOffers[0]);
			}
		}}
	>
		{$t('wallet.buy_sell.filter_all')}
	</button>
	{#each allPaymentMethods as pm (pm.method)}
		<button
			type="button"
			class="badge min-h-[36px] cursor-pointer border px-2 py-1 text-xs transition-colors"
			class:badge-primary={activePaymentFilter === pm.method && filteredOffers.length > 0}
			class:badge-ghost={activePaymentFilter !== pm.method || filteredOffers.length === 0}
			class:border-primary={activePaymentFilter === pm.method && filteredOffers.length > 0}
			class:border-base-300={activePaymentFilter !== pm.method || filteredOffers.length === 0}
			class:opacity-50={filteredOffers.length === 0}
			disabled={filteredOffers.length === 0}
			onclick={() => {
				onFilterChange(pm.method);
				if (filteredOffers.length > 0) {
					onOfferSelect(filteredOffers[0]);
				}
			}}
		>
			{pm.methodName}
		</button>
	{/each}
</div>

<!-- Provider accordion -->
<div
	class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
	class:collapse-open={providerExpanded && filteredOffers.length > 0}
	class:chevron-dimmed={filteredOffers.length === 0 && !quoteLoading && !quoteError}
>
	{#if filteredOffers.length > 0}
		{@const best = filteredOffers[0]}
		{@const selected = selectedOffer ?? best}
		<button
			type="button"
			class="collapse-title flex min-h-[44px] items-center gap-2 px-3 py-2.5 pr-10 text-sm font-medium"
			onclick={onExpandToggle}
			aria-expanded={providerExpanded}
		>
			<div class="min-w-0 flex-1 text-left">
				<div class="text-sm font-medium">
					{formatProviderName(selected.providerCode)}
				</div>
				<div class="text-base-content/60 text-xs">
					{$t('wallet.buy_sell.fee')}: ${calculateFee(selected, amount, isBtcAsset, btcPrice)}
				</div>
			</div>
			<div class="shrink-0 text-right">
				{#if isBtcAsset}
					<div class="text-sm font-semibold tabular-nums">
						{formatSatsAmount(selected)}
						{$t('wallet.buy_sell.sats')}
					</div>
					<div class="text-base-content/60 text-xs tabular-nums">
						≈ ${formatUsdFromSats(selected, btcPrice)}
					</div>
				{:else}
					<div class="text-sm font-semibold tabular-nums">
						${selected.amountExpectedTo}
					</div>
					<div class="text-base-content/60 text-xs">
						{friendlyAssetName(selectedCrypto)}
					</div>
				{/if}
			</div>
			{#if isLowestFee(selected, filteredOffers, amount, isBtcAsset, btcPrice)}
				<IconCheckCircle class="text-success h-5 w-5 shrink-0" />
			{/if}
		</button>
		<div class="collapse-content px-2">
			<div class="space-y-1">
				{#each filteredOffers as offer (offer.providerCode)}
					{@const isSelected = selectedOffer?.providerCode === offer.providerCode}
					{@const isCheapest = isLowestFee(offer, filteredOffers, amount, isBtcAsset, btcPrice)}
					<button
						type="button"
						class="flex w-full items-center gap-2 rounded-lg border-2 border-transparent p-2 transition-colors {isSelected
							? 'bg-primary/10'
							: 'hover:bg-base-200'}"
						onclick={() => onOfferSelect(offer)}
					>
						<div class="min-w-0 flex-1 text-left">
							<div class="text-sm font-medium">
								{formatProviderName(offer.providerCode)}
							</div>
							<div class="text-base-content/60 text-xs">
								{$t('wallet.buy_sell.fee')}: ${calculateFee(offer, amount, isBtcAsset, btcPrice)}
							</div>
						</div>
						<div class="shrink-0 text-right">
							{#if isBtcAsset}
								<div class="text-sm font-semibold tabular-nums">
									{formatSatsAmount(offer)}
									{$t('wallet.buy_sell.sats')}
								</div>
								<div class="text-base-content/60 text-xs tabular-nums">
									≈ ${formatUsdFromSats(offer, btcPrice)}
								</div>
							{:else}
								<div class="text-sm font-semibold tabular-nums">
									${offer.amountExpectedTo}
								</div>
								<div class="text-base-content/60 text-xs">
									{friendlyAssetName(selectedCrypto)}
								</div>
							{/if}
						</div>
						{#if isCheapest}
							<IconCheckCircle class="text-success h-5 w-5 shrink-0" />
						{/if}
					</button>
				{/each}
			</div>
		</div>
	{:else if quoteLoading}
		<div
			class="collapse-title flex min-h-[44px] items-center justify-center gap-2 px-3 py-2.5 pr-10"
		>
			<span class="loading loading-spinner loading-sm text-info"></span>
			<span class="text-base-content/60 text-sm">{$t('wallet.buy_sell.loading_offers')}</span>
		</div>
	{:else if quoteError}
		<div class="collapse-title flex min-h-[44px] items-center gap-2 px-3 py-2.5 pr-10">
			<IconAlertCircle class="text-error h-4 w-4 shrink-0" />
			<span class="text-base-content/60 text-sm">{$t('wallet.buy_sell.no_offers')}</span>
		</div>
	{:else if supportedCryptoError}
		<div class="collapse-title flex min-h-[44px] items-center gap-2 px-3 py-2.5 pr-10">
			<IconAlertCircle class="text-warning h-4 w-4 shrink-0" />
			<span class="text-base-content/60 text-sm"
				>{$t(supportedCryptoError ?? '', {
					values: {
						asset: friendlyAssetName(selectedCrypto),
						action:
							activeTab === 'buy' ? $t('wallet.buy_sell.purchase') : $t('wallet.buy_sell.sale')
					}
				})}</span
			>
		</div>
	{:else}
		<div class="collapse-title flex min-h-[44px] items-center justify-center px-3 py-2.5 pr-10">
			<span class="text-base-content/50 text-sm">{$t('wallet.buy_sell.enter_amount_prompt')}</span>
		</div>
	{/if}
</div>

<style>
	:global(.chevron-dimmed) > :global(.collapse-title)::after {
		color: color-mix(in oklch, var(--color-base-content) 50%, transparent);
	}
</style>
