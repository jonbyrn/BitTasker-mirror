<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { get } from 'svelte/store';
	import { t } from 'svelte-i18n';
	import ServiceQuotesInbox from '$lib/components/service/quotes/ServiceQuotesInbox.svelte';
	import { serviceQuoteUiStore } from '$lib/stores/service-quote-ui.store';
	import { findMyServices } from '$lib/nostr/findServices';
	import { updateService } from '$lib/nostr/service';
	import { receiveBlankInvoice } from '$lib/stores/wallet/wallet-balances';
	import { walletManager } from '$lib/stores/wallet/wallet-manager';
	import { walletStore } from '$lib/stores/wallet';
	import { parseEarningQuery } from '$lib/utils/dashboardQuery';
	import { appStore } from '$lib/stores/app.store';
	import {
		buildServiceAddress,
		generateServiceQuoteEntityId
	} from '$lib/utils/service-quote/protocol';
	import { publishServiceProposal } from '$lib/utils/service-quote/publish';
	import { queryServiceQuotesForTaskee } from '$lib/utils/service-quote/query';
	import type { ServiceProposalComposerSubmitPayload } from '$lib/components/service/quotes/ServiceProposalComposer.svelte';
	import type { Service } from '$lib/types/service';
	import type { ServiceProposalContent, ServiceQuoteTimelineEntry } from '$lib/types/service-quote';

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
	let services = $state<Service[]>([]);
	let timelines = $state<ServiceQuoteTimelineEntry[]>([]);
	let isSyncing = $state(false);
	let hasLoaded = $state(false);
	let loadError = $state<string | null>(null);
	let escrowMessage = $state('');
	let openingEscrow = $state(false);

	const selectedService = $derived(
		services.find((service) => {
			try {
				return buildServiceAddress(service) === selectedServiceAddress;
			} catch {
				return false;
			}
		}) ?? null
	);
	const canOpenEscrow = $derived(
		selectedService != null &&
			selectedService.instantBuyLeadHours != null &&
			!selectedService.escrowInvoice
	);

	function requestsUrl(fields: Record<string, string | null | undefined>): string {
		const parts = Object.entries(fields)
			.filter((entry): entry is [string, string] => Boolean(entry[1]))
			.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
		return `/earning/requests${parts.length > 0 ? `?${parts.join('&')}` : ''}`;
	}

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
			goto(requestsUrl({ status: update.status }), {
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
			goto(
				requestsUrl({
					service: selectedServiceAddress,
					request: update.requestId,
					status: update.status
				}),
				{
					replaceState: true,
					keepFocus: true,
					noScroll: true
				}
			);
			return;
		}

		nonBlockingMessageCode = null;
		clearRequestsRouteMessage();
		goto(
			requestsUrl({
				service: update.serviceAddress,
				request: update.requestId,
				status: update.status
			}),
			{
				replaceState: true,
				keepFocus: true,
				noScroll: true
			}
		);
	}

	function quoteTargets(address: string | null): { address: string; pubkey: string }[] {
		if (address) {
			return [{ address, pubkey: address.split(':')[1] ?? '' }];
		}
		return services.flatMap((service) => {
			try {
				const serviceAddress = buildServiceAddress(service);
				return [{ address: serviceAddress, pubkey: serviceAddress.split(':')[1] ?? '' }];
			} catch {
				return [];
			}
		});
	}

	function proposalAmount(value: string): string {
		const amount = Number(value);
		if (!Number.isFinite(amount) || amount < 0) return value.trim();
		return amount.toFixed(2);
	}

	async function loadInquiries(address = selectedServiceAddress): Promise<void> {
		isSyncing = true;
		loadError = null;
		try {
			try {
				const result = await findMyServices({ page: 1, limit: 100, refresh: true });
				services = result.services;
			} catch (error) {
				if (!address && services.length === 0) throw error;
			}
			const batches = await Promise.all(
				quoteTargets(address).map((target) =>
					queryServiceQuotesForTaskee(target.address, target.pubkey)
				)
			);
			timelines = batches.flatMap((batch) => batch.timelines);
		} catch (error) {
			loadError = error instanceof Error ? error.message : 'Unable to load inquiries';
			timelines = [];
		} finally {
			isSyncing = false;
			hasLoaded = true;
		}
	}

	async function sendProposal(
		requestId: string,
		payload: ServiceProposalComposerSubmitPayload
	): Promise<{ success: boolean; error?: string }> {
		const timeline = timelines.find((entry) => entry.request.content.quoteRequestId === requestId);
		if (!timeline) {
			return {
				success: false,
				error: $t('dashboard.earning.messages.service_requests_request_not_found')
			};
		}

		const serviceAddress = timeline.request.content.serviceAddress;
		const payoutAddress = get(walletStore).rgb?.address ?? '';
		if (!payoutAddress) {
			return {
				success: false,
				error: $t('dashboard.services.my_services.quote_inbox.blocked_reason.wallet')
			};
		}

		const now = Math.floor(Date.now() / 1000);
		const content: ServiceProposalContent = {
			type: 'service-proposal',
			proposalId: generateServiceQuoteEntityId('pr'),
			quoteRequestId: requestId,
			serviceId: serviceAddress,
			serviceAddress,
			paymentType: timeline.request.content.pricingType === 'HOURLY' ? 'HOURLY' : 'FIXED',
			amountUsdt: proposalAmount(payload.amountUsdt),
			description: payload.description,
			estimatedDuration: payload.estimatedDuration,
			estimatedStartTime: payload.estimatedStartTime,
			estimatedEndTime: payload.estimatedEndTime,
			coverLetter: payload.coverLetter,
			expirationDays: payload.expirationDays,
			expirationHours: payload.expirationHours,
			expirationTimestamp: 0,
			freelancerBitcoinAddress: payoutAddress,
			freelancerFeeTier: 1,
			pricingSnapshot: {
				serviceVersionRef: timeline.request.content.serviceEventId || serviceAddress,
				tierId: timeline.request.content.tierId,
				selectedAddOns: timeline.request.content.selectedAddOns,
				rushDelivery: timeline.request.content.rushDelivery
			},
			timestamp: now,
			version: 'v1'
		};

		await publishServiceProposal({
			content,
			requestEventId: timeline.request.id,
			taskerPubkey: timeline.request.pubkey,
			sideEffects: { dmMirror: true }
		});
		appStore.showSuccessToast($t('dashboard.services.my_services.quote_inbox.send_proposal'));
		await loadInquiries();
		return { success: true };
	}

	async function openEscrowInvoice(): Promise<void> {
		const service = selectedService;
		if (!service?.uniqueId || openingEscrow) return;
		openingEscrow = true;
		escrowMessage = '';
		try {
			await walletManager.initialize();
			const created = await receiveBlankInvoice();
			await updateService(service.uniqueId, { escrowInvoice: created.invoice });
			escrowMessage = $t('dashboard.services.detail.escrow_ready');
			await loadInquiries();
		} catch (error) {
			escrowMessage = error instanceof Error ? error.message : 'Unable to open the escrow invoice';
		} finally {
			await walletManager.releaseRgbLock();
			openingEscrow = false;
		}
	}

	$effect(() => {
		const address = selectedServiceAddress;
		loadInquiries(address).catch((error) => {
			loadError = error instanceof Error ? error.message : 'Unable to load inquiries';
		});
	});
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

