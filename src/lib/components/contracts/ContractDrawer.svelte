<script lang="ts">
	import type { Attachment } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import { slide } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import Drawer from '$lib/components/Drawer.svelte';
	import TaskDeadlineDisplay from '$lib/components/task/TaskDeadlineDisplay.svelte';
	import UsdSatsDisplay from '$lib/components/shared/UsdSatsDisplay.svelte';
	import ContractTimeline from './ContractTimeline.svelte';
	import ContractActions from './ContractActions.svelte';
	import Gallery from '$lib/components/Gallery.svelte';
	import { fetchContractProfile, type ContractProfile } from '$lib/utils/nostr-profile';
	import {
		getStatusColorClass,
		getStatusTranslationKey
	} from '$lib/utils/helpers/contractStatusFormatter';
	import { contractStore } from '$lib/stores/contract.store';
	import UserNostrBadge from '../UserNostrBadge.svelte';

	const { btcPrice } = $props<{
		btcPrice: number;
	}>();

	// Technical details toggle state
	let isTechnicalDetailsOpen = $state(false);
	let isOriginalBidOpen = $state(false);

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

</script>

<Drawer
	isOpen={$contractStore.isDrawerOpen}
	title={$contractStore.contract
		? (contractStore.getContractKey($contractStore.contract, 'taskTitle') as string)
		: ''}
	onClose={() => {
		$contractStore.contract = null;
		$contractStore.isDrawerOpen = false;
	}}
	position="right"
	isScrollable={true}
