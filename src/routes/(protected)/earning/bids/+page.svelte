<script lang="ts">
	import { page } from '$app/state';
	import DashboardBidsPanel from '$lib/components/bidding/DashboardBidsPanel.svelte';

	let status = $derived(page.url.searchParams.get('bidStatus') || page.url.searchParams.get('status') || null);
</script>

<div
	id="panel-bids"
	role="tabpanel"
	aria-labelledby="tab-bids"
>
	<DashboardBidsPanel {status} />
</div>
