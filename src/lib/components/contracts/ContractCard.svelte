<script lang="ts">
	import type { ContractWithEvents } from '$lib/types/contract';
	import {
		getStatusTranslationKey,
		getStatusColorClass
	} from '$lib/utils/helpers/contractStatusFormatter';
	import { contractStore } from '$lib/stores/contract.store';
	import { t } from 'svelte-i18n';
	import ContractActions from './ContractActions.svelte';
	import ReviewPromptModal from '$lib/components/reviews/ReviewPromptModal.svelte';
	import { hasUserReviewedContract, getOtherPartyPubkey } from '$lib/utils/review-helpers';
	import { getReviewsForEscrow } from '$lib/utils/nostr-review';
	import { getNpub } from '$lib/utils/nostrKeys';
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore nostr-tools type definitions issue
	import { nip19 } from 'nostr-tools';
	import UserNostrBadge from '../UserNostrBadge.svelte';

	const { contract, btcPrice 	} = $props<{
		contract: ContractWithEvents;
		btcPrice: number;
	}>();

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

	// Check if blockchain query failed (no blockchain status and not pending)
	const isBlockchainQueryFailed = $derived(
		contract.blockchainStatus === null &&
			!contract.isPending &&
			!contract.contractEvent.content.transactionHash
	);

	// Check review status for completed contracts
	$effect(() => {
		(async () => {
			const isCompleted = contract.status === 'completed' || contract.status === 'resolved';
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
				const userReviewed = await hasUserReviewedContract(contract.escrowData.id);

				// Check if other party has reviewed
				const reviews = await getReviewsForEscrow(contract.escrowData.id);
				const otherPartyPubkeyHex = getOtherPartyPubkey(contract, currentUserPubkey);
				
				// Convert other party's hex pubkey to npub for comparison with reviews
				const otherPartyPubkeyNpub = otherPartyPubkeyHex ? hexToNpub(otherPartyPubkeyHex) : null;
				const otherPartyReviewed = otherPartyPubkeyNpub
					? reviews.some(r => {
							// Reviews may have npub or hex format, so check both
							const reviewerHex = r.reviewerPubkey.startsWith('npub') 
								? npubToHex(r.reviewerPubkey) 
								: r.reviewerPubkey;
							return reviewerHex === otherPartyPubkeyHex || r.reviewerPubkey === otherPartyPubkeyNpub;
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

	function handleReviewSubmit(eventId: string) {
		reviewStatus.userReviewed = true;
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
	class="bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg {isBlockchainQueryFailed
		? 'pointer-events-none opacity-60'
		: ''}"
	class:cursor-not-allowed={isBlockchainQueryFailed}
>
	<div class="card-body">
		<div class="flex flex-col justify-between gap-2">
			<div class="flex items-start justify-between">
				<div class="min-w-0 flex-1">
					<small class="card-title line-clamp-1 text-lg">
						<button
							class="hover:text-primary cursor-pointer text-left transition-colors"
							onclick={openDrawer}
						>
							{contractStore.getContractKey(contract, 'taskTitle')}
						</button>
					</small>
					<div class="text-base-content/60 mt-1 line-clamp-2">
						{contractStore.getContractKey(contract, 'taskDescription')}
					</div>
				</div>

				<!-- Badges in top right corner -->
				<div class="ml-4 flex shrink-0 flex-col items-end gap-2">
					<div class="flex items-center gap-2 flex-wrap justify-end">
						{#if import.meta.env.DEV}
							<div class="badge badge-error badge-sm">
								{contract.escrowData?.id}
							</div>
						{/if}
						<div class="badge {getStatusColorClass(contract.status)} badge-sm">
							{#if contract?.isPending}
								<span class="loading loading-spinner loading-xs mr-1"></span>
							{/if}
							{$t(getStatusTranslationKey(contract.status))}
						</div>
						<div class="badge {getRoleBadgeClass(contract.isClient)} badge-sm">
							{contract.isClient ? $t('dashboard.client') : $t('dashboard.freelancer')}
						</div>
						
						<!-- Review Status Badges -->
						{#if (contract.status === 'completed' || contract.status === 'resolved') && !reviewStatus.isLoading}
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
						
						{#if reviewStatus.isLoading}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
					</div>

					<!-- Price with stacked design -->
					<div class="text-right">
						{#if btcPrice > 0}
							{@const priceData = formatPriceStacked(
								contractStore.getContractKey(contract, 'amount'),
								btcPrice
							)}
							<div class="text-base-content text-lg font-bold">
								{priceData.usd}
							</div>
							<div class="text-base-content/60 text-sm">
								{priceData.sats}
							</div>
						{:else}
							<div class="text-base-content text-lg font-bold">
								{formatRBTC(contractStore.getContractKey(contract, 'amount'))} RBTC
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
					class="text-base-content/60 h-6 w-6 shrink-0"
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
				<div class="flex flex-col">
					<small class="text-base-content/60 text-xs">
						{$t('dashboard.contracts.deadline')}
					</small>
					<span class="text-sm font-medium">
						{formatDate(contractStore.getContractKey(contract, 'estimatedCompletionTime'))}
					</span>
				</div>
			</div>

			<!-- Right: Empty space for balance -->
			<div class=""></div>
		</div>

		<div class="mt-1 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<!-- Left: User Info aligned with buttons -->
			<UserNostrBadge
				npub={contractStore.getContractKey(contract, 'otherPartyNpub')}
				role={contract.isClient ? $t('dashboard.freelancer') : $t('dashboard.client')}
			/>

			<!-- Right: Action Buttons -->
			<div class="flex w-full flex-col gap-3 sm:flex-row sm:items-center md:w-auto">
				{#if getAvailableActionsCount() > 0}
					<ContractActions
						{contract}
						containerClass="flex flex-row-reverse flex-wrap gap-2 w-full sm:w-auto"
						isInline={true}
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
			escrowId={contract.escrowData.id}
			revieweePubkey={revieweePubkey}
			escrowTxHash={contract.contractEvent.content.transactionHash}
			onClose={() => {
				isReviewModalOpen = false;
			}}
			onSubmit={handleReviewSubmit}
		/>
	{/if}
</div>
