<script lang="ts">
	// Import polyfills FIRST before any other imports that might use Buffer/bitcoinjs-lib
	import '$lib/polyfills';
	import { onMount, onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';
	import { walletStore, walletManager } from '$lib/stores/wallet.store';
	import { escrow } from '$lib/utils/escrow/v1/escrow';
	import { determineContractState } from '$lib/utils/helpers/contractPermissions';
	import { loadContractsByAddress } from '$lib/utils/wallet/loadContractsByAddress';
	import type { EscrowData } from '$lib/types/wallet';
	import type { ContractPermissions } from '$lib/types/contract';
	import { EscrowStatus } from '$lib/utils/escrow/v1/escrow.enum';
	import { appStore } from '$lib/stores/app.store';
	import { getErrorMessage } from '$lib/utils/wallet/contractErrorHandler';
	import DebugContractCard from '$lib/components/contracts/DebugContractCard.svelte';
	import { get } from 'svelte/store';
	import IconRefresh from '~icons/mdi/refresh';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconChevronUp from '~icons/mdi/chevron-up';
	import IconContentCopy from '~icons/mdi/content-copy';
	import IconOpenInNew from '~icons/mdi/open-in-new';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';

	interface ContractWithPermissions extends EscrowData {
		permissions: ContractPermissions;
		isClient: boolean;
		isFreelancer: boolean;
		userAddress: string;
	}

	interface WalletAddressGroup {
		address: string;
		network: 'RSK' | 'BSC';
		contracts: ContractWithPermissions[];
		isExpanded: boolean;
		isLoading: boolean;
		error: string | null;
	}

	// State
	let contractsByAddress = $state<Map<string, WalletAddressGroup>>(new Map());
	let safetyOverride = $state(false);
	let executingActions = $state<Map<string, boolean>>(new Map());
	let expandedContracts = $state<Set<string>>(new Set());
	let showOverrideConfirm = $state(false);
	let initialLoadComplete = $state(false);

	// Get connected wallet addresses
	function getConnectedAddresses(): Array<{ address: string; network: 'RSK' | 'BSC' }> {
		const state = get(walletStore);
		const addresses: Array<{ address: string; network: 'RSK' | 'BSC' }> = [];

		if (state.rsk.connected && state.rsk.address) {
			addresses.push({ address: state.rsk.address, network: 'RSK' });
		}

		if (state.bsc.connected && state.bsc.address) {
			addresses.push({ address: state.bsc.address, network: 'BSC' });
		}

		return addresses;
	}

	// Calculate permissions for a contract
	async function calculatePermissions(
		contract: EscrowData,
		userAddress: string
	): Promise<{ permissions: ContractPermissions; isClient: boolean; isFreelancer: boolean }> {
		// Defensive check for undefined addresses
		const clientAddr = contract.client?.toLowerCase() || '';
		const freelancerAddr = contract.freelancer?.toLowerCase() || '';
		const userAddr = userAddress?.toLowerCase() || '';
		const isClient = clientAddr !== '' && clientAddr === userAddr;
		const isFreelancer = freelancerAddr !== '' && freelancerAddr === userAddr;

		// Load dispute proposal if contract is in dispute
		let disputeProposal = null;
		if (contract.status === EscrowStatus.InDispute) {
			try {
				disputeProposal = await escrow.getDisputeProposal(contract.id);
			} catch (error) {
				console.warn(`Failed to load dispute proposal for ${contract.id}:`, error);
			}
		}

		// Use determineContractState with minimal Nostr contract data
		// Create a minimal contract object that satisfies the NostrContract interface
		const minimalContract = {
			escrowId: contract.id,
			transactionHash: null,
			createdAt: contract.createdAt,
			content: {
				escrowId: contract.id,
				taskId: '',
				taskTitle: '',
				taskDescription: '',
				taskeePubkey: contract.freelancer,
				amount: contract.baseAmount,
				estimatedStartTime: contract.estimatedStartTime,
				estimatedCompletionTime: contract.estimatedCompletionTime
			}
		};

		const { permissions } = determineContractState(
			contract.status,
			[], // No status events for debug view
			minimalContract as any,
			contract,
			disputeProposal,
			false, // Not pending
			isClient,
			isFreelancer
		);

		return { permissions, isClient, isFreelancer };
	}

	// Load contracts for a specific address
	async function loadContractsForAddress(address: string, network: 'RSK' | 'BSC') {
		const key = `${network}-${address}`;

		const group = contractsByAddress.get(key);

		if (group) {
			// Create a new group object to trigger reactivity
			contractsByAddress.set(key, {
				...group,
				isLoading: true,
				error: null
			});
			// Reassign Map to trigger reactivity
			contractsByAddress = new Map(contractsByAddress);
		} else {
			contractsByAddress.set(key, {
				address,
				network,
				contracts: [],
				isExpanded: true,
				isLoading: true,
				error: null
			});
			// Reassign Map to trigger reactivity
			contractsByAddress = new Map(contractsByAddress);
		}

		try {
			const contracts = await loadContractsByAddress(address, 100, network);

			const contractsWithPermissions: ContractWithPermissions[] = await Promise.all(
				contracts.map(async (contract) => {
					const { permissions, isClient, isFreelancer } = await calculatePermissions(
						contract,
						address
					);
					return {
						...contract,
						permissions,
						isClient,
						isFreelancer,
						userAddress: address
					};
				})
			);
			const updatedGroup = contractsByAddress.get(key);
			if (updatedGroup) {
				// Create a new group object to trigger reactivity
				contractsByAddress.set(key, {
					...updatedGroup,
					contracts: contractsWithPermissions,
					isLoading: false,
					error: null
				});
				// Reassign Map to trigger reactivity
				contractsByAddress = new Map(contractsByAddress);
			}
		} catch (error) {
			const updatedGroup = contractsByAddress.get(key);
			if (updatedGroup) {
				// Create a new group object to trigger reactivity
				contractsByAddress.set(key, {
					...updatedGroup,
					isLoading: false,
					error: error instanceof Error ? error.message : 'Failed to load contracts'
				});
				// Reassign Map to trigger reactivity
				contractsByAddress = new Map(contractsByAddress);
			}
		}
	}

	// Load all contracts
	async function loadAllContracts() {
		// Reset cached contract to ensure fresh provider connection
		escrow.resetCachedContract();

		const addresses = getConnectedAddresses();

		if (addresses.length === 0) {
			initialLoadComplete = true;
			appStore.showErrorToast($t('debug.smart_contract.no_contracts'));
			return;
		}

		initialLoadComplete = false;

		try {
			await Promise.all(
				addresses.map(({ address, network }) => loadContractsForAddress(address, network))
			);
		} catch {
			// Error handled by loadContractsForAddress per-address
		} finally {
			initialLoadComplete = true;
		}
	}

	// Toggle address expansion
	function toggleAddress(key: string) {
		const group = contractsByAddress.get(key);
		if (group) {
			// Create a new group object to trigger reactivity
			contractsByAddress.set(key, {
				...group,
				isExpanded: !group.isExpanded
			});
			// Reassign Map to trigger reactivity
			contractsByAddress = new Map(contractsByAddress);
		}
	}

	// Toggle contract raw data
	function toggleContractRawData(contractId: string) {
		if (expandedContracts.has(contractId)) {
			expandedContracts.delete(contractId);
		} else {
			expandedContracts.add(contractId);
		}
		expandedContracts = new Set(expandedContracts);
	}

	// Execute contract function
	async function executeContractFunction(contractId: string, functionName: string, ...args: any[]) {
		const actionKey = `${contractId}-${functionName}`;
		executingActions.set(actionKey, true);
		executingActions = new Map(executingActions);

		try {
			switch (functionName) {
				case 'completeTask':
					await escrow.completeTask(contractId); // No Nostr event ID or attachments for debug
					break;
				case 'acceptTask':
					await escrow.acceptTask(contractId); // No Nostr event ID for debug
					break;
				case 'cancelEscrow':
					await escrow.cancelEscrow(contractId); // No Nostr event ID for debug
					break;
				case 'disputeTask':
					await escrow.disputeTask(contractId); // No Nostr event ID for debug
					break;
				case 'proposeResolution':
					// args[0] should be the freelancerAmount in RBTC
					await escrow.proposeResolution(contractId, args[0] || '0');
					break;
				case 'acceptProposal':
					await escrow.acceptProposal(contractId);
					break;
				case 'resolveAfterTimelock':
					await escrow.resolveAfterTimelock(contractId, args[0] || '0');
					break;
				default:
					throw new Error(`Unknown function: ${functionName}`);
			}

			appStore.showSuccessToast($t('debug.smart_contract.actions.success'));

			// Refresh contracts after successful execution
			await loadAllContracts();
		} catch (error) {
			console.error(`Error executing ${functionName}:`, error);
			const errorMessage = getErrorMessage(error);
			appStore.showErrorToast(
				$t('debug.smart_contract.actions.error', { values: { error: errorMessage } })
			);
		} finally {
			executingActions.delete(actionKey);
			executingActions = new Map(executingActions);
		}
	}

	// Copy address to clipboard
	async function copyAddress(address: string) {
		try {
			await navigator.clipboard.writeText(address);
			appStore.showSuccessToast($t('debug.smart_contract.copy_address') + ' copied');
		} catch (error) {
			console.error('Failed to copy address:', error);
		}
	}

	// Get network name
	function getNetworkName(network: 'RSK' | 'BSC'): string {
		const state = get(walletStore);
		const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
		if (network === 'RSK') {
			return `RSK ${rskNetwork === 'mainnet' ? 'Mainnet' : 'Testnet'}`;
		}
		return 'BSC Testnet'; // BSC is typically testnet in this context
	}

	// Format address for display
	function formatAddress(address: string): string {
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}

	// Get explorer URL for address
	function getExplorerUrl(address: string, network: 'RSK' | 'BSC'): string {
		const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
		const bscNetwork = import.meta.env.VITE_BSC_NETWORK || 'testnet';

		if (network === 'RSK') {
			if (rskNetwork === 'mainnet') {
				return `https://rootstock.blockscout.com/address/${address}`;
			} else {
				return `https://rootstock-testnet.blockscout.com/address/${address}`;
			}
		} else {
			if (bscNetwork === 'mainnet') {
				return `https://bscscan.com/address/${address}`;
			} else {
				return `https://testnet.bscscan.com/address/${address}`;
			}
		}
	}

	// Load safety override from localStorage and initialize wallet
	onMount(async () => {
		if (typeof window !== 'undefined') {
			const saved = localStorage.getItem('debug-safety-override');
			if (saved === 'true') {
				safetyOverride = true;
			}
		}

		// Initialize wallet first
		try {
			await walletManager.initialize();
		} catch (error) {
			appStore.showErrorToast(
				$t('debug.smart_contract.wallet_init_error', {
					values: { error: error instanceof Error ? error.message : 'Unknown error' }
				})
			);
		}

		// Load contracts after wallet is initialized
		loadAllContracts();
	});

	// Cleanup wallet on destroy
	onDestroy(async () => {
		await walletManager.cleanup();
	});

	// Save safety override to localStorage
	$effect(() => {
		if (typeof window !== 'undefined') {
			localStorage.setItem('debug-safety-override', safetyOverride.toString());
		}
	});

	// Handle safety override toggle change
	function handleSafetyOverrideChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const newValue = target.checked;

		// If disabling, allow it immediately
		if (!newValue) {
			safetyOverride = false;
			return;
		}

		// If enabling, prevent the change and show confirmation
		event.preventDefault();
		target.checked = false; // Reset checkbox
		showOverrideConfirm = true;
	}

	// Enable safety override
	function enableSafetyOverride() {
		safetyOverride = true;
		showOverrideConfirm = false;
		console.warn('Safety override enabled - all contract functions are now available');
	}
