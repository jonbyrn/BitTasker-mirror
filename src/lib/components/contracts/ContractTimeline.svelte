<script lang="ts">
	import type { ContractStatusEvent, NostrContractStatus } from '$lib/types/contract';
	import { t } from 'svelte-i18n';
	import { locale } from 'svelte-i18n';
	import { formatStandardDateTime } from '$lib/utils/helpers/dateFormatter';
	import { EscrowStatus } from '$lib/utils/escrow';
	import { getActionDescription } from '$lib/utils/helpers/contractStatusFormatter';
	import {
		normalizePaymentAsset,
		resolvePaymentContext
	} from '$lib/utils/helpers/paymentContext';

	const {
		statusEvents,
		contractPubkey,
		contractCreatedAt,
		contractCreatorPubkey,
		contractFundingTransactionHash,
		paymentAsset,
		paymentNetwork,
		onDisplayCountChange
	} = $props<{
		statusEvents: ContractStatusEvent[];
		contractPubkey: string;
		contractCreatedAt?: number;
		contractCreatorPubkey?: string;
		contractFundingTransactionHash?: string;
		paymentAsset?: string;
		paymentNetwork?: string;
		onDisplayCountChange?: (count: number) => void;
	}>();

	const hasExplicitPaymentNetwork = $derived(Boolean(paymentNetwork?.trim()));
	const resolvedPaymentContext = $derived(
		hasExplicitPaymentNetwork ? resolvePaymentContext(paymentAsset ?? null, paymentNetwork) : null
	);
	const normalizedPaymentAsset = $derived(
		resolvedPaymentContext?.paymentAsset ?? normalizePaymentAsset(paymentAsset ?? null)
	);
	const resolvedPaymentNetwork = $derived(resolvedPaymentContext?.paymentNetwork ?? null);

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

	// Build unified timeline: contract initiation first (if provided), then status events, sorted by timestamp
	interface TimelineItem {
		timestamp: number;
		pubkey: string;
		isInitiation: boolean;
		content?: NostrContractStatus;
		transactionHash?: string; // For initiation: funding tx; for status: action tx
	}
	const allTimelineItems = $derived.by((): TimelineItem[] => {
		const items: TimelineItem[] = [];
		if (contractCreatedAt != null && contractCreatorPubkey != null) {
			items.push({
				timestamp: contractCreatedAt * 1000, // Nostr uses seconds; status events use ms
				pubkey: contractCreatorPubkey,
				isInitiation: true,
				transactionHash: contractFundingTransactionHash
			});
		}
		for (const ev of filteredStatusEvents) {
			items.push({
				timestamp: ev.content.timestamp,
				pubkey: ev.pubkey,
				isInitiation: false,
				content: ev.content,
				transactionHash: ev.content.transactionHash
			});
		}
		return items.sort((a, b) => a.timestamp - b.timestamp);
	});

	// Notify parent of display count when timeline items change
	$effect(() => {
		onDisplayCountChange?.(allTimelineItems.length);
	});

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

	// Get sender role for badge (Tasker/Taskee)
	function getSenderRoleBadge(pubkey: string): { labelKey: string; badgeClass: string } {
		if (pubkey === contractPubkey) {
			return { labelKey: 'dashboard.client', badgeClass: 'badge-primary' };
		}
		if (pubkey !== contractPubkey) {
			return { labelKey: 'dashboard.freelancer', badgeClass: 'badge-secondary' };
		}
		return { labelKey: 'dashboard.contracts.timeline.from_unknown', badgeClass: 'badge-neutral' };
	}

	// Get chain-aware explorer URL for transaction
	function getTransactionUrl(txHash: string): string | null {
		if (resolvedPaymentNetwork?.startsWith('bsc')) {
			const bscNetwork = import.meta.env.VITE_BSC_NETWORK || 'testnet';
			return bscNetwork === 'mainnet'
				? `https://bscscan.com/tx/${txHash}`
				: `https://testnet.bscscan.com/tx/${txHash}`;
		}

		if (!resolvedPaymentNetwork?.startsWith('rsk')) {
			return null;
		}

		const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
		if (rskNetwork === 'mainnet') {
			return `https://rootstock.blockscout.com/tx/${txHash}`;
		} else {
			return `https://rootstock-testnet.blockscout.com/tx/${txHash}`;
		}
	}

	function getAmountLabel(): string {
		if (!hasExplicitPaymentNetwork) {
			return 'Escrow amount';
		}

		if (normalizedPaymentAsset === 'USDT') {
			return 'USDT';
		}

		if (resolvedPaymentNetwork?.startsWith('bsc')) {
			return 'BSC escrow';
		}

		if (resolvedPaymentNetwork?.startsWith('rsk')) {
			return 'RBTC';
		}

		return 'Escrow amount';
	}

	function getItemTransactionUrl(item: TimelineItem): string | null {
		const transactionHash = (item.transactionHash ?? item.content?.transactionHash) ?? null;
		return transactionHash ? getTransactionUrl(transactionHash) : null;
	}
