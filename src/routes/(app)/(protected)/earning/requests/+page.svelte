<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { get } from 'svelte/store';
	import { t } from 'svelte-i18n';
	import { serviceQuoteUiStore } from '$lib/stores/service-quote-ui.store';
	import { parseEarningQuery } from '$lib/utils/dashboardQuery';

	function clearRequestsRouteMessage() {
		if (get(serviceQuoteUiStore).nonBlockingMessageCode !== null) {
			serviceQuoteUiStore.setNonBlockingMessage(null);
		}
	}

	function translateOrFallback(
		translate: (key: string) => string,
		key: string,
		fallback: string
	): string {
		const translated = translate(key);
		return translated === key ? fallback : translated;
	}

	const parsed = $derived(parseEarningQuery(page.url));
	let status = $derived(parsed.status);
	let selectedServiceAddress = $derived(parsed.service);
	let focusedRequestId = $derived(parsed.request);
	let nonBlockingMessageCode = $state<string | null>(null);

	function handleProviderRouteUpdate(
		update:
			| {
					type: 'service';
					serviceAddress: string;
					requestId?: string | null;
					status?: string | null;
			  }
			| { type: 'reset'; status?: string | null }
			| { type: 'request'; requestId: string | null; status?: string | null }
	) {
		if (update.type === 'reset') {
			nonBlockingMessageCode = null;
			clearRequestsRouteMessage();
			goto(`/earning/requests?status=${update.status ?? ''}`, {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
			return;
		}

		if (update.type === 'request') {
			const pendingMessageCode = get(serviceQuoteUiStore).nonBlockingMessageCode;
			nonBlockingMessageCode =
				update.requestId === null && pendingMessageCode === 'service_requests_request_not_found'
					? 'service_requests_request_not_found'
					: null;
			if (pendingMessageCode !== null) {
				serviceQuoteUiStore.setNonBlockingMessage(null);
			}
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const params = new URLSearchParams();
			if (selectedServiceAddress) params.set('service', selectedServiceAddress);
			if (update.requestId) params.set('request', update.requestId);
			if (update.status) params.set('status', update.status);
			goto(`/earning/requests?${params.toString()}`, {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
			return;
		}

		nonBlockingMessageCode = null;
		clearRequestsRouteMessage();
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams();
		params.set('service', update.serviceAddress);
		if (update.requestId) params.set('request', update.requestId);
		if (update.status) params.set('status', update.status);
		goto(`/earning/requests?${params.toString()}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}
</script>

{#if nonBlockingMessageCode === 'service_requests_request_not_found'}
	<div class="alert alert-info my-4 text-sm">
		<span>
			{translateOrFallback(
				$t,
				'dashboard.earning.messages.service_requests_request_not_found',
				'The selected service quote thread could not be found.'
			)}
		</span>
	</div>
{/if}

<div id="panel-requests" role="tabpanel" aria-labelledby="tab-requests" class="py-8 text-center">
	<p class="text-base-content/70 text-sm">
		{$t('dashboard.services.requests.empty', { default: 'Native service quote activity will appear here.' })}
	</p>
</div>