</script>

<svelte:head>
	<title>{$t('debug.smart_contract.title')} - BitTasker</title>
</svelte:head>

<div class="container mx-auto space-y-6 p-4">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold">{$t('debug.smart_contract.title')}</h1>
			<p class="text-base-content/60 text-sm">{$t('debug.smart_contract.subtitle')}</p>
		</div>
		<button
			class="btn btn-primary btn-sm"
			onclick={loadAllContracts}
			disabled={Array.from(contractsByAddress.values()).some((g) => g.isLoading)}
		>
			<IconRefresh class="h-4 w-4" />
			{$t('debug.smart_contract.refresh')}
		</button>
	</div>

	<!-- Wallet Address Groups -->
	{#if true}
		{@const hasAnyContracts =
			contractsByAddress.size > 0 &&
			Array.from(contractsByAddress.values()).some((g) => g.contracts.length > 0)}
		{@const isAnyLoading =
			contractsByAddress.size > 0 &&
			Array.from(contractsByAddress.values()).some((g) => g.isLoading)}
		{@const allLoaded =
			contractsByAddress.size === 0 ||
			Array.from(contractsByAddress.values()).every((g) => !g.isLoading)}

		{#if !initialLoadComplete || isAnyLoading}
			<!-- Loading State -->
			<div class="py-12 text-center">
				<span class="loading loading-spinner loading-md"></span>
				<p class="text-base-content/60 mt-4">{$t('debug.smart_contract.loading')}</p>
			</div>
		{:else if initialLoadComplete && allLoaded && !hasAnyContracts}
			<!-- No Contracts Found -->
			<div class="py-8 text-center">
				<div class="text-base-content/60 mb-3">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mx-auto h-12 w-12"
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
				<h3 class="mb-2 text-lg font-semibold">{$t('debug.smart_contract.no_contracts')}</h3>
				<p class="text-base-content/70 mb-3">{$t('debug.smart_contract.no_contracts_message')}</p>
				<button class="btn btn-primary" onclick={loadAllContracts}>
					<IconRefresh class="h-4 w-4" />
					{$t('debug.smart_contract.refresh')}
				</button>
			</div>
		{:else if hasAnyContracts}
			{#each Array.from(contractsByAddress.entries()) as [key, group]}
				<div class="card bg-base-100 shadow-xl">
					<div class="card-body">
						<!-- Wallet Address Header -->
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<button class="btn btn-ghost btn-sm" onclick={() => toggleAddress(key)}>
									{#if group.isExpanded}
										<IconChevronUp class="h-5 w-5" />
									{:else}
										<IconChevronDown class="h-5 w-5" />
									{/if}
								</button>
								<div>
									<div class="font-semibold">
										{$t('debug.smart_contract.wallet_address')}:
										<a
											href={getExplorerUrl(group.address, group.network)}
											target="_blank"
											rel="noopener noreferrer"
											class="link link-primary ml-1"
										>
											{formatAddress(group.address)}
										</a>
										<IconOpenInNew class="ml-1 inline h-4 w-4 text-base-content/60" />
									</div>
									<div class="text-base-content/60 text-sm">
										{getNetworkName(group.network)} • {$t('debug.smart_contract.contract_count', {
											values: { count: group.contracts.length }
										})}
									</div>
								</div>
							</div>
							<button
								class="btn btn-ghost btn-sm"
								onclick={() => copyAddress(group.address)}
								title={$t('debug.smart_contract.copy_address')}
							>
								<IconContentCopy class="h-5 w-5" />
							</button>
						</div>

						<!-- Contracts List -->
						{#if group.isExpanded}
							{#if group.isLoading}
								<div class="flex justify-center py-8">
									<span class="loading loading-spinner loading-md"></span>
								</div>
							{:else if group.error}
								<div class="alert alert-outline alert-error">
									<span>{group.error}</span>
									<button
										class="btn btn-sm"
										onclick={() => loadContractsForAddress(group.address, group.network)}
									>
										{$t('debug.smart_contract.refresh')}
									</button>
								</div>
							{:else if group.contracts.length === 0}
								<div class="py-8 text-center text-base-content/60">
									{$t('debug.smart_contract.no_contracts')}
								</div>
							{:else}
								<div class="mt-4 space-y-4">
									{#each group.contracts as contract (contract.id)}
										{@const isExecuting =
											executingActions.has(`${contract.id}-completeTask`) ||
											executingActions.has(`${contract.id}-acceptTask`) ||
											executingActions.has(`${contract.id}-cancelEscrow`) ||
											executingActions.has(`${contract.id}-disputeTask`) ||
											executingActions.has(`${contract.id}-proposeResolution`) ||
											executingActions.has(`${contract.id}-acceptProposal`) ||
											executingActions.has(`${contract.id}-resolveAfterTimelock`)}
										<DebugContractCard
											{contract}
											permissions={contract.permissions}
											isClient={contract.isClient}
											isFreelancer={contract.isFreelancer}
											isExpanded={expandedContracts.has(contract.id)}
											{safetyOverride}
											{isExecuting}
											onToggleRawData={() => toggleContractRawData(contract.id)}
											onExecuteFunction={(fn, ...args) =>
												executeContractFunction(contract.id, fn, ...args)}
										/>
									{/each}
								</div>
							{/if}
						{/if}
					</div>
				</div>
			{/each}
		{/if}
	{/if}

	<!-- Safety Override Toggle -->
	<div class="mt-8 border-t border-base-300 bg-base-100 p-4">
		<div class="container mx-auto">
			<div class="flex flex-col gap-4">
				<!-- Toggle Row (fixed layout, never changes) -->
				<div class="flex items-center gap-3">
					<label class="label cursor-pointer">
						<input
							type="checkbox"
							class="toggle toggle-warning"
							checked={safetyOverride}
							onchange={handleSafetyOverrideChange}
						/>
						<span class="label-text font-semibold">
							{$t('debug.smart_contract.safety_override.label')}
						</span>
					</label>
				</div>
				<!-- Alert Row (appears/disappears below, no layout shift) -->
				{#if safetyOverride}
					<div class="alert alert-outline alert-warning">
						<span class="text-sm">{$t('debug.smart_contract.safety_override.warning')}</span>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<!-- Safety Override Confirmation Modal -->
<ConfirmModal
	isOpen={showOverrideConfirm}
	title={$t('debug.smart_contract.safety_override.label')}
	message={$t('debug.smart_contract.safety_override.confirm_enable')}
	confirmText={$t('common.components.confirm_modal.confirm')}
	cancelText={$t('common.components.confirm_modal.cancel')}
	confirmButtonClass="btn-warning"
	onConfirm={enableSafetyOverride}
	onCancel={() => {
		showOverrideConfirm = false;
		// safetyOverride remains false since we prevented the toggle
	}}
/>
