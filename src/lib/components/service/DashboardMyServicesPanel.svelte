<script lang="ts">
	import type { Component } from 'svelte';
	import type { ContractWithEvents } from '$lib/types/contract';
	import type { Service } from '$lib/types/service.d';
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { fade, scale } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import { findMyServices } from '$lib/nostr/findServices';
	import { deleteService, updateService } from '$lib/nostr/service';
	import { appStore } from '$lib/stores/app.store';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import IconPlus from '~icons/mdi/plus';
	import IconRefresh from '~icons/mdi/refresh';
	import IconPencilOutline from '~icons/mdi/pencil-outline';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';
	import DashboardServiceCard from './DashboardServiceCard.svelte';
	import { isTerminalPaymentState } from '$lib/utils/contract/v2/permittedActions';
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
	import DashboardFilterBar from '$lib/components/shared/DashboardFilterBar.svelte';
	import DashboardDropdown from '$lib/components/shared/DashboardDropdown.svelte';
	import { createDashboardUrl } from '$lib/utils/service-quote/dashboard-route';
	import { ndk } from '$lib/nostr/ndk';
	import KINDS from '$lib/utils/constants/kinds';
	import { NDKPaymentContract } from '$lib/nostr/events/contract';
	import type { NDKFilter } from '@nostr-dev-kit/ndk';
	import { ContractStatus } from '$lib/utils/contract/types';
	import type { EscrowData } from '$lib/types/wallet';

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
		loadContractsSnapshot,
		queryProviderQuoteThreads = queryTaskeeServiceQuoteThreads,
		deletePortfolioMedia = deleteServicePortfolioMedia,
		status = null
	}: {
		onOpenServiceQuotes?: (service: Service) => void;
		loadMyServices?: typeof findMyServices;
		updateMyService?: typeof updateService;
		deleteMyService?: typeof deleteService;
		loadContractsSnapshot?: () => Promise<ContractWithEvents[]>;
		queryProviderQuoteThreads?: typeof queryTaskeeServiceQuoteThreads;
		deletePortfolioMedia?: typeof deleteServicePortfolioMedia;
		status?: string | null;
	} = $props();

	let services = $state<Service[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let togglingServiceId = $state<string | null>(null);
	let btcPrice = $state<number>(0);
	let deleteSubmitServiceId = $state<string | null>(null);
	let currentPage = $state(1);

	const VALID_FILTERS: ServiceStatusFilter[] = ['all', 'active', 'inactive'];
	let selectedStatusFilter = $state<ServiceStatusFilter>('all');

	$effect(() => {
		if (status && VALID_FILTERS.includes(status as ServiceStatusFilter)) {
			selectedStatusFilter = status as ServiceStatusFilter;
		}
	});

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
		const pendingKeys = new SvelteSet($pendingServiceDeleteStore.map((entry) => entry.key));
		const pendingIds = new SvelteSet($pendingServiceDeleteStore.map((entry) => entry.serviceId));

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
			label: tr('dashboard.services.my_services.filters.all', 'All Statuses')
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
		void refreshContractsSnapshot().catch((contractError) => {
			console.error('Failed to load full contracts snapshot for my services:', contractError);
		});
	});

	$effect(() => {
		if (currentPage > totalPages) {
			currentPage = totalPages;
		}
	});

	function isActiveServiceContract(contract: ContractWithEvents): boolean {
		if ((contract.contractEvent.content.contextType ?? 'task') !== 'service') return false;
		return !isTerminalPaymentState(contract.status);
	}

	function getActiveServiceContractsForService(
		contracts: ContractWithEvents[],
		service: Service
	): ContractWithEvents[] {
		const keys = new SvelteSet<string>();
		try {
			const addr = buildServiceAddress(service);
			if (addr) keys.add(addr);
		} catch {
			/* */
		}
		if ((service as unknown as Record<string, unknown>).uniqueId)
			keys.add((service as unknown as Record<string, unknown>).uniqueId as string);
		if (service.id) keys.add(service.id);

		return contracts.filter((contract) => {
			if (!isActiveServiceContract(contract)) return false;
			const c = contract.contractEvent.content;
			return [c.serviceAddress, c.contextId, c.serviceId].some(
				(v) => typeof v === 'string' && keys.has(v)
			);
		});
	}

	/** Convert an NDKPaymentContract to a minimal ContractWithEvents snapshot (no blockchain data). */
	async function ndkContractToSnapshot(
		contract: NDKPaymentContract,
		currentPubkey: string
	): Promise<ContractWithEvents | null> {
		const pTags = contract.getMatchingTags('p');
		const authorPubkey = contract.pubkey;
		const taskerPubkey = authorPubkey;
		const taskeePubkey = pTags.find((tag) => tag[1] !== authorPubkey)?.[1] ?? '';
		const isClient = currentPubkey === taskeePubkey;

		const statusValue = contract.status ? parseInt(contract.status, 10) : ContractStatus.Funded;

		// Build minimal escrow data (blockchain fields unavailable from Nostr alone)
		const escrowData = {
			id: contract.paymentId,
			client: isClient ? currentPubkey : taskeePubkey,
			freelancer: isClient ? taskerPubkey : currentPubkey,
			baseAmount: String(contract.amount ?? '0'),
			clientFee: '0',
			freelancerFee: '0',
			totalAmount: String(contract.amount ?? '0'),
			status: statusValue,
			estimatedStartTime: contract.estimatedStartTime ?? 0,
			estimatedCompletionTime: contract.estimatedCompletionTime ?? 0,
			completionTime: 0,
			timelockExpiry: 0,
			clientFeeTier: 0,
			freelancerFeeTier: 0,
			createdAt: contract.created_at ?? 0,
			lastUpdated: contract.created_at ?? 0
		} as unknown as EscrowData;

		return {
			contractEvent: {
				id: contract.id ?? '',
				pubkey: contract.pubkey ?? '',
				created_at: contract.created_at ?? 0,
				kind: contract.kind ?? KINDS.CONTRACT,
				tags: contract.tags as unknown as string[][],
				content: {
					escrowId: contract.paymentId,
					taskId: contract.taskId,
					freelancerPubkey: taskerPubkey,
					clientPubkey: taskeePubkey,
					amount: String(contract.amount ?? '0'),
					currency: contract.currency,
					status: statusValue,
					estimatedStartTime: contract.estimatedStartTime ?? 0,
					estimatedCompletionTime: contract.estimatedCompletionTime ?? 0,
					type: 'contract' as const,
					contextType: (contract.tagValue('contextType') ?? 'task') as 'task' | 'service',
					contextId: contract.tagValue('contextId'),
					serviceAddress: contract.tagValue('serviceAddress'),
					serviceId: contract.tagValue('serviceId'),
					contractAddress: contract.contractAddress,
					transactionHash: contract.transactionHash
				},
				sig: contract.sig ?? ''
			},
			statusEvents: [],
			isClient,
			blockchainStatus: null,
			escrowData,
			status: statusValue,
			isPending: false,
			permissions: {
				canComplete: false,
				canAccept: false,
				canDispute: false,
				canPropose: false,
				canAcceptProposal: false,
				canCancel: false,
				canRefund: false,
				canResolveTimelock: false,
				canDelete: false
			},
			disputeProposal: null,
			completionAttachments: null,
			completionText: null
		};
	}

	async function fetchContractsSnapshot(): Promise<ContractWithEvents[]> {
		if (loadContractsSnapshot) {
			return await loadContractsSnapshot();
		}

		const currentPubkey = ndk.$currentPubkey;
		if (!currentPubkey) {
			return [];
		}

		const contractsByEscrowId: Record<string, ContractWithEvents> = {};
		let until: number | null = null;

		for (let pageIndex = 0; pageIndex < MAX_CONTRACTS_SNAPSHOT_PAGES; pageIndex += 1) {
			const filter: NDKFilter = {
				kinds: [KINDS.CONTRACT] as number[],
				'#p': [currentPubkey],
				limit: CONTRACTS_SNAPSHOT_LIMIT,
				...(typeof until === 'number' ? { until } : {})
			};

			const events = await ndk.fetchEvents(filter, { closeOnEose: true });

			if (events.size === 0) {
				break;
			}

			for (const event of events) {
				try {
					const contract = await NDKPaymentContract.from(event);
					if (!contract) continue;
					const wrapped = await ndkContractToSnapshot(contract, currentPubkey);
					if (wrapped) {
						const escrowId = wrapped.escrowData.id || wrapped.contractEvent.content.escrowId;
						contractsByEscrowId[escrowId] = wrapped;
					}
				} catch {
					// Skip contracts that fail conversion
				}
			}

			if (events.size < CONTRACTS_SNAPSHOT_LIMIT) {
				break;
			}

			const sorted = [...events].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
			const oldestTimestamp = sorted[sorted.length - 1]?.created_at ?? null;
			if (oldestTimestamp === null || oldestTimestamp < 0) {
				break;
			}

			until = oldestTimestamp - 1;
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

	function handleFilterChange(nextStatus: ServiceStatusFilter) {
		selectedStatusFilter = nextStatus;
		const nextUrl = createDashboardUrl(new URL(window.location.href), {
			tab: 'my-services',
			status: nextStatus === 'all' ? null : nextStatus
		});
		void goto(nextUrl.toString(), { replaceState: true, keepFocus: true, noScroll: true });
		currentPage = 1;
	}

	function clearStatusFilter() {
		handleFilterChange('all');
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
		goto(`/create-service?edit=true&serviceId=${encodeURIComponent(id)}`);
	}

	async function requestDeleteServiceFromDrawer() {
		const serviceToDelete = selectedServiceForDrawer;
		if (!serviceToDelete) return;
		closeServiceDrawer();
		await handleDeleteClick(serviceToDelete);
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
		const primaryContract = getActiveServiceContractsForService(contracts, service)[0] ?? null;
		if (!primaryContract) {
			return;
		}

		const highlightEscrowId =
			primaryContract.escrowData?.id ?? primaryContract.contractEvent.content.escrowId;
		const nextUrl = new URL(
			buildEarningQueryUrl(new URL('/earning', window.location.origin), {
				tab: 'contracts',
				type: 'services',
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
			appStore.showSuccessToast(
				tr('dashboard.services.my_services.status_updated', 'Status updated')
			);
		} catch {
			services = services.map((s) =>
				(s.uniqueId || s.id) === id ? { ...s, status: service.status } : s
			);
			appStore.showErrorToast(
				tr('dashboard.services.my_services.status_update_failed', 'Failed to update status')
			);
		} finally {
			togglingServiceId = null;
		}
	}

	async function inspectDeleteGuards(service: Service) {
		const contracts = await refreshContractsSnapshot({ force: true });
		const activeContracts = getActiveServiceContractsForService(contracts, service);
		const quoteThreads = await queryProviderQuoteThreads({
			serviceAddress: buildServiceAddress(service),
			taskeePubkey: service.npub,
			limit: 100
		});
		const quoteGuard = summarizeDeleteGuardForThreads(quoteThreads, activeContracts.length);

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
			label: tr('dashboard.services.my_services.view_details_short', 'Details'),
			class: 'btn-outline btn-sm',
			onclick: (e: MouseEvent) => {
				e.stopPropagation();
				openServiceDrawer(service);
			},
			icon: 'view_details'
		});

		actions.push({
			label: tr('dashboard.services.my_services.actions.quotes_short', 'Inquiries'),
			class: 'btn-primary btn-sm',
			onclick: (e: MouseEvent) => {
				e.stopPropagation();
				handleOpenQuotes(service);
			},
			icon: 'view_quotes'
		});

		if (getActiveServiceContractsForService(fullContractsSnapshot, service).length > 0) {
			actions.push({
				label: tr('dashboard.services.my_services.actions.contracts_short', 'Contracts'),
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
		<p class="text-base-content/70 mt-4">
			{tr('dashboard.services.my_services.loading', 'Loading your services...')}
		</p>
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
			<span
				>{tr('dashboard.services.my_services.error_loading', 'Error loading services')}: {error}</span
			>
		</div>
	{/if}
	<button type="button" class="btn btn-primary btn-sm mt-4" onclick={loadServices}>
		{tr('dashboard.services.my_services.retry', 'Retry')}
	</button>
{:else if visibleServices.length === 0}
	<div class="card bg-base-100 rounded-xl p-4">
		<DashboardEmptyState
			icon={emptyStateIcon}
			title={tr('dashboard.services.my_services.empty_title', 'No services yet')}
			description={tr(
				'dashboard.services.my_services.empty_message',
				'List your first service to start receiving requests from buyers.'
			)}
			actionLabel={tr('dashboard.services.my_services.create_service', 'Create Service')}
			actionHref="/create-service"
			actionIcon={emptyStateActionIcon}
			testId="dashboard-my-services-empty-state"
		/>
	</div>
{:else}
	<div class="space-y-4">
		<DashboardFilterBar onRefresh={loadServices} isRefreshing={loading}>
			<DashboardDropdown
				options={statusFilterOptions}
				value={selectedStatusFilter}
				onSelect={handleFilterChange}
				containerClass="col-span-2 sm:w-64"
			/>
		</DashboardFilterBar>

		{#if filteredServices.length === 0}
			<div class="card bg-base-100 rounded-xl p-4">
				<DashboardEmptyState
					icon={emptyStateIcon}
					title={tr(
						'dashboard.services.my_services.filtered_empty_title',
						'No services match this filter.'
					)}
					description={tr(
						'dashboard.services.my_services.filtered_empty_body',
						'Try a different status filter to review the rest of your services.'
					)}
					actionLabel={tr(
						'dashboard.services.my_services.filtered_empty_action',
						'Show all services'
					)}
					onAction={clearStatusFilter}
					actionIcon={IconRefresh}
					testId="dashboard-my-services-filtered-empty-state"
				/>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-5">
				{#each paginatedServices as service (service.id)}
					<div animate:flip={{ duration: 400 }}>
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
					</div>
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
					<div class="alert alert-warning alert-outline">
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
