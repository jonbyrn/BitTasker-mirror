<script lang="ts">
	import { page } from '$app/state';
	import RgbContractDetailView from '$lib/components/contracts/RgbContractDetailView.svelte';

	const contractId = $derived(page.params.contractId);
</script>

<RgbContractDetailView {contractId} role="tasker" />
