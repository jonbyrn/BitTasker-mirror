<script lang="ts">
	import type { Service } from '$lib/types/service.d';
	import { t, locale } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import {
		getServiceDisplayTitle,
		getServiceDisplayDescription
	} from '$lib/utils/serviceDisplayTranslation';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
	import EntityShareButton from '$lib/components/shared/EntityShareButton.svelte';
	import type { EntitySharePayload } from '$lib/components/shared/entity-share';

	let {
		service,
		variant = 'circle',
		class: className = ''
	} = $props<{
		service: Service | null;
		variant?: 'default' | 'circle' | 'icon-only';
		class?: string;
	}>();

	function tr(key: string, fallback: string): string {
		try {
			const value = get(t)(key);
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}

	function truncateText(text: string, maxLength = 200): string {
		if (!text || text.length <= maxLength) return text;
		const truncated = text.substring(0, maxLength);
		const lastSpace = truncated.lastIndexOf(' ');
		if (lastSpace > 0) return truncated.substring(0, lastSpace) + '...';
		return truncated + '...';
	}

	function getPriceDisplay(svc: Service): string {
		if (!svc.pricing) return '';
		switch (svc.pricing.type) {
			case ServicePricingTypeEnum.FIXED:
				return svc.pricing.amount ? `$${formatNumberWithTwoDecimals(svc.pricing.amount)}` : '';
			case ServicePricingTypeEnum.HOURLY:
				return svc.pricing.hourlyRate
					? `$${formatNumberWithTwoDecimals(svc.pricing.hourlyRate)}/hr`
					: '';
			case ServicePricingTypeEnum.TIERED: {
				const prices =
					svc.pricing.tiers
						?.map((tier) => tier.price)
						.filter((price) => price != null && price > 0) || [];
				if (prices.length > 0) {
					const lowestPrice = Math.min(...prices);
					return `${tr('dashboard.services.detail.pricing_type.from', 'From')} $${formatNumberWithTwoDecimals(lowestPrice)}`;
				}
				return tr('dashboard.services.detail.pricing_type.tiered_pricing', 'Tiered pricing');
			}
			default:
				return '';
		}
	}

	function formatShareText(svc: Service): string {
		if (!svc) return tr('common.share.check_out_task', 'Check out this task');
		const currentLocale = get(locale) || 'en';
		const title = getServiceDisplayTitle(svc, currentLocale) || '';
		const description = getServiceDisplayDescription(svc, currentLocale) || '';
		// Start with title, then description
		let text = title ? `${title}\n\n` : '';
		text += description
			? truncateText(description, 200)
			: tr('common.share.check_out_task', 'Check out this task');
		const details: string[] = [];

		// Add pricing info
		const priceDisplay = getPriceDisplay(svc);
		if (priceDisplay) {
			details.push(`💰 ${tr('common.share.price', 'Price')}: ${priceDisplay}`);
		}

		// Add location info
		if (svc.serviceLocationTypes && svc.serviceLocationTypes.length > 0) {
			const locations = svc.serviceLocationTypes
				.map((type) =>
					type === 'remote'
						? tr('dashboard.services.detail.location.remote', 'Remote')
						: type === 'tasker_location'
							? tr('dashboard.services.detail.location.tasker_location', 'Tasker Location')
							: tr('dashboard.services.create.location.taskee_title', 'At Tasker Location')
				)
				.join(', ');
			details.push(`📍 ${tr('common.share.location', 'Location')}: ${locations}`);
		}

		if (details.length > 0) text += '\n\n' + details.join('\n\n');
		return text;
	}

	function getServiceShareLink(svc: Service | null): string {
		if (typeof window !== 'undefined' && svc) {
			const id = svc.uniqueId || svc.id;
			return `${window.location.origin}/services/${id}`;
		}
		return '';
	}

	function getServiceSharePayload(): EntitySharePayload | null {
		if (!service) return null;
		const svc = service;
		const link = getServiceShareLink(svc);
		if (!link) return null;
		const currentLocale = get(locale) || 'en';
		return {
			title:
				getServiceDisplayTitle(svc, currentLocale) ||
				tr('dashboard.services.browse.view_service', 'View Service'),
			text: formatShareText(svc),
			url: link
		};
	}
</script>

<EntityShareButton
	{variant}
	class={className}
	presentation="task"
	getSharePayload={getServiceSharePayload}
	title={tr('dashboard.services.detail.share_service', 'Share service')}
	ariaLabel={tr('dashboard.services.detail.share_service', 'Share service')}
	buttonText={variant === 'default' ? tr('dashboard.services.detail.share', 'Share') : null}
	successToast={tr('common.toast.link_copied', 'Link copied')}
	errorToast={tr('common.toast.link_copy_failed', 'Unable to copy link')}
/>
