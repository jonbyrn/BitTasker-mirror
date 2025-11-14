<script lang="ts">
	import { t } from 'svelte-i18n';
	import { locale } from 'svelte-i18n';
	import { formatStandardDateShort, formatStandardDateTime } from '$lib/utils/helpers/dateFormatter';
	import type { ContractStatusEvent } from '$lib/types/contract';

	const { statusEvents } = $props<{
		statusEvents: ContractStatusEvent[];
	}>();

	// Format date for timeline
	function formatTimelineDate(timestamp: number): string {
		const date = new Date(timestamp);
		const now = new Date();
		const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

		if (diffInHours < 1) {
			const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
			return diffInMinutes <= 1 ? $t('dashboard.contracts.timeline.just_now') : $t('dashboard.contracts.timeline.minutes_ago', { values: { minutes: diffInMinutes } });
		} else if (diffInHours < 24) {
			const hours = Math.floor(diffInHours);
			return $t('dashboard.contracts.timeline.hours_ago', { values: { hours } });
		} else {
			// Use standardized date formatting with reactive locale
			return formatStandardDateTime(date, $locale || 'en');
		}
	}

	// Get action icon
	function getActionIcon(action: string): string {
		switch (action) {
			case 'task-completed':
				return 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'; // check-circle
			case 'payment-released':
				return 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z'; // currency-dollar
			case 'dispute-raised':
				return 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z'; // exclamation-triangle
			case 'resolution-proposed':
				return 'M9 5H7a2 2 0 00-2 2v6a2 2 0 002 2h2m0 0h2m-2 0v4l3-3-3-3m2-5a2 2 0 012-2h2a2 2 0 012 2v6a2 2 0 01-2 2h-2m0 0v4l-3-3 3-3'; // switch-horizontal
			case 'proposal-accepted':
				return 'M5 13l4 4L19 7'; // check
			case 'escrow-cancelled':
				return 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z'; // x-circle
			case 'timelock-resolved':
				return 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'; // clock
			default:
				return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'; // information-circle
		}
	}

	// Get action color class
	function getActionColorClass(action: string): string {
		switch (action) {
			case 'task-completed':
				return 'text-success';
			case 'payment-released':
				return 'text-success';
			case 'dispute-raised':
				return 'text-error';
			case 'resolution-proposed':
				return 'text-warning';
			case 'proposal-accepted':
				return 'text-success';
			case 'escrow-cancelled':
				return 'text-error';
			case 'timelock-resolved':
				return 'text-info';
			default:
				return 'text-base-content/60';
		}
	}

	// Get sender role text
	function getSenderRoleText(event: ContractStatusEvent): string {
		if (event.isFromClient) {
			return $t('dashboard.contracts.timeline.from_client');
		} else if (event.isFromFreelancer) {
			return $t('dashboard.contracts.timeline.from_freelancer');
		}
		return $t('dashboard.contracts.timeline.from_unknown');
	}

	// Get action description
	function getActionDescription(action: string): string {
		return $t(`dashboard.contracts.timeline.actions.${action.replace('-', '_')}`);
	}

	// Get Rootstock explorer URL for transaction
	function getTransactionUrl(txHash: string): string {
		const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
		if (rskNetwork === 'mainnet') {
			return `https://rootstock.blockscout.com/tx/${txHash}`;
		} else {
			return `https://rootstock-testnet.blockscout.com/tx/${txHash}`;
		}
	}
</script>

{#if statusEvents.length === 0}
	<div class="text-center py-4 text-base-content/60">
		<svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-8 w-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
		</svg>
		<p class="text-sm">{$t('dashboard.contracts.timeline.no_updates')}</p>
	</div>
{:else}
	<div class="timeline timeline-snap-icon max-md:timeline-compact timeline-vertical">
		{#each statusEvents as event, index (event.event.id)}
			<li>
				<!-- Timeline point -->
				<div class="timeline-middle">
					<div class="h-2 w-2 rounded-full bg-base-300"></div>
				</div>

				<!-- Timeline content -->
				<div class="timeline-{index % 2 === 0 ? 'start' : 'end'} mb-10 md:text-{index % 2 === 0 ? 'end' : 'start'}">
					<time class="font-mono italic text-xs text-base-content/60">
						{formatTimelineDate(event.status.timestamp)}
					</time>
					
					<div class="mt-1 flex items-center gap-2">
						{#if event.status.action === 'task-completed' || event.status.action === 'payment-released'}
							<div class="bg-success text-success-content flex h-5 w-5 min-h-5 min-w-5 items-center justify-center rounded-full shrink-0">
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
										d="M5 13l4 4L19 7"
									/>
								</svg>
							</div>
						{/if}
						<div class="text-sm font-semibold {getActionColorClass(event.status.action)}">
							{getActionDescription(event.status.action)}
						</div>
					</div>
					
					<div class="text-xs text-base-content/60 mt-1">
						{getSenderRoleText(event)}
					</div>

					{#if event.status.transactionHash}
						<div class="text-xs text-base-content/60 mt-2">
							<a
								href={getTransactionUrl(event.status.transactionHash)}
								target="_blank"
								rel="noopener noreferrer"
								class="link link-primary inline-flex items-center gap-1"
							>
								<span>{$t('dashboard.contracts.timeline.view_transaction')}</span>
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
										d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
									/>
								</svg>
							</a>
						</div>
					{/if}

					{#if event.status.proposedClientAmount && event.status.proposedFreelancerAmount}
						<div class="text-xs text-base-content/80 mt-2 space-y-1">
							<div>
								<span class="font-medium">{$t('dashboard.contracts.timeline.proposed_split')}:</span>
							</div>
							<div class="pl-2">
								<div>{$t('dashboard.client')}: {event.status.proposedClientAmount} RBTC</div>
								<div>{$t('dashboard.freelancer')}: {event.status.proposedFreelancerAmount} RBTC</div>
							</div>
						</div>
					{/if}
				</div>

				<!-- Timeline line (except for last item) -->
				{#if index < statusEvents.length - 1}
					<hr class="bg-base-300" />
				{/if}
			</li>
		{/each}
	</div>
{/if}
