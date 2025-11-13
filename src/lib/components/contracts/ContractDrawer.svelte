<script lang="ts">
	import type { ContractWithEvents } from '$lib/types/contract';
	import type { Attachment } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import { untrack } from 'svelte';
	import { formatUSDWithSatsSync } from '$lib/utils/helpers/currencyFormatter';
	import Drawer from '$lib/components/Drawer.svelte';
	import ContractTimeline from './ContractTimeline.svelte';
	import ContractActions from './ContractActions.svelte';
	import Gallery from '$lib/components/Gallery.svelte';
	import { fetchProfileMetadata, fetchComprehensiveProfile } from '$lib/utils/nostr-message';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import TaskCompletionModal from './TaskCompletionModal.svelte';
	import { contractUpdateStore } from '$lib/utils/wallet/escrowEvents';
	import { getUserContracts } from '$lib/utils/nostr-bid';

	const { contract, isOpen, btcPrice, onClose, onUpdate } = $props<{
		contract: ContractWithEvents | null;
		isOpen: boolean;
		btcPrice: number;
		onClose: () => void;
		onUpdate: () => void;
	}>();

	// Local contract state (updated reactively from blockchain)
	let localContract = $state<ContractWithEvents | null>(null);
	let isReloadingContract = $state(false);
	let processedEscrowIds = $state<Set<string>>(new Set());
	let currentEscrowId = $state<string | null>(null);

	// Reset local contract when prop changes (but only if escrowId actually changed)
	$effect(() => {
		if (contract) {
			const newEscrowId = contract.contract.escrowId;
			// Only reset if this is a different contract (different escrowId)
			if (currentEscrowId !== newEscrowId) {
				currentEscrowId = newEscrowId;
				// Reset local contract when switching to a different contract
				localContract = null;
				// Clear processed IDs when switching contracts
				processedEscrowIds.clear();
			}
			// If same escrowId but contract prop updated, don't reset localContract
			// This prevents loops when parent updates the contract object reference
		} else {
			currentEscrowId = null;
			localContract = null;
			processedEscrowIds.clear();
		}
	});

	// Use local contract if available, otherwise use prop
	const displayContract = $derived(localContract || contract);

	// Technical details toggle state
	let isTechnicalDetailsOpen = $state(false);
	let isOriginalBidOpen = $state(false);

	// Modal state
	let showDeleteConfirm = $state(false);
	let showAcceptConfirm = $state(false);
	let showDisputeConfirm = $state(false);
	let showCancelConfirm = $state(false);
	let showCompletionModal = $state(false);

	// Action handlers (set by ContractActions)
	let acceptTaskHandler: (() => Promise<void>) | null = $state(null);
	let disputeTaskHandler: (() => Promise<void>) | null = $state(null);
	let deleteContractHandler: (() => Promise<void>) | null = $state(null);
	let cancelEscrowHandler: (() => Promise<void>) | null = $state(null);
	let completeTaskWithAttachmentsHandler: ((attachments: Attachment[]) => Promise<void>) | null = $state(null);

	// Taskee profile state
	let taskeeProfile = $state<{
		name?: string;
		picture?: string;
		createdAt?: string;
		reviews?: Array<{ id: string; from: string; rating: number; text: string; date: string }>;
		averageRating?: number;
		tasksCompleted?: number;
	} | null>(null);
	let isLoadingTaskeeProfile = $state(false);

	// Load taskee profile
	$effect(() => {
		if (displayContract) {
			const taskeePubkey = displayContract.isClient
				? displayContract.contract.freelancerPubkey
				: displayContract.contract.clientPubkey;
			loadTaskeeProfile(taskeePubkey);
		}
	});

	// Subscribe to contract update store and reload contract when it's updated
	$effect(() => {
		if (!isOpen) return;

		// Use untrack to prevent tracking displayContract changes
		// We only want to react to contractUpdateStore changes
		const currentContract = untrack(() => displayContract);
		if (!currentContract) return;

		const escrowIds = $contractUpdateStore;
		const currentEscrowId = currentContract.contract.escrowId;

		// Check if this contract's escrowId is in the update queue
		// and we haven't already processed it
		// Don't remove from store - let parent process it too
		// Just mark as processed locally to prevent duplicate reloads
		if (
			escrowIds.includes(currentEscrowId) &&
			!isReloadingContract &&
			!processedEscrowIds.has(currentEscrowId)
		) {
			// Mark as processed before reloading to prevent re-triggering
			processedEscrowIds.add(currentEscrowId);
			// Reload this specific contract (parent will also process it separately)
			reloadContract(currentEscrowId);
		}
	});

	// Reload a specific contract
	async function reloadContract(escrowId: string) {
		try {
			isReloadingContract = true;
			const contracts = await getUserContracts({ escrowIds: [escrowId] });
			if (contracts.length > 0) {
				localContract = contracts[0];
				// Don't call onUpdate() here - it causes the parent to reload,
				// which creates a new contract object reference and triggers loops
				// The parent will update automatically when contractUpdateStore is processed
			}
		} catch (error) {
			console.error('Failed to reload contract:', error);
			// Remove from processed set on error so it can be retried
			processedEscrowIds.delete(escrowId);
		} finally {
			isReloadingContract = false;
		}
	}

	async function loadTaskeeProfile(pubkey: string) {
		try {
			isLoadingTaskeeProfile = true;
			const [basicProfile, comprehensiveProfile] = await Promise.all([
				fetchProfileMetadata(pubkey),
				fetchComprehensiveProfile(pubkey).catch(() => null)
			]);

			const avgRating = comprehensiveProfile?.reviews && comprehensiveProfile.reviews.length > 0
				? comprehensiveProfile.reviews.reduce((sum, review) => sum + review.rating, 0) / comprehensiveProfile.reviews.length
				: 0;

			taskeeProfile = {
				name: basicProfile.name,
				picture: basicProfile.picture,
				createdAt: basicProfile.createdAt,
				reviews: comprehensiveProfile?.reviews || [],
				averageRating: avgRating,
				tasksCompleted: comprehensiveProfile?.reviews?.length || 0
			};
		} catch (error) {
			console.error('Failed to load taskee profile:', error);
			taskeeProfile = null;
		} finally {
			isLoadingTaskeeProfile = false;
		}
	}

	// Format member since date
	function formatMemberSinceDate(dateString: string | undefined): string {
		if (!dateString) return '';
		try {
			const date = new Date(dateString);
			if (isNaN(date.getTime())) return dateString;
			return date.toLocaleDateString('en-US', {
				month: 'short',
				year: 'numeric'
			});
		} catch (error) {
			return dateString;
		}
	}

	// Helper function to detect video files
	function isVideoFile(url: string): boolean {
		const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov'];
		const urlLower = url.toLowerCase();
		return videoExtensions.some((ext) => urlLower.endsWith(ext));
	}

	// Helper function to prepare images for Gallery component
	const prepareGalleryImages = async (attachments: Attachment[]) => {
		const imagePromises = attachments
			.filter((attachment) => !isVideoFile(attachment.url))
			.map((attachment) => {
				return new Promise((resolve) => {
					const img = new Image();
					img.onload = () => {
						resolve({
							url: attachment.url,
							alt: attachment.alt || $t('dashboard.task_details_by_task.task_attachment'),
							width: img.naturalWidth,
							height: img.naturalHeight,
							size: attachment.size
						});
					};
					img.onerror = () => {
						resolve({
							url: attachment.url,
							alt: attachment.alt || $t('dashboard.task_details_by_task.task_attachment'),
							width: 0,
							height: 0,
							size: attachment.size
						});
					};
					img.src = attachment.url;
				});
			});

		return await Promise.all(imagePromises);
	};

	// Format RBTC amount
	function formatRBTC(amount: string): string {
		const num = parseFloat(amount);
		return num.toFixed(4);
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
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Handle action completion
	function handleActionComplete() {
		onUpdate();
	}

	/**
	 * Get status badge color classes based on task status
	 */
	export function getStatusColorClass(status: string): string {
		switch (status.toLowerCase()) {
			case 'cancelled':
				return 'badge-error'; // Red
			case 'active':
			case 'in_progress':
			case 'funded':
				return 'badge-info'; // Blue
			case 'completed':
			case 'resolved':
				return 'badge-success'; // Green
			case 'disputed':
			case 'in_dispute':
				return 'badge-warning'; // Yellow
			default:
				return 'badge-ghost';
		}
	}

	const getAvailableActionsCount = () => {
		if (!displayContract) return 0;
		let count = 0;
		if (displayContract.canComplete) count++;
		if (displayContract.canAccept) count++;
		if (displayContract.canDispute) count++;
		if (displayContract.canPropose) count++;
		if (displayContract.canAcceptProposal) count++;
		if (displayContract.canCancel) count++;
		if (displayContract.canResolveTimelock) count++;
		return count;
	};
</script>

<Drawer
	{isOpen}
	title={displayContract?.contract?.taskTitle}
	{onClose}
	position="right"
	isScrollable={true}
>
	{#snippet children()}
		{#if displayContract}
			<!-- Contract Details -->
			<div class="space-y-6">
				<!-- Contract Info Card -->
				<div class="card bg-base-200">
				<div class="card-body p-4">
					<div class="mb-3 flex items-center justify-between gap-2">
						<h4 class="font-semibold">{$t('dashboard.contracts.contract_details')}</h4>
						<div class="flex items-center gap-2 shrink-0">
							<div class="badge {getStatusColorClass(displayContract.contract.status)}">
								{$t(`dashboard.contracts.status.${displayContract.contract.status}`)}
							</div>
							<div class="badge {displayContract.isClient ? 'badge-primary' : 'badge-secondary'}">
								{displayContract.isClient ? $t('dashboard.client') : $t('dashboard.freelancer')}
							</div>
						</div>
					</div>

					<div class="space-y-3">
						<!-- Taskee Info -->
						<div class="mb-4 pb-4 border-b border-base-300">
							<div class="flex items-center gap-3">
								<div class="avatar shrink-0">
									<div class="bg-base-300 flex items-center justify-center rounded-full h-10 w-10">
										{#if isLoadingTaskeeProfile}
											<div class="skeleton rounded-full h-10 w-10"></div>
										{:else if taskeeProfile?.picture}
											<img
												src={taskeeProfile.picture}
												alt="Taskee avatar"
												class="rounded-full object-cover h-10 w-10"
											/>
										{:else}
											<div
												class="avatar placeholder text-neutral-content bg-primary flex items-center justify-center overflow-hidden rounded-full text-center h-10 w-10"
											>
												<span class="text-sm font-semibold">
													{(taskeeProfile?.name || 'A').charAt(0).toUpperCase()}
												</span>
											</div>
										{/if}
									</div>
								</div>

								<div class="flex flex-col min-w-0 flex-1">
									<span class="text-sm font-medium truncate">
										{isLoadingTaskeeProfile
											? 'Loading...'
											: taskeeProfile?.name ||
												$t('dashboard.contracts.anonymous')}
									</span>

									<!-- Review Stars -->
									{#if !isLoadingTaskeeProfile && taskeeProfile}
										<div class="mt-1 flex items-center min-w-0">
											<div class="flex shrink-0">
												{#each Array(5) as _, i}
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="h-3 w-3 {i < (taskeeProfile.averageRating || 0)
															? 'text-yellow-400'
															: 'text-base-content/30'}"
														fill="currentColor"
														viewBox="0 0 24 24"
													>
														<path
															d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
														/>
													</svg>
												{/each}
											</div>
											<span class="text-base-content/60 ml-1 text-xs truncate">
												{(taskeeProfile.averageRating || 0).toFixed(1)} ({taskeeProfile
													.tasksCompleted || 0} {$t('dashboard.contracts.tasks')})
											</span>
										</div>
									{/if}

									{#if !isLoadingTaskeeProfile && taskeeProfile?.createdAt}
										<p class="text-base-content/60 mt-1 text-xs">
											{$t('dashboard.contracts.member_since')}{' '}
											{formatMemberSinceDate(taskeeProfile.createdAt)}
										</p>
									{/if}
								</div>
							</div>
						</div>

						<div class="flex justify-between gap-2">
							<span class="text-base-content/70">{$t('dashboard.contracts.amount')}:</span>
							<span class="font-semibold"
								>{btcPrice > 0
									? formatUSDWithSatsSync(displayContract.contract.amount, btcPrice)
									: `${formatRBTC(displayContract.contract.amount)} RBTC`}</span
							>
						</div>

						<div class="flex justify-between gap-2">
							<span class="text-base-content/70 whitespace-nowrap"
								>{$t('dashboard.contracts.estimated_start')}:</span
							>
							<span class="overflow-wrap-anywhere text-sm break-all whitespace-normal"
								>{formatDate(displayContract.contract.estimatedStartTime)}</span
							>
						</div>

						<div class="flex justify-between gap-2">
							<span class="text-base-content/70 whitespace-nowrap"
								>{$t('dashboard.contracts.estimated_completion')}:</span
							>
							<span class="overflow-wrap-anywhere text-sm break-all whitespace-normal"
								>{formatDate(displayContract.contract.estimatedCompletionTime)}</span
							>
						</div>

						<div class="flex justify-between gap-2">
							<span class="text-base-content/70">{$t('dashboard.contracts.created')}:</span>
							<span class="text-sm">{formatDate(displayContract.contract.createdAt)}</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Task Description Card -->
			<div class="card bg-base-200 overflow-hidden">
				<div class="card-body p-4">
					<h4 class="mb-3 font-semibold">{$t('dashboard.contracts.task_description')}</h4>
					<p class="text-base-content/80 text-sm leading-relaxed">
						{displayContract.contract.taskDescription}
					</p>

					<!-- Original Bid Proposal - Expandable Section -->
					<div class="mt-4">
						<div class="bg-transparent">
							<button
								class="flex w-full cursor-pointer items-center justify-between px-0 py-2 text-sm font-medium"
								onclick={() => (isOriginalBidOpen = !isOriginalBidOpen)}
							>
								<span>{$t('dashboard.contracts.original_bid_proposal')}</span>
								<svg
									class="h-4 w-4 transition-transform duration-200 {isOriginalBidOpen
										? 'rotate-180'
										: 'rotate-0'}"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 9l-7 7-7-7"
									/>
								</svg>
							</button>
							{#if isOriginalBidOpen}
								<div class="px-0 pb-0">
									<div class="bg-base-300 space-y-2 rounded-lg p-3 text-sm">
										<div class="text-base-content/60 mb-2 text-xs">
											{$t('dashboard.contracts.bid_details')}
										</div>

										<!-- Placeholder for bid information -->
										<div class="space-y-2">
											<div>
												<span class="text-xs font-medium"
													>{$t('dashboard.contracts.proposed_approach')}:</span
												>
												<p class="text-base-content/80 mt-1 text-xs">
													{$t('dashboard.contracts.bid_info_not_available')}
												</p>
											</div>

											<div>
												<span class="text-xs font-medium"
													>{$t('dashboard.contracts.estimated_duration')}:</span
												>
												<p class="text-base-content/80 mt-1 text-xs">
													{formatDate(displayContract.contract.estimatedStartTime)} - {formatDate(
														displayContract.contract.estimatedCompletionTime
													)}
												</p>
											</div>

											<div>
												<span class="text-xs font-medium"
													>{$t('dashboard.contracts.original_amount')}:</span
												>
												<p class="text-base-content/80 mt-1 text-xs">
													{btcPrice > 0
														? formatUSDWithSatsSync(contract.contract.amount, btcPrice)
														: `${formatRBTC(contract.contract.amount)} RBTC`}
												</p>
											</div>
										</div>
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>
			</div>

			<!-- Completion Evidence and Status Timeline (side-by-side on desktop) -->
			<div class="flex flex-col gap-6 lg:flex-row">
				<!-- Completion Evidence (only show if task is completed and has attachments) -->
				{#if displayContract.contract.completionAttachments && displayContract.contract.completionAttachments.length > 0}
					<div class="card bg-base-200 overflow-hidden flex-1">
						<div class="card-body p-4">
							<h4 class="mb-3 font-semibold">{$t('dashboard.contracts.timeline.completion_evidence')}</h4>
							
						<!-- Images Gallery -->
						{#if displayContract.contract.completionAttachments.filter((att: Attachment) => !isVideoFile(att.url)).length > 0}
							<div class="mb-4">
								{#await prepareGalleryImages(displayContract.contract.completionAttachments) then galleryImages}
									<Gallery
										galleryID={`completion-evidence-gallery-${displayContract.contract.escrowId}`}
										images={galleryImages}
										thumbnailSize="h-40 w-40"
									/>
								{/await}
							</div>
						{/if}

							<!-- Videos -->
							{#if displayContract.contract.completionAttachments.filter((att: Attachment) => isVideoFile(att.url)).length > 0}
								<div class="grid grid-cols-2 md:grid-cols-3 gap-3">
									{#each displayContract.contract.completionAttachments.filter((att: Attachment) => isVideoFile(att.url)) as attachment}
										<div class="relative group">
											<div class="aspect-square rounded-lg overflow-hidden bg-base-300">
												<video 
													src={attachment.url} 
													class="w-full h-full object-cover"
													controls
													preload="metadata"
												>
													<track kind="captions" src="" label="No captions available" />
												</video>
											</div>
											<div class="mt-2 text-xs text-base-content/60 truncate">
												{attachment.alt || 'Evidence'}
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Status Timeline -->
				<div class="card bg-base-200 flex-1">
					<div class="card-body p-4">
						<div class="mb-3 flex items-center gap-3">
							{#if displayContract.statusEvents.length > 0}
								<div
									class="bg-primary text-primary-content flex h-8 w-8 min-h-8 min-w-8 items-center justify-center rounded-full text-base font-semibold"
								>
									{displayContract.statusEvents.length}
								</div>
							{/if}
							<h4 class="font-semibold">
								{$t('dashboard.contracts.timeline.status_timeline')}
							</h4>
						</div>

						<ContractTimeline statusEvents={displayContract.statusEvents} />
					</div>
				</div>
			</div>

			<!-- Available Actions -->
			<div class="card bg-base-200">
				<div class="card-body p-4">
					<h4 class="mb-3 font-semibold">{$t('dashboard.contracts.available_actions')}</h4>

					<!-- No actions available -->
					{#if getAvailableActionsCount() === 0}
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
									d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							<p class="text-sm">{$t('dashboard.contracts.no_actions_available')}</p>
						</div>
					{/if}
					<ContractActions
						contract={displayContract}
						onActionComplete={handleActionComplete}
						containerClass={getAvailableActionsCount() > 1
							? 'grid grid-cols-1 sm:grid-cols-2 gap-3'
							: 'flex justify-center items-center'}
						onShowDeleteConfirm={() => (showDeleteConfirm = true)}
						onShowAcceptConfirm={() => (showAcceptConfirm = true)}
						onShowDisputeConfirm={() => (showDisputeConfirm = true)}
						onShowCancelConfirm={() => (showCancelConfirm = true)}
						onShowCompletionModal={() => (showCompletionModal = true)}
						onSetAcceptTaskHandler={(handler) => (acceptTaskHandler = handler)}
						onSetDisputeTaskHandler={(handler) => (disputeTaskHandler = handler)}
						onSetDeleteContractHandler={(handler) => (deleteContractHandler = handler)}
						onSetCancelEscrowHandler={(handler) => (cancelEscrowHandler = handler)}
						onSetCompleteTaskHandler={(handler) => (completeTaskWithAttachmentsHandler = handler)}
						useExternalModals={true}
					/>
				</div>
			</div>

			<!-- Technical Details -->
			<div class="card bg-base-200 mb-16 overflow-hidden sm:mb-0">
				<div class="card-body bg-base-200 p-0">
					<button
						class="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium"
						onclick={() => (isTechnicalDetailsOpen = !isTechnicalDetailsOpen)}
					>
						<span>{$t('dashboard.contracts.technical_details')}</span>
						<svg
							class="h-4 w-4 transition-transform duration-200 {isTechnicalDetailsOpen
								? 'rotate-180'
								: 'rotate-0'}"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 9l-7 7-7-7"
							/>
						</svg>
					</button>
					{#if isTechnicalDetailsOpen}
						<div class="px-4 pb-4">
							<div class="space-y-3 text-xs">
								<div>
									<span class="text-base-content/60"
										>{$t('dashboard.contracts.task_id')}:</span
									>
									<div class="bg-base-300 mt-1 rounded p-2 font-mono text-xs break-all">
										{displayContract.contract.taskId}
									</div>
								</div>
								<div>
									<span class="text-base-content/60"
										>{$t('dashboard.contracts.client_pubkey')}:</span
									>
									<div class="bg-base-300 mt-1 rounded p-2 font-mono text-xs break-all">
										{displayContract.contract.clientPubkey}
									</div>
								</div>
								<div>
									<span class="text-base-content/60"
										>{$t('dashboard.contracts.freelancer_pubkey')}:</span
									>
									<div class="bg-base-300 mt-1 rounded p-2 font-mono text-xs break-all">
										{displayContract.contract.freelancerPubkey}
									</div>
								</div>
								<div>
									<span class="text-base-content/60"
										>{$t('dashboard.contracts.contract_event_id')}:</span
									>
									<div class="bg-base-300 mt-1 rounded p-2 font-mono text-xs break-all">
										{displayContract.contractEvent.id}
									</div>
								</div>
								<div>
									<span class="text-base-content/60">{$t('dashboard.contracts.currency')}:</span>
									<div class="mt-1 font-semibold">{displayContract.contract.currency}</div>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
		{:else}
			<div class="flex items-center justify-center py-12">
				<p class="text-base-content/60">{$t('dashboard.contracts.loading')}</p>
			</div>
		{/if}
	{/snippet}
</Drawer>

<!-- Modals (outside drawer to avoid z-index issues) -->
{#if displayContract}
	<!-- Task Completion Modal -->
	<TaskCompletionModal
		contract={displayContract}
		isOpen={showCompletionModal}
		onClose={() => (showCompletionModal = false)}
		onComplete={async (attachments) => {
			if (completeTaskWithAttachmentsHandler) {
				await completeTaskWithAttachmentsHandler(attachments);
				showCompletionModal = false;
			}
		}}
		{btcPrice}
	/>

	<!-- Delete Confirmation Modal -->
	<ConfirmModal
		isOpen={showDeleteConfirm}
		title={$t('dashboard.contracts.actions.delete_contract_confirm_title')}
		message={$t('dashboard.contracts.actions.delete_contract_confirm_message')}
		confirmText={$t('dashboard.contracts.actions.delete_contract')}
		cancelText={$t('dashboard.contracts.actions.cancel')}
		confirmButtonClass="btn-error"
		onConfirm={async () => {
			if (deleteContractHandler) {
				await deleteContractHandler();
				showDeleteConfirm = false;
			}
		}}
		onCancel={() => (showDeleteConfirm = false)}
	/>

	<!-- Accept Work Confirmation Modal -->
	<ConfirmModal
		isOpen={showAcceptConfirm}
		title={$t('dashboard.contracts.actions.accept_work_confirm_title')}
		message={$t('dashboard.contracts.actions.accept_work_confirm_message')}
		confirmText={$t('dashboard.contracts.actions.accept_work')}
		cancelText={$t('dashboard.contracts.actions.cancel')}
		confirmButtonClass="btn-success"
		onConfirm={async () => {
			if (acceptTaskHandler) {
				await acceptTaskHandler();
				showAcceptConfirm = false;
			}
		}}
		onCancel={() => (showAcceptConfirm = false)}
	/>

	<!-- Dispute Work Confirmation Modal -->
	<ConfirmModal
		isOpen={showDisputeConfirm}
		title={$t('dashboard.contracts.actions.dispute_work_confirm_title')}
		message={$t('dashboard.contracts.actions.dispute_work_confirm_message')}
		confirmText={$t('dashboard.contracts.actions.dispute_work')}
		cancelText={$t('dashboard.contracts.actions.cancel')}
		confirmButtonClass="btn-error"
		onConfirm={async () => {
			if (disputeTaskHandler) {
				await disputeTaskHandler();
				showDisputeConfirm = false;
			}
		}}
		onCancel={() => (showDisputeConfirm = false)}
	/>

	<!-- Cancel Contract Confirmation Modal -->
	<ConfirmModal
		isOpen={showCancelConfirm}
		title={$t('dashboard.contracts.actions.cancel_contract_confirm_title')}
		message={$t('dashboard.contracts.actions.cancel_contract_confirm_message')}
		confirmText={$t('dashboard.contracts.actions.cancel_contract')}
		cancelText={$t('dashboard.contracts.actions.cancel')}
		confirmButtonClass="btn-error"
		onConfirm={async () => {
			if (cancelEscrowHandler) {
				await cancelEscrowHandler();
				showCancelConfirm = false;
			}
		}}
		onCancel={() => (showCancelConfirm = false)}
	/>
{/if}
