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
	import ReviewPromptModal from '$lib/components/reviews/ReviewPromptModal.svelte';
	import {
		getOtherPartyPubkey,
		hasUserReviewedContract,
		isReviewableContractStatus
	} from '$lib/utils/reviews/helpers';
	import { getReviewsForContract } from '$lib/utils/reviews/queries';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { nip19 } from 'nostr-tools';

	const { contract, btcPrice } = $props<{
		contract: ContractWithEvents;
		btcPrice: number;
	}>();

	const presentation = $derived(
		buildContractContextPresentation(contract, contractStore.getContractKey)
	);

	// Review status state
	let reviewStatus = $state<{
		userReviewed: boolean;
		otherPartyReviewed: boolean;
		isLoading: boolean;
	}>({
		userReviewed: false,
		otherPartyReviewed: false,
		isLoading: true
	});

	let isReviewModalOpen = $state(false);
	let revieweePubkey = $state<string | null>(null);

	// Convert npub to hex for comparison with contract pubkeys
	function npubToHex(npub: string): string {
		try {
			if (npub.startsWith('npub')) {
				return nip19.decode(npub).data as string;
			}
			return npub; // Already hex
		} catch {
			return npub; // Return as is if conversion fails
		}
	}

	// Convert hex to npub for review modal
	function hexToNpub(hexPubkey: string): string {
		try {
			if (hexPubkey.startsWith('npub')) {
				return hexPubkey; // Already npub
			}
			return nip19.npubEncode(hexPubkey);
		} catch {
			return hexPubkey; // Return as is if conversion fails
		}
	}

	// Check review status for completed contracts
	$effect(() => {
		(async () => {
			const isCompleted =
				contract.contract.status === 'completed' || contract.contract.status === 'resolved';
			if (!isCompleted) {
				reviewStatus = { userReviewed: false, otherPartyReviewed: false, isLoading: false };
				return;
			}

			try {
				reviewStatus.isLoading = true;
				const currentUserNpub = await getNpub();
				if (!currentUserNpub) {
					reviewStatus = { userReviewed: false, otherPartyReviewed: false, isLoading: false };
					return;
				}

				// Convert npub to hex for contract comparison
				const currentUserPubkey = npubToHex(currentUserNpub);

				// Check if user has reviewed
				const userReviewed = await hasUserReviewedContract(contract.contract.escrowId);

				// Check if other party has reviewed
				const reviews = await getReviewsForContract(contract.contract.escrowId);
				const otherPartyPubkeyHex = getOtherPartyPubkey(contract, currentUserPubkey);

				// Convert other party's hex pubkey to npub for comparison with reviews
				const otherPartyPubkeyNpub = otherPartyPubkeyHex ? hexToNpub(otherPartyPubkeyHex) : null;
				const otherPartyReviewed = otherPartyPubkeyNpub
					? reviews.some((r) => {
							// Reviews may have npub or hex format, so check both
							const reviewerHex = r.reviewerPubkey.startsWith('npub')
								? npubToHex(r.reviewerPubkey)
								: r.reviewerPubkey;
							return (
								reviewerHex === otherPartyPubkeyHex || r.reviewerPubkey === otherPartyPubkeyNpub
							);
						})
					: false;

				reviewStatus = {
					userReviewed,
					otherPartyReviewed,
					isLoading: false
				};

				// Set reviewee pubkey for review modal (use npub format)
				if (otherPartyPubkeyHex) {
					revieweePubkey = hexToNpub(otherPartyPubkeyHex);
				}
			} catch (error) {
				console.error('Failed to check review status:', error);
				reviewStatus = { userReviewed: false, otherPartyReviewed: false, isLoading: false };
			}
		})();
	});

	function handleReviewClick(e: MouseEvent) {
		e.stopPropagation();
		if (revieweePubkey && !reviewStatus.userReviewed) {
			isReviewModalOpen = true;
		}
	}

	function handleReviewSubmit() {
		reviewStatus.userReviewed = true;
		isReviewModalOpen = false;
	}

	// Format RBTC amount
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

	// Get role badge class
	function getRoleBadgeClass(isClient: boolean): string {
		return isClient ? 'badge-primary' : 'badge-secondary';
	}

	const openDrawer = () => {
		$contractStore.contract = contract;
		$contractStore.isDrawerOpen = true;
	};
</script>

