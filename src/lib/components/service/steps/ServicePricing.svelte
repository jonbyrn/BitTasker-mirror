<script lang="ts">
	import { onMount } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { serviceStore as store } from '$lib/stores/service.store';
	import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
	import { t } from 'svelte-i18n';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import UsdSatsInput from '$lib/components/shared/UsdSatsInput.svelte';
	import {
		DEFAULT_INSTANT_BUY_LEAD_HOURS,
		DEFAULT_INSTANT_BUY_DELIVERY_HOURS,
		sanitizeInstantBuyLeadHours,
		sanitizeInstantBuyDeliveryHours,
		supportsInstantBuyAuthoring
	} from '$lib/utils/service-instant-buy/authoring';

	let { errors, direction } = $props();

	let btcPrice = $state<number>(0);
	let usdAmount = $derived.by(
		() =>
			$store.service.pricing?.type === ServicePricingTypeEnum.FIXED &&
			$store.service.pricing?.amount != null
				? $store.service.pricing.amount
				: 0
	);
	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (err) {
			console.error('Error fetching BTC price:', err);
		}
	}

	function updateFixedPricingAmount(nextUsdValue: number): void {
		store.updateService({
			pricing: {
				...$store.service.pricing!,
				type: ServicePricingTypeEnum.FIXED,
				amount: nextUsdValue,
				currency: 'USDt'
			}
		});
	}

	function updatePricingType(type: ServicePricingTypeEnum) {
		const currentPricing = $store.service.pricing || {
			type: ServicePricingTypeEnum.TIERED,
			currency: 'USDt',
			amount: 0
		};
		const nextInstantBuyLeadHours = sanitizeInstantBuyLeadHours(
			type,
			$store.service.instantBuyLeadHours
		);
		const nextInstantBuyDeliveryHours = sanitizeInstantBuyDeliveryHours(
			type,
			$store.service.instantBuyDeliveryHours
		);

		store.updateService({
			pricing: {
				...currentPricing,
				type,
				...(type === ServicePricingTypeEnum.FIXED
					? { hourlyRate: undefined, estimatedHours: undefined, tiers: undefined, inquiryForm: undefined }
					: {}),
				...(type === ServicePricingTypeEnum.TIERED
					? { amount: undefined, hourlyRate: undefined, estimatedHours: undefined, inquiryForm: undefined }
					: {}),
				...(type === ServicePricingTypeEnum.INQUIRY_REQUIRED
					? { amount: undefined, hourlyRate: undefined, estimatedHours: undefined, tiers: undefined }
					: {})
			},
			instantBuyLeadHours: nextInstantBuyLeadHours,
			instantBuyDeliveryHours: nextInstantBuyDeliveryHours
		});
	}

	function toggleInstantBuy(enabled: boolean) {
		store.updateService({
			instantBuyLeadHours: enabled ? DEFAULT_INSTANT_BUY_LEAD_HOURS : undefined,
			instantBuyDeliveryHours: enabled ? DEFAULT_INSTANT_BUY_DELIVERY_HOURS : undefined
		});
	}

	function handleInstantBuyLeadHoursChange(event: Event) {
		const rawValue = (event.target as HTMLInputElement).value.trim();
		if (!rawValue) {
			store.updateService({ instantBuyLeadHours: undefined });
			return;
		}

		const parsedValue = Number.parseInt(rawValue, 10);
		store.updateService({
			instantBuyLeadHours: Number.isNaN(parsedValue) ? undefined : parsedValue
		});
	}

	function handleInstantBuyDeliveryHoursChange(event: Event) {
		const rawValue = (event.target as HTMLInputElement).value.trim();
		if (!rawValue) {
			store.updateService({ instantBuyDeliveryHours: undefined });
			return;
		}

		const parsedValue = Number.parseInt(rawValue, 10);
		store.updateService({
			instantBuyDeliveryHours: Number.isNaN(parsedValue) ? undefined : parsedValue
		});
	}

	onMount(() => {
		fetchBtcPrice();
	});
</script>

<div
	class="space-y-4"
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: direction === 'forward' ? 20 : -20
	}}
