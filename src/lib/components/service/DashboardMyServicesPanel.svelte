<script lang="ts">
	import type { Component } from 'svelte';
	import type { ContractWithEvents } from '$lib/types/contract';
	import type { Service } from '$lib/types/service.d';
	import { onMount } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import { findMyServices } from '$lib/nostr/findServices';
	import { deleteService, updateService } from '$lib/nostr/service';
	import { appStore } from '$lib/stores/app.store';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import IconCheck from '~icons/mdi/check';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconPlus from '~icons/mdi/plus';
	import IconPencilOutline from '~icons/mdi/pencil-outline';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';
	import DashboardServiceCard from './DashboardServiceCard.svelte';
	import { contractStore } from '$lib/stores/contract.store';
	import {
		getActiveServiceContractsForService,
		selectPrimaryActiveServiceContract
	} from '$lib/utils/service-contract/active-contracts';
	import { buildServiceAddress } from '$lib/stores/service-quote-ui.store';
	import { queryTaskeeServiceQuoteThreads } from '$lib/utils/service-quote/query';
	import { summarizeDeleteGuardForThreads } from '$lib/utils/service-quote/resolver';
	import { buildEarningQueryUrl } from '$lib/utils/dashboardQuery';
	import { deleteServicePortfolioMedia } from '$lib/utils/service/media-cleanup';
	import {
		clearPendingServiceDelete,
		getPendingServiceDeleteKey,
		markServiceDeletePending,
		pendingServiceDeleteStore,
		reconcilePendingServiceDeletes
	} from '$lib/stores/service-delete-ui.store';
	import Modal from '$lib/components/Modal.svelte';
	import ServiceDrawer from './ServiceDrawer.svelte';
	import DashboardEmptyState from '$lib/components/shared/DashboardEmptyState.svelte';
	import ErrorAlertWithModal from '$lib/components/ErrorAlertWithModal.svelte';
	import { detectErrorType } from '$lib/utils/helpers/errorTypeDetector';
	import { escrow } from '$lib/utils/escrow';

	const PAGE_SIZE = 12;
	const MY_SERVICES_FETCH_LIMIT = 1000;
	const CONTRACTS_SNAPSHOT_LIMIT = 50;
	const MAX_CONTRACTS_SNAPSHOT_PAGES = 20;
	type ServiceStatusFilter = 'all' | 'active' | 'inactive';

	let {
		onOpenServiceQuotes,
		loadMyServices = findMyServices,
		updateMyService = updateService,
		deleteMyService = deleteService,
		loadContractsContinuity = () => contractStore.loadContracts(),
		loadContractsSnapshot,
		queryProviderQuoteThreads = queryTaskeeServiceQuoteThreads,
		deletePortfolioMedia = deleteServicePortfolioMedia
	}: {
		onOpenServiceQuotes?: (service: Service) => void;
		loadMyServices?: typeof findMyServices;
		updateMyService?: typeof updateService;
		deleteMyService?: typeof deleteService;
		loadContractsContinuity?: () => Promise<void>;
		loadContractsSnapshot?: () => Promise<ContractWithEvents[]>;
		queryProviderQuoteThreads?: typeof queryTaskeeServiceQuoteThreads;
		deletePortfolioMedia?: typeof deleteServicePortfolioMedia;
	} = $props();

	let services = $state<Service[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let togglingServiceId = $state<string | null>(null);
	let btcPrice = $state<number>(0);
	let deleteSubmitServiceId = $state<string | null>(null);
	let currentPage = $state(1);
	let isStatusDropdownOpen = $state(false);
	let selectedStatusFilter = $state<ServiceStatusFilter>('all');
	let deleteModalState = $state<{
		mode: 'blocked' | 'confirm';
		service: Service;
		openQuoteCount: number;
		activeContractCount: number;
		totalQuoteCount: number;
	} | null>(null);

	let selectedServiceForDrawer = $state<Service | null>(null);
	let drawerOpen = $state(false);
	let activeServiceModal = $state<'edit' | null>(null);
	let fullContractsSnapshot = $state<ContractWithEvents[]>([]);
	let contractsSnapshotLoaded = $state(false);
	let contractsSnapshotPromise: Promise<ContractWithEvents[]> | null = null;
	let statusDropdownButton = $state<HTMLButtonElement | null>(null);
	let statusDropdownContainer = $state<HTMLDivElement | null>(null);
	const emptyStateIcon = IconBriefcaseOutline as unknown as Component<{
		class?: string;
		'aria-hidden'?: string;
	}>;
	const emptyStateActionIcon = IconPlus as unknown as Component<{
		class?: string;
		'aria-hidden'?: string;
	}>;

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

	function trv(key: string, fallback: string, values: Record<string, string | number>): string {
		try {
			const value = $t(key, { values });
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}

	const sortedServices = $derived(
		[...services].sort((a, b) => {
			const statusOrder = { active: 0, inactive: 1, sold: 2 };
			const statusA = statusOrder[a.status] ?? 3;
			const statusB = statusOrder[b.status] ?? 3;
			if (statusA !== statusB) {
				return statusA - statusB;
			}
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

	const filteredServices = $derived.by(() =>
		visibleServices.filter((service) => {
			if (selectedStatusFilter === 'all') {
				return true;
			}

			return service.status === selectedStatusFilter;
		})
	);

	const totalServices = $derived(filteredServices.length);
	const totalPages = $derived(Math.max(1, Math.ceil(totalServices / PAGE_SIZE)));
	const paginatedServices = $derived.by(() => {
		const start = (currentPage - 1) * PAGE_SIZE;
		return filteredServices.slice(start, start + PAGE_SIZE);
	});
	const pageNumbers = $derived.by(() =>
		Array.from({ length: totalPages }, (_, index) => index + 1)
	);
	const statusFilterOptions = $derived.by(() => [
		{
			id: 'all' as const,
			label: tr('dashboard.services.my_services.filters.all', 'All')
		},
		{
			id: 'active' as const,
			label: tr('dashboard.services.my_services.filters.active', 'Active')
		},
		{
			id: 'inactive' as const,
			label: tr('dashboard.services.my_services.filters.inactive', 'Inactive')
		}
	]);
	const activeStatusFilterLabel = $derived.by(
		() => statusFilterOptions.find((option) => option.id === selectedStatusFilter)?.label ?? 'All'
	);

	async function loadServices() {
		loading = true;
		error = null;
		try {
			const result = await loadMyServices({ limit: MY_SERVICES_FETCH_LIMIT });
			reconcilePendingServiceDeletes(result.services);
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
		} catch (priceError) {
			console.error('Error fetching BTC price:', priceError);
		}
	}

	onMount(() => {
		loadServices();
		fetchBtcPrice();
		void loadContractsContinuity().catch((contractError) => {
			console.error('Failed to load contracts for my services continuity:', contractError);
		});
		void refreshContractsSnapshot().catch((contractError) => {
			console.error('Failed to load full contracts snapshot for my services:', contractError);
		});

		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});

	$effect(() => {
		if (currentPage > totalPages) {
			currentPage = totalPages;
		}
	});

	function getContractsForServiceChecks(): ContractWithEvents[] {
		if (contractsSnapshotLoaded) {
			return fullContractsSnapshot;
		}

		return $contractStore.contracts;
	}

	async function fetchContractsSnapshot(): Promise<ContractWithEvents[]> {
		if (loadContractsSnapshot) {
			return await loadContractsSnapshot();
		}

		const contractsByEscrowId: Record<string, ContractWithEvents> = {};
		let until: number | null = null;
		let previousBoundary: number | null = null;

		for (let pageIndex = 0; pageIndex < MAX_CONTRACTS_SNAPSHOT_PAGES; pageIndex += 1) {
			const batch = await escrow.contractOps.getContracts({
				limit: CONTRACTS_SNAPSHOT_LIMIT,
				...(typeof until === 'number' ? { until } : {})
			});

			if (batch.length === 0) {
				break;
			}

			for (const contract of batch) {
				const escrowId = contract.escrowData?.id ?? contract.contractEvent.content.escrowId;
				contractsByEscrowId[escrowId] = contract;
			}

			if (batch.length < CONTRACTS_SNAPSHOT_LIMIT) {
				break;
			}

			const oldestTimestamp = batch[batch.length - 1]?.contractEvent.created_at ?? null;
			if (oldestTimestamp === null) {
				break;
			}

			const nextBoundary =
				previousBoundary !== null && oldestTimestamp >= previousBoundary
					? previousBoundary - 1
					: oldestTimestamp - 1;
			if (nextBoundary < 0) {
				break;
			}

			previousBoundary = oldestTimestamp;
			until = nextBoundary;
		}

		return Object.values(contractsByEscrowId);
	}

	async function refreshContractsSnapshot(
		options: { force?: boolean } = {}
	): Promise<ContractWithEvents[]> {
		if (contractsSnapshotLoaded && !options.force) {
			return fullContractsSnapshot;
		}

		if (contractsSnapshotPromise) {
			return contractsSnapshotPromise;
		}

		contractsSnapshotPromise = (async () => {
			const contracts = await fetchContractsSnapshot();
			fullContractsSnapshot = contracts;
			contractsSnapshotLoaded = true;
			return contracts;
		})();

		try {
			return await contractsSnapshotPromise;
		} finally {
			contractsSnapshotPromise = null;
		}
	}

	function goToPage(page: number) {
		if (page < 1 || page > totalPages) {
			return;
		}

		currentPage = page;
		try {
			window.scrollTo({ top: 0, behavior: 'smooth' });
		} catch {
			// jsdom does not implement window.scrollTo
		}
	}

	function selectStatusFilter(nextFilter: ServiceStatusFilter) {
		selectedStatusFilter = nextFilter;
		currentPage = 1;
		isStatusDropdownOpen = false;
	}

	function clearStatusFilter() {
		selectStatusFilter('all');
	}

	function toggleStatusDropdown() {
		isStatusDropdownOpen = !isStatusDropdownOpen;
	}

	function focusStatusOption(index: number) {
		const options = Array.from(
			statusDropdownContainer?.querySelectorAll<HTMLButtonElement>(
				'[data-status-filter-option="true"]'
			) ?? []
		);
		if (options.length === 0) {
			return;
		}

		const normalizedIndex = ((index % options.length) + options.length) % options.length;
		options[normalizedIndex]?.focus();
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as Node | null;
		if (
			isStatusDropdownOpen &&
			statusDropdownContainer &&
			target &&
			!statusDropdownContainer.contains(target)
		) {
			isStatusDropdownOpen = false;
		}
	}

	function handleStatusTriggerKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			isStatusDropdownOpen = true;
			queueMicrotask(() =>
				focusStatusOption(event.key === 'ArrowDown' ? 0 : statusFilterOptions.length - 1)
			);
			return;
		}

		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			const willOpen = !isStatusDropdownOpen;
			toggleStatusDropdown();
			if (willOpen) {
				queueMicrotask(() => focusStatusOption(0));
			}
			return;
		}

		if (event.key === 'Escape') {
			event.preventDefault();
			isStatusDropdownOpen = false;
			statusDropdownButton?.focus();
		}
	}

	function handleStatusOptionKeydown(
		event: KeyboardEvent,
		index: number,
		optionId: ServiceStatusFilter
	) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			selectStatusFilter(optionId);
			statusDropdownButton?.focus();
			return;
		}

		if (event.key === 'Escape') {
			event.preventDefault();
			isStatusDropdownOpen = false;
			statusDropdownButton?.focus();
			return;
		}

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			focusStatusOption(index + 1);
			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			focusStatusOption(index - 1);
			return;
		}

		if (event.key === 'Home') {
			event.preventDefault();
			focusStatusOption(0);
			return;
		}

		if (event.key === 'End') {
			event.preventDefault();
			focusStatusOption(statusFilterOptions.length - 1);
		}
	}

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
		return selectPrimaryActiveServiceContract(getContractsForServiceChecks(), service);
	}

	function closeDeleteModal() {
		if (deleteSubmitServiceId) {
			return;
		}

		deleteModalState = null;
	}

	function handleOpenQuotes(service: Service) {
		if (onOpenServiceQuotes) {
			onOpenServiceQuotes(service);
			return;
		}

		const nextUrl = new URL(
			buildEarningQueryUrl(new URL('/earning', window.location.origin), {
				tab: 'requests',
				service: buildServiceAddress(service)
			})
		);
		goto(`${nextUrl.pathname}${nextUrl.search}`);
	}

	async function handleViewActiveContracts(service: Service) {
		const contracts = await refreshContractsSnapshot();
		const primaryContract = selectPrimaryActiveServiceContract(contracts, service);
		if (!primaryContract) {
			return;
		}

		const highlightEscrowId =
			primaryContract.escrowData?.id ?? primaryContract.contractEvent.content.escrowId;
		const nextUrl = new URL(
			buildEarningQueryUrl(new URL('/earning', window.location.origin), {
				tab: 'contracts',
				context: 'services',
				highlight: highlightEscrowId,
				service: buildServiceAddress(service)
			})
		);
		goto(`${nextUrl.pathname}${nextUrl.search}`);
	}

	async function handleStatusToggle(service: Service) {
		const id = service.uniqueId || service.id;
		if (!id || service.status === 'sold') return;
		togglingServiceId = id;
		try {
			const nextStatus = service.status === 'active' ? 'inactive' : 'active';
			services = services.map((s) =>
				(s.uniqueId || s.id) === id ? { ...s, status: nextStatus } : s
			);
			await updateMyService(id, { status: nextStatus });
			appStore.showSuccessToast($t('dashboard.services.my_services.status_updated'));
		} catch {
			services = services.map((s) =>
				(s.uniqueId || s.id) === id ? { ...s, status: service.status } : s
			);
			appStore.showErrorToast($t('dashboard.services.my_services.status_update_failed'));
		} finally {
			togglingServiceId = null;
		}
	}

	async function inspectDeleteGuards(service: Service) {
		const contracts = await refreshContractsSnapshot({ force: true });
		const quoteThreads = await queryProviderQuoteThreads({
			serviceAddress: buildServiceAddress(service),
			taskeePubkey: service.npub,
			limit: 100
		});
		const quoteGuard = summarizeDeleteGuardForThreads(quoteThreads);
		const activeContracts = getActiveServiceContractsForService(contracts, service);

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
		} catch (deleteError) {
			appStore.showErrorToast(
				deleteError instanceof Error
					? deleteError.message
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
			await deleteMyService(
				service.id,
				{
					hasOpenQuotes: guard.hasOpenQuotes,
					hasActiveContracts: guard.hasActiveContracts
				},
				{
					uniqueId: service.uniqueId ?? null
				}
			);
			await deletePortfolioMedia(service.portfolio);
			appStore.showSuccessToast(
				tr(
					'dashboard.services.my_services.delete_modal.delete_success',
					'Service deleted successfully.'
				)
			);
			deleteModalState = null;
			await loadServices();
		} catch (deleteError) {
			clearPendingServiceDelete(service);
			const message =
				deleteError instanceof Error
					? deleteError.message
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

	function getServiceActionButtons(service: Service) {
		const actions: Array<{
			label: string;
			class: string;
			onclick: (e: MouseEvent) => void;
			icon: string;
		}> = [];

		actions.push({
			label: tr('dashboard.services.my_services.view_details', 'Details'),
			class: 'btn-outline btn-sm',
			onclick: (e: MouseEvent) => {
				e.stopPropagation();
				openServiceDrawer(service);
			},
			icon: 'view_details'
		});

		actions.push({
			label: tr('dashboard.services.my_services.actions.quotes', 'Requests'),
			class: 'btn-primary btn-sm',
			onclick: (e: MouseEvent) => {
				e.stopPropagation();
				handleOpenQuotes(service);
			},
			icon: 'view_quotes'
		});

		if (getPrimaryActiveContract(service)) {
			actions.push({
				label: tr('dashboard.services.my_services.actions.contracts', 'Contracts'),
				class: 'btn-success btn-outline btn-sm',
				onclick: async (e: MouseEvent) => {
					e.stopPropagation();
					await handleViewActiveContracts(service);
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
			<span>{$t('dashboard.services.my_services.error_loading')}: {error}</span>
		</div>
	{/if}
	<button type="button" class="btn btn-primary btn-sm mt-4" onclick={loadServices}>
		{$t('dashboard.services.my_services.retry')}
	</button>
{:else if visibleServices.length === 0}
	<div class="card bg-base-100 rounded-xl p-4">
		<DashboardEmptyState
			icon={emptyStateIcon}
			title={$t('dashboard.services.my_services.empty_title')}
			description={$t('dashboard.services.my_services.empty_message')}
			actionLabel={$t('dashboard.services.my_services.create_service')}
			actionHref="/dashboard/create-service"
			actionIcon={emptyStateActionIcon}
			testId="dashboard-my-services-empty-state"
		/>
	</div>
{:else}
	<div class="space-y-6">
		<div class="border-base-300/60 bg-base-100/40 rounded-3xl border p-4 shadow-sm">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<p class="text-base-content/70 text-xs font-semibold tracking-wide uppercase">
						{tr('dashboard.services.my_services.filters.status_heading', 'Filter by status')}
					</p>
				</div>
				<div
					class="status-dropdown-container relative w-full sm:w-60"
					data-testid="dashboard-my-services-status-filter"
					bind:this={statusDropdownContainer}
				>
					<button
						type="button"
						class="border-primary bg-primary/10 text-primary hover:bg-primary/20 flex w-full items-center justify-between rounded-3xl border px-4 py-2 transition-all duration-200"
						bind:this={statusDropdownButton}
						aria-controls="dashboard-my-services-status-listbox"
						aria-expanded={isStatusDropdownOpen}
						aria-haspopup="listbox"
						aria-label={tr('dashboard.services.my_services.filters.status', 'Filter by status')}
						onclick={toggleStatusDropdown}
						onkeydown={handleStatusTriggerKeydown}
					>
						<span class="font-medium">{activeStatusFilterLabel}</span>
						<IconChevronDown
							class={`h-5 w-5 transition-transform duration-200 ${isStatusDropdownOpen ? 'rotate-180' : ''}`}
						/>
					</button>

					{#if isStatusDropdownOpen}
						<div
							id="dashboard-my-services-status-listbox"
							role="listbox"
							aria-label={tr('dashboard.services.my_services.filters.status', 'Filter by status')}
							class="border-base-300 bg-base-100 absolute top-full right-0 left-0 z-50 mt-2 rounded-xl border shadow-lg"
						>
							{#each statusFilterOptions as option, index (option.id)}
								<button
									type="button"
									role="option"
									data-status-filter-option="true"
									aria-selected={selectedStatusFilter === option.id}
									class="hover:bg-base-200 flex w-full items-center justify-between px-4 py-3 text-left transition-colors"
									onclick={() => {
										selectStatusFilter(option.id);
										statusDropdownButton?.focus();
									}}
									onkeydown={(event) => handleStatusOptionKeydown(event, index, option.id)}
								>
									<span class="font-medium">{option.label}</span>
									{#if selectedStatusFilter === option.id}
										<IconCheck class="text-primary h-4 w-4" />
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>

		{#if filteredServices.length === 0}
			<div class="card bg-base-100 rounded-xl p-4">
				<div class="py-8 text-center" data-testid="dashboard-my-services-filtered-empty-state">
					<p class="text-lg font-medium">
						{tr(
							'dashboard.services.my_services.filtered_empty_title',
							'No services match this filter.'
						)}
					</p>
					<p class="text-base-content/60 mx-auto mt-2 max-w-md">
						{tr(
							'dashboard.services.my_services.filtered_empty_body',
							'Try a different status filter to review the rest of your services.'
						)}
					</p>
					<button type="button" class="btn btn-primary mt-4" onclick={clearStatusFilter}>
						{tr('dashboard.services.my_services.filtered_empty_action', 'Show all services')}
					</button>
				</div>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-5">
				{#each paginatedServices as service (service.id)}
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

			{#if totalPages > 1}
				<div class="flex items-center justify-center gap-2 py-2">
					<button
						type="button"
						class="btn btn-sm btn-ghost"
						onclick={() => goToPage(currentPage - 1)}
						disabled={currentPage === 1}
					>
						{tr('common.pagination.previous', 'Previous')}
					</button>

					<div class="flex gap-1">
						{#each pageNumbers as page (page)}
							<button
								type="button"
								class="btn btn-sm {currentPage === page ? 'btn-primary' : 'btn-ghost'}"
								onclick={() => goToPage(page)}
							>
								{page}
							</button>
						{/each}
					</div>

					<button
						type="button"
						class="btn btn-sm btn-ghost"
						onclick={() => goToPage(currentPage + 1)}
						disabled={currentPage === totalPages}
					>
						{tr('common.pagination.next', 'Next')}
					</button>
				</div>
			{/if}
		{/if}
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
