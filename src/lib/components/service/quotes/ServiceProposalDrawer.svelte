<script lang="ts">
	import Drawer from '$lib/components/Drawer.svelte';
	import { onMount } from 'svelte';
	import { locale, t } from 'svelte-i18n';
	import type { Service } from '$lib/types/service';
	import type { ServiceProposalEvent, ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
	import { formatStandardDateTimeShort } from '$lib/utils/helpers/dateFormatter';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { resolveServiceTierLabel } from '$lib/utils/service-quote/tier-label';
	import { generateAllMapLinks } from '$lib/utils/location/maps';
	import ErrorAlertWithModal from '$lib/components/ErrorAlertWithModal.svelte';
	import { detectErrorType } from '$lib/utils/helpers/errorTypeDetector';
	import ServiceProposalComposer, {
		type ServiceProposalComposerSubmitPayload
	} from './ServiceProposalComposer.svelte';
	import IconMapMarker from '~icons/mdi/map-marker';
	import IconOpenInNew from '~icons/mdi/open-in-new';

	const {
		isOpen = false,
		mode = 'compose',
		timeline,
		service = null,
		proposal = null,
		serviceTitle = null,
		blockedReason = null,
		disabled = false,
		allowDelete = false,
		deleteSubmitting = false,
		deleteError = null,
		onClose,
		onSubmit,
		onDelete
	}: {
		isOpen?: boolean;
		mode?: 'compose' | 'view';
		timeline: ServiceQuoteTimelineEntry | null;
		service?: Service | null;
		proposal?: ServiceProposalEvent | null;
		serviceTitle?: string | null;
		blockedReason?: string | null;
		disabled?: boolean;
		allowDelete?: boolean;
		deleteSubmitting?: boolean;
		deleteError?: string | null;
		onClose: () => void;
		onSubmit: (
			payload: ServiceProposalComposerSubmitPayload
		) =>
			| Promise<{ success: boolean; error?: string } | void>
			| { success: boolean; error?: string }
			| void;
		onDelete?: () =>
			| Promise<{ success: boolean; error?: string } | void>
			| { success: boolean; error?: string }
			| void;
	} = $props();

	let requesterProfile = $state<{
		averageRating?: number;
		tasksCompleted?: number;
	} | null>(null);
	const isPasskeyDeleteError = $derived.by(
		() => Boolean(deleteError) && detectErrorType(deleteError ?? '') === 'biometric'
	);

	$effect(() => {
		const pubkey = timeline?.request.pubkey;
		if (!pubkey) {
			requesterProfile = null;
			return;
		}

		requesterProfile = { averageRating: 0, tasksCompleted: 0 };
	});

	async function handleSubmit(payload: ServiceProposalComposerSubmitPayload) {
		const result = await onSubmit(payload);
		if (!result || (typeof result === 'object' && result.success !== false)) {
			onClose();
		}
		return result;
	}

	function tr(key: string, fallback: string): string {
		try {
			const value = $t(key);
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}

	function trv(key: string, fallback: string, values: Record<string, string | number>): string {
		try {
			const value = $t(key, { values });
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}

	function formatDateTime(timestampSeconds: number | undefined): string {
		if (!timestampSeconds) {
			return '—';
		}

		return formatStandardDateTimeShort(new Date(timestampSeconds * 1000), $locale || 'en');
	}

	const drawerTitle = $derived(
		mode === 'view'
			? tr('dashboard.services.my_services.quote_inbox.view_proposal', 'View Proposal')
			: tr('dashboard.services.my_services.quote_inbox.send_proposal', 'Send Proposal')
	);
	const proposalStatusLabel = $derived.by(() => {
		if (!timeline) {
			return tr(
				'dashboard.services.my_services.quote_inbox.statuses.proposal_sent',
				'Proposal sent'
			);
		}

		switch (timeline.resolvedStatus) {
			case 'accepted':
				return tr(
					'dashboard.services.my_services.quote_inbox.statuses.accepted',
					'Contract created'
				);
			case 'declined':
				return tr('dashboard.services.my_services.quote_inbox.statuses.declined', 'Declined');
			case 'withdrawn':
				return tr('dashboard.services.my_services.quote_inbox.statuses.withdrawn', 'Withdrawn');
			case 'expired':
				return tr('dashboard.services.my_services.quote_inbox.statuses.expired', 'Expired');
			case 'accepting':
				return tr('dashboard.services.my_services.quote_inbox.statuses.accepting', 'Accepting');
			case 'contract_sync_pending':
				return tr(
					'dashboard.services.my_services.quote_inbox.statuses.contract_sync_pending',
					'Contract syncing'
				);
			case 'accept_failed':
				return tr(
					'dashboard.services.my_services.quote_inbox.statuses.accept_failed',
					'Accept failed'
				);
			case 'accept_unknown':
				return tr(
					'dashboard.services.my_services.quote_inbox.statuses.accept_unknown',
					'Accept unknown'
				);
			default:
				return tr(
					'dashboard.services.my_services.quote_inbox.statuses.proposal_sent',
					'Proposal sent'
				);
		}
	});
	const proposalStatusClass = $derived.by(() => {
		switch (timeline?.resolvedStatus) {
			case 'accepted':
				return 'badge-success';
			case 'accepting':
			case 'contract_sync_pending':
				return 'badge-info';
			case 'accept_failed':
			case 'accept_unknown':
				return 'badge-error';
			case 'declined':
			case 'withdrawn':
			case 'expired':
				return 'badge-ghost';
			default:
				return 'badge-secondary';
		}
	});
	const formattedProposalAmount = $derived.by(() => {
		const amount = proposal?.content.amountUsdt;
		if (!amount) {
			return '—';
		}

		const numericAmount = Number(amount);
		return Number.isFinite(numericAmount)
			? `$${formatNumberWithTwoDecimals(numericAmount)}`
			: `$${amount}`;
	});
	const selectedTierLabel = $derived(
		resolveServiceTierLabel(service, timeline?.request.content.tierId)
	);
	const inquiryDescription = $derived(timeline?.request.content.inquiry.description?.trim() ?? '');
	const serviceLocation = $derived(timeline?.request.content.serviceLocation ?? null);
	const mapLinks = $derived.by(() => {
		const location = serviceLocation?.location;
		if (!location) return null;
		return generateAllMapLinks(location, { label: serviceLocation?.label });
	});

	let inquiryDescriptionElement: HTMLParagraphElement | null = $state(null);
	let showFullInquiryDescription = $state(false);
	let isInquiryDescriptionTruncated = $state(false);

	function checkIfInquiryDescriptionTruncated() {
		if (!inquiryDescriptionElement || !inquiryDescription) {
			isInquiryDescriptionTruncated = false;
			return;
		}

		const clone = inquiryDescriptionElement.cloneNode(true) as HTMLElement;
		clone.className = inquiryDescriptionElement.className.replace(/line-clamp-\d+/g, '').trim();
		clone.style.position = 'absolute';
		clone.style.visibility = 'hidden';
		clone.style.pointerEvents = 'none';
		clone.style.height = 'auto';
		clone.style.maxHeight = 'none';
		clone.style.overflow = 'visible';
		clone.style.width = `${inquiryDescriptionElement.offsetWidth}px`;
		document.body.appendChild(clone);

		const fullHeight = clone.scrollHeight;
		const lineHeight = parseFloat(getComputedStyle(inquiryDescriptionElement).lineHeight) || 24;
		const maxHeight = lineHeight * 3;

		document.body.removeChild(clone);

		isInquiryDescriptionTruncated = fullHeight > maxHeight + 1;
	}

	onMount(() => {
		const handleResize = () => {
			if (isOpen) {
				checkIfInquiryDescriptionTruncated();
			}
		};

		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	});

	$effect(() => {
		const requestId = timeline?.request.id ?? null;
		const currentDescription = inquiryDescription;

		showFullInquiryDescription = false;
		isInquiryDescriptionTruncated = false;

		if (!isOpen || !requestId || !currentDescription || !inquiryDescriptionElement) {
			return;
		}

		requestAnimationFrame(() => {
			setTimeout(() => {
				checkIfInquiryDescriptionTruncated();
			}, 0);
		});
	});
</script>

<Drawer {isOpen} title={drawerTitle} {onClose} isScrollable={true} respectBottomNav={true}>
	{#if timeline}
		<section class="border-base-300 bg-base-100 mb-4 rounded-2xl border p-4 shadow-sm">
			<div class="space-y-2">
				<div class="pt-1">
					<UserInfoDisplay
						pubkey={timeline.request.pubkey}
						rating={requesterProfile?.averageRating ?? null}
						size="md"
						avatarAlt={tr('dashboard.find_tasks.avatar_alt', 'Avatar')}
					/>
				</div>
				{#if serviceTitle}
					<p class="text-base-content/60 text-sm">{serviceTitle}</p>
				{/if}
				<div>
					<p
						bind:this={inquiryDescriptionElement}
						class={`text-base-content/80 text-sm leading-6 whitespace-pre-line ${
							showFullInquiryDescription ? '' : 'line-clamp-3'
						}`}
						id="service-proposal-drawer-inquiry-description"
						data-testid="service-proposal-drawer-inquiry-description"
					>
						{timeline.request.content.inquiry.description}
					</p>

					{#if isInquiryDescriptionTruncated}
						<button
							type="button"
							class="btn btn-ghost btn-xs mt-2 h-auto min-h-0 px-0 text-[0.75rem] font-semibold tracking-wide uppercase"
							aria-controls="service-proposal-drawer-inquiry-description"
							aria-expanded={showFullInquiryDescription}
							onclick={() => {
								showFullInquiryDescription = !showFullInquiryDescription;
							}}
						>
							{showFullInquiryDescription
								? tr('dashboard.service_requests.show_less', 'See Less')
								: tr('dashboard.service_requests.show_more', 'See More')}
						</button>
					{/if}
				</div>
				{#if selectedTierLabel || timeline.request.content.selectedAddOns?.length || timeline.request.content.rushDelivery}
					<div class="flex flex-wrap gap-2 pt-1 text-xs">
						{#if selectedTierLabel}
							<span class="badge badge-outline badge-sm">{selectedTierLabel}</span>
						{/if}
						{#if timeline.request.content.selectedAddOns?.length}
							<span class="badge badge-outline badge-sm">
								{trv(
									timeline.request.content.selectedAddOns.length === 1
										? 'dashboard.services.my_services.quote_inbox.add_ons_one'
										: 'dashboard.services.my_services.quote_inbox.add_ons_other',
									timeline.request.content.selectedAddOns.length === 1
										? '1 add-on'
										: `${timeline.request.content.selectedAddOns.length} add-ons`,
									{ count: timeline.request.content.selectedAddOns.length }
								)}
							</span>
						{/if}
						{#if timeline.request.content.rushDelivery}
							<span class="badge badge-outline badge-sm">
								{tr('dashboard.services.my_services.quote_inbox.rush_delivery', 'Rush delivery')}
							</span>
						{/if}
					</div>
				{/if}

				{#if serviceLocation && mapLinks}
					<div class="border-base-200 mt-3 border-t pt-3" data-testid="request-service-location">
						<div class="flex items-start gap-3">
							<div class="bg-primary/10 mt-0.5 rounded-full p-1.5">
								<IconMapMarker class="text-primary h-4 w-4" />
							</div>
							<div class="min-w-0 flex-1">
								<p class="text-base-content/60 mb-0.5 text-xs font-medium tracking-wider uppercase">
									{tr(
										'dashboard.services.my_services.quote_inbox.tasker_location',
										"Tasker's Location"
									)}
								</p>
								<p class="word-break-words text-sm font-medium">
									{serviceLocation.label}
								</p>
								<div class="mt-2 flex flex-wrap gap-2">
									<a
										href={mapLinks.universal}
										target="_blank"
										rel="noopener noreferrer"
										class="btn btn-xs btn-primary btn-outline gap-1"
									>
										<IconOpenInNew class="h-3 w-3" />
										{tr('dashboard.contracts.open_in_maps', 'Open in Maps')}
									</a>
									<div class="dropdown dropdown-top">
										<div tabindex="0" role="button" class="btn btn-xs btn-ghost">
											{tr('dashboard.contracts.more_map_options', 'More options')}
										</div>
										<ul class="dropdown-content menu bg-base-100 rounded-box z-10 w-40 p-2 shadow">
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
												<a href={mapLinks.waze} target="_blank" rel="noopener noreferrer"> Waze </a>
											</li>
										</ul>
									</div>
								</div>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</section>

		{#if mode === 'view' && proposal}
			<section class="border-base-300 bg-base-100 rounded-2xl border p-4 shadow-sm">
				<div class="space-y-4">
					<div class="flex items-start justify-between gap-4">
						<div class="min-w-0">
							<p class="text-base-content/60 text-xs font-semibold tracking-wide uppercase">
								{tr(
									'dashboard.services.my_services.quote_inbox.latest_proposal',
									'Latest Proposal'
								)}
							</p>
							<p class="text-base-content mt-1 text-2xl font-semibold">
								{formattedProposalAmount}
							</p>
						</div>
						<div class="badge badge-sm {proposalStatusClass}">
							{proposalStatusLabel}
						</div>
					</div>

					<div class="grid gap-3 md:grid-cols-2">
						<div class="bg-base-200/60 rounded-xl p-3">
							<p class="text-base-content/60 text-xs font-medium">
								{tr('dashboard.services.my_services.quote_inbox.estimated_start', 'Start Date')}
							</p>
							<p class="mt-1 text-sm font-medium">
								{formatDateTime(proposal.content.estimatedStartTime)}
							</p>
						</div>
						<div class="bg-base-200/60 rounded-xl p-3">
							<p class="text-base-content/60 text-xs font-medium">
								{tr('dashboard.services.my_services.quote_inbox.estimated_end', 'End Date')}
							</p>
							<p class="mt-1 text-sm font-medium">
								{formatDateTime(proposal.content.estimatedEndTime)}
							</p>
						</div>
						<div class="bg-base-200/60 rounded-xl p-3">
							<p class="text-base-content/60 text-xs font-medium">
								{tr(
									'dashboard.services.my_services.quote_inbox.estimated_duration_label',
									'Estimated Duration'
								)}
							</p>
							<p class="mt-1 text-sm font-medium">{proposal.content.estimatedDuration}</p>
						</div>
						<div class="bg-base-200/60 rounded-xl p-3">
							<p class="text-base-content/60 text-xs font-medium">
								{tr(
									'dashboard.services.my_services.quote_inbox.proposal_expires',
									'Proposal Expires'
								)}
							</p>
							<p class="mt-1 text-sm font-medium">
								{formatDateTime(proposal.content.expirationTimestamp)}
							</p>
						</div>
					</div>

					<div class="space-y-3">
						<div>
							<p class="text-base-content/60 text-xs font-medium">
								{tr('dashboard.services.my_services.quote_inbox.scope_of_work', 'Scope of work')}
							</p>
							<p class="text-base-content mt-1 text-sm whitespace-pre-line">
								{proposal.content.description}
							</p>
						</div>
						{#if proposal.content.coverLetter}
							<div>
								<p class="text-base-content/60 text-xs font-medium">
									{tr('dashboard.services.my_services.quote_inbox.cover_letter', 'Cover Letter')}
								</p>
								<p class="text-base-content mt-1 text-sm whitespace-pre-line">
									{proposal.content.coverLetter}
								</p>
							</div>
						{/if}
					</div>

					{#if deleteError}
						{#if isPasskeyDeleteError}
							<ErrorAlertWithModal
								error={deleteError}
								isPasskeyError
								autoOpenModal={false}
								class="text-sm"
							/>
						{:else}
							<div class="alert alert-outline alert-error text-sm">
								<span>{deleteError}</span>
							</div>
						{/if}
					{/if}

					{#if onDelete && allowDelete}
						<div class="flex justify-end">
							<button
								type="button"
								class="btn btn-outline btn-error"
								disabled={deleteSubmitting}
								onclick={() => onDelete?.()}
							>
								{#if deleteSubmitting}
									<span class="loading loading-spinner loading-sm"></span>
								{/if}
								{tr(
									'dashboard.services.my_services.quote_inbox.delete_proposal',
									'Delete Proposal'
								)}
							</button>
						</div>
					{/if}
				</div>
			</section>
		{:else}
			<ServiceProposalComposer {blockedReason} {disabled} onSubmit={handleSubmit} />
		{/if}
	{/if}
</Drawer>
