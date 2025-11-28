<script lang="ts">
	import type { EscrowData } from '$lib/types/wallet';
	import type { ContractPermissions } from '$lib/types/contract';
	import { EscrowStatus } from '$lib/utils/enums/wallet.enum';
	import { getStatusColorClass, getStatusTranslationKey } from '$lib/utils/helpers/contractStatusFormatter';
	import { t } from 'svelte-i18n';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import { RSK_NETWORKS, BSC_NETWORKS } from '$lib/utils/wallet/networkConfig';
	import IconOpenInNew from '~icons/mdi/open-in-new';

	const {
		contract,
		permissions,
		isClient,
		isFreelancer,
		currentAddress,
		isExpanded,
		safetyOverride,
		isExecuting = false,
		onToggleRawData,
		onExecuteFunction
	} = $props<{
		contract: EscrowData;
		permissions: ContractPermissions;
		isClient: boolean;
		isFreelancer: boolean;
		currentAddress: string;
		isExpanded: boolean;
		safetyOverride: boolean;
		isExecuting?: boolean;
		onToggleRawData: () => void;
		onExecuteFunction: (functionName: string, ...args: any[]) => Promise<void>;
	}>();

	// Modal state
	let showConfirmModal = $state(false);
	let pendingFunction = $state<{ name: string; args: any[] } | null>(null);
	let showResolutionForm = $state(false);
	let proposedFreelancerAmount = $state('');

	// Check if contract has zero value
	function hasZeroValue(): boolean {
		const baseAmount = parseFloat(contract.baseAmount || '0');
		return baseAmount === 0;
	}

	// Determine if function button should be disabled
	function isFunctionDisabled(functionName: string): boolean {
		// Always disable if contract value is zero
		if (hasZeroValue()) return true;

		if (safetyOverride) return false; // Override enabled - all functions available (except zero value)

		switch (functionName) {
			case 'completeTask':
				return !permissions.canComplete;
			case 'acceptTask':
				return !permissions.canAccept;
			case 'cancelEscrow':
				return !permissions.canCancel;
			case 'disputeTask':
				return !permissions.canDispute;
			case 'proposeResolution':
				return !permissions.canPropose;
			case 'acceptProposal':
				return !permissions.canAcceptProposal;
			case 'resolveAfterTimelock':
				return !permissions.canResolveTimelock;
			default:
				return true;
		}
	}

	// Get tooltip text for disabled buttons
	function getDisabledTooltip(functionName: string): string {
		if (hasZeroValue()) {
			return $t('debug.smart_contract.actions.disabled_zero_value');
		}

		if (safetyOverride) return '';

		switch (functionName) {
			case 'completeTask':
				return !isFreelancer
					? $t('debug.smart_contract.actions.disabled_tooltip', {
							values: { reason: 'Only freelancer can complete tasks' }
						})
					: $t('debug.smart_contract.actions.disabled_tooltip', {
							values: { reason: 'Task completion not available in current contract state' }
						});
			case 'acceptTask':
				return !isClient
					? $t('debug.smart_contract.actions.disabled_tooltip', {
							values: { reason: 'Only client can accept tasks' }
						})
					: $t('debug.smart_contract.actions.disabled_tooltip', {
							values: { reason: 'Task acceptance not available in current contract state' }
						});
			default:
				return $t('debug.smart_contract.actions.disabled_tooltip', {
					values: { reason: 'Function not available in current contract state' }
				});
		}
	}

	// Format address
	function formatAddress(address: string): string {
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}

	// Format timestamp
	function formatTimestamp(timestamp: number): string {
		if (!timestamp || timestamp <= 0) {
			return 'Not set';
		}

		const date = timestamp > 1000000000000 ? new Date(timestamp) : new Date(timestamp * 1000);

		if (isNaN(date.getTime())) {
			return 'Invalid date';
		}

		return date.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Convert RBTC to sats (1 RBTC = 100,000,000 sats)
	function rbtcToSats(rbtcAmount: string | number): bigint {
		const rbtc = typeof rbtcAmount === 'string' ? parseFloat(rbtcAmount) : rbtcAmount;
		if (isNaN(rbtc)) return 0n;
		// RBTC has 18 decimals, so we need to multiply by 10^18, then divide by 10^10 to get sats
		// 1 RBTC = 1 BTC = 100,000,000 sats
		return BigInt(Math.round(rbtc * 100_000_000));
	}

	// Format sats amount
	function formatSats(amount: string | number): string {
		const sats = rbtcToSats(amount);
		return sats.toLocaleString('en-US');
	}

	// Get explorer URL for address
	function getExplorerUrl(address: string, network: 'RSK' | 'BSC'): string {
		const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
		const bscNetwork = import.meta.env.VITE_BSC_NETWORK || 'testnet';
		
		if (network === 'RSK') {
			const config = RSK_NETWORKS[rskNetwork as keyof typeof RSK_NETWORKS];
			// RSK explorer uses Blockscout format
			if (rskNetwork === 'mainnet') {
				return `https://rootstock.blockscout.com/address/${address}`;
			} else {
				return `https://rootstock-testnet.blockscout.com/address/${address}`;
			}
		} else {
			const config = BSC_NETWORKS[bscNetwork as keyof typeof BSC_NETWORKS];
			if (bscNetwork === 'mainnet') {
				return `https://bscscan.com/address/${address}`;
			} else {
				return `https://testnet.bscscan.com/address/${address}`;
			}
		}
	}

	// Handle function execution
	async function handleExecuteFunction(functionName: string, ...args: any[]) {
		if (safetyOverride) {
			// Skip confirmation if override is enabled
			await onExecuteFunction(contract.id, functionName, ...args);
		} else {
			// Show confirmation modal
			pendingFunction = { name: functionName, args };
			showConfirmModal = true;
		}
	}

	// Confirm and execute
	async function confirmExecute() {
		if (pendingFunction) {
			showConfirmModal = false;
			await onExecuteFunction(contract.id, pendingFunction.name, ...pendingFunction.args);
			pendingFunction = null;
		}
	}

	// Handle propose resolution
	async function handleProposeResolution() {
		if (!proposedFreelancerAmount) {
			return;
		}

		const freelancerAmountSats = parseInt(proposedFreelancerAmount);
		if (isNaN(freelancerAmountSats) || freelancerAmountSats <= 0) {
			return;
		}

		// Convert sats to RBTC (sats / 100,000,000)
		const freelancerAmountRBTC = (freelancerAmountSats / 100_000_000).toFixed(8);

		// Pass freelancerAmount as first argument after function name
		await handleExecuteFunction('proposeResolution', freelancerAmountRBTC);
		showResolutionForm = false;
		proposedFreelancerAmount = '';
	}
</script>

<div class="bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg">
	<div class="card-body">
		<!-- Header -->
		<div class="flex items-center justify-between">
			<div class="flex-1">
				<h3 class="card-title text-lg">
					{$t('debug.smart_contract.contract_id')}: {contract.id}
				</h3>
				<div class="mt-2 flex flex-wrap gap-2">
					<div class="badge {getStatusColorClass(contract.status)} badge-sm">
						{$t(getStatusTranslationKey(contract.status))}
					</div>
					<div class="badge {isClient ? 'badge-primary' : 'badge-secondary'} badge-sm">
						{isClient ? $t('debug.smart_contract.role_client') : $t('debug.smart_contract.role_freelancer')}
					</div>
				</div>
			</div>
			<div class="text-right">
				<div class="text-lg font-bold">{formatSats(contract.baseAmount)} sats</div>
			</div>
		</div>

		<!-- Contract Details -->
		<div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
			<div>
				<div class="label-text text-xs text-base-content/60">{$t('debug.smart_contract.client')}</div>
				<div class="flex items-center gap-2">
					<a
						href={getExplorerUrl(contract.client, 'RSK')}
						target="_blank"
						rel="noopener noreferrer"
						class="font-mono text-sm link link-primary"
					>
						{formatAddress(contract.client)}
					</a>
					<IconOpenInNew class="h-4 w-4 text-base-content/60" />
				</div>
			</div>
			<div>
				<div class="label-text text-xs text-base-content/60">{$t('debug.smart_contract.freelancer')}</div>
				<div class="flex items-center gap-2">
					<a
						href={getExplorerUrl(contract.freelancer, 'RSK')}
						target="_blank"
						rel="noopener noreferrer"
						class="font-mono text-sm link link-primary"
					>
						{formatAddress(contract.freelancer)}
					</a>
					<IconOpenInNew class="h-4 w-4 text-base-content/60" />
				</div>
			</div>
			<div>
				<div class="label-text text-xs text-base-content/60">{$t('debug.smart_contract.created_at')}</div>
				<div class="text-sm">{formatTimestamp(contract.createdAt)}</div>
			</div>
			<div>
				<div class="label-text text-xs text-base-content/60">{$t('debug.smart_contract.estimated_start')}</div>
				<div class="text-sm">{formatTimestamp(contract.estimatedStartTime)}</div>
			</div>
			<div>
				<div class="label-text text-xs text-base-content/60">{$t('debug.smart_contract.estimated_completion')}</div>
				<div class="text-sm">{formatTimestamp(contract.estimatedCompletionTime)}</div>
			</div>
			<div>
				<div class="label-text text-xs text-base-content/60">{$t('debug.smart_contract.timelock_expiry')}</div>
				<div class="text-sm">{formatTimestamp(contract.timelockExpiry)}</div>
			</div>
		</div>

		<!-- Action Buttons -->
		<div class="mt-4 border-t border-base-300 pt-4">
			<h4 class="mb-3 text-sm font-semibold">{$t('debug.smart_contract.actions.title')}</h4>
			<div class="flex flex-wrap gap-2">
				<!-- Complete Task -->
				{#if safetyOverride || isFreelancer}
					<button
						class="btn btn-success btn-sm"
						disabled={isFunctionDisabled('completeTask') || isExecuting}
						title={isFunctionDisabled('completeTask') ? getDisabledTooltip('completeTask') : ''}
						onclick={() => handleExecuteFunction('completeTask', contract.id)}
					>
						{#if isExecuting}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						{$t('debug.smart_contract.actions.complete_task')}
					</button>
				{/if}

				<!-- Accept Task -->
				{#if safetyOverride || isClient}
					<button
						class="btn btn-success btn-sm"
						disabled={isFunctionDisabled('acceptTask') || isExecuting}
						title={isFunctionDisabled('acceptTask') ? getDisabledTooltip('acceptTask') : ''}
						onclick={() => handleExecuteFunction('acceptTask', contract.id)}
					>
						{#if isExecuting}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						{$t('debug.smart_contract.actions.accept_task')}
					</button>
				{/if}

				<!-- Cancel Escrow -->
				{#if safetyOverride || isClient}
					<button
						class="btn btn-error btn-sm"
						disabled={isFunctionDisabled('cancelEscrow') || isExecuting}
						title={isFunctionDisabled('cancelEscrow') ? getDisabledTooltip('cancelEscrow') : ''}
						onclick={() => handleExecuteFunction('cancelEscrow', contract.id)}
					>
						{#if isExecuting}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						{$t('debug.smart_contract.actions.cancel_contract')}
					</button>
				{/if}

				<!-- Dispute Task -->
				{#if safetyOverride || isClient}
					<button
						class="btn btn-error btn-sm"
						disabled={isFunctionDisabled('disputeTask') || isExecuting}
						title={isFunctionDisabled('disputeTask') ? getDisabledTooltip('disputeTask') : ''}
						onclick={() => handleExecuteFunction('disputeTask', contract.id)}
					>
						{#if isExecuting}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						{$t('debug.smart_contract.actions.dispute_task')}
					</button>
				{/if}

				<!-- Propose Resolution -->
				{#if safetyOverride || permissions.canPropose}
					{#if !showResolutionForm}
						<button
							class="btn btn-warning btn-sm"
							disabled={isFunctionDisabled('proposeResolution') || isExecuting}
							title={isFunctionDisabled('proposeResolution') ? getDisabledTooltip('proposeResolution') : ''}
							onclick={() => (showResolutionForm = true)}
						>
							{$t('debug.smart_contract.actions.propose_resolution')}
						</button>
					{:else}
						<div class="w-full space-y-2 rounded-lg bg-base-200 p-3">
							<div class="label-text text-xs">
								{$t('debug.smart_contract.actions.propose_resolution_form.freelancer_amount')}
							</div>
							<input
								type="number"
								step="1"
								bind:value={proposedFreelancerAmount}
								class="input input-bordered input-sm w-full"
								placeholder="0"
							/>
							<div class="flex gap-2">
								<button
									class="btn btn-warning btn-sm"
									onclick={handleProposeResolution}
									disabled={!proposedFreelancerAmount || isExecuting}
								>
									{$t('debug.smart_contract.actions.propose_resolution_form.submit')}
								</button>
								<button
									class="btn btn-ghost btn-sm"
									onclick={() => {
										showResolutionForm = false;
										proposedFreelancerAmount = '';
									}}
								>
									{$t('debug.smart_contract.actions.propose_resolution_form.cancel')}
								</button>
							</div>
						</div>
					{/if}
				{/if}

				<!-- Accept Proposal -->
				{#if safetyOverride || permissions.canAcceptProposal}
					<button
						class="btn btn-success btn-sm"
						disabled={isFunctionDisabled('acceptProposal') || isExecuting}
						title={isFunctionDisabled('acceptProposal') ? getDisabledTooltip('acceptProposal') : ''}
						onclick={() => handleExecuteFunction('acceptProposal', contract.id)}
					>
						{#if isExecuting}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						{$t('debug.smart_contract.actions.accept_proposal')}
					</button>
				{/if}

				<!-- Resolve After Timelock -->
				{#if safetyOverride || permissions.canResolveTimelock}
					<button
						class="btn btn-info btn-sm"
						disabled={isFunctionDisabled('resolveAfterTimelock') || isExecuting}
						title={isFunctionDisabled('resolveAfterTimelock') ? getDisabledTooltip('resolveAfterTimelock') : ''}
						onclick={() => handleExecuteFunction('resolveAfterTimelock', contract.id)}
					>
						{#if isExecuting}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						{$t('debug.smart_contract.actions.resolve_timelock')}
					</button>
				{/if}
			</div>
		</div>

		<!-- Raw Data Toggle -->
		<div class="mt-4 border-t border-base-300 pt-4">
			<button
				class="btn btn-ghost btn-sm w-full"
				onclick={onToggleRawData}
			>
				{$t('debug.smart_contract.raw_data')}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4 transition-transform {isExpanded ? 'rotate-180' : ''}"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
				</svg>
			</button>

			{#if isExpanded}
				<div class="mt-3 rounded-lg bg-base-200 p-4">
					<pre class="overflow-x-auto text-xs"><code>{JSON.stringify({ contract, permissions }, (key, value) => {
						// Handle BigInt serialization
						if (typeof value === 'bigint') {
							return value.toString();
						}
						return value;
					}, 2)}</code></pre>
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Confirmation Modal -->
<ConfirmModal
	isOpen={showConfirmModal}
	title={$t('debug.smart_contract.actions.confirm_execution', {
		values: { function: pendingFunction?.name || '' }
	})}
	message={$t('debug.smart_contract.actions.confirm_execution', {
		values: { function: pendingFunction?.name || '' }
	})}
	confirmText={$t('common.components.confirm_modal.confirm')}
	cancelText={$t('common.components.confirm_modal.cancel')}
	confirmButtonClass="btn-primary"
	onConfirm={confirmExecute}
	onCancel={() => {
		showConfirmModal = false;
		pendingFunction = null;
	}}
/>

