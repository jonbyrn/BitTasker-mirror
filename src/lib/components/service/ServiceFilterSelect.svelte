<script lang="ts">
	import type { Service } from '$lib/types/service.d';
	import { locale } from 'svelte-i18n';
	import { buildServiceAddress } from '$lib/stores/service-quote-ui.store';
	import { getServiceDisplayTitle } from '$lib/utils/serviceDisplayTranslation';

	let {
		services = [],
		selectedServiceAddress = null,
		filterLabel = 'Filter by service',
		allServicesLabel = 'All Services',
		deletedServiceLabel = 'Deleted service',
		testId = 'service-filter-select',
		onChange = () => {}
	} = $props<{
		services?: Service[];
		selectedServiceAddress?: string | null;
		filterLabel?: string;
		allServicesLabel?: string;
		deletedServiceLabel?: string;
		testId?: string;
		onChange?: (serviceAddress: string | null) => void;
	}>();

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
			return allServicesLabel;
		}

		return (
			serviceOptions.find((service) => service.address === selectedServiceAddress)?.label ??
			deletedServiceLabel
		);
	});

	function handleChange(event: Event) {
		const nextServiceAddress = (event.currentTarget as HTMLSelectElement).value || null;
		onChange(nextServiceAddress);
	}
</script>

<div class="max-w-md" data-testid={testId}>
	<label class="form-control w-full">
		<select
			class="select select-bordered w-full truncate"
			value={selectedValue}
			onchange={handleChange}
			aria-label={filterLabel}
			title={selectedTitle}
		>
			<option value="">{allServicesLabel}</option>
			{#each serviceOptions as service (service.address)}
				<option value={service.address}>
					{service.label}
				</option>
			{/each}
			{#if selectedServiceAddress && !serviceAddresses.includes(selectedServiceAddress)}
				<option value={selectedServiceAddress}>
					{deletedServiceLabel}
				</option>
			{/if}
		</select>
	</label>
</div>
