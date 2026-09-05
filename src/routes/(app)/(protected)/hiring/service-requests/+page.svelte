<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import { slide } from 'svelte/transition';
	import {
		serviceQuoteUiStore,
		getTaskerTimelines,
		isRequestSyncActive,
		createDashboardUrl
	} from '$lib/stores/service-quote-ui.store';

	function translateOrFallback(key: string, fallback: string): string {
		const translated = $t(key);
		return translated === key ? fallback : translated;
	}

	let focusedRequestId = $state<string | null>(null);
	let activeStatus = $state<string | null>(null);
	let taskerTimelines = $state<ReturnType<typeof getTaskerTimelines>>([]);
	let nonBlockingMessageCode = $state<string | null>(null);
	let taskerQuotesStoreSyncing = $state(false);
	const taskerQuotesSyncing = $derived(taskerQuotesStoreSyncing);
	let taskerQuotesError = $state<string | null>(null);
	let taskerQuotesLoaded = $state(false);

	function syncFromUrl() {
		focusedRequestId = page.url.searchParams.get('requestId') || null;
		activeStatus = page.url.searchParams.get('status') || null;
		const messageCodeParam = page.url.searchParams.get('messageCode');
		if (messageCodeParam) {
			nonBlockingMessageCode = messageCodeParam;
		}
	}

	onMount(() => {
		syncFromUrl();

		void serviceQuoteUiStore.loadTaskerTimelines(focusedRequestId).catch(() => {});

		const unsubscribeServiceQuotes = serviceQuoteUiStore.subscribe((state) => {
			taskerTimelines = getTaskerTimelines(state);
			nonBlockingMessageCode = state.nonBlockingMessageCode;
			taskerQuotesError = state.taskerLoadError;
			taskerQuotesLoaded = state.taskerLoaded;
			taskerQuotesStoreSyncing =
				state.loadingTasker || isRequestSyncActive(state, focusedRequestId, null);
		});

		return () => {
			unsubscribeServiceQuotes();
		};
	});

	$effect(() => {
		page.url.searchParams.toString();
		syncFromUrl();
	});

	function handleTaskerRequestFocus(requestId: string | null) {
		serviceQuoteUiStore.setNonBlockingMessage(
			requestId === null ? 'service_requests_request_not_found' : null
		);
		const nextUrl = createDashboardUrl(page.url, {
			tab: 'service-requests',
			view: 'tasker',
			requestId,
			status: activeStatus
		});
		goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
	}

</script>

{#if nonBlockingMessageCode}
	<div class="alert alert-info my-4 text-sm" transition:slide={{ duration: 300 }}>
		<span>
			{#if nonBlockingMessageCode === 'service_requests_request_not_found'}
				{translateOrFallback(
					'dashboard.hiring.messages.quotes_request_not_found',
					'The requested quote thread could not be found.'
				)}
			{:else if nonBlockingMessageCode === 'service_quotes_request_not_found'}
				{translateOrFallback(
					'dashboard.hiring.messages.service_quotes_request_not_found',
					'The selected service quote thread could not be found.'
				)}
			{:else if nonBlockingMessageCode === 'contracts_highlight_not_found'}
				{translateOrFallback(
					'dashboard.hiring.messages.contracts_highlight_not_found',
					'The requested contract highlight could not be found.'
				)}
			{/if}
		</span>
	</div>
{/if}

<div class="space-y-3" transition:slide={{ duration: 300 }}>
	{#if taskerQuotesError}
		<div class="alert alert-error text-sm">{taskerQuotesError}</div>
	{:else if !taskerQuotesLoaded || taskerQuotesSyncing}
		<div class="flex justify-center py-8"><span class="loading loading-spinner"></span></div>
	{:else if taskerTimelines.length === 0}
		<div class="py-8 text-center text-sm opacity-70">
			{$t('dashboard.services.requests.empty', { default: 'No service requests yet.' })}
		</div>
	{:else}
		{#each taskerTimelines as timeline (timeline.request.content.quoteRequestId)}
			<button
				type="button"
				class="border-base-300 hover:bg-base-200 w-full rounded-lg border p-4 text-left"
				onclick={() => handleTaskerRequestFocus(timeline.request.content.quoteRequestId)}
			>
				<strong>{timeline.request.content.inquiry.title}</strong>
				<p class="text-base-content/60 text-sm">{timeline.request.content.inquiry.description}</p>
			</button>
		{/each}
	{/if}
</div>
