<script lang="ts">
	import type { ContractWithEvents } from '$lib/types/contract';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { getUserContracts } from '$lib/utils/nostr-bid';
	import { contractUpdateStore } from '$lib/utils/wallet/escrowEvents';
	import { onDestroy } from 'svelte';
	import ContractCard from './ContractCard.svelte';
	import ContractDrawer from './ContractDrawer.svelte';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	
	// MDI Icons for filters
	import IconCheckAll from '~icons/mdi/check-all';
	import IconLightningBolt from '~icons/mdi/lightning-bolt';
	import IconCheckCircle from '~icons/mdi/check-circle';
	import IconAlertCircleOutline from '~icons/mdi/alert-circle-outline';
	import IconCheck from '~icons/mdi/check';
	import IconCancel from '~icons/mdi/cancel';
	import IconRefresh from '~icons/mdi/refresh';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconAccountOutline from '~icons/mdi/account-outline';
	import IconAccountTieOutline from '~icons/mdi/account-tie-outline';

	// State
	let contracts = $state<ContractWithEvents[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedContract = $state<ContractWithEvents | null>(null);
	let showContractDrawer = $state(false);

	// Filters
	let statusFilter = $state<string>('all');
	let roleFilter = $state<string>('all'); // 'all', 'client', 'freelancer'
	let isStatusDropdownOpen = $state(false);

	let btcPrice = $state<number>(0);

	// Status filter options - matching My Tasks style
	const statusFilterOptions = $derived([
		{ 
			id: 'all', 
			label: $t('dashboard.contracts.all_statuses'),
			icon: IconCheckAll
		},
		{ 
			id: 'active', 
			label: $t('dashboard.contracts.status.active'),
			icon: IconLightningBolt
		},
		{ 
			id: 'completed', 
			label: $t('dashboard.contracts.status.completed'),
			icon: IconCheckCircle
		},
		{ 
			id: 'disputed', 
			label: $t('dashboard.contracts.status.disputed'),
			icon: IconAlertCircleOutline
		},
		{ 
			id: 'resolved', 
			label: $t('dashboard.contracts.status.resolved'),
			icon: IconCheck
		},
		{ 
			id: 'cancelled', 
			label: $t('dashboard.contracts.status.cancelled'),
			icon: IconCancel
		}
	] as const);

	// Role filter options
	const roleFilterOptions = $derived([
		{ 
			id: 'all', 
			label: $t('dashboard.contracts.all_roles'),
			icon: IconAccountOutline
		},
		{ 
			id: 'client', 
			label: $t('dashboard.contracts.as_client'),
			icon: IconAccountTieOutline
		},
		{ 
			id: 'freelancer', 
			label: $t('dashboard.contracts.as_freelancer'),
			icon: IconAccountOutline
		}
	] as const);

	// Filtered contracts
	let filteredContracts = $derived(() => {
		let filtered = contracts;

		// Filter by status
		if (statusFilter !== 'all') {
			filtered = filtered.filter((c) => c.contract.status === statusFilter);
		}

		// Filter by role
		if (roleFilter === 'client') {
			filtered = filtered.filter((c) => c.isClient);
		} else if (roleFilter === 'freelancer') {
			filtered = filtered.filter((c) => !c.isClient);
		}

		return filtered;
	});

	// Load contracts on mount
	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Error fetching BTC price:', error);
		}
	}

	let isMounted = $state(true);
	let isProcessingUpdates = $state(false);

	onMount(async () => {
		isMounted = true;
		await loadContracts();
		await fetchBtcPrice();
	});

	onDestroy(() => {
		isMounted = false;
	});

	async function loadContracts() {
		try {
			isLoading = true;
			error = null;
			contracts = await getUserContracts();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load contracts';
			console.error('Error loading contracts:', err);
		} finally {
			isLoading = false;
		}
	}

	// Subscribe to contract update store (queue-based approach)
	$effect(() => {
		const escrowIds = $contractUpdateStore;
		
		// Only process if:
		// 1. There are escrowIds to process
		// 2. We're not already loading contracts
		// 3. We're not already processing updates
		// 4. Component is still mounted
		if (escrowIds.length > 0 && !isLoading && !isProcessingUpdates && isMounted) {
			// Get the IDs to process and clear the queue immediately
			const idsToProcess = [...escrowIds];
			contractUpdateStore.set([]); // Clear immediately to prevent race conditions
			
			// Set processing flag
			isProcessingUpdates = true;
			
			// Load contracts (this will refresh all contracts, including the updated ones)
			loadContracts().finally(() => {
				if (isMounted) {
					isProcessingUpdates = false;
					
					// Check if any new updates came in while we were loading
					const remaining = $contractUpdateStore;
					if (remaining.length > 0 && !isLoading) {
						// Process remaining updates
						contractUpdateStore.set([]);
						loadContracts();
					}
				}
			});
		}
	});

	function openContractDrawer(contract: ContractWithEvents) {
		selectedContract = contract;
		showContractDrawer = true;
	}

	function closeContractDrawer() {
		selectedContract = null;
		showContractDrawer = false;
	}

	// Handle contract updates (from drawer)
	function handleContractUpdate() {
		// Reload contracts to get latest data
		loadContracts();
		closeContractDrawer();
	}

	function selectStatusFilter(statusId: string) {
		statusFilter = statusId;
		isStatusDropdownOpen = false;
	}

	function selectRoleFilter(roleId: string) {
		roleFilter = roleId;
	}

	function toggleStatusDropdown() {
		isStatusDropdownOpen = !isStatusDropdownOpen;
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.status-dropdown-container')) {
			isStatusDropdownOpen = false;
		}
	}
