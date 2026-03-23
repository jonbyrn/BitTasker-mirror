<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { serviceStore as store } from '$lib/stores/service.store';
	import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
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

	function priceToSats(usd: number): string {
		return formatNumberForInput(btcPrice > 0 ? Math.round((usd / btcPrice) * SATS_PER_BTC) : 0);
	}

	// Track expanded state for each text element
	let expandedTexts = new SvelteSet<string>();

	function toggleText(id: string) {
		if (expandedTexts.has(id)) {
			expandedTexts.delete(id);
		} else {
			expandedTexts.add(id);
		}
	}

	function isExpanded(id: string): boolean {
		return expandedTexts.has(id);
	}

	// Helper to check if text is long enough to need truncation
	function needsTruncation(text: string | undefined | null): boolean {
		if (!text) return false;
		return text.length > 200;
	}

	function isImageAttachment(type: string | undefined): boolean {
		return !!(type && (type === 'image/*' || type.startsWith('image/')));
	}

	function isVideoAttachment(type: string | undefined): boolean {
		return !!(type && (type === 'video/*' || type.startsWith('video/')));
	}

	function getLocationTypeLabel(locationType: ServiceLocationTypeEnum): string {
		if (locationType === ServiceLocationTypeEnum.REMOTE) {
			return get(t)('dashboard.services.create.location.remote_title');
		}
		if (locationType === ServiceLocationTypeEnum.TASKER_LOCATION) {
			return get(t)('dashboard.services.create.location.tasker_title');
		}
		if (locationType === ServiceLocationTypeEnum.TASKEE_LOCATION) {
			return get(t)('dashboard.services.create.location.taskee_title');
		}
		return locationType;
	}

	function getPricingTypeLabel(pricingType: ServicePricingTypeEnum | undefined): string {
		if (pricingType === ServicePricingTypeEnum.FIXED) {
			return get(t)('dashboard.services.create.pricing.fixed_title');
		}
		if (pricingType === ServicePricingTypeEnum.HOURLY) {
			return get(t)('dashboard.services.create.pricing.hourly_title');
		}
		if (pricingType === ServicePricingTypeEnum.TIERED) {
			return get(t)('dashboard.services.create.pricing.tiered_title');
		}
		if (pricingType === ServicePricingTypeEnum.INQUIRY_REQUIRED) {
			return get(t)('dashboard.services.create.pricing.inquiry_title');
		}
		return get(t)('dashboard.services.create.review.not_set');
	}

	function formatUsd(value: number | undefined | null): string {
		if (value == null) {
			return get(t)('dashboard.services.create.review.not_set');
		}
		return `$${Number(value).toLocaleString()}`;
	}

	function getPricingSummaryValue(): string {
		if ($store.service.pricing?.type === ServicePricingTypeEnum.FIXED) {
			return formatUsd($store.service.pricing.amount);
		}
		if ($store.service.pricing?.type === ServicePricingTypeEnum.HOURLY) {
			return `${formatUsd($store.service.pricing.hourlyRate)}/${get(t)('dashboard.services.create.pricing.hour')}`;
		}
		if ($store.service.pricing?.type === ServicePricingTypeEnum.TIERED) {
			return `${($store.service.pricing?.tiers || []).length} ${get(t)('dashboard.services.create.review.tiers_count')}`;
		}
		if ($store.service.pricing?.type === ServicePricingTypeEnum.INQUIRY_REQUIRED) {
			return get(t)('dashboard.services.create.pricing.inquiry_title');
		}
		return get(t)('dashboard.services.create.review.not_set');
	}

	function hasBookNowInfo(): boolean {
		return (
			$store.service.instantBuyLeadHours != null || $store.service.instantBuyDeliveryHours != null
		);
	}

	onMount(() => {
		fetchBtcPrice();
	});
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
		<p class="text-base-content/70 mb-6">{$t('dashboard.services.create.review.description')}</p>
	</div>

	<!-- Service Details -->
	<div class="card bg-base-200 p-6">
		<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<h4 class="text-lg font-semibold">Service Details</h4>
			<div class="bg-base-100 rounded-xl px-4 py-3 text-left sm:min-w-48 sm:text-right">
				<div class="text-base-content/70 text-sm font-semibold">
					{getPricingTypeLabel($store.service.pricing?.type)}
				</div>
				<div class="mt-1 text-2xl font-semibold">{getPricingSummaryValue()}</div>
			</div>
		</div>
		<div class="space-y-2">
			<div>
				<span class="font-semibold">{$t('dashboard.services.create.review.title_label')}:</span>
				<span class="ml-2"
					>{$store.service.title || $t('dashboard.services.create.review.not_set')}</span
				>
			</div>
			<div>
				<span class="font-semibold"
					>{$t('dashboard.services.create.review.description_label')}:</span
				>
				<div class="ml-2">
					<div>
						<div
							class="text-base-content/70 cursor-pointer text-sm"
							class:line-clamp-4={needsTruncation(
								$store.service.description || $t('dashboard.services.create.review.not_set')
							) && !isExpanded('service-description')}
							role="button"
							tabindex="0"
							onclick={() =>
								needsTruncation(
									$store.service.description || $t('dashboard.services.create.review.not_set')
								) && toggleText('service-description')}
							onkeydown={(e) =>
								e.key === 'Enter' &&
								needsTruncation(
									$store.service.description || $t('dashboard.services.create.review.not_set')
								) &&
								toggleText('service-description')}
						>
							{$store.service.description || $t('dashboard.services.create.review.not_set')}
						</div>
						{#if needsTruncation($store.service.description || $t('dashboard.services.create.review.not_set'))}
							<button
								class="btn btn-sm bg-secondary text-secondary-content mt-2"
								onclick={() => toggleText('service-description')}
							>
								{isExpanded('service-description')
									? $t('dashboard.services.create.review.show_less')
									: $t('dashboard.services.create.review.show_more')}
							</button>
						{/if}
					</div>
				</div>
			</div>
			<div>
				<span class="font-semibold">{$t('dashboard.services.create.review.categories_label')}:</span
				>
				<div class="mt-1 ml-2 flex flex-wrap gap-2">
					{#each $store.service.categories || [] as category (typeof category === 'string' ? category : category.id)}
						<span class="badge badge-primary">
							{typeof category === 'string' ? category : category.name}
						</span>
					{:else}
						<span class="text-sm text-base-content/70"
							>{$t('dashboard.services.create.review.not_set')}</span
						>
					{/each}
				</div>
			</div>
			<div>
				<span class="font-semibold">{$t('dashboard.services.create.review.skills_label')}:</span>
				<div class="mt-1 ml-2 flex flex-wrap gap-2">
					{#each $store.service.skills || [] as skill (skill)}
						<span class="badge badge-secondary">{skill}</span>
					{:else}
						<span class="text-sm text-base-content/70"
							>{$t('dashboard.services.create.review.not_set')}</span
						>
					{/each}
				</div>
			</div>
			{#if ($store.service.serviceLocationTypes || []).length > 0}
				<div>
					<span class="font-semibold"
						>{$t('dashboard.services.create.review.location_types_label')}:</span
					>
					<div class="mt-1 ml-2 flex flex-wrap gap-2">
						{#each $store.service.serviceLocationTypes || [] as locationType (locationType)}
							<span class="badge badge-accent">{getLocationTypeLabel(locationType)}</span>
						{/each}
					</div>
				</div>

				{#if ($store.service.serviceLocationTypes || []).includes(ServiceLocationTypeEnum.TASKER_LOCATION)}
					{#if $store.service.locationDetails?.taskerLocation?.serviceLocation?.displayName}
						<div>
							<span class="font-semibold"
								>{$t('dashboard.services.create.location.tasker_title')}:</span
							>
							<span class="ml-2"
								>{$store.service.locationDetails.taskerLocation.serviceLocation.displayName}</span
							>
						</div>
					{/if}
					{#if $store.service.locationDetails?.taskerLocation?.serviceRadius}
						<div>
							<span class="font-semibold"
								>{$t('dashboard.services.create.location.service_radius_label')}:</span
							>
							<span class="ml-2"
								>{$store.service.locationDetails.taskerLocation.serviceRadius} km</span
							>
						</div>
					{/if}
				{/if}
				{#if ($store.service.serviceLocationTypes || []).includes(ServiceLocationTypeEnum.TASKEE_LOCATION) && $store.service.locationDetails?.taskeeLocation?.serviceLocation?.displayName}
					<div>
						<span class="font-semibold"
							>{$t('dashboard.services.create.location.taskee_title')}:</span
						>
						<span class="ml-2"
							>{$store.service.locationDetails.taskeeLocation.serviceLocation.displayName}</span
						>
					</div>
				{/if}
			{/if}
			{#if hasBookNowInfo()}
				<div>
					<span class="font-semibold">Book Now:</span>
					<div class="text-base-content/70 mt-1 ml-2 space-y-1 text-sm">
						{#if $store.service.instantBuyLeadHours != null}
							<div>
								Lead time before service starts: {$store.service.instantBuyLeadHours} hours
							</div>
						{/if}
						{#if $store.service.instantBuyDeliveryHours != null}
							<div>Delivery time: {$store.service.instantBuyDeliveryHours} hours</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Tiers (Service Tiers from Step 5) -->
	{#if $store.service.pricing && ($store.service.pricing.tiers || []).length > 0}
		<div class="card bg-base-200 p-6">
			<h4 class="mb-4 text-lg font-semibold">
				{$t('dashboard.services.create.review.tiers_title') || 'Niveles de Precio'}
			</h4>
			<div class="mb-4">
				<span class="font-semibold">{$t('dashboard.services.create.review.tiers_label')}:</span>
				<span class="ml-2"
					>{($store.service.pricing.tiers || []).length}
					{$t('dashboard.services.create.review.tiers_count')}</span
				>
			</div>
			<div class="space-y-2">
				{#each $store.service.pricing.tiers as tier (tier.id || `${tier.name}-${tier.price}`)}
					<div class="collapse-arrow bg-base-100 border-base-300 collapse border">
						<input type="checkbox" />
						<div class="collapse-title flex items-center gap-2 text-base font-medium">
							<span>{tier.name || $t('dashboard.services.create.review.tier_no_name')}</span>
							{#if tier.isPopular}
								<span class="badge badge-primary badge-sm"
									>{$t('dashboard.services.create.tiers.popular')}</span
								>
							{/if}
							<span class="ml-auto text-right font-bold text-white">
								$ {Number(tier.price).toLocaleString()}
								<span class="text-base-content/70 text-sm font-normal"
									>({priceToSats(tier.price)}
									{$t('dashboard.services.create.pricing.sats_label')})</span
								>
							</span>
						</div>
						<div class="collapse-content">
							<div class="space-y-3">
								{#if tier.description}
									<div>
										<span class="text-sm font-semibold"
											>{$t('dashboard.services.create.tiers.description_label')}:</span
										>
										<div>
											<div
												class="text-base-content/70 mt-1 cursor-pointer text-sm whitespace-pre-wrap"
												class:line-clamp-4={needsTruncation(tier.description) &&
													!isExpanded(`tier-desc-${tier.id}`)}
												role="button"
												tabindex="0"
												onclick={() =>
													needsTruncation(tier.description) && toggleText(`tier-desc-${tier.id}`)}
												onkeydown={(e) =>
													e.key === 'Enter' &&
													needsTruncation(tier.description) &&
													toggleText(`tier-desc-${tier.id}`)}
											>
												{tier.description}
											</div>
											{#if needsTruncation(tier.description)}
												<button
													class="btn btn-sm bg-secondary text-secondary-content mt-2"
													onclick={() => toggleText(`tier-desc-${tier.id}`)}
												>
													{isExpanded(`tier-desc-${tier.id}`)
														? $t('dashboard.services.create.review.show_less')
														: $t('dashboard.services.create.review.show_more')}
												</button>
											{/if}
										</div>
									</div>
								{/if}
								{#if tier.deliveryTime}
									<div>
										<span class="text-sm font-semibold"
											>{$t('dashboard.services.create.tiers.delivery_time_label')}:</span
										>
										<p class="text-base-content/70 mt-1 text-sm">
											{tier.deliveryTime.display ||
												`${tier.deliveryTime.min}-${tier.deliveryTime.max} ${tier.deliveryTime.unit}${tier.deliveryTime.max > 1 ? 's' : ''}`}
										</p>
									</div>
								{/if}
								{#if tier.rushDelivery?.enabled}
									<div>
										<span class="text-sm font-semibold"
											>{$t('dashboard.services.create.tiers.rush_delivery_label')}:</span
										>
										<p class="text-base-content/70 mt-1 text-sm">
											$ {Number(tier.rushDelivery.price).toLocaleString()} ({priceToSats(
												tier.rushDelivery.price
											)}
											{$t('dashboard.services.create.pricing.sats_label')}) - {tier.rushDelivery
												.deliveryTime.display ||
												`${tier.rushDelivery.deliveryTime.min}-${tier.rushDelivery.deliveryTime.max} ${tier.rushDelivery.deliveryTime.unit}${tier.rushDelivery.deliveryTime.max > 1 ? 's' : ''}`}
										</p>
									</div>
								{/if}
								{#if (tier.features || []).length > 0}
									<div>
										<span class="text-sm font-semibold"
											>{$t('dashboard.services.create.tiers.features_label')}:</span
										>
										<ul class="text-base-content/70 mt-1 list-inside list-disc space-y-1 text-sm">
											{#each tier.features as feature (feature)}
												{#if feature.trim()}
													<li>{feature}</li>
												{/if}
											{/each}
										</ul>
									</div>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Add-ons -->
	{#if $store.service.pricing && ($store.service.pricing.addOns || []).length > 0}
		<div class="card bg-base-200 p-6">
			<h4 class="mb-4 text-lg font-semibold">
				{$t('dashboard.services.create.review.addons_title') || 'Complementos y Extras'}
			</h4>
			<div class="mb-4">
				<span class="font-semibold"
					>{$t('dashboard.services.create.review.addons_count_label') || 'Complementos'}:</span
				>
				<span class="ml-2"
					>{($store.service.pricing.addOns || []).length}
					{$t('dashboard.services.create.review.addons') || 'complementos'}</span
				>
			</div>
			<div class="space-y-2">
				{#each $store.service.pricing.addOns as addOn (addOn.id || `${addOn.name}-${addOn.price}`)}
					<div class="collapse-arrow bg-base-100 border-base-300 collapse border">
						<input type="checkbox" />
						<div class="collapse-title flex items-center gap-2 text-base font-medium">
							<span>{addOn.name || $t('dashboard.services.create.review.addon_no_name')}</span>
							<span class="ml-auto text-right font-bold text-white">
								$ {Number(addOn.price).toLocaleString()}
								<span class="text-base-content/70 text-sm font-normal"
									>({priceToSats(addOn.price)}
									{$t('dashboard.services.create.pricing.sats_label')})</span
								>
							</span>
						</div>
						<div class="collapse-content">
							{#if addOn.description}
								<div>
									<div
										class="text-base-content/70 cursor-pointer text-sm whitespace-pre-wrap"
										class:line-clamp-4={needsTruncation(addOn.description) &&
											!isExpanded(`addon-desc-${addOn.id}`)}
										role="button"
										tabindex="0"
										onclick={() =>
											needsTruncation(addOn.description) && toggleText(`addon-desc-${addOn.id}`)}
										onkeydown={(e) =>
											e.key === 'Enter' &&
											needsTruncation(addOn.description) &&
											toggleText(`addon-desc-${addOn.id}`)}
									>
										{addOn.description}
									</div>
									{#if needsTruncation(addOn.description)}
										<button
											class="btn btn-sm bg-secondary text-secondary-content mt-2"
											onclick={() => toggleText(`addon-desc-${addOn.id}`)}
										>
											{isExpanded(`addon-desc-${addOn.id}`)
												? $t('dashboard.services.create.review.show_less')
												: $t('dashboard.services.create.review.show_more')}
										</button>
									{/if}
								</div>
							{:else}
								<p class="text-base-content/70 text-sm">
									{$t('dashboard.services.create.review.addon_no_description')}
								</p>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- FAQs (only when there is at least one FAQ) -->
	{#if ($store.service.faqs || []).length > 0}
		<div class="card bg-base-200 p-6">
			<h4 class="mb-4 text-lg font-semibold">
				{$t('dashboard.services.create.review.faqs_title')}
			</h4>
			<div class="mb-4">
				<span class="font-semibold">{$t('dashboard.services.create.review.faqs_count_label')}:</span
				>
				<span class="ml-2"
					>{($store.service.faqs || []).length} {$t('dashboard.services.create.review.faqs')}</span
				>
			</div>
			<div class="space-y-2">
				{#each $store.service.faqs as faq (faq.id || faq.question)}
					<div class="collapse-arrow bg-base-100 border-base-300 collapse border">
						<input type="checkbox" />
						<div class="collapse-title text-base font-medium">
							{faq.question || $t('dashboard.services.create.review.faq_no_question')}
						</div>
						<div class="collapse-content">
							<div>
								<div
									class="text-base-content/70 cursor-pointer text-sm whitespace-pre-wrap"
									class:line-clamp-4={needsTruncation(
										faq.answer || $t('dashboard.services.create.review.faq_no_answer')
									) && !isExpanded(`faq-answer-${faq.id}`)}
									role="button"
									tabindex="0"
									onclick={() =>
										needsTruncation(
											faq.answer || $t('dashboard.services.create.review.faq_no_answer')
										) && toggleText(`faq-answer-${faq.id}`)}
									onkeydown={(e) =>
										e.key === 'Enter' &&
										needsTruncation(
											faq.answer || $t('dashboard.services.create.review.faq_no_answer')
										) &&
										toggleText(`faq-answer-${faq.id}`)}
								>
									{faq.answer || $t('dashboard.services.create.review.faq_no_answer')}
								</div>
								{#if needsTruncation(faq.answer || $t('dashboard.services.create.review.faq_no_answer'))}
									<button
										class="btn btn-sm bg-secondary text-secondary-content mt-2"
										onclick={() => toggleText(`faq-answer-${faq.id}`)}
									>
										{isExpanded(`faq-answer-${faq.id}`)
											? $t('dashboard.services.create.review.show_less')
											: $t('dashboard.services.create.review.show_more')}
									</button>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Quote request form (only when custom fields were added) -->
	{#if ($store.service.pricing?.inquiryForm?.fields || []).length > 0}
		<div class="card bg-base-200 p-6">
			<h4 class="mb-4 text-lg font-semibold">
				{$t('dashboard.services.create.inquiry_form.title')}
			</h4>
			<div>
				<span class="font-semibold">{$t('dashboard.services.create.inquiry_form.field')}:</span>
				<span class="ml-2"
					>{($store.service.pricing?.inquiryForm?.fields || []).length}
					{$t('dashboard.services.create.review.items')}</span
				>
			</div>
		</div>
	{/if}

	<!-- Portfolio / Media (only when items were added): show thumbnails -->
	{#if ($store.service.portfolio || []).length > 0}
		<div class="card bg-base-200 p-6">
			<h4 class="mb-4 text-lg font-semibold">
				{$t('dashboard.services.create.review.portfolio_title')}
			</h4>
			<div class="mb-3">
				<span class="font-semibold"
					>{$t('dashboard.services.create.review.portfolio_items_label')}:</span
				>
				<span class="ml-2"
					>{($store.service.portfolio || []).length}
					{$t('dashboard.services.create.review.items')}</span
				>
			</div>
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
				{#each $store.service.portfolio || [] as item (item.url)}
					<div
						class="border-base-300 bg-base-300 relative aspect-square overflow-hidden rounded-lg border"
					>
						{#if isImageAttachment(item.type)}
							<img
								src={item.url}
								alt={item.alt || $t('dashboard.services.create.portfolio.item_alt')}
								class="h-full w-full object-cover"
								loading="lazy"
							/>
						{:else if isVideoAttachment(item.type)}
							<div class="flex h-full w-full flex-col items-center justify-center p-2">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="text-base-content/50 mb-1 h-10 w-10"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
									/>
								</svg>
								<span class="text-base-content/70 line-clamp-2 text-center text-xs"
									>{item.alt || 'Video'}</span
								>
							</div>
						{:else}
							<div class="flex h-full w-full items-center justify-center">
								<span class="text-base-content/70 text-xs">{item.alt || 'File'}</span>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	{#if errors.review}
		<div class="alert alert-outline alert-error">
			<span>{errors.review}</span>
		</div>
	{/if}
</div>
