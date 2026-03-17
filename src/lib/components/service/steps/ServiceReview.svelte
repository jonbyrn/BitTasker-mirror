<script lang="ts">
	import { onMount } from 'svelte';
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
	let expandedTexts = $state<Set<string>>(new Set());

	function toggleText(id: string) {
		if (expandedTexts.has(id)) {
			expandedTexts.delete(id);
		} else {
			expandedTexts.add(id);
		}
		expandedTexts = new Set(expandedTexts);
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

	<!-- Service Basics -->
	<div class="card bg-base-200 p-6">
		<h4 class="font-semibold text-lg mb-4">{$t('dashboard.services.create.review.basics_title')}</h4>
		<div class="space-y-2">
			<div>
				<span class="font-semibold">{$t('dashboard.services.create.review.title_label')}:</span>
				<span class="ml-2">{$store.service.title || $t('dashboard.services.create.review.not_set')}</span>
			</div>
			<div>
				<span class="font-semibold">{$t('dashboard.services.create.review.description_label')}:</span>
				<div class="ml-2">
					{#each [$store.service.description || $t('dashboard.services.create.review.not_set')] as description}
						<div>
							<div
								class="text-sm text-base-content/70 cursor-pointer"
								class:line-clamp-4={needsTruncation(description) && !isExpanded('service-description')}
								role="button"
								tabindex="0"
								onclick={() => needsTruncation(description) && toggleText('service-description')}
								onkeydown={(e) => e.key === 'Enter' && needsTruncation(description) && toggleText('service-description')}
							>
								{description}
							</div>
							{#if needsTruncation(description)}
								<button
									class="btn btn-sm bg-secondary text-secondary-content mt-2"
									onclick={() => toggleText('service-description')}
								>
									{isExpanded('service-description') ? $t('dashboard.services.create.review.show_less') : $t('dashboard.services.create.review.show_more')}
								</button>
							{/if}
						</div>
					{/each}
				</div>
			</div>
			<div>
				<span class="font-semibold">{$t('dashboard.services.create.review.categories_label')}:</span>
				<div class="ml-2 flex flex-wrap gap-2 mt-1">
					{#each ($store.service.categories || []) as category}
						<span class="badge badge-primary">
							{typeof category === 'string' ? category : category.name}
						</span>
					{:else}
						<span class="text-sm text-base-content/70">{$t('dashboard.services.create.review.not_set')}</span>
					{/each}
				</div>
			</div>
			<div>
				<span class="font-semibold">{$t('dashboard.services.create.review.skills_label')}:</span>
				<div class="ml-2 flex flex-wrap gap-2 mt-1">
					{#each ($store.service.skills || []) as skill}
						<span class="badge badge-secondary">{skill}</span>
					{:else}
						<span class="text-sm text-base-content/70">{$t('dashboard.services.create.review.not_set')}</span>
					{/each}
				</div>
			</div>
		</div>
	</div>

	<!-- Location (only if any location type selected) -->
	{#if ($store.service.serviceLocationTypes || []).length > 0}
		<div class="card bg-base-200 p-6">
			<h4 class="font-semibold text-lg mb-4">{$t('dashboard.services.create.review.location_title')}</h4>
			<div class="space-y-4">
				<div>
					<span class="font-semibold">{$t('dashboard.services.create.review.location_types_label')}:</span>
					<div class="ml-2 flex flex-wrap gap-2 mt-1">
						{#each $store.service.serviceLocationTypes || [] as locationType}
							<span class="badge badge-accent">
								{#if locationType === ServiceLocationTypeEnum.REMOTE}
									{$t('dashboard.services.create.location.remote_title')}
								{:else if locationType === ServiceLocationTypeEnum.TASKER_LOCATION}
									{$t('dashboard.services.create.location.tasker_title')}
								{:else if locationType === ServiceLocationTypeEnum.TASKEE_LOCATION}
									{$t('dashboard.services.create.location.taskee_title')}
								{/if}
							</span>
						{/each}
					</div>
				</div>

				<!-- Tasker Location Details -->
				{#if ($store.service.serviceLocationTypes || []).includes(ServiceLocationTypeEnum.TASKER_LOCATION)}
					{#if $store.service.locationDetails?.taskerLocation?.serviceLocation?.displayName}
						<div>
							<span class="font-semibold">{$t('dashboard.services.create.location.tasker_title')}:</span>
							<span class="ml-2">{$store.service.locationDetails.taskerLocation.serviceLocation.displayName}</span>
						</div>
					{/if}
					{#if $store.service.locationDetails?.taskerLocation?.serviceRadius}
						<div>
							<span class="font-semibold">{$t('dashboard.services.create.location.service_radius_label')}:</span>
							<span class="ml-2">{$store.service.locationDetails.taskerLocation.serviceRadius} km</span>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	{/if}

	<!-- Pricing (no currency label, only type and amount/tiers when applicable) -->
	<div class="card bg-base-200 p-6">
		<h4 class="font-semibold text-lg mb-4">{$t('dashboard.services.create.review.pricing_title')}</h4>
		<div class="space-y-2">
			<div>
				<span class="font-semibold">{$t('dashboard.services.create.review.pricing_type_label')}:</span>
				<span class="ml-2">
					{#if $store.service.pricing?.type === ServicePricingTypeEnum.FIXED}
						{$t('dashboard.services.create.pricing.fixed_title')}
					{:else if $store.service.pricing?.type === ServicePricingTypeEnum.HOURLY}
						{$t('dashboard.services.create.pricing.hourly_title')}
					{:else if $store.service.pricing?.type === ServicePricingTypeEnum.TIERED}
						{$t('dashboard.services.create.pricing.tiered_title')}
					{:else if $store.service.pricing?.type === ServicePricingTypeEnum.INQUIRY_REQUIRED}
						{$t('dashboard.services.create.pricing.inquiry_title')}
					{:else}
						{$t('dashboard.services.create.review.not_set')}
					{/if}
				</span>
			</div>
			{#if $store.service.pricing?.type === ServicePricingTypeEnum.FIXED && $store.service.pricing?.amount != null}
				<div>
					<span class="font-semibold">{$t('dashboard.services.create.review.amount_label')}:</span>
					<span class="ml-2">$ {Number($store.service.pricing.amount).toLocaleString()}</span>
				</div>
			{:else if $store.service.pricing?.type === ServicePricingTypeEnum.HOURLY}
				<div>
					<span class="font-semibold">{$t('dashboard.services.create.review.hourly_rate_label')}:</span>
					<span class="ml-2">$ {Number($store.service.pricing?.hourlyRate || 0).toLocaleString()}/{$t('dashboard.services.create.pricing.hour')}</span>
				</div>
			{:else if $store.service.pricing?.type === ServicePricingTypeEnum.TIERED}
				<div>
					<span class="font-semibold">{$t('dashboard.services.create.review.tiers_label')}:</span>
					<span class="ml-2">{($store.service.pricing?.tiers || []).length} {$t('dashboard.services.create.review.tiers_count')}</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Tiers (Service Tiers from Step 5) -->
	{#if $store.service.pricing && ($store.service.pricing.tiers || []).length > 0}
		<div class="card bg-base-200 p-6">
			<h4 class="font-semibold text-lg mb-4">{$t('dashboard.services.create.review.tiers_title') || 'Niveles de Precio'}</h4>
			<div class="mb-4">
				<span class="font-semibold">{$t('dashboard.services.create.review.tiers_label')}:</span>
				<span class="ml-2">{($store.service.pricing.tiers || []).length} {$t('dashboard.services.create.review.tiers_count')}</span>
			</div>
			<div class="space-y-2">
				{#each $store.service.pricing.tiers as tier}
					<div class="collapse collapse-arrow bg-base-100 border border-base-300">
						<input type="checkbox" />
						<div class="collapse-title font-medium text-base flex items-center gap-2">
							<span>{tier.name || $t('dashboard.services.create.review.tier_no_name')}</span>
							{#if tier.isPopular}
								<span class="badge badge-primary badge-sm">{$t('dashboard.services.create.tiers.popular')}</span>
							{/if}
							<span class="ml-auto font-bold text-white text-right">
								$ {Number(tier.price).toLocaleString()} <span class="text-base-content/70 font-normal text-sm">({priceToSats(tier.price)} {$t('dashboard.services.create.pricing.sats_label')})</span>
							</span>
						</div>
						<div class="collapse-content">
							<div class="space-y-3">
								{#if tier.description}
									<div>
										<span class="font-semibold text-sm">{$t('dashboard.services.create.tiers.description_label')}:</span>
										{#each [tier.description] as tierDesc}
											<div>
												<div
													class="text-sm text-base-content/70 mt-1 whitespace-pre-wrap cursor-pointer"
													class:line-clamp-4={needsTruncation(tierDesc) && !isExpanded(`tier-desc-${tier.id}`)}
													role="button"
													tabindex="0"
													onclick={() => needsTruncation(tierDesc) && toggleText(`tier-desc-${tier.id}`)}
													onkeydown={(e) => e.key === 'Enter' && needsTruncation(tierDesc) && toggleText(`tier-desc-${tier.id}`)}
												>
													{tierDesc}
												</div>
												{#if needsTruncation(tierDesc)}
													<button
														class="btn btn-sm bg-secondary text-secondary-content mt-2"
														onclick={() => toggleText(`tier-desc-${tier.id}`)}
													>
														{isExpanded(`tier-desc-${tier.id}`) ? $t('dashboard.services.create.review.show_less') : $t('dashboard.services.create.review.show_more')}
													</button>
												{/if}
											</div>
										{/each}
									</div>
								{/if}
								{#if tier.deliveryTime}
									<div>
										<span class="font-semibold text-sm">{$t('dashboard.services.create.tiers.delivery_time_label')}:</span>
										<p class="text-sm text-base-content/70 mt-1">{tier.deliveryTime.display || `${tier.deliveryTime.min}-${tier.deliveryTime.max} ${tier.deliveryTime.unit}${tier.deliveryTime.max > 1 ? 's' : ''}`}</p>
									</div>
								{/if}
								{#if tier.rushDelivery?.enabled}
									<div>
										<span class="font-semibold text-sm">{$t('dashboard.services.create.tiers.rush_delivery_label')}:</span>
										<p class="text-sm text-base-content/70 mt-1">
											$ {Number(tier.rushDelivery.price).toLocaleString()} ({priceToSats(tier.rushDelivery.price)} {$t('dashboard.services.create.pricing.sats_label')}) - {tier.rushDelivery.deliveryTime.display || `${tier.rushDelivery.deliveryTime.min}-${tier.rushDelivery.deliveryTime.max} ${tier.rushDelivery.deliveryTime.unit}${tier.rushDelivery.deliveryTime.max > 1 ? 's' : ''}`}
										</p>
									</div>
								{/if}
								{#if (tier.features || []).length > 0}
									<div>
										<span class="font-semibold text-sm">{$t('dashboard.services.create.tiers.features_label')}:</span>
										<ul class="list-disc list-inside text-sm text-base-content/70 mt-1 space-y-1">
											{#each tier.features as feature}
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
			<h4 class="font-semibold text-lg mb-4">{$t('dashboard.services.create.review.addons_title') || 'Complementos y Extras'}</h4>
			<div class="mb-4">
				<span class="font-semibold">{$t('dashboard.services.create.review.addons_count_label') || 'Complementos'}:</span>
				<span class="ml-2">{($store.service.pricing.addOns || []).length} {$t('dashboard.services.create.review.addons') || 'complementos'}</span>
			</div>
			<div class="space-y-2">
				{#each $store.service.pricing.addOns as addOn}
					<div class="collapse collapse-arrow bg-base-100 border border-base-300">
						<input type="checkbox" />
						<div class="collapse-title font-medium text-base flex items-center gap-2">
							<span>{addOn.name || $t('dashboard.services.create.review.addon_no_name')}</span>
							<span class="ml-auto font-bold text-white text-right">
								$ {Number(addOn.price).toLocaleString()} <span class="text-base-content/70 font-normal text-sm">({priceToSats(addOn.price)} {$t('dashboard.services.create.pricing.sats_label')})</span>
							</span>
						</div>
						<div class="collapse-content">
							{#if addOn.description}
								{#each [addOn.description] as addOnDesc}
									<div>
										<div
											class="text-sm text-base-content/70 whitespace-pre-wrap cursor-pointer"
											class:line-clamp-4={needsTruncation(addOnDesc) && !isExpanded(`addon-desc-${addOn.id}`)}
											role="button"
											tabindex="0"
											onclick={() => needsTruncation(addOnDesc) && toggleText(`addon-desc-${addOn.id}`)}
											onkeydown={(e) => e.key === 'Enter' && needsTruncation(addOnDesc) && toggleText(`addon-desc-${addOn.id}`)}
										>
											{addOnDesc}
										</div>
										{#if needsTruncation(addOnDesc)}
											<button
												class="btn btn-sm bg-secondary text-secondary-content mt-2"
												onclick={() => toggleText(`addon-desc-${addOn.id}`)}
											>
												{isExpanded(`addon-desc-${addOn.id}`) ? $t('dashboard.services.create.review.show_less') : $t('dashboard.services.create.review.show_more')}
											</button>
										{/if}
									</div>
								{/each}
							{:else}
								<p class="text-sm text-base-content/70">
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
			<h4 class="font-semibold text-lg mb-4">{$t('dashboard.services.create.review.faqs_title')}</h4>
			<div class="mb-4">
				<span class="font-semibold">{$t('dashboard.services.create.review.faqs_count_label')}:</span>
				<span class="ml-2">{($store.service.faqs || []).length} {$t('dashboard.services.create.review.faqs')}</span>
			</div>
			<div class="space-y-2">
				{#each $store.service.faqs as faq}
					<div class="collapse collapse-arrow bg-base-100 border border-base-300">
						<input type="checkbox" />
						<div class="collapse-title font-medium text-base">
							{faq.question || $t('dashboard.services.create.review.faq_no_question')}
						</div>
						<div class="collapse-content">
							{#each [faq.answer || $t('dashboard.services.create.review.faq_no_answer')] as faqAnswer}
								<div>
									<div
										class="text-sm text-base-content/70 whitespace-pre-wrap cursor-pointer"
										class:line-clamp-4={needsTruncation(faqAnswer) && !isExpanded(`faq-answer-${faq.id}`)}
										role="button"
										tabindex="0"
										onclick={() => needsTruncation(faqAnswer) && toggleText(`faq-answer-${faq.id}`)}
										onkeydown={(e) => e.key === 'Enter' && needsTruncation(faqAnswer) && toggleText(`faq-answer-${faq.id}`)}
									>
										{faqAnswer}
									</div>
									{#if needsTruncation(faqAnswer)}
										<button
											class="btn btn-sm bg-secondary text-secondary-content mt-2"
											onclick={() => toggleText(`faq-answer-${faq.id}`)}
										>
											{isExpanded(`faq-answer-${faq.id}`) ? $t('dashboard.services.create.review.show_less') : $t('dashboard.services.create.review.show_more')}
										</button>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Quote request form (only when custom fields were added) -->
	{#if ($store.service.pricing?.inquiryForm?.fields || []).length > 0}
		<div class="card bg-base-200 p-6">
			<h4 class="font-semibold text-lg mb-4">{$t('dashboard.services.create.inquiry_form.title')}</h4>
			<div>
				<span class="font-semibold">{$t('dashboard.services.create.inquiry_form.field')}:</span>
				<span class="ml-2">{($store.service.pricing?.inquiryForm?.fields || []).length} {$t('dashboard.services.create.review.items')}</span>
			</div>
		</div>
	{/if}

	<!-- Portfolio / Media (only when items were added): show thumbnails -->
	{#if ($store.service.portfolio || []).length > 0}
		<div class="card bg-base-200 p-6">
			<h4 class="font-semibold text-lg mb-4">{$t('dashboard.services.create.review.portfolio_title')}</h4>
			<div class="mb-3">
				<span class="font-semibold">{$t('dashboard.services.create.review.portfolio_items_label')}:</span>
				<span class="ml-2">{($store.service.portfolio || []).length} {$t('dashboard.services.create.review.items')}</span>
			</div>
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
				{#each $store.service.portfolio || [] as item}
					<div class="relative aspect-square overflow-hidden rounded-lg border border-base-300 bg-base-300">
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
									class="h-10 w-10 text-base-content/50 mb-1"
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
								<span class="text-xs text-base-content/70 text-center line-clamp-2">{item.alt || 'Video'}</span>
							</div>
						{:else}
							<div class="flex h-full w-full items-center justify-center">
								<span class="text-xs text-base-content/70">{item.alt || 'File'}</span>
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

