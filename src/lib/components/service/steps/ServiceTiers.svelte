<script lang="ts">
	import { onMount } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fly, fade } from 'svelte/transition';
	import { serviceStore as store } from '$lib/stores/service.store';
	import type { RushDelivery, ServiceTier, TierDeliveryTime } from '$lib/types/service.d';
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import UsdSatsInput from '$lib/components/shared/UsdSatsInput.svelte';

	let { errors, direction } = $props();

	let btcPrice = $state<number>(0);

	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (err) {
			console.error('Error fetching BTC price:', err);
		}
	}

	function updateTierPrice(tierId: string, nextUsdPrice: number): void {
		updateTier(tierId, { price: nextUsdPrice });
	}

	function formatTierDeliveryTime(deliveryTime: TierDeliveryTime): string {
		return `${deliveryTime.value} ${deliveryTime.unit}${deliveryTime.value > 1 ? 's' : ''}`;
	}

	function createDefaultTierDeliveryTime(): TierDeliveryTime {
		return {
			value: 5,
			unit: 'day',
			display: '5 days'
		};
	}

	function createDefaultRushDelivery(): RushDelivery {
		return {
			enabled: true,
			price: 0,
			deliveryTime: {
				value: 2,
				unit: 'day',
				display: '2 days'
			}
		};
	}

	onMount(() => {
		fetchBtcPrice();
		if (!$store.service.pricing?.tiers || $store.service.pricing.tiers.length === 0) {
			const translate = get(t);
			const defaultTiers: ServiceTier[] = [
				{
					id: crypto.randomUUID(),
					name: translate('dashboard.services.create.tiers.default_basic'),
					description: '',
					price: 0,
					features: []
				},
				{
					id: crypto.randomUUID(),
					name: translate('dashboard.services.create.tiers.default_standard'),
					description: '',
					price: 0,
					features: [],
					isPopular: true
				},
				{
					id: crypto.randomUUID(),
					name: translate('dashboard.services.create.tiers.default_premium'),
					description: '',
					price: 0,
					features: []
				}
			];

			store.updateService({
				pricing: {
					...$store.service.pricing!,
					tiers: defaultTiers
				}
			});
		}
	});

	function addTier() {
		const currentTiers = $store.service.pricing?.tiers || [];
		if (currentTiers.length >= 4) return;

		const translate = get(t);
		const newTier: ServiceTier = {
			id: crypto.randomUUID(),
			name: translate('dashboard.services.create.tiers.tier_number', {
				values: { n: currentTiers.length + 1 }
			}),
			description: '',
			price: 0,
			features: []
		};

		store.updateService({
			pricing: {
				...$store.service.pricing!,
				tiers: [...currentTiers, newTier]
			}
		});
	}

	function removeTier(tierId: string) {
		const currentTiers = $store.service.pricing?.tiers || [];
		if (currentTiers.length <= 2) return;

		store.updateService({
			pricing: {
				...$store.service.pricing!,
				tiers: currentTiers.filter((tier) => tier.id !== tierId)
			}
		});
	}

	function updateTier(tierId: string, updates: Partial<ServiceTier>) {
		const currentTiers = $store.service.pricing?.tiers || [];
		store.updateService({
			pricing: {
				...$store.service.pricing!,
				tiers: currentTiers.map((tier) => (tier.id === tierId ? { ...tier, ...updates } : tier))
			}
		});
	}

	function togglePopularTier(tierId: string) {
		const currentTiers = $store.service.pricing?.tiers || [];
		const nextPopularState = !currentTiers.find((tier) => tier.id === tierId)?.isPopular;

		store.updateService({
			pricing: {
				...$store.service.pricing!,
				tiers: currentTiers.map((tier) => ({
					...tier,
					isPopular: tier.id === tierId ? nextPopularState : false
				}))
			}
		});
	}

	function addFeature(tierId: string) {
		const tier = $store.service.pricing?.tiers?.find((item) => item.id === tierId);
		if (!tier) return;

		updateTier(tierId, {
			features: [...(tier.features || []), '']
		});
	}

	function updateFeature(tierId: string, featureIndex: number, value: string) {
		const tier = $store.service.pricing?.tiers?.find((item) => item.id === tierId);
		if (!tier) return;

		const nextFeatures = [...(tier.features || [])];
		nextFeatures[featureIndex] = value;
		updateTier(tierId, { features: nextFeatures });
	}

	function removeFeature(tierId: string, featureIndex: number) {
		const tier = $store.service.pricing?.tiers?.find((item) => item.id === tierId);
		if (!tier) return;

		updateTier(tierId, {
			features: (tier.features || []).filter((_, index) => index !== featureIndex)
		});
	}

	function updateDeliveryTime(tierId: string, deliveryTime: TierDeliveryTime | undefined) {
		updateTier(tierId, { deliveryTime });
	}

	function updateRushDelivery(tierId: string, rushDelivery: RushDelivery | undefined) {
		updateTier(tierId, { rushDelivery });
	}

	function toggleRushDelivery(tierId: string, enabled: boolean) {
		updateRushDelivery(tierId, enabled ? createDefaultRushDelivery() : undefined);
	}
