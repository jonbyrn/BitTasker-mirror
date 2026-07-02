<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { SvelteSet } from 'svelte/reactivity';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { serviceStore as store } from '$lib/stores/service.store';
	import { user } from '$lib/stores/user.store';
	import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { formatNumberForInput, SATS_PER_BTC } from '$lib/utils/helpers/crypto';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import ServiceDetailsView from '$lib/components/service/ServiceDetailsView.svelte';
	import type { Service } from '$lib/types/service';

	let { errors, direction } = $props();

	let btcPrice = $state<number>(0);

	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (err) {
			console.error('Error fetching BTC price:', err);
		}
	}

	function _priceToSats(usd: number): string {
		return formatNumberForInput(btcPrice > 0 ? Math.round((usd / btcPrice) * SATS_PER_BTC) : 0);
	}

	// Track expanded state for each text element
	let expandedTexts = new SvelteSet<string>();

	function _toggleText(id: string) {
		if (expandedTexts.has(id)) {
			expandedTexts.delete(id);
		} else {
			expandedTexts.add(id);
		}
	}

	function isExpanded(id: string): boolean {
		return expandedTexts.has(id);
	}

	// Line-clamp overflow (scrollHeight vs clientHeight), not character count — matches real UI
	let serviceDescriptionEl = $state<HTMLDivElement | null>(null);
	let _serviceDescriptionOverflows = $state(false);

	function _needsTruncation(text: string | undefined | null): boolean {
		if (!text) return false;
		return text.length > 200;
	}

	$effect(() => {
		const raw = $store.service.description;
		const expanded = isExpanded('service-description');
		void raw;
		void expanded;

		if (!browser) return;

		const scheduleMeasure = () => {
			tick().then(() => {
				requestAnimationFrame(() => {
					const el = serviceDescriptionEl;
					if (!el) {
						_serviceDescriptionOverflows = false;
						return;
					}
					if (expanded) return;
					_serviceDescriptionOverflows = el.scrollHeight > el.clientHeight + 1;
				});
			});
		};

		scheduleMeasure();

		const el = serviceDescriptionEl;
		if (!el || typeof ResizeObserver === 'undefined') return;

		const ro = new ResizeObserver(() => scheduleMeasure());
		ro.observe(el);
		return () => ro.disconnect();
	});

	function _isImageAttachment(type: string | undefined): boolean {
		return !!(type && (type === 'image/*' || type.startsWith('image/')));
	}

	function _isVideoAttachment(type: string | undefined): boolean {
		return !!(type && (type === 'video/*' || type.startsWith('video/')));
	}

	function _getLocationTypeLabel(locationType: ServiceLocationTypeEnum): string {
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

	function _translateCategory(
		category: string | { id: string; name: string; slug?: string }
	): string {
		try {
			const categoryId = typeof category === 'string' ? category : category.id;
			const categoryObj = TASK_CATEGORIES.find((cat) => cat.id === categoryId);
			if (categoryObj) {
				const translatedName = get(t)(`categories.${categoryObj.slug}.name`);
				return translatedName.startsWith('categories.') ? categoryObj.name : translatedName;
			}
			return typeof category === 'string' ? category : category.name;
		} catch {
			return typeof category === 'string' ? category : category.name;
		}
	}

	function _getPricingTypeLabel(pricingType: ServicePricingTypeEnum | undefined): string {
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

	function _getPricingSummaryValue(): string {
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

	function _formatTierDeliveryDisplay(deliveryTime: {
		value: number;
		unit: string;
		display?: string;
	}): string {
		return (
			deliveryTime.display ||
			`${deliveryTime.value} ${deliveryTime.unit}${deliveryTime.value > 1 ? 's' : ''}`
		);
	}

	function _hasBookNowInfo(): boolean {
		return (
			$store.service.instantBuyLeadHours != null || $store.service.instantBuyDeliveryHours != null
		);
	}

	onMount(() => {
		fetchBtcPrice();
	});
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
	<div class="w-full">
		<p class="text-base-content/70 mb-6">{$t('dashboard.services.create.review.description')}</p>
	</div>

	<!-- Preview -->
	<div class="border-base-300 overflow-hidden rounded-xl border">
		<ServiceDetailsView
			service={$store.service as unknown as Service}
			serviceId=""
			isPreview={true}
			isDraft={true}
			previewCreator={{
				username: $user?.username || 'You',
				avatar: $user?.picture,
				rating: 0,
				ratingCount: 0
			}}
		/>
	</div>

	{#if errors.review}
		<div class="alert alert-outline alert-error">
			<span>{errors.review}</span>
		</div>
	{/if}
</div>
