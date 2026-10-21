<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { t } from 'svelte-i18n';
	import { createPortal } from '$lib/utils/portal';
	import ContractDrawerNDK from './ContractDrawerNDK.svelte';
	import InfiniteScroll from '$lib/components/InfiniteScroll.svelte';
	import DashboardFilterBar from '$lib/components/shared/DashboardFilterBar.svelte';
	import DashboardDropdown from '$lib/components/shared/DashboardDropdown.svelte';
	import DashboardEmptyState from '$lib/components/shared/DashboardEmptyState.svelte';
	import ServiceFilterSelect from '$lib/components/service/ServiceFilterSelect.svelte';

	// MDI Icons for filters
	import IconCheckAll from '~icons/mdi/check-all';
	import IconLightningBolt from '~icons/mdi/lightning-bolt';
	import IconProgressClock from '~icons/mdi/progress-clock';
	import IconCheckCircle from '~icons/mdi/check-circle';
	import IconAlertCircleOutline from '~icons/mdi/alert-circle-outline';
	import IconCheck from '~icons/mdi/check';
	import IconCancel from '~icons/mdi/cancel';
	import IconAccountOutline from '~icons/mdi/account-outline';
	import IconAccountTieOutline from '~icons/mdi/account-tie-outline';
	import IconLayersTripleOutline from '~icons/mdi/layers-triple-outline';
	import IconClipboardTextOutline from '~icons/mdi/clipboard-text-outline';
	import IconBriefcaseOutline from '~icons/mdi/briefcase-outline';
	import IconFileDocumentOutline from '~icons/mdi/file-document-outline';
	import IconRefresh from '~icons/mdi/refresh';
	import { ndk } from '$lib/nostr/ndk';
	import { ndkIdentity } from '$lib/runes/ndkIdentity.svelte';
	import type { NDKPaymentContract } from '$lib/nostr/events/contract';
	import type { Service } from '$lib/types/service.d';
	import KINDS from '$lib/utils/constants/kinds';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { PaymentContractRune } from '$lib/runes/contractRune.svelte';
	import { mergeContractEvents } from '$lib/utils/contract/localContractFeed';
	import { localPublishedContracts } from '$lib/utils/contract/localPublishedContracts.svelte';
	import ContractCardNDK from './ContractCardNDK.svelte';
	import NdkIdentityGate from '$lib/components/nostr/NdkIdentityGate.svelte';
	import { findMyServices } from '$lib/nostr/findServices';
	import { parseServiceAddress } from '$lib/utils/service-quote/protocol';
	import {
		matchesDisplayStatusFilter,
		matchesRoleFilter,
		matchesTypeFilter,
		type DashboardContractStatusFilter,
		type DashboardContractTypeFilter
	} from '$lib/utils/helpers/dashboardContractFilters';

	function translateOrFallback(key: string, fallback: string): string {
		const translated = $t(key);
		return translated === key ? fallback : translated;
	}

	let {
		fixedRole = 'all',
		showRoleFilters = true,
		initialType = 'all',
		initialStatus = 'all',
		highlightEscrowId = null,
		onHighlightConsumed,
		onHighlightMissing,
		emptyStateActionLabel = null,
		emptyStateActionHref = null,
		showServiceFilter = false,
		selectedServiceAddress = null,
		onServiceFilterChange,
		onClearFilters
	}: {
		fixedRole?: 'all' | 'client' | 'freelancer';
		showRoleFilters?: boolean;
		initialType?: DashboardContractTypeFilter;
		initialStatus?: DashboardContractStatusFilter;
		highlightEscrowId?: string | null;
		onHighlightConsumed?: (escrowId: string) => void;
		onHighlightMissing?: (escrowId: string) => void;
		emptyStateActionLabel?: string | null;
		emptyStateActionHref?: string | null;
		showServiceFilter?: boolean;
		selectedServiceAddress?: string | null;
		onServiceFilterChange?: (serviceAddress: string | null) => void;
		onClearFilters?: () => void;
	} = $props();

	// Filters - use 'all' as initial defaults, then update via effects to properly track props
	let statusFilter = $state<DashboardContractStatusFilter>('all');
	let roleFilter = $state<'all' | 'client' | 'freelancer'>('all');
	let typeFilter = $state<DashboardContractTypeFilter>('all');
	let highlightHandled = $state<string | null>(null);
	let initializedFilters = $state(false);

	$effect(() => {
		if (!initializedFilters) {
			statusFilter = initialStatus;
			typeFilter = initialType;
			roleFilter = fixedRole;
			initializedFilters = true;
		}
	});

	$effect(() => {
		if (initializedFilters && fixedRole !== 'all') {
			roleFilter = fixedRole;
		}
	});

	// Service filter state
	let services = $state<Service[]>([]);

	async function loadServices(): Promise<void> {
		if (!showServiceFilter) {
			services = [];
			return;
		}

		try {
			const result = await findMyServices({ limit: 100 });
			services = result.services;
		} catch (error) {
			console.error('Failed to load services for contracts filter:', error);
			services = [];
		}
	}

	onMount(() => {
		if (showServiceFilter) {
			void loadServices();
		}
	});

	function getSelectedServiceStableId(): string | null {
		if (!selectedServiceAddress) {
			return null;
		}

		try {
			return parseServiceAddress(selectedServiceAddress).dTag;
		} catch {
			return null;
		}
	}

	function contractMatchesSelectedService(contract: NDKPaymentContract): boolean {
		const contractServiceAddress = contract.tagValue('serviceAddress');
		if (contractServiceAddress && contractServiceAddress === selectedServiceAddress) {
			return true;
		}

		const selectedServiceStableId = getSelectedServiceStableId();
		if (!selectedServiceStableId) {
			return false;
		}

		const contractServiceId = contract.tagValue('serviceId') || contract.tagValue('contextId');
		if (contractServiceId === selectedServiceStableId) {
			return true;
		}

		if (contractServiceAddress) {
			try {
				const parsed = parseServiceAddress(contractServiceAddress);
				return parsed.dTag === selectedServiceStableId;
			} catch {
				return false;
			}
		}

		return false;
	}

	function handleServiceFilterChange(serviceAddress: string | null) {
		typeFilter = serviceAddress ? 'services' : 'all';
		onServiceFilterChange?.(serviceAddress);
	}

	let contractDrawerOpen = $state(false);
	let contractDrawerRune = $state<PaymentContractRune | null>(null);

	function openContractDrawer(rune: PaymentContractRune) {
		contractDrawerRune = rune;
		contractDrawerOpen = true;
	}

	function closeContractDrawer() {
		contractDrawerOpen = false;
		contractDrawerRune = null;
	}

	const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';
	let refreshing = $state(false);
	let refreshCounter = $state(0);

	async function refreshContracts() {
		try {
			refreshing = true;

			// Ensure signer is available — triggers passkey/biometric prompt if stale
			await ndkIdentity.ensureSigner();

			// Guard: user cancelled auth or signer still unavailable
			if (!ndk.$currentPubkey) return;

			// Increment counter triggers the reactive subscription to re-query relays
			refreshCounter++;
		} catch (err) {
			console.error('Failed to refresh contracts:', err);
		} finally {
			setTimeout(() => (refreshing = false), 3000);
		}
	}

	// Create a reactive subscription - note the callback function () => ({ ... })
	const contractsSub = ndk.$subscribe<NDKPaymentContract>(() => {
		// Re-subscribe when refreshCounter changes
		void refreshCounter;
		// No subscription until we have the users pubkey
		if (!ndk.$currentPubkey) return undefined;
		return {
			filters: [
				{ kinds: [KINDS.CONTRACT], limit: 50, '#p': [ndk.$currentPubkey], '#n': [network] }
			],
			wrap: true
		};
	});

	/** One rune per contract id — shared with cards for filtering without double subscriptions. */
	const runesByContractId = new SvelteMap<string, PaymentContractRune>();

	const contractEvents = $derived(
		mergeContractEvents(contractsSub.events, localPublishedContracts())
	);

	$effect(() => {
		const events = contractEvents;
		untrack(() => {
			const wantedIds = new Set(events.map((e) => e.id));
			for (const [id, rune] of [...runesByContractId]) {
				if (!wantedIds.has(id)) {
					rune.stopSubscription();
					runesByContractId.delete(id);
				}
			}
			for (const c of events) {
				if (!runesByContractId.has(c.id)) {
					const rune = new PaymentContractRune(c);
					runesByContractId.set(c.id, rune);
					void rune.start();
				}
			}
		});
	});

	const visibleContracts = $derived.by(() => {
		const me = ndk.$currentPubkey;
		const events = contractEvents;
		return events.filter((contract) => {
			const rune = runesByContractId.get(contract.id);
			if (!rune) return false;
			if (!matchesRoleFilter(contract, roleFilter, me)) return false;
			if (!matchesTypeFilter(contract, typeFilter)) return false;
			// Service filter: when a service is selected and type filter is 'services', filter by service
			if (selectedServiceAddress && typeFilter === 'services') {
				if (!contractMatchesSelectedService(contract)) return false;
			}
			if (statusFilter === 'all') return true;
			if (!rune.statusHistoryReady) return false;
			return matchesDisplayStatusFilter(statusFilter, rune.displayStatus);
		});
	});

	function clearFilters() {
		statusFilter = 'all';
		typeFilter = 'all';
		roleFilter = fixedRole;
		onClearFilters?.();
	}

	// Status filter options — buckets over ContractDisplayStatus (see dashboardContractFilters)
	const statusFilterOptions = $derived([
		{
			id: 'all' as DashboardContractStatusFilter,
			label: $t('dashboard.contracts.all_statuses'),
			icon: IconCheckAll
		},
		{
			id: 'funded' as DashboardContractStatusFilter,
			label: $t('dashboard.contracts.status.funded'),
			icon: IconLightningBolt
		},
		{
			id: 'in_progress' as DashboardContractStatusFilter,
			label: $t('dashboard.contracts.status.in_progress'),
			icon: IconProgressClock
		},
		{
			id: 'completed' as DashboardContractStatusFilter,
			label: $t('dashboard.contracts.filter_completed'),
			icon: IconCheckCircle
		},
		{
			id: 'funds_released' as DashboardContractStatusFilter,
			label: $t('dashboard.contracts.filter_paid'),
			icon: IconCheckCircle
		},
		{
			id: 'funds_claimed' as DashboardContractStatusFilter,
			label: $t('dashboard.contracts.filter_claimed'),
			icon: IconCheckCircle
		},
		{
			id: 'in_dispute' as DashboardContractStatusFilter,
			label: $t('dashboard.contracts.status.in_dispute'),
			icon: IconAlertCircleOutline
		},
		{
			id: 'dispute_resolved' as DashboardContractStatusFilter,
			label: $t('dashboard.contracts.status.dispute_resolved'),
			icon: IconCheck
		},
		{
			id: 'ended_other' as DashboardContractStatusFilter,
			label: $t('dashboard.contracts.filter_ended'),
			icon: IconCancel
		}
	]);

	// Type filter options (tasks vs services)
	const typeFilterOptions = $derived([
		{
			id: 'all' as DashboardContractTypeFilter,
			label: translateOrFallback('dashboard.contracts.context_filters.all', 'All Types'),
			icon: IconLayersTripleOutline
		},
		{
			id: 'tasks' as DashboardContractTypeFilter,
			label: translateOrFallback('dashboard.contracts.context_filters.tasks', 'Tasks'),
			icon: IconClipboardTextOutline
		},
		{
			id: 'services' as DashboardContractTypeFilter,
			label: translateOrFallback('dashboard.contracts.context_filters.services', 'Services'),
			icon: IconBriefcaseOutline
		}
	]);

	// Role filter options
	const roleFilterOptions = $derived([
		{
			id: 'all' as 'all' | 'client' | 'freelancer',
			label: $t('dashboard.contracts.all_roles'),
			icon: IconAccountOutline
		},
		{
			id: 'client' as 'all' | 'client' | 'freelancer',
			label: $t('dashboard.contracts.as_client'),
			icon: IconAccountTieOutline
		},
		{
			id: 'freelancer' as 'all' | 'client' | 'freelancer',
			label: $t('dashboard.contracts.as_freelancer'),
			icon: IconAccountOutline
		}
	]);

	function selectStatusFilter(statusId: DashboardContractStatusFilter) {
		statusFilter = statusId;
	}

	function selectRoleFilter(roleId: 'all' | 'client' | 'freelancer') {
		roleFilter = roleId;
	}

	// Highlight scroll-into-view effect
	$effect(() => {
		if (!highlightEscrowId || highlightHandled === highlightEscrowId) {
			return;
		}

		const contracts = contractsSub.events;
		if (contracts.length === 0) {
			return;
		}

		const matchingContract = contracts.find((contract) => {
			const paymentId =
				contract.paymentId || contract.tagValue('paymentId') || contract.tagValue('d');
			return paymentId === highlightEscrowId;
		});

		if (matchingContract) {
			highlightHandled = highlightEscrowId;
			void (async () => {
				await tick();
				const element = document.querySelector<HTMLElement>(
					`[data-contract-id="${matchingContract.id}"]`
				);
				element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
				onHighlightConsumed?.(highlightEscrowId);
			})();
			return;
		}

		highlightHandled = highlightEscrowId;
		onHighlightMissing?.(highlightEscrowId);
	});

	function selectTypeFilter(typeId: DashboardContractTypeFilter) {
		typeFilter = typeId;
	}