</script>

<div
	class="min-w-0 space-y-6 overflow-x-hidden"
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: direction === 'forward' ? 20 : -20
	}}
>
	<div class="w-full">
		<label class="label" for="tiers-title">
			<span class="label-text-alt wrap-break-words">
				{$t('dashboard.services.create.tiers.hint')} ({($store.service.pricing?.tiers || [])
					.length}/4)
			</span>
		</label>
	</div>

	{#each $store.service.pricing?.tiers || [] as tier (tier.id)}
		<div
			class="card min-w-0 space-y-4 overflow-hidden border-2 p-4 transition-all duration-300 {tier.isPopular
				? 'border-primary bg-primary/5'
				: 'border-base-300 bg-base-200'}"
		>
			<div class="flex items-start justify-between gap-3">
				<div class="flex min-w-0 items-center gap-2">
					<h4 class="wrap-break-words min-w-0 text-lg font-semibold">{tier.name}</h4>
					{#if tier.isPopular}
						<span class="badge badge-primary" transition:fade={{ duration: 200 }}>
							{$t('dashboard.services.create.tiers.popular')}
						</span>
					{/if}
				</div>
				<div class="flex shrink-0 gap-2">
					<button
						type="button"
						class="btn btn-sm btn-ghost transition-opacity {tier.isPopular
							? 'text-primary opacity-100'
							: 'text-base-content/60 opacity-40 hover:opacity-100'}"
						onclick={() => togglePopularTier(tier.id)}
						title={$t('dashboard.services.create.tiers.toggle_popular')}
						aria-pressed={tier.isPopular ? 'true' : 'false'}
					>
						⭐
					</button>
					{#if ($store.service.pricing?.tiers || []).length > 2}
						<button
							type="button"
							class="btn btn-sm btn-error"
							onclick={() => removeTier(tier.id)}
							title={$t('dashboard.services.create.tiers.remove')}
						>
							✕
						</button>
					{/if}
				</div>
			</div>

			<div class="w-full">
				<label for="tier-name-{tier.id}" class="label" id="tier-name-label-{tier.id}">
					<span class="label-text break-words">{$t('dashboard.services.create.tiers.name_label')}</span>
				</label>
				<input
					type="text"
					id="tier-name-{tier.id}"
					value={tier.name}
					onchange={(event) =>
						updateTier(tier.id, { name: (event.target as HTMLInputElement).value })}
					class="input input-bordered w-full"
					placeholder={$t('dashboard.services.create.tiers.name_placeholder')}
				/>
			</div>

			<div class="w-full">
				<label for="tier-description-{tier.id}" class="label" id="tier-description-label-{tier.id}">
					<span class="label-text break-words">
						{$t('dashboard.services.create.tiers.description_label')}
						<span class="text-error">*</span>
					</span>
				</label>
				<textarea
					id="tier-description-{tier.id}"
					value={tier.description}
					oninput={(event) =>
						updateTier(tier.id, { description: (event.target as HTMLTextAreaElement).value })}
					class="textarea textarea-bordered w-full"
					placeholder={$t('dashboard.services.create.tiers.description_placeholder')}
					rows="3"
				></textarea>
			</div>

			<div class="w-full">
				<label
					for="tier-price-usd-{tier.id}"
					class="label flex items-center justify-between gap-2"
					id="tier-price-label-{tier.id}"
				>
					<span class="label-text break-words">
						{$t('dashboard.services.create.tiers.price_label')}
						<span class="text-error">*</span>
					</span>
					<span class="label-text-alt wrap-break-words min-w-0 text-right">
						{$t('dashboard.services.create.pricing.btc_price')}
						{#if btcPrice > 0}
							${Math.round(btcPrice).toLocaleString()}
						{:else}
							{$t('dashboard.services.create.pricing.btc_price_unavailable')}
						{/if}
					</span>
				</label>
				<UsdSatsInput
					usdAmount={tier.price}
					{btcPrice}
					showFieldLabels={false}
					showBtcPrice={false}
					usdInputId={`tier-price-usd-${tier.id}`}
					satsInputId={`tier-price-sats-${tier.id}`}
					btcPriceLabel={$t('dashboard.services.create.pricing.btc_price')}
					satsLabel={$t('dashboard.services.create.pricing.sats_label')}
					onUsdChange={({ usdAmount: nextUsdPrice }) => updateTierPrice(tier.id, nextUsdPrice)}
					onSatsChange={({ usdAmount: nextUsdPrice }) => {
						if (nextUsdPrice != null) {
							updateTierPrice(tier.id, nextUsdPrice);
						}
					}}
				/>
			</div>

			<div class="w-full">
				<label class="label cursor-pointer" id="delivery-time-label-{tier.id}">
					<span class="label-text break-words">{$t('dashboard.services.create.tiers.delivery_time_label')}</span
					>
					<input
						type="checkbox"
						class="checkbox checkbox-primary"
						checked={!!tier.deliveryTime}
						onchange={(event) => {
							updateDeliveryTime(
								tier.id,
								(event.target as HTMLInputElement).checked
									? createDefaultTierDeliveryTime()
									: undefined
							);
						}}
					/>
				</label>
				{#if tier.deliveryTime}
					<div class="mt-2 space-y-2">
						<div
							class="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(8.5rem,10rem)] items-end gap-2 sm:max-w-md"
						>
							<div class="min-w-0">
								<label
									for="delivery-value-{tier.id}"
									class="label"
									id="delivery-value-label-{tier.id}"
								>
									<span class="label-text-alt wrap-break-words">
										{$t('dashboard.services.create.tiers.delivery_time_label')}
									</span>
								</label>
								<input
									type="number"
									id="delivery-value-{tier.id}"
									min="1"
									value={tier.deliveryTime.value}
									onchange={(event) => {
										const value = Number((event.target as HTMLInputElement).value);
										updateDeliveryTime(tier.id, {
											...tier.deliveryTime!,
											value,
											display: formatTierDeliveryTime({ ...tier.deliveryTime!, value })
										});
									}}
									class="input input-bordered w-full"
								/>
							</div>
							<div class="min-w-0">
								<label
									for="delivery-unit-{tier.id}"
									class="label"
									id="delivery-unit-label-{tier.id}"
								>
									<span class="label-text-alt wrap-break-words">
										{$t('dashboard.services.create.tiers.delivery_unit')}
									</span>
								</label>
								<select
									id="delivery-unit-{tier.id}"
									class="select select-bordered w-full"
									value={tier.deliveryTime.unit}
									onchange={(event) => {
										const unit = (event.target as HTMLSelectElement)
											.value as TierDeliveryTime['unit'];
										updateDeliveryTime(tier.id, {
											...tier.deliveryTime!,
											unit,
											display: formatTierDeliveryTime({ ...tier.deliveryTime!, unit })
										});
									}}
								>
									<option value="hour">{$t('dashboard.services.create.tiers.unit_hour')}</option>
									<option value="day">{$t('dashboard.services.create.tiers.unit_day')}</option>
									<option value="week">{$t('dashboard.services.create.tiers.unit_week')}</option>
									<option value="month">{$t('dashboard.services.create.tiers.unit_month')}</option>
								</select>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<div class="w-full">
				<label class="label cursor-pointer" id="rush-delivery-label-{tier.id}">
					<span class="label-text break-words">{$t('dashboard.services.create.tiers.rush_delivery_label')}</span
					>
					<input
						type="checkbox"
						class="checkbox checkbox-primary"
						checked={!!tier.rushDelivery?.enabled}
						onchange={(event) =>
							toggleRushDelivery(tier.id, (event.target as HTMLInputElement).checked)}
					/>
				</label>
				{#if tier.rushDelivery?.enabled}
					<div class="mt-2 space-y-2">
						<div>
							<label for="rush-price-{tier.id}" class="label" id="rush-price-label-{tier.id}">
								<span class="label-text-alt wrap-break-words">
									{$t('dashboard.services.create.tiers.rush_price_label')}
								</span>
							</label>
							<input
								type="number"
								id="rush-price-{tier.id}"
								min="0"
								step="0.01"
								value={tier.rushDelivery.price}
								onchange={(event) => {
									const price = Number((event.target as HTMLInputElement).value);
									updateRushDelivery(tier.id, {
										...tier.rushDelivery!,
										price
									});
								}}
								class="input input-bordered w-full sm:max-w-xs"
							/>
						</div>
						<div
							class="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(8.5rem,10rem)] items-end gap-2 sm:max-w-md"
						>
							<div class="min-w-0">
								<label for="rush-value-{tier.id}" class="label" id="rush-value-label-{tier.id}">
									<span class="label-text-alt wrap-break-words">
										{$t('dashboard.services.create.tiers.delivery_time_label')}
									</span>
								</label>
								<input
									type="number"
									id="rush-value-{tier.id}"
									min="1"
									value={tier.rushDelivery.deliveryTime.value}
									onchange={(event) => {
										const value = Number((event.target as HTMLInputElement).value);
										updateRushDelivery(tier.id, {
											...tier.rushDelivery!,
											deliveryTime: {
												...tier.rushDelivery!.deliveryTime,
												value,
												display: formatTierDeliveryTime({
													...tier.rushDelivery!.deliveryTime,
													value
												})
											}
										});
									}}
									class="input input-bordered w-full"
								/>
							</div>
							<div class="min-w-0">
								<label for="rush-unit-{tier.id}" class="label" id="rush-unit-label-{tier.id}">
									<span class="label-text-alt wrap-break-words">
										{$t('dashboard.services.create.tiers.delivery_unit')}
									</span>
								</label>
								<select
									id="rush-unit-{tier.id}"
									class="select select-bordered w-full"
									value={tier.rushDelivery.deliveryTime.unit}
									onchange={(event) => {
										const unit = (event.target as HTMLSelectElement)
											.value as TierDeliveryTime['unit'];
										updateRushDelivery(tier.id, {
											...tier.rushDelivery!,
											deliveryTime: {
												...tier.rushDelivery!.deliveryTime,
												unit,
												display: formatTierDeliveryTime({
													...tier.rushDelivery!.deliveryTime,
													unit
												})
											}
										});
									}}
								>
									<option value="hour">{$t('dashboard.services.create.tiers.unit_hour')}</option>
									<option value="day">{$t('dashboard.services.create.tiers.unit_day')}</option>
									<option value="week">{$t('dashboard.services.create.tiers.unit_week')}</option>
									<option value="month">{$t('dashboard.services.create.tiers.unit_month')}</option>
								</select>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<div class="w-full">
				<div class="space-y-2">
					{#each tier.features || [] as feature, featureIndex (featureIndex)}
						<div class="flex min-w-0 gap-2">
							<input
								type="text"
								value={feature}
								onchange={(event) =>
									updateFeature(tier.id, featureIndex, (event.target as HTMLInputElement).value)}
								class="input input-bordered min-w-0 flex-1"
								placeholder={$t('dashboard.services.create.tiers.feature_placeholder')}
							/>
							<button
								type="button"
								class="btn btn-sm btn-error"
								onclick={() => removeFeature(tier.id, featureIndex)}
								title={$t('dashboard.services.create.tiers.remove_feature')}
							>
								✕
							</button>
						</div>
					{/each}
					<button
						type="button"
						class="btn btn-sm btn-outline w-full"
						onclick={() => addFeature(tier.id)}
					>
						+ {$t('dashboard.services.create.tiers.add_feature')}
					</button>
				</div>
			</div>
		</div>
	{/each}

	{#if ($store.service.pricing?.tiers || []).length < 4}
		<button type="button" class="btn btn-outline w-full" onclick={addTier}>
			+ {$t('dashboard.services.create.tiers.add_tier')}
		</button>
	{/if}

	{#if errors.tiers}
		<span class="label-text-alt text-error block">{errors.tiers}</span>
	{/if}
</div>
