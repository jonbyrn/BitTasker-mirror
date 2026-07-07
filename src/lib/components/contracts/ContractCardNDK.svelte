<script lang="ts">
	import {
		getStatusTranslationKey,
		getStatusColorClass
	} from '$lib/utils/helpers/contractStatusFormatterV2';
	import { t } from 'svelte-i18n';
	import TaskDeadlineDisplay from '../task/TaskDeadlineDisplay.svelte';
	import TaskLocationDisplay from '../task/TaskLocationDisplay.svelte';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
	import type { NDKPaymentContract } from '$lib/nostr/events/contract';
	import { adaptNDKContract } from '$lib/utils/reviews/contractAdapter';
	import { formatConvertedAmount } from '$lib/utils/helpers/currencyFormatter';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { PaymentContractRune } from '$lib/runes/contractRune.svelte';
	import ContractActionsCardNDK from './ContractActionsCardNDK.svelte';
	import ResolutionProposalSplitDisplay from './ResolutionProposalSplitDisplay.svelte';
	import { ContractStatus } from '$lib/utils/contract/types';
	import { generateUniversalMapLink } from '$lib/utils/location/maps';
	import ReviewPromptModal from '$lib/components/reviews/ReviewPromptModal.svelte';
	import { reviewStore } from '$lib/stores/review.store';

	const {
		contract,
		onOpenContractDrawer,
		rune: runeFromParent = undefined
	}: {
		contract: NDKPaymentContract;
		onOpenContractDrawer?: (rune: PaymentContractRune) => void;
		rune?: PaymentContractRune;
	} = $props();

	let ownedRune = $state<PaymentContractRune | null>(null);

	$effect(() => {
		if (runeFromParent) {
			ownedRune = null;
			return;
		}
		const rune = new PaymentContractRune(contract);
		ownedRune = rune;
		void rune.start();
		return () => {
			rune.stopSubscription();
		};
	});

	const contractRune = $derived(runeFromParent ?? ownedRune);

	// ── Review integration ──────────────────────────────────────────

	const liveEscrowStatus = $derived.by(() => {
		if (!contractRune) return undefined;
		// Use displayStatus (lifecycle-aware) instead of raw blockchainStatus so that V1 contracts
		// correctly map chain Completed → FundsReleased via Kind 31006 status events.
		// DisplayOnlyStatus values (InProgress=13, DisputeResolutionProposed=12) are not present
		// in ContractStatus so ContractStatus[status] returns undefined, causing adaptNDKContract
		// to fall back to the Nostr contract.status tag instead.
		const status = contractRune.displayStatus;
		return status !== undefined ? ContractStatus[status] : undefined;
	});

	const reviewContract = $derived.by(() => {
		const bd = contractRune?.blockchainData;
		const chainWallets =
			bd?.tasker && bd?.taskee ? { tasker: bd.tasker, taskee: bd.taskee } : undefined;
		return adaptNDKContract(contract, liveEscrowStatus, chainWallets);
	});

	const isReviewable = $derived(reviewContract?.isReviewable() ?? false);
	const contractEventId = $derived(reviewContract?.contractId ?? '');
	const contractPaymentId = $derived.by(() => {
		const rc = reviewContract;
		return rc?.paymentId ?? '';
	});

	// Default review state for when contract is not yet loaded
	const DEFAULT_REVIEW_STATE = {
		userReviewed: false,
		otherPartyReviewed: false,
		isLoading: false,
		revieweePubkey: null,
		reviews: [] as import('$lib/types/review').AttestedReview[],
		reviewsLoading: false,
		lastFetched: 0
	};

	// Subscribe to centralized review state using Svelte's auto-subscription
	// Access $reviewStore directly - this auto-subscribes and tracks reactivity
	const reviewState = $derived.by(() => {
		// Access store value directly via $ prefix (auto-subscription)
		const storeValue = $reviewStore;
		// Track version to ensure reactivity on any store updates
		void storeValue.version;

		if (!contractEventId) {
			return DEFAULT_REVIEW_STATE;
		}
		return storeValue.byContractId.get(contractEventId) ?? DEFAULT_REVIEW_STATE;
	});

	let showReviewModal = $state(false);
	let pendingReviewPrompt = $state(false);

	// Fetch review status when contract becomes reviewable
	$effect(() => {
		if (!isReviewable || !contractEventId || !reviewContract) return;

		// Use centralized store for fetching (handles caching and deduplication)
		reviewStore.fetchReviewStatus(contractEventId, contractPaymentId, reviewContract);
	});

	// Auto-open review modal after a completion action (accept, complete, etc.)
	$effect(() => {
		if (
			pendingReviewPrompt &&
			isReviewable &&
			!reviewState.isLoading &&
			!reviewState.userReviewed
		) {
			showReviewModal = true;
			pendingReviewPrompt = false;
		}
	});

	function handleReviewSubmitted() {
		reviewStore.markAsReviewed(contractEventId);
		showReviewModal = false;
		pendingReviewPrompt = false;
		reviewStore.refreshReviews(contractEventId, contractPaymentId, reviewContract);
	}

	function handleContractCompleted() {
		pendingReviewPrompt = true;
	}

	function openDrawer() {
		if (contractRune && onOpenContractDrawer) {
			onOpenContractDrawer(contractRune);
		}
	}

	// ── Other derived state ─────────────────────────────────────────

	const isTasker = $derived(
		contractRune !== null
			? contractRune.isTasker
			: contract.author.pubkey === contract.ndk?.activeUser?.pubkey
	);

	const statusAndActionsReady = $derived(
		contractRune?.statusHistoryReady === true ||
			contractRune?.optimisticBlockchainStatus == ContractStatus.Funded
	);

	const amountSats = $derived(
		formatConvertedAmount(contract.amount, contract.currency, {
			btcPrice: btcPrice.price,
			toCurrency: 'SATS'
		})
	);
	const amountUsd = $derived(
		formatConvertedAmount(contract.amount, contract.currency, {
			btcPrice: btcPrice.price,
			toCurrency: 'USD',
			suffix: ''
		})
	);

	const serviceLocation = $derived.by(() => {
		const snapshot = contract.agreementSnapshot;
		if (!snapshot?.serviceLocation?.location) return null;
		return snapshot.serviceLocation;
	});

	const serviceLocationMapLink = $derived.by(() => {
		if (!serviceLocation?.location) return null;
		return generateUniversalMapLink(serviceLocation.location, { label: serviceLocation.label });
	});
