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
		type InstantBuyTimeUnit,
		convertInstantBuyDurationToHours,
		DEFAULT_INSTANT_BUY_LEAD_HOURS,
		DEFAULT_INSTANT_BUY_DELIVERY_HOURS,
		formatInstantBuyDurationInput,
		inferInstantBuyTimeUnit,
		sanitizeInstantBuyLeadHours,
		sanitizeInstantBuyDeliveryHours,
		supportsInstantBuyAuthoring
	} from '$lib/utils/service-instant-buy/authoring';

	let { errors, direction } = $props();

	let btcPrice = $state<number>(0);
	let openDropdownId = $state<string | null>(null);

	function toggleDropdown(id: string) {
		openDropdownId = openDropdownId === id ? null : id;
	}

	const unitOptions = [
		{
			value: 'minute',
			label: () => $t('dashboard.services.create.pricing.instant_buy.unit_minute')
		},
		{ value: 'hour', label: () => $t('dashboard.services.create.pricing.instant_buy.unit_hour') },
		{ value: 'day', label: () => $t('dashboard.services.create.pricing.instant_buy.unit_day') },
		{ value: 'week', label: () => $t('dashboard.services.create.pricing.instant_buy.unit_week') }
	];

	function getUnitLabel(unit: string): string {
		return unitOptions.find((o) => o.value === unit)?.label() || unit;
	}

	let leadTimeUnit = $state<InstantBuyTimeUnit>(
		inferInstantBuyTimeUnit($store.service.instantBuyLeadHours)
	);
	let deliveryTimeUnit = $state<InstantBuyTimeUnit>(
		inferInstantBuyTimeUnit($store.service.instantBuyDeliveryHours)
	);
	let usdAmount = $derived.by(() =>
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
				currency: 'USD'
			}
		});
	}

	function updatePricingType(type: ServicePricingTypeEnum) {
		const currentPricing = $store.service.pricing || {
			type: ServicePricingTypeEnum.TIERED,
			currency: 'USD',
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
				currency: currentPricing.currency === 'USDt' ? 'USD' : (currentPricing.currency ?? 'USD'),
				...(type === ServicePricingTypeEnum.FIXED
					? {
							hourlyRate: undefined,
							estimatedHours: undefined,
							tiers: undefined,
							inquiryForm: undefined
						}
					: {}),
				...(type === ServicePricingTypeEnum.TIERED
					? {
							amount: undefined,
							hourlyRate: undefined,
							estimatedHours: undefined,
							inquiryForm: undefined
						}
					: {}),
				...(type === ServicePricingTypeEnum.INQUIRY_REQUIRED
					? {
							amount: undefined,
							hourlyRate: undefined,
							estimatedHours: undefined,
							tiers: undefined
						}
					: {})
			},
			instantBuyLeadHours: nextInstantBuyLeadHours,
			instantBuyDeliveryHours: nextInstantBuyDeliveryHours
		});
	}

	function toggleInstantBuy(enabled: boolean) {
		if (enabled) {
			leadTimeUnit = inferInstantBuyTimeUnit(DEFAULT_INSTANT_BUY_LEAD_HOURS);
			deliveryTimeUnit = inferInstantBuyTimeUnit(DEFAULT_INSTANT_BUY_DELIVERY_HOURS);
		}

		store.updateService({
			instantBuyLeadHours: enabled ? DEFAULT_INSTANT_BUY_LEAD_HOURS : undefined,
			instantBuyDeliveryHours: enabled ? DEFAULT_INSTANT_BUY_DELIVERY_HOURS : undefined
		});
	}

	function handleInstantBuyLeadHoursChange(event: Event) {
		store.updateService({
			instantBuyLeadHours: convertInstantBuyDurationToHours(
				(event.target as HTMLInputElement).value,
				leadTimeUnit
			)
		});
	}

	function handleInstantBuyDeliveryHoursChange(event: Event) {
		store.updateService({
			instantBuyDeliveryHours: convertInstantBuyDurationToHours(
				(event.target as HTMLInputElement).value,
				deliveryTimeUnit
			)
		});
	}

	onMount(() => {
		fetchBtcPrice();
		if ($store.service.pricing?.currency === 'USDt') {
			store.updateService({
				pricing: {
					...$store.service.pricing,
					currency: 'USD'
				}
			});
		}
	});