>
	{#snippet children()}
		{#if $contractStore.contract}
			<!-- Contract Details -->
			<div class="min-w-0 overflow-x-hidden space-y-6">
				<!-- Contract Info Card -->
				<div class="card min-w-0 overflow-hidden bg-base-200">
					<div class="card-body min-w-0 p-4">
						<!-- Row 1: User info | Role + Status badges (stacked, right-aligned) -->
						<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
							<UserNostrBadge
								npub={contractStore.getContractKey(
									$contractStore.contract,
									'otherPartyNpub'
								) as string}
							/>
							<div class="flex shrink-0 flex-col items-end gap-2">
								<div
									class="badge {$contractStore.contract.isClient
										? 'badge-primary'
										: 'badge-secondary'} shrink-0"
								>
									{$contractStore.contract.isClient
										? $t('dashboard.client')
										: $t('dashboard.freelancer')}
								</div>
								<div
									class="badge {getStatusColorClass(
										$contractStore.contract.status
									)} shrink-0"
								>
									{$t(getStatusTranslationKey($contractStore.contract.status))}
								</div>
							</div>
						</div>

						<!-- Row 2: Task title + description | Price block (same row on all sizes) -->
						<div class="mb-4 flex flex-row flex-nowrap items-start justify-between gap-4">
							<div class="min-w-0 flex-1">
								<p class="text-lg font-bold leading-tight">
									{contractStore.getContractKey($contractStore.contract, 'taskTitle')}
								</p>
								<p class="text-base-content/60 mt-1 text-sm leading-relaxed">
									{contractStore.getContractKey($contractStore.contract, 'taskDescription')}
								</p>
							</div>
							<div class="shrink-0 pl-4 text-right">
								{#if btcPrice > 0}
									<UsdSatsDisplay
										amount={parseFloat(contractStore.getContractKey($contractStore.contract, 'amount') as string) * btcPrice}
										btcPrice={btcPrice}
										satsKey="bids.sats"
									/>
								{:else}
									<p class="text-lg font-bold">
										{formatRBTC(contractStore.getContractKey($contractStore.contract, 'amount') as string)} RBTC
									</p>
								{/if}
							</div>
						</div>

						<!-- Row 3: Estimated date range (left) + Action buttons (right, wrap when tight) -->
						<div
							class="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
						>
							<div class="min-w-0 flex-1">
								{#if contractStore.getContractKey($contractStore.contract, 'estimatedStartTime') && contractStore.getContractKey($contractStore.contract, 'estimatedCompletionTime')}
									<TaskDeadlineDisplay
										dateRangeStart={contractStore.getContractKey(
											$contractStore.contract,
											'estimatedStartTime'
										) as number}
										dateRangeEnd={contractStore.getContractKey(
											$contractStore.contract,
											'estimatedCompletionTime'
										) as number}
										showTime={true}
										showDuration={true}
									/>
								{/if}
							</div>
							<div
								class="flex min-w-0 flex-wrap gap-2 pl-0 sm:flex-row sm:items-center sm:justify-end sm:pl-4 sm:w-fit"
							>
								<ContractActions
									contract={$contractStore.contract}
									containerClass="flex min-w-0 flex-wrap gap-2 sm:flex-row sm:w-fit"
									isInline={false}
									compactButtons={true}
								/>
							</div>
						</div>
					</div>
				</div>

				<!-- Original Bid Proposal Card (Task Description heading removed; content in card above) -->
				<div class="card bg-base-200 overflow-hidden">
					<div class="card-body p-4">

						<!-- Original Bid Proposal - Expandable Section -->
						<div>
							<div class="bg-transparent">
								<button
									class="flex w-full cursor-pointer items-center justify-between px-0 py-2"
									onclick={() => (isOriginalBidOpen = !isOriginalBidOpen)}
									aria-expanded={isOriginalBidOpen}
									aria-controls="original-bid-content"
								>
									<h4 class="m-0 font-semibold">
										{$t('dashboard.contracts.original_bid_proposal')}
									</h4>
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
									<div
										id="original-bid-content"
										class="px-0 pb-0 overflow-hidden"
										in:slide={{ duration: 250, easing: quintOut }}
										out:slide={{ duration: 200, easing: quintOut }}
									>
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
													<div class="mt-1">
														<TaskDeadlineDisplay
															dateRangeStart={contractStore.getContractKey(
																$contractStore.contract,
																'estimatedStartTime'
															) as number}
															dateRangeEnd={contractStore.getContractKey(
																$contractStore.contract,
																'estimatedCompletionTime'
															) as number}
															showTime={true}
															showDuration={true}
														/>
													</div>
												</div>

												<div>
													<span class="text-xs font-medium"
														>{$t('dashboard.contracts.original_amount')}:</span
													>
													<div class="text-base-content/80 mt-1 text-xs">
														{#if btcPrice > 0}
															<UsdSatsDisplay
																amount={parseFloat(contractStore.getContractKey($contractStore.contract, 'amount') as string) * btcPrice}
																btcPrice={btcPrice}
																satsKey="bids.sats"
																size="compact"
															/>
														{:else}
															<p class="mt-1">
																{formatRBTC(contractStore.getContractKey($contractStore.contract, 'amount') as string)} RBTC
															</p>
														{/if}
													</div>
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
					{#if $contractStore.contract.completionAttachments && $contractStore.contract.completionAttachments.length > 0}
						<div class="card bg-base-200 flex-1 overflow-hidden">
							<div class="card-body p-4">
								<h4 class="mb-3 font-semibold">
									{$t('dashboard.contracts.timeline.completion_evidence')}
								</h4>

								<!-- Images Gallery -->
								{#if $contractStore.contract.completionAttachments.filter((att: Attachment) => !isVideoFile(att.url)).length > 0}
									<div class="mb-4">
										{#await prepareGalleryImages($contractStore.contract.completionAttachments) then galleryImages}
											<Gallery
												galleryID={`completion-evidence-gallery-${contractStore.getContractKey($contractStore.contract, 'escrowId')}`}
												images={galleryImages}
												thumbnailSize="h-40 w-40"
											/>
										{/await}
									</div>
								{/if}

								<!-- Videos -->
								{#if $contractStore.contract.completionAttachments.filter( (att: Attachment) => isVideoFile(att.url) ).length > 0}
									<div class="grid grid-cols-2 gap-3 md:grid-cols-3">
										{#each $contractStore.contract.completionAttachments.filter( (att: Attachment) => isVideoFile(att.url) ) as attachment}
											<div class="group relative">
												<div class="bg-base-300 aspect-square overflow-hidden rounded-lg">
													<video
														src={attachment.url}
														class="h-full w-full object-cover"
														controls
														preload="metadata"
													>
														<track kind="captions" src="" label="No captions available" />
													</video>
												</div>
												<div class="text-base-content/60 mt-2 truncate text-xs">
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
								{#if $contractStore.contract.statusEvents.length > 0}
									<div
										class="bg-primary text-primary-content flex h-8 min-h-8 w-8 min-w-8 items-center justify-center rounded-full text-base font-semibold"
									>
										{$contractStore.contract.statusEvents.length}
									</div>
								{/if}
								<h4 class="font-semibold">
									{$t('dashboard.contracts.timeline.status_timeline')}
								</h4>
							</div>

							<ContractTimeline
								statusEvents={$contractStore.contract.statusEvents}
								contractPubkey={contractStore.getContractKey(
									$contractStore.contract,
									'clientPubkey'
								) as string}
							/>
						</div>
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
										<span class="text-base-content/60">{$t('dashboard.contracts.task_id')}:</span>
										<div class="bg-base-300 mt-1 rounded p-2 font-mono text-xs break-all">
											{contractStore.getContractKey($contractStore.contract, 'taskId')}
										</div>
									</div>
									<div>
										<span class="text-base-content/60"
											>{$t('dashboard.contracts.client_pubkey')}:</span
										>
										<div class="bg-base-300 mt-1 rounded p-2 font-mono text-xs break-all">
											{contractStore.getContractKey($contractStore.contract, 'clientPubkey')}
										</div>
									</div>
									<div>
										<span class="text-base-content/60"
											>{$t('dashboard.contracts.freelancer_pubkey')}:</span
										>
										<div class="bg-base-300 mt-1 rounded p-2 font-mono text-xs break-all">
											{contractStore.getContractKey($contractStore.contract, 'freelancerPubkey')}
										</div>
									</div>
									<div>
										<span class="text-base-content/60"
											>{$t('dashboard.contracts.contract_event_id')}:</span
										>
										<div class="bg-base-300 mt-1 rounded p-2 font-mono text-xs break-all">
											{$contractStore.contract.contractEvent.id}
										</div>
									</div>
									<div>
										<span class="text-base-content/60">{$t('dashboard.contracts.currency')}:</span>
										<div class="mt-1 font-semibold">
											{contractStore.getContractKey($contractStore.contract, 'currency')}
										</div>
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
