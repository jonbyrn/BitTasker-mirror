<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import DashboardContractsPanelNDK from '$lib/components/contracts/DashboardContractsPanelNDK.svelte';
	import {
		serviceQuoteUiStore,
		createDashboardUrl,
		type DashboardContractsType
	} from '$lib/stores/service-quote-ui.store';
	import type { DashboardContractTypeFilter } from '$lib/utils/helpers/dashboardContractFilters';

	let contractsType = $state<DashboardContractsType>('all');
	let currentContractsHighlight = $state<string | null>(null);

	function syncFromUrl() {
		const typeParam = page.url.searchParams.get('type');
		contractsType =
			typeParam === 'tasks' || typeParam === 'services' ? typeParam : 'all';
		currentContractsHighlight = page.url.searchParams.get('highlight') || null;
	}

	onMount(syncFromUrl);

	$effect(() => {
		page.url.searchParams.toString();
		syncFromUrl();
	});

	const contractsInitialType = $derived.by<DashboardContractTypeFilter>(() => {
		if (contractsType === 'services') return 'services';
		if (contractsType === 'tasks') return 'tasks';
		return 'all';
	});

	function handleContractsHighlightConsumed() {
		const nextUrl = createDashboardUrl(page.url, {
			tab: 'contracts',
			type: contractsType,
			highlight: null
		});
		goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}

	function handleContractsHighlightMissing() {
		serviceQuoteUiStore.setNonBlockingMessage('contracts_highlight_not_found');
		const nextUrl = createDashboardUrl(page.url, {
			tab: 'contracts',
			type: contractsType,
			highlight: null
		});
		goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}
</script>

<div transition:slide={{ duration: 300 }}>
	<DashboardContractsPanelNDK
		initialType={contractsInitialType}
		showRoleFilters={false}
		fixedRole="client"
		highlightEscrowId={currentContractsHighlight}
		onHighlightConsumed={handleContractsHighlightConsumed}
		onHighlightMissing={handleContractsHighlightMissing}
	/>
</div>
