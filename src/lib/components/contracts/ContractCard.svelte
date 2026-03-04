<script lang="ts">
	import type { ContractWithEvents } from '$lib/types/contract';
	import {
		getStatusTranslationKey,
		getStatusColorClass
	} from '$lib/utils/helpers/contractStatusFormatter';
	import { EscrowStatus } from '$lib/utils/escrow';
	import { contractStore } from '$lib/stores/contract.store';
	import { t } from 'svelte-i18n';
	import ContractActions from './ContractActions.svelte';
	import ReviewPromptModal from '$lib/components/reviews/ReviewPromptModal.svelte';
	import { getReviewStatusForContract } from '$lib/utils/review-helpers';
	import UserNostrBadge from '../UserNostrBadge.svelte';
	import TaskDeadlineDisplay from '../task/TaskDeadlineDisplay.svelte';
	import TaskLocationDisplay from '../task/TaskLocationDisplay.svelte';

	const { contract, btcPrice, reviewStatus: reviewStatusFromParent, isLoadingReviewStatus = false } = $props<{
		contract: ContractWithEvents;
		btcPrice: number;
		/** When provided (e.g. from list bulk fetch), no per-card relay subscription is used. */
		reviewStatus?: { userReviewed: boolean; otherPartyReviewed: boolean } | null | undefined;
		/** True while parent is loading bulk review status. */
		isLoadingReviewStatus?: boolean;
	}>();

	// Review status: from parent (bulk) when provided, else from per-card fetch. Local override when user submits.
	let reviewStatus = $state<{
		userReviewed: boolean;
		otherPartyReviewed: boolean;
		isLoading: boolean;
	}>({
		userReviewed: false,
		otherPartyReviewed: false,
		isLoading: false
	});
	let userSubmittedLocal = $state(false);

	let isReviewModalOpen = $state(false);

	// Reviewee pubkey from contract (synchronous) — button shows immediately when status is Funds Released
	const revieweePubkey = $derived(
		(contractStore.getContractKey(contract, 'otherPartyNpub') as string) || null
	);

	// Check if blockchain query failed (no blockchain status and not pending)
	const isBlockchainQueryFailed = $derived(
		contract.blockchainStatus === null &&
			!contract.isPending &&
			!contract.contractEvent.content.transactionHash
	);

	// Contracts in a final state where the user can submit a review (funds released or dispute resolved)
	const canShowReviewUi = $derived(
		contract.status === EscrowStatus.FundsReleased ||
			contract.status === EscrowStatus.Completed ||
			contract.status === EscrowStatus.DisputeResolved
	);

	// When parent provides bulk review status, use it (no per-card subscription). When parent is loading, show loading and do not open a subscription.
	$effect(() => {
		if (reviewStatusFromParent !== undefined && reviewStatusFromParent !== null) {
			reviewStatus = {
				userReviewed: userSubmittedLocal || reviewStatusFromParent.userReviewed,
				otherPartyReviewed: reviewStatusFromParent.otherPartyReviewed,
				isLoading: isLoadingReviewStatus
			};
			return;
		}
		if (isLoadingReviewStatus) {
			reviewStatus = {
				userReviewed: userSubmittedLocal,
				otherPartyReviewed: false,
				isLoading: true
			};
			return;
		}
		// No parent data and not loading: run per-card fetch only for single-contract view (e.g. drawer or other page)
		if (!canShowReviewUi || !revieweePubkey) {
			reviewStatus = { userReviewed: false, otherPartyReviewed: false, isLoading: false };
			return;
		}
		const escrowId = contract.escrowData.id;
		let cancelled = false;
		if (userSubmittedLocal) return;
		reviewStatus = { userReviewed: false, otherPartyReviewed: false, isLoading: true };
		(async () => {
			try {
				const { userReviewed, otherPartyReviewed } = await getReviewStatusForContract(
					escrowId,
					contract,
					{ maxWaitMs: 3000 }
				);
				if (!cancelled) {
					reviewStatus = {
						userReviewed: userReviewed || reviewStatus.userReviewed,
						otherPartyReviewed,
						isLoading: false
					};
				}
			} catch (error) {
				if (!cancelled) {
					console.error('Failed to check review status:', error);
					reviewStatus = { userReviewed: false, otherPartyReviewed: false, isLoading: false };
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	function handleReviewClick(e: MouseEvent) {
		e.stopPropagation();
		if (!revieweePubkey || reviewStatus.userReviewed || reviewStatus.isLoading) return;
		isReviewModalOpen = true;
	}

	function handleReviewSubmit(_eventId: string) {
		userSubmittedLocal = true;
		reviewStatus = {
			userReviewed: true,
			otherPartyReviewed: reviewStatus.otherPartyReviewed,
			isLoading: false
		};
		isReviewModalOpen = false;
	}

	// Format RBTC amount
	function formatRBTC(amount: string): string {
		const num = parseFloat(amount);
		return num.toFixed(4);
	}

	// Format price with stacked USD and Sats
	function formatPriceStacked(amount: string, btcPrice: number): { usd: string; sats: string } {
		const rbtc = parseFloat(amount);
		if (isNaN(rbtc) || btcPrice <= 0) {
			return { usd: '$0.00', sats: '0 Sats' };
		}

		// Convert RBTC to USD (assuming RBTC ≈ BTC)
		const usdAmount = rbtc * btcPrice;

		// Convert to sats
		const sats = Math.round(rbtc * 100_000_000);

		return {
			usd: `$${usdAmount.toFixed(2)}`,
			sats: `${sats.toLocaleString('en-US')} Sats`
		};
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
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	// Get role badge class
	function getRoleBadgeClass(isClient: boolean): string {
		return isClient ? 'badge-primary' : 'badge-secondary';
	}

	// Get available actions count
	function getAvailableActionsCount(): number {
		let count = 0;
		if (contract.permissions.canComplete) count++;
		if (contract.permissions.canAccept) count++;
		if (contract.permissions.canDispute) count++;
		if (contract.permissions.canPropose) count++;
		if (contract.permissions.canAcceptProposal) count++;
		if (contract.permissions.canCancel) count++;
		if (contract.permissions.canResolveTimelock) count++;
		return count;
	}

	const openDrawer = () => {
		$contractStore.contract = contract;
		$contractStore.isDrawerOpen = true;
	};
</script>

<div
	class="card bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg {isBlockchainQueryFailed
		? 'pointer-events-none opacity-60'
		: ''}"
	class:cursor-not-allowed={isBlockchainQueryFailed}
>
	<div class="card-body rounded-xl p-4 md:p-4">
		<!-- Top Row: Title + Description + Badges -->
		<div class="mb-3 flex flex-row items-start justify-between gap-2">
			<!-- Left: Title and Description (flexible, takes available space) -->
			<div class="flex-1 min-w-0 pr-2 md:pr-4">
				<div class="card-title line-clamp-2 text-lg font-semibold">
					<button
						class="hover:text-primary cursor-pointer text-left transition-colors"
						onclick={openDrawer}
					>
						{contractStore.getContractKey(contract, 'taskTitle')}
					</button>
				</div>
				<div class="text-sm text-base-content/80 whitespace-pre-line line-clamp-2 mt-1">
					{contractStore.getContractKey(contract, 'taskDescription')}
				</div>
			</div>
			<!-- Right: Badges -->
			<div class="flex shrink-0 flex-col items-end self-stretch">
				<!-- Top row: Role + Dev badge + Review badges -->
				<div class="flex flex-wrap justify-end gap-1">
					<div class="badge {getRoleBadgeClass(contract.isClient)} badge-sm">
						{contract.isClient ? $t('dashboard.client') : $t('dashboard.freelancer')}
					</div>
					<!-- Review Status Badges -->
					{#if canShowReviewUi && !reviewStatus.isLoading}
						{#if reviewStatus.userReviewed}
							<div class="badge badge-success badge-sm gap-1" title={$t('reviews.you_reviewed')}>
								<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								{$t('reviews.reviewed')}
							</div>
						{:else if revieweePubkey}
							<button
								class="badge badge-warning badge-sm gap-1 hover:badge-warning/80 transition-colors cursor-pointer"
								title={$t('reviews.review_pending')}
								onclick={handleReviewClick}
							>
								<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
								</svg>
								{$t('reviews.review_pending')}
							</button>
						{/if}
						{#if reviewStatus.otherPartyReviewed}
							<div class="badge badge-info badge-sm gap-1" title={$t('reviews.review_received')}>
								<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
								</svg>
								{$t('reviews.review_received')}
							</div>
						{/if}
					{/if}
				</div>
				<!-- Bottom row: Status badge (with min gap from top badges) -->
				<div class="badge {getStatusColorClass(contract.status)} badge-sm mt-2">
					{#if contract?.isPending}
						<span class="loading loading-spinner loading-xs mr-1"></span>
					{/if}
					{$t(getStatusTranslationKey(contract.status))}
				</div>
			</div>
		</div>

		<!-- Second Row: Deadline + Location + Price -->
		<div class="mb-3 flex flex-row items-center justify-between gap-3">
			<!-- Left: Deadline + Location -->
			<div class="flex flex-col gap-2 min-w-0 flex-1">
				<!-- Deadline -->
				<TaskDeadlineDisplay
					deadline={contractStore.getContractKey(contract, 'estimatedCompletionTime') as number}
				/>

				<!-- Location (contracts don't have location data, default to Remote) -->
				<TaskLocationDisplay />
			</div>

			<!-- Right: Price -->
			<div class="text-right shrink-0">
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

		<!-- Bottom Row: User Info + Action Buttons -->
		<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<!-- Left: User Info (without role headline) -->
			<UserNostrBadge
				npub={contractStore.getContractKey(contract, 'otherPartyNpub') as string}
			/>

			<!-- Right: Action Buttons -->
			<div class="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:w-auto">
				{#if getAvailableActionsCount() > 0}
					<ContractActions
						{contract}
						containerClass="flex flex-col gap-2 sm:flex-row sm:flex-wrap w-full sm:w-auto"
						isInline={true}
					/>
				{/if}
				{#if canShowReviewUi && !reviewStatus.isLoading && !reviewStatus.userReviewed && revieweePubkey}
					<button
						class="btn btn-primary btn-sm w-full sm:w-auto"
						onclick={handleReviewClick}
						type="button"
					>
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
								d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
							/>
						</svg>
						{$t('reviews.pending.send_review')}
					</button>
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
			escrowId={contract.escrowData.id}
			revieweePubkey={revieweePubkey}
			escrowTxHash={contract.contractEvent.content.transactionHash}
			taskId={contract.contractEvent.content.taskId}
			onClose={() => {
				isReviewModalOpen = false;
			}}
			onSubmit={handleReviewSubmit}
		/>
	{/if}
</div>
