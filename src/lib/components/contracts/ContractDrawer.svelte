<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Attachment } from '$lib/types/task';
	import { findServiceByUniqueId } from '$lib/nostr/service';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import IconCalendarClock from '~icons/mdi/calendar-clock';
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconMapMarker from '~icons/mdi/map-marker';
	import Drawer from '$lib/components/Drawer.svelte';
	import TaskDeadlineDisplay from '$lib/components/task/TaskDeadlineDisplay.svelte';
	import UsdSatsDisplay from '$lib/components/shared/UsdSatsDisplay.svelte';
	import ContractTimeline from './ContractTimeline.svelte';
	import ContractActions from './ContractActions.svelte';
	import ContractContextSummary from './ContractContextSummary.svelte';
	import Gallery from '$lib/components/Gallery.svelte';
	import {
		getCancellationStatusVariant,
		getStatusColorClass,
		getStatusTranslationKey
	} from '$lib/utils/helpers/contractStatusFormatter';
	import { contractStore } from '$lib/stores/contract.store';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
import { buildContractContextPresentation } from '$lib/utils/service-contract/context-presentation';
import {
	getServiceContractLocationPresentationFromAgreementSnapshot,
	getServiceContractLocationPresentationFromService,
	type ServiceContractLocationPresentation
} from '$lib/utils/service-contract/location';
import { getReviewAvailabilityLabel, getReviewEligibilityState } from '$lib/reviews';

	const { btcPrice } = $props<{
		btcPrice: number;
	}>();

	// Technical details toggle state
	let isTechnicalDetailsOpen = $state(false);
	let isOriginalBidOpen = $state(false);
	let serviceDescriptionElement: HTMLParagraphElement | null = $state(null);
	let showFullServiceDescription = $state(false);
	let isServiceDescriptionTruncated = $state(false);

	// Timeline display count (bound from ContractTimeline - matches actual items shown)
	let timelineDisplayCount = $state(0);

	const currentStatusVariant = $derived(
		$contractStore.contract
			? getCancellationStatusVariant(
					$contractStore.contract.status,
					$contractStore.contract.statusEvents,
					contractStore.getContractKey($contractStore.contract, 'clientPubkey') as string
				)
			: 'default'
	);

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

	const presentation = $derived(
		$contractStore.contract
			? buildContractContextPresentation($contractStore.contract, contractStore.getContractKey)
			: null
	);
	const reviewState = $derived.by(() =>
		$contractStore.contract ? getReviewEligibilityState($contractStore.contract) : 'not_reviewable'
	);
	const reviewHref = $derived.by(() => {
		if (!$contractStore.contract) {
			return '/reviews';
		}

		const contractId = $contractStore.contract.escrowData?.id ?? $contractStore.contract.contractEvent.content.escrowId;
		if (reviewState === 'available') {
			return `/reviews?tab=pending&highlight=${encodeURIComponent(contractId)}`;
		}

		return '/reviews?tab=received';
	});
	const agreementSnapshot = $derived(
		$contractStore.contract?.contractEvent.content.agreementSnapshot
	);
	const isInstantBuyServiceContract = $derived(
		presentation?.isServiceContract === true && presentation.purchaseMode === 'instant_buy'
	);
	const serviceListingHref = $derived.by(() => {
		if (!isInstantBuyServiceContract || !$contractStore.contract) {
			return null;
		}

		const rawServiceId =
			typeof $contractStore.contract.contractEvent.content.serviceId === 'string' &&
			$contractStore.contract.contractEvent.content.serviceId.trim().length > 0
				? $contractStore.contract.contractEvent.content.serviceId
				: typeof $contractStore.contract.contractEvent.content.contextId === 'string' &&
					  $contractStore.contract.contractEvent.content.contextId.trim().length > 0
					? $contractStore.contract.contractEvent.content.contextId
					: null;

		return rawServiceId ? `/services/${encodeURIComponent(rawServiceId)}` : null;
	});
	const contractServiceId = $derived.by(() => {
		if (presentation?.isServiceContract !== true || !$contractStore.contract) {
			return null;
		}

		const rawServiceId = $contractStore.contract.contractEvent.content.serviceId;
		if (typeof rawServiceId === 'string' && rawServiceId.trim().length > 0) {
			return rawServiceId;
		}

		const rawContextId = $contractStore.contract.contractEvent.content.contextId;
		return typeof rawContextId === 'string' && rawContextId.trim().length > 0 ? rawContextId : null;
	});
	const serviceLocationSnapshot = $derived(
		getServiceContractLocationPresentationFromAgreementSnapshot(agreementSnapshot)
	);
	let serviceContractLocation = $state<ServiceContractLocationPresentation | null>(null);
	let serviceLocationRequestVersion = 0;

	function formatContractDateTime(timestamp: number | undefined): string {
		if (!timestamp || !Number.isFinite(timestamp)) {
			return '';
		}

		return new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(new Date(timestamp * 1000));
	}

	function tr(key: string, fallback: string): string {
		try {
			const value = $t(key);
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}

	function formatUsdPriceFromRbtc(amount: string, currentBtcPrice: number): string {
		const rbtcAmount = Number.parseFloat(amount);
		if (!Number.isFinite(rbtcAmount) || currentBtcPrice <= 0) {
			return `${formatRBTC(amount)} RBTC`;
		}

		return `$${(rbtcAmount * currentBtcPrice).toFixed(2)}`;
	}

	function formatSatsFromRbtc(amount: string): string {
		const rbtcAmount = Number.parseFloat(amount);
		if (!Number.isFinite(rbtcAmount)) {
			return '0 Sats';
		}

		return `${Math.round(rbtcAmount * 100_000_000).toLocaleString('en-US')} Sats`;
	}

	function checkIfServiceDescriptionTruncated() {
		if (!serviceDescriptionElement || !presentation?.description) {
			isServiceDescriptionTruncated = false;
			return;
		}

		const clone = serviceDescriptionElement.cloneNode(true) as HTMLElement;
		clone.className = serviceDescriptionElement.className.replace(/line-clamp-\d+/g, '').trim();
		clone.style.position = 'absolute';
		clone.style.visibility = 'hidden';
		clone.style.pointerEvents = 'none';
		clone.style.height = 'auto';
		clone.style.maxHeight = 'none';
		clone.style.overflow = 'visible';
		clone.style.width = `${serviceDescriptionElement.offsetWidth}px`;
		document.body.appendChild(clone);

		const fullHeight = clone.scrollHeight;
		const lineHeight = parseFloat(getComputedStyle(serviceDescriptionElement).lineHeight) || 24;
		const maxHeight = lineHeight * 3;

		document.body.removeChild(clone);
		isServiceDescriptionTruncated = fullHeight > maxHeight + 1;
	}

	onMount(() => {
		const handleResize = () => {
			if ($contractStore.isDrawerOpen && isInstantBuyServiceContract) {
				checkIfServiceDescriptionTruncated();
			}
		};

		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	});

	$effect(() => {
		serviceLocationRequestVersion += 1;
		const requestVersion = serviceLocationRequestVersion;

		if (serviceLocationSnapshot) {
			serviceContractLocation = serviceLocationSnapshot;
			return;
		}

		if (presentation?.isServiceContract !== true || !contractServiceId) {
			serviceContractLocation = null;
			return;
		}

		serviceContractLocation = null;

		void (async () => {
			try {
				const liveService = await findServiceByUniqueId(contractServiceId);
				if (serviceLocationRequestVersion !== requestVersion) {
					return;
				}

				serviceContractLocation = getServiceContractLocationPresentationFromService(liveService);
			} catch {
				if (serviceLocationRequestVersion !== requestVersion) {
					return;
				}

				serviceContractLocation = null;
			}
		})();
	});

	$effect(() => {
		const description = presentation?.description ?? '';
		const isDrawerOpen = $contractStore.isDrawerOpen;

		showFullServiceDescription = false;
		isServiceDescriptionTruncated = false;

		if (
			!isDrawerOpen ||
			!isInstantBuyServiceContract ||
			!description ||
			!serviceDescriptionElement
		) {
			return;
		}

		requestAnimationFrame(() => {
			setTimeout(() => {
				checkIfServiceDescriptionTruncated();
			}, 0);
		});
	});
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
					{#if presentation?.isUnknownContext}
						<div class="alert alert-warning mb-4 text-sm">
							<span
								>Unknown contract context. Actions are disabled until this contract is repaired.</span
							>
						</div>
					{/if}
					<!-- Row 1: User info | Role + Status badges (stacked, right-aligned) -->
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
						<div class="flex shrink-0 flex-col items-end gap-2">
							{#if presentation?.isServiceContract}
								<div class="badge badge-info shrink-0">
									{presentation.summaryLabel}
								</div>
							{:else}
								<div
									class="badge {$contractStore.contract.isClient
										? 'badge-primary'
										: 'badge-secondary'} shrink-0"
								>
									{$contractStore.contract.isClient
										? $t('dashboard.client')
										: $t('dashboard.freelancer')}
								</div>
							{/if}
							<div class="badge {getStatusColorClass($contractStore.contract.status)} shrink-0">
								{$t(
									getStatusTranslationKey($contractStore.contract.status, {
										statusVariant: currentStatusVariant
									})
								)}
							</div>
							<div class="badge badge-outline shrink-0">
								{getReviewAvailabilityLabel(reviewState)}
							</div>
						</div>
					</div>

					<!-- Row 2: Task title + description | Price block (same row on all sizes) -->
					<div class="mb-4 flex flex-row flex-nowrap items-start justify-between gap-4">
						<div class="min-w-0 flex-1">
							{#if isInstantBuyServiceContract}
								<div class="space-y-2">
									{#if presentation?.selectedTierLabel}
										<div class="flex items-center gap-2">
											<span class="badge badge-outline badge-sm">
												{presentation.selectedTierLabel}
											</span>
										</div>
									{/if}

									<div
										class="flex items-start justify-between gap-4"
										data-testid="service-contract-title-price-row"
									>
										<div class="min-w-0 flex-1">
											{#if serviceListingHref}
												<a
													href={resolve(serviceListingHref)}
													class="hover:text-primary card-title line-clamp-2 text-lg font-semibold transition-colors"
												>
													{presentation?.title}
												</a>
											{:else}
												<span class="card-title line-clamp-2 text-lg font-semibold">
													{presentation?.title}
												</span>
											{/if}
										</div>
										<div
											class="shrink-0 pl-4 text-right text-lg font-bold"
											data-testid="service-contract-usd-price"
										>
											{formatUsdPriceFromRbtc(
												contractStore.getContractKey($contractStore.contract, 'amount') as string,
												btcPrice
											)}
										</div>
									</div>

									<div
										class="flex items-start justify-between gap-4"
										data-testid="service-contract-description-sats-row"
									>
										<div class="min-w-0 flex-1">
											<p
												bind:this={serviceDescriptionElement}
												class={`text-base-content/70 min-w-0 text-sm whitespace-pre-line ${
													showFullServiceDescription ? '' : 'line-clamp-3'
												}`}
												id="service-contract-description"
												data-testid="service-contract-description"
											>
												{presentation?.description}
											</p>
											{#if isServiceDescriptionTruncated}
												<button
													type="button"
													class="btn btn-ghost btn-xs mt-2 h-auto min-h-0 px-0 text-[0.75rem] font-semibold tracking-wide uppercase"
													aria-controls="service-contract-description"
													aria-expanded={showFullServiceDescription}
													onclick={() => {
														showFullServiceDescription = !showFullServiceDescription;
													}}
												>
													{showFullServiceDescription
														? tr('common.show_less', 'See Less')
														: tr('common.show_more', 'See More')}
												</button>
											{/if}
										</div>
										<div
											class="text-base-content/60 shrink-0 pl-4 text-right text-sm"
											data-testid="service-contract-sats-price"
										>
											{formatSatsFromRbtc(
												contractStore.getContractKey($contractStore.contract, 'amount') as string
											)}
										</div>
									</div>
								</div>
							{:else}
								<ContractContextSummary
									contract={$contractStore.contract}
									enableExpandableDescription={presentation?.isServiceContract === true}
								/>
							{/if}
						</div>
						{#if !isInstantBuyServiceContract}
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
						{/if}
					</div>

					<!-- Row 3: Date + Accordion + Buttons. On mobile: date, accordion, buttons. On desktop: date+buttons row, accordion row at bottom -->
					<div
						class="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
					>
						<div class="min-w-0 flex-1">
							{#if isInstantBuyServiceContract}
								<div class="space-y-3 text-sm">
									{#if contractStore.getContractKey($contractStore.contract, 'estimatedStartTime')}
										<div
											class="flex items-center gap-2"
											data-testid="service-contract-start-datetime"
										>
											<IconCalendarClock class="text-primary h-8 w-8 shrink-0" />
											<div class="flex min-w-0 flex-1 flex-col gap-0.5">
												<div class="text-base-content/60 text-xs font-medium">
													{tr('dashboard.contracts.start_date', 'Start Date')}
												</div>
												<div class="line-clamp-2 text-sm font-medium">
													{formatContractDateTime(
														contractStore.getContractKey(
															$contractStore.contract,
															'estimatedStartTime'
														) as number
													)}
												</div>
											</div>
										</div>
									{/if}
									{#if contractStore.getContractKey($contractStore.contract, 'estimatedCompletionTime')}
										<div
											class="flex items-center gap-2"
											data-testid="service-contract-end-datetime"
										>
											<IconClockOutline class="text-primary h-8 w-8 shrink-0" />
											<div class="flex min-w-0 flex-1 flex-col gap-0.5">
												<div class="text-base-content/60 text-xs font-medium">
													{tr('dashboard.contracts.end_date', 'End Date')}
												</div>
												<div class="line-clamp-2 text-sm font-medium">
													{formatContractDateTime(
														contractStore.getContractKey(
															$contractStore.contract,
															'estimatedCompletionTime'
														) as number
													)}
												</div>
											</div>
										</div>
									{/if}
								</div>
							{:else if contractStore.getContractKey($contractStore.contract, 'estimatedStartTime') && contractStore.getContractKey($contractStore.contract, 'estimatedCompletionTime')}
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
							{#if presentation?.isServiceContract && serviceContractLocation}
								<div class="mt-3 flex items-start gap-2" data-testid="service-contract-location">
									<IconMapMarker class="text-primary h-8 w-8 shrink-0" />
									<div class="min-w-0 flex-1">
										<div class="text-base-content/60 text-xs font-medium">
											{tr('common.location.address', 'Location')}
										</div>
										<div class="text-sm font-medium break-words">
											{serviceContractLocation.label}
										</div>
										{#if serviceContractLocation.mapLink}
											<a
												href={serviceContractLocation.mapLink}
												target="_blank"
												rel="external noopener noreferrer"
												class="link link-primary mt-1 inline-flex text-sm"
												data-testid="service-contract-location-link"
											>
												{tr('common.location.open_map', 'Open Map')}
											</a>
										{/if}
									</div>
								</div>
							{/if}
						</div>
						<!-- Original Bid Proposal accordion: above buttons on mobile, bottom row on desktop -->
						{#if presentation?.isServiceContract !== true}
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
						{/if}
						<div
							class="order-3 flex min-w-0 flex-wrap gap-2 pl-0 sm:order-2 sm:w-fit sm:flex-row sm:items-center sm:justify-end sm:pl-4"
						>
							<ContractActions
								contract={$contractStore.contract}
								containerClass="flex min-w-0 flex-wrap gap-2 sm:flex-row sm:w-fit"
								isInline={false}
								compactButtons={true}
							/>
							<a href={reviewHref} class="btn btn-outline btn-sm w-full sm:w-auto">
								{reviewState === 'available' ? 'Write review' : 'Reviews'}
							</a>
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

						<ContractTimeline
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
