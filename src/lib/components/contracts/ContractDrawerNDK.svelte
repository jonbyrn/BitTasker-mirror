<script lang="ts">
	import type { Attachment } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import Drawer from '$lib/components/Drawer.svelte';
	import BookingDatesDisplay from '$lib/components/shared/BookingDatesDisplay.svelte';
	import UsdSatsDisplay from '$lib/components/shared/UsdSatsDisplay.svelte';
	import ContractTimelineNDK from './ContractTimelineNDK.svelte';
	import ContractActionsDrawerNDK from './ContractActionsDrawerNDK.svelte';
	import ResolutionProposalSplitDisplay from './ResolutionProposalSplitDisplay.svelte';
	import ServiceAgreementSummary from './ServiceAgreementSummary.svelte';
	import VerifiedReviewCard from '$lib/components/reviews/VerifiedReviewCard.svelte';
	import {
		getStatusColorClass,
		getStatusTranslationKey
	} from '$lib/utils/helpers/contractStatusFormatterV2';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
	import type { PaymentContractRune } from '$lib/runes/contractRune.svelte';
	import { buildContractTimelineRows } from '$lib/utils/contract/buildContractTimelineRows';
	import { getServiceContractLocationPresentationFromAgreementSnapshot } from '$lib/utils/service-contract/location';
	import { generateAllMapLinks } from '$lib/utils/location/maps';
	import IconMapMarker from '~icons/mdi/map-marker';
	import IconOpenInNew from '~icons/mdi/open-in-new';
	import ReviewPromptModal from '$lib/components/reviews/ReviewPromptModal.svelte';
	import { adaptNDKContract } from '$lib/utils/reviews/contractAdapter';
	import { ContractStatus } from '$lib/utils/contract/types';
	import { reviewStore } from '$lib/stores/review.store';
	import Gallery, { type GalleryItem } from '$lib/components/Gallery.svelte';

	const { isOpen, onClose, contractRune, btcPrice } = $props<{
		isOpen: boolean;
		onClose: () => void;
		contractRune: PaymentContractRune | null;
		btcPrice: number;
	}>();

	let isTechnicalDetailsOpen = $state(false);
	let isDescriptionExpanded = $state(false);
	let descriptionEl = $state<HTMLElement | null>(null);
	let isTruncated = $state(false);
	let isDetailsOpen = $state(false);

	function checkTruncation() {
		if (descriptionEl) {
			isTruncated = descriptionEl.scrollHeight > descriptionEl.clientHeight;
		}
	}

	const contract = $derived(contractRune?.contract);
	const timelineRows = $derived.by(() => {
		if (!contractRune) return [];
		void contractRune.timelineRevision;
		return buildContractTimelineRows({
			contract: contractRune.contract,
			statusEvents: contractRune.statusEvents
		});
	});
	const timelineDisplayCount = $derived(timelineRows.length);

	// Map completion attachments to GalleryItem so Gallery handles image/video rendering.
	const completionGalleryItems = $derived<GalleryItem[]>(
		(contractRune?.completionAttachments ?? []).map((att: Attachment) => ({
			url: att.url,
			alt: att.alt || undefined,
			type: att.type || undefined,
			cloudflareId: att.cloudflareId || undefined
		}))
	);

	function formatRBTC(amount: number): string {
		const num = Number(amount);
		if (Number.isNaN(num)) return '0.0000';
		return num.toFixed(4);
	}

	const drawerTitle = $derived(contract?.taskTitle ?? '');

	// Service location from the agreement snapshot (for service contracts)
	const serviceLocationPresentation = $derived.by(() => {
		const snapshot = contract?.agreementSnapshot;
		if (!snapshot) return null;
		return getServiceContractLocationPresentationFromAgreementSnapshot(snapshot);
	});

	// Map links for the service location
	const mapLinks = $derived.by(() => {
		const location = contract?.agreementSnapshot?.serviceLocation?.location;
		if (!location) return null;
		return generateAllMapLinks(location, { label: serviceLocationPresentation?.label });
	});

	const isServiceContract = $derived(contract?.tagValue('contextType') === 'service');

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
		if (!contract) return null;
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

	// Default review state for when no contract is loaded
	const defaultReviewState = {
		userReviewed: false,
		otherPartyReviewed: false,
		isLoading: false,
		revieweePubkey: null,
		reviews: [],
		reviewsLoading: false,
		lastFetched: 0
	};

	// Reactive review state using Svelte's auto-subscription with $reviewStore
	const reviewState = $derived.by(() => {
		if (!contractEventId) {
			return defaultReviewState;
		}
		return $reviewStore.byContractId.get(contractEventId) ?? defaultReviewState;
	});

	let showReviewModal = $state(false);
	let pendingReviewPrompt = $state(false);

	// Fetch review status when drawer opens and contract is reviewable
	// Single effect that handles all review data fetching
	$effect(() => {
		if (!isOpen || !isReviewable || !contractEventId || !reviewContract) return;

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
</script>

<Drawer {isOpen} title={drawerTitle} {onClose} position="right" isScrollable={true}>
	{#if contract && contractRune}
		<!-- Contract Details -->
		<div class="min-w-0 space-y-6 overflow-x-hidden">
			<!-- Contract Info Card -->
			<div class="card bg-base-200 min-w-0 overflow-hidden">
				<div class="card-body min-w-0 p-4">
					<!-- Row 1: User info | Role + Status badges (stacked, right-aligned) -->
					<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
						<UserInfoDisplay
							pubkey={contract.otherPartyNpub ?? ''}
							profileLink={contract.otherPartyNpub ?? ''}
							size="sm"
							reviewBadge={reviewState.otherPartyReviewed && !reviewState.isLoading
								? $t('reviews.review_received')
								: null}
							avatarAlt={$t('dashboard.task_details_by_task.avatar_alt')}
						/>
						<div class="flex shrink-0 flex-col items-end gap-2">
							<div
								class="badge {contractRune.isTasker ? 'badge-primary' : 'badge-secondary'} shrink-0"
							>
								{contractRune.isTasker ? $t('dashboard.client') : $t('dashboard.freelancer')}
							</div>
							<div class="badge {getStatusColorClass(contractRune.displayStatus)} shrink-0">
								{#if contractRune.isPending}
									<span class="loading loading-spinner loading-xs mr-1"></span>
								{/if}
								{$t(getStatusTranslationKey(contractRune.displayStatus))}
							</div>
						</div>
					</div>

					<!-- Row 2: Task title + description | Price block (same row on all sizes) -->
					<div class="mb-4 flex flex-row flex-nowrap items-start justify-between gap-4">
						<div class="min-w-0 flex-1">
							<p class="text-lg leading-tight font-bold">
								{contract.taskTitle ?? ''}
							</p>
							<p
								class="text-base-content/60 mt-1 text-sm leading-relaxed {!isDescriptionExpanded
									? 'line-clamp-3'
									: ''}"
								bind:this={descriptionEl}
								onmouseenter={checkTruncation}
							>
								{contract.taskDescription ?? ''}
							</p>
							{#if isTruncated}
								<button
									class="btn btn-ghost btn-xs text-base-content/40 hover:text-base-content/70 mt-1 px-1"
									onclick={() => (isDescriptionExpanded = !isDescriptionExpanded)}
								>
									{isDescriptionExpanded ? 'Show less' : 'Show more'}
								</button>
							{/if}
						</div>
						<div class="shrink-0 pl-4 text-right">
							{#if btcPrice > 0}
								<UsdSatsDisplay
									amount={contract.amount * btcPrice}
									{btcPrice}
									satsKey="bids.sats"
								/>
							{:else}
								<p class="text-lg font-bold">
									{formatRBTC(contract.amount)} RBTC
								</p>
							{/if}
						</div>
					</div>

					<!-- Service Location (for TASKER_LOCATION services) -->
					{#if serviceLocationPresentation && mapLinks}
						<div class="border-base-200 mb-4 border-t pt-3" data-testid="contract-service-location">
							<div class="flex items-start gap-3">
								<div class="bg-primary/10 mt-0.5 rounded-full p-1.5">
									<IconMapMarker class="text-primary h-4 w-4" />
								</div>
								<div class="min-w-0 flex-1">
									<p
										class="text-base-content/60 mb-0.5 text-xs font-medium tracking-wider uppercase"
									>
										{serviceLocationPresentation.mode === 'tasker_location'
											? $t('dashboard.services.my_services.quote_inbox.tasker_location')
											: $t('dashboard.services.my_services.quote_inbox.taskee_location')}
									</p>
									<p class="word-break-words text-sm font-medium">
										{serviceLocationPresentation.label}
									</p>
									<div class="mt-2 flex flex-wrap gap-2">
										<a
											href={mapLinks.universal}
											target="_blank"
											rel="noopener noreferrer"
											class="btn btn-xs btn-primary btn-outline gap-1"
										>
											<IconOpenInNew class="h-3 w-3" />
											{$t('dashboard.contracts.open_in_maps')}
										</a>
										<div class="dropdown dropdown-top">
											<div tabindex="0" role="button" class="btn btn-xs btn-ghost">
												{$t('dashboard.contracts.more_map_options')}
											</div>
											<ul
												class="dropdown-content menu bg-base-100 rounded-box z-10 w-40 p-2 shadow"
											>
												<li>
													<a href={mapLinks.google} target="_blank" rel="noopener noreferrer">
														Google Maps
													</a>
												</li>
												<li>
													<a href={mapLinks.apple} target="_blank" rel="noopener noreferrer">
														Apple Maps
													</a>
												</li>
												<li>
													<a href={mapLinks.waze} target="_blank" rel="noopener noreferrer">
														Waze
													</a>
												</li>
											</ul>
										</div>
									</div>
								</div>
							</div>
						</div>
					{/if}

					<!-- Row 3: Date row -->
					<div class="w-full flex-1">
						{#if contractRune.effectiveEstimatedStartTime != null && contractRune.effectiveEstimatedCompletionTime != null}
							<BookingDatesDisplay
								startTime={contractRune.effectiveEstimatedStartTime}
								endTime={contractRune.effectiveEstimatedCompletionTime}
								startLabel={$t('dashboard.services.detail.book_now_drawer.start_date')}
								endLabel={$t('dashboard.services.detail.book_now_drawer.delivery_date')}
							/>
						{/if}
					</div>

					<!-- Row 4: Review status and action -->
					{#if isReviewable}
						<div class="mb-3 flex flex-wrap items-center justify-end gap-2">
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
									class="btn btn-warning btn-outline btn-sm gap-1"
									title={$t('reviews.leave_review')}
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
						</div>
					{/if}

					<!-- Blockchain sync error banner -->
					{#if contractRune.isFailed}
						<div class="alert alert-error mb-3 text-sm">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5 shrink-0"
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
								{#if contract.transactionHash}
									<a
										class="link link-primary text-xs"
										href="https://rootstock.blockscout.com/tx/{contract.transactionHash}"
										target="_blank"
										rel="noopener noreferrer"
									>
										{$t('dashboard.contracts.view_on_explorer')}
									</a>
								{/if}
							</div>
						</div>
					{:else if contractRune.error && !contractRune.blockchainData}
						<div class="alert alert-warning mb-3 text-sm">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5 shrink-0"
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
								onclick={() => contractRune.retryLoadBlockchainData()}
							>
								{$t('dashboard.contracts.retry')}
							</button>
						</div>
					{/if}

					<!-- Blockchain loading indicator -->
					{#if !contractRune.blockchainData && !contractRune.error}
						<div class="text-base-content/60 mb-3 flex items-center gap-2 text-sm">
							<span class="loading loading-spinner loading-xs"></span>
							<span>{$t('dashboard.contracts.blockchain_syncing')}</span>
						</div>
					{/if}

					<!-- Action buttons (right-aligned) -->
					{#if contractRune}
						<div class="flex justify-end gap-2">
							<ContractActionsDrawerNDK
								{contractRune}
								{btcPrice}
								onContractCompleted={handleContractCompleted}
							/>
						</div>
					{/if}
				</div>
			</div>

			{#if contractRune.pendingResolutionProposal}
				<div class="card bg-base-200 min-w-0 overflow-hidden">
					<div class="card-body min-w-0 p-4">
						<h4 class="mb-3 font-semibold">
							{$t('dashboard.contracts.actions.current_proposal')}
						</h4>
						<ResolutionProposalSplitDisplay
							taskerShareWei={contractRune.pendingResolutionProposal.taskerWei}
							taskeeShareWei={contractRune.pendingResolutionProposal.taskeeWei}
							currency={contract.currency}
							{btcPrice}
							isTasker={contractRune.isTasker}
							variant="compact"
							proposerIsTasker={contractRune.pendingResolutionProposal.proposerIsTasker}
						/>
					</div>
				</div>
			{/if}

			<!-- Completion Evidence and Status Timeline -->
			<div class="flex flex-col gap-6 xl:flex-row">
				{#if contractRune.completionText || (contractRune.completionAttachments?.length ?? 0) > 0}
					<div class="card bg-base-200 flex-1 overflow-hidden">
						<div class="card-body p-4">
							<h4 class="mb-3 font-semibold">
								{$t('dashboard.contracts.timeline.completion_evidence')}
							</h4>

							{#if contractRune.completionText}
								<div class="mb-4 text-sm whitespace-pre-wrap">
									{contractRune.completionText}
								</div>
							{/if}

							{#if completionGalleryItems.length > 0}
								<Gallery galleryID="contract-completion-gallery" items={completionGalleryItems} />
							{/if}
						</div>
					</div>
				{/if}

				<div class="card bg-base-200 flex-1">
					<div class="card-body p-4">
						<div class="mb-3 flex items-center gap-3">
							{#if timelineDisplayCount > 0}
								<div
									class="bg-primary text-primary-content flex h-8 min-h-8 w-8 min-w-8 items-center justify-center rounded-full text-base font-semibold"
								>
									{timelineDisplayCount}
								</div>
							{/if}
							<h4 class="font-semibold">
								{$t('dashboard.contracts.timeline.status_timeline')}
							</h4>
						</div>

						<ContractTimelineNDK {contractRune} {btcPrice} />
					</div>
				</div>
			</div>

			<!-- Contract Reviews -->
			{#if isReviewable && (reviewState.reviews.length > 0 || reviewState.reviewsLoading)}
				<div class="card bg-base-200 flex-1">
					<div class="card-body p-4">
						<h4 class="mb-3 font-semibold">
							{$t('reviews.summary.title')}
						</h4>

						{#if reviewState.reviewsLoading}
							<span class="loading loading-spinner loading-sm"></span>
						{:else}
							<div class="space-y-4">
								{#each reviewState.reviews as review (review.attestationEventId)}
									<VerifiedReviewCard
										{review}
										showVerificationBadge={true}
										revieweeRole={review.content.revieweeRole}
									/>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Agreement / Bid Details -->
			<div class="card bg-base-200 overflow-hidden">
				<div class="card-body bg-base-200 p-0">
					<div
						class="collapse-arrow border-base-300 collapse border-b"
						class:collapse-open={isDetailsOpen}
					>
						<button
							type="button"
							class="collapse-title px-4 py-3 text-left text-sm font-medium"
							onclick={() => (isDetailsOpen = !isDetailsOpen)}
							aria-expanded={isDetailsOpen}
							aria-controls="agreement-content-ndk"
						>
							{isServiceContract
								? $t('dashboard.contracts.service_agreement_details')
								: $t('dashboard.contracts.bid_details')}
						</button>
						<div id="agreement-content-ndk" class="collapse-content">
							<div class="px-4 pb-4">
								{#if isServiceContract}
									<ServiceAgreementSummary
										selectedTierLabel={contract.agreementSnapshot?.selectedTierLabel}
										agreementSnapshot={contract.agreementSnapshot}
										instantOrderId={contract.tagValue('purchaseMode') === 'instant_buy'
											? contract.taskId
											: null}
										estimatedStartTime={contractRune.effectiveEstimatedStartTime ?? null}
										estimatedCompletionTime={contractRune.effectiveEstimatedCompletionTime ?? null}
									/>
								{:else}
									{@const bidContent = contractRune.originalBid?.bidContent}
									{#if bidContent}
										<div class="space-y-3">
											{#if bidContent.proposedApproach || bidContent.description}
												<div>
													<span class="text-base-content/50 text-xs font-medium"
														>{$t('dashboard.contracts.approach')}</span
													>
													<p
														class="text-base-content/80 mt-1 text-sm leading-relaxed whitespace-pre-line"
													>
														{bidContent.proposedApproach || bidContent.description}
													</p>
												</div>
											{/if}
											{#if bidContent.estimatedDuration}
												<div>
													<span class="text-base-content/50 text-xs font-medium"
														>{$t('dashboard.contracts.estimated_duration')}</span
													>
													<p class="text-base-content/80 mt-1 text-sm">
														{bidContent.estimatedDuration}
													</p>
												</div>
											{/if}
											{#if bidContent.amount}
												<div>
													<span class="text-base-content/50 text-xs font-medium"
														>{$t('dashboard.contracts.original_amount')}</span
													>
													<p class="text-base-content/80 mt-1 text-sm font-medium">
														${bidContent.amount.toLocaleString()}
														{bidContent.currency || 'USD'}
													</p>
												</div>
											{/if}
										</div>
									{:else}
										<p class="text-base-content/50 text-sm">
											{$t('dashboard.contracts.bid_info_not_available')}
										</p>
									{/if}
								{/if}
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Technical Details -->
			<div class="card bg-base-200 mb-16 overflow-hidden sm:mb-0">
				<div class="card-body bg-base-200 p-0">
					<div
						class="collapse-arrow border-base-300 collapse border-b"
						class:collapse-open={isTechnicalDetailsOpen}
					>
						<button
							type="button"
							class="collapse-title px-4 py-3 text-left text-sm font-medium"
							onclick={() => (isTechnicalDetailsOpen = !isTechnicalDetailsOpen)}
							aria-expanded={isTechnicalDetailsOpen}
							aria-controls="technical-details-content-ndk"
						>
							{$t('dashboard.contracts.technical_details')}
						</button>
						<div id="technical-details-content-ndk" class="collapse-content">
							<div class="px-4 pb-4">
								<div class="space-y-3 text-xs">
									<div>
										<span class="text-base-content/60">{$t('dashboard.contracts.task_id')}:</span>
										<div class="bg-base-300 mt-1 rounded p-2 font-mono text-xs break-all">
											{contract.taskId}
										</div>
									</div>
									<div>
										<span class="text-base-content/60"
											>{$t('dashboard.contracts.client_pubkey')}:</span
										>
										<div class="bg-base-300 mt-1 rounded p-2 font-mono text-xs break-all">
											{contract.taskerPubkey ?? ''}
										</div>
									</div>
									<div>
										<span class="text-base-content/60"
											>{$t('dashboard.contracts.freelancer_pubkey')}:</span
										>
										<div class="bg-base-300 mt-1 rounded p-2 font-mono text-xs break-all">
											{contract.taskeePubkey ?? ''}
										</div>
									</div>
									<div>
										<span class="text-base-content/60"
											>{$t('dashboard.contracts.contract_event_id')}:</span
										>
										<div class="bg-base-300 mt-1 rounded p-2 font-mono text-xs break-all">
											{contract.id}
										</div>
									</div>
									<div>
										<span class="text-base-content/60">{$t('dashboard.contracts.currency')}:</span>
										<div class="mt-1 font-semibold">
											{contract.currency}
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	{:else}
		<div class="flex items-center justify-center py-12">
			<p class="text-base-content/60">{$t('dashboard.contracts.loading')}</p>
		</div>
	{/if}
</Drawer>

{#if reviewContract}
	<ReviewPromptModal
		isOpen={showReviewModal}
		contract={reviewContract}
		escrowId={contractEventId}
		escrowTxHash={reviewContract.txHash}
		onClose={() => (showReviewModal = false)}
		onSubmit={handleReviewSubmitted}
	/>
{/if}
