<script lang="ts">
	import type { Service } from '$lib/types/service.d';
	import { onMount } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { t, locale } from 'svelte-i18n';
	import { findMyServices } from '$lib/nostr/findServices';
	import { deleteService, updateService } from '$lib/nostr/service';
	import { getServiceDisplayTitle } from '$lib/utils/serviceDisplayTranslation';
	import { appStore } from '$lib/stores/app.store';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import IconPlus from '~icons/mdi/plus';
	import IconPencilOutline from '~icons/mdi/pencil-outline';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';
	import DashboardServiceCard from './DashboardServiceCard.svelte';
	import ServiceQuotesInbox from '$lib/components/service/quotes/ServiceQuotesInbox.svelte';
	import { contractStore } from '$lib/stores/contract.store';
	import { createDashboardUrl } from '$lib/utils/service-quote/dashboard-route';
	import {
		getActiveServiceContractsForService,
		selectPrimaryActiveServiceContract
	} from '$lib/utils/service-contract/active-contracts';
	import {
		buildServiceAddress,
		getProviderTimelines,
		isProviderTimelineSyncing,
		serviceQuoteUiStore
	} from '$lib/stores/service-quote-ui.store';
	import { walletStore } from '$lib/stores/wallet.store';
	import { resolveProviderProposalAuthoring } from '$lib/utils/service-quote/provider-authoring';
	import { queryTaskeeServiceQuoteThreads } from '$lib/utils/service-quote/query';
	import { summarizeDeleteGuardForThreads } from '$lib/utils/service-quote/resolver';
	import { buildEarningQueryUrl } from '$lib/utils/dashboardQuery';
	import { deleteServicePortfolioMedia } from '$lib/utils/service/media-cleanup';
	import {
		clearPendingServiceDelete,
		getPendingServiceDeleteKey,
		markServiceDeletePending,
		pendingServiceDeleteStore
	} from '$lib/stores/service-delete-ui.store';
	import Modal from '$lib/components/Modal.svelte';
	import ServiceDrawer from './ServiceDrawer.svelte';
	import { createServicesWorkspaceUrl } from '$lib/utils/service-quote/services-workspace-route';

	let {
		view = 'default',
		selectedServiceAddress = null,
		focusedRequestId = null,
		onResolveQuotesRoute,
		onOpenServiceQuotes
	}: {
		view?: 'default' | 'quotes';
		selectedServiceAddress?: string | null;
		focusedRequestId?: string | null;
		onResolveQuotesRoute?: (
			update:
				| { type: 'service'; serviceAddress: string; requestId?: string | null }
				| { type: 'reset' }
				| { type: 'request'; requestId: string | null }
		) => void;
		onOpenServiceQuotes?: (service: Service) => void;
	} = $props();

	let services = $state<Service[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let togglingServiceId = $state<string | null>(null);
	let btcPrice = $state<number>(0);
	let providerTimelines = $state<ReturnType<typeof getProviderTimelines>>([]);
	let providerQuotesSyncing = $state(false);
	let providerQuotesError = $state<string | null>(null);
	let providerQuotesLoaded = $state(false);
	let deleteSubmitServiceId = $state<string | null>(null);
	let lastProviderLoadKey = $state<string | null>(null);
	let lastQuotesRouteResolutionKey = $state<string | null>(null);
	let deleteModalState = $state<{
		mode: 'blocked' | 'confirm';
		service: Service;
		openQuoteCount: number;
		activeContractCount: number;
		totalQuoteCount: number;
	} | null>(null);

	// Service drawer state
	let selectedServiceForDrawer = $state<Service | null>(null);
	let drawerOpen = $state(false);
	let activeServiceModal = $state<'edit' | null>(null);

	const selectedService = $derived(
		services.find((service) => buildServiceAddress(service) === selectedServiceAddress) ?? null
	);
	const providerAuthoring = $derived(resolveProviderProposalAuthoring($walletStore.rsk.address));
	const walletReady = $derived(providerAuthoring.ok);
	const feeTierReady = $derived(true);

	function tr(key: string, fallback: string): string {
		try {
			const value = $t(key);
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}

	function trv(key: string, fallback: string, values: Record<string, string | number>): string {
		try {
			const value = $t(key, { values });
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}

	// Sort services: active first (newest to oldest), then inactive (newest to oldest)
	const sortedServices = $derived(
		[...services].sort((a, b) => {
			// First sort by status (active before inactive/sold)
			const statusOrder = { active: 0, inactive: 1, sold: 2 };
			const statusA = statusOrder[a.status] ?? 3;
			const statusB = statusOrder[b.status] ?? 3;
			if (statusA !== statusB) {
				return statusA - statusB;
			}
			// Then sort by createdAt descending (newest first)
			return (b.createdAt ?? 0) - (a.createdAt ?? 0);
		})
	);
	const visibleServices = $derived.by(() => {
		const pendingKeys = new Set($pendingServiceDeleteStore.map((entry) => entry.key));
		const pendingIds = new Set($pendingServiceDeleteStore.map((entry) => entry.serviceId));

		return sortedServices.filter((service) => {
			const key = getPendingServiceDeleteKey(service);
			return !pendingKeys.has(key) && !pendingIds.has(service.id);
		});
	});

	async function loadServices() {
		loading = true;
		error = null;
		try {
			const result = await findMyServices({ limit: 100 });
			services = result.services;
		} catch (e) {
			console.error('Failed to load my services:', e);
			error = e instanceof Error ? e.message : String(e);
			services = [];
		} finally {
			loading = false;
		}
	}

	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Error fetching BTC price:', error);
		}
	}

	onMount(() => {
		loadServices();
		fetchBtcPrice();
		void contractStore.loadContracts().catch((contractError) => {
			console.error('Failed to load contracts for my services continuity:', contractError);
		});
	});

	$effect(() => {
		const unsubscribe = serviceQuoteUiStore.subscribe((state) => {
			providerTimelines = getProviderTimelines(state, selectedServiceAddress);
			providerQuotesSyncing = isProviderTimelineSyncing(
				state,
				selectedServiceAddress,
				focusedRequestId
			);
			providerQuotesError = selectedServiceAddress
				? (state.providerLoadErrorByService?.[selectedServiceAddress] ?? null)
				: null;
			providerQuotesLoaded = selectedServiceAddress
				? state.providerLoadedByService?.[selectedServiceAddress] === true
				: false;
		});

		return unsubscribe;
	});

	$effect(() => {
		if (view !== 'quotes' || !selectedServiceAddress) {
			providerQuotesError = null;
			lastProviderLoadKey = null;
			return;
		}

		const nextLoadKey = `${selectedServiceAddress}::${focusedRequestId ?? ''}`;
		if (lastProviderLoadKey === nextLoadKey) {
			return;
		}

		lastProviderLoadKey = nextLoadKey;

		void serviceQuoteUiStore
			.loadProviderTimelines(selectedServiceAddress, focusedRequestId)
			.catch(() => {
				// The store exposes the current providerQuotesError state for inline retry UX.
			});
	});

	$effect(() => {
		if (view !== 'quotes' || loading) return;

		if (visibleServices.length === 0 && !selectedServiceAddress) {
			if (lastQuotesRouteResolutionKey === 'reset') {
				return;
			}
			lastQuotesRouteResolutionKey = 'reset';
			onResolveQuotesRoute?.({ type: 'reset' });
			return;
		}

		if (!selectedServiceAddress && !selectedService) {
			const fallbackServiceAddress = buildServiceAddress(visibleServices[0]);
			const nextResolutionKey = `service:${fallbackServiceAddress}`;
			if (lastQuotesRouteResolutionKey === nextResolutionKey) {
				return;
			}
			lastQuotesRouteResolutionKey = nextResolutionKey;
			onResolveQuotesRoute?.({
				type: 'service',
				serviceAddress: fallbackServiceAddress,
				requestId: null
			});
			return;
		}

		lastQuotesRouteResolutionKey = null;
	});

	function handleOpenQuotes(service: Service) {
		if (onOpenServiceQuotes) {
			onOpenServiceQuotes(service);
			return;
		}

		const nextUrl = createServicesWorkspaceUrl(
			new URL('/services/manage', window.location.origin),
			{
				tab: 'quotes',
				serviceAddress: buildServiceAddress(service),
				requestId: null
			}
		);
		goto(nextUrl.toString());
	}

	// Service drawer functions
	function openServiceDrawer(service: Service) {
		selectedServiceForDrawer = service;
		drawerOpen = true;
	}

	function closeServiceDrawer() {
		drawerOpen = false;
		selectedServiceForDrawer = null;
		activeServiceModal = null;
	}

	function setServiceModal(type: 'edit' | null) {
		if (type && !selectedServiceForDrawer) return;
		activeServiceModal = type;
	}

	function handleEditService() {
		const serviceToEdit = selectedServiceForDrawer;
		if (!serviceToEdit) return;
		const id = serviceToEdit.uniqueId || serviceToEdit.id;
		closeServiceDrawer();
		goto(`/dashboard/create-service?edit=true&serviceId=${encodeURIComponent(id)}`);
	}

	async function requestDeleteServiceFromDrawer() {
		const serviceToDelete = selectedServiceForDrawer;
		if (!serviceToDelete) return;
		closeServiceDrawer();
		await handleDeleteClick(serviceToDelete);
	}

	function getPrimaryActiveContract(service: Service) {
		return selectPrimaryActiveServiceContract($contractStore.contracts, service);
	}

	function closeDeleteModal() {
		if (deleteSubmitServiceId) {
			return;
		}

		deleteModalState = null;
	}

	function handleViewActiveContracts(service: Service) {
		const primaryContract = getPrimaryActiveContract(service);
		if (!primaryContract) {
			return;
		}

		const highlightEscrowId =
			primaryContract.escrowData?.id ?? primaryContract.contractEvent.content.escrowId;
		const nextUrl = window.location.pathname.startsWith('/earning')
			? new URL(
					buildEarningQueryUrl(new URL('/earning', window.location.origin), {
						tab: 'contracts',
						context: 'services',
						highlight: highlightEscrowId
					})
				)
			: createDashboardUrl(new URL('/dashboard', window.location.origin), {
					tab: 'contracts',
					context: 'services',
					highlight: highlightEscrowId
				});
		goto(nextUrl.toString());
	}

	async function handleStatusToggle(service: Service) {
		const id = service.uniqueId || service.id;
		if (!id) return;
		if (service.status === 'sold') return;
		togglingServiceId = id;
		try {
			const nextStatus = service.status === 'active' ? 'inactive' : 'active';
			// Update local state immediately to avoid stale data
			services = services.map((s) =>
				(s.uniqueId || s.id) === id ? { ...s, status: nextStatus } : s
			);
			await updateService(id, { status: nextStatus });
			appStore.showSuccessToast($t('dashboard.services.my_services.status_updated'));
		} catch {
			// Rollback on error
			services = services.map((s) =>
				(s.uniqueId || s.id) === id ? { ...s, status: service.status } : s
			);
			appStore.showErrorToast($t('dashboard.services.my_services.status_update_failed'));
		} finally {
			togglingServiceId = null;
		}
	}

	async function inspectDeleteGuards(service: Service) {
		await contractStore.loadContracts();
		const quoteThreads = await queryTaskeeServiceQuoteThreads({
			serviceAddress: buildServiceAddress(service),
			taskeePubkey: service.npub,
			limit: 100
		});
		const quoteGuard = summarizeDeleteGuardForThreads(quoteThreads);
		const activeContracts = getActiveServiceContractsForService($contractStore.contracts, service);

		return {
			hasOpenQuotes: quoteGuard.hasBlockingThreads,
			openQuoteCount: quoteGuard.blockingThreadCount,
			totalQuoteCount: quoteGuard.totalThreadCount,
			hasActiveContracts: activeContracts.length > 0,
			activeContractCount: activeContracts.length
		};
	}

	async function handleDeleteClick(service: Service, e?: MouseEvent) {
		e?.preventDefault();
		e?.stopPropagation();

		try {
			const guard = await inspectDeleteGuards(service);
			deleteModalState = {
				mode: guard.hasActiveContracts ? 'blocked' : 'confirm',
				service,
				openQuoteCount: guard.openQuoteCount,
				activeContractCount: guard.activeContractCount,
				totalQuoteCount: guard.totalQuoteCount
			};
		} catch (error) {
			appStore.showErrorToast(
				error instanceof Error
					? error.message
					: tr(
							'dashboard.services.my_services.delete_modal.verify_failed',
							'Unable to verify whether this service can be deleted right now.'
						)
			);
		}
	}

	async function confirmDeleteService() {
		if (!deleteModalState || deleteModalState.mode !== 'confirm') {
			return;
		}

		const service = deleteModalState.service;
		const serviceKey = service.uniqueId || service.id;
		deleteSubmitServiceId = serviceKey;
		markServiceDeletePending(service);
		try {
			const guard = await inspectDeleteGuards(service);
			await deleteService(
				service.id,
				{
					hasOpenQuotes: guard.hasOpenQuotes,
					hasActiveContracts: guard.hasActiveContracts
				},
				{
					uniqueId: service.uniqueId ?? null
				}
			);
			await deleteServicePortfolioMedia(service.portfolio);
			appStore.showSuccessToast(
				tr(
					'dashboard.services.my_services.delete_modal.delete_success',
					'Service deleted successfully.'
				)
			);
			deleteModalState = null;
			await loadServices();
		} catch (error) {
			clearPendingServiceDelete(service);
			const message =
				error instanceof Error
					? error.message
					: tr(
							'dashboard.services.my_services.delete_modal.delete_failed',
							'Unable to delete this service right now.'
						);
			appStore.showErrorToast(message);
			if (message === 'Cannot delete a service with active contracts.') {
				try {
					const guard = await inspectDeleteGuards(service);
					deleteModalState = {
						mode: 'blocked',
						service,
						openQuoteCount: guard.openQuoteCount,
						activeContractCount: guard.activeContractCount,
						totalQuoteCount: guard.totalQuoteCount
					};
				} catch {
					deleteModalState = null;
				}
			}
		} finally {
			deleteSubmitServiceId = null;
		}
	}

	/**
	 * Get action buttons for each service - matching My Tasks card pattern
	 * Details button opens drawer, Quotes button opens quotes view
	 */
	function getServiceActionButtons(service: Service) {
		const actions: Array<{
			label: string;
			class: string;
			onclick: (e: MouseEvent) => void;
			icon: string;
		}> = [];

		// Details button - opens the service drawer (like task cards)
		actions.push({
			label: tr('dashboard.services.my_services.view_details', 'Details'),
			class: 'btn-outline btn-sm',
			onclick: (e: MouseEvent) => {
				e.stopPropagation();
				openServiceDrawer(service);
			},
			icon: 'view_details'
		});

		// Quotes button - opens the dedicated services workspace quote inbox
		actions.push({
			label: tr('dashboard.services.my_services.actions.quotes', 'Quotes'),
			class: 'btn-primary btn-sm',
			onclick: (e: MouseEvent) => {
				e.stopPropagation();
				handleOpenQuotes(service);
			},
			icon: 'view_quotes'
		});

		// View Active Contracts button (only if there are active contracts)
		if (getPrimaryActiveContract(service)) {
			actions.push({
				label: tr('dashboard.services.my_services.actions.contracts', 'Contracts'),
				class: 'btn-success btn-outline btn-sm',
				onclick: (e: MouseEvent) => {
					e.stopPropagation();
					handleViewActiveContracts(service);
				},
				icon: 'contracts'
			});
		}

		return actions;
	}
</script>

{#if loading}
	<div class="flex flex-col items-center justify-center py-16">
		<span class="loading loading-spinner loading-lg text-primary"></span>
		<p class="text-base-content/70 mt-4">{$t('dashboard.services.my_services.loading')}</p>
	</div>
{:else if error}
	<div class="alert alert-error alert-outline">
		<span>{$t('dashboard.services.my_services.error_loading')}: {error}</span>
	</div>
	<button type="button" class="btn btn-primary btn-sm mt-4" onclick={loadServices}>
		{$t('dashboard.services.my_services.retry')}
	</button>
{:else if visibleServices.length === 0 && !(view === 'quotes' && selectedServiceAddress)}
	<div
		class="border-base-300 bg-base-200/50 flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-16 text-center"
	>
		<IconBriefcaseOutline class="text-base-content/30 h-16 w-16" aria-hidden="true" />
		<h4 class="mt-4 text-lg font-semibold">{$t('dashboard.services.my_services.empty_title')}</h4>
		<p class="text-base-content/70 mt-2 max-w-md">
			{$t('dashboard.services.my_services.empty_message')}
		</p>
		<a href="/dashboard/create-service" class="btn btn-primary mt-6">
			<IconPlus class="mr-2 h-5 w-5" aria-hidden="true" />
			{$t('dashboard.services.my_services.create_service')}
		</a>
	</div>
{:else if view === 'default'}
	<div class="grid grid-cols-1 gap-5">
		{#each visibleServices as service (service.id)}
			<DashboardServiceCard
				{service}
				getActionButtons={getServiceActionButtons}
				onStatusToggle={(e) => {
					e.stopPropagation();
					handleStatusToggle(service);
				}}
				isTogglingStatus={togglingServiceId === (service.uniqueId || service.id)}
				{btcPrice}
			/>
		{/each}
	</div>
{:else}
	<div class="space-y-4">
		<div class="flex flex-wrap gap-2">
			{#each services as service (service.id)}
				{@const serviceAddress = buildServiceAddress(service)}
				<button
					type="button"
					class={`btn btn-sm ${
						serviceAddress === selectedServiceAddress ? 'btn-primary' : 'btn-outline'
					}`}
					onclick={() =>
						onResolveQuotesRoute?.({
							type: 'service',
							serviceAddress,
							requestId: null
						})}
				>
					{getServiceDisplayTitle(service, $locale || 'en')}
				</button>
			{/each}
		</div>

		<ServiceQuotesInbox
			service={selectedService}
			serviceUnavailable={selectedServiceAddress !== null && selectedService === null}
			timelines={providerTimelines}
			{focusedRequestId}
			isSyncing={providerQuotesSyncing}
			hasLoaded={providerQuotesLoaded}
			loadError={providerQuotesError}
			{walletReady}
			{feeTierReady}
			onRetry={() => {
				if (!selectedServiceAddress) {
					return;
				}
				return serviceQuoteUiStore
					.loadProviderTimelines(selectedServiceAddress, focusedRequestId)
					.catch(() => {});
			}}
			onRequestFocusChange={(requestId) => onResolveQuotesRoute?.({ type: 'request', requestId })}
			onInvalidFocusedRequest={() => {
				serviceQuoteUiStore.setNonBlockingMessage('service_quotes_request_not_found');
				onResolveQuotesRoute?.({ type: 'request', requestId: null });
			}}
			onSendProposal={async (requestId, payload) => {
				if (!selectedService || !selectedServiceAddress) {
					return {
						success: false,
						error: tr(
							'dashboard.services.my_services.workspace.select_service_first',
							'Select a service first.'
						)
					};
				}
				return serviceQuoteUiStore.sendLocalProposal({
					service: selectedService,
					serviceAddress: selectedServiceAddress,
					quoteRequestId: requestId,
					...payload
				});
			}}
		/>
	</div>
{/if}

<Modal
	isOpen={deleteModalState !== null}
	title={deleteModalState?.mode === 'blocked'
		? tr('dashboard.services.my_services.delete_modal.blocked_title', 'Cannot delete service')
		: tr('dashboard.services.my_services.delete_modal.confirm_title', 'Delete service')}
	onClose={closeDeleteModal}
	size="md"
>
	{#if deleteModalState}
		<p class="text-base-content/80 text-sm">
			{#if deleteModalState.mode === 'blocked'}
				{tr(
					'dashboard.services.my_services.delete_modal.blocked_intro',
					'This service cannot be deleted yet.'
				)}
			{:else if deleteModalState.openQuoteCount > 0}
				{tr(
					'dashboard.services.my_services.delete_modal.confirm_intro_warning',
					'This permanently removes the current service listing from your dashboard. Existing service requests will remain visible as read-only history.'
				)}
			{:else}
				{tr(
					'dashboard.services.my_services.delete_modal.confirm_intro',
					'This permanently removes the current service listing from your dashboard.'
				)}
			{/if}
		</p>

		{#if deleteModalState.mode === 'blocked'}
			<div class="mt-4 space-y-3">
				{#if deleteModalState.activeContractCount > 0}
					<div class="alert alert-error">
						<span>
							{deleteModalState.activeContractCount === 1
								? trv(
										'dashboard.services.my_services.delete_modal.active_contracts_one',
										`Active service contracts are still attached to this service (${deleteModalState.activeContractCount} active contract).`,
										{ count: deleteModalState.activeContractCount }
									)
								: trv(
										'dashboard.services.my_services.delete_modal.active_contracts_other',
										`Active service contracts are still attached to this service (${deleteModalState.activeContractCount} active contracts).`,
										{ count: deleteModalState.activeContractCount }
									)}
						</span>
					</div>
				{/if}
			</div>
			<div class="mt-6 flex justify-end">
				<button type="button" class="btn btn-primary" onclick={closeDeleteModal}>
					{tr('common.buttons.close', 'Close')}
				</button>
			</div>
		{:else}
			<div class="mt-4 space-y-3">
				{#if deleteModalState.openQuoteCount > 0}
					<div class="alert alert-warning">
						<span>
							{deleteModalState.openQuoteCount === 1
								? trv(
										'dashboard.services.my_services.delete_modal.open_quotes_read_only_one',
										`This service still has ${deleteModalState.openQuoteCount} open request. After deletion, that thread will remain visible as read-only history.`,
										{ count: deleteModalState.openQuoteCount }
									)
								: trv(
										'dashboard.services.my_services.delete_modal.open_quotes_read_only_other',
										`This service still has ${deleteModalState.openQuoteCount} open requests. After deletion, those threads will remain visible as read-only history.`,
										{ count: deleteModalState.openQuoteCount }
									)}
						</span>
					</div>
				{:else}
					<p class="text-base-content/70 text-sm">
						{tr(
							'dashboard.services.my_services.delete_modal.no_open_items',
							'No open quotes or active contracts were found for this service.'
						)}
					</p>
				{/if}
			</div>
			<div class="mt-6 flex justify-end gap-2">
				<button
					type="button"
					class="btn btn-ghost"
					onclick={closeDeleteModal}
					disabled={deleteSubmitServiceId ===
						(deleteModalState.service.uniqueId || deleteModalState.service.id)}
				>
					{tr('common.cancel', 'Cancel')}
				</button>
				<button
					type="button"
					class="btn btn-error"
					onclick={confirmDeleteService}
					disabled={deleteSubmitServiceId ===
						(deleteModalState.service.uniqueId || deleteModalState.service.id)}
				>
					{#if deleteSubmitServiceId === (deleteModalState.service.uniqueId || deleteModalState.service.id)}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					{tr('dashboard.services.my_services.delete_modal.confirm_delete', 'Confirm Delete')}
				</button>
			</div>
		{/if}
	{/if}
</Modal>

<!-- Service Drawer -->
<ServiceDrawer
	service={selectedServiceForDrawer}
	isOpen={drawerOpen}
	onClose={closeServiceDrawer}
	onRequestEditConfirm={() => setServiceModal('edit')}
	onRequestDeleteConfirm={requestDeleteServiceFromDrawer}
	isDeleting={deleteSubmitServiceId ===
		(selectedServiceForDrawer?.uniqueId || selectedServiceForDrawer?.id || null)}
	onQuotes={() => {
		if (selectedServiceForDrawer) {
			handleOpenQuotes(selectedServiceForDrawer);
			closeServiceDrawer();
		}
	}}
/>

<!-- Edit Service Confirmation Modal -->
{#if activeServiceModal === 'edit' && selectedServiceForDrawer}
	<div class="modal modal-open modal-middle" transition:fade={{ duration: 200 }}>
		<div class="modal-box max-w-md" transition:scale={{ duration: 200, start: 0.9 }}>
			<div class="mb-6">
				<div class="mb-2 flex items-center gap-3">
					<div class="bg-warning/10 flex h-10 w-10 items-center justify-center rounded-full">
						<svg class="text-warning h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
							/>
						</svg>
					</div>
					<div>
						<h4 class="text-sm font-semibold">
							{$t('dashboard.services.detail.edit_service_confirmation.title') || 'Edit Service'}
						</h4>
					</div>
				</div>
			</div>

			<div class="space-y-4">
				<div class="bg-warning/10 rounded-lg p-4">
					<p class="text-warning mb-2 text-sm font-semibold">
						{$t('dashboard.services.detail.edit_service_confirmation.warning') ||
							'Editing will update your service listing'}
					</p>
					<p class="text-warning text-sm">
						{$t('dashboard.services.detail.edit_service_confirmation.details') ||
							'Any quotes already received will remain attached to your service.'}
					</p>
				</div>
			</div>

			<div class="border-base-300 flex gap-3 pt-6">
				<button type="button" class="btn btn-ghost flex-1" onclick={() => setServiceModal(null)}>
					{$t('common.cancel') || 'Cancel'}
				</button>
				<button type="button" class="btn btn-primary" onclick={handleEditService}>
					<IconPencilOutline class="mr-2 h-4 w-4" />
					{$t('dashboard.services.detail.edit_service') || 'Edit Service'}
				</button>
			</div>
		</div>
		<button
			class="modal-backdrop"
			onclick={() => setServiceModal(null)}
			aria-label={tr('common.buttons.close', 'Close')}
		></button>
	</div>
{/if}