</script>

<div class="space-y-6">

	<!-- Row 1: Role Filter Buttons + Refresh Button -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex gap-2 mx-auto mt-3">
			<!-- Role Filter Buttons -->
			{#each roleFilterOptions as option}
				{@const IconComponent = option.icon}
				<button
					class="btn {roleFilter === option.id ? 'btn-primary' : 'btn-secondary'} btn-sm flex items-center gap-2"
					onclick={() => selectRoleFilter(option.id)}
					aria-label={option.label}
				>
					{#if roleFilter === option.id}
						<IconCheck class="h-4 w-4" />
					{:else}
						<IconComponent class="h-4 w-4" />
					{/if}
					<span>{option.label}</span>
				</button>
			{/each}

			<!-- Refresh Button -->
			<button
				class="btn btn-ghost btn-sm rounded-full"
				onclick={loadContracts}
				disabled={isLoading}
				aria-label={$t('dashboard.contracts.refresh')}
			>
				{#if isLoading}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<IconRefresh class="h-5 w-5" />
				{/if}
			</button>
		</div>
	</div>
	
	<!-- Row 2: Status Filter Buttons (above role filter) -->
	<div class="mb-4">
		<!-- Desktop: Button filters -->
		<div class="hidden sm:block">
			<div class="mt-3 flex flex-col gap-3 sm:flex-row">
				{#each statusFilterOptions as option}
					{@const IconComponent = option.icon}
					<button
						class="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-3xl py-2 text-center transition-all duration-200 {statusFilter === option.id
							? 'text-primary bg-primary/10'
							: 'bg-base-100/40 hover:bg-base-100/50 text-base-content/70'}"
						onclick={() => selectStatusFilter(option.id)}
						aria-label={option.label}
					>
						<!-- MDI Icon Component -->
						<IconComponent 
							class="h-5 w-5 {statusFilter === option.id ? 'text-primary' : ''}"
						/>
						<span class="font-medium">{option.label}</span>
					</button>
				{/each}
			</div>
		</div>

		<!-- Mobile: Custom dropdown -->
		<div class="block sm:hidden">
			<div class="status-dropdown-container relative mt-3">
				<button
					class="border-primary bg-primary/10 text-primary hover:bg-primary/20 flex w-full cursor-pointer items-center justify-between rounded-3xl border px-4 py-1 transition-all duration-200 {statusFilter !== 'all'
						? 'border-primary bg-primary/10 text-primary'
						: 'border-base-300 bg-base-100/40 text-base-content/70'}"
					onclick={toggleStatusDropdown}
				>
					<div class="flex items-center gap-2">
						<!-- MDI Icon Component for selected filter -->
						{#each statusFilterOptions as option}
							{#if statusFilter === option.id}
								{@const IconComponent = option.icon}
								<IconComponent class="h-5 w-5" />
							{/if}
						{/each}
						<span class="font-medium">
							{statusFilterOptions.find((opt) => opt.id === statusFilter)?.label}
						</span>
					</div>
					<!-- Dropdown arrow icon -->
					<IconChevronDown 
						class="h-5 w-5 transition-transform duration-200 {isStatusDropdownOpen ? 'rotate-180' : ''}"
					/>
				</button>

				<!-- Dropdown menu -->
				{#if isStatusDropdownOpen}
					<div
						class="border-base-300 bg-base-300 absolute top-full right-0 left-0 z-50 mt-2 rounded-xl border shadow-lg"
					>
						{#each statusFilterOptions as option}
							{@const IconComponent = option.icon}
							<button
								class="hover:bg-base-200 flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left transition-colors duration-200 first:rounded-t-xl last:rounded-b-xl {statusFilter === option.id
									? 'bg-primary/10 text-primary'
									: 'text-base-content'}"
								onclick={() => selectStatusFilter(option.id)}
							>
								<!-- MDI Icon Component -->
								<IconComponent 
									class="h-5 w-5 {statusFilter === option.id ? 'text-primary' : 'text-base-content/60'}"
								/>
								<span class="font-medium">{option.label}</span>
								{#if statusFilter === option.id}
									<IconCheck class="text-primary ml-auto h-5 w-5" />
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>

	

	<!-- Loading State -->
	{#if isLoading}
		<div class="flex justify-center py-12">
			<div class="flex items-center gap-3">
				<span class="loading loading-spinner loading-md"></span>
				<span>{$t('dashboard.contracts.loading')}</span>
			</div>
		</div>
	{/if}

	<!-- Error State -->
	{#if error}
		<div class="alert alert-outline alert-error">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<div>
				<h3 class="font-bold">{$t('dashboard.contracts.error_title')}</h3>
				<div class="text-xs">{error}</div>
			</div>
			<button class="btn btn-sm btn-outline" onclick={loadContracts}>
				{$t('dashboard.contracts.retry')}
			</button>
		</div>
	{/if}

	<!-- Contracts List -->
	{#if !isLoading && !error}
		{#if filteredContracts().length === 0}
			<div class="py-12 text-center">
				<div class="mb-4">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-base-content/30 mx-auto h-12 w-12"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
						/>
					</svg>
				</div>
				<h3 class="mb-2 text-lg font-semibold">
					{contracts.length === 0
						? $t('dashboard.contracts.no_contracts')
						: $t('dashboard.contracts.no_filtered_contracts')}
				</h3>
				<p class="text-base-content/70">
					{contracts.length === 0
						? $t('dashboard.contracts.no_contracts_description')
						: $t('dashboard.contracts.try_different_filters')}
				</p>
			</div>
		{:else}
			{#each filteredContracts() as contract (contract.contract.escrowId)}
				<ContractCard
					{contract}
					{btcPrice}
					onclick={() => openContractDrawer(contract)}
					onActionComplete={loadContracts}
				/>
			{/each}
		{/if}
	{/if}
</div>

<!-- Contract Drawer -->
<ContractDrawer
	contract={selectedContract}
	isOpen={showContractDrawer}
	{btcPrice}
	onClose={closeContractDrawer}
	onUpdate={handleContractUpdate}
/>

<svelte:window onclick={handleClickOutside} />
