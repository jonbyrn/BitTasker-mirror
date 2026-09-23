<script lang="ts">
	import type { Service } from '$lib/types/service.d';
	import { locale, t } from 'svelte-i18n';
	import { buildServiceAddress } from '$lib/utils/service-quote/protocol';
	import { getServiceDisplayTitle } from '$lib/utils/serviceDisplayTranslation';
	import DashboardDropdown from '$lib/components/shared/DashboardDropdown.svelte';

	let {
		services = [],
		selectedServiceAddress = null,
		allServicesLabel = null,
		deletedServiceLabel = null,
		testId = 'service-filter-select',
		containerClass = 'w-full sm:max-w-md',
		onChange = () => {}
	} = $props<{
		services?: Service[];
		selectedServiceAddress?: string | null;
		allServicesLabel?: string | null;
		deletedServiceLabel?: string | null;
		testId?: string;
		containerClass?: string;
		onChange?: (serviceAddress: string | null) => void;
	}>();

	function tr(key: string, fallback: string): string {
		try {
			const value = $t(key);
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}

	const resolvedAllServicesLabel = $derived(
		allServicesLabel ?? tr('dashboard.contracts.all_services', 'All Services')
	);
	const resolvedDeletedServiceLabel = $derived(
		deletedServiceLabel ??
			tr('dashboard.services.my_services.quote_inbox.deleted_service_prefix', 'Deleted service')
	);

	const serviceDropdownOptions = $derived.by(() => {
		const options = [
			{
				id: 'all',
				label: resolvedAllServicesLabel
			},
			...services.map((s: Service) => ({
				id: buildServiceAddress(s),
				label: getServiceDisplayTitle(s, $locale || 'en')
			}))
		];

		if (
			selectedServiceAddress &&
			selectedServiceAddress !== 'all' &&
			!services.some((s: Service) => buildServiceAddress(s) === selectedServiceAddress)
		) {
			options.push({
				id: selectedServiceAddress,
				label: resolvedDeletedServiceLabel
			});
		}

		return options;
	});

	const selectedValue = $derived(selectedServiceAddress ?? 'all');

	function handleSelect(value: string) {
		onChange(value === 'all' ? null : value);
	}
</script>

<DashboardDropdown
	options={serviceDropdownOptions}
	value={selectedValue}
	onSelect={handleSelect}
	{containerClass}
	{testId}
/>
