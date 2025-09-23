<script lang="ts">
	import { t } from 'svelte-i18n';
	import { locale } from 'svelte-i18n';
	import { formatStandardDateTime } from '$lib/utils/helpers/dateFormatter';
	import type { ContractWithEvents } from '$lib/types/contract';
	import ContractTimeline from './ContractTimeline.svelte';
	import ContractActions from './ContractActions.svelte';

	const { contract, isOpen, onClose, onUpdate } = $props<{
		contract: ContractWithEvents;
		isOpen: boolean;
		onClose: () => void;
		onUpdate: () => void;
	}>();

	// Format RBTC amount
	function formatRBTC(amount: string): string {
		const num = parseFloat(amount);
		return num.toFixed(4);
	}

	// Format date using standardized formatting with reactive locale
	function formatDate(timestamp: number): string {
		return formatStandardDateTime(new Date(timestamp), $locale || 'en');
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

	// Handle action completion
	function handleActionComplete() {
		onUpdate();
	}

	// Handle modal close
	function handleClose() {
		onClose();
	}

	// Handle backdrop click
	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			handleClose();
		}
	}

	// Handle escape key
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			handleClose();
		}
	}
</script>

{#if isOpen}
	<!-- Modal backdrop -->
	<div 
		class="modal modal-open"
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
		role="dialog"
        tabindex="0"
		aria-modal="true"
		aria-labelledby="contract-modal-title"
	>
		<div class="modal-box w-11/12 max-w-4xl max-h-[90vh] overflow-y-auto">
			<!-- Header -->
			<div class="flex items-start justify-between gap-4 mb-6">
				<div class="flex-1 min-w-0">
					<h3 id="contract-modal-title" class="font-bold text-lg mb-2">
						{contract.contract.taskTitle}
					</h3>
					<div class="flex items-center gap-2 mb-3">
						<div class="badge {getStatusBadgeClass(contract.contract.status)}">
							{$t(`dashboard.contracts.status.${contract.contract.status}`)}
						</div>
						<div class="badge {contract.isClient ? 'badge-primary' : 'badge-secondary'}">
							{contract.isClient 
								? $t('dashboard.contracts.role.client') 
								: $t('dashboard.contracts.role.freelancer')}
						</div>
					</div>
				</div>
				
				<button 
					class="btn btn-sm btn-circle btn-ghost"
					onclick={handleClose}
					aria-label={$t('dashboard.contracts.close_modal')}
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Contract Details Grid -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
				<!-- Left Column: Contract Info -->
				<div class="space-y-4">
					<div class="card bg-base-200">
						<div class="card-body p-4">
							<h4 class="font-semibold mb-3">{$t('dashboard.contracts.contract_details')}</h4>
							
							<div class="space-y-3">
								<div class="flex justify-between">
									<span class="text-base-content/70">{$t('dashboard.contracts.amount')}:</span>
									<span class="font-semibold">{formatRBTC(contract.contract.amount)} RBTC</span>
								</div>
								
								<div class="flex justify-between">
									<span class="text-base-content/70">{$t('dashboard.contracts.escrow_id')}:</span>
									<span class="font-mono text-sm">#{contract.contract.escrowId}</span>
								</div>
								
								<div class="flex justify-between">
									<span class="text-base-content/70">{$t('dashboard.contracts.task_id')}:</span>
									<span class="font-mono text-sm">#{contract.contract.taskId}</span>
								</div>
								
								<div class="flex justify-between">
									<span class="text-base-content/70">{$t('dashboard.contracts.created')}:</span>
									<span class="text-sm">{formatDate(contract.contract.createdAt)}</span>
								</div>
							</div>
						</div>
					</div>

					<!-- Timeline -->
					<div class="card bg-base-200">
						<div class="card-body p-4">
							<h4 class="font-semibold mb-3">{$t('dashboard.contracts.timeline.label')}</h4>
							
							<div class="space-y-3">
								<div class="flex justify-between">
									<span class="text-base-content/70">{$t('dashboard.contracts.estimated_start')}:</span>
									<span class="text-sm">{formatDate(contract.contract.estimatedStartTime)}</span>
								</div>
								
								<div class="flex justify-between">
									<span class="text-base-content/70">{$t('dashboard.contracts.estimated_completion')}:</span>
									<span class="text-sm">{formatDate(contract.contract.estimatedCompletionTime)}</span>
								</div>
							</div>
						</div>
					</div>

					<!-- Task Description -->
					<div class="card bg-base-200">
						<div class="card-body p-4">
							<h4 class="font-semibold mb-3">{$t('dashboard.contracts.task_description')}</h4>
							<p class="text-sm text-base-content/80 leading-relaxed">
								{contract.contract.taskDescription}
							</p>
						</div>
					</div>
				</div>

				<!-- Right Column: Actions & Status -->
				<div class="space-y-4">
					<!-- Available Actions -->
					<ContractActions 
						{contract} 
						onActionComplete={handleActionComplete}
					/>

					<!-- Status Timeline -->
					<div class="card bg-base-200">
						<div class="card-body p-4">
							<h4 class="font-semibold mb-3">
								{$t('dashboard.contracts.timeline.status_timeline')}
								<span class="badge badge-outline badge-sm ml-2">
									{contract.statusEvents.length}
								</span>
							</h4>
							
							<ContractTimeline statusEvents={contract.statusEvents} />
						</div>
					</div>
				</div>
			</div>

			<!-- Additional Info -->
			<div class="border-t border-base-300 pt-4">
				<details class="collapse collapse-arrow">
					<summary class="collapse-title text-sm font-medium">
						{$t('dashboard.contracts.technical_details')}
					</summary>
					<div class="collapse-content">
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
							<div>
								<span class="text-base-content/60">{$t('dashboard.contracts.client_pubkey')}:</span>
								<div class="font-mono break-all mt-1">{contract.contract.clientPubkey}</div>
							</div>
							<div>
								<span class="text-base-content/60">{$t('dashboard.contracts.freelancer_pubkey')}:</span>
								<div class="font-mono break-all mt-1">{contract.contract.freelancerPubkey}</div>
							</div>
							<div>
								<span class="text-base-content/60">{$t('dashboard.contracts.contract_event_id')}:</span>
								<div class="font-mono break-all mt-1">{contract.contractEvent.id}</div>
							</div>
							<div>
								<span class="text-base-content/60">{$t('dashboard.contracts.currency')}:</span>
								<div class="mt-1">{contract.contract.currency}</div>
							</div>
						</div>
					</div>
				</details>
			</div>

			<!-- Modal Actions -->
			<div class="modal-action">
				<button class="btn btn-outline" onclick={handleClose}>
					{$t('dashboard.contracts.close')}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-open {
		animation: modal-pop 0.2s ease-out;
	}

	@keyframes modal-pop {
		0% {
			opacity: 0;
			transform: scale(0.9);
		}
		100% {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>