</script>

<div
	class="min-w-0 space-y-4"
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: direction === 'forward' ? 20 : -20
	}}
>
	<h4 class="text-lg font-semibold break-words">
		{$t('dashboard.services.create.pricing.budget_question')}
	</h4>

	<!-- Pricing type: FIXED, TIERED, or INQUIRY_REQUIRED -->
	<div class="flex flex-wrap gap-4">
		<button
			type="button"
			class="btn {$store.service.pricing?.type === ServicePricingTypeEnum.FIXED
				? 'btn-primary'
				: 'btn-outline'}"
			onclick={() => updatePricingType(ServicePricingTypeEnum.FIXED)}
		>
			{$t('dashboard.services.create.pricing.fixed_title')}
		</button>
		<button
			type="button"
			class="btn {$store.service.pricing?.type === ServicePricingTypeEnum.TIERED
				? 'btn-primary'
				: 'btn-outline'}"
			onclick={() => updatePricingType(ServicePricingTypeEnum.TIERED)}
		>
			{$t('dashboard.services.create.pricing.tiered_title')}
		</button>
		<button
			type="button"
			class="btn {$store.service.pricing?.type === ServicePricingTypeEnum.INQUIRY_REQUIRED
				? 'btn-primary'
				: 'btn-outline'}"
			onclick={() => updatePricingType(ServicePricingTypeEnum.INQUIRY_REQUIRED)}
		>
			{$t('dashboard.services.create.pricing.inquiry_title')}
		</button>
	</div>

	{#if errors.pricingType}
		<span class="label-text-alt text-error">{errors.pricingType}</span>
	{/if}

	{#if supportsInstantBuyAuthoring($store.service.pricing?.type)}
		<div class="border-base-300 bg-base-100 min-w-0 rounded-2xl border p-4">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="min-w-0">
					<p class="font-medium break-words">
						{$t('dashboard.services.create.pricing.instant_buy.enable_label')}
					</p>
					<p class="text-base-content/70 mt-1 text-sm break-words">
						{$t('dashboard.services.create.pricing.instant_buy.enable_description')}
					</p>
					{#if $store.service.instantBuyLeadHours == null}
						<p
							class="text-base-content/70 mt-2 text-sm break-words"
							data-testid="service-pricing-book-now-off-hint"
						>
							{$t('dashboard.services.create.pricing.instant_buy.off_hint')}
						</p>
					{/if}
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
				{#if $store.service.pricing?.type === ServicePricingTypeEnum.TIERED}
					<div class="alert alert-outline alert-info mt-4">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5 shrink-0"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span class="text-sm"
							>{$t(
								'dashboard.services.create.pricing.instant_buy.delivery_required_for_tiers'
							)}</span
						>
					</div>
				{/if}

				<div class="mt-4 space-y-2" transition:fly={{ y: -10, duration: 200 }}>
					<label for="instant-buy-lead-hours" class="label">
						<span class="label-text"
							>{$t('dashboard.services.create.pricing.instant_buy.lead_time_label')}</span
						>
					</label>
					<div class="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(6rem,8rem)] items-end gap-3">
						<input
							id="instant-buy-lead-hours"
							type="number"
							min="0"
							max={leadTimeUnit === 'minute'
								? '43200'
								: leadTimeUnit === 'hour'
									? '720'
									: undefined}
							step={leadTimeUnit === 'minute' ? '15' : leadTimeUnit === 'hour' ? '1' : '0.5'}
							value={formatInstantBuyDurationInput(
								$store.service.instantBuyLeadHours,
								leadTimeUnit
							)}
							oninput={handleInstantBuyLeadHoursChange}
							class="input input-bordered w-full min-w-0 {errors.instantBuyLeadHours
								? 'input-error'
								: ''}"
							data-testid="service-pricing-instant-buy-lead-hours"
						/>
						<div class="dropdown">
							<button
								type="button"
								class="input input-bordered flex w-full min-w-0 cursor-pointer items-center justify-between"
								onclick={() => toggleDropdown('lead-unit')}
								data-testid="service-pricing-instant-buy-lead-unit"
							>
								<span>{getUnitLabel(leadTimeUnit)}</span>
								<svg
									class="h-4 w-4 opacity-50"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 9l-7 7-7-7"
									/></svg
								>
							</button>
							{#if openDropdownId === 'lead-unit'}
								<ul
									class="dropdown-content menu bg-base-100 rounded-box z-30 w-full shadow"
									transition:fly={{ y: -10, duration: 200 }}
								>
									{#each unitOptions as opt (opt.value)}
										<li>
											<button
												type="button"
												class:active={leadTimeUnit === opt.value}
												onclick={() => {
													leadTimeUnit = opt.value as InstantBuyTimeUnit;
													openDropdownId = null;
												}}>{opt.label()}</button
											>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					</div>
					{#if errors.instantBuyLeadHours}
						<span class="label-text-alt text-error">{errors.instantBuyLeadHours}</span>
					{/if}
				</div>

				<div class="mt-4 space-y-2" transition:fly={{ y: -10, duration: 200 }}>
					<label for="instant-buy-delivery-hours" class="label">
						<span class="label-text"
							>{$t('dashboard.services.create.pricing.instant_buy.delivery_time_label')}</span
						>
					</label>
					<div class="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(6rem,8rem)] items-end gap-3">
						<input
							id="instant-buy-delivery-hours"
							type="number"
							min="1"
							step={deliveryTimeUnit === 'minute'
								? '15'
								: deliveryTimeUnit === 'hour'
									? '1'
									: '0.5'}
							value={formatInstantBuyDurationInput(
								$store.service.instantBuyDeliveryHours,
								deliveryTimeUnit
							)}
							oninput={handleInstantBuyDeliveryHoursChange}
							class="input input-bordered w-full min-w-0 {errors.instantBuyDeliveryHours
								? 'input-error'
								: ''}"
							data-testid="service-pricing-instant-buy-delivery-hours"
						/>
						<div class="dropdown">
							<button
								type="button"
								class="input input-bordered flex w-full min-w-0 cursor-pointer items-center justify-between"
								onclick={() => toggleDropdown('delivery-unit')}
								data-testid="service-pricing-instant-buy-delivery-unit"
							>
								<span>{getUnitLabel(deliveryTimeUnit)}</span>
								<svg
									class="h-4 w-4 opacity-50"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 9l-7 7-7-7"
									/></svg
								>
							</button>
							{#if openDropdownId === 'delivery-unit'}
								<ul
									class="dropdown-content menu bg-base-100 rounded-box z-30 w-full shadow"
									transition:fly={{ y: -10, duration: 200 }}
								>
									{#each unitOptions as opt (opt.value)}
										<li>
											<button
												type="button"
												class:active={deliveryTimeUnit === opt.value}
												onclick={() => {
													deliveryTimeUnit = opt.value as InstantBuyTimeUnit;
													openDropdownId = null;
												}}>{opt.label()}</button
											>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					</div>
					{#if errors.instantBuyDeliveryHours}
						<span class="label-text-alt text-error">{errors.instantBuyDeliveryHours}</span>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Fixed price: amount in USD and Sats -->
	{#if $store.service.pricing?.type === ServicePricingTypeEnum.FIXED}
		<div class="w-full" transition:fly={{ y: -10, duration: 200 }}>
			<label for="budget" class="label">
				<span class="label-text">{$t('dashboard.services.create.pricing.budget_label')}</span>
			</label>
			<UsdSatsInput
				{usdAmount}
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