>
	<h4 class="text-lg font-semibold">{$t('dashboard.services.create.pricing.budget_question')}</h4>

	<!-- Pricing type: FIXED, TIERED, or INQUIRY_REQUIRED -->
	<div class="flex flex-wrap gap-4">
		<button
			type="button"
			class="btn {$store.service.pricing?.type === ServicePricingTypeEnum.FIXED ? 'btn-primary' : 'btn-outline'}"
			onclick={() => updatePricingType(ServicePricingTypeEnum.FIXED)}
		>
			{$t('dashboard.services.create.pricing.fixed_title')}
		</button>
		<button
			type="button"
			class="btn {$store.service.pricing?.type === ServicePricingTypeEnum.TIERED ? 'btn-primary' : 'btn-outline'}"
			onclick={() => updatePricingType(ServicePricingTypeEnum.TIERED)}
		>
			{$t('dashboard.services.create.pricing.tiered_title')}
		</button>
		<button
			type="button"
			class="btn {$store.service.pricing?.type === ServicePricingTypeEnum.INQUIRY_REQUIRED ? 'btn-primary' : 'btn-outline'}"
			onclick={() => updatePricingType(ServicePricingTypeEnum.INQUIRY_REQUIRED)}
		>
			{$t('dashboard.services.create.pricing.inquiry_title')}
		</button>
	</div>

	{#if errors.pricingType}
		<span class="label-text-alt text-error">{errors.pricingType}</span>
	{/if}

	{#if supportsInstantBuyAuthoring($store.service.pricing?.type)}
		<div class="rounded-2xl border border-base-300 bg-base-100 p-4">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p class="font-medium">{$t('dashboard.services.create.pricing.instant_buy.enable_label')}</p>
					<p class="mt-1 text-sm text-base-content/70">
						{$t('dashboard.services.create.pricing.instant_buy.enable_description')}
					</p>
				</div>
				<input
					type="checkbox"
					class="toggle toggle-primary"
					checked={$store.service.instantBuyLeadHours != null}
					onchange={(event) => toggleInstantBuy((event.target as HTMLInputElement).checked)}
					data-testid="service-pricing-instant-buy-toggle"
				/>
			</div>

			{#if $store.service.instantBuyLeadHours != null}
				<div class="mt-4">
					<label for="instant-buy-lead-hours" class="label">
						<span class="label-text">{$t('dashboard.services.create.pricing.instant_buy.lead_time_label')}</span>
					</label>
					<input
						id="instant-buy-lead-hours"
						type="number"
						min="0"
						max="720"
						step="1"
						value={$store.service.instantBuyLeadHours}
						oninput={handleInstantBuyLeadHoursChange}
						class="input input-bordered w-full max-w-xs {errors.instantBuyLeadHours ? 'input-error' : ''}"
						data-testid="service-pricing-instant-buy-lead-hours"
					/>
					{#if errors.instantBuyLeadHours}
						<span class="label-text-alt text-error">{errors.instantBuyLeadHours}</span>
					{/if}
				</div>

				<div class="mt-4">
					<label for="instant-buy-delivery-hours" class="label">
						<span class="label-text">{$t('dashboard.services.create.pricing.instant_buy.delivery_time_label')}</span>
					</label>
					<input id="instant-buy-delivery-hours" type="number" min="1" step="1"
						value={$store.service.instantBuyDeliveryHours}
						oninput={handleInstantBuyDeliveryHoursChange}
						class="input input-bordered w-full max-w-xs {errors.instantBuyDeliveryHours ? 'input-error' : ''}"
						data-testid="service-pricing-instant-buy-delivery-hours" />
					{#if errors.instantBuyDeliveryHours}
						<span class="label-text-alt text-error">{errors.instantBuyDeliveryHours}</span>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Fixed price: amount in USD and Sats -->
	{#if $store.service.pricing?.type === ServicePricingTypeEnum.FIXED}
		<div class="w-full">
			<label for="budget" class="label">
				<span class="label-text">{$t('dashboard.services.create.pricing.budget_label')}</span>
			</label>
			<UsdSatsInput
				usdAmount={usdAmount}
				{btcPrice}
				error={errors.amount}
				showFieldLabels={false}
				usdInputId="budget-usd"
				satsInputId="budget-sats"
				btcPriceLabel={$t('dashboard.services.create.pricing.btc_price')}
				satsLabel={$t('dashboard.services.create.pricing.sats_label')}
				onUsdChange={({ usdAmount: nextUsdAmount }) => updateFixedPricingAmount(nextUsdAmount)}
				onSatsChange={({ usdAmount: nextUsdAmount }) => {
					if (nextUsdAmount != null) {
						updateFixedPricingAmount(nextUsdAmount);
					}
				}}
			/>
		</div>
	{/if}

	<!-- Tiered Pricing Note -->
	{#if $store.service.pricing?.type === ServicePricingTypeEnum.TIERED}
		<div class="alert alert-outline alert-info" id="tiered-note">
			<span>{$t('dashboard.services.create.pricing.tiered_note')}</span>
		</div>
	{/if}

	<!-- Inquiry Required Note -->
	{#if $store.service.pricing?.type === ServicePricingTypeEnum.INQUIRY_REQUIRED}
		<div class="alert alert-outline alert-info" id="inquiry-note">
			<span>{$t('dashboard.services.create.pricing.inquiry_note')}</span>
		</div>
	{/if}
</div>
