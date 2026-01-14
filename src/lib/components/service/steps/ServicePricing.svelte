<script lang="ts">
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { serviceStore as store } from '$lib/stores/service.store';
	import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
	import { t } from 'svelte-i18n';

	let { errors, direction } = $props();

	// Initialize pricing if not set
	$effect(() => {	
		if (!$store.service.pricing) {
			store.updateService({
				pricing: {
					type: ServicePricingTypeEnum.FIXED,
					currency: 'USDt',
					amount: 0
				}
			});
		}
	});

	// Update pricing type
	function updatePricingType(type: ServicePricingTypeEnum) {
		const currentPricing = $store.service.pricing || {
			type: ServicePricingTypeEnum.FIXED,
			currency: 'USDt',
			amount: 0
		};

		// Preserve currency when changing type
		store.updateService({
			pricing: {
				...currentPricing,
				type,
				// Clear type-specific fields when switching types
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
</script>

<div
	class="space-y-6"
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: direction === 'forward' ? 20 : -20
	}}
>
	<div class="w-full">
		<label class="label" for="pricing-type">
			<span class="label-text-alt">{$t('dashboard.services.create.pricing.type_hint')}</span>
		</label>

		<div class="space-y-3">
			<!-- Fixed Pricing -->
			<label class="flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors {$store.service.pricing?.type === ServicePricingTypeEnum.FIXED ? 'border-primary bg-primary/10' : 'border-base-300'}">
				<input
					type="radio"
					name="pricingType"
					class="radio radio-primary"
					checked={$store.service.pricing?.type === ServicePricingTypeEnum.FIXED}
					onchange={() => updatePricingType(ServicePricingTypeEnum.FIXED)}
				/>
				<div class="flex-1">
					<div class="font-semibold">{$t('dashboard.services.create.pricing.fixed_title')}</div>
					<div class="text-sm text-base-content/70">{$t('dashboard.services.create.pricing.fixed_description')}</div>
				</div>
			</label>

			<!-- Hourly Pricing -->
			<label class="flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors {$store.service.pricing?.type === ServicePricingTypeEnum.HOURLY ? 'border-primary bg-primary/10' : 'border-base-300'}">
				<input
					type="radio"
					name="pricingType"
					class="radio radio-primary"
					checked={$store.service.pricing?.type === ServicePricingTypeEnum.HOURLY}
					onchange={() => updatePricingType(ServicePricingTypeEnum.HOURLY)}
				/>
				<div class="flex-1">
					<div class="font-semibold">{$t('dashboard.services.create.pricing.hourly_title')}</div>
					<div class="text-sm text-base-content/70">{$t('dashboard.services.create.pricing.hourly_description')}</div>
				</div>
			</label>

			<!-- Tiered Pricing -->
			<label class="flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors {$store.service.pricing?.type === ServicePricingTypeEnum.TIERED ? 'border-primary bg-primary/10' : 'border-base-300'}">
				<input
					type="radio"
					name="pricingType"
					class="radio radio-primary"
					checked={$store.service.pricing?.type === ServicePricingTypeEnum.TIERED}
					onchange={() => updatePricingType(ServicePricingTypeEnum.TIERED)}
				/>
				<div class="flex-1">
					<div class="font-semibold">{$t('dashboard.services.create.pricing.tiered_title')}</div>
					<div class="text-sm text-base-content/70">{$t('dashboard.services.create.pricing.tiered_description')}</div>
				</div>
			</label>

			<!-- Inquiry Required -->
			<label class="flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors {$store.service.pricing?.type === ServicePricingTypeEnum.INQUIRY_REQUIRED ? 'border-primary bg-primary/10' : 'border-base-300'}">
				<input
					type="radio"
					name="pricingType"
					class="radio radio-primary"
					checked={$store.service.pricing?.type === ServicePricingTypeEnum.INQUIRY_REQUIRED}
					onchange={() => updatePricingType(ServicePricingTypeEnum.INQUIRY_REQUIRED)}
				/>
				<div class="flex-1">
					<div class="font-semibold">{$t('dashboard.services.create.pricing.inquiry_title')}</div>
					<div class="text-sm text-base-content/70">{$t('dashboard.services.create.pricing.inquiry_description')}</div>
				</div>
			</label>
		</div>

		{#if errors.pricingType}
			<span class="label-text-alt text-error">{errors.pricingType}</span>
		{/if}
	</div>

	<!-- Currency Selection -->
	<div class="w-full">
		<label for="currency" class="label" id="currency-label">
			<span class="label-text">{$t('dashboard.services.create.pricing.currency_label')}</span>
		</label>
		<select
			id="currency"
			class="select select-bordered w-full"
			value={$store.service.pricing?.currency || 'USDt'}
			onchange={(e) => {
				const currency = (e.target as HTMLSelectElement).value;
				store.updateService({
					pricing: {
						...$store.service.pricing!,
						currency
					}
				});
			}}
		>
			<option value="USDt">USDt (Tether on Liquid)</option>
			<option value="BTC">BTC (Bitcoin)</option>
		</select>
	</div>

	<!-- Fixed Pricing Fields -->
	{#if $store.service.pricing?.type === ServicePricingTypeEnum.FIXED}
		<div class="w-full">
			<label for="fixedAmount" class="label" id="fixedAmount-label">
				<span class="label-text">{$t('dashboard.services.create.pricing.fixed_amount_label')}</span>
			</label>
			<div class="flex gap-2">
				<input
					type="number"
					id="fixedAmount"
					min="0"
					step="0.01"
					value={$store.service.pricing?.amount || 0}
					onchange={(e) => {
						const amount = Number((e.target as HTMLInputElement).value);
						store.updateService({
							pricing: {
								...$store.service.pricing!,
								amount
							}
						});
					}}
					class="input input-bordered flex-1 {errors.amount ? 'input-error' : ''}"
				/>
				<span class="flex items-center px-4 text-sm font-semibold">
					{$store.service.pricing?.currency || 'USDt'}
				</span>
			</div>
			{#if errors.amount}
				<span class="label-text-alt text-error">{errors.amount}</span>
			{/if}
		</div>
	{/if}

	<!-- Hourly Pricing Fields -->
	{#if $store.service.pricing?.type === ServicePricingTypeEnum.HOURLY}
		<div class="w-full">
			<label for="hourlyRate" class="label" id="hourlyRate-label">
				<span class="label-text">{$t('dashboard.services.create.pricing.hourly_rate_label')}</span>
			</label>
			<div class="flex gap-2">
				<input
					type="number"
					id="hourlyRate"
					min="0"
					step="0.01"
					value={$store.service.pricing?.hourlyRate || 0}
					onchange={(e) => {
						const hourlyRate = Number((e.target as HTMLInputElement).value);
						store.updateService({
							pricing: {
								...$store.service.pricing!,
								hourlyRate
							}
						});
					}}
					class="input input-bordered flex-1 {errors.hourlyRate ? 'input-error' : ''}"
				/>
				<span class="flex items-center px-4 text-sm font-semibold">
					{$store.service.pricing?.currency || 'USDt'}/{$t('dashboard.services.create.pricing.hour')}
				</span>
			</div>
			{#if errors.hourlyRate}
				<span class="label-text-alt text-error">{errors.hourlyRate}</span>
			{/if}
		</div>

		<div class="w-full">
			<label for="estimatedHours" class="label" id="estimatedHours-label">
				<span class="label-text">{$t('dashboard.services.create.pricing.estimated_hours_label')}</span>
				<span class="label-text-alt">{$t('dashboard.services.create.pricing.estimated_hours_hint')}</span>
			</label>
			<input
				type="number"
				id="estimatedHours"
				min="0"
				step="0.5"
				value={$store.service.pricing?.estimatedHours || ''}
				onchange={(e) => {
					const estimatedHours = (e.target as HTMLInputElement).value
						? Number((e.target as HTMLInputElement).value)
						: undefined;
					store.updateService({
						pricing: {
							...$store.service.pricing!,
							estimatedHours
						}
					});
				}}
				class="input input-bordered w-full"
				placeholder={$t('dashboard.services.create.pricing.estimated_hours_placeholder')}
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

