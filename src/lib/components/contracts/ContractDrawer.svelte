<script lang="ts">
	import type { ContractWithEvents } from '$lib/types/contract';
	import { t } from 'svelte-i18n';
	import Drawer from '$lib/components/Drawer.svelte';
	import ContractTimeline from './ContractTimeline.svelte';
	import ContractActions from './ContractActions.svelte';

	const { contract, isOpen, onClose, onUpdate } = $props<{
		contract: ContractWithEvents | null;
		isOpen: boolean;
		onClose: () => void;
		onUpdate: () => void;
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
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
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

	// Handle action completion
	function handleActionComplete() {
		onUpdate();
	}
</script>

<Drawer
	{isOpen}
	title={contract?.contract?.taskTitle}
	{onClose}
	position="right"
	isScrollable={true}
>
	{#snippet children()}
		<!-- Header with badges -->
		<div class="mb-6 flex items-center gap-2">
			<div class="badge {getStatusBadgeClass(contract.contract.status)}">
				{$t(`dashboard.contracts.status.${contract.contract.status}`)}
			</div>
			<div class="badge {contract.isClient ? 'badge-primary' : 'badge-secondary'}">
				{contract.isClient
					? $t('dashboard.contracts.role.client')
					: $t('dashboard.contracts.role.freelancer')}
			</div>
		</div>

		<!-- Contract Details -->
		<div class="space-y-6">
			<!-- Contract Info Card -->
			<div class="card bg-base-200">
				<div class="card-body p-4">
					<h4 class="mb-3 font-semibold">{$t('dashboard.contracts.contract_details')}</h4>

					<div class="space-y-3">
						<div class="flex justify-between gap-2">
							<span class="text-base-content/70">{$t('dashboard.contracts.amount')}:</span>
							<span class="font-semibold">{formatRBTC(contract.contract.amount)} RBTC</span>
						</div>

						<div class="flex justify-between gap-2">
							<span class="text-base-content/70">{$t('dashboard.contracts.escrow_id')}:</span>
							<span class="font-mono text-sm">#{contract.contract.escrowId}</span>
						</div>

						<div class="flex justify-between gap-2">
							<span class="text-base-content/70 whitespace-nowrap">{$t('dashboard.contracts.task_id')}:</span>
							<span class="font-mono text-sm overflow-wrap-anywhere break-all whitespace-normal">#{contract.contract.taskId}</span>
						</div>

						<div class="flex justify-between gap-2">
							<span class="text-base-content/70">{$t('dashboard.contracts.created')}:</span>
							<span class="text-sm">{formatDate(contract.contract.createdAt)}</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Timeline Card -->
			<div class="card bg-base-200">
				<div class="card-body p-4">
					<h4 class="mb-3 font-semibold">{$t('dashboard.contracts.timeline.label')}</h4>

					<div class="space-y-3">
						<div class="flex justify-between gap-2">
							<span class="text-base-content/70 whitespace-nowrap">{$t('dashboard.contracts.estimated_start')}:</span>
							<span class="text-sm overflow-wrap-anywhere break-all whitespace-normal">{formatDate(contract.contract.estimatedStartTime)}</span>
						</div>

						<div class="flex justify-between gap-2">
							<span class="text-base-content/70 whitespace-nowrap"
								>{$t('dashboard.contracts.estimated_completion')}:</span
							>
							<span class="text-sm overflow-wrap-anywhere break-all whitespace-normal">{formatDate(contract.contract.estimatedCompletionTime)}</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Task Description Card -->
			<div class="card bg-base-200">
				<div class="card-body p-4">
					<h4 class="mb-3 font-semibold">{$t('dashboard.contracts.task_description')}</h4>
					<p class="text-base-content/80 text-sm leading-relaxed">
						{contract.contract.taskDescription}
					</p>
				</div>
			</div>

			<!-- Available Actions -->
			<ContractActions {contract} onActionComplete={handleActionComplete} />

			<!-- Status Timeline -->
			<div class="card bg-base-200">
				<div class="card-body p-4">
					<h4 class="mb-3 font-semibold">
						{$t('dashboard.contracts.timeline.status_timeline')}
						<span class="badge badge-outline badge-sm ml-2">
							{contract.statusEvents.length}
						</span>
					</h4>

					<ContractTimeline statusEvents={contract.statusEvents} />
				</div>
			</div>

			<!-- Technical Details -->
			<div class="card bg-base-200 overflow-visible">
				<div class="card-body p-0">
					<details class="collapse-arrow collapse bg-transparent">
						<summary class="collapse-title min-h-fit px-4 py-3 text-sm font-medium">
							{$t('dashboard.contracts.technical_details')}
						</summary>
						<div class="collapse-content px-4 pb-4">
							<div class="space-y-3 text-xs">
								<div>
									<span class="text-base-content/60"
										>{$t('dashboard.contracts.client_pubkey')}:</span
									>
									<div class="bg-base-300 mt-1 rounded p-2 font-mono text-xs break-all">
										{contract.contract.clientPubkey}
									</div>
								</div>
								<div>
									<span class="text-base-content/60"
										>{$t('dashboard.contracts.freelancer_pubkey')}:</span
									>
									<div class="bg-base-300 mt-1 rounded p-2 font-mono text-xs break-all">
										{contract.contract.freelancerPubkey}
									</div>
								</div>
								<div>
									<span class="text-base-content/60"
										>{$t('dashboard.contracts.contract_event_id')}:</span
									>
									<div class="bg-base-300 mt-1 rounded p-2 font-mono text-xs break-all">
										{contract.contractEvent.id}
									</div>
								</div>
								<div>
									<span class="text-base-content/60">{$t('dashboard.contracts.currency')}:</span>
									<div class="mt-1 font-semibold">{contract.contract.currency}</div>
								</div>
							</div>
						</div>
					</details>
				</div>
			</div>
		</div>
	{/snippet}
</Drawer>
