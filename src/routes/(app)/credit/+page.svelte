<script lang="ts">
	import { page } from '$app/state';
	import { t } from 'svelte-i18n';
	import CreditBetaBanner from '$lib/components/credit/CreditBetaBanner.svelte';
	import CreditDeskPanel from '$lib/components/credit/CreditDeskPanel.svelte';
	import CreditLivePanel from '$lib/components/credit/CreditLivePanel.svelte';
	import { creditSurface } from '$lib/credit/network';
	import { isCreditEnabled } from '$lib/services/feature-flags';

	const surface = $derived(
		creditSurface({
			enabled: isCreditEnabled(),
			dev: import.meta.env.DEV === true,
			host: page.url.hostname,
			search: page.url.search
		})
	);
</script>

<div class="mx-auto flex w-full max-w-lg flex-col gap-4 px-3 py-6">
	<header class="flex flex-wrap items-center gap-2">
		<h1 class="text-2xl font-bold">{$t('credit.page_title')}</h1>
	</header>
	{#if surface === 'off'}
		<section
			class="card bg-base-100 border-base-300 border shadow-sm"
			data-testid="credit-disabled"
		>
			<div class="card-body p-5">
				<h2 class="text-lg font-semibold">{$t('credit.off_title')}</h2>
				<p class="text-sm">{$t('credit.off_body')}</p>
			</div>
		</section>
	{:else}
		<CreditBetaBanner />
		{#if surface === 'mock'}
			<CreditDeskPanel />
		{:else}
			<CreditLivePanel />
		{/if}
	{/if}
</div>
