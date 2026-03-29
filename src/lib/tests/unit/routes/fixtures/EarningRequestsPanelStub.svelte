<script lang="ts">
	import { serviceQuoteUiStore } from '$lib/stores/service-quote-ui.store';

	let {
		selectedServiceAddress = null,
		focusedRequestId = null,
		onResolveQuotesRoute
	}: {
		selectedServiceAddress?: string | null;
		focusedRequestId?: string | null;
		onResolveQuotesRoute?: (
			update:
				| { type: 'service'; serviceAddress: string; requestId?: string | null }
				| { type: 'reset' }
				| { type: 'request'; requestId: string | null }
		) => void;
	} = $props();

	function reportMissingRequest() {
		serviceQuoteUiStore.setNonBlockingMessage('service_quotes_request_not_found');
		onResolveQuotesRoute?.({ type: 'request', requestId: null });
	}
</script>

<div data-testid="requests-panel-stub">
	<div data-testid="requests-panel-service">{selectedServiceAddress ?? 'none'}</div>
	<div data-testid="requests-panel-request">{focusedRequestId ?? 'none'}</div>
	<button
		type="button"
		onclick={() => onResolveQuotesRoute?.({ type: 'request', requestId: null })}
	>
		Clear request
	</button>
	<button type="button" onclick={reportMissingRequest}>Report missing request</button>
</div>
