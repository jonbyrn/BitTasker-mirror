<script lang="ts">
	import type { Attachment } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import Drawer from '$lib/components/Drawer.svelte';
	import TaskDeadlineDisplay from '$lib/components/task/TaskDeadlineDisplay.svelte';
	import UsdSatsDisplay from '$lib/components/shared/UsdSatsDisplay.svelte';
	import ContractTimelineNDK from './ContractTimelineNDK.svelte';
	import ContractActionsDrawerNDK from './ContractActionsDrawerNDK.svelte';
	import ResolutionProposalSplitDisplay from './ResolutionProposalSplitDisplay.svelte';
	import Gallery from '$lib/components/Gallery.svelte';
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

	const { isOpen, onClose, contractRune, btcPrice } = $props<{
		isOpen: boolean;
		onClose: () => void;
		contractRune: PaymentContractRune | null;
		btcPrice: number;
	}>();

	let isTechnicalDetailsOpen = $state(false);
	let isOriginalBidOpen = $state(false);

	const contract = $derived(contractRune?.contract);
	const timelineRows = $derived(
		contractRune
			? buildContractTimelineRows({
					contract: contractRune.contract,
					statusEvents: contractRune.statusEvents
				})
			: []
	);
	const timelineDisplayCount = $derived(timelineRows.length);

	function isVideoFile(url: string): boolean {
		const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov'];
		const urlLower = url.toLowerCase();
		return videoExtensions.some((ext) => urlLower.endsWith(ext));
	}

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
							rating={0}
							size="sm"
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
							<p class="text-base-content/60 mt-1 text-sm leading-relaxed">
								{contract.taskDescription ?? ''}
							</p>
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

					<!-- Row 3: Date + Accordion + Buttons -->
					<div
						class="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
					>
						<div class="min-w-0 flex-1">
							{#if contract.estimatedStartTime != null && contract.estimatedCompletionTime != null}
								<TaskDeadlineDisplay
									dateRangeStart={contract.estimatedStartTime}
									dateRangeEnd={contract.estimatedCompletionTime}
									showTime={true}
									showDuration={true}
								/>
							{/if}
						</div>
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
										aria-controls="original-bid-content-ndk"
									>
										{$t('dashboard.contracts.bid_details')}
									</button>
									<div id="original-bid-content-ndk" class="collapse-content">
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
							{#if contractRune}
								<div class="flex min-w-0 flex-wrap gap-2 sm:w-fit sm:flex-row">
									<ContractActionsDrawerNDK {contractRune} {btcPrice} />
								</div>
							{/if}
						</div>
					</div>
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
				{#if contractRune.completionAttachments && contractRune.completionAttachments.length > 0}
					<div class="card bg-base-200 flex-1 overflow-hidden">
						<div class="card-body p-4">
							<h4 class="mb-3 font-semibold">
								{$t('dashboard.contracts.timeline.completion_evidence')}
							</h4>

							{#if contractRune.completionAttachments.filter((att: Attachment) => !isVideoFile(att.url)).length > 0}
								<div class="mb-4">
									{#await prepareGalleryImages(contractRune.completionAttachments) then galleryImages}
										<Gallery
											galleryID={`completion-evidence-gallery-ndk-${contract.paymentId || contract.id}`}
											images={galleryImages}
											thumbnailSize="h-40 w-40"
										/>
									{/await}
								</div>
							{/if}

							{#if contractRune.completionAttachments.filter( (att: Attachment) => isVideoFile(att.url) ).length > 0}
								<div class="grid grid-cols-2 gap-3 md:grid-cols-3">
									{#each contractRune.completionAttachments.filter( (att: Attachment) => isVideoFile(att.url) ) as attachment (attachment.url)}
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
