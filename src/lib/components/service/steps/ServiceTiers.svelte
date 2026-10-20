<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fly, slide } from 'svelte/transition';
	import { serviceStore as store } from '$lib/stores/service.store';
	import type { RushDelivery, ServiceTier, TierDeliveryTime } from '$lib/types/service.d';
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import UsdSatsInput from '$lib/components/shared/UsdSatsInput.svelte';
	import IconTruckDeliveryOutline from '~icons/mdi/truck-delivery-outline';

	let { errors, direction } = $props();

	const isBookNowEnabled = $derived($store.service.instantBuyLeadHours != null);

	let btcPrice = $state<number>(0);
	let btcPriceError = $state(false);
	let openDropdownId = $state<string | null>(null);

	function toggleDropdown(id: string) {
		openDropdownId = openDropdownId === id ? null : id;
	}

	const unitOptions = [
		{ value: 'minute', label: () => $t('dashboard.services.create.tiers.unit_minute') },
		{ value: 'hour', label: () => $t('dashboard.services.create.tiers.unit_hour') },
		{ value: 'day', label: () => $t('dashboard.services.create.tiers.unit_day') },
		{ value: 'week', label: () => $t('dashboard.services.create.tiers.unit_week') },
		{ value: 'month', label: () => $t('dashboard.services.create.tiers.unit_month') }
	];

	function getUnitLabel(unit: string): string {
		return unitOptions.find((o) => o.value === unit)?.label() || unit;
	}

	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
			btcPriceError = false;
		} catch (err) {
			console.error('Error fetching BTC price:', err);
			btcPriceError = true;
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

	function ensureAllTiersHaveDeliveryTime(): void {
		const currentTiers = $store.service.pricing?.tiers || [];
		const tiersNeedingDeliveryTime = currentTiers.filter((tier) => !tier.deliveryTime);

		if (tiersNeedingDeliveryTime.length > 0) {
			store.updateService({
				pricing: {
					...$store.service.pricing!,
					tiers: currentTiers.map((tier) => {
						if (!tier.deliveryTime) {
							return {
								...tier,
								deliveryTime: createDefaultTierDeliveryTime()
							};
						}
						return tier;
					})
				}
			});
		}
	}

	onMount(() => {
		fetchBtcPrice();
		if (!$store.service.pricing?.tiers || $store.service.pricing.tiers.length === 0) {
			const translate = get(t);
			const defaultDeliveryTime = isBookNowEnabled ? createDefaultTierDeliveryTime() : undefined;
			const defaultTiers: ServiceTier[] = [
				{
					id: crypto.randomUUID(),
					name: translate('dashboard.services.create.tiers.default_essential'),
					description: '',
					price: 0,
					features: [],
					deliveryTime: defaultDeliveryTime
				},
				{
					id: crypto.randomUUID(),
					name: translate('dashboard.services.create.tiers.default_plus'),
					description: '',
					price: 0,
					features: [],
					isPopular: true,
					deliveryTime: defaultDeliveryTime
				},
				{
					id: crypto.randomUUID(),
					name: translate('dashboard.services.create.tiers.default_premium'),
					description: '',
					price: 0,
					features: [],
					deliveryTime: defaultDeliveryTime
				}
			];

			store.updateService({
				pricing: {
					...$store.service.pricing!,
					tiers: defaultTiers
				}
			});
		} else if (isBookNowEnabled) {
			ensureAllTiersHaveDeliveryTime();
		}
	});

	function addTier() {
		const currentTiers = $store.service.pricing?.tiers || [];
		if (currentTiers.length >= 4) return;

		const translate = get(t);
		const defaultNames = [
			'dashboard.services.create.tiers.default_essential',
			'dashboard.services.create.tiers.default_plus',
			'dashboard.services.create.tiers.default_premium',
			'dashboard.services.create.tiers.default_ultimate'
		];
		const nameKey =
			defaultNames[currentTiers.length] || 'dashboard.services.create.tiers.tier_number';
		const newTier: ServiceTier = {
			id: crypto.randomUUID(),
			name: translate(nameKey, { values: { n: currentTiers.length + 1 } }),
			description: '',
			price: 0,
			features: [],
			deliveryTime: isBookNowEnabled ? createDefaultTierDeliveryTime() : undefined
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
		const targetTier = currentTiers.find((tier) => tier.id === tierId);
		// Don't allow un-marking the popular tier — one must always be popular
		if (!targetTier || targetTier.isPopular) return;

		store.updateService({
			pricing: {
				...$store.service.pricing!,
				tiers: currentTiers.map((tier) => ({
					...tier,
					isPopular: tier.id === tierId
				}))
			}
		});
	}

	async function addFeature(tierId: string) {
		const tier = $store.service.pricing?.tiers?.find((item) => item.id === tierId);
		if (!tier) return;

		const newIndex = (tier.features || []).length;
		updateTier(tierId, {
			features: [...(tier.features || []), '']
		});

		await tick();
		const input = document.querySelector<HTMLInputElement>(
			`#tier-features-${tierId} input[data-feature-index="${newIndex}"]`
		);
		input?.focus();
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
	function getTierDisplayName(tierName: string | undefined, tierIndex: number): string {
		if (tierName) return tierName;
		const keys = [
			'dashboard.services.create.tiers.default_essential',
			'dashboard.services.create.tiers.default_plus',
			'dashboard.services.create.tiers.default_premium',
			'dashboard.services.create.tiers.default_ultimate'
		];
		return $t(keys[tierIndex] || keys[3]);
	}
</script>

<div
	class="min-w-0 space-y-6"
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: direction === 'forward' ? 20 : -20
	}}
>
	<div class="w-full min-w-0">
		<p class="text-base-content/70 text-sm">
			{$t('dashboard.services.create.tiers.hint')} ({($store.service.pricing?.tiers || [])
				.length}/4)
		</p>
	</div>

	{#each $store.service.pricing?.tiers || [] as tier, tierIndex (tier.id)}
		<!-- overflow-visible required: popular badge is absolutely positioned above the card -->
		<div
			class="card min-w-0 space-y-4 overflow-visible border-2 p-4 transition-all duration-300 {tier.isPopular
				? 'border-primary bg-primary/5'
				: 'border-base-300 bg-base-200'}"
			transition:fly={{ y: 20, duration: 200 }}
		>
			{#if tier.isPopular}
				<div class="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
					<span
						class="badge badge-primary border-none px-4 py-3 text-[10px] font-black tracking-widest uppercase shadow-sm"
					>
						{$t('dashboard.services.create.tiers.popular')}
					</span>
				</div>
			{/if}
			<div class="flex items-start justify-between gap-3">
				<div class="flex min-w-0 items-center gap-2">
					{#if ($store.service.pricing?.tiers || []).length > 2}
						<button
							type="button"
							class="btn btn-circle btn-outline btn-error min-h-[44px] min-w-[44px] text-lg"
							onclick={() => removeTier(tier.id)}
							title={$t('dashboard.services.create.tiers.remove')}
						>
							✕
						</button>
					{/if}
					<h4 class="wrap-break-words line-clamp-2 min-w-0 text-lg font-semibold">
						{getTierDisplayName(tier.name, tierIndex)}
					</h4>
				</div>
				<div class="flex shrink-0 gap-2">
					<button
						type="button"
						class="btn btn-sm btn-circle btn-ghost min-h-[44px] min-w-[44px] transition-all duration-300 {tier.isPopular
							? 'text-primary border-primary border'
							: 'text-base-content/40 border-base-content/20 border'}"
						onclick={() => togglePopularTier(tier.id)}
						title={$t('dashboard.services.create.tiers.toggle_popular')}
						aria-pressed={tier.isPopular ? 'true' : 'false'}
					>
						⭐
					</button>
				</div>
			</div>

			<div class="w-full">
				<label for="tier-name-{tier.id}" class="label" id="tier-name-label-{tier.id}">
					<span class="label-text wrap-break-words"
						>{$t('dashboard.services.create.tiers.name_label')}</span
					>
				</label>
				<input
					type="text"
					id="tier-name-{tier.id}"
					value={tier.name}
					oninput={(event) =>
						updateTier(tier.id, { name: (event.target as HTMLInputElement).value })}
					class="input input-bordered w-full"
					placeholder={$t('dashboard.services.create.tiers.name_placeholder')}
				/>
			</div>

			<div class="w-full">
				<label for="tier-description-{tier.id}" class="label" id="tier-description-label-{tier.id}">
					<span class="label-text wrap-break-words">
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
					<span class="label-text wrap-break-words">
						{$t('dashboard.services.create.tiers.price_label')}
						<span class="text-error">*</span>
					</span>
					<span class="label-text-alt wrap-break-words min-w-0 text-right italic">
						BTC: {#if btcPriceError}Error{:else if btcPrice > 0}${Math.round(
								btcPrice
							).toLocaleString()}{:else}{$t(
								'dashboard.services.create.pricing.btc_price_unavailable'
							)}{/if}
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
					<span class="label-text wrap-break-words">
						{$t('dashboard.services.create.tiers.delivery_time_label')}
						{#if isBookNowEnabled}
							<span class="text-error">*</span>
						{/if}
					</span>
					<input
						type="checkbox"
						class="checkbox checkbox-primary"
						checked={!!tier.deliveryTime}
						disabled={isBookNowEnabled}
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
				<div class="mt-2 space-y-2">
					<div
						class="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(6rem,8rem)] items-end gap-2 sm:max-w-md"
					>
						<div class="min-w-0">
							<div class="flex items-center gap-2">
								<IconTruckDeliveryOutline class="text-primary h-5 w-5 shrink-0" />
								<input
									type="number"
									id="delivery-value-{tier.id}"
									min="1"
									value={tier.deliveryTime?.value ?? ''}
									oninput={(event) => {
										const value = Number((event.target as HTMLInputElement).value);
										const unit = tier.deliveryTime?.unit ?? 'day';
										updateDeliveryTime(tier.id, {
											value,
											unit,
											display: formatTierDeliveryTime({
												value,
												unit,
												display: ''
											})
										});
									}}
									class="input input-bordered w-full"
								/>
							</div>
						</div>
						<div class="min-w-0">
							<div class="dropdown w-full">
								<button
									type="button"
									class="input input-bordered flex w-full cursor-pointer items-center justify-between"
									onclick={() => toggleDropdown(`d-unit-${tier.id}`)}
								>
									<span>{getUnitLabel(tier.deliveryTime?.unit ?? 'day')}</span>
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
								{#if openDropdownId === `d-unit-${tier.id}`}
									<ul
										class="dropdown-content menu bg-base-100 rounded-box z-30 w-full shadow"
										transition:fly={{ y: -10, duration: 200 }}
									>
										{#each unitOptions as opt (opt.value)}
											<li>
												<button
													type="button"
													class:active={(tier.deliveryTime?.unit ?? 'day') === opt.value}
													onclick={() => {
														const value = tier.deliveryTime?.value ?? 1;
														const unit = opt.value as TierDeliveryTime['unit'];
														updateDeliveryTime(tier.id, {
															value,
															unit,
															display: formatTierDeliveryTime({
																value,
																unit,
																display: ''
															})
														});
														openDropdownId = null;
													}}>{opt.label()}</button
												>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						</div>
					</div>
				</div>
			</div>

			<div class="w-full">
				<label class="label cursor-pointer" id="rush-delivery-label-{tier.id}">
					<span class="label-text wrap-break-words"
						>{$t('dashboard.services.create.tiers.rush_delivery_label')}</span
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
					<div class="mt-2 space-y-2" transition:slide={{ duration: 200 }}>
						<div class="w-full">
							<UsdSatsInput
								usdAmount={tier.rushDelivery.price}
								{btcPrice}
								showFieldLabels={false}
								showBtcPrice={false}
								usdInputId={`rush-price-usd-${tier.id}`}
								satsInputId={`rush-price-sats-${tier.id}`}
								btcPriceLabel={$t('dashboard.services.create.pricing.btc_price')}
								satsLabel={$t('dashboard.services.create.pricing.sats_label')}
								onUsdChange={({ usdAmount: nextUsdPrice }) => {
									if (nextUsdPrice != null) {
										updateRushDelivery(tier.id, { ...tier.rushDelivery!, price: nextUsdPrice });
									}
								}}
								onSatsChange={({ usdAmount: nextUsdPrice }) => {
									if (nextUsdPrice != null) {
										updateRushDelivery(tier.id, { ...tier.rushDelivery!, price: nextUsdPrice });
									}
								}}
							/>
						</div>
						<div
							class="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(6rem,8rem)] items-end gap-2 sm:max-w-md"
						>
							<div class="min-w-0">
								<div class="flex items-center gap-2">
									<IconTruckDeliveryOutline class="text-primary h-5 w-5 shrink-0" />
									<input
										type="number"
										id="rush-value-{tier.id}"
										min="1"
										value={tier.rushDelivery.deliveryTime.value}
										oninput={(event) => {
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
							</div>
							<div class="min-w-0">
								<div class="dropdown w-full">
									<button
										type="button"
										class="input input-bordered flex w-full cursor-pointer items-center justify-between"
										onclick={() => toggleDropdown(`r-unit-${tier.id}`)}
									>
										<span>{getUnitLabel(tier.rushDelivery.deliveryTime.unit)}</span>
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
									{#if openDropdownId === `r-unit-${tier.id}`}
										<ul
											class="dropdown-content menu bg-base-100 rounded-box z-30 w-full shadow"
											transition:fly={{ y: -10, duration: 200 }}
										>
											{#each unitOptions as opt (opt.value)}
												<li>
													<button
														type="button"
														class:active={tier.rushDelivery.deliveryTime.unit === opt.value}
														onclick={() => {
															updateRushDelivery(tier.id, {
																...tier.rushDelivery!,
																deliveryTime: {
																	...tier.rushDelivery!.deliveryTime,
																	unit: opt.value as TierDeliveryTime['unit'],
																	display: formatTierDeliveryTime({
																		...tier.rushDelivery!.deliveryTime,
																		unit: opt.value as TierDeliveryTime['unit']
																	})
																}
															});
															openDropdownId = null;
														}}>{opt.label()}</button
													>
												</li>
											{/each}
										</ul>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<div class="w-full">
				<div class="space-y-2" id="tier-features-{tier.id}">
					{#each tier.features || [] as feature, featureIndex (featureIndex)}
						<div class="flex min-w-0 gap-2" transition:fly={{ y: -10, duration: 150 }}>
							<input
								type="text"
								value={feature}
								data-feature-index={featureIndex}
								oninput={(e) =>
									updateFeature(tier.id, featureIndex, (e.target as HTMLInputElement).value)}
								onblur={(e) => {
									if (!(e.target as HTMLInputElement).value.trim()) {
										removeFeature(tier.id, featureIndex);
									}
								}}
								class="input input-bordered min-w-0 flex-1"
								placeholder={$t('dashboard.services.create.tiers.feature_placeholder')}
							/>
							<button
								type="button"
								class="btn btn-circle btn-outline btn-error min-h-[44px] min-w-[44px] text-lg"
								onclick={() => removeFeature(tier.id, featureIndex)}
								title={$t('dashboard.services.create.tiers.remove_feature')}
							>
								✕
							</button>
						</div>
					{/each}
					<button
						type="button"
						class="btn btn-sm btn-outline min-h-[44px] w-full"
						onclick={() => addFeature(tier.id)}
					>
						+ {$t('dashboard.services.create.tiers.add_feature')}
					</button>
				</div>
			</div>
		</div>
	{/each}

	{#if ($store.service.pricing?.tiers || []).length < 4}
		<button type="button" class="btn btn-outline min-h-[44px] w-full" onclick={addTier}>
			+ {$t('dashboard.services.create.tiers.add_tier')}
		</button>
	{/if}

	{#if errors.tiers}
		<span class="label-text-alt text-error block">{errors.tiers}</span>
	{/if}
</div>
