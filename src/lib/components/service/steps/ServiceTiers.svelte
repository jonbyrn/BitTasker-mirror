<script lang="ts">
	import { onMount } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { serviceStore as store } from '$lib/stores/service.store';
	import type { ServiceTier, DeliveryTime, RushDelivery } from '$lib/types/service.d';
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { formatNumberForInput, SATS_PER_BTC } from '$lib/utils/helpers/crypto';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';

	let { errors, direction } = $props();

	let btcPrice = $state<number>(0);

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

	function tierSatsDisplay(priceUsd: number): string {
		return formatNumberForInput(btcPrice > 0 ? Math.round((priceUsd / btcPrice) * SATS_PER_BTC) : 0);
	}

	function handleTierUsdChange(tierId: string, event: Event) {
		const rawValue = (event.target as HTMLInputElement).value;
		const input = cleanInput(rawValue);
		let cleanedInput = input.replace(/,/g, '');
		if (cleanedInput.length > 1 && cleanedInput.startsWith('0') && cleanedInput[1] !== '.') {
			cleanedInput = cleanedInput.replace(/^0+/, '') || '0';
		}
		const usdValue = parseFloat(cleanedInput);
		updateTier(tierId, { price: !isNaN(usdValue) ? usdValue : 0 });
	}

	function handleTierSatsChange(tierId: string, event: Event) {
		const rawValue = (event.target as HTMLInputElement).value;
		const input = cleanInput(rawValue);
		let cleanedInput = input.replace(/,/g, '');
		if (cleanedInput.length > 1 && cleanedInput.startsWith('0')) {
			cleanedInput = cleanedInput.replace(/^0+/, '') || '0';
		}
		const satsValue = parseInt(cleanedInput, 10);
		if (!isNaN(satsValue) && btcPrice > 0) {
			const usdValue = (satsValue / SATS_PER_BTC) * btcPrice;
			updateTier(tierId, { price: usdValue });
		} else if (!isNaN(satsValue) && satsValue === 0) {
			updateTier(tierId, { price: 0 });
		}
	}

	// Initialize tiers and fetch BTC price (run once on mount)
	onMount(() => {
		fetchBtcPrice();
		if (!$store.service.pricing?.tiers || $store.service.pricing.tiers.length === 0) {
			// Create default 3 tiers with translated names (same language detection as tasks)
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

	// Generate delivery time display string
	function generateDeliveryTimeDisplay(deliveryTime: DeliveryTime): string {
		if (deliveryTime.min === deliveryTime.max) {
			return `${deliveryTime.min} ${deliveryTime.unit}${deliveryTime.min > 1 ? 's' : ''}`;
		}
		return `${deliveryTime.min}-${deliveryTime.max} ${deliveryTime.unit}${deliveryTime.max > 1 ? 's' : ''}`;
	}

	// Add new tier
	function addTier() {
		const currentTiers = $store.service.pricing?.tiers || [];
		if (currentTiers.length >= 4) {
			return; // Max 4 tiers
		}
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

	// Remove tier
	function removeTier(tierId: string) {
		const currentTiers = $store.service.pricing?.tiers || [];
		if (currentTiers.length <= 2) {
			return; // Min 2 tiers
		}
		store.updateService({
			pricing: {
				...$store.service.pricing!,
				tiers: currentTiers.filter((t) => t.id !== tierId)
			}
		});
	}

	// Update tier
	function updateTier(tierId: string, updates: Partial<ServiceTier>) {
		const currentTiers = $store.service.pricing?.tiers || [];
		store.updateService({
			pricing: {
				...$store.service.pricing!,
				tiers: currentTiers.map((tier) => (tier.id === tierId ? { ...tier, ...updates } : tier))
			}
		});
	}

	// Add feature to tier
	function addFeature(tierId: string) {
		const tier = $store.service.pricing?.tiers?.find((t) => t.id === tierId);
		if (tier) {
			updateTier(tierId, {
				features: [...(tier.features || []), '']
			});
		}
	}

	// Update feature
	function updateFeature(tierId: string, featureIndex: number, value: string) {
		const tier = $store.service.pricing?.tiers?.find((t) => t.id === tierId);
		if (tier) {
			const newFeatures = [...(tier.features || [])];
			newFeatures[featureIndex] = value;
			updateTier(tierId, { features: newFeatures });
		}
	}

	// Remove feature
	function removeFeature(tierId: string, featureIndex: number) {
		const tier = $store.service.pricing?.tiers?.find((t) => t.id === tierId);
		if (tier) {
			const newFeatures = (tier.features || []).filter((_, i) => i !== featureIndex);
			updateTier(tierId, { features: newFeatures });
		}
	}

	// Update delivery time
	function updateDeliveryTime(tierId: string, deliveryTime: DeliveryTime | undefined) {
		updateTier(tierId, { deliveryTime });
	}

	// Toggle rush delivery
	function toggleRushDelivery(tierId: string, enabled: boolean) {
		const tier = $store.service.pricing?.tiers?.find((t) => t.id === tierId);
		if (tier) {
			if (enabled) {
				const rushDelivery: RushDelivery = {
					enabled: true,
					price: 0,
					deliveryTime: {
						min: 1,
						max: 2,
						unit: 'day',
						display: '1-2 days'
					}
				};
				updateTier(tierId, { rushDelivery });
			} else {
				updateTier(tierId, { rushDelivery: undefined });
			}
		}
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
		<label class="label" for="tiers-title">
			<span class="label-text-alt">
				{$t('dashboard.services.create.tiers.hint')} ({($store.service.pricing?.tiers || []).length}/4)
			</span>
		</label>
	</div>

	{#each ($store.service.pricing?.tiers || []) as tier, index}
		<div class="card bg-base-200 p-4 space-y-4 {tier.isPopular ? 'ring-2 ring-primary' : ''}">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<h4 class="font-semibold text-lg">{tier.name}</h4>
					{#if tier.isPopular}
						<span class="badge badge-primary">{$t('dashboard.services.create.tiers.popular')}</span>
					{/if}
				</div>
				<div class="flex gap-2">
					<button
						class="btn btn-sm btn-ghost"
						onclick={() => updateTier(tier.id, { isPopular: !tier.isPopular })}
						title={$t('dashboard.services.create.tiers.toggle_popular')}
					>
						⭐
					</button>
					{#if ($store.service.pricing?.tiers || []).length > 2}
						<button
							class="btn btn-sm btn-error"
							onclick={() => removeTier(tier.id)}
							title={$t('dashboard.services.create.tiers.remove')}
						>
							✕
						</button>
					{/if}
				</div>
			</div>

			<!-- Tier Name -->
			<div class="w-full">
				<label for="tier-name-{tier.id}" class="label" id="tier-name-label-{tier.id}">
					<span class="label-text">{$t('dashboard.services.create.tiers.name_label')}</span>
				</label>
				<input
					type="text"
					id="tier-name-{tier.id}"
					value={tier.name}
					onchange={(e) => updateTier(tier.id, { name: (e.target as HTMLInputElement).value })}
					class="input input-bordered w-full"
					placeholder={$t('dashboard.services.create.tiers.name_placeholder')}
				/>
			</div>

			<!-- Tier Description (required) -->
			<div class="w-full">
				<label for="tier-description-{tier.id}" class="label" id="tier-description-label-{tier.id}">
					<span class="label-text">{$t('dashboard.services.create.tiers.description_label')} <span class="text-error">*</span></span>
				</label>
				<textarea
					id="tier-description-{tier.id}"
					value={tier.description}
					oninput={(e) => updateTier(tier.id, { description: (e.target as HTMLTextAreaElement).value })}
					class="textarea textarea-bordered w-full"
					placeholder={$t('dashboard.services.create.tiers.description_placeholder')}
					rows="3"
				></textarea>
			</div>

			<!-- Tier Price (required): $ USD + Sats, same as fixed price step -->
			<div class="w-full">
				<label for="tier-price-usd-{tier.id}" class="label" id="tier-price-label-{tier.id}">
					<span class="label-text">{$t('dashboard.services.create.tiers.price_label')} <span class="text-error">*</span></span>
				</label>
				<div class="flex gap-2">
					<div class="relative flex-1">
						<span class="text-base-content/70 absolute top-1/2 left-3 z-10 -translate-y-1/2">$</span>
						<input
							type="text"
							id="tier-price-usd-{tier.id}"
							value={formatNumberForInput(tier.price)}
							oninput={(e) => handleTierUsdChange(tier.id, e)}
							class="input input-bordered w-full pl-7"
							placeholder="0"
						/>
					</div>
					<div class="relative flex-1">
						<span class="text-base-content/70 absolute top-1/2 right-3 z-10 -translate-y-1/2">{$t('dashboard.services.create.pricing.sats_label')}</span>
						<input
							type="text"
							id="tier-price-sats-{tier.id}"
							value={tierSatsDisplay(tier.price)}
							oninput={(e) => handleTierSatsChange(tier.id, e)}
							class="input input-bordered w-full pr-12"
							placeholder="0"
						/>
					</div>
				</div>
				<span class="label-text-alt mt-1 block text-base-content/70">
					{$t('dashboard.services.create.pricing.btc_price')} ${Math.round(btcPrice).toLocaleString()}
				</span>
			</div>

			<!-- Delivery Time -->
			<div class="w-full">
				<label class="label cursor-pointer" id="delivery-time-label-{tier.id}">
					<span class="label-text">{$t('dashboard.services.create.tiers.delivery_time_label')}</span>
					<input
						type="checkbox"
						class="checkbox checkbox-primary"
						checked={!!tier.deliveryTime}
						onchange={(e) => {
							if ((e.target as HTMLInputElement).checked) {
								updateDeliveryTime(tier.id, {
									min: 3,
									max: 5,
									unit: 'day',
									display: '3-5 days'
								});
							} else {
								updateDeliveryTime(tier.id, undefined);
							}
						}}
					/>
				</label>
				{#if tier.deliveryTime}
					<div class="mt-2 grid grid-cols-2 gap-2">
						<div>
							<label for="delivery-min-{tier.id}" class="label" id="delivery-min-label-{tier.id}">
								<span class="label-text-alt">{$t('dashboard.services.create.tiers.delivery_min')}</span>
							</label>
							<input
								type="number"
								id="delivery-min-{tier.id}"
								min="1"
								value={tier.deliveryTime.min}
								onchange={(e) => {
									const min = Number((e.target as HTMLInputElement).value);
									const max = tier.deliveryTime!.max;
									updateDeliveryTime(tier.id, {
										...tier.deliveryTime!,
										min,
										display: generateDeliveryTimeDisplay({ ...tier.deliveryTime!, min })
									});
								}}
								class="input input-bordered w-full"
							/>
						</div>
						<div>
							<label for="delivery-max-{tier.id}" class="label" id="delivery-max-label-{tier.id}">
								<span class="label-text-alt">{$t('dashboard.services.create.tiers.delivery_max')}</span>
							</label>
							<input
								type="number"
								id="delivery-max-{tier.id}"
								min={tier.deliveryTime.min}
								value={tier.deliveryTime.max}
								onchange={(e) => {
									const max = Number((e.target as HTMLInputElement).value);
									updateDeliveryTime(tier.id, {
										...tier.deliveryTime!,
										max,
										display: generateDeliveryTimeDisplay({ ...tier.deliveryTime!, max })
									});
								}}
								class="input input-bordered w-full"
							/>
						</div>
						<div class="col-span-2">
							<label for="delivery-unit-{tier.id}" class="label" id="delivery-unit-label-{tier.id}">
								<span class="label-text-alt">{$t('dashboard.services.create.tiers.delivery_unit')}</span>
							</label>
							<select
								id="delivery-unit-{tier.id}"
								class="select select-bordered w-full"
								value={tier.deliveryTime.unit}
								onchange={(e) => {
									const unit = (e.target as HTMLSelectElement).value as DeliveryTime['unit'];
									updateDeliveryTime(tier.id, {
										...tier.deliveryTime!,
										unit,
										display: generateDeliveryTimeDisplay({ ...tier.deliveryTime!, unit })
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
					<div class="mt-2 text-sm text-base-content/70">
						{$t('dashboard.services.create.tiers.delivery_display')}: {tier.deliveryTime.display}
					</div>
				{/if}
			</div>

			<!-- Rush Delivery -->
			<div class="w-full">
				<label class="label cursor-pointer" id="rush-delivery-label-{tier.id}">
					<span class="label-text">{$t('dashboard.services.create.tiers.rush_delivery_label')}</span>
					<input
						type="checkbox"
						class="checkbox checkbox-primary"
						checked={!!tier.rushDelivery?.enabled}
						onchange={(e) => toggleRushDelivery(tier.id, (e.target as HTMLInputElement).checked)}
					/>
				</label>
				{#if tier.rushDelivery?.enabled}
					<div class="mt-2 space-y-2">
						<div>
							<label for="rush-price-{tier.id}" class="label" id="rush-price-label-{tier.id}">
								<span class="label-text-alt">{$t('dashboard.services.create.tiers.rush_price_label')}</span>
							</label>
							<input
								type="number"
								id="rush-price-{tier.id}"
								min="0"
								step="0.01"
								value={tier.rushDelivery.price}
								onchange={(e) => {
									const price = Number((e.target as HTMLInputElement).value);
									updateTier(tier.id, {
										rushDelivery: {
											...tier.rushDelivery!,
											price
										}
									});
								}}
								class="input input-bordered w-full"
							/>
						</div>
						<div class="grid grid-cols-2 gap-2">
							<div>
								<label for="rush-min-{tier.id}" class="label" id="rush-min-label-{tier.id}">
									<span class="label-text-alt">{$t('dashboard.services.create.tiers.rush_delivery_min')}</span>
								</label>
								<input
									type="number"
									id="rush-min-{tier.id}"
									min="1"
									value={tier.rushDelivery.deliveryTime.min}
									onchange={(e) => {
										const min = Number((e.target as HTMLInputElement).value);
										updateTier(tier.id, {
											rushDelivery: {
												...tier.rushDelivery!,
												deliveryTime: {
													...tier.rushDelivery!.deliveryTime,
													min,
													display: generateDeliveryTimeDisplay({
														...tier.rushDelivery!.deliveryTime,
														min
													})
												}
											}
										});
									}}
									class="input input-bordered w-full"
								/>
							</div>
							<div>
								<label for="rush-max-{tier.id}" class="label" id="rush-max-label-{tier.id}">
									<span class="label-text-alt">{$t('dashboard.services.create.tiers.rush_delivery_max')}</span>
								</label>
								<input
									type="number"
									id="rush-max-{tier.id}"
									min={tier.rushDelivery.deliveryTime.min}
									value={tier.rushDelivery.deliveryTime.max}
									onchange={(e) => {
										const max = Number((e.target as HTMLInputElement).value);
										updateTier(tier.id, {
											rushDelivery: {
												...tier.rushDelivery!,
												deliveryTime: {
													...tier.rushDelivery!.deliveryTime,
													max,
													display: generateDeliveryTimeDisplay({
														...tier.rushDelivery!.deliveryTime,
														max
													})
												}
											}
										});
									}}
									class="input input-bordered w-full"
								/>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Features -->
			<div class="w-full">
				<label class="label" id="features-label-{tier.id}" for="features-input-{tier.id}">
					<span class="label-text">{$t('dashboard.services.create.tiers.features_label')}</span>
				</label>
				<div class="space-y-2">
					{#each (tier.features || []) as feature, featureIndex}
						<div class="flex gap-2">
							<input
								type="text"
								value={feature}
								onchange={(e) => updateFeature(tier.id, featureIndex, (e.target as HTMLInputElement).value)}
								class="input input-bordered flex-1"
								placeholder={$t('dashboard.services.create.tiers.feature_placeholder')}
							/>
							<button
								class="btn btn-sm btn-error"
								onclick={() => removeFeature(tier.id, featureIndex)}
								title={$t('dashboard.services.create.tiers.remove_feature')}
							>
								✕
							</button>
						</div>
					{/each}
					<button
						class="btn btn-sm btn-outline w-full"
						onclick={() => addFeature(tier.id)}
					>
						+ {$t('dashboard.services.create.tiers.add_feature')}
					</button>
				</div>
			</div>
		</div>
	{/each}

	<!-- Add Tier Button -->
	{#if ($store.service.pricing?.tiers || []).length < 4}
		<button class="btn btn-outline w-full" onclick={addTier}>
			+ {$t('dashboard.services.create.tiers.add_tier')}
		</button>
	{/if}

	{#if errors.tiers}
		<span class="label-text-alt text-error block">{errors.tiers}</span>
	{/if}
</div>

