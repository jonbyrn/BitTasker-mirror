<script lang="ts">
	import type { ContractWithEvents } from '$lib/types/contract';
	import { t } from 'svelte-i18n';
	import { formatUSDWithSatsSync } from '$lib/utils/helpers/currencyFormatter';
	import UserProfile from '$lib/components/UserNostrBadge.svelte';
	import ContractActions from './ContractActions.svelte';

	const { contract, btcPrice, onclick, onActionComplete } = $props<{
		contract: ContractWithEvents;
		btcPrice: number;
		onclick?: () => void;
		onActionComplete?: () => void;
	}>();

	// Format RBTC amount
	function formatRBTC(amount: string): string {
		const num = parseFloat(amount);
		return num.toFixed(4);
	}

	// Format date with proper timestamp handling
	function formatDate(timestamp: number): string {
		// Handle invalid or zero timestamps
		if (!timestamp || timestamp <= 0) {
			return 'Not set';
		}

		// Convert to milliseconds if timestamp is in seconds
		const date = timestamp > 1000000000000 ? new Date(timestamp) : new Date(timestamp * 1000);

		// Check if date is valid
		if (isNaN(date.getTime())) {
			return 'Invalid date';
		}

		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	// Get role badge class
	function getRoleBadgeClass(isClient: boolean): string {
		return isClient ? 'badge-primary' : 'badge-secondary';
	}

	// Get available actions count
	function getAvailableActionsCount(): number {
		let count = 0;
		if (contract.canComplete) count++;
		if (contract.canAccept) count++;
		if (contract.canDispute) count++;
		if (contract.canPropose) count++;
		if (contract.canAcceptProposal) count++;
		if (contract.canCancel) count++;
		if (contract.canResolveTimelock) count++;
		return count;
	}

	/**
	 * Get status badge color classes based on task status
	 */
	export function getStatusColorClass(status: string): string {
		switch (status.toLowerCase()) {
			case 'cancelled':
				return 'badge-error'; // Red
			case 'active':
			case 'in_progress':
			case 'funded':
				return 'badge-info'; // Blue
			case 'completed':
			case 'resolved':
				return 'badge-success'; // Green
			case 'disputed':
			case 'in_dispute':
				return 'badge-warning'; // Yellow
			default:
				return 'badge-ghost';
		}
	}
</script>

<div class="card bg-base-100 border-base-300 border shadow-sm hover:border-primary/20 group cursor-pointer transition-all duration-200 hover:shadow-lg">
	<div class="card-body p-4">
		<!-- Header -->
		<div class="flex items-start justify-between gap-4">
			<div class="min-w-0 flex-1">
				<h3 class="truncate text-base font-semibold" title={contract.contract.taskTitle}>
					{contract.contract.taskTitle}
				</h3>
				<p class="text-base-content/70 mt-1 line-clamp-2 text-sm">
					{contract.contract.taskDescription}
				</p>
			</div>

			<!-- Desktop: Side by side badges -->
			<div class="hidden flex-shrink-0 items-center gap-2 sm:flex">
				<div class="badge {getStatusColorClass(contract.contract.status)} badge-sm">
					{$t(`dashboard.contracts.status.${contract.contract.status}`)}
				</div>
				<div class="badge {getRoleBadgeClass(contract.isClient)} badge-sm">
					{contract.isClient ? $t('dashboard.client') : $t('dashboard.freelancer')}
				</div>
			</div>

			<!-- Mobile: Stacked badges -->
			<div class="flex flex-shrink-0 flex-col items-end gap-2 sm:hidden">
				<div class="badge {getStatusColorClass(contract.contract.status)} badge-sm">
					{$t(`dashboard.contracts.status.${contract.contract.status}`)}
				</div>
				<div class="badge {getRoleBadgeClass(contract.isClient)} badge-sm">
					{contract.isClient ? $t('dashboard.client') : $t('dashboard.freelancer')}
				</div>
			</div>
		</div>

		<!-- Contract Details -->
		<div class="mt-4 grid grid-cols-2 gap-4">
			<div>
				<div class="text-base-content/60 mb-1 text-xs">
					{$t('dashboard.contracts.amount')}
				</div>
				<div class="font-semibold">
					{btcPrice > 0 ? formatUSDWithSatsSync(contract.contract.amount, btcPrice) : `${formatRBTC(contract.contract.amount)} RBTC`}
				</div>
			</div>

			<!-- User Info -->
			<div>
				<div class="text-base-content/60 mb-2 text-xs">
					{contract.isClient ? $t('dashboard.freelancer') : $t('dashboard.client')}
				</div>
				<UserProfile
					npub={contract.isClient
						? contract.contract.freelancerPubkey
						: contract.contract.clientPubkey}
					size="sm"
				/>
			</div>
		</div>

		<!-- Timeline -->
		<div class="mt-3 grid grid-cols-2 gap-4">
			<div>
				<div class="text-base-content/60 mb-1 text-xs">
					{$t('dashboard.contracts.created')}
				</div>
				<div class="text-sm">
					{formatDate(contract.contract.createdAt)}
				</div>
			</div>

			<div>
				<div class="text-base-content/60 mb-1 text-xs">
					{$t('dashboard.contracts.deadline')}
				</div>
				<div class="text-sm">
					{formatDate(contract.contract.estimatedCompletionTime)}
				</div>
			</div>
		</div>

		<!-- Status Updates Count -->
		{#if contract.statusEvents.length > 0}
			<div class="mt-3">
				<div class="text-base-content/60 mb-1 text-xs">
					{$t('dashboard.contracts.status_updates')}
				</div>
				<div class="text-sm">
					{contract.statusEvents.length}
					{$t('dashboard.contracts.updates')}
				</div>
			</div>
		{/if}

		<!-- Actions Footer -->
		{#if getAvailableActionsCount() > 0}
			<div class="divider my-3"></div>
			<div class="flex justify-end items-center flex-wrap gap-2">
				<ContractActions 
					{contract} 
					{onActionComplete}
					containerClass="flex flex-row-reverse flex-wrap gap-2 w-full sm:w-fit"
					openDrawer={() => onclick?.()}
					isInline={true}
				/>
				{#if onclick}
					<button
						class="btn btn-outline btn-sm w-full sm:w-fit"
						onclick={() => onclick?.()}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						{$t('dashboard.contracts.view_details')}
					</button>
				{/if}
			</div>
		{:else if onclick}
			<div class="divider my-3"></div>
			<div class="flex justify-end">
				<button
					class="btn btn-outline btn-sm"
					onclick={() => onclick?.()}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					{$t('dashboard.contracts.view_details')}
				</button>
			</div>
		{/if}
	</div>
</div>