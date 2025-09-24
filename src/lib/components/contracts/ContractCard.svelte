<script lang="ts">
	import { t } from 'svelte-i18n';
	import { locale } from 'svelte-i18n';
	import { formatStandardDate } from '$lib/utils/helpers/dateFormatter';
	import type { ContractWithEvents } from '$lib/types/contract';

	const { contract, onclick } = $props<{
		contract: ContractWithEvents;
		onclick?: () => void;
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

	// Get status badge class
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

	// Get next action text
	function getNextActionText(): string {
		if (contract.canComplete) return $t('dashboard.contracts.actions.complete_task');
		if (contract.canAccept) return $t('dashboard.contracts.actions.accept_work');
		if (contract.canDispute) return $t('dashboard.contracts.actions.dispute_work');
		if (contract.canPropose) return $t('dashboard.contracts.actions.propose_resolution');
		if (contract.canAcceptProposal) return $t('dashboard.contracts.actions.accept_proposal');
		if (contract.canCancel) return $t('dashboard.contracts.actions.cancel_contract');
		if (contract.canResolveTimelock) return $t('dashboard.contracts.actions.resolve_timelock');
		return '';
	}
</script>

<div
	class="card bg-base-100 border-base-300 hover:border-primary/20 group cursor-pointer border shadow-sm transition-all duration-200 hover:shadow-lg"
	{onclick}
	role="button"
	tabindex="0"
	onkeydown={(e) => e.key === 'Enter' && onclick?.()}
>
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
				<div class="badge {getStatusBadgeClass(contract.contract.status)} badge-sm">
					{$t(`dashboard.contracts.status.${contract.contract.status}`)}
				</div>
				<div class="badge {getRoleBadgeClass(contract.isClient)} badge-sm">
					{contract.isClient
						? $t('dashboard.contracts.role.client')
						: $t('dashboard.contracts.role.freelancer')}
				</div>
			</div>

			<!-- Mobile: Stacked badges -->
			<div class="flex flex-shrink-0 flex-col items-end gap-2 sm:hidden">
				<div class="badge {getStatusBadgeClass(contract.contract.status)} badge-sm">
					{$t(`dashboard.contracts.status.${contract.contract.status}`)}
				</div>
				<div class="badge {getRoleBadgeClass(contract.isClient)} badge-sm">
					{contract.isClient
						? $t('dashboard.contracts.role.client')
						: $t('dashboard.contracts.role.freelancer')}
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
					{formatRBTC(contract.contract.amount)} RBTC
				</div>
			</div>

			<div>
				<div class="text-base-content/60 mb-1 text-xs">
					{$t('dashboard.contracts.escrow_id')}
				</div>
				<div class="font-mono text-sm">
					#{contract.contract.escrowId}
				</div>
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
			<div class="place-self-end">
				{#if contract.canCancel}
					<button
						class="btn btn-error btn-xs"
						onclick={(e) => {
							e.stopPropagation();
							// Open drawer to show cancel action
							onclick?.();
						}}
						title={$t('dashboard.contracts.actions.cancel_contract')}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-3 w-3"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
						{$t('dashboard.contracts.actions.cancel_contract')}
					</button>
				{/if}

				{#if getAvailableActionsCount() > 1}
					<div class="badge badge-outline badge-md">
						+{getAvailableActionsCount() - 1}
						{$t('dashboard.contracts.more_actions')}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Click indicator -->
		<div
			class="absolute top-3 right-3 transform opacity-0 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100"
		>
			<div class="bg-primary/10 rounded-full p-1">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-primary h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</div>
		</div>
	</div>
</div>

<style>
	.card:hover .absolute {
		opacity: 1;
	}
</style>
