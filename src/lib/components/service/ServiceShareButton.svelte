<script lang="ts">
	import type { Service } from '$lib/types/service.d';
	import { t, locale } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { getServiceDisplayTitle, getServiceDisplayDescription } from '$lib/utils/serviceDisplayTranslation';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
	import EntityShareButton from '$lib/components/shared/EntityShareButton.svelte';
	import type { EntitySharePayload } from '$lib/components/shared/entity-share';

	let { service, variant = 'circle', class: className = '' } = $props<{
		service: Service | null;
		variant?: 'default' | 'circle' | 'icon-only';
		class?: string;
	}>();

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
				return svc.pricing.hourlyRate ? `$${formatNumberWithTwoDecimals(svc.pricing.hourlyRate)}/hr` : '';
			case ServicePricingTypeEnum.TIERED:
				return 'Tiered pricing';
			default:
				return '';
		}
	}

	function formatShareText(svc: Service): string {
		if (!svc) return get(t)('common.share.check_out_task');
		const currentLocale = get(locale) || 'en';
		const title = getServiceDisplayTitle(svc, currentLocale) || '';
		const description = getServiceDisplayDescription(svc, currentLocale) || '';
		// Start with title, then description
		let text = title ? `${title}\n\n` : '';
		text += description ? truncateText(description, 200) : get(t)('common.share.check_out_task');
		const details: string[] = [];

		// Add pricing info
		const priceDisplay = getPriceDisplay(svc);
		if (priceDisplay) {
			details.push(`💰 Price:\n${priceDisplay}`);
		}

		// Add location info
		if (svc.serviceLocationTypes && svc.serviceLocationTypes.length > 0) {
			const locations = svc.serviceLocationTypes
				.map((type) =>
					type === 'remote' ? 'Remote' : type === 'tasker_location' ? 'Tasker Location' : 'Taskee Location'
				)
				.join(', ');
			details.push(`📍 Location:\n${locations}`);
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
				get(t)('dashboard.services.browse.view_service'),
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
	title={$t('dashboard.services.detail.share_service') || 'Share service'}
	ariaLabel={$t('dashboard.services.detail.share_service') || 'Share service'}
	buttonText={variant === 'default' ? $t('dashboard.services.detail.share') : null}
	successToast={$t('common.toast.link_copied')}
	errorToast={$t('common.toast.link_copy_failed')}
/>