</script>

<NdkIdentityGate>
	<div class="space-y-4">
		<DashboardFilterBar>
			<DashboardDropdown
				options={typeFilterOptions}
				value={typeFilter}
				onSelect={(val) => selectTypeFilter(val)}
				containerClass="sm:w-48"
			/>

			<DashboardDropdown
				options={statusFilterOptions}
				value={statusFilter}
				onSelect={(val) => selectStatusFilter(val)}
				containerClass="sm:w-64"
			/>

			{#if showRoleFilters && fixedRole === 'all'}
				<DashboardDropdown
					options={roleFilterOptions}
					value={roleFilter}
					onSelect={(val) => selectRoleFilter(val)}
					containerClass="sm:w-48"
				/>
			{/if}

			{#if showServiceFilter}
				<div class="col-span-2 flex items-center gap-2">
					<div class="flex-1 sm:w-64">
						<ServiceFilterSelect
							{services}
							{selectedServiceAddress}
							onChange={handleServiceFilterChange}
						/>
					</div>
					<button
						type="button"
						class="btn btn-ghost btn-sm h-10 w-10 shrink-0 rounded-2xl p-0"
						onclick={refreshContracts}
						disabled={refreshing}
						aria-label="Refresh"
					>
						{#if refreshing}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
							<IconRefresh class="h-5 w-5 opacity-70" />
						{/if}
					</button>
				</div>
			{/if}
		</DashboardFilterBar>

		<!-- Contracts List -->
		{#if contractsSub.events.length === 0}
			<div class="card bg-base-100 rounded-xl p-4">
				<DashboardEmptyState
					icon={IconFileDocumentOutline}
					title={$t('dashboard.contracts.no_contracts')}
					actionLabel={emptyStateActionLabel ?? $t('dashboard.create_task')}
					actionHref={emptyStateActionHref ?? '/create-task'}
					actionIcon={IconBriefcaseOutline}
					testId="dashboard-contracts-ndk-empty-state"
				/>
			</div>
		{:else if visibleContracts.length === 0}
			<div class="card bg-base-100 rounded-xl p-4">
				<DashboardEmptyState
					icon={IconFileDocumentOutline}
					title={$t('dashboard.contracts.no_filtered_contracts')}
					description={$t('dashboard.contracts.try_different_filters')}
					actionLabel={$t('dashboard.contracts.clear_filters')}
					actionIcon={IconRefresh}
					onAction={clearFilters}
					testId="dashboard-contracts-ndk-filtered-empty-state"
				/>
			</div>
		{:else}
			{#each visibleContracts as contract (contract.id)}
				{@const rune = runesByContractId.get(contract.id)}
				{#if rune}
					<div data-contract-id={contract.id}>
						<ContractCardNDK {contract} {rune} onOpenContractDrawer={openContractDrawer} />
					</div>
				{/if}
			{/each}
		{/if}

		<!-- Infinite Scroll Component -->
		<InfiniteScroll />
	</div>
</NdkIdentityGate>

<!-- Contract Drawer - DO Not wrap in a condition for animation to work -->
<ContractDrawerNDK
	isOpen={contractDrawerOpen}
	onClose={closeContractDrawer}
	contractRune={contractDrawerRune}
	btcPrice={btcPrice.price}
/>

<!-- Portal target for confirmation modals - outside drawer context -->
<div use:createPortal={'modals'} style="position: relative; z-index: 9999;"></div>
