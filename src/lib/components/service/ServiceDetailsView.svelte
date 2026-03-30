<script lang="ts">
	import { onMount } from 'svelte';
	import type {
		ServiceContractAgreementSnapshot,
		ServiceContractPricingSnapshot
	} from '$lib/types/contract';
	import type { Service, ServiceTier } from '$lib/types/service.d';
	import type { Attachment } from '$lib/types/task.d';
	import { t, locale } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { browser, dev } from '$app/environment';
	import {
		getServiceDisplayTitle,
		getServiceDisplayDescription,
		getServiceDisplayTiers,
		getServiceDisplayAddOns,
		getServiceDisplayFaqs,
		getServiceDeliveryTimeDisplay
	} from '$lib/utils/serviceDisplayTranslation';
	import { authState } from '$lib/stores/auth.store';
	import { user } from '$lib/stores/user.store';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
	import Gallery from '$lib/components/Gallery.svelte';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';
	import ServiceTierSelector from '$lib/components/service/ServiceTierSelector.svelte';
	import ServiceAddOnsSelector from '$lib/components/service/ServiceAddOnsSelector.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import RequestQuoteModal from '$lib/components/service/RequestQuoteModal.svelte';
	import ServiceInstantBuyModal from '$lib/components/service/ServiceInstantBuyModal.svelte';
	import IconArrowLeft from '~icons/mdi/arrow-left';
	import type { QuoteRequestPayload } from '$lib/types/service.d';
	import { serviceQuoteUiStore } from '$lib/stores/service-quote-ui.store';
	import { getInstantBuyEligibility } from '$lib/utils/service-instant-buy/eligibility';
	import {
		createInstantBuySnapshot,
		revalidateLatestInstantBuyService,
		type InstantBuyCreateSnapshot
	} from '$lib/utils/service-instant-buy/create';
	import { buildServiceAddress } from '$lib/utils/service-quote/protocol';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { createServiceContract } from '$lib/utils/service-contract/create';
	import { waitForContractCreationByTransactionHash } from '$lib/utils/service-contract/await-contract-creation';
	import { describeServiceContractPreflightFailure } from '$lib/utils/service-contract/preflight-feedback';
	import {
		preflightServiceContractCreation,
		type ServiceContractPreflightErrorCode
	} from '$lib/utils/service-contract/preflight';
	import {
		clearPendingServiceContractNavigation,
		writePendingServiceContractNavigation
	} from '$lib/utils/service-contract/pending-navigation';
	import { appStore } from '$lib/stores/app.store';
	import { ethers } from 'ethers';
	import { escrow } from '$lib/utils/escrow';
	import {
		allAssets,
		formatSats,
		totalBalances,
		walletManager,
		walletStore
	} from '$lib/stores/wallet.store';
	import { contractStore } from '$lib/stores/contract.store';
	import type { ContractCreationEvent } from '$lib/types/contract';
	import { getActiveServiceContractsForService } from '$lib/utils/service-contract/active-contracts';
	import { queryTaskeeServiceQuoteThreads } from '$lib/utils/service-quote/query';
	import { summarizeDeleteGuardForThreads } from '$lib/utils/service-quote/resolver';
	import { deleteService } from '$lib/nostr/service';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import { buildEarningQueryUrl } from '$lib/utils/dashboardQuery';
	import { deleteServicePortfolioMedia } from '$lib/utils/service/media-cleanup';
	import {
		clearPendingServiceDelete,
		markServiceDeletePending
	} from '$lib/stores/service-delete-ui.store';
	import {
		clearServiceQuoteReentryState,
		parseServiceQuoteReentryState
	} from '$lib/utils/service-quote/reentry';
	import {
		acquireBookNowSubmissionLock,
		clearBookNowOutboxEntry,
		clearTerminalOrStaleBookNowOutboxEntries,
		readRecoverableBookNowOutboxEntry,
		updateBookNowOutboxEntry,
		type BookNowOutboxEntry
	} from '$lib/utils/service-contract/book-now-outbox';
	import { recoverBookNowContract } from '$lib/utils/service-contract/recover';
	import { buildServiceContractLocationSnapshot } from '$lib/utils/service-contract/location';

	let { service, serviceId } = $props<{
		service: Service | null;
		serviceId: string;
	}>();

	const isOwner = $derived(service?.npub === $user?.npub);

	const currentLocale = $derived($locale || 'en');
	const displayTitle = $derived(service ? getServiceDisplayTitle(service, currentLocale) : '');
	const displayDescriptionFull = $derived(
		service ? getServiceDisplayDescription(service, currentLocale) : ''
	);
	const displayTiers = $derived(service ? getServiceDisplayTiers(service, currentLocale) : []);
	const displayAddOns = $derived(service ? getServiceDisplayAddOns(service, currentLocale) : []);
	const displayFaqs = $derived(service ? getServiceDisplayFaqs(service, currentLocale) : []);
	const deliveryTimeDisplay = $derived(
		service ? getServiceDeliveryTimeDisplay(service, currentLocale) : undefined
	);

	let descriptionExpanded = $state(false);
	const DESCRIPTION_PREVIEW_LENGTH = 300;
	const descriptionNeedsExpand = $derived(
		!!displayDescriptionFull && displayDescriptionFull.length > DESCRIPTION_PREVIEW_LENGTH
	);
	const descriptionPreview = $derived(
		displayDescriptionFull?.slice(0, DESCRIPTION_PREVIEW_LENGTH).trim() ?? ''
	);
	const descriptionDisplay = $derived(
		descriptionExpanded || !descriptionNeedsExpand
			? (displayDescriptionFull ?? '')
			: descriptionPreview + '...'
	);

	const tiersWithPrice = $derived(displayTiers.filter((t: ServiceTier) => (t.price ?? 0) > 0));

	let selectedTierId = $state<string | null>(null);
	let selectedAddOnIds = $state<string[]>([]);
	let requestQuoteModalOpen = $state(false);
	let instantBuyModalOpen = $state(false);
	let instantBuyPreparing = $state(false);
	let instantBuySubmitting = $state(false);
	let instantBuyErrorMessage = $state('');
	let instantBuyErrorHint = $state('');
	let instantBuyDraft = $state<InstantBuyDraft | null>(null);
	let instantBuyFundingCheck = $state<InstantBuyFundingCheck | null>(null);
	let instantBuyFundingCheckInFlight = $state(false);
	let instantBuyPendingTransactionHash = $state('');
	let instantBuyPendingAmountRbtc = $state('');
	let instantBuyPostSubmitErrorMessage = $state('');
	let instantBuyBackgrounded = $state(false);
	let deleteCheckInFlight = $state(false);
	let deleteSubmitting = $state(false);
	let lastInstantBuyDebugSignature = $state('');
	let bookNowSubmissionOwnerId = $state('');
	let deleteModalState = $state<{
		mode: 'blocked' | 'confirm';
		openQuoteCount: number;
		activeContractCount: number;
		totalQuoteCount: number;
	} | null>(null);

	type ServiceRuntimeFields = Service & {
		instantBuyLeadHours?: number;
		serviceAddress?: string;
	};

	type InstantBuyDraft = {
		snapshot: InstantBuyCreateSnapshot;
		amountUsd: number;
		selectedTierLabel: string | null;
		providerName: string | null;
		providerAddress: string | null;
		serviceAddress: string;
		pricingSnapshot: ServiceContractPricingSnapshot;
		agreementSnapshot: ServiceContractAgreementSnapshot;
	};

	type InstantBuyFundingCheck = {
		status: 'ready' | 'error';
		errorCode?: ServiceContractPreflightErrorCode;
		message: string;
		hint: string | null;
		btcPrice: number | null;
		totalRequiredUsd: number | null;
		totalRequiredSats: string;
	};

	const bitcoinAsset = $derived($allAssets.find((asset) => asset.assetId === 'rbtc'));
	const walletBalanceSatsLabel = $derived(formatSats($totalBalances.sats));
	const walletBalanceUsdLabel = $derived.by(() => {
		if (bitcoinAsset?.usdValue != null && Number.isFinite(bitcoinAsset.usdValue)) {
			return `$${formatNumberWithTwoDecimals(bitcoinAsset.usdValue)}`;
		}

		if (instantBuyFundingCheck?.btcPrice && Number.isFinite($totalBalances.rbtc)) {
			return `$${formatNumberWithTwoDecimals($totalBalances.rbtc * instantBuyFundingCheck.btcPrice)}`;
		}

		return '';
	});
	const instantBuyRequiredUsdLabel = $derived.by(() => {
		if (instantBuyFundingCheck?.totalRequiredUsd == null) {
			return '';
		}

		return `$${formatNumberWithTwoDecimals(instantBuyFundingCheck.totalRequiredUsd)}`;
	});

	const basePriceForAddOns = $derived.by(() => {
		if (!service?.pricing) return 0;
		const p = service.pricing;
		if (p.type === ServicePricingTypeEnum.TIERED && selectedTierId && p.tiers?.length) {
			const tier = p.tiers.find((t: ServiceTier) => t.id === selectedTierId);
			return tier?.price ?? 0;
		}
		if (p.type === ServicePricingTypeEnum.FIXED && p.amount != null) return p.amount;
		if (p.type === ServicePricingTypeEnum.HOURLY && p.hourlyRate != null) return p.hourlyRate;
		return 0;
	});

	const showTierSelector = $derived(
		!isOwner &&
			service?.pricing?.type === ServicePricingTypeEnum.TIERED &&
			tiersWithPrice.length > 0
	);
	const showAddOnsSelector = $derived(
		!isOwner &&
			service?.pricing?.type !== ServicePricingTypeEnum.INQUIRY_REQUIRED &&
			displayAddOns.length > 0
	);
	const selectedTier = $derived(
		service?.pricing?.tiers?.find((tier: ServiceTier) => tier.id === selectedTierId) ?? null
	);
	const selectedAddOns = $derived(
		displayAddOns.filter((addOn) => selectedAddOnIds.includes(addOn.id))
	);
	const instantBuyService = $derived(service as ServiceRuntimeFields | null);
	const contractCreationStore = escrow.eventOps.getContractCreationStore();
	const instantBuyProviderWalletAddress = $derived.by(() =>
		instantBuyService ? resolveProviderWalletAddress(instantBuyService) : null
	);
	const instantBuyContractCreationEvent = $derived.by(() => {
		if (!instantBuyPendingTransactionHash) {
			return null;
		}

		return matchesContractCreationTransaction(
			$contractCreationStore,
			instantBuyPendingTransactionHash
		)
			? $contractCreationStore
			: null;
	});
	const showInstantBuyContractCreationProgress = $derived(
		Boolean(instantBuyPendingTransactionHash)
	);
	const instantBuyContractCreationStatus = $derived.by(() => {
		if (!instantBuyPendingTransactionHash) {
			return 'idle' as const;
		}
		if (instantBuyPostSubmitErrorMessage || instantBuyContractCreationEvent?.error) {
			return 'error' as const;
		}
		if (
			instantBuyContractCreationEvent?.contractEventId ||
			instantBuyContractCreationEvent?.escrowId
		) {
			return 'success' as const;
		}
		return 'creating' as const;
	});
	const instantBuyContractCreationMessage = $derived.by(
		() => instantBuyPostSubmitErrorMessage || instantBuyContractCreationEvent?.error || ''
	);
	const instantBuyEligibility = $derived(
		getInstantBuyEligibility(instantBuyService, selectedTierId ?? undefined)
	);
	const showInstantBuyCta = $derived(
		Boolean(instantBuyProviderWalletAddress) &&
			(instantBuyEligibility.code === 'eligible' ||
				instantBuyEligibility.code === 'missing_selected_tier' ||
				instantBuyEligibility.code === 'invalid_selected_tier')
	);
	const isOffline = $derived(!$browserNetworkStatus.online);
	const showReconnectNotice = $derived(
		$browserNetworkStatus.online && $browserNetworkStatus.lastTransition === 'online'
	);
	const isInstantBuyDisabled = $derived(!instantBuyEligibility.eligible);
	const instantBuyDisabledReason = $derived.by(() => {
		if (instantBuyEligibility.code === 'eligible') {
			return '';
		}
		if (instantBuyEligibility.code === 'missing_selected_tier') {
			return $t('dashboard.services.detail.instant_buy.select_tier_required');
		}
		if (instantBuyEligibility.code === 'invalid_selected_tier') {
			return $t('dashboard.services.detail.instant_buy.invalid_tier');
		}
		return $t('dashboard.services.detail.instant_buy.not_eligible');
	});
	const requestQuoteContextSummary = $derived.by(() => {
		const summary: string[] = [];
		if (selectedTier) {
			summary.push(
				`${$t('dashboard.services.detail.request_quote_summary.tier')}: ${selectedTier.name} ($${formatNumberWithTwoDecimals(selectedTier.price)})`
			);
		}
		if (selectedAddOns.length > 0) {
			summary.push(
				`${$t('dashboard.services.detail.request_quote_summary.add_ons')}: ${selectedAddOns
					.map((addOn) => addOn.name)
					.join(', ')}`
			);
		}
		if (
			service?.pricing?.type === ServicePricingTypeEnum.FIXED &&
			service.pricing.deliveryTime?.display
		) {
			summary.push(
				`${$t('dashboard.services.detail.request_quote_summary.pricing')}: ${service.pricing.deliveryTime.display}`
			);
		}
		return summary;
	});

	$effect(() => {
		if (!browser || !dev || !service || isOwner) {
			return;
		}

		const taskerLocation = service.locationDetails?.taskerLocation;
		const debugSnapshot = {
			serviceId: service.uniqueId || service.id,
			status: service.status,
			pricingType: service.pricing?.type ?? null,
			showInstantBuyCta,
			instantBuyEligibilityCode: instantBuyEligibility.code,
			instantBuyEligible: instantBuyEligibility.eligible,
			providerWalletResolved: instantBuyProviderWalletAddress,
			providerWalletPresent: Boolean(instantBuyProviderWalletAddress),
			rootCause: !instantBuyProviderWalletAddress
				? 'missing_provider_wallet'
				: instantBuyEligibility.code,
			instantBuyLeadHours: instantBuyService?.instantBuyLeadHours ?? null,
			instantBuyDeliveryHours: instantBuyService?.instantBuyDeliveryHours ?? null,
			pricingDeliveryTime: service.pricing?.deliveryTime
				? {
						min: service.pricing.deliveryTime.min,
						max: service.pricing.deliveryTime.max,
						unit: service.pricing.deliveryTime.unit
					}
				: null,
			rushDeliveryEnabled:
				service.pricing?.type === ServicePricingTypeEnum.TIERED
					? (selectedTier?.rushDelivery?.enabled ?? null)
					: (service.pricing?.rushDelivery?.enabled ?? null),
			perDistanceChargeAmount: taskerLocation?.perDistanceCharge?.amount ?? null,
			providerWalletAddress: instantBuyService?.providerWalletAddress ?? null
		};
		const nextSignature = JSON.stringify(debugSnapshot);

		if (lastInstantBuyDebugSignature === nextSignature) {
			return;
		}

		lastInstantBuyDebugSignature = nextSignature;
		console.debug('[ServiceDetailsView] Book Now diagnostics', debugSnapshot);
	});

	function translateCategory(category: { id: string; name: string } | string): string {
		const id = typeof category === 'string' ? category : category.id;
		const cat = TASK_CATEGORIES.find((c) => c.id === id);
		if (cat) {
			const translated = $t(`categories.${cat.slug}.name`);
			return translated.startsWith('categories.') ? cat.name : translated;
		}
		return typeof category === 'string' ? category : (category as { name: string }).name;
	}

	function isVideoFile(url: string): boolean {
		return /\.(mp4|webm|ogg|mov)$/i.test(url);
	}

	function detailText(key: string, fallback: string): string {
		const translated = $t(key) as string;
		return !translated || translated === key ? fallback : translated;
	}

	async function prepareGalleryImages(attachments: Attachment[]) {
		const imagePromises = attachments
			.filter((a) => a.url && !isVideoFile(a.url))
			.map(
				(attachment) =>
					new Promise<{ url: string; alt: string; width: number; height: number; size?: number }>(
						(resolve) => {
							const img = new Image();
							img.onload = () =>
								resolve({
									url: attachment.url,
									alt: attachment.alt || ($t('dashboard.services.detail.attachment') as string),
									width: img.naturalWidth,
									height: img.naturalHeight,
									size: attachment.size
								});
							img.onerror = () =>
								resolve({
									url: attachment.url,
									alt: attachment.alt || ($t('dashboard.services.detail.attachment') as string),
									width: 0,
									height: 0,
									size: attachment.size
								});
							img.src = attachment.url;
						}
					)
			);
		return Promise.all(imagePromises);
	}

	function formatDateString(date: string | number): string {
		const dateObj = typeof date === 'string' ? new Date(date) : new Date(date * 1000);
		return new Intl.DateTimeFormat(currentLocale, {
			month: 'short',
			year: 'numeric'
		}).format(dateObj);
	}

	function normalizeAddressCandidate(candidate: unknown): string | null {
		if (typeof candidate !== 'string' || !candidate.trim()) {
			return null;
		}

		try {
			return ethers.getAddress(candidate.trim().toLowerCase());
		} catch {
			return null;
		}
	}

	function resolveProviderWalletAddress(runtimeService: ServiceRuntimeFields): string | null {
		return normalizeAddressCandidate(runtimeService.providerWalletAddress);
	}

	function normalizeTransactionHash(transactionHash: string): string {
		return transactionHash.trim().toLowerCase();
	}

	function getBookNowOutboxStorage(): Storage | null {
		return browser ? window.localStorage : null;
	}

	function getBookNowSubmissionOwner(): string {
		if (!browser) {
			return 'server';
		}

		const storageKey = 'bittasker.book-now-submission-owner.v1';
		const existingOwnerId = window.sessionStorage.getItem(storageKey)?.trim();
		if (existingOwnerId) {
			return existingOwnerId;
		}

		const nextOwnerId = globalThis.crypto?.randomUUID?.() ?? `book-now-${Date.now()}`;
		window.sessionStorage.setItem(storageKey, nextOwnerId);
		return nextOwnerId;
	}

	function ensureBookNowSubmissionOwnerId(): string {
		if (bookNowSubmissionOwnerId) {
			return bookNowSubmissionOwnerId;
		}

		bookNowSubmissionOwnerId = getBookNowSubmissionOwner();
		return bookNowSubmissionOwnerId;
	}

	function buildBookNowFingerprint(draft: InstantBuyDraft): string {
		const addOnIds = [...(draft.pricingSnapshot.selectedAddOns ?? [])].sort().join(',');
		return [
			serviceId,
			draft.serviceAddress,
			draft.pricingSnapshot.serviceVersionRef,
			draft.snapshot.selectedTierId ?? '',
			addOnIds,
			$user?.npub ?? '',
			service?.npub ?? ''
		]
			.map((value) => value.trim().toLowerCase())
			.join('|');
	}

	function readBookNowOutboxEntryForDraft(draft: InstantBuyDraft): BookNowOutboxEntry | null {
		return readRecoverableBookNowOutboxEntry(
			getBookNowOutboxStorage(),
			buildBookNowFingerprint(draft)
		);
	}

	function clearBookNowOutboxForDraft(draft: InstantBuyDraft): void {
		clearBookNowOutboxEntry(getBookNowOutboxStorage(), buildBookNowFingerprint(draft));
	}

	function updateBookNowOutboxForDraft(
		draft: InstantBuyDraft,
		state: BookNowOutboxEntry['state'],
		overrides: Partial<
			Pick<BookNowOutboxEntry, 'instantOrderId' | 'amountRbtc' | 'transactionHash' | 'escrowId'>
		> = {},
		expectedLockOwnerId: string | undefined = undefined
	): BookNowOutboxEntry {
		const resolvedExpectedLockOwnerId =
			expectedLockOwnerId ??
			(state === 'submission_locked' ? ensureBookNowSubmissionOwnerId() : undefined);
		return updateBookNowOutboxEntry(getBookNowOutboxStorage(), {
			fingerprint: buildBookNowFingerprint(draft),
			state,
			instantOrderId: overrides.instantOrderId ?? draft.snapshot.instantOrderId,
			amountRbtc: overrides.amountRbtc ?? null,
			transactionHash: overrides.transactionHash ?? null,
			escrowId: overrides.escrowId ?? null,
			expectedLockOwnerId: resolvedExpectedLockOwnerId,
			lockOwnerId: state === 'submission_locked' ? resolvedExpectedLockOwnerId : undefined
		});
	}

	function matchesContractCreationTransaction(
		event: ContractCreationEvent | null,
		transactionHash: string
	): event is ContractCreationEvent {
		if (!event) {
			return false;
		}

		const expectedHash = normalizeTransactionHash(transactionHash);
		if (!expectedHash) {
			return false;
		}

		const candidateHashes = [event.transactionHash, ...(event.transactionHashes ?? [])]
			.map((value) => (typeof value === 'string' ? normalizeTransactionHash(value) : null))
			.filter((value): value is string => Boolean(value));

		return candidateHashes.includes(expectedHash);
	}

	function resolveInstantBuyAmountUsd(runtimeService: ServiceRuntimeFields): number | null {
		if (!runtimeService.pricing) {
			return null;
		}

		const selectedAddOnsTotal = selectedAddOns.reduce((sum, addOn) => sum + (addOn.price ?? 0), 0);

		if (runtimeService.pricing.type === ServicePricingTypeEnum.FIXED) {
			return runtimeService.pricing.amount != null
				? runtimeService.pricing.amount + selectedAddOnsTotal
				: null;
		}

		if (runtimeService.pricing.type !== ServicePricingTypeEnum.TIERED || !selectedTierId) {
			return null;
		}

		const tierPrice =
			runtimeService.pricing.tiers?.find((tier: ServiceTier) => tier.id === selectedTierId)
				?.price ?? null;
		return tierPrice != null ? tierPrice + selectedAddOnsTotal : null;
	}

	function resolveProviderDisplayName(runtimeService: ServiceRuntimeFields): string | null {
		const providerName = runtimeService.creator?.username?.trim();
		return providerName && providerName.length > 0 ? providerName : null;
	}

	function buildInstantBuyAgreementSnapshot(
		runtimeService: ServiceRuntimeFields,
		purchaseKey: string
	): ServiceContractAgreementSnapshot {
		const selectedTierDescription =
			runtimeService.pricing?.type === ServicePricingTypeEnum.TIERED && selectedTierId
				? (runtimeService.pricing.tiers?.find((tier: ServiceTier) => tier.id === selectedTierId)
						?.description ?? '')
				: '';
		const includedScope =
			selectedTierDescription.trim() || displayDescriptionFull || runtimeService.description;

		return {
			selectedTierId: selectedTierId ?? undefined,
			selectedTierLabel: selectedTier?.name ?? undefined,
			serviceLocation: buildServiceContractLocationSnapshot(runtimeService),
			selectedAddOns:
				selectedAddOns.length > 0 ? selectedAddOns.map((addOn) => addOn.name) : undefined,
			deliverables: includedScope,
			priceSnapshotRef: purchaseKey,
			priceSnapshotLabel: `$${formatNumberWithTwoDecimals(resolveInstantBuyAmountUsd(runtimeService) ?? 0)}`
		};
	}

	function buildInstantBuyDraft(
		runtimeService: ServiceRuntimeFields,
		existingInstantOrderId?: string
	): InstantBuyDraft {
		const snapshot = createInstantBuySnapshot({
			service: runtimeService,
			selectedTierId: selectedTierId ?? undefined,
			instantOrderId: existingInstantOrderId
		});
		const amountUsd = resolveInstantBuyAmountUsd(runtimeService);

		if (amountUsd == null || !Number.isFinite(amountUsd) || amountUsd <= 0) {
			throw new Error($t('dashboard.services.detail.instant_buy.pricing_unavailable'));
		}

		const pricingSnapshot: ServiceContractPricingSnapshot = {
			serviceVersionRef: runtimeService.id,
			tierId: snapshot.selectedTierId,
			selectedAddOns: selectedAddOnIds.length > 0 ? [...selectedAddOnIds] : undefined
		};
		const agreementSnapshot = buildInstantBuyAgreementSnapshot(
			runtimeService,
			snapshot.purchaseKey
		);

		return {
			snapshot,
			amountUsd,
			selectedTierLabel: selectedTier?.name ?? null,
			providerName: resolveProviderDisplayName(runtimeService),
			providerAddress: resolveProviderWalletAddress(runtimeService),
			serviceAddress: buildServiceAddress(runtimeService),
			pricingSnapshot,
			agreementSnapshot
		};
	}

	async function revalidateInstantBuyDraft(
		existingInstantOrderId?: string
	): Promise<InstantBuyDraft> {
		if (!service) {
			throw new Error(
				detailText(
					'dashboard.services.detail.service_runtime_unavailable',
					'Service is unavailable.'
				)
			);
		}

		const latestService = (await revalidateLatestInstantBuyService({
			serviceId,
			expectedServiceEventId: service.id,
			selectedTierId: selectedTierId ?? undefined
		})) as ServiceRuntimeFields;

		return buildInstantBuyDraft(latestService, existingInstantOrderId);
	}

	async function syncInstantBuyDraftWithRecoverableEntry(
		draft: InstantBuyDraft
	): Promise<{ draft: InstantBuyDraft; entry: BookNowOutboxEntry | null }> {
		const existingEntry = readBookNowOutboxEntryForDraft(draft);
		if (
			existingEntry?.instantOrderId &&
			existingEntry.instantOrderId !== draft.snapshot.instantOrderId
		) {
			const recoveredDraft = await revalidateInstantBuyDraft(existingEntry.instantOrderId);
			return {
				draft: recoveredDraft,
				entry: readBookNowOutboxEntryForDraft(recoveredDraft)
			};
		}

		return { draft, entry: existingEntry };
	}

	function handleOpenRequestQuote() {
		if (isOwner) {
			appStore.showErrorToast(
				detailText(
					'dashboard.services.detail.self_quote_blocked',
					"You can't request a quote on your own service."
				)
			);
			return;
		}

		if (!service?.npub) return;
		if (isOffline) {
			appStore.showErrorToast(
				detailText(
					'dashboard.services.detail.quote_request_offline',
					'You are offline. Reconnect before requesting a quote.'
				)
			);
			return;
		}
		if (!$authState.isAuthenticated) {
			goto(resolve(`/auth/login?returnTo=${encodeURIComponent(window.location.pathname)}`));
			return;
		}
		requestQuoteModalOpen = true;
	}

	function resetInstantBuyState() {
		instantBuyPreparing = false;
		instantBuySubmitting = false;
		instantBuyErrorMessage = '';
		instantBuyErrorHint = '';
		instantBuyDraft = null;
		instantBuyFundingCheck = null;
		instantBuyFundingCheckInFlight = false;
		instantBuyPendingTransactionHash = '';
		instantBuyPendingAmountRbtc = '';
		instantBuyPostSubmitErrorMessage = '';
		instantBuyBackgrounded = false;
	}

	function handleCloseInstantBuyDrawer() {
		if (showInstantBuyContractCreationProgress) {
			instantBuyBackgrounded = true;
			instantBuyModalOpen = false;
			return;
		}

		instantBuyModalOpen = false;
		resetInstantBuyState();
	}

	function closeDeleteModal() {
		if (deleteSubmitting) {
			return;
		}

		deleteModalState = null;
	}

	function buildContractsHighlightUrl(escrowId: string): string {
		if (typeof window !== 'undefined' && window.location.pathname.startsWith('/earning')) {
			return buildEarningQueryUrl(new URL('/earning', window.location.origin), {
				tab: 'contracts',
				context: 'services',
				highlight: escrowId
			});
		}

		return `/dashboard?tab=contracts&context=services&highlight=${encodeURIComponent(escrowId)}`;
	}

	async function prepareInstantBuyDraft(existingDraft?: InstantBuyDraft | null) {
		instantBuyPreparing = true;
		instantBuyErrorMessage = '';
		instantBuyErrorHint = '';
		instantBuyFundingCheck = null;
		instantBuyPostSubmitErrorMessage = '';

		try {
			const nextDraft = await revalidateInstantBuyDraft(existingDraft?.snapshot.instantOrderId);
			const syncedDraft = await syncInstantBuyDraftWithRecoverableEntry(nextDraft);
			instantBuyDraft = syncedDraft.draft;
			instantBuyPreparing = false;
			await refreshInstantBuyFundingCheck(instantBuyDraft);
		} catch (error) {
			instantBuyDraft = existingDraft ?? null;
			instantBuyErrorMessage =
				error instanceof Error
					? error.message
					: detailText(
							'dashboard.services.detail.instant_buy.prepare_error',
							'Unable to prepare Book Now right now.'
						);
		} finally {
			instantBuyPreparing = false;
		}
	}

	async function refreshInstantBuyFundingCheck(draft: InstantBuyDraft) {
		instantBuyFundingCheckInFlight = true;
		instantBuyFundingCheck = null;
		instantBuyErrorMessage = '';
		instantBuyErrorHint = '';

		try {
			try {
				await walletManager.initialize();
			} catch {
				// Preflight handles disconnected wallets and returns stable recovery copy.
			}

			try {
				await walletManager.loadAssets();
			} catch {
				// Balance display is best-effort; preflight still gates confirmation.
			}

			const btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
			const preflight = await preflightServiceContractCreation(
				{
					freelancerAddress: draft.providerAddress ?? '',
					freelancerPubkey: service?.npub ?? '',
					amountUsdt: draft.amountUsd.toFixed(2),
					estimatedStartTime: draft.snapshot.estimatedStartTime,
					estimatedCompletionTime: draft.snapshot.estimatedEndTime
				},
				btcPrice
			);

			if (!preflight.ok) {
				const feedback = describeServiceContractPreflightFailure(
					preflight.errorCode,
					preflight.error
				);
				instantBuyErrorMessage = feedback.message;
				instantBuyErrorHint = feedback.hint ?? '';
				instantBuyFundingCheck = {
					status: 'error',
					errorCode: preflight.errorCode,
					message: feedback.message,
					hint: feedback.hint,
					btcPrice,
					totalRequiredUsd: null,
					totalRequiredSats: ''
				};
				return;
			}

			instantBuyFundingCheck = {
				status: 'ready',
				message: detailText(
					'dashboard.services.detail.book_now_drawer.balance_verified',
					'Your available balance covers this service contract.'
				),
				hint: null,
				btcPrice,
				totalRequiredUsd: Number.parseFloat(preflight.totalRequired) * btcPrice,
				totalRequiredSats: formatSats(
					Math.round(Number.parseFloat(preflight.totalRequired) * 100_000_000)
				)
			};
		} catch (error) {
			const feedback = describeServiceContractPreflightFailure(
				'preflight_failed',
				error instanceof Error
					? error.message
					: detailText(
							'dashboard.services.detail.instant_buy.prepare_error',
							'Unable to prepare Book Now right now.'
						)
			);
			instantBuyErrorMessage = feedback.message;
			instantBuyErrorHint = feedback.hint ?? '';
			instantBuyFundingCheck = {
				status: 'error',
				errorCode: 'preflight_failed',
				message: feedback.message,
				hint: feedback.hint,
				btcPrice: null,
				totalRequiredUsd: null,
				totalRequiredSats: ''
			};
		} finally {
			instantBuyFundingCheckInFlight = false;
		}
	}

	function canBeginInstantBuyReview(): boolean {
		if (!service) return false;
		if (isOffline) {
			appStore.showErrorToast(
				detailText(
					'dashboard.services.detail.instant_buy.offline',
					'You are offline. Reconnect before funding this service contract.'
				)
			);
			return;
		}
		if (!$authState.isAuthenticated) {
			goto(resolve(`/auth/login?returnTo=${encodeURIComponent(window.location.pathname)}`));
			return false;
		}
		if (!instantBuyEligibility.eligible) {
			appStore.showErrorToast(
				instantBuyDisabledReason ||
					detailText(
						'dashboard.services.detail.instant_buy.not_ready',
						'This service is not ready for Book Now.'
					)
			);
			return false;
		}

		return true;
	}

	function handleOpenInstantBuy() {
		if (isOwner) {
			appStore.showErrorToast(
				detailText(
					'dashboard.services.detail.self_book_now_blocked',
					"You can't book your own service."
				)
			);
			return;
		}

		if (!canBeginInstantBuyReview()) {
			return;
		}

		if (showInstantBuyContractCreationProgress && instantBuyPendingTransactionHash) {
			instantBuyBackgrounded = false;
			instantBuyModalOpen = true;
			return;
		}

		instantBuyBackgrounded = false;
		instantBuyModalOpen = true;
		void prepareInstantBuyDraft(null);
	}

	async function completeBookNowSuccess(escrowId: string): Promise<void> {
		const backgrounded = instantBuyBackgrounded && !instantBuyModalOpen;
		clearPendingServiceContractNavigation(
			typeof window === 'undefined' ? null : window.sessionStorage
		);
		appStore.showSuccessToast(
			backgrounded
				? detailText(
						'dashboard.services.detail.instant_buy.success_background',
						'Book Now order confirmed. Your service contract is ready in Contracts.'
					)
				: detailText(
						'dashboard.services.detail.instant_buy.success',
						'Book Now order confirmed. Opening your service contract.'
					)
		);
		instantBuyModalOpen = false;
		resetInstantBuyState();
		if (!backgrounded) {
			await goto(buildContractsHighlightUrl(escrowId));
		}
	}

	async function handleBookNowRecoveryResult(
		draft: InstantBuyDraft,
		result: Awaited<ReturnType<typeof recoverBookNowContract>>
	): Promise<boolean> {
		if (result.status === 'contract_ready') {
			clearBookNowOutboxForDraft(draft);
			await completeBookNowSuccess(result.escrowId);
			return true;
		}

		if (result.status === 'funding_pending' || result.status === 'contract_sync_pending') {
			updateBookNowOutboxForDraft(
				draft,
				result.status === 'funding_pending' ? 'funding_submitted' : 'contract_sync_pending',
				{
					transactionHash: result.transactionHash,
					escrowId: result.escrowId ?? null
				},
				undefined
			);
			instantBuyPendingTransactionHash = result.transactionHash;
			const syncMessage = detailText(
				'dashboard.services.detail.instant_buy.pending_contract_sync',
				'The secure payment contract transaction was submitted, but the contract confirmation is still syncing. Open Contracts to monitor it.'
			);
			appStore.showInfoToast(syncMessage);
			if (!instantBuyBackgrounded) {
				instantBuyModalOpen = false;
				resetInstantBuyState();
				await goto(resolve('/dashboard?tab=contracts&context=services'));
			}
			return true;
		}

		clearBookNowOutboxForDraft(draft);
		instantBuyPostSubmitErrorMessage =
			result.error ||
			detailText(
				'dashboard.services.detail.instant_buy.complete_error',
				'Unable to complete Book Now right now.'
			);
		return false;
	}

	async function recoverExistingBookNowContract(
		draft: InstantBuyDraft,
		entry: BookNowOutboxEntry
	): Promise<boolean> {
		const transactionHash = entry.transactionHash?.trim();
		const amountRbtc = entry.amountRbtc?.trim();
		if (!service || !transactionHash || !amountRbtc) {
			return false;
		}

		const recoveryResult = await recoverBookNowContract({
			transactionHash,
			escrowId: entry.escrowId,
			freelancerPubkey: service.npub,
			clientRskAddress: $walletStore.rsk.address ?? undefined,
			amountRbtc,
			estimatedStartTime: draft.snapshot.estimatedStartTime,
			estimatedCompletionTime: draft.snapshot.estimatedEndTime,
			serviceId: service.uniqueId || service.id,
			serviceAddress: draft.serviceAddress,
			serviceTitle: displayTitle,
			serviceDescription: displayDescriptionFull,
			contextVersionRef: draft.pricingSnapshot.serviceVersionRef,
			instantOrderId: entry.instantOrderId ?? draft.snapshot.instantOrderId,
			selectedTierId: draft.snapshot.selectedTierId,
			pricingSnapshot: draft.pricingSnapshot,
			agreementSnapshot: draft.agreementSnapshot
		});

		return await handleBookNowRecoveryResult(draft, recoveryResult);
	}

	async function handleConfirmInstantBuy() {
		if (!service) {
			instantBuyErrorMessage = detailText(
				'dashboard.services.detail.service_runtime_unavailable',
				'Service is unavailable.'
			);
			instantBuyErrorHint = '';
			return;
		}
		if (isOffline) {
			return;
		}
		if (!instantBuyDraft) {
			instantBuyErrorMessage = detailText(
				'dashboard.services.detail.instant_buy.loading_snapshot_retry',
				'The latest service snapshot is still loading. Retry before buying now.'
			);
			instantBuyErrorHint = '';
			return;
		}
		if (instantBuyFundingCheck?.status !== 'ready') {
			await refreshInstantBuyFundingCheck(instantBuyDraft);
			if (instantBuyFundingCheck?.status !== 'ready') {
				return;
			}
		}

		instantBuySubmitting = true;
		instantBuyErrorMessage = '';
		instantBuyErrorHint = '';
		instantBuyPostSubmitErrorMessage = '';

		try {
			let draft = await revalidateInstantBuyDraft(instantBuyDraft.snapshot.instantOrderId);
			const syncedDraft = await syncInstantBuyDraftWithRecoverableEntry(draft);
			draft = syncedDraft.draft;
			instantBuyDraft = draft;
			await refreshInstantBuyFundingCheck(draft);
			if (instantBuyFundingCheck?.status !== 'ready') {
				return;
			}

			const existingEntry = syncedDraft.entry ?? readBookNowOutboxEntryForDraft(draft);
			if (existingEntry?.transactionHash) {
				await recoverExistingBookNowContract(draft, existingEntry);
				return;
			}

			const submissionOwnerId = ensureBookNowSubmissionOwnerId();
			const lockResult = acquireBookNowSubmissionLock(
				getBookNowOutboxStorage(),
				buildBookNowFingerprint(draft),
				submissionOwnerId
			);
			if (!lockResult.acquired) {
				if (lockResult.reason === 'recoverable_exists' && lockResult.entry.transactionHash) {
					await recoverExistingBookNowContract(draft, lockResult.entry);
					return;
				}

				instantBuyErrorMessage = detailText(
					'dashboard.services.detail.instant_buy.submission_in_progress',
					'Book Now is already being processed in another tab. Return to that tab or wait a moment before retrying.'
				);
				instantBuyErrorHint = '';
				return;
			}

			updateBookNowOutboxForDraft(
				draft,
				'submission_locked',
				{ instantOrderId: draft.snapshot.instantOrderId },
				submissionOwnerId
			);

			const contractResult = await createServiceContract({
				freelancerPubkey: service.npub,
				freelancerAddress: draft.providerAddress ?? '',
				amountUsdt: draft.amountUsd.toFixed(2),
				estimatedStartTime: draft.snapshot.estimatedStartTime,
				estimatedCompletionTime: draft.snapshot.estimatedEndTime,
				serviceId: service.uniqueId || service.id,
				serviceAddress: draft.serviceAddress,
				serviceTitle: displayTitle,
				serviceDescription: displayDescriptionFull,
				contextVersionRef: draft.pricingSnapshot.serviceVersionRef,
				purchaseMode: 'instant_buy',
				instantOrderId: draft.snapshot.instantOrderId,
				selectedTierId: draft.snapshot.selectedTierId,
				pricingSnapshot: draft.pricingSnapshot,
				agreementSnapshot: draft.agreementSnapshot
			});

			if (!contractResult.success) {
				clearBookNowOutboxForDraft(draft);
				const feedback = describeServiceContractPreflightFailure(
					contractResult.errorCode,
					contractResult.error ||
						detailText(
							'dashboard.services.detail.instant_buy.complete_error',
							'Unable to complete Book Now right now.'
						)
				);
				instantBuyErrorMessage = feedback.message;
				instantBuyErrorHint = feedback.hint ?? '';
				return;
			}

			instantBuyPendingTransactionHash = contractResult.transactionHash ?? '';
			instantBuyPendingAmountRbtc = contractResult.amount ?? '';
			updateBookNowOutboxForDraft(
				draft,
				'funding_submitted',
				{
					instantOrderId: draft.snapshot.instantOrderId,
					amountRbtc: contractResult.amount ?? null,
					transactionHash: contractResult.transactionHash ?? null
				},
				submissionOwnerId
			);
			writePendingServiceContractNavigation(
				typeof window === 'undefined' ? null : window.sessionStorage,
				contractResult.transactionHash ?? ''
			);

			const contractCreationEvent = await waitForContractCreationByTransactionHash(
				contractResult.transactionHash ?? ''
			);

			clearBookNowOutboxForDraft(draft);
			await completeBookNowSuccess(contractCreationEvent.escrowId);
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: detailText(
							'dashboard.services.detail.instant_buy.complete_error',
							'Unable to complete Book Now right now.'
						);

			if (instantBuyDraft && instantBuyPendingTransactionHash) {
				const recovered = await recoverExistingBookNowContract(instantBuyDraft, {
					fingerprint: buildBookNowFingerprint(instantBuyDraft),
					state: 'funding_submitted',
					createdAtMs: Date.now(),
					updatedAtMs: Date.now(),
					instantOrderId: instantBuyDraft.snapshot.instantOrderId,
					amountRbtc: instantBuyPendingAmountRbtc,
					transactionHash: instantBuyPendingTransactionHash
				});
				if (recovered) {
					return;
				}
			}

			clearPendingServiceContractNavigation(
				typeof window === 'undefined' ? null : window.sessionStorage
			);
			if (instantBuyPendingTransactionHash) {
				instantBuyPostSubmitErrorMessage = errorMessage;
			} else {
				instantBuyErrorMessage = errorMessage;
				instantBuyErrorHint = '';
			}
		} finally {
			instantBuySubmitting = false;
		}
	}

	async function handleQuoteRequestConfirm(payload: QuoteRequestPayload) {
		if (!service) {
			return {
				success: false,
				error: detailText(
					'dashboard.services.detail.service_runtime_unavailable',
					'Service is unavailable.'
				)
			};
		}

		const result = await serviceQuoteUiStore.submitQuoteRequest({
			service,
			payload,
			tierId: selectedTierId,
			selectedAddOnIds,
			rushDelivery: false
		});

		if (!result.success || !result.quoteRequestId) {
			return {
				success: false,
				error:
					result.error ||
					detailText(
						'dashboard.services.detail.quote_request_submit_error',
						'Unable to submit quote request right now.'
					)
			};
		}

		appStore.showSuccessToast(
			detailText(
				'dashboard.services.detail.quote_submitted',
				'Quote request submitted successfully!'
			)
		);

		await goto(
			`/dashboard?tab=quotes&view=tasker&request=${encodeURIComponent(result.quoteRequestId)}`
		);

		serviceQuoteUiStore.setNonBlockingMessage('service_quote_protocol_pending');
		return { success: true };
	}

	function handleContactTaskee() {
		if (isOwner) {
			appStore.showErrorToast(
				detailText(
					'dashboard.services.detail.self_contact_blocked',
					"You can't contact yourself from your own service listing."
				)
			);
			return;
		}

		if (!service?.npub) return;
		if (!$authState.isAuthenticated) {
			goto(resolve(`/auth/login?returnTo=${encodeURIComponent(window.location.pathname)}`));
			return;
		}
		goto(resolve(`/dashboard/messages/to/${service.npub}`));
	}

	async function inspectDeleteGuards() {
		if (!service) {
			throw new Error(
				detailText(
					'dashboard.services.detail.service_runtime_unavailable',
					'Service is unavailable.'
				)
			);
		}

		await contractStore.loadContracts();
		const quoteThreads = await queryTaskeeServiceQuoteThreads({
			serviceAddress: buildServiceAddress(service),
			taskeePubkey: service.npub,
			limit: 100
		});
		const quoteGuard = summarizeDeleteGuardForThreads(quoteThreads);
		const activeContracts = getActiveServiceContractsForService($contractStore.contracts, service);

		return {
			hasOpenQuotes: quoteGuard.hasBlockingThreads,
			openQuoteCount: quoteGuard.blockingThreadCount,
			totalQuoteCount: quoteGuard.totalThreadCount,
			hasActiveContracts: activeContracts.length > 0,
			activeContractCount: activeContracts.length
		};
	}

	function applyReentryState(): void {
		if (typeof window === 'undefined' || !service || isOwner) {
			return;
		}

		const reentryState = parseServiceQuoteReentryState(new URL(window.location.href));

		if (service.pricing?.type === ServicePricingTypeEnum.TIERED && reentryState.tierId) {
			const matchingTier = tiersWithPrice.find(
				(tier: ServiceTier) => tier.id === reentryState.tierId
			);
			if (matchingTier) {
				selectedTierId = matchingTier.id;
			}
		}

		if (displayAddOns.length > 0 && reentryState.selectedAddOnIds.length > 0) {
			const validAddOnIds = new Set(displayAddOns.map((addOn) => addOn.id));
			selectedAddOnIds = reentryState.selectedAddOnIds.filter((addOnId) =>
				validAddOnIds.has(addOnId)
			);
		}

		if (
			reentryState.openRequestQuote &&
			$authState.isAuthenticated &&
			!isOffline &&
			service.status === 'active'
		) {
			requestQuoteModalOpen = true;
		}

		const nextUrl = clearServiceQuoteReentryState(new URL(window.location.href));
		window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
	}

	onMount(() => {
		bookNowSubmissionOwnerId = getBookNowSubmissionOwner();
		clearTerminalOrStaleBookNowOutboxEntries(getBookNowOutboxStorage());
		applyReentryState();
	});

	$effect(() => {
		if (!instantBuyBackgrounded || instantBuyModalOpen) {
			return;
		}

		if (
			instantBuyContractCreationStatus === 'success' &&
			instantBuyContractCreationEvent?.escrowId
		) {
			void completeBookNowSuccess(instantBuyContractCreationEvent.escrowId);
			return;
		}

		if (instantBuyContractCreationStatus === 'error' && instantBuyContractCreationMessage) {
			clearPendingServiceContractNavigation(
				typeof window === 'undefined' ? null : window.sessionStorage
			);
			appStore.showErrorToast(instantBuyContractCreationMessage);
			resetInstantBuyState();
		}
	});

	async function handleDeleteService() {
		if (!service) {
			return;
		}

		deleteCheckInFlight = true;
		try {
			const guard = await inspectDeleteGuards();
			deleteModalState = {
				mode: guard.hasActiveContracts ? 'blocked' : 'confirm',
				openQuoteCount: guard.openQuoteCount,
				activeContractCount: guard.activeContractCount,
				totalQuoteCount: guard.totalQuoteCount
			};
		} catch (error) {
			appStore.showErrorToast(
				error instanceof Error
					? error.message
					: detailText(
							'dashboard.services.detail.delete_service_messages.verify_error',
							'Unable to verify whether this service can be deleted right now.'
						)
			);
		} finally {
			deleteCheckInFlight = false;
		}
	}

	async function confirmDeleteService() {
		if (!service || !deleteModalState || deleteModalState.mode !== 'confirm') {
			return;
		}

		deleteSubmitting = true;
		markServiceDeletePending(service);
		try {
			const guard = await inspectDeleteGuards();
			await deleteService(
				service.id,
				{
					hasOpenQuotes: guard.hasOpenQuotes,
					hasActiveContracts: guard.hasActiveContracts
				},
				{
					uniqueId: service.uniqueId ?? null
				}
			);
			await deleteServicePortfolioMedia(service.portfolio);
			appStore.showSuccessToast(
				detailText(
					'dashboard.services.detail.delete_service_messages.success',
					'Service deleted successfully.'
				)
			);
			deleteModalState = null;
			if (typeof window !== 'undefined' && window.location.pathname.startsWith('/earning')) {
				await goto(resolve('/earning?tab=my-services'));
			} else {
				await goto(resolve('/dashboard?tab=my-services'));
			}
		} catch (error) {
			clearPendingServiceDelete(service);
			const message =
				error instanceof Error
					? error.message
					: detailText(
							'dashboard.services.detail.delete_service_messages.delete_error',
							'Unable to delete this service right now.'
						);
			const activeContractsBlockedMessage = $t(
				'dashboard.services.detail.delete_service_messages.active_contracts_blocked'
			);
			const isActiveContractsBlocked =
				message === 'Cannot delete a service with active contracts.' ||
				message === activeContractsBlockedMessage;
			appStore.showErrorToast(isActiveContractsBlocked ? activeContractsBlockedMessage : message);
			if (isActiveContractsBlocked) {
				try {
					const guard = await inspectDeleteGuards();
					deleteModalState = {
						mode: 'blocked',
						openQuoteCount: guard.openQuoteCount,
						activeContractCount: guard.activeContractCount,
						totalQuoteCount: guard.totalQuoteCount
					};
				} catch {
					deleteModalState = null;
				}
			}
		} finally {
			deleteSubmitting = false;
		}
	}