<div class="bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg">
	<div class="card-body">
		<div class="flex flex-col justify-between gap-2">
			<div class="flex items-start justify-between">
				<div class="min-w-0 flex-1">
					<small class="card-title line-clamp-1 text-lg">
						<button
							class="hover:text-primary cursor-pointer text-left transition-colors"
							onclick={(e) => {
								e.stopPropagation();
								onclick?.();
							}}
						>
							{contract.contract.taskTitle}
						</button>
					</small>
					<div class="text-base-content/60 mt-1 line-clamp-2">
						{contract.contract.taskDescription}
					</div>
				</div>

				<!-- Badges in top right corner -->
				<div class="ml-4 flex shrink-0 flex-col items-end gap-2">
					<div class="flex flex-wrap items-center justify-end gap-2">
						<div class="badge {getStatusColorClass(contract.contract.status)} badge-sm">
							{$t(`dashboard.contracts.status.${contract.contract.status}`)}
						</div>
						<div class="badge {getRoleBadgeClass(contract.isClient)} badge-sm">
							{contract.isClient ? $t('dashboard.client') : $t('dashboard.freelancer')}
						</div>

						<!-- Review Status Badges -->
						{#if (contract.contract.status === 'completed' || contract.contract.status === 'resolved') && !reviewStatus.isLoading}
							{#if reviewStatus.userReviewed}
								<div class="badge badge-success badge-sm gap-1" title={$t('reviews.you_reviewed')}>
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
											d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
									{$t('reviews.reviewed')}
								</div>
							{:else if revieweePubkey}
								<button
									class="badge badge-warning badge-sm hover:badge-warning/80 cursor-pointer gap-1 transition-colors"
									title={$t('reviews.review_pending')}
									onclick={handleReviewClick}
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
											d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
										/>
									</svg>
									{$t('reviews.review_pending')}
								</button>
							{/if}

							{#if reviewStatus.otherPartyReviewed}
								<div class="badge badge-info badge-sm gap-1" title={$t('reviews.review_received')}>
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
											d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
										/>
									</svg>
									{$t('reviews.review_received')}
								</div>
							{/if}
						{/if}

						{#if reviewStatus.isLoading}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
					</div>

					<!-- Price with stacked design -->
					<div class="text-right">
						{#if btcPrice > 0}
							{@const priceData = formatPriceStacked(contract.contract.amount, btcPrice)}
							<div class="text-base-content text-lg font-bold">
								{priceData.usd}
							</div>
							<div class="text-base-content/60 text-sm">
								{priceData.sats}
							</div>
						{:else}
							<div class="text-base-content text-lg font-bold">
								{formatRBTC(contract.contract.amount)} RBTC
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<div class="flex w-full items-center justify-between">
			<!-- Left: Deadline -->
			<div class="flex items-center gap-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-base-content/60 h-4 w-4 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<ContractContextSummary {contract} variant="card" />
				</svg>
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
					<!-- Review Status Badges -->
					{#if isReviewableContractStatus(contract.status) && !reviewStatus.isLoading}
						{#if reviewStatus.userReviewed}
							<div class="badge badge-success badge-sm gap-1" title={$t('reviews.you_reviewed')}>
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
										d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								{$t('reviews.reviewed')}
							</div>
						{:else if revieweePubkey}
							<button
								class="badge badge-warning badge-sm hover:badge-warning/80 cursor-pointer gap-1 transition-colors"
								title={$t('reviews.review_pending')}
								onclick={handleReviewClick}
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
										d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
									/>
								</svg>
								{$t('reviews.review_pending')}
							</button>
						{/if}
						{#if reviewStatus.otherPartyReviewed}
							<div class="badge badge-info badge-sm gap-1" title={$t('reviews.review_received')}>
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
										d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
									/>
								</svg>
								{$t('reviews.review_received')}
							</div>
						{/if}
					{/if}
					{#if reviewStatus.isLoading}
						<span class="loading loading-spinner loading-xs"></span>
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

	<!-- Review Prompt Modal -->
	{#if isReviewModalOpen && revieweePubkey}
		<ReviewPromptModal
			isOpen={isReviewModalOpen}
			escrowId={contract.contract.escrowId}
			{revieweePubkey}
			escrowTxHash={contract.contract.transactionHash}
			onClose={() => {
				isReviewModalOpen = false;
			}}
			onSubmit={handleReviewSubmit}
		/>
	{/if}
</div>
