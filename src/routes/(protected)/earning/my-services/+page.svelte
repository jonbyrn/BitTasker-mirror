<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import DashboardMyServicesPanel from '$lib/components/service/DashboardMyServicesPanel.svelte';
	import type { Service } from '$lib/types/service.d';
	import { buildServiceAddress, serviceQuoteUiStore } from '$lib/stores/service-quote-ui.store';
	import { parseEarningQuery } from '$lib/utils/dashboardQuery';

	const parsed = $derived(parseEarningQuery(page.url));
	let status = $derived(parsed.status);

	function handleOpenServiceQuotes(service: Service) {
		serviceQuoteUiStore.setNonBlockingMessage(null);
		const serviceAddress = buildServiceAddress(service);
		goto(`/earning/requests?service=${encodeURIComponent(serviceAddress)}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}
</script>

<div
	id="panel-my-services"
	role="tabpanel"
	aria-labelledby="tab-my-services"
>
	<DashboardMyServicesPanel
		{status}
		onOpenServiceQuotes={handleOpenServiceQuotes}
	/>
</div>
