<script lang="ts">
	import type { ContractWithEvents } from '$lib/types/contract';
	import { t } from 'svelte-i18n';
	import { formatUSDWithSatsSync } from '$lib/utils/helpers/currencyFormatter';
	import Drawer from '$lib/components/Drawer.svelte';
	import ContractTimeline from './ContractTimeline.svelte';
	import ContractActions from './ContractActions.svelte';
	import UserProfile from '$lib/components/UserNostrBadge.svelte';

	const { contract, isOpen, btcPrice, onClose, onUpdate } = $props<{
		contract: ContractWithEvents | null;
		isOpen: boolean;
		btcPrice: number;
		onClose: () => void;
		onUpdate: () => void;
	}>();

	// Technical details toggle state
	let isTechnicalDetailsOpen = $state(false);
	let isOriginalBidOpen = $state(false);

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

	// Handle action completion
	function handleActionComplete() {
		onUpdate();
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

	const getAvailableActionsCount = () => {
		let count = 0;
		if (contract.canComplete) count++;
		if (contract.canAccept) count++;
		if (contract.canDispute) count++;
		if (contract.canPropose) count++;
		if (contract.canAcceptProposal) count++;
		if (contract.canCancel) count++;
		if (contract.canResolveTimelock) count++;
		return count;
	};
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
			<div class="badge {getStatusColorClass(contract.contract.status)}">
				{$t(`dashboard.contracts.status.${contract.contract.status}`)}
			</div>
			<div class="badge {contract.isClient ? 'badge-primary' : 'badge-secondary'}">
				{contract.isClient ? $t('dashboard.client') : $t('dashboard.freelancer')}
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
							<span class="font-semibold"
								>{btcPrice > 0
									? formatUSDWithSatsSync(contract.contract.amount, btcPrice)
									: `${formatRBTC(contract.contract.amount)} RBTC`}</span
							>
						</div>

						<div class="flex justify-between gap-2">
							<span class="text-base-content/70 whitespace-nowrap"
								>{$t('dashboard.contracts.task_id')}:</span
							>
							<span class="overflow-wrap-anywhere font-mono text-sm break-all whitespace-normal"
								>#{contract.contract.taskId}</span
							>
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
							<span class="text-base-content/70 whitespace-nowrap"
								>{$t('dashboard.contracts.estimated_start')}:</span
							>
							<span class="overflow-wrap-anywhere text-sm break-all whitespace-normal"
								>{formatDate(contract.contract.estimatedStartTime)}</span
							>
						</div>

						<div class="flex justify-between gap-2">
							<span class="text-base-content/70 whitespace-nowrap"
								>{$t('dashboard.contracts.estimated_completion')}:</span
							>
							<span class="overflow-wrap-anywhere text-sm break-all whitespace-normal"
								>{formatDate(contract.contract.estimatedCompletionTime)}</span
							>
						</div>
					</div>
				</div>
			</div>

			<!-- User Info Card -->
			<div class="card bg-base-200">
				<div class="card-body p-4">
					<h4 class="mb-3 font-semibold">
						{contract.isClient ? $t('dashboard.freelancer') : $t('dashboard.client')}
					</h4>
					<UserProfile
						pubkey={contract.isClient
							? contract.contract.freelancerPubkey
							: contract.contract.clientPubkey}
						size="md"
					/>
				</div>
			</div>

			<!-- Task Description Card -->
			<div class="card bg-base-200 overflow-hidden">
				<div class="card-body p-4">
					<h4 class="mb-3 font-semibold">{$t('dashboard.contracts.task_description')}</h4>
					<p class="text-base-content/80 text-sm leading-relaxed">
						{contract.contract.taskDescription}
					</p>

					<!-- Original Bid Proposal - Expandable Section -->
					<div class="mt-4">
						<div class="bg-transparent">
							<button
								class="flex w-full cursor-pointer items-center justify-between px-0 py-2 text-sm font-medium"
								onclick={() => (isOriginalBidOpen = !isOriginalBidOpen)}
							>
								<span>{$t('dashboard.contracts.original_bid_proposal')}</span>
								<svg
									class="h-4 w-4 transition-transform duration-200 {isOriginalBidOpen
										? 'rotate-180'
										: 'rotate-0'}"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 9l-7 7-7-7"
									/>
								</svg>
							</button>
							{#if isOriginalBidOpen}
								<div class="px-0 pb-0">
									<div class="bg-base-300 space-y-2 rounded-lg p-3 text-sm">
										<div class="text-base-content/60 mb-2 text-xs">
											{$t('dashboard.contracts.bid_details')}
										</div>

										<!-- Placeholder for bid information -->
										<div class="space-y-2">
											<div>
												<span class="text-xs font-medium"
													>{$t('dashboard.contracts.proposed_approach')}:</span
												>
												<p class="text-base-content/80 mt-1 text-xs">
													{$t('dashboard.contracts.bid_info_not_available')}
												</p>
											</div>

											<div>
												<span class="text-xs font-medium"
													>{$t('dashboard.contracts.estimated_duration')}:</span
												>
												<p class="text-base-content/80 mt-1 text-xs">
													{formatDate(contract.contract.estimatedStartTime)} - {formatDate(
														contract.contract.estimatedCompletionTime
													)}
												</p>
											</div>

											<div>
												<span class="text-xs font-medium"
													>{$t('dashboard.contracts.original_amount')}:</span
												>
												<p class="text-base-content/80 mt-1 text-xs">
													{btcPrice > 0
														? formatUSDWithSatsSync(contract.contract.amount, btcPrice)
														: `${formatRBTC(contract.contract.amount)} RBTC`}
												</p>
											</div>
										</div>
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>
			</div>

			<!-- Available Actions -->
			<div class="card bg-base-200">
				<div class="card-body p-4">
					<h4 class="mb-3 font-semibold">{$t('dashboard.contracts.available_actions')}</h4>

					<!-- No actions available -->
					{#if getAvailableActionsCount() === 0}
						<div class="text-base-content/60 py-4 text-center">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="mx-auto mb-2 h-8 w-8 opacity-50"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							<p class="text-sm">{$t('dashboard.contracts.no_actions_available')}</p>
						</div>
					{/if}
					<ContractActions
						{contract}
						onActionComplete={handleActionComplete}
						containerClass="grid grid-cols-1 sm:grid-cols-2 gap-3"
					/>
				</div>
			</div>

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
			<div class="card bg-base-200 mb-16 overflow-hidden sm:mb-0">
				<div class="card-body bg-base-200 p-0">
					<button
						class="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium"
						onclick={() => (isTechnicalDetailsOpen = !isTechnicalDetailsOpen)}
					>
						<span>{$t('dashboard.contracts.technical_details')}</span>
						<svg
							class="h-4 w-4 transition-transform duration-200 {isTechnicalDetailsOpen
								? 'rotate-180'
								: 'rotate-0'}"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 9l-7 7-7-7"
							/>
						</svg>
					</button>
					{#if isTechnicalDetailsOpen}
						<div class="px-4 pb-4">
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
					{/if}
				</div>
			</div>
		</div>
	{/snippet}
</Drawer>
