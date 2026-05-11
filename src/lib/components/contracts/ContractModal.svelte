<!--
 * @deprecated This component uses v1 escrow patterns with ContractWithEvents.
 * Use the NDK-based contract flow (ContractDrawerNDK + ContractCardNDK) instead.
 * This file will be removed in a future release.
-->
<script lang="ts">
	/**
	 * @deprecated This file is deprecated. Use ContractDrawerNDK.svelte instead.
	 */
	import { t } from 'svelte-i18n';
	import { locale } from 'svelte-i18n';
	import { formatStandardDateTime } from '$lib/utils/helpers/dateFormatter';
	import type { ContractWithEvents } from '$lib/types/contract';
	import ContractTimeline from './ContractTimeline.svelte';
	import ContractActions from './ContractActions.svelte';
	import { contractStore } from '$lib/stores/contract.store';

	const {
		contract,
		isOpen,
		onClose,
		onUpdate: _onUpdate
	} = $props<{
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

{#if isOpen && contract}
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
		<div class="modal-box max-h-[85vh] w-11/12 max-w-4xl overflow-y-auto">
			<!-- Header -->
			<div class="mb-6 flex items-start justify-between gap-4">
				<div class="min-w-0 flex-1">
					<h3 id="contract-modal-title" class="mb-2 text-lg font-bold">
						{contractStore.getContractKey(contract, 'taskTitle')}
					</h3>
					<div class="mb-3 flex items-center gap-2">
						<div class="badge {getStatusBadgeClass(contract.status)}">
							{$t(`dashboard.contracts.status.${contract.status}`)}
						</div>
						<div class="badge {contract.isClient ? 'badge-primary' : 'badge-secondary'}">
							{contract.isClient ? $t('dashboard.client') : $t('dashboard.freelancer')}
						</div>
					</div>
				</div>

				<button
					class="btn btn-sm btn-circle btn-ghost"
					onclick={handleClose}
					aria-label={$t('dashboard.contracts.close_modal')}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
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
				</button>
			</div>

			<!-- Contract Details Grid -->
			<div class="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
				<!-- Left Column: Contract Info -->
				<div class="space-y-4">
					<div class="card bg-base-200">
						<div class="card-body p-4">
							<h4 class="mb-3 font-semibold">{$t('dashboard.contracts.contract_details')}</h4>

							<div class="space-y-3">
								<div class="flex justify-between">
									<span class="text-base-content/70">{$t('dashboard.contracts.amount')}:</span>
									<span class="font-semibold"
										>{formatRBTC(contractStore.getContractKey(contract, 'amount') as string)} RBTC</span
									>
								</div>

								<div class="flex justify-between">
									<span class="text-base-content/70">{$t('dashboard.contracts.escrow_id')}:</span>
									<span class="font-mono text-sm">
										#{contract.escrowData.id}
									</span>
								</div>

								<div class="flex justify-between">
									<span class="text-base-content/70">{$t('dashboard.contracts.task_id')}:</span>
									<span class="font-mono text-sm"
										>#{contractStore.getContractKey(contract, 'taskId')}</span
									>
								</div>

								<div class="flex justify-between">
									<span class="text-base-content/70">{$t('dashboard.contracts.created')}:</span>
									<span class="text-sm">{formatDate(contract.contractEvent.created_at)}</span>
								</div>
							</div>
						</div>
					</div>

					<!-- Timeline -->
					<div class="card bg-base-200">
						<div class="card-body p-4">
							<h4 class="mb-3 font-semibold">{$t('dashboard.contracts.timeline.label')}</h4>

							<div class="space-y-3">
								<div class="flex justify-between">
									<span class="text-base-content/70"
										>{$t('dashboard.contracts.estimated_start')}:</span
									>
									<span class="text-sm"
										>{formatDate(
											contractStore.getContractKey(contract, 'estimatedStartTime') as number
										)}</span
									>
								</div>

								<div class="flex justify-between">
									<span class="text-base-content/70"
										>{$t('dashboard.contracts.estimated_completion')}:</span
									>
									<span class="text-sm"
										>{formatDate(
											contractStore.getContractKey(contract, 'estimatedCompletionTime') as number
										)}</span
									>
								</div>
							</div>
						</div>
					</div>

					<!-- Task Description -->
					<div class="card bg-base-200">
						<div class="card-body p-4">
							<h4 class="mb-3 font-semibold">{$t('dashboard.contracts.task_description')}</h4>
							<p class="text-base-content/80 text-sm leading-relaxed">
								{contractStore.getContractKey(contract, 'taskDescription')}
							</p>
						</div>
					</div>
				</div>

				<!-- Right Column: Actions & Status -->
				<div class="space-y-4">
					<!-- Available Actions -->
					<ContractActions {contract} />

					<!-- Status Timeline -->
					<div class="card bg-base-200">
						<div class="card-body p-4">
							<h4 class="mb-3 font-semibold">
								{$t('dashboard.contracts.timeline.status_timeline')}
								<span class="badge badge-outline badge-sm ml-2">
									{contract.statusEvents.length}
								</span>
							</h4>

							<ContractTimeline
								statusEvents={contract.statusEvents}
								contractPubkey={contractStore.getContractKey(contract, 'clientPubkey') as string}
							/>
						</div>
					</div>
				</div>
			</div>

			<!-- Additional Info -->
			<div class="border-base-300 border-t pt-4">
				<details class="collapse-arrow collapse">
					<summary class="collapse-title text-sm font-medium">
						{$t('dashboard.contracts.technical_details')}
					</summary>
					<div class="collapse-content">
						<div class="grid grid-cols-1 gap-4 text-xs md:grid-cols-2">
							<div>
								<span class="text-base-content/60">{$t('dashboard.contracts.client_pubkey')}:</span>
								<div class="mt-1 font-mono break-all">
									{contractStore.getContractKey(contract, 'clientPubkey')}
								</div>
							</div>
							<div>
								<span class="text-base-content/60"
									>{$t('dashboard.contracts.freelancer_pubkey')}:</span
								>
								<div class="mt-1 font-mono break-all">
									{contractStore.getContractKey(contract, 'freelancerPubkey')}
								</div>
							</div>
							<div>
								<span class="text-base-content/60"
									>{$t('dashboard.contracts.contract_event_id')}:</span
								>
								<div class="mt-1 font-mono break-all">{contract.contractEvent.id}</div>
							</div>
							<div>
								<span class="text-base-content/60">{$t('dashboard.contracts.currency')}:</span>
								<div class="mt-1">{contractStore.getContractKey(contract, 'currency')}</div>
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