</script>

{#if allTimelineItems.length === 0}
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
		{#each allTimelineItems as item, index (`${item.isInitiation}-${item.timestamp}`)}
			<li>
				<!-- Timeline point -->
				<div class="timeline-middle">
					<div class="bg-base-300 h-2 w-2 rounded-full"></div>
				</div>

				<!-- Timeline content: more padding between content and center line; extra left padding on mobile -->
				<div
					class="timeline-{index % 2 === 0 ? 'start' : 'end'} mb-10 pl-8 pr-8 {index % 2 === 0
						? 'md:pl-0 md:pr-10'
						: 'md:pl-10 md:pr-0'} md:text-{index % 2 === 0
						? 'end'
						: 'start'}"
				>
					<time class="text-base-content/60 font-mono text-xs italic">
						{formatTimelineDate(item.timestamp)}
					</time>

					<div class="mt-1.5">
						<span
							class="badge badge-sm shrink-0 {getSenderRoleBadge(item.pubkey).badgeClass}"
						>
							{$t(getSenderRoleBadge(item.pubkey).labelKey)}
						</span>
					</div>

					<div class="mt-1 flex items-center gap-2">
						{#if !item.isInitiation && item.content && (item.content.action === EscrowStatus.Completed || item.content.action === EscrowStatus.FundsReleased || item.content.action === EscrowStatus.DisputeResolved)}
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
						<span class="text-sm font-semibold {item.isInitiation ? 'text-base-content/60' : item.content ? getActionColorClass(item.content.action) : 'text-base-content/60'}">
							{item.isInitiation ? $t('dashboard.contracts.timeline.contract_initiated') : item.content ? $t(getActionDescription(item.content.action)) : ''}
						</span>
					</div>

					{#if getItemTransactionUrl(item)}
						<div class="text-base-content/60 mt-2 text-xs">
							<a
								href={getItemTransactionUrl(item)}
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

					{#if !item.isInitiation && item.content?.proposedClientAmount && item.content?.proposedFreelancerAmount}
						<div class="text-base-content/80 mt-2 space-y-1 text-xs">
							<div>
								<span class="font-medium">{$t('dashboard.contracts.timeline.proposed_split')}:</span
								>
							</div>
							<div class="pl-2">
								<div>{$t('dashboard.client')}: {item.content.proposedClientAmount} {getAmountLabel()}</div>
								<div>
									{$t('dashboard.freelancer')}: {item.content.proposedFreelancerAmount} {getAmountLabel()}
								</div>
							</div>
						</div>
					{/if}
				</div>

				<!-- Timeline line (except for last item) -->
				{#if index < allTimelineItems.length - 1}
					<hr class="bg-base-300" />
				{/if}
			</li>
		{/each}
	</div>
{/if}