<div id="panel-requests" role="tabpanel" aria-labelledby="tab-requests" class="space-y-4 py-4">
	{#if canOpenEscrow}
		<div class="alert alert-outline alert-info">
			<div class="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<span>{$t('dashboard.services.detail.escrow_missing')}</span>
				<button
					type="button"
					class="btn btn-primary btn-sm"
					disabled={openingEscrow}
					onclick={() => {
						openEscrowInvoice().catch((error) => {
							escrowMessage =
								error instanceof Error ? error.message : 'Unable to open the escrow invoice';
						});
					}}
				>
					{$t('dashboard.services.detail.open_escrow')}
				</button>
			</div>
		</div>
	{/if}
	{#if escrowMessage}
		<div class="alert alert-outline alert-info text-sm">
			<span>{escrowMessage}</span>
		</div>
	{/if}
	<ServiceQuotesInbox
		{services}
		{timelines}
		{selectedServiceAddress}
		{focusedRequestId}
		{isSyncing}
		{hasLoaded}
		{loadError}
		{status}
		service={selectedService}
		onRetry={loadInquiries}
		onServiceFilterChange={(serviceAddress) => {
			handleProviderRouteUpdate(
				serviceAddress ? { type: 'service', serviceAddress, status } : { type: 'reset', status }
			);
		}}
		onRequestFocusChange={(requestId) => {
			handleProviderRouteUpdate({ type: 'request', requestId, status });
		}}
		onSendProposal={sendProposal}
	/>
</div>
