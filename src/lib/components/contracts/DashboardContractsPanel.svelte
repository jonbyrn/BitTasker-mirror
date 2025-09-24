<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { getUserContracts } from '$lib/utils/nostr-bid';
	import type { ContractWithEvents } from '$lib/types/contract';
	import ContractCard from './ContractCard.svelte';
	import ContractDrawer from './ContractDrawer.svelte';

	// State
	let contracts = $state<ContractWithEvents[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedContract = $state<ContractWithEvents | null>(null);
	let showContractDrawer = $state(false);

	// Filters
	let statusFilter = $state<string>('all');
	let roleFilter = $state<string>('all'); // 'all', 'client', 'freelancer'

	// Filtered contracts
	let filteredContracts = $derived(() => {
		let filtered = contracts;

		// Filter by status
		if (statusFilter !== 'all') {
			filtered = filtered.filter(c => c.contract.status === statusFilter);
		}

		// Filter by role
		if (roleFilter === 'client') {
			filtered = filtered.filter(c => c.isClient);
		} else if (roleFilter === 'freelancer') {
			filtered = filtered.filter(c => !c.isClient);
		}

		return filtered;
	});

	// Load contracts on mount
	onMount(async () => {
		await loadContracts();
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

	// Status badge classes
	function getStatusBadgeClass(status: string): string {
		switch (status) {
			case 'active':
				return 'badge-info';
			case 'completed':
				return 'badge-warning';
			case 'disputed':
				return 'badge-error';
			case 'resolved':
				return 'badge-success';
			case 'cancelled':
				return 'badge-neutral';
			default:
				return 'badge-ghost';
		}
	}
</script>

<div class="space-y-6">
	<!-- Header with filters -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mt-4">
		<p class="text-base-content/70">{$t('dashboard.contracts.description')}</p>

		<div class="flex gap-2">
			<!-- Role Filter -->
			<select 
				bind:value={roleFilter}
				class="select select-bordered select-sm"
				aria-label={$t('dashboard.contracts.filter_by_role')}
			>
				<option value="all">{$t('dashboard.contracts.all_roles')}</option>
				<option value="client">{$t('dashboard.contracts.as_client')}</option>
				<option value="freelancer">{$t('dashboard.contracts.as_freelancer')}</option>
			</select>

			<!-- Status Filter -->
			<select 
				bind:value={statusFilter}
				class="select select-bordered select-sm whitespace-nowrap"
				aria-label={$t('dashboard.contracts.filter_by_status')}
			>
				<option value="all">{$t('dashboard.contracts.all_statuses')}</option>
				<option value="active">{$t('dashboard.contracts.status.active')}</option>
				<option value="completed">{$t('dashboard.contracts.status.completed')}</option>
				<option value="disputed">{$t('dashboard.contracts.status.disputed')}</option>
				<option value="resolved">{$t('dashboard.contracts.status.resolved')}</option>
				<option value="cancelled">{$t('dashboard.contracts.status.cancelled')}</option>
			</select>

			<!-- Refresh Button -->
			<button
				class="btn btn-outline btn-sm"
				onclick={loadContracts}
				disabled={isLoading}
				aria-label={$t('dashboard.contracts.refresh')}
			>
				{#if isLoading}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
					</svg>
				{/if}
			</button>
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
		<div class="alert alert-error">
			<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
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
			<div class="text-center py-12">
				<div class="mb-4">
					<svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-12 w-12 text-base-content/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
					</svg>
				</div>
				<h3 class="text-lg font-semibold mb-2">
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
			<div class="grid gap-4">
				{#each filteredContracts() as contract (contract.contract.escrowId)}
					<ContractCard 
						{contract} 
						onclick={() => openContractDrawer(contract)}
					/>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<!-- Contract Drawer -->
<ContractDrawer 
	contract={selectedContract}
	isOpen={showContractDrawer}
	onClose={closeContractDrawer}
	onUpdate={handleContractUpdate}
/>
