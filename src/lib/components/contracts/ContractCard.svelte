<!--
 * @deprecated This component uses v1 escrow patterns with ContractWithEvents.
Use ContractCardNDK.svelte instead which uses v2 escrow with PaymentContractRune.
This file will be removed in a future release.
-->
<script lang="ts">
/**
 * @deprecated This file is deprecated. Import ContractCardNDK.svelte instead.
 */
	import type { ContractWithEvents } from '$lib/types/contract';
	import {
		getCancellationStatusVariant,
		getStatusTranslationKey,
		getStatusColorClass
	} from '$lib/utils/helpers/contractStatusFormatter';
	import { contractStore } from '$lib/stores/contract.store';
	import { t } from 'svelte-i18n';
	import ContractActions from './ContractActions.svelte';
	import ContractContextSummary from './ContractContextSummary.svelte';
	import UserNostrBadge from '../UserNostrBadge.svelte';
	import TaskDeadlineDisplay from '../task/TaskDeadlineDisplay.svelte';
	import TaskLocationDisplay from '../task/TaskLocationDisplay.svelte';
	import { buildContractContextPresentation } from '$lib/utils/service-contract/context-presentation';
	import { getVisibleContractQuickActions } from '$lib/utils/helpers/contractQuickActions';
	import { EscrowStatus } from '$lib/utils/escrow';

	const { contract, btcPrice } = $props<{
		contract: ContractWithEvents;
		btcPrice: number;
	}>();

	const isBlockchainQueryFailed = $derived(
		contract.blockchainStatus === null &&
			!contract.isPending &&
			!contract.contractEvent.content.transactionHash
	);
	const presentation = $derived(
		buildContractContextPresentation(contract, contractStore.getContractKey)
	);

	function formatRBTC(amount: string): string {
		const num = parseFloat(amount);
		return num.toFixed(4);
	}

	function formatPriceStacked(
		amount: string,
		currentBtcPrice: number
	): { usd: string; sats: string } {
		const rbtc = parseFloat(amount);
		if (isNaN(rbtc) || currentBtcPrice <= 0) {
			return { usd: '$0.00', sats: '0 Sats' };
		}

		const usdAmount = rbtc * currentBtcPrice;
		const sats = Math.round(rbtc * 100_000_000);

		return {
			usd: `$${usdAmount.toFixed(2)}`,
			sats: `${sats.toLocaleString('en-US')} Sats`
		};
	}

	const statusVariant = $derived(
		getCancellationStatusVariant(
			contract.status,
			contract.statusEvents,
			contractStore.getContractKey(contract, 'clientPubkey') as string
		)
	);

	const availableQuickActions = $derived.by(() => {
		if (presentation.isUnknownContext) {
			return [];
		}

		const clientPubkey = contractStore.getContractKey(contract, 'clientPubkey') as
			| string
			| undefined;
		const otherPartyNpub = contractStore.getContractKey(contract, 'otherPartyNpub') as
			| string
			| undefined;
		const currentUserProposalCount = contract.statusEvents.filter((event) => {
			if (event.content.action !== EscrowStatus.DisputeResolutionProposed) {
				return false;
			}

			const currentActorPubkey = contract.isClient ? clientPubkey : otherPartyNpub;
			return (
				typeof currentActorPubkey === 'string' &&
				event.pubkey.toLowerCase() === currentActorPubkey.toLowerCase()
			);
		}).length;

		return getVisibleContractQuickActions(
			{
				permissions: contract.permissions,
				isClient: contract.isClient,
				isPending: contract.isPending,
				blockchainStatus: contract.blockchainStatus,
				hasDisputeProposal: Boolean(contract.disputeProposal),
				hasProposalsLeft: currentUserProposalCount < 2
			},
			2
		);
	});

	function openDrawer() {
		$contractStore.contract = contract;
		$contractStore.isDrawerOpen = true;
	}
</script>

<div
	class="card bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg {isBlockchainQueryFailed
		? 'pointer-events-none opacity-60'
		: ''}"
	class:cursor-not-allowed={isBlockchainQueryFailed}
	data-contract-escrow-id={contract.escrowData?.id ?? contract.contractEvent.content.escrowId}
>
	<div class="card-body rounded-xl p-4 md:p-4">
		<div class="mb-3 flex flex-row items-start justify-between gap-2">
			<!-- Left: Title and Summary (flexible, takes available space) -->
			<div class="min-w-0 flex-1 pr-2 md:pr-4">
				<button
					class="hover:text-primary w-full cursor-pointer text-left transition-colors"
					onclick={openDrawer}
				>
					<ContractContextSummary {contract} variant="card" />
				</button>
			</div>

			<div class="flex shrink-0 flex-col items-end self-stretch">
				<div class="flex flex-wrap justify-end gap-1">
					<div
						class="badge badge-sm {presentation.isServiceContract
							? 'badge-info'
							: presentation.isUnknownContext
								? 'badge-warning'
								: 'badge-outline'}"
					>
						{presentation.cardLabel}
					</div>
					{#if import.meta.env.DEV}
						<div class="badge badge-error badge-sm">
							{contract.escrowData?.id}
						</div>
					{/if}
				</div>
				<div class="badge {getStatusColorClass(contract.status)} badge-sm mt-2">
					{#if contract.isPending}
						<span class="loading loading-spinner loading-xs mr-1"></span>
					{/if}
					{$t(getStatusTranslationKey(contract.status, { statusVariant }))}
				</div>
			</div>
		</div>

		<div class="mb-3 flex flex-row items-center justify-between gap-3">
			<!-- Left: Deadline + Location -->
			<div class="flex min-w-0 flex-1 flex-col gap-2">
				<TaskDeadlineDisplay
					deadline={contractStore.getContractKey(contract, 'estimatedCompletionTime') as number}
				/>
				<TaskLocationDisplay />
			</div>

			<!-- Right: Price -->
			<div class="shrink-0 text-right">
				{#if btcPrice > 0}
					{@const priceData = formatPriceStacked(
						contractStore.getContractKey(contract, 'amount') as string,
						btcPrice
					)}
					<div class="text-2xl font-bold">{priceData.usd}</div>
					<div class="text-base-content/60 text-base">{priceData.sats}</div>
				{:else}
					<div class="text-2xl font-bold">
						{formatRBTC(contractStore.getContractKey(contract, 'amount') as string)} RBTC
					</div>
				{/if}
			</div>
		</div>

		<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<UserNostrBadge npub={contractStore.getContractKey(contract, 'otherPartyNpub') as string} />

			<div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
				{#if presentation.isUnknownContext}
					<div class="text-base-content/60 text-xs sm:mr-2">Read-only contract context</div>
				{/if}
				{#if availableQuickActions.length > 0}
					<ContractActions
						{contract}
						containerClass="flex flex-col gap-2 sm:flex-row sm:flex-wrap w-full sm:w-auto"
						isInline={true}
						maxInlineActions={2}
					/>
				{/if}
				<button class="btn btn-outline btn-sm w-full sm:w-auto" onclick={openDrawer}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					{$t('dashboard.contracts.view_details')}
				</button>
			</div>
		</div>
	</div>
</div>
