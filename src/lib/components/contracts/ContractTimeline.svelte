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
					<svg 
						xmlns="http://www.w3.org/2000/svg" 
						class="h-5 w-5 {getActionColorClass(event.status.action)}" 
						fill="none" 
						viewBox="0 0 24 24" 
						stroke="currentColor"
					>
						<path 
							stroke-linecap="round" 
							stroke-linejoin="round" 
							stroke-width="2" 
							d={getActionIcon(event.status.action)}
						/>
					</svg>
				</div>

				<!-- Timeline content -->
				<div class="timeline-{index % 2 === 0 ? 'start' : 'end'} mb-10 md:text-{index % 2 === 0 ? 'end' : 'start'}">
					<time class="font-mono italic text-xs text-base-content/60">
						{formatTimelineDate(event.status.timestamp)}
					</time>
					
					<div class="text-sm font-semibold {getActionColorClass(event.status.action)} mt-1">
						{getActionDescription(event.status.action)}
					</div>
					
					<div class="text-xs text-base-content/60 mt-1">
						{getSenderRoleText(event)}
					</div>

					{#if event.status.message}
						<div class="text-xs text-base-content/80 mt-2 p-2 bg-base-300 rounded">
							{event.status.message}
						</div>
					{/if}

					{#if event.status.transactionHash}
						<div class="text-xs text-base-content/60 mt-2">
							<span class="font-medium">{$t('dashboard.contracts.timeline.transaction')}:</span>
							<span class="font-mono">{event.status.transactionHash.slice(0, 10)}...</span>
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
