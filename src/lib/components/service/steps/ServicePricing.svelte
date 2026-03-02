<script lang="ts">
	import { onMount } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { serviceStore as store } from '$lib/stores/service.store';
	import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
	import { t } from 'svelte-i18n';
	import { formatNumberForInput, SATS_PER_BTC } from '$lib/utils/helpers/crypto';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';

	let { errors, direction } = $props();

	// BTC price and USD amount from store (derived — no $effect needed)
	let btcPrice = $state<number>(0);
	let usdAmount = $derived.by(
		() =>
			$store.service.pricing?.type === ServicePricingTypeEnum.FIXED &&
			$store.service.pricing?.amount != null
				? $store.service.pricing.amount
				: 0
	);
	let sats = $derived(
		formatNumberForInput(btcPrice > 0 ? Math.round((usdAmount / btcPrice) * SATS_PER_BTC) : 0)
	);

	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (err) {
			console.error('Error fetching BTC price:', err);
		}
	}

	function cleanInput(value: string): string {
		return value.replace(/[^0-9.,]/g, '');
	}

	function handleUsdChange(event: Event) {
		const rawValue = (event.target as HTMLInputElement).value;
		const input = cleanInput(rawValue);
		let cleanedInput = input.replace(/,/g, '');
		if (cleanedInput.length > 1 && cleanedInput.startsWith('0') && cleanedInput[1] !== '.') {
			cleanedInput = cleanedInput.replace(/^0+/, '') || '0';
		}
		const usdValue = parseFloat(cleanedInput);
		if (!isNaN(usdValue)) {
			store.updateService({
				pricing: {
					...$store.service.pricing!,
					amount: usdValue,
					currency: 'USDt'
				}
			});
		} else {
			store.updateService({
				pricing: {
					...$store.service.pricing!,
					amount: 0,
					currency: 'USDt'
				}
			});
		}
	}

	function handleSatsChange(event: Event) {
		const rawValue = (event.target as HTMLInputElement).value;
		const input = cleanInput(rawValue);
		let cleanedInput = input.replace(/,/g, '');
		if (cleanedInput.length > 1 && cleanedInput.startsWith('0')) {
			cleanedInput = cleanedInput.replace(/^0+/, '') || '0';
		}
		const satsValue = parseInt(cleanedInput, 10);
		if (!isNaN(satsValue) && btcPrice > 0) {
			const usdValue = (satsValue / SATS_PER_BTC) * btcPrice;
			store.updateService({
				pricing: {
					...$store.service.pricing!,
					amount: usdValue,
					currency: 'USDt'
				}
			});
		} else if (!isNaN(satsValue) && satsValue === 0) {
			store.updateService({
				pricing: {
					...$store.service.pricing!,
					amount: 0,
					currency: 'USDt'
				}
			});
		}
	}

	// Update pricing type
	function updatePricingType(type: ServicePricingTypeEnum) {
		const currentPricing = $store.service.pricing || {
			type: ServicePricingTypeEnum.FIXED,
			currency: 'USDt',
			amount: 0
		};

		store.updateService({
			pricing: {
				...currentPricing,
				type,
				...(type === ServicePricingTypeEnum.FIXED
					? { hourlyRate: undefined, estimatedHours: undefined, tiers: undefined, inquiryForm: undefined }
					: {}),
				...(type === ServicePricingTypeEnum.HOURLY
					? { amount: undefined, tiers: undefined, inquiryForm: undefined }
					: {}),
				...(type === ServicePricingTypeEnum.TIERED
					? { amount: undefined, hourlyRate: undefined, estimatedHours: undefined, inquiryForm: undefined }
					: {}),
				...(type === ServicePricingTypeEnum.INQUIRY_REQUIRED
					? { amount: undefined, hourlyRate: undefined, estimatedHours: undefined, tiers: undefined }
					: {})
			}
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

	<!-- Pill buttons (same as Create Task) -->
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

	<!-- Fixed: Presupuesto con $ y Sats (igual que Create Task) -->
	{#if $store.service.pricing?.type === ServicePricingTypeEnum.FIXED}
		<div class="w-full">
			<label for="budget" class="label">
				<span class="label-text">{$t('dashboard.services.create.pricing.budget_label')}</span>
			</label>
			<div class="flex gap-2">
				<div class="relative">
					<span class="text-base-content/70 absolute top-1/2 left-3 z-10 -translate-y-1/2"> $ </span>
					<input
						type="text"
						id="budget-usd"
						value={formatNumberForInput(usdAmount)}
						oninput={handleUsdChange}
						class="input input-bordered w-full pl-7 {errors.amount ? 'input-error' : ''}"
						placeholder="0"
						min="0"
					/>
				</div>
				<div class="relative">
					<span class="text-base-content/70 absolute top-1/2 right-3 z-10 -translate-y-1/2">
						{$t('dashboard.services.create.pricing.sats_label')}
					</span>
					<input
						type="text"
						id="budget-sats"
						value={sats}
						oninput={handleSatsChange}
						class="input input-bordered w-full pr-12 {errors.amount ? 'input-error' : ''}"
						placeholder="0"
						min="0"
					/>
				</div>
			</div>
			{#if errors.amount}
				<span class="label-text-alt text-error">{errors.amount}</span>
			{/if}
			<span class="label-text-alt mt-1 block text-base-content/70">
				{$t('dashboard.services.create.pricing.btc_price')} ${Math.round(btcPrice).toLocaleString()}
			</span>
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
