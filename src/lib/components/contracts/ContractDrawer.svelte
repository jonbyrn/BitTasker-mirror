<script lang="ts">
	import type { Attachment } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import { formatUSDWithSatsSync } from '$lib/utils/helpers/currencyFormatter';
	import Drawer from '$lib/components/Drawer.svelte';
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
	import { formatStandardDateTime } from '$lib/utils/helpers/dateFormatter';
	import { locale } from 'svelte-i18n';

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

	// Format date with proper timestamp handling
	// Uses formatStandardDateTime to ensure consistent formatting and proper timezone handling
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

		// Use formatStandardDateTime for consistent formatting across the app
		// This ensures proper timezone handling and localization
		return formatStandardDateTime(date, $locale || 'en');
	}

	const getAvailableActionsCount = () => {
		if (!$contractStore.contract) return 0;
		let count = 0;
		if ($contractStore.contract.permissions.canComplete) count++;
		if ($contractStore.contract.permissions.canAccept) count++;
		if ($contractStore.contract.permissions.canDispute) count++;
		if ($contractStore.contract.permissions.canPropose) count++;
		if ($contractStore.contract.permissions.canAcceptProposal) count++;
		if ($contractStore.contract.permissions.canCancel) count++;
		if ($contractStore.contract.permissions.canResolveTimelock) count++;
		return count;
	};
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
			<div class="space-y-6">
				<!-- Contract Info Card -->
				<div class="card bg-base-200">
					<div class="card-body p-4">
						<div class="mb-3 flex items-center justify-between gap-2">
							<h4 class="font-semibold">{$t('dashboard.contracts.contract_details')}</h4>
							<!-- Right: Role Badge -->
							<div
								class="badge {$contractStore.contract.isClient
									? 'badge-primary'
									: 'badge-secondary'} shrink-0"
							>
								{$contractStore.contract.isClient
									? $t('dashboard.client')
									: $t('dashboard.freelancer')}
							</div>
						</div>

						<div class="space-y-3">
							<!-- Taskee Info + Status Badge - Same row, wraps if needed -->
							<div class="flex flex-wrap items-center gap-2">
								<UserNostrBadge
									npub={contractStore.getContractKey(
										$contractStore.contract,
										'otherPartyNpub'
									) as string}
								/>
								<div
									class="badge {getStatusColorClass(
										$contractStore.contract.status
									)} shrink-0 ml-auto"
								>
									{$t(getStatusTranslationKey($contractStore.contract.status))}
								</div>
							</div>

							<div class="flex flex-col gap-1 md:flex-row md:justify-between md:gap-2">
								<span class="text-base-content/70">{$t('dashboard.contracts.amount')}:</span>
								<span class="font-semibold"
									>{btcPrice > 0
										? formatUSDWithSatsSync(
												contractStore.getContractKey($contractStore.contract, 'amount') as string,
												btcPrice
											)
										: `${formatRBTC(contractStore.getContractKey($contractStore.contract, 'amount') as string)} RBTC`}</span
								>
							</div>

							<div class="flex flex-col gap-1 md:flex-row md:justify-between md:gap-2">
								<span class="text-base-content/70 whitespace-nowrap"
									>{$t('dashboard.contracts.estimated_start')}:</span
								>
								<span class="overflow-wrap-anywhere text-sm break-all whitespace-normal"
									>{formatDate(
										contractStore.getContractKey(
											$contractStore.contract,
											'estimatedStartTime'
										) as number
									)}</span
								>
							</div>

							<div class="flex flex-col gap-1 md:flex-row md:justify-between md:gap-2">
								<span class="text-base-content/70 whitespace-nowrap"
									>{$t('dashboard.contracts.estimated_completion')}:</span
								>
								<span class="overflow-wrap-anywhere text-sm break-all whitespace-normal"
									>{formatDate(
										contractStore.getContractKey(
											$contractStore.contract,
											'estimatedCompletionTime'
										) as number
									)}</span
								>
							</div>

							<div class="flex flex-col gap-1 md:flex-row md:justify-between md:gap-2">
								<span class="text-base-content/70">{$t('dashboard.contracts.created')}:</span>
								<span class="text-sm">
									{formatDate($contractStore.contract.contractEvent.created_at)}
								</span>
							</div>
						</div>
					</div>
				</div>

				<!-- Task Description Card -->
				<div class="card bg-base-200 overflow-hidden">
					<div class="card-body p-4">
						<h4 class="mb-3 font-semibold">{$t('dashboard.contracts.task_description')}</h4>
						<p class="text-base-content/80 text-sm leading-relaxed">
							{contractStore.getContractKey($contractStore.contract, 'taskDescription')}
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
														{formatDate(
															contractStore.getContractKey(
																$contractStore.contract,
																'estimatedStartTime'
															) as number
														)} - {formatDate(
															contractStore.getContractKey(
																$contractStore.contract,
																'estimatedCompletionTime'
															) as number
														)}
													</p>
												</div>

												<div>
													<span class="text-xs font-medium"
														>{$t('dashboard.contracts.original_amount')}:</span
													>
													<p class="text-base-content/80 mt-1 text-xs">
														{btcPrice > 0
															? formatUSDWithSatsSync(
																	contractStore.getContractKey(
																		$contractStore.contract,
																		'amount'
																	) as string,
																	btcPrice
																)
															: `${formatRBTC(contractStore.getContractKey($contractStore.contract, 'amount') as string)} RBTC`}
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
							contract={$contractStore.contract}
							containerClass={getAvailableActionsCount() >= 1
								? 'grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0'
								: 'flex justify-center items-center'}
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
