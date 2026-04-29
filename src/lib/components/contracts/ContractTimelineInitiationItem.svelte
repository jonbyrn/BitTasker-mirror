<script lang="ts">
	import type { NDKPaymentContract } from '$lib/nostr/events/contract';
	import { get } from 'svelte/store';
	import { locale, t } from 'svelte-i18n';
	import { formatContractTimelineTimeLabel } from '$lib/utils/contract/contractTimelineTime';
	import { timelineParticipantForPubkey } from '$lib/utils/contract/buildContractTimelineRows';
	import { rskExplorerTxUrl } from '$lib/utils/contract/rskExplorerTxUrl';
	import ContractTimelineMiddleIcon from './ContractTimelineMiddleIcon.svelte';

	const { contract: paymentContract, isLast } = $props<{
		contract: NDKPaymentContract;
		isLast: boolean;
	}>();

	const participant = $derived(
		timelineParticipantForPubkey(
			paymentContract.pubkey,
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

	const timeLabel = $derived.by(() => {
		get(locale);
		get(t);
		return formatContractTimelineTimeLabel((paymentContract.created_at ?? 0) * 1000);
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
</script>

<li class="relative">
	<div class="timeline-middle">
		<ContractTimelineMiddleIcon kind="initiation" />
	</div>

	<div
		class="{contentSide} flex w-full min-w-0 flex-col items-start gap-2 text-left max-md:max-w-none {contentShellClass}"
	>
		<div class="card border-base-300 bg-base-100 rounded-xl border shadow-sm">
			<div class="card-body gap-3 p-4 text-left">
				<div class="flex flex-wrap items-center gap-2">
					<time class="text-base-content/60 font-mono text-xs">{timeLabel}</time>
					<span class="badge badge-sm {roleBadgeClass}">{$t(roleLabelKey)}</span>
				</div>
				<p class="text-base-content text-sm leading-snug font-semibold">
					{$t('dashboard.contracts.timeline.contract_initiated')}
				</p>
				{#if paymentContract.transactionHash}
					<a
						href={rskExplorerTxUrl(paymentContract.transactionHash)}
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
			</div>
		</div>
	</div>

	{#if !isLast}
		<hr class="bg-base-300" />
	{/if}
</li>
