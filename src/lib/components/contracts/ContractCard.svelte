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

	// Format date using standardized formatting with reactive locale
	function formatDate(timestamp: number): string {
		return formatStandardDate(new Date(timestamp), $locale || 'en');
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
	class="card bg-base-100 shadow-sm border border-base-300 hover:shadow-md transition-shadow cursor-pointer"
	onclick={onclick}
	role="button"
	tabindex="0"
	onkeydown={(e) => e.key === 'Enter' && onclick?.()}
>
	<div class="card-body p-4">
		<!-- Header -->
		<div class="flex items-start justify-between gap-4">
			<div class="flex-1 min-w-0">
				<h3 class="font-semibold text-base truncate" title={contract.contract.taskTitle}>
					{contract.contract.taskTitle}
				</h3>
				<p class="text-sm text-base-content/70 line-clamp-2 mt-1">
					{contract.contract.taskDescription}
				</p>
			</div>
			
			<div class="flex flex-col items-end gap-2 flex-shrink-0">
				<!-- Status Badge -->
				<div class="badge {getStatusBadgeClass(contract.contract.status)} badge-sm">
					{$t(`dashboard.contracts.status.${contract.contract.status}`)}
				</div>
				
				<!-- Role Badge -->
				<div class="badge {getRoleBadgeClass(contract.isClient)} badge-sm">
					{contract.isClient 
						? $t('dashboard.contracts.role.client') 
						: $t('dashboard.contracts.role.freelancer')}
				</div>
			</div>
		</div>

		<!-- Contract Details -->
		<div class="grid grid-cols-2 gap-4 mt-4">
			<div>
				<div class="text-xs text-base-content/60 mb-1">
					{$t('dashboard.contracts.amount')}
				</div>
				<div class="font-semibold">
					{formatRBTC(contract.contract.amount)} RBTC
				</div>
			</div>
			
			<div>
				<div class="text-xs text-base-content/60 mb-1">
					{$t('dashboard.contracts.escrow_id')}
				</div>
				<div class="font-mono text-sm">
					#{contract.contract.escrowId}
				</div>
			</div>
		</div>

		<!-- Timeline -->
		<div class="grid grid-cols-2 gap-4 mt-3">
			<div>
				<div class="text-xs text-base-content/60 mb-1">
					{$t('dashboard.contracts.created')}
				</div>
				<div class="text-sm">
					{formatDate(contract.contract.createdAt)}
				</div>
			</div>
			
			<div>
				<div class="text-xs text-base-content/60 mb-1">
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
				<div class="text-xs text-base-content/60 mb-1">
					{$t('dashboard.contracts.status_updates')}
				</div>
				<div class="text-sm">
					{contract.statusEvents.length} {$t('dashboard.contracts.updates')}
				</div>
			</div>
		{/if}

		<!-- Actions Footer -->
		{#if getAvailableActionsCount() > 0}
			<div class="divider my-3"></div>
			<div class="flex items-center justify-between">
				<div class="text-sm text-base-content/70">
					{getNextActionText()}
				</div>
				
				{#if getAvailableActionsCount() > 1}
					<div class="badge badge-outline badge-sm">
						+{getAvailableActionsCount() - 1} {$t('dashboard.contracts.more_actions')}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Click indicator -->
		<div class="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
			</svg>
		</div>
	</div>
</div>

<style>
	.card:hover .absolute {
		opacity: 1;
	}
</style>
