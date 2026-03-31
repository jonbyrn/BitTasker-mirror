<script lang="ts">
	import type { Service } from '$lib/types/service.d';
	import { locale, t } from 'svelte-i18n';
	import { buildServiceAddress } from '$lib/stores/service-quote-ui.store';
	import { getServiceDisplayTitle } from '$lib/utils/serviceDisplayTranslation';

	let {
		services = [],
		selectedServiceAddress = null,
		filterLabel = null,
		allServicesLabel = null,
		deletedServiceLabel = null,
		testId = 'service-filter-select',
		containerClass = 'max-w-md',
		selectClass = 'select select-bordered w-full truncate',
		onChange = () => {}
	} = $props<{
		services?: Service[];
		selectedServiceAddress?: string | null;
		filterLabel?: string | null;
		allServicesLabel?: string | null;
		deletedServiceLabel?: string | null;
		testId?: string;
		containerClass?: string;
		selectClass?: string;
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

	const resolvedFilterLabel = $derived(
		filterLabel ?? tr('dashboard.contracts.filter_by_service', 'Filter by service')
	);
	const resolvedAllServicesLabel = $derived(
		allServicesLabel ?? tr('dashboard.contracts.all_services', 'All Services')
	);
	const resolvedDeletedServiceLabel = $derived(
		deletedServiceLabel ??
			tr('dashboard.services.my_services.quote_inbox.deleted_service_prefix', 'Deleted service')
	);

	const serviceOptions = $derived(
		services.map((service) => ({
			address: buildServiceAddress(service),
			label: getServiceDisplayTitle(service, $locale || 'en')
		}))
	);
	const serviceAddresses = $derived(serviceOptions.map((service) => service.address));
	const selectedValue = $derived(selectedServiceAddress ?? '');
	const selectedTitle = $derived.by(() => {
		if (!selectedServiceAddress) {
			return resolvedAllServicesLabel;
		}

		return (
			serviceOptions.find((service) => service.address === selectedServiceAddress)?.label ??
			resolvedDeletedServiceLabel
		);
	});

	function handleChange(event: Event) {
		const nextServiceAddress = (event.currentTarget as HTMLSelectElement).value || null;
		onChange(nextServiceAddress);
	}
</script>

<div class={containerClass} data-testid={testId}>
	<label class="form-control w-full">
		<select
			class={selectClass}
			value={selectedValue}
			onchange={handleChange}
			aria-label={resolvedFilterLabel}
			title={selectedTitle}
		>
			<option value="">{resolvedAllServicesLabel}</option>
			{#each serviceOptions as service (service.address)}
				<option value={service.address}>
					{service.label}
				</option>
			{/each}
			{#if selectedServiceAddress && !serviceAddresses.includes(selectedServiceAddress)}
				<option value={selectedServiceAddress}>
					{resolvedDeletedServiceLabel}
				</option>
			{/if}
		</select>
	</label>
</div>
