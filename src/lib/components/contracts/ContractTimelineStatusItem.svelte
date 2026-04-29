<script lang="ts">
	import type { NDKPaymentContract } from '$lib/nostr/events/contract';
	import type { NDKContractStatus } from '$lib/nostr/events/contractStatus';
	import { get } from 'svelte/store';
	import { locale, t } from 'svelte-i18n';
	import {
		formatContractTimelineTimeLabel,
		formatContractTimelineDate,
		formatContractTimelineTime
	} from '$lib/utils/contract/contractTimelineTime';
	import {
		statusEventTimestampMs,
		timelineParticipantForPubkey
	} from '$lib/utils/contract/buildContractTimelineRows';
	import { rskExplorerTxUrl } from '$lib/utils/contract/rskExplorerTxUrl';
	import {
		getStatusTranslationKey,
		getContractStatusTimelineTextClass
	} from '$lib/utils/helpers/contractStatusFormatterV2';
	import { parseProposalAmountsWei } from '$lib/utils/contract/resolutionProposalDisplay';
	import ContractTimelineMiddleIcon from './ContractTimelineMiddleIcon.svelte';
	import ResolutionProposalSplitDisplay from './ResolutionProposalSplitDisplay.svelte';

	const { event, paymentContract, btcPrice, viewerIsTasker, isLast } = $props<{
		event: NDKContractStatus;
		paymentContract: NDKPaymentContract;
		btcPrice: number;
		viewerIsTasker: boolean;
		isLast: boolean;
	}>();

	const authorPubkey = $derived(event.pubkey ?? '');

	const participant = $derived(
		timelineParticipantForPubkey(
			authorPubkey,
			paymentContract.taskerPubkey,
			paymentContract.taskeePubkey
		)
	);

	const contentSide = $derived(participant === 'tasker' ? 'timeline-start' : 'timeline-end');

	/** Start column: hug the center axis; end column: full width of cell up to max width. */
	const contentShellClass = $derived(
		participant === 'tasker'
			? 'md:ml-auto md:w-fit md:max-w-md md:shrink-0'
			: 'md:w-full md:max-w-md'
	);

	const contractStatus = $derived(event.status);

	const timeLabel = $derived.by(() => {
		get(locale);
		get(t);
		return formatContractTimelineTimeLabel(statusEventTimestampMs(event));
	});

	/** Whether this event is recent (< 24 hours) and shows relative time */
	const isRecentEvent = $derived.by(() => {
		const label = timeLabel;
		return label.includes('ago') || label.includes('just_now') || label.includes('minutes');
	});

	const timeDate = $derived.by(() => {
		get(locale);
		return formatContractTimelineDate(statusEventTimestampMs(event), get(locale) || 'en');
	});

	const timeTime = $derived.by(() => {
		return formatContractTimelineTime(statusEventTimestampMs(event));
	});

	const roleLabelKey = $derived(
		participant === 'tasker'
			? 'dashboard.client'
			: participant === 'taskee'
				? 'dashboard.freelancer'
				: 'dashboard.contracts.timeline.from_unknown'
	);

	const roleBadgeClass = $derived(
		participant === 'tasker'
			? 'badge-primary'
			: participant === 'taskee'
				? 'badge-secondary'
				: 'badge-neutral'
	);

	const titleClass = $derived(
		contractStatus !== undefined
			? getContractStatusTimelineTextClass(contractStatus)
			: 'text-base-content/70'
	);

	const proposalWei = $derived(parseProposalAmountsWei(event));

	const proposerIsTasker = $derived(
		authorPubkey !== '' && authorPubkey === paymentContract.taskerPubkey
	);
</script>

<li class="relative">
	<div class="timeline-middle">
		<ContractTimelineMiddleIcon kind="status" {contractStatus} />
	</div>

	<div
		class="{contentSide} flex w-full min-w-0 flex-col items-start gap-2 text-left max-md:max-w-none {contentShellClass}"
	>
		<div class="card border-base-300 bg-base-100 rounded-xl border shadow-sm">
			<div class="card-body gap-3 p-4 text-left">
				{#if isRecentEvent}
					<!-- Recent events: show relative time (e.g., "2 hours ago") with badge on same row -->
					<div class="flex flex-wrap items-center gap-2">
						<time class="text-base-content/60 font-mono text-xs">{timeLabel}</time>
						<span class="badge badge-sm {roleBadgeClass}">{$t(roleLabelKey)}</span>
					</div>
				{:else}
					<!-- Older events: date and time stacked on mobile, inline on desktop -->
					<div class="flex flex-col gap-1 max-md:flex-row max-md:items-center max-md:gap-2">
						<div class="flex items-center gap-2">
							<time class="text-base-content/60 font-mono text-xs">{timeDate}</time>
							<span class="text-base-content/40 text-xs max-md:hidden">at</span>
							<time class="text-base-content/60 font-mono text-xs max-md:hidden">{timeTime}</time>
							<span class="badge badge-sm {roleBadgeClass}">{$t(roleLabelKey)}</span>
						</div>
						<time class="text-base-content/60 font-mono text-xs md:hidden">{timeTime}</time>
					</div>
				{/if}

				{#if contractStatus !== undefined}
					<p class="text-sm leading-snug font-semibold {titleClass}">
						{$t(getStatusTranslationKey(contractStatus))}
					</p>
				{:else}
					<p class="text-base-content/70 text-sm">
						{$t('dashboard.contracts.timeline.from_unknown')}
					</p>
				{/if}

				{#if event.transactionHash}
					<a
						href={rskExplorerTxUrl(event.transactionHash)}
						target="_blank"
						rel="noopener noreferrer"
						class="link link-primary inline-flex items-center gap-1 text-xs font-medium"
					>
						<span>{$t('dashboard.contracts.timeline.view_transaction')}</span>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-3.5 w-3.5 shrink-0"
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
				{/if}

				{#if proposalWei}
					<div class="border-base-300 mt-1 border-t pt-3">
						<p class="text-base-content/80 mb-2 text-xs font-medium">
							{$t('dashboard.contracts.timeline.proposed_split')}
						</p>
						<ResolutionProposalSplitDisplay
							taskerShareWei={proposalWei.taskerWei}
							taskeeShareWei={proposalWei.taskeeWei}
							currency={paymentContract.currency}
							{btcPrice}
							isTasker={viewerIsTasker}
							variant="compact"
							{proposerIsTasker}
						/>
					</div>
				{/if}
			</div>
		</div>
	</div>

	{#if !isLast}
		<hr class="bg-base-300" />
	{/if}
</li>
