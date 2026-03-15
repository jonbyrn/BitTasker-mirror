<script lang="ts">
	import type { Attachment } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import Drawer from '$lib/components/Drawer.svelte';
	import TaskDeadlineDisplay from '$lib/components/task/TaskDeadlineDisplay.svelte';
	import UsdSatsDisplay from '$lib/components/shared/UsdSatsDisplay.svelte';
	import ContractTimelineByVersion from './ContractTimelineByVersion.svelte';
	import ContractActionsByVersion from './ContractActionsByVersion.svelte';
	import ContractBadges from './ContractBadges.svelte';
	import Gallery from '$lib/components/Gallery.svelte';
	import { contractStore } from '$lib/stores/contract.store';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';

	const { btcPrice } = $props<{
		btcPrice: number;
	}>();

	// Technical details toggle state
	let isTechnicalDetailsOpen = $state(false);
	let isOriginalBidOpen = $state(false);

	// Timeline display count (bound from ContractTimeline - matches actual items shown)
	let timelineDisplayCount = $state(0);

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
	{#if $contractStore.contract}
		<!-- Contract Details -->
		<div class="min-w-0 space-y-6 overflow-x-hidden">
			<!-- Contract Info Card -->
			<div class="card bg-base-200 min-w-0 overflow-hidden">
				<div class="card-body min-w-0 p-4">
					<!-- Row 1: User info | Role + Status badges (version-aware) -->
					<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
						<UserInfoDisplay
							pubkey={contractStore.getContractKey(
								$contractStore.contract,
								'otherPartyNpub'
							) as string}
							profileLink={contractStore.getContractKey(
								$contractStore.contract,
								'otherPartyNpub'
							) as string}
							rating={0}
							size="sm"
							avatarAlt={$t('dashboard.task_details_by_task.avatar_alt')}
						/>
						<ContractBadges contract={$contractStore.contract} showDevBadge={false} />
					</div>

					<!-- Row 2: Task title + description | Price block (same row on all sizes) -->
					<div class="mb-4 flex flex-row flex-nowrap items-start justify-between gap-4">
						<div class="min-w-0 flex-1">
							<p class="text-lg leading-tight font-bold">
								{contractStore.getContractKey($contractStore.contract, 'taskTitle')}
							</p>
							<p class="text-base-content/60 mt-1 text-sm leading-relaxed">
								{contractStore.getContractKey($contractStore.contract, 'taskDescription')}
							</p>
						</div>
						<div class="shrink-0 pl-4 text-right">
							{#if btcPrice > 0}
								<UsdSatsDisplay
									amount={parseFloat(
										contractStore.getContractKey($contractStore.contract, 'amount') as string
									) * btcPrice}
									{btcPrice}
									satsKey="bids.sats"
								/>
							{:else}
								<p class="text-lg font-bold">
									{formatRBTC(
										contractStore.getContractKey($contractStore.contract, 'amount') as string
									)} RBTC
								</p>
							{/if}
						</div>
					</div>

					<!-- Row 3: Date + Accordion + Buttons. On mobile: date, accordion, buttons. On desktop: date+buttons row, accordion row at bottom -->
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
						<!-- Original Bid Proposal accordion: above buttons on mobile, bottom row on desktop -->
						<div class="order-2 w-full sm:order-3 sm:basis-full">
							<div class="join join-vertical w-full">
								<div
									class="collapse-arrow join-item border-base-300 collapse border-b"
									class:collapse-open={isOriginalBidOpen}
								>
									<button
										type="button"
										class="collapse-title text-left text-lg leading-tight font-bold"
										onclick={() => (isOriginalBidOpen = !isOriginalBidOpen)}
										aria-expanded={isOriginalBidOpen}
										aria-controls="original-bid-content"
									>
										{$t('dashboard.contracts.bid_details')}
									</button>
									<div id="original-bid-content" class="collapse-content">
										<div class="pt-2">
											<div>
												<span class="text-xs font-medium"
													>{$t('dashboard.contracts.approach')}:</span
												>
												<p class="text-base-content/80 mt-1 text-sm">
													{$t('dashboard.contracts.bid_info_not_available')}
												</p>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>
						<div
							class="order-3 flex min-w-0 flex-wrap gap-2 pl-0 sm:order-2 sm:w-fit sm:flex-row sm:items-center sm:justify-end sm:pl-4"
						>
							<ContractActionsByVersion
								contract={$contractStore.contract}
								containerClass="flex min-w-0 flex-wrap gap-2 sm:flex-row sm:w-fit"
								isInline={false}
								compactButtons={true}
							/>
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
									{#each $contractStore.contract.completionAttachments.filter( (att: Attachment) => isVideoFile(att.url) ) as attachment (attachment.url)}
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

						<ContractTimelineByVersion
							contract={$contractStore.contract}
							statusEvents={$contractStore.contract.statusEvents}
							contractPubkey={contractStore.getContractKey(
								$contractStore.contract,
								'clientPubkey'
							) as string}
							contractCreatedAt={$contractStore.contract.contractEvent.created_at}
							contractCreatorPubkey={$contractStore.contract.contractEvent.pubkey}
							contractFundingTransactionHash={$contractStore.contract.contractEvent.content
								.transactionHash}
							onDisplayCountChange={(count) => (timelineDisplayCount = count)}
						/>
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
							aria-controls="technical-details-content"
						>
							{$t('dashboard.contracts.technical_details')}
						</button>
						<div id="technical-details-content" class="collapse-content">
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