</script>

<div class="mx-auto max-w-6xl px-2 pb-24 md:px-0 md:pb-0">
	<div class="rounded-xl pt-4 md:pt-0">
		{#if !service}
			<div class="py-12 text-center">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-base-content/30 mx-auto h-12 w-12"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<h3 class="mt-4 text-lg font-semibold">
					{$t('dashboard.services.detail.not_found')}
				</h3>
				<p class="text-base-content/60 mt-1">
					{$t('dashboard.services.detail.not_found_message')}
				</p>
				<a href="/services" class="btn btn-primary mt-6"
					>{$t('dashboard.services.detail.browse_services')}</a
				>
			</div>
		{:else}
			<div class="mb-6 flex items-center gap-3">
				<div class="flex-1 text-left">
					<div class="mb-3">
						<a href="/services" class="btn btn-ghost btn-sm gap-2">
							<IconArrowLeft class="h-4 w-4" aria-hidden="true" />
							{$t('dashboard.services.detail.back_to_services')}
						</a>
					</div>
					<h3 class="">{$t('dashboard.services.detail.title')}</h3>
					<p class="text-base-content/70">{$t('dashboard.services.detail.description')}</p>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
				<div class="space-y-4 lg:col-span-2">
					<div class="bg-base-100 border-base-300 rounded-2xl border p-6 shadow-sm">
						<span class="line-clamp-2 text-xl font-semibold">{displayTitle}</span>
						<div class="text-base-content/70 mt-2 text-sm whitespace-pre-line">
							{descriptionDisplay}
						</div>
						{#if descriptionNeedsExpand}
							<button
								type="button"
								class="btn btn-ghost btn-sm text-primary mt-2"
								onclick={() => (descriptionExpanded = !descriptionExpanded)}
							>
								{descriptionExpanded
									? $t('dashboard.services.detail.see_less')
									: $t('dashboard.services.detail.see_more')}
							</button>
						{/if}

						{#if service.categories?.length > 0}
							<div class="border-base-300 mt-6 border-t pt-4">
								<h4 class="mb-2 font-semibold">
									{$t('dashboard.services.create.review.categories_label')}
								</h4>
								<div class="flex flex-wrap gap-2">
									{#each service.categories as category (typeof category === 'string' ? category : category.id)}
										<span class="badge badge-primary badge-outline badge-sm">
											{translateCategory(category)}
										</span>
									{/each}
								</div>
							</div>
						{/if}

						{#if service.skills?.length > 0}
							<div class="border-base-300 mt-4 border-t pt-4">
								<h4 class="mb-2 font-semibold">
									{$t('dashboard.services.create.review.skills_label')}
								</h4>
								<div class="flex flex-wrap gap-2">
									{#each service.skills as skill (skill)}
										<span class="badge badge-secondary badge-sm">{skill}</span>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Location types -->
						{#if service.serviceLocationTypes?.length > 0}
							<div class="border-base-300 mt-4 border-t pt-4">
								<h4 class="mb-2 font-semibold">
									{$t('dashboard.services.create.review.location_types_label')}
								</h4>
								<div class="flex flex-wrap gap-2">
									{#each service.serviceLocationTypes as locationType (locationType)}
										<span class="badge badge-accent badge-sm">
											{#if locationType === ServiceLocationTypeEnum.REMOTE}
												{$t('dashboard.services.create.location.remote_title')}
											{:else if locationType === ServiceLocationTypeEnum.TASKER_LOCATION}
												{$t('dashboard.services.create.location.tasker_title')}
											{:else if locationType === ServiceLocationTypeEnum.TASKEE_LOCATION}
												{$t('dashboard.services.create.location.taskee_title')}
											{:else}
												{locationType}
											{/if}
										</span>
									{/each}
								</div>
								{#if service.locationDetails?.taskerLocation?.serviceLocation?.formattedAddress}
									<p class="text-base-content/70 mt-2 text-sm">
										{service.locationDetails.taskerLocation.serviceLocation.formattedAddress}
									</p>
								{/if}
							</div>
						{/if}

						<!-- Pricing -->
						{#if service.pricing}
							<div class="border-base-300 mt-4 border-t pt-4">
								<h4 class="mb-2 font-semibold">
									{$t('dashboard.services.create.review.pricing_title')}
								</h4>
								<p class="text-base-content/70 text-sm">
									{#if service.pricing.type === ServicePricingTypeEnum.FIXED}
										{$t('dashboard.services.create.pricing.fixed_title')}: ${formatNumberWithTwoDecimals(
											service.pricing.amount ?? 0
										)}
										{service.pricing.currency}
										{#if deliveryTimeDisplay}
											· {deliveryTimeDisplay}
										{/if}
									{:else if service.pricing.type === ServicePricingTypeEnum.HOURLY}
										{$t('dashboard.services.create.pricing.hourly_title')}: ${formatNumberWithTwoDecimals(
											service.pricing.hourlyRate ?? 0
										)}/{$t('dashboard.services.create.pricing.hour')}
										{service.pricing.currency}
									{:else if service.pricing.type === ServicePricingTypeEnum.TIERED}
										{$t('dashboard.services.create.pricing.tiered_title')} · {$t(
											'dashboard.services.browse.pricing.from_price'
										)}
										{#if service.pricing.tiers?.length}
											${formatNumberWithTwoDecimals(
												Math.min(
													...service.pricing.tiers
														.map((t: ServiceTier) => t.price)
														.filter((p: number) => p > 0)
												) || 0
											)}
										{/if}
									{:else}
										{$t('dashboard.services.browse.pricing.request_quote')}
									{/if}
								</p>
							</div>
						{/if}

						<!-- Add-ons (locale-aware) -->
						{#if displayAddOns.length > 0}
							<div class="border-base-300 mt-4 border-t pt-4">
								<h4 class="mb-3 font-semibold">
									{$t('dashboard.services.create.review.addons_title')}
								</h4>
								<div class="flex flex-wrap gap-2">
									{#each displayAddOns as addOn (addOn.id)}
										<div class="badge badge-outline gap-1">
											{addOn.name} · ${formatNumberWithTwoDecimals(addOn.price)}
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Portfolio -->
						{#if service.portfolio && service.portfolio.length > 0}
							<div class="border-base-300 mt-4 border-t pt-4">
								<h4 class="mb-3 font-semibold">{$t('dashboard.services.detail.portfolio')}</h4>
								{#if service.portfolio.filter((a: Attachment) => a.url && !isVideoFile(a.url)).length > 0}
									{#await prepareGalleryImages(service.portfolio) then galleryImages}
										<Gallery
											galleryID="service-portfolio-gallery"
											images={galleryImages}
											thumbnailSize="h-40 w-40"
										/>
									{/await}
								{/if}
							</div>
						{/if}
					</div>
				</div>

				<!-- Sidebar -->
				<div class="lg:col-span-1">
					<div class="bg-base-100 sticky top-6 rounded-2xl p-6 shadow-sm">
						{#if isOwner}
							<div class="alert alert-info alert-outline">
								<span>{$t('dashboard.services.detail.you_are_provider')}</span>
							</div>
							<a
								href="/dashboard/create-service?edit=true&serviceId={service.uniqueId ||
									service.id}"
								class="btn btn-primary btn-sm mt-4 w-full"
							>
								{$t('dashboard.services.detail.edit_service')}
							</a>
							<button
								type="button"
								class="btn btn-error btn-outline btn-sm mt-2 w-full"
								onclick={handleDeleteService}
								disabled={deleteCheckInFlight || deleteSubmitting}
							>
								{#if deleteCheckInFlight || deleteSubmitting}
									<span class="loading loading-spinner loading-xs"></span>
								{/if}
								{$t('dashboard.services.detail.delete_service')}
							</button>
						{:else if service.status === 'active'}
							<div class="mb-6">
								<h4 class="mb-4">{$t('dashboard.services.detail.interested')}</h4>
								{#if isOffline}
									<div
										class="alert alert-warning alert-outline mb-3 text-sm"
										data-testid="service-detail-offline-alert"
									>
										<span>
											{$t('dashboard.services.detail.public_cta.offline_notice')}
										</span>
									</div>
								{:else if showReconnectNotice}
									<div
										class="alert alert-info alert-outline mb-3 text-sm"
										data-testid="service-detail-reconnect-alert"
									>
										<span>
											{$t('dashboard.services.detail.public_cta.reconnect_notice')}
										</span>
									</div>
								{/if}
								{#if showInstantBuyCta}
									<button
										class="btn btn-primary btn-sm w-full"
										onclick={handleOpenInstantBuy}
										disabled={isInstantBuyDisabled || instantBuyPreparing || isOffline}
										data-testid="service-detail-buy-now"
									>
										{#if instantBuyPreparing}
											<span class="loading loading-spinner loading-xs"></span>
										{/if}
										{$t('dashboard.services.detail.book_now')}
									</button>
									{#if instantBuyDisabledReason}
										<p class="text-base-content/60 mt-2 text-xs">
											{instantBuyDisabledReason}
										</p>
									{/if}
									<button
										class="btn btn-outline btn-sm mt-2 w-full"
										onclick={handleOpenRequestQuote}
										disabled={isOffline}
									>
										{$t('dashboard.services.detail.request_quote')}
									</button>
								{:else}
									<button
										class="btn btn-primary btn-sm w-full"
										onclick={handleOpenRequestQuote}
										disabled={isOffline}
									>
										{$t('dashboard.services.detail.request_quote')}
									</button>
								{/if}
								<button class="btn btn-ghost btn-sm mt-2 w-full" onclick={handleContactTaskee}>
									{$t('dashboard.services.detail.contact_taskee')}
								</button>
							</div>
						{:else}
							<div class="alert alert-warning alert-outline">
								<span>{$t('dashboard.services.detail.service_not_available')}</span>
							</div>
						{/if}

						{#if service.creator}
							<div class="border-base-300 mt-4 border-t pt-4">
								<h4 class="mb-3 font-semibold">{$t('dashboard.services.detail.taskee')}</h4>
								<div class="flex items-center gap-3">
									<div class="avatar">
										<div
											class="bg-base-300 flex h-12 w-12 items-center justify-center rounded-full"
										>
											{#if service.creator.avatar}
												<img
													src={service.creator.avatar}
													alt={$t('dashboard.services.detail.avatar_alt')}
													class="h-12 w-12 rounded-full object-cover"
												/>
											{:else}
												<div
													class="avatar placeholder text-neutral-content bg-primary flex h-12 w-12 items-center justify-center rounded-full text-xl font-semibold"
												>
													{service.creator.username?.charAt(0).toUpperCase() || '?'}
												</div>
											{/if}
										</div>
									</div>
									<div class="flex flex-col">
										<span class="font-medium"
											>{service.creator.username || $t('dashboard.services.detail.anonymous')}</span
										>
										<p class="text-base-content/60 text-sm">
											{$t('dashboard.services.detail.member_since')}
											{formatDateString(service.createdAt)}
										</p>
									</div>
								</div>
							</div>
						{/if}

						<!-- Tier selector (non-owner, tiered pricing) or read-only price levels (owner) -->
						{#if showTierSelector}
							<div class="border-base-300 mt-4 border-t pt-4">
								<ServiceTierSelector tiers={tiersWithPrice} bind:selectedTierId />
							</div>
						{:else if tiersWithPrice.length > 0 && isOwner}
							<div class="border-base-300 mt-4 border-t pt-4">
								<h4 class="mb-3 font-semibold">{$t('dashboard.services.detail.price_levels')}</h4>
								<div class="space-y-3">
									{#each tiersWithPrice as tier (tier.id)}
										<div class="bg-base-200 rounded-lg p-3">
											<div class="flex items-start justify-between gap-2">
												<div class="min-w-0 flex-1">
													<span class="font-medium">{tier.name}</span>
													{#if tier.isPopular}
														<span class="badge badge-primary badge-sm ml-1"
															>{$t('dashboard.services.create.tiers.popular')}</span
														>
													{/if}
												</div>
												<span class="shrink-0 font-bold"
													>${formatNumberWithTwoDecimals(tier.price)}</span
												>
											</div>
											{#if tier.description}
												<p class="text-base-content/70 mt-1.5 line-clamp-3 text-xs">
													{tier.description}
												</p>
											{/if}
											{#if tier.deliveryTime?.display}
												<p class="text-base-content/60 mt-1 text-xs">
													{$t('dashboard.services.create.tiers.delivery_time_label')}: {tier
														.deliveryTime.display}
												</p>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Add-ons selector (non-owner, with checkboxes and total) -->
						{#if showAddOnsSelector}
							<div class="border-base-300 mt-4 border-t pt-4">
								<ServiceAddOnsSelector
									addOns={displayAddOns}
									basePrice={basePriceForAddOns}
									bind:selectedAddOnIds
									disabled={service?.pricing?.type === ServicePricingTypeEnum.TIERED &&
										!selectedTierId}
								/>
							</div>
						{/if}

						<!-- FAQs (right sidebar, locale-aware) -->
						{#if displayFaqs.length > 0}
							<div class="border-base-300 mt-4 border-t pt-4">
								<h4 class="mb-3 font-semibold">{$t('dashboard.services.detail.faqs')}</h4>
								<div class="space-y-3">
									{#each displayFaqs as faq (faq.question)}
										<div class="collapse-arrow bg-base-200 collapse">
											<input type="checkbox" />
											<div class="collapse-title text-sm font-medium">{faq.question}</div>
											<div class="collapse-content text-base-content/70 text-xs">{faq.answer}</div>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</div>

	<RequestQuoteModal
		bind:open={requestQuoteModalOpen}
		{service}
		contextSummary={requestQuoteContextSummary}
		onConfirm={handleQuoteRequestConfirm}
		onClose={() => (requestQuoteModalOpen = false)}
	/>

	<ServiceInstantBuyModal
		open={instantBuyModalOpen}
		serviceTitle={displayTitle}
		providerName={instantBuyDraft?.providerName ?? service?.creator?.username ?? null}
		providerAvatar={service?.creator?.avatar ?? null}
		providerRating={service?.creator?.rating ?? 0}
		providerPubkey={service?.npub ?? null}
		providerMemberSince={service?.createdAt ?? null}
		amountUsd={instantBuyDraft?.amountUsd ?? null}
		selectedTierLabel={instantBuyDraft?.selectedTierLabel ?? null}
		agreementSnapshot={instantBuyDraft?.agreementSnapshot ?? null}
		pricingSnapshot={instantBuyDraft?.pricingSnapshot ?? null}
		instantOrderId={instantBuyDraft?.snapshot.instantOrderId ?? null}
		estimatedStartTime={instantBuyDraft?.snapshot.estimatedStartTime ?? null}
		estimatedCompletionTime={instantBuyDraft?.snapshot.estimatedEndTime ?? null}
		walletLoading={instantBuyFundingCheckInFlight}
		walletConnected={$walletStore.rsk.connected}
		walletBalanceSats={walletBalanceSatsLabel}
		walletBalanceUsd={walletBalanceUsdLabel}
		requiredBalanceSats={instantBuyFundingCheck?.totalRequiredSats ?? ''}
		requiredBalanceUsd={instantBuyRequiredUsdLabel}
		walletVerificationStatus={instantBuyFundingCheckInFlight
			? 'verifying'
			: (instantBuyFundingCheck?.status ?? 'idle')}
		walletVerificationMessage={instantBuyFundingCheckInFlight
			? $t('dashboard.services.detail.book_now_drawer.verifying_wallet')
			: (instantBuyFundingCheck?.message ?? '')}
		isPreparing={instantBuyPreparing}
		isSubmitting={instantBuySubmitting}
		{isOffline}
		{showReconnectNotice}
		errorMessage={instantBuyErrorMessage}
		errorHint={instantBuyErrorHint}
		showContractCreationProgress={showInstantBuyContractCreationProgress}
		contractCreationStatus={instantBuyContractCreationStatus}
		contractCreationMessage={instantBuyContractCreationMessage}
		canConfirm={instantBuyDraft !== null && instantBuyFundingCheck?.status === 'ready'}
		onConfirm={handleConfirmInstantBuy}
		onRetry={() => prepareInstantBuyDraft(instantBuyDraft)}
		onClose={handleCloseInstantBuyDrawer}
	/>

	<Modal
		isOpen={deleteModalState !== null}
		title={deleteModalState?.mode === 'blocked'
			? $t('dashboard.services.detail.delete_service_modal.blocked_title')
			: $t('dashboard.services.detail.delete_service_modal.confirm_title')}
		onClose={closeDeleteModal}
		size="md"
	>
		{#if deleteModalState}
			<p class="text-base-content/80 text-sm">
				{#if deleteModalState.mode === 'blocked'}
					{$t('dashboard.services.detail.delete_service_modal.blocked_body')}
				{:else if deleteModalState.openQuoteCount > 0}
					{$t('dashboard.services.detail.delete_service_modal.confirm_with_requests')}
				{:else}
					{$t('dashboard.services.detail.delete_service_modal.confirm_without_requests')}
				{/if}
			</p>

			{#if deleteModalState.mode === 'blocked'}
				<div class="mt-4 space-y-3">
					{#if deleteModalState.activeContractCount > 0}
						<div class="alert alert-error">
							<span>
								{$t('dashboard.services.detail.delete_service_modal.active_contracts', {
									values: { count: deleteModalState.activeContractCount }
								})}
							</span>
						</div>
					{/if}
				</div>
				<div class="mt-6 flex justify-end">
					<button type="button" class="btn btn-primary" onclick={closeDeleteModal}>
						{$t('dashboard.services.detail.delete_service_modal.close')}
					</button>
				</div>
			{:else}
				<div class="mt-4 space-y-3">
					{#if deleteModalState.openQuoteCount > 0}
						<div class="alert alert-warning">
							<span>
								{$t('dashboard.services.detail.delete_service_modal.open_requests_notice', {
									values: { count: deleteModalState.openQuoteCount }
								})}
							</span>
						</div>
					{:else}
						<p class="text-base-content/70 text-sm">
							{$t('dashboard.services.detail.delete_service_modal.no_dependents')}
						</p>
					{/if}
				</div>
				<div class="mt-6 flex justify-end gap-2">
					<button
						type="button"
						class="btn btn-ghost"
						onclick={closeDeleteModal}
						disabled={deleteSubmitting}
					>
						{$t('dashboard.services.detail.delete_service_modal.cancel')}
					</button>
					<button
						type="button"
						class="btn btn-error"
						onclick={confirmDeleteService}
						disabled={deleteSubmitting}
					>
						{#if deleteSubmitting}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						{$t('dashboard.services.detail.delete_service_modal.confirm')}
					</button>
				</div>
			{/if}
		{/if}
	</Modal>
</div>
