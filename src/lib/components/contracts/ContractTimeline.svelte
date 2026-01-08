<script lang="ts">
	import type { ContractStatusEvent } from '$lib/types/contract';
	import { t } from 'svelte-i18n';
	import { locale } from 'svelte-i18n';
	import { formatStandardDateTime } from '$lib/utils/helpers/dateFormatter';
	import { EscrowStatus } from '$lib/utils/enums/escrow.enum';
	import { getActionDescription } from '$lib/utils/helpers/contractStatusFormatter';

	const { statusEvents, contractPubkey } = $props<{
		statusEvents: ContractStatusEvent[];
		contractPubkey: string;
	}>();

	/**
	 * Filter to show only blockchain-confirmed events and final states
	 * Excludes pending/transition states (PendingCompletion, PendingAcceptance, etc.)
	 * 
	 * Shows:
	 * - Blockchain states (0-5): Funded, InDispute, DisputeResolved, DisputeUnresolved, Completed, Cancelled
	 * - Final Nostr states: FundsReleased (10), InProgress (7), DisputeResolutionProposed (12)
	 * 
	 * Hides all pending states (6+, except specific ones) to avoid redundant timeline entries like:
	 * "Pending completion" → "Task completed" (shows only "Task completed")
	 */
	function shouldShowInTimeline(action: EscrowStatus): boolean {
		// Blockchain-confirmed states (0-5) - always show
		if (action >= EscrowStatus.Funded && action <= EscrowStatus.Cancelled) {
			return true;
		}

		// Important Nostr-only states to show
		switch (action) {
			case EscrowStatus.InProgress: // Work started
			case EscrowStatus.FundsReleased: // Final payment state
			case EscrowStatus.DisputeResolutionProposed: // Proposal exists
				return true;
			
			// All other states (pending states) should not show
			default:
				return false;
		}
	}

	// Filter status events to show only meaningful timeline entries
	const filteredStatusEvents = $derived(
		statusEvents.filter((event: ContractStatusEvent) => shouldShowInTimeline(event.content.action))
	);

	// Format date for timeline
	function formatTimelineDate(timestamp: number): string {
		const date = new Date(timestamp);
		const now = new Date();
		const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

		if (diffInHours < 1) {
			const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
			return diffInMinutes <= 1
				? $t('dashboard.contracts.timeline.just_now')
				: $t('dashboard.contracts.timeline.minutes_ago', { values: { minutes: diffInMinutes } });
		} else if (diffInHours < 24) {
			const hours = Math.floor(diffInHours);
			return $t('dashboard.contracts.timeline.hours_ago', { values: { hours } });
		} else {
			// Use standardized date formatting with reactive locale
			return formatStandardDateTime(date, $locale || 'en');
		}
	}

	// Get action color class based on EscrowStatus enum
	function getActionColorClass(action: EscrowStatus): string {
		switch (action) {
			case EscrowStatus.Completed:
			case EscrowStatus.FundsReleased:
			case EscrowStatus.DisputeResolved:
				return 'text-success';
			case EscrowStatus.InDispute:
			case EscrowStatus.PendingDispute:
			case EscrowStatus.DisputeResolutionProposed:
				return 'text-warning';
			case EscrowStatus.Cancelled:
			case EscrowStatus.PendingCancellation:
				return 'text-error';
			case EscrowStatus.PendingCompletion:
			case EscrowStatus.PendingAcceptance:
			case EscrowStatus.DisputeUnresolved:
				return 'text-info';
			default:
				return 'text-base-content/60';
		}
	}

	// Get sender role text
	function getSenderRoleText(pubkey: string): string {
		if (pubkey === contractPubkey) {
			return $t('dashboard.contracts.timeline.from_client');
		} else if (pubkey !== contractPubkey) {
			return $t('dashboard.contracts.timeline.from_freelancer');
		}
		return $t('dashboard.contracts.timeline.from_unknown');
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

{#if filteredStatusEvents.length === 0}
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
				d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
			/>
		</svg>
		<p class="text-sm">{$t('dashboard.contracts.timeline.no_updates')}</p>
	</div>
{:else}
	<div class="timeline timeline-snap-icon max-md:timeline-compact timeline-vertical">
		{#each filteredStatusEvents as { content, pubkey }, index (index)}
			<li>
				<!-- Timeline point -->
				<div class="timeline-middle">
					<div class="bg-base-300 h-2 w-2 rounded-full"></div>
				</div>

				<!-- Timeline content -->
				<div
					class="timeline-{index % 2 === 0 ? 'start' : 'end'} mb-10 md:text-{index % 2 === 0
						? 'end'
						: 'start'}"
				>
					<time class="text-base-content/60 font-mono text-xs italic">
						{formatTimelineDate(content.timestamp)}
					</time>

					<div class="mt-1 flex items-center gap-2">
						{#if content.action === EscrowStatus.Completed || content.action === EscrowStatus.FundsReleased || content.action === EscrowStatus.DisputeResolved}
							<div
								class="bg-success text-success-content flex h-5 min-h-5 w-5 min-w-5 shrink-0 items-center justify-center rounded-full"
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
										d="M5 13l4 4L19 7"
									/>
								</svg>
							</div>
						{/if}
						<div class="text-sm font-semibold {getActionColorClass(content.action)}">
							{$t(getActionDescription(content.action))}
						</div>
					</div>

					<div class="text-base-content/60 mt-1 text-xs">
						{getSenderRoleText(pubkey)}
					</div>

					{#if content.transactionHash}
						<div class="text-base-content/60 mt-2 text-xs">
							<a
								href={getTransactionUrl(content.transactionHash)}
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

					{#if content.proposedClientAmount && content.proposedFreelancerAmount}
						<div class="text-base-content/80 mt-2 space-y-1 text-xs">
							<div>
								<span class="font-medium">{$t('dashboard.contracts.timeline.proposed_split')}:</span
								>
							</div>
							<div class="pl-2">
								<div>{$t('dashboard.client')}: {content.proposedClientAmount} RBTC</div>
								<div>
									{$t('dashboard.freelancer')}: {content.proposedFreelancerAmount} RBTC
								</div>
							</div>
						</div>
					{/if}
				</div>

				<!-- Timeline line (except for last item) -->
				{#if index < filteredStatusEvents.length - 1}
					<hr class="bg-base-300" />
				{/if}
			</li>
		{/each}
	</div>
{/if}
