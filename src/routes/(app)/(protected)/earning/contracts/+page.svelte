<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import { parseEarningQuery } from '$lib/utils/dashboardQuery';

	function translateOrFallback(
		translate: (key: string) => string,
		key: string,
		fallback: string
	): string {
		const translated = translate(key);
		return translated === key ? fallback : translated;
	}

	const parsed = $derived(parseEarningQuery(page.url));
	let contractsType = $derived(parsed.type ?? 'all');
	let currentContractsHighlight = $derived(parsed.highlight ?? null);
	let selectedServiceAddress = $derived(parsed.service ?? null);
	let activeStatus = $derived(parsed.status ?? null);
	let nonBlockingMessageCode = $state<string | null>(null);

	function handleContractsHighlightConsumed() {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams();
		params.set('type', contractsType);
		if (selectedServiceAddress) params.set('service', selectedServiceAddress);
		goto(`/earning/contracts?${params.toString()}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	function handleContractsHighlightMissing() {
		nonBlockingMessageCode = 'contracts_highlight_not_found';
		handleContractsHighlightConsumed();
	}

	function handleContractsServiceFilterChange(serviceAddress: string | null) {
		nonBlockingMessageCode = null;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams();
		params.set('type', serviceAddress ? 'services' : 'all');
		if (serviceAddress) params.set('service', serviceAddress);
		goto(`/earning/contracts?${params.toString()}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	function handleContractsFiltersReset() {
		nonBlockingMessageCode = null;
		goto('/earning/contracts?type=all', {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}
</script>

{#if nonBlockingMessageCode === 'contracts_highlight_not_found'}
	<div class="alert alert-info my-4 text-sm">
		<span>
			{translateOrFallback(
				$t,
				'dashboard.earning.messages.contracts_highlight_not_found',
				'The requested contract highlight could not be found.'
			)}
		</span>
	</div>
{/if}

<div id="panel-contracts" role="tabpanel" aria-labelledby="tab-contracts" class="py-8 text-center">
	<p class="text-base-content/70 text-sm">
		{$t('dashboard.contracts.empty', { default: 'Native contract activity will appear here.' })}
	</p>
</div>
