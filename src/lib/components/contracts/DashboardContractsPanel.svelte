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
	import { fetchProfileMetadata, fetchComprehensiveProfile } from '$lib/utils/nostr-message';
	
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
	
	// Profile cache - batched profile fetching
	type UserProfile = {
		name?: string;
		picture?: string;
		createdAt?: string;
		reviews?: Array<{ id: string; from: string; rating: number; text: string; date: string }>;
		averageRating?: number;
		tasksCompleted?: number;
	};
	let profileCache = $state<Map<string, UserProfile>>(new Map());
	let isLoadingProfiles = $state(false);

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
		await Promise.all([
			loadContracts(),
			fetchBtcPrice()
		]);
		// Load profiles after contracts are loaded
		await loadProfilesForContracts();
	});

	onDestroy(() => {
		isMounted = false;
	});

	async function loadContracts(escrowIds?: string[]) {
		const startTime = Date.now();
		console.log('[DashboardContractsPanel] loadContracts() called', {
			timestamp: startTime,
			currentContractCount: contracts.length,
			isLoading,
			isProcessingUpdates,
			targetedReload: !!escrowIds
		});
		try {
			isLoading = true;
			error = null;
			// getUserContracts now returns partial results instead of throwing
			// This prevents infinite retry loops when some contracts fail to load
			console.log('[DashboardContractsPanel] Calling getUserContracts()...');
			const loadedContracts = await getUserContracts(escrowIds ? { escrowIds } : undefined);
			
			if (escrowIds && escrowIds.length > 0) {
				// Targeted reload: update only specific contracts
				const updatedEscrowIds = new Set(escrowIds);
				contracts = contracts.map(existing => {
					const escrowId = existing.contract.escrowId;
					if (updatedEscrowIds.has(escrowId)) {
						// Find the updated contract
						const updated = loadedContracts.find(c => c.contract.escrowId === escrowId);
						return updated || existing;
					}
					return existing;
				});
				
				// Add any new contracts that weren't in the list
				for (const newContract of loadedContracts) {
					if (!contracts.some(c => c.contract.escrowId === newContract.contract.escrowId)) {
						contracts = [...contracts, newContract];
					}
				}
				
				// Sort by creation time (newest first)
				contracts = contracts.sort(
					(a, b) => b.contract.createdAt - a.contract.createdAt
				);
			} else {
				// Full reload: replace all contracts
				contracts = loadedContracts;
			}
			
			const duration = Date.now() - startTime;
			console.log('[DashboardContractsPanel] Contracts loaded successfully', {
				contractCount: contracts.length,
				duration: `${duration}ms`,
				targetedReload: !!escrowIds
			});
			
			// Load profiles for new/updated contracts
			if (isMounted) {
				await loadProfilesForContracts(escrowIds);
			}
		} catch (err) {
			const duration = Date.now() - startTime;
			// This should rarely happen now since getUserContracts doesn't throw
			// But keep it as a safety net
			error = err instanceof Error ? err.message : 'Failed to load contracts';
			console.error('[DashboardContractsPanel] Error loading contracts (non-fatal)', {
				error: err instanceof Error ? err.message : String(err),
				errorType: err?.constructor?.name,
				stack: err instanceof Error ? err.stack : undefined,
				duration: `${duration}ms`,
				currentContractCount: contracts.length
			});
			// Don't set contracts to empty - keep what we have
			// contracts = []; // Removed - keep existing contracts
		} finally {
			isLoading = false;
			const duration = Date.now() - startTime;
			console.log('[DashboardContractsPanel] loadContracts() completed', {
				duration: `${duration}ms`,
				contractCount: contracts.length,
				hasError: !!error
			});
		}
	}
	
	// Batch load profiles for all contracts
	async function loadProfilesForContracts(targetEscrowIds?: string[]) {
		if (!isMounted || isLoadingProfiles) return;
		
		try {
			isLoadingProfiles = true;
			
			// Collect unique pubkeys from contracts
			const pubkeysToLoad = new Set<string>();
			const contractsToProcess = targetEscrowIds
				? contracts.filter(c => targetEscrowIds.includes(c.contract.escrowId))
				: contracts;
			
			for (const contract of contractsToProcess) {
				const userPubkey = contract.isClient
					? contract.contract.freelancerPubkey
					: contract.contract.clientPubkey;
				
				// Only load if not already cached
				if (!profileCache.has(userPubkey)) {
					pubkeysToLoad.add(userPubkey);
				}
			}
			
			if (pubkeysToLoad.size === 0) {
				return; // All profiles already cached
			}
			
			console.log('[DashboardContractsPanel] Loading profiles for', pubkeysToLoad.size, 'users');
			
			// Batch fetch all profiles in parallel
			const profilePromises = Array.from(pubkeysToLoad).map(async (pubkey) => {
				try {
					const [basicProfile, comprehensiveProfile] = await Promise.all([
						fetchProfileMetadata(pubkey),
						fetchComprehensiveProfile(pubkey).catch(() => null)
					]);
					
					const avgRating = comprehensiveProfile?.reviews && comprehensiveProfile.reviews.length > 0
						? comprehensiveProfile.reviews.reduce((sum, review) => sum + review.rating, 0) / comprehensiveProfile.reviews.length
						: 0;
					
					const profile: UserProfile = {
						name: basicProfile.name,
						picture: basicProfile.picture,
						createdAt: basicProfile.createdAt,
						reviews: comprehensiveProfile?.reviews || [],
						averageRating: avgRating,
						tasksCompleted: comprehensiveProfile?.reviews?.length || 0
					};
					
					return { pubkey, profile };
				} catch (error) {
					console.error(`Failed to load profile for ${pubkey}:`, error);
					return { pubkey, profile: null };
				}
			});
			
			const results = await Promise.all(profilePromises);
			
			// Update cache
			for (const { pubkey, profile } of results) {
				if (profile && isMounted) {
					profileCache.set(pubkey, profile);
				}
			}
			
			console.log('[DashboardContractsPanel] Profiles loaded:', results.filter(r => r.profile).length);
		} catch (error) {
			console.error('[DashboardContractsPanel] Error loading profiles:', error);
		} finally {
			if (isMounted) {
				isLoadingProfiles = false;
			}
		}
	}

	// Process contract updates from the store (targeted reload)
	async function processContractUpdates() {
		if (!isMounted || isLoading || isProcessingUpdates) return;
		
		const escrowIds = $contractUpdateStore;
		if (escrowIds.length === 0) return;
		
		console.log('[DashboardContractsPanel] Processing contract updates', {
			escrowIdsCount: escrowIds.length,
			escrowIds: escrowIds.slice(0, 5) // Log first 5 for debugging
		});
		
		// Get the IDs to process and clear the queue immediately
		const idsToProcess = [...escrowIds];
		contractUpdateStore.set([]); // Clear immediately to prevent race conditions
		
		try {
			isProcessingUpdates = true;
			// Targeted reload: only reload the specific contracts that changed
			await loadContracts(idsToProcess);
			
			// Check if any new updates came in while we were loading
			const remaining = $contractUpdateStore;
			if (remaining.length > 0 && isMounted && !isLoading) {
				console.log('[DashboardContractsPanel] Processing remaining contract updates', {
					remainingCount: remaining.length
				});
				// Recursively process remaining updates
				await processContractUpdates();
			}
		} catch (err) {
			// Silently handle errors - loadContracts already handles them internally
			console.error('[DashboardContractsPanel] Error processing contract updates (non-fatal)', {
				error: err instanceof Error ? err.message : String(err),
				errorType: err?.constructor?.name,
				stack: err instanceof Error ? err.stack : undefined,
				escrowIds: idsToProcess
			});
		} finally {
			if (isMounted) {
				isProcessingUpdates = false;
			}
		}
	}

	// Subscribe to contract update store (queue-based approach)
	$effect(() => {
		if (!isMounted || isLoading || isProcessingUpdates) return;
		
		const escrowIds = $contractUpdateStore;
		if (escrowIds.length > 0) {
			// Process updates asynchronously - flag changes happen inside async function
			processContractUpdates();
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

	// Handle contract updates (from drawer) - targeted reload
	function handleContractUpdate(updatedEscrowId?: string) {
		if (updatedEscrowId) {
			// Targeted reload: only reload the specific contract
			loadContracts([updatedEscrowId]);
		} else if (selectedContract) {
			// Fallback: reload the selected contract
			loadContracts([selectedContract.contract.escrowId]);
		} else {
			// Last resort: full reload
			loadContracts();
		}
		closeContractDrawer();
	}
	
	// Handle action completion from contract cards - targeted reload
	function handleActionComplete(escrowId: string) {
		// Optimistically update: reload only the affected contract
		loadContracts([escrowId]);
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
				onclick={() => loadContracts()}
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
			<button class="btn btn-sm btn-outline" onclick={() => loadContracts()}>
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
				{@const userPubkey = contract.isClient ? contract.contract.freelancerPubkey : contract.contract.clientPubkey}
				{@const userProfile = profileCache.get(userPubkey)}
				<ContractCard
					{contract}
					{btcPrice}
					{userProfile}
					onclick={() => openContractDrawer(contract)}
					onActionComplete={() => handleActionComplete(contract.contract.escrowId)}
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
	onUpdate={() => handleContractUpdate(selectedContract?.contract.escrowId)}
/>

<svelte:window onclick={handleClickOutside} />
