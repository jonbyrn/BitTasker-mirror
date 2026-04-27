<script lang="ts">
	import { browser, dev } from '$app/environment';
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { t, locale } from 'svelte-i18n';
	import type { Service } from '$lib/types/service.d';
	import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
	import { findMyServices } from '$lib/nostr/findServices';
	import { contractStore } from '$lib/stores/contract.store';
	import {
		buildServiceAddress,
		isRequestSyncActive,
		isProviderTimelineSyncing,
		serviceQuoteUiStore
	} from '$lib/stores/service-quote-ui.store';
	import { walletStore } from '$lib/stores/wallet.store';
	/**
	 * NOTE: The following imports were removed as part of v2 migration:
	 * - getAcceptanceConfirmedMonitorEntriesDueForReverify
	 * - getAcceptanceReplayEntriesDueForRetry
	 * - SERVICE_ACCEPTANCE_CONFIRMED_MONITOR_REVERIFY_INTERVAL_MS
	 * - SERVICE_ACCEPTANCE_REPLAY_RETRY_INTERVAL_MS
	 * - retryPendingServiceAcceptanceByEscrowId
	 * - reverifyPublishedServiceAcceptanceByEscrowId
	 *
	 * In v2, contract creation and status updates are handled by:
	 * - createServiceContract returning tx + afterBroadcast + afterConfirmed
	 * - NDK subscriptions for real-time status updates via PaymentContractRune
	 * The interval-based polling mechanism is no longer needed.
	 */
	import { resolveProviderProposalAuthoring } from '$lib/utils/service-quote/provider-authoring';
	import ErrorAlertWithModal from '$lib/components/ErrorAlertWithModal.svelte';
	import ServiceQuotesInbox from '$lib/components/service/quotes/ServiceQuotesInbox.svelte';
	import { detectErrorType } from '$lib/utils/helpers/errorTypeDetector';
	import { getServiceDisplayTitle } from '$lib/utils/serviceDisplayTranslation';

	let {
		selectedServiceAddress = null,
		focusedRequestId = null,
		status = null,
		onResolveQuotesRoute
	}: {
		selectedServiceAddress?: string | null;
		focusedRequestId?: string | null;
		status?: string | null;
		onResolveQuotesRoute?: (
			update:
				| {
						type: 'service';
						serviceAddress: string;
						requestId?: string | null;
						status?: string | null;
				  }
				| { type: 'reset'; status?: string | null }
				| { type: 'request'; requestId: string | null; status?: string | null }
		) => void;
	} = $props();

	let services = $state<Service[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let lastProviderLoadKey = $state<string | null>(null);
	let lastQuotesRouteResolutionKey = $state<string | null>(null);
	let providerLoadGeneration = 0;
	// V2 Migration: Removed inFlightServiceAcceptanceReplays and inFlightServiceAcceptanceReverifications
	// as the v2 contract creation flow handles these within afterConfirmed()
	let quoteWorkspaceState = $state<{
		providerTimelinesByService: Record<string, ServiceQuoteTimelineEntry[]>;
		loadingProviderByService: Record<string, boolean>;
		providerLoadErrorByService: Record<string, string | null>;
		providerLoadedByService: Record<string, boolean>;
		providerDataFreshnessByService: Record<string, 'fresh' | 'stale' | 'partial'>;
		focusSync: {
			requestId: string | null;
			serviceAddress: string | null;
			expiresAt: number | null;
		};
	}>({
		providerTimelinesByService: {},
		loadingProviderByService: {},
		providerLoadErrorByService: {},
		providerLoadedByService: {},
		providerDataFreshnessByService: {},
		focusSync: {
			requestId: null,
			serviceAddress: null,
			expiresAt: null
		}
	});
	const PROVIDER_LOAD_BATCH_SIZE = 5;

	const selectedService = $derived(
		services.find((service) => buildServiceAddress(service) === selectedServiceAddress) ?? null
	);
	const providerAuthoring = $derived(resolveProviderProposalAuthoring($walletStore.rsk.address));
	const walletReady = $derived(providerAuthoring.ok);
	const feeTierReady = $derived(true);
	const isPasskeyLoadError = $derived.by(
		() => Boolean(error) && detectErrorType(error ?? '') === 'biometric'
	);

	function tr(key: string, fallback: string): string {
		try {
			const value = $t(key);
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}

	function logProviderRequestsDebug(event: string, details: Record<string, unknown>) {
		if (!browser || !dev) {
			return;
		}

		console.info('[DashboardServiceRequestsPanel]', event, details);
	}

	async function loadServices() {
		loading = true;
		error = null;
		try {
			const result = await findMyServices({ limit: 1000 });
			services = result.services;
		} catch (e) {
			console.error('Failed to load my services for requests:', e);
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	async function refreshProviderTimelinesForServices(serviceAddresses: string[]) {
		const targets = [...new Set(serviceAddresses.filter((value) => value.trim().length > 0))];
		if (targets.length === 0) {
			return;
		}

		const requestId =
			targets.length === 1 && targets[0] === selectedServiceAddress ? focusedRequestId : null;
		await loadProviderTimelinesInBatches(targets, requestId, {
			force: true
		});
	}

	onMount(() => {
		void loadServices();
		void contractStore.loadContracts().catch((contractError) => {
			console.error('Failed to load contracts for requests continuity:', contractError);
		});

		/**
		 * V2 Migration Note:
		 * The v1 interval-based retry/reverify logic has been removed.
		 *
		 * In v2, contract lifecycle is handled differently:
		 * 1. createServiceContract returns { tx, afterBroadcast, afterConfirmed }
		 * 2. afterConfirmed() handles all post-confirmation tasks including:
		 *    - Nostr event publishing (with automatic retry)
		 *    - Status updates
		 * 3. NDK subscriptions via PaymentContractRune handle real-time updates
		 *
		 * The old pattern of polling for "due" entries to retry is no longer needed
		 * because the v2 flow handles these cases within the transaction lifecycle.
		 */
	});

	$effect(() => {
		const unsubscribe = serviceQuoteUiStore.subscribe((state) => {
			quoteWorkspaceState = {
				providerTimelinesByService: state.providerTimelinesByService,
				loadingProviderByService: state.loadingProviderByService,
				providerLoadErrorByService: state.providerLoadErrorByService,
				providerLoadedByService: state.providerLoadedByService,
				providerDataFreshnessByService: state.providerDataFreshnessByService,
				focusSync: state.focusSync
			};
		});

		return unsubscribe;
	});

	const visibleServices = $derived(services);
	const visibleServiceAddresses = $derived(
		visibleServices.map((service) => buildServiceAddress(service))
	);
	const serviceTitleByAddress = $derived.by(() =>
		Object.fromEntries(
			visibleServices.map((service) => [
				buildServiceAddress(service),
				getServiceDisplayTitle(service, $locale || 'en')
			])
		)
	);
	const displayedQuoteServiceAddresses = $derived.by(() =>
		selectedServiceAddress ? [selectedServiceAddress] : visibleServiceAddresses
	);
	const loadedQuoteServiceAddresses = $derived.by(() => {
		if (selectedServiceAddress) {
			return [selectedServiceAddress];
		}

		return visibleServiceAddresses;
	});
	const allProviderTimelines = $derived.by(() =>
		loadedQuoteServiceAddresses
			.flatMap(
				(serviceAddress) => quoteWorkspaceState.providerTimelinesByService[serviceAddress] ?? []
			)
			.sort((left, right) => right.request.created_at - left.request.created_at)
	);
	const providerTimelines = $derived.by(() => {
		if (selectedServiceAddress) {
			return quoteWorkspaceState.providerTimelinesByService[selectedServiceAddress] ?? [];
		}

		return allProviderTimelines;
	});
	const providerQuotesSyncing = $derived.by(() => {
		if (selectedServiceAddress) {
			return isProviderTimelineSyncing(
				quoteWorkspaceState,
				selectedServiceAddress,
				focusedRequestId
			);
		}

		if (displayedQuoteServiceAddresses.length === 0) {
			return false;
		}

		return (
			displayedQuoteServiceAddresses.some(
				(serviceAddress) => quoteWorkspaceState.loadingProviderByService[serviceAddress] === true
			) || isRequestSyncActive(quoteWorkspaceState, focusedRequestId, null)
		);
	});
	const providerQuotesError = $derived.by(() => {
		if (selectedServiceAddress) {
			return quoteWorkspaceState.providerLoadErrorByService[selectedServiceAddress] ?? null;
		}

		return (
			displayedQuoteServiceAddresses
				.map(
					(serviceAddress) => quoteWorkspaceState.providerLoadErrorByService[serviceAddress] ?? null
				)
				.find((message) => message !== null) ?? null
		);
	});
	const providerQuotesLoaded = $derived.by(() => {
		if (selectedServiceAddress) {
			return quoteWorkspaceState.providerLoadedByService[selectedServiceAddress] === true;
		}

		if (displayedQuoteServiceAddresses.length === 0) {
			return false;
		}

		return displayedQuoteServiceAddresses.some(
			(serviceAddress) => quoteWorkspaceState.providerLoadedByService[serviceAddress] === true
		);
	});
	const providerDataFreshness = $derived.by(() => {
		if (selectedServiceAddress) {
			return quoteWorkspaceState.providerDataFreshnessByService[selectedServiceAddress] ?? 'fresh';
		}

		const statuses = displayedQuoteServiceAddresses.map(
			(serviceAddress) =>
				quoteWorkspaceState.providerDataFreshnessByService[serviceAddress] ?? 'fresh'
		);

		if (statuses.includes('partial')) {
			return 'partial';
		}
		if (statuses.includes('stale')) {
			return 'stale';
		}
		return 'fresh';
	});
	const providerLoadAddressKey = $derived.by(() =>
		selectedServiceAddress
			? `${[...loadedQuoteServiceAddresses].sort().join('|')}::${focusedRequestId ?? '*'}`
			: [...loadedQuoteServiceAddresses].sort().join('|')
	);

	$effect(() => {
		if (loadedQuoteServiceAddresses.length === 0) {
			lastProviderLoadKey = null;
			providerLoadGeneration += 1;
			return;
		}

		const nextLoadKey = providerLoadAddressKey;
		if (lastProviderLoadKey === nextLoadKey) {
			return;
		}

		lastProviderLoadKey = nextLoadKey;
		logProviderRequestsDebug('provider-load-start', {
			selectedServiceAddress,
			focusedRequestId,
			displayedQuoteServiceAddresses,
			loadedQuoteServiceAddresses,
			batchSize: PROVIDER_LOAD_BATCH_SIZE
		});

		void loadProviderTimelinesInBatches(loadedQuoteServiceAddresses, focusedRequestId);
	});

	$effect(() => {
		if (loading || error) return;

		if (visibleServices.length === 0 && !selectedServiceAddress) {
			if (lastQuotesRouteResolutionKey === 'reset') {
				return;
			}
			lastQuotesRouteResolutionKey = 'reset';
			onResolveQuotesRoute?.({ type: 'reset' });
			return;
		}

		lastQuotesRouteResolutionKey = null;
	});

	function resolveProposalServiceContext(requestId: string) {
		const matchingTimeline = providerTimelines.find(
			(entry) => entry.request.content.quoteRequestId === requestId
		);
		const serviceAddress =
			matchingTimeline?.request.content.serviceAddress ?? selectedServiceAddress;
		const service =
			services.find((entry) => buildServiceAddress(entry) === serviceAddress) ?? selectedService;

		return { service, serviceAddress };
	}

	function refreshProviderQuotes() {
		if (loadedQuoteServiceAddresses.length === 0) {
			return;
		}
		return loadProviderTimelinesInBatches(loadedQuoteServiceAddresses, focusedRequestId, {
			force: true
		});
	}

	async function loadProviderTimelinesInBatches(
		serviceAddresses: string[],
		requestId: string | null,
		options: { force?: boolean } = {}
	) {
		const generation = providerLoadGeneration + 1;
		providerLoadGeneration = generation;

		if (selectedServiceAddress && serviceAddresses.length === 1) {
			const [serviceAddress] = serviceAddresses;
			const exactRequestId = requestId ?? null;

			if (exactRequestId) {
				await (options.force === true
					? serviceQuoteUiStore.loadProviderTimelines(serviceAddress, exactRequestId, options)
					: serviceQuoteUiStore.loadProviderTimelines(serviceAddress, exactRequestId));
			}

			if (generation !== providerLoadGeneration) {
				return;
			}

			await (options.force === true
				? serviceQuoteUiStore.loadProviderTimelines(serviceAddress, null, options)
				: serviceQuoteUiStore.loadProviderTimelines(serviceAddress, null));
			return;
		}

		for (let index = 0; index < serviceAddresses.length; index += PROVIDER_LOAD_BATCH_SIZE) {
			if (generation !== providerLoadGeneration) {
				return;
			}

			const batch = serviceAddresses.slice(index, index + PROVIDER_LOAD_BATCH_SIZE);
			await Promise.allSettled(
				batch.map((serviceAddress) =>
					options.force === true
						? serviceQuoteUiStore.loadProviderTimelines(serviceAddress, null, options)
						: serviceQuoteUiStore.loadProviderTimelines(serviceAddress, null)
				)
			);
		}
	}
</script>

{#if loading}
	<div class="flex flex-col items-center justify-center py-16">
		<span class="loading loading-spinner loading-lg text-primary"></span>
		<p class="text-base-content/70 mt-4">
			{tr('dashboard.service_requests.loading', 'Loading your service requests...')}
		</p>
	</div>
{:else}
	{#if error}
		<div class="mb-4 space-y-4">
			{#if isPasskeyLoadError}
				<ErrorAlertWithModal
					{error}
					isPasskeyError
					autoOpenModal={false}
					onRetry={loadServices}
					class="w-full"
				/>
			{:else}
				<div class="alert alert-error alert-outline">
					<span>
						{tr('dashboard.service_requests.retry_loading', 'Retry to load your service requests.')}
						{error}
					</span>
				</div>
			{/if}
			<button type="button" class="btn btn-primary btn-sm" onclick={loadServices}>
				{tr('common.buttons.retry', 'Retry')}
			</button>
		</div>
	{/if}
	<ServiceQuotesInbox
		services={visibleServices}
		service={selectedService}
		{selectedServiceAddress}
		serviceUnavailable={selectedServiceAddress !== null && selectedService === null}
		showServiceTitles={selectedServiceAddress === null}
		{serviceTitleByAddress}
		dataFreshness={providerDataFreshness}
		timelines={providerTimelines}
		{focusedRequestId}
		{status}
		isSyncing={providerQuotesSyncing}
		hasLoaded={providerQuotesLoaded}
		loadError={providerQuotesError}
		{walletReady}
		{feeTierReady}
		onRetry={error ? loadServices : refreshProviderQuotes}
		serviceFilterLabel={tr(
			'dashboard.services.my_services.workspace.filter_label',
			'Filter by service'
		)}
		allServicesLabel={tr('dashboard.services.my_services.workspace.all_services', 'All Services')}
		deletedServiceLabel={tr(
			'dashboard.services.my_services.quote_inbox.deleted_service_prefix',
			'Deleted service'
		)}
		onServiceFilterChange={(serviceAddress) => {
			if (!serviceAddress) {
				onResolveQuotesRoute?.({ type: 'reset', status });
				return;
			}

			onResolveQuotesRoute?.({
				type: 'service',
				serviceAddress,
				requestId: null,
				status
			});
		}}
		onRequestFocusChange={(requestId) =>
			onResolveQuotesRoute?.({ type: 'request', requestId, status })}
		onRequestClear={() => onResolveQuotesRoute?.({ type: 'request', requestId: null, status })}
		onInvalidFocusedRequest={() => {
			serviceQuoteUiStore.setNonBlockingMessage('service_quotes_request_not_found');
			onResolveQuotesRoute?.({ type: 'request', requestId: null, status });
		}}
		onSendProposal={async (requestId, payload) => {
			const { service, serviceAddress } = resolveProposalServiceContext(requestId);
			if (!service || !serviceAddress) {
				return {
					success: false,
					error: tr(
						'dashboard.services.my_services.workspace.select_service_first',
						'Select a service first.'
					)
				};
			}
			return serviceQuoteUiStore.sendLocalProposal({
				service,
				serviceAddress,
				quoteRequestId: requestId,
				...payload
			});
		}}
		onDeleteProposal={async (requestId, proposalId) => {
			const { serviceAddress } = resolveProposalServiceContext(requestId);
			if (!serviceAddress) {
				return {
					success: false,
					error: tr(
						'dashboard.services.my_services.workspace.select_service_first',
						'Select a service first.'
					)
				};
			}

			return serviceQuoteUiStore.deleteLocalProposal({
				serviceAddress,
				quoteRequestId: requestId,
				proposalId
			});
		}}
	/>
{/if}
