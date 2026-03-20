<script lang="ts">
	import type { Service } from '$lib/types/service.d';
	import { onMount } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { t, locale } from 'svelte-i18n';
	import { findMyServices } from '$lib/nostr/findServices';
	import { deleteService, updateService } from '$lib/nostr/service';
	import {
		getServiceDisplayTitle,
		getServiceDisplayDescription
	} from '$lib/utils/serviceDisplayTranslation';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
	import type { ServiceTier } from '$lib/types/service.d';
	import { appStore } from '$lib/stores/app.store';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import IconPlus from '~icons/mdi/plus';
	import IconEyeOutline from '~icons/mdi/eye-outline';
	import IconPencilOutline from '~icons/mdi/pencil-outline';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';
	import IconDeleteOutline from '~icons/mdi/delete-outline';
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
	let deleteCheckServiceId = $state<string | null>(null);
	let deleteSubmitServiceId = $state<string | null>(null);
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
	let drawerInitialTab = $state('details');
	let activeServiceModal = $state<'edit' | 'delete' | null>(null);
	let isDeletingService = $state(false);

	const selectedService = $derived(
		services.find((service) => buildServiceAddress(service) === selectedServiceAddress) ?? null
	);
	const providerAuthoring = $derived(resolveProviderProposalAuthoring($walletStore.rsk.address));
	const walletReady = $derived(providerAuthoring.ok);
	const feeTierReady = $derived(true);

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
				? state.providerLoadErrorByService?.[selectedServiceAddress] ?? null
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
			return;
		}

		void serviceQuoteUiStore.loadProviderTimelines(selectedServiceAddress, focusedRequestId).catch(() => {
			// The store exposes the current providerQuotesError state for inline retry UX.
		});
	});

	$effect(() => {
		if (view !== 'quotes' || loading) return;

		if (services.length === 0) {
			onResolveQuotesRoute?.({ type: 'reset' });
			return;
		}

		if (!selectedService) {
			onResolveQuotesRoute?.({
				type: 'service',
				serviceAddress: buildServiceAddress(services[0]),
				requestId: null
			});
		}
	});

	function getPriceLabel(service: Service): string {
		const p = service.pricing;
		if (!p) return $t('dashboard.services.browse.pricing.request_quote') || 'Request Quote';
		switch (p.type) {
			case ServicePricingTypeEnum.FIXED:
				return p.amount != null ? `$${formatNumberWithTwoDecimals(p.amount)}` : '—';
			case ServicePricingTypeEnum.HOURLY:
				return p.hourlyRate != null ? `$${formatNumberWithTwoDecimals(p.hourlyRate)}/hr` : '—';
			case ServicePricingTypeEnum.TIERED:
				if (p.tiers?.length) {
					const prices = p.tiers.map((t: ServiceTier) => t.price).filter((n: number) => n > 0);
					return prices.length ? `From $${formatNumberWithTwoDecimals(Math.min(...prices))}` : '—';
				}
				return '—';
			case ServicePricingTypeEnum.INQUIRY_REQUIRED:
				return $t('dashboard.services.browse.pricing.request_quote') || 'Request Quote';
			default:
				return '—';
		}
	}

	function handleView(service: Service, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		const id = service.uniqueId || service.id;
		goto(`/services/${id}`);
	}

	function handleEdit(service: Service, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		const id = service.uniqueId || service.id;
		goto(`/dashboard/create-service?edit=true&serviceId=${encodeURIComponent(id)}`);
	}

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
	function openServiceDrawer(service: Service, tab: string = 'details') {
		selectedServiceForDrawer = service;
		drawerOpen = true;
		drawerInitialTab = tab;
	}

	function closeServiceDrawer() {
		drawerOpen = false;
		selectedServiceForDrawer = null;
		activeServiceModal = null;
	}

	function setServiceModal(type: 'edit' | 'delete' | null) {
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

	function confirmDeleteServiceFromDrawer() {
		const serviceToDelete = selectedServiceForDrawer;
		if (!serviceToDelete) return;
		handleDeleteClick(serviceToDelete);
		closeServiceDrawer();
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

		const nextUrl = createDashboardUrl(new URL('/dashboard', window.location.origin), {
			tab: 'contracts',
			context: 'services',
			highlight: primaryContract.escrowData?.id ?? primaryContract.contractEvent.content.escrowId
		});
		goto(nextUrl.toString());
	}

	async function handleStatusToggle(service: Service, _e?: Event) {
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
		} catch (err) {
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

		const serviceKey = service.uniqueId || service.id;
		deleteCheckServiceId = serviceKey;
		try {
			const guard = await inspectDeleteGuards(service);
			deleteModalState = {
				mode: guard.hasOpenQuotes || guard.hasActiveContracts ? 'blocked' : 'confirm',
				service,
				openQuoteCount: guard.openQuoteCount,
				activeContractCount: guard.activeContractCount,
				totalQuoteCount: guard.totalQuoteCount
			};
		} catch (error) {
			appStore.showErrorToast(
				error instanceof Error
					? error.message
					: 'Unable to verify whether this service can be deleted right now.'
			);
		} finally {
			deleteCheckServiceId = null;
		}
	}

	async function confirmDeleteService() {
		if (!deleteModalState || deleteModalState.mode !== 'confirm') {
			return;
		}

		const service = deleteModalState.service;
		const serviceKey = service.uniqueId || service.id;
		deleteSubmitServiceId = serviceKey;
		try {
			const guard = await inspectDeleteGuards(service);
			await deleteService(service.id, {
				hasOpenQuotes: guard.hasOpenQuotes,
				hasActiveContracts: guard.hasActiveContracts
			});
			appStore.showSuccessToast('Service deleted successfully.');
			deleteModalState = null;
			await loadServices();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Unable to delete this service right now.';
			appStore.showErrorToast(message);
			if (
				message === 'Cannot delete a service with open quotes.' ||
				message === 'Cannot delete a service with active contracts.'
			) {
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
			label: $t('task.actions.view_details') || 'Details',
			class: 'btn-outline btn-sm',
			onclick: (e: MouseEvent) => {
				e.stopPropagation();
				openServiceDrawer(service, 'details');
			},
			icon: 'view_details'
		});

		// Quotes button - opens the dedicated services workspace quote inbox
		actions.push({
			label: 'Quotes',
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
				label: 'Contracts',
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
{:else if services.length === 0}
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
		{#each sortedServices as service (service.id)}
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
				return serviceQuoteUiStore.loadProviderTimelines(selectedServiceAddress, focusedRequestId).catch(
					() => {}
				);
			}}
			onRequestFocusChange={(requestId) =>
				onResolveQuotesRoute?.({ type: 'request', requestId })}
			onInvalidFocusedRequest={() => {
				serviceQuoteUiStore.setNonBlockingMessage('service_quotes_request_not_found');
				onResolveQuotesRoute?.({ type: 'request', requestId: null });
			}}
			onSendProposal={async (requestId, payload) => {
				if (!selectedService || !selectedServiceAddress) {
					return { success: false, error: 'Select a service first.' };
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
	title={deleteModalState?.mode === 'blocked' ? 'Cannot delete service' : 'Delete service'}
	onClose={closeDeleteModal}
	size="md"
>
	{#if deleteModalState}
		<p class="text-sm text-base-content/80">
			{#if deleteModalState.mode === 'blocked'}
				This service cannot be deleted yet.
			{:else}
				This permanently removes the current service listing from your dashboard.
			{/if}
		</p>

		{#if deleteModalState.mode === 'blocked'}
			<div class="mt-4 space-y-3">
				{#if deleteModalState.openQuoteCount > 0}
					<div class="alert alert-warning">
						<span>
							Open quotes are still attached to this service (`{deleteModalState.openQuoteCount}` blocking thread{deleteModalState.openQuoteCount === 1 ? '' : 's'}).
						</span>
					</div>
				{/if}
				{#if deleteModalState.activeContractCount > 0}
					<div class="alert alert-error">
						<span>
							Active service contracts are still attached to this service (`{deleteModalState.activeContractCount}` active contract{deleteModalState.activeContractCount === 1 ? '' : 's'}).
						</span>
					</div>
				{/if}
			</div>
			<div class="mt-6 flex justify-end">
				<button type="button" class="btn btn-primary" onclick={closeDeleteModal}>Close</button>
			</div>
		{:else}
			<p class="mt-4 text-sm text-base-content/70">
				{#if deleteModalState.totalQuoteCount > 0}
					Historical quote threads will remain as records, but no open quotes or active contracts were found.
				{:else}
					No open quotes or active contracts were found for this service.
				{/if}
			</p>
			<div class="mt-6 flex justify-end gap-2">
				<button
					type="button"
					class="btn btn-ghost"
					onclick={closeDeleteModal}
					disabled={deleteSubmitServiceId === (deleteModalState.service.uniqueId || deleteModalState.service.id)}
				>
					Cancel
				</button>
				<button
					type="button"
					class="btn btn-error"
					onclick={confirmDeleteService}
					disabled={deleteSubmitServiceId === (deleteModalState.service.uniqueId || deleteModalState.service.id)}
				>
					{#if deleteSubmitServiceId === (deleteModalState.service.uniqueId || deleteModalState.service.id)}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					Confirm Delete
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
	onRequestDeleteConfirm={() => setServiceModal('delete')}
	isDeleting={isDeletingService}
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
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
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
						{$t('dashboard.services.detail.edit_service_confirmation.warning') || 'Editing will update your service listing'}
					</p>
					<p class="text-warning text-sm">
						{$t('dashboard.services.detail.edit_service_confirmation.details') || 'Any quotes already received will remain attached to your service.'}
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
		<button class="modal-backdrop" onclick={() => setServiceModal(null)} aria-label="Close"></button>
	</div>
{/if}

<!-- Delete Service Confirmation Modal -->
{#if activeServiceModal === 'delete' && selectedServiceForDrawer}
	<div class="modal modal-open modal-middle" transition:fade={{ duration: 200 }}>
		<div class="modal-box max-w-md" transition:scale={{ duration: 200, start: 0.9 }}>
			<div class="mb-6">
				<div class="mb-2 flex items-center gap-3">
					<div class="bg-error/10 flex h-10 w-10 items-center justify-center rounded-full">
						<svg class="text-error h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
						</svg>
					</div>
					<div>
						<h4 class="text-sm font-semibold">
							{$t('dashboard.services.detail.delete_service_confirm_title') || 'Delete Service'}
						</h4>
					</div>
				</div>
			</div>

			<div class="space-y-4">
				<div class="bg-error/10 rounded-lg p-4">
					<p class="text-error text-sm font-semibold">
						{$t('dashboard.services.detail.delete_service_confirm_message') || 'This permanently removes the service listing from your dashboard.'}
					</p>
				</div>
			</div>

			<div class="border-base-300 flex gap-3 pt-6">
				<button type="button" class="btn btn-ghost flex-1" onclick={() => setServiceModal(null)} disabled={isDeletingService}>
					{$t('common.cancel') || 'Cancel'}
				</button>
				<button type="button" class="btn btn-error flex-1 whitespace-nowrap" onclick={confirmDeleteServiceFromDrawer} disabled={isDeletingService}>
					{#if isDeletingService}
						<span class="loading loading-spinner loading-sm"></span>
					{:else}
						<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
						</svg>
					{/if}
					{$t('dashboard.services.detail.delete_service') || 'Delete Service'}
				</button>
			</div>
		</div>
		<button class="modal-backdrop" onclick={() => setServiceModal(null)} aria-label="Close"></button>
	</div>
{/if}