</script>

<div class="card bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg">
	<div class="card-body rounded-xl p-4 md:p-4">
		<!-- Top Row: Title + Role Badge -->
		<div class="mb-2 flex flex-row items-start justify-between gap-2">
			<div class="card-title line-clamp-2 min-w-0 flex-1 text-lg font-semibold">
				<button
					type="button"
					class="hover:text-primary cursor-pointer text-left transition-colors"
					onclick={openDrawer}
				>
					{contract.taskTitle}
				</button>
			</div>
			<div class="flex shrink-0 flex-wrap gap-1">
				<div class="badge {isTasker ? 'badge-primary' : 'badge-secondary'} badge-sm">
					{isTasker ? $t('dashboard.client') : $t('dashboard.freelancer')}
				</div>
				{#if import.meta.env.DEV && contract.paymentId}
					<div class="badge badge-error badge-sm">
						{contract.version}: {contract.paymentId}
					</div>
				{/if}
			</div>
		</div>

		<!-- Description + Badges -->
		<div class="mb-3 flex flex-row items-start justify-between gap-2">
			<div class="text-base-content/80 line-clamp-2 min-w-0 flex-1 text-sm whitespace-pre-line">
				{contract.taskDescription}
			</div>
			<div class="flex shrink-0 flex-col items-end gap-1.5">
				{#if statusAndActionsReady && contractRune}
					<div class="badge {getStatusColorClass(contractRune.displayStatus)} badge-sm">
						{#if contractRune.isPending}
							<span class="loading loading-spinner loading-xs mr-1"></span>
						{/if}
						{$t(getStatusTranslationKey(contractRune.displayStatus))}
					</div>
				{:else}
					<div
						class="badge badge-ghost badge-sm min-h-6 min-w-22 justify-center"
						aria-busy="true"
						aria-label={$t('common.loading')}
					>
						<span class="loading loading-spinner loading-xs text-base-content/60"></span>
					</div>
				{/if}
				<div
					class="badge {contract.tagValue('contextType') === 'service'
						? 'badge-info'
						: 'badge-outline'} badge-sm"
				>
					{contract.tagValue('contextType') === 'service' ? 'Service' : 'Task'}
				</div>
			</div>
		</div>

		<div class="mb-3 flex flex-row items-center justify-between gap-3">
			<div class="flex min-w-0 flex-1 flex-col gap-2">
				<TaskDeadlineDisplay deadline={contractRune?.effectiveEstimatedCompletionTime} />
				<TaskLocationDisplay
					locationText={serviceLocation?.label ?? ''}
					directionsLink={serviceLocationMapLink}
				/>
			</div>
			<div class="shrink-0 text-right">
				<div class="text-2xl font-bold">{amountUsd}</div>
				<div class="text-base-content/60 text-base">{amountSats}</div>
			</div>
		</div>

		{#if contractRune && statusAndActionsReady && contractRune.pendingResolutionProposal}
			<div class="border-base-300 bg-base-200/50 mb-3 rounded-xl border border-dashed p-3">
				<p class="text-base-content/80 mb-2 text-xs font-semibold tracking-wide uppercase">
					{$t('dashboard.contracts.actions.current_proposal')}
				</p>
				<ResolutionProposalSplitDisplay
					taskerShareWei={contractRune.pendingResolutionProposal.taskerWei}
					taskeeShareWei={contractRune.pendingResolutionProposal.taskeeWei}
					currency={contract.currency}
					btcPrice={btcPrice.price}
					isTasker={contractRune.isTasker}
					variant="compact"
					proposerIsTasker={contractRune.pendingResolutionProposal.proposerIsTasker}
				/>
			</div>
		{/if}

		{#if contractRune?.isFailed}
			<div class="alert alert-error mb-3 py-2 text-xs">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<div class="flex flex-col gap-1">
					<span class="font-semibold">{$t('dashboard.contracts.tx_reverted')}</span>
					<span>
						{#if contractRune.error?.startsWith('tx_reverted:')}
							{@const reason = contractRune.error.split(':')[1]}
							{#if reason}
								{$t('dashboard.contracts.tx_reverted_reason_' + reason)}
							{:else}
								{$t('dashboard.contracts.tx_reverted_description')}
							{/if}
						{:else}
							{$t('dashboard.contracts.tx_reverted_description')}
						{/if}
					</span>
				</div>
			</div>
		{:else if contractRune?.error && !contractRune.blockchainData}
			<div class="alert alert-warning mb-3 py-2 text-xs">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span>{$t('dashboard.contracts.blockchain_sync_error')}</span>
				<button
					type="button"
					class="btn btn-xs btn-outline"
					onclick={() => contractRune?.retryLoadBlockchainData()}
				>
					{$t('dashboard.contracts.retry')}
				</button>
			</div>
		{/if}

		<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<UserInfoDisplay
				pubkey={contract.otherPartyNpub ?? ''}
				profileLink={contract.otherPartyNpub ?? ''}
				size="sm"
				reviewBadge={reviewState.otherPartyReviewed && !reviewState.isLoading
					? $t('reviews.review_received')
					: null}
			/>

			<div class="flex flex-row items-center gap-2 md:justify-end">
				{#if statusAndActionsReady && isReviewable}
					{#if reviewState.isLoading}
						<div class="flex h-8 w-24 items-center justify-center">
							<span class="loading loading-spinner loading-sm"></span>
						</div>
					{:else if reviewState.userReviewed}
						<button
							type="button"
							class="btn btn-success btn-sm gap-1"
							disabled
							title={$t('reviews.you_reviewed')}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
								/></svg
							>
							{$t('reviews.reviewed')}
						</button>
					{:else if reviewState.revieweePubkey}
						<button
							type="button"
							class="btn btn-warning btn-outline btn-sm flex-1 gap-1 md:flex-none"
							onclick={() => (showReviewModal = true)}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
								/></svg
							>
							{$t('reviews.leave_review')}
						</button>
					{/if}
				{/if}
				{#if contractRune && statusAndActionsReady}
					<ContractActionsCardNDK
						{contractRune}
						btcPrice={btcPrice.price}
						onOpenDrawer={openDrawer}
						onContractCompleted={handleContractCompleted}
					/>
				{/if}
			</div>
		</div>
	</div>
</div>

<ReviewPromptModal
	isOpen={showReviewModal}
	contract={reviewContract}
	escrowId={contractEventId}
	escrowTxHash={reviewContract.txHash}
	onClose={() => (showReviewModal = false)}
	onSubmit={handleReviewSubmitted}
/>
