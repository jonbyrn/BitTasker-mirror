<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import type {
		ServiceContractAgreementSnapshot,
		ServiceContractPricingSnapshot
	} from '$lib/types/contract';
	import type { Service, ServiceTier } from '$lib/types/service.d';
	import type { Attachment, Location } from '$lib/types/task.d';
	import { serviceHeroLayout } from '$lib/utils/listings/publicListings';
	import { t, locale } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
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
	import { ServicePricingTypeEnum, ServiceLocationTypeEnum } from '$lib/utils/enums/service.enum';
	import {
		validateLocationWithinRadius,
		type RadiusValidationResult
	} from '$lib/utils/location/distance';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';
	import ServiceAddOnsSelector from '$lib/components/service/ServiceAddOnsSelector.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import StreamPlayer from '$lib/components/StreamPlayer.svelte';
	import RequestQuoteModal from '$lib/components/service/RequestQuoteModal.svelte';
	import ServiceInstantBuyModal from '$lib/components/service/ServiceInstantBuyModal.svelte';
	import IconClose from '~icons/mdi/close';
	import IconChevronLeft from '~icons/mdi/chevron-left';
	import IconChevronRight from '~icons/mdi/chevron-right';
	import IconStar from '~icons/mdi/star';
	import IconCheck from '~icons/mdi/check';
	import IconPlay from '~icons/mdi/play';
	import IconTruckDeliveryOutline from '~icons/mdi/truck-delivery-outline';
	import IconMapMarker from '~icons/mdi/map-marker';
	import ServiceShareButton from './ServiceShareButton.svelte';
	import ActionsMenu from '$lib/components/moderation/ActionsMenu.svelte';
	import PhotoSwipeLightbox from 'photoswipe/lightbox';
	import 'photoswipe/style.css';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
	import type { QuoteRequestPayload } from '$lib/types/service.d';
	import { serviceQuoteUiStore } from '$lib/stores/service-quote-ui.store';
	import { getInstantBuyEligibility } from '$lib/utils/service-instant-buy/eligibility';
	import {
		defaultBookedHours,
		hourlyBookingAmountUsd,
		normalizeBookedHours
	} from '$lib/utils/service-instant-buy/hourly-booking';
	import {
		createInstantBuySnapshot,
		revalidateLatestInstantBuyService,
		type InstantBuyCreateSnapshot
	} from '$lib/utils/service-instant-buy/create';
	import { buildServiceAddress } from '$lib/utils/service-quote/protocol';
	import { createServiceContract } from '$lib/utils/service-contract/create';
	import { describeServiceContractPreflightFailure } from '$lib/utils/service-contract/preflight-feedback';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { preflightServiceContractCreation } from '$lib/utils/service-contract/preflight';
	import { extractContractError } from '$lib/utils/wallet/contractErrorHandler';
	import { appStore } from '$lib/stores/app.store';
	import { ethers } from 'ethers';
	import { FEE_TIERS } from '@bittasker/wallet-core';

	const DEFAULT_CLIENT_FEE_TIER = 1;
	const PLATFORM_FEE_RATE = FEE_TIERS[DEFAULT_CLIENT_FEE_TIER].percentage / 10000;
	const ESTIMATED_NETWORK_FEE_USD = 0.5;
	import { formatSats, totalBalances, walletManager, walletStore } from '$lib/stores/wallet.store';
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
	import { ndk } from '$lib/nostr/ndk';
	import KINDS from '$lib/utils/constants/kinds';
	import {
		buildServiceContractLocationSnapshot,
		buildTaskerProvidedLocationSnapshot
	} from '$lib/utils/service-contract/location';
	import WalletPaymentModal from '$lib/components/wallet/WalletPaymentModal.svelte';
	import ReceivePaymentForm from '$lib/components/wallet/ReceivePaymentForm.svelte';
	import PaymentRequestModal from '$lib/components/wallet/PaymentRequestModal.svelte';
	import { loadNamespace, type SupportedLanguage } from '$lib/i18n/i18n';
	import { SvelteSet } from 'svelte/reactivity';
	import TaskLocationMap from '$lib/components/maps/TaskLocationMap.svelte';

	interface PreviewCreator {
		avatar?: string | null;
		username?: string | null;
		rating?: number;
		ratingCount?: number;
		pubkey?: string;
	}

	let {
		service,
		serviceId,
		isPreview = false,
		isDraft = false,
		isLoading = false,
		previewCreator = null
	} = $props<{
		service: Service | null;
		serviceId: string;
		isPreview?: boolean;
		isDraft?: boolean;
		isLoading?: boolean;
		previewCreator?: PreviewCreator | null;
	}>();

	let requestQuoteModalOpen = $state(false);
	let instantBuyModalOpen = $state(false);
	let bookNowBuyerMessage = $state('');
	let bookedHours = $state(1);
	let bookedHoursForServiceId = $state<string | null>(null);
	let instantBuyPreparing = $state(false);
	let instantBuySubmitting = $state(false);
	let instantBuyErrorMessage = $state('');
	let instantBuyErrorHint = $state('');

	// Tasker location for TASKER_LOCATION services (Book Now flow)
	let bookNowTaskerLocation = $state<Location | null>(null);
	let bookNowLocationValidation = $state<RadiusValidationResult | null>(null);

	let playingVideoKey = $state<string | null>(null);

	$effect(() => {
		const listingId = serviceId;
		const estimatedHours =
			service?.pricing?.type === ServicePricingTypeEnum.HOURLY
				? service.pricing.estimatedHours
				: undefined;
		if (!service || bookedHoursForServiceId === listingId) {
			return;
		}
		bookedHoursForServiceId = listingId;
		bookedHours = defaultBookedHours(estimatedHours);
	});

	function setBookedHoursFromInput(event: Event) {
		const parsedHours = Number.parseInt((event.target as HTMLInputElement).value, 10);
		if (Number.isInteger(parsedHours)) {
			bookedHours = normalizeBookedHours(parsedHours);
		}
	}

	function commitBookedHours(event: Event) {
		const input = event.target as HTMLInputElement;
		bookedHours = normalizeBookedHours(Number.parseInt(input.value, 10));
		input.value = String(bookedHours);
	}

	const effectiveCreator = $derived(
		isDraft && previewCreator ? { ...service?.creator, ...previewCreator } : service?.creator
	);

	const isOwner = $derived(service?.npub === $user?.npub);

	const currentLocale = $derived($locale || 'en');

	function detailText(
		key: string,
		fallback: string,
		values?: Record<string, string | number>
	): string {
		const translation = $t(key, { values });
		return !translation || translation === key ? applyValues(fallback, values) : translation;
	}

	function applyValues(template: string, values?: Record<string, string | number>): string {
		if (!values) return template;
		return Object.entries(values).reduce(
			(result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
			template
		);
	}

	function formatDeliveryTime(dt?: ServiceTier['deliveryTime'] | null): string {
		if (!dt || dt.value == null || !dt.unit) return '—';
		const unitKey = `common.time_units.${dt.unit}${dt.value !== 1 ? 's' : ''}`;
		return `${dt.value} ${$t(unitKey)}`;
	}

	// Ensure wallet translations are loaded for the "Add Funds" receive modal
	if (browser && $locale) {
		loadNamespace($locale as SupportedLanguage, 'dashboard/wallet').catch(console.error);
	}

	let isReceiveModalOpen = $state(false);
	let receiveInitialState = $state<Record<string, unknown> | null>(null);

	// Centralized Payment Request Modal state
	let paymentRequestModal = $state<{
		isOpen: boolean;
		swapId?: string | null;
		address?: string | null;
		network?: string | null;
		amount?: number | null;
		memo?: string | null;
		chargeFeesToPayer?: boolean;
		totalFees?: number | null;
		formState?: Record<string, unknown> | null;
	}>({
		isOpen: false,
		swapId: null,
		address: null,
		network: null,
		amount: null,
		memo: null,
		chargeFeesToPayer: false,
		totalFees: null,
		formState: null
	});

	function openPaymentRequestModal(data: Record<string, unknown>) {
		paymentRequestModal = {
			isOpen: true,
			...data
		} as typeof paymentRequestModal;
	}

	function closePaymentRequestModal() {
		paymentRequestModal.isOpen = false;
	}

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

	const tiersWithPrice = $derived(
		displayTiers
			.filter((t: ServiceTier) => (t.price ?? 0) > 0)
			.slice()
			.sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
	);

	let selectedTierId = $state<string | null>(null);
	let activeMobileTab = $state<string | null>(null);
	let tierExpanded = $state<Record<string, boolean>>({});
	let tierScrolledRight = $state(false);

	function updateTierScroll(e: Event) {
		const el = e.currentTarget as HTMLElement;
		tierScrolledRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
	}

	const popularTierId = $derived.by(() => {
		if (tiersWithPrice.length < 2) return null;
		// Middle one if odd, or middle-ish if even.
		const index = Math.min(tiersWithPrice.length - 1, Math.floor(tiersWithPrice.length / 2));
		return tiersWithPrice[index].id;
	});

	$effect(() => {
		if (tiersWithPrice.length > 0 && !selectedTierId) {
			const firstTier = tiersWithPrice.find((t: ServiceTier) => t.isPopular) || tiersWithPrice[0];
			selectedTierId = firstTier.id;
			activeMobileTab = firstTier.id;
		}
	});

	$effect(() => {
		if (selectedTierId && activeMobileTab !== selectedTierId) {
			activeMobileTab = selectedTierId;
		}
	});

	function handleTabChange(tierId: string) {
		selectedTierId = tierId;
		activeMobileTab = tierId;
	}

	function toggleTierExpansion(id: string) {
		tierExpanded[id] = !tierExpanded[id];
	}

	let selectedAddOnIds = $state<string[]>([]);
	let requestRushDelivery = $state<boolean>(false);

	const availableRushDelivery = $derived.by(() => {
		if (service?.pricing?.type === ServicePricingTypeEnum.TIERED) {
			return selectedTier?.rushDelivery?.enabled ? selectedTier.rushDelivery : null;
		}
		if (service?.pricing?.type === ServicePricingTypeEnum.FIXED) {
			return service.pricing.rushDelivery?.enabled ? service.pricing.rushDelivery : null;
		}
		return null;
	});

	$effect(() => {
		// Reset rush delivery if it becomes unavailable
		if (!availableRushDelivery) {
			requestRushDelivery = false;
		}
	});

	// Check if service requires tasker location input for booking
	const requiresTaskerLocationForBooking = $derived(
		service?.serviceLocationTypes?.includes(ServiceLocationTypeEnum.TASKER_LOCATION) ?? false
	);

	// Get the Taskee's service configuration for TASKER_LOCATION
	const taskeeServiceConfig = $derived.by(() => {
		if (!requiresTaskerLocationForBooking || !service?.locationDetails?.taskerLocation) {
			return null;
		}
		return {
			baseLocation: service.locationDetails.taskerLocation.serviceLocation,
			serviceRadius: service.locationDetails.taskerLocation.serviceRadius ?? 50 // Default 50km if not set
		};
	});

	// Handler for when the tasker selects a location in Book Now flow
	function handleBookNowLocationSelect(location: Location) {
		bookNowTaskerLocation = location;

		// Validate against radius if service has TASKER_LOCATION configuration
		if (taskeeServiceConfig) {
			bookNowLocationValidation = validateLocationWithinRadius(
				location,
				taskeeServiceConfig.baseLocation,
				taskeeServiceConfig.serviceRadius
			);
		} else {
			// No radius restriction, just mark as valid
			bookNowLocationValidation = {
				valid: true,
				distanceKm: null,
				maxRadiusKm: 0
			};
		}
	}

	// Clear location state when modal closes
	function clearBookNowLocationState() {
		bookNowTaskerLocation = null;
		bookNowLocationValidation = null;
	}

	const basePriceForAddOns = $derived.by(() => {
		const p = service?.pricing;
		if (!p) return 0;
		if (p.type === ServicePricingTypeEnum.TIERED) {
			const tier = p.tiers.find((t: ServiceTier) => t.id === selectedTierId);
			return tier?.price ?? 0;
		}
		if (p.type === ServicePricingTypeEnum.FIXED && p.amount != null) return p.amount;
		if (p.type === ServicePricingTypeEnum.HOURLY && p.hourlyRate != null) {
			return hourlyBookingAmountUsd(p.hourlyRate, bookedHours);
		}
		return 0;
	});

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

	const totalAmountUsd = $derived.by(() => {
		let total = basePriceForAddOns;
		total += selectedAddOns.reduce((sum, addon) => sum + (addon.price || 0), 0);
		if (requestRushDelivery && availableRushDelivery) {
			total += availableRushDelivery.price;
		}
		return total;
	});
	const totalPaymentSats = $derived.by(() => {
		// Calculate total payment sats the same way as USD: base + platform fee + $0.50
		const platformFee = totalAmountUsd * PLATFORM_FEE_RATE;
		const totalPayment = totalAmountUsd + platformFee + ESTIMATED_NETWORK_FEE_USD;
		if (totalPayment <= 0) return '';
		return formatSats(Math.round((totalPayment * 100_000_000) / btcPrice.price));
	});
	const instantBuyService = $derived(service as ServiceRuntimeFields | null);
	const instantBuyProviderWalletAddress = $derived.by(() =>
		instantBuyService ? resolveProviderWalletAddress(instantBuyService) : null
	);

	type InstantBuyCreationState =
		| { state: 'idle' }
		| { state: 'pending'; transactionHash: string }
		| { state: 'confirmed'; transactionHash: string; paymentId: string }
		| { state: 'failed'; transactionHash: string; error: string };

	let instantBuyCreationState = $state<InstantBuyCreationState>({ state: 'idle' });

	const showInstantBuyContractCreationProgress = $derived(instantBuyCreationState.state !== 'idle');
	const instantBuyContractCreationStatus = $derived.by(() => {
		if (instantBuyCreationState.state === 'idle') {
			return 'idle' as const;
		}
		if (instantBuyPostSubmitErrorMessage) {
			return 'error' as const;
		}
		if (instantBuyCreationState.state === 'failed') {
			return 'error' as const;
		}
		if (instantBuyCreationState.state === 'confirmed') {
			return 'success' as const;
		}
		return 'creating' as const;
	});
	const instantBuyContractCreationMessage = $derived.by(() => {
		if (instantBuyPostSubmitErrorMessage) {
			return instantBuyPostSubmitErrorMessage;
		}
		if (instantBuyCreationState.state === 'failed') {
			return instantBuyCreationState.error;
		}
		return '';
	});
	const instantBuyEligibility = $derived(
		getInstantBuyEligibility(instantBuyService, selectedTierId ?? undefined)
	);
	const showInstantBuyCta = $derived(
		instantBuyEligibility.code !== 'inactive_service' &&
			instantBuyEligibility.code !== 'missing_service' &&
			instantBuyEligibility.code !== 'invalid_pricing_type' &&
			instantBuyEligibility.code !== 'missing_lead_hours'
	);
	const isOffline = $derived(!$browserNetworkStatus.online);
	const showReconnectNotice = $derived(
		$browserNetworkStatus.online && $browserNetworkStatus.lastTransition === 'online'
	);
	const instantBuyDisabledReason = $derived.by(() => {
		const code = instantBuyEligibility.code;
		if (code === 'eligible') return '';

		switch (code) {
			case 'missing_selected_tier':
				return $t('dashboard.services.detail.instant_buy.select_tier_required');
			case 'invalid_selected_tier':
				return $t('dashboard.services.detail.instant_buy.invalid_tier');
			case 'missing_lead_hours':
				return $t('dashboard.services.detail.instant_buy.missing_lead_hours');
			case 'invalid_lead_hours':
				return $t('dashboard.services.detail.instant_buy.invalid_lead_hours');
			case 'missing_delivery_time':
				return $t('dashboard.services.detail.instant_buy.missing_delivery_time');
			case 'unsupported_rush_delivery':
				return $t('dashboard.services.detail.instant_buy.unsupported_rush_delivery');
			case 'inactive_service':
				return $t('dashboard.services.detail.inactive_service');
			default:
				return $t('dashboard.services.detail.instant_buy.not_eligible');
		}
	});

	const walletBalanceSatsLabel = $derived(
		formatSats($totalBalances.sats, { showZero: true, compact: false })
	);
	const walletBalanceUsdLabel = $derived.by(() => {
		const balance = ($totalBalances.sats / 100_000_000) * btcPrice.price;
		return `$${formatNumberWithTwoDecimals(balance)}`;
	});
	let instantBuyFundingCheckInFlight = $state(false);
	let instantBuyFundingCheck = $state<{
		status: 'idle' | 'verifying' | 'ready' | 'error';
		errorCode?: string | null;
		message?: string | null;
		hint?: string | null;
		btcPrice?: number | null;
		totalRequiredUsd?: number | null;
		totalRequiredSats?: string | null;
	} | null>(null);

	const instantBuyRequiredUsdLabel = $derived.by(() => {
		// Calculate total payment the same way as ServiceInstantBuyModal: base + platform fee + $0.50
		const platformFee = totalAmountUsd * PLATFORM_FEE_RATE;
		const totalPayment = totalAmountUsd + platformFee + ESTIMATED_NETWORK_FEE_USD;
		if (totalPayment <= 0) {
			return '';
		}
		if (totalPayment < 0) {
			return `- $${formatNumberWithTwoDecimals(Math.abs(totalPayment))}`;
		}
		return `$${formatNumberWithTwoDecimals(totalPayment)}`;
	});

	let instantBuyDraft = $state<InstantBuyDraft | null>(null);
	let instantBuyPostSubmitErrorMessage = $state('');
	let bookNowSubmissionOwnerId = $state<string | null>(null);

	let lastInstantBuyDebugSignature = '';

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

		const _taskerLocation = service.locationDetails?.taskerLocation;
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
			providerWalletAddress: instantBuyService?.providerWalletAddress ?? null
		};
		const nextSignature = JSON.stringify(debugSnapshot);

		if (lastInstantBuyDebugSignature === nextSignature) {
			return;
		}

		lastInstantBuyDebugSignature = nextSignature;
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

	function hasValidServiceLocation(svc: Service): boolean {
		const taskeeLocation = svc.locationDetails?.taskeeLocation?.serviceLocation;
		const taskerLocation = svc.locationDetails?.taskerLocation?.serviceLocation;
		return (
			(taskeeLocation?.latitude != null && taskeeLocation?.longitude != null) ||
			(taskerLocation?.latitude != null && taskerLocation?.longitude != null)
		);
	}

	function getServiceLocationDisplay(svc: Service): {
		address: string;
		locationType: 'taskee' | 'tasker';
		radius?: number;
		latitude: number;
		longitude: number;
	} | null {
		const taskeeLocation = svc.locationDetails?.taskeeLocation;
		const taskerLocation = svc.locationDetails?.taskerLocation;

		if (
			taskeeLocation?.serviceLocation?.latitude != null &&
			taskeeLocation?.serviceLocation?.longitude != null
		) {
			const address =
				taskeeLocation.locationDisplayName ||
				taskeeLocation.serviceLocation.displayName ||
				taskeeLocation.serviceLocation.formattedAddress ||
				'';
			return {
				address,
				locationType: 'taskee',
				radius: taskeeLocation.serviceRadius,
				latitude: taskeeLocation.serviceLocation.latitude,
				longitude: taskeeLocation.serviceLocation.longitude
			};
		}

		if (
			taskerLocation?.serviceLocation?.latitude != null &&
			taskerLocation?.serviceLocation?.longitude != null
		) {
			const address =
				taskerLocation.locationDisplayName ||
				taskerLocation.serviceLocation.displayName ||
				taskerLocation.serviceLocation.formattedAddress ||
				'';
			return {
				address,
				locationType: 'tasker',
				radius: taskerLocation.serviceRadius,
				latitude: taskerLocation.serviceLocation.latitude,
				longitude: taskerLocation.serviceLocation.longitude
			};
		}

		return null;
	}

	function isVideoFile(url: string): boolean {
		return /\.(mp4|webm|ogg|mov|m3u8)$/i.test(url);
	}

	async function prepareGalleryImages(attachments: Attachment[]) {
		const seenUrls = new SvelteSet<string>();
		const imagePromises = attachments
			.filter((a) => a.url && !isVideoFile(a.url) && !a.cloudflareId)
			.filter((a) => {
				if (seenUrls.has(a.url)) return false;
				seenUrls.add(a.url);
				return true;
			})
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
			Pick<
				BookNowOutboxEntry,
				'instantOrderId' | 'amountRbtc' | 'transactionHash' | 'escrowId' | 'needsCleanup'
			>
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
			needsCleanup: overrides.needsCleanup ?? null,
			expectedLockOwnerId: resolvedExpectedLockOwnerId,
			lockOwnerId: state === 'submission_locked' ? resolvedExpectedLockOwnerId : undefined
		});
	}

	function resolveInstantBuyAmountUsd(runtimeService: ServiceRuntimeFields): number | null {
		if (!runtimeService.pricing) {
			return null;
		}

		const selectedAddOnsTotalAmount = selectedAddOns.reduce(
			(sum, addOn) => sum + (addOn.price ?? 0),
			0
		);
		const rushDeliveryPrice =
			requestRushDelivery && availableRushDelivery ? availableRushDelivery.price : 0;

		if (runtimeService.pricing.type === ServicePricingTypeEnum.FIXED) {
			return runtimeService.pricing.amount != null
				? runtimeService.pricing.amount + selectedAddOnsTotalAmount + rushDeliveryPrice
				: null;
		}

		if (runtimeService.pricing.type === ServicePricingTypeEnum.HOURLY) {
			return runtimeService.pricing.hourlyRate != null && runtimeService.pricing.hourlyRate > 0
				? hourlyBookingAmountUsd(runtimeService.pricing.hourlyRate, bookedHours) +
						selectedAddOnsTotalAmount +
						rushDeliveryPrice
				: null;
		}

		if (runtimeService.pricing.type !== ServicePricingTypeEnum.TIERED || !selectedTierId) {
			return null;
		}

		const tierPrice =
			runtimeService.pricing.tiers?.find((tier: ServiceTier) => tier.id === selectedTierId)
				?.price ?? null;
		return tierPrice != null ? tierPrice + selectedAddOnsTotalAmount + rushDeliveryPrice : null;
	}

	function resolveProviderDisplayName(runtimeService: ServiceRuntimeFields): string | null {
		const providerName = runtimeService.creator?.username?.trim();
		return providerName && providerName.length > 0 ? providerName : null;
	}

	async function buildInstantBuyAgreementSnapshot(
		runtimeService: ServiceRuntimeFields,
		purchaseKey: string
	): Promise<ServiceContractAgreementSnapshot> {
		const selectedTierDescription =
			runtimeService.pricing?.type === ServicePricingTypeEnum.TIERED && selectedTierId
				? (runtimeService.pricing.tiers?.find((tier: ServiceTier) => tier.id === selectedTierId)
						?.description ?? '')
				: '';
		const includedScope =
			selectedTierDescription.trim() || displayDescriptionFull || runtimeService.description;

		// For TASKER_LOCATION services, use the location provided by the Tasker (client) during booking
		// Otherwise, use the service's configured location (TASKEE_LOCATION or none)
		const serviceLocation =
			requiresTaskerLocationForBooking && bookNowTaskerLocation
				? buildTaskerProvidedLocationSnapshot(bookNowTaskerLocation)
				: buildServiceContractLocationSnapshot(runtimeService);

		return {
			selectedTierId: selectedTierId ?? undefined,
			selectedTierLabel: selectedTier?.name ?? undefined,
			serviceLocation,
			selectedAddOns:
				selectedAddOns.length > 0 ? selectedAddOns.map((addOn) => addOn.name) : undefined,
			deliverables: includedScope,
			priceSnapshotRef: purchaseKey,
			priceSnapshotLabel: `$${formatNumberWithTwoDecimals(resolveInstantBuyAmountUsd(runtimeService) ?? 0)}`,
			rushDelivery: requestRushDelivery,
			bookedHours:
				runtimeService.pricing?.type === ServicePricingTypeEnum.HOURLY
					? normalizeBookedHours(bookedHours)
					: undefined
		};
	}

	async function buildInstantBuyDraft(
		runtimeService: ServiceRuntimeFields,
		existingInstantOrderId?: string
	): Promise<InstantBuyDraft> {
		const snapshot = createInstantBuySnapshot({
			service: runtimeService,
			selectedTierId: selectedTierId ?? undefined,
			instantOrderId: existingInstantOrderId,
			requestRushDelivery
		});
		const amountUsd = resolveInstantBuyAmountUsd(runtimeService);

		if (amountUsd == null || !Number.isFinite(amountUsd) || amountUsd <= 0) {
			throw new Error($t('dashboard.services.detail.instant_buy.pricing_unavailable'));
		}

		const pricingSnapshot: ServiceContractPricingSnapshot = {
			serviceVersionRef: runtimeService.id,
			tierId: snapshot.selectedTierId,
			selectedAddOns: selectedAddOnIds.length > 0 ? [...selectedAddOnIds] : undefined,
			rushDelivery: requestRushDelivery
		};
		const agreementSnapshot = await buildInstantBuyAgreementSnapshot(
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
			goto(`/auth/login?returnTo=${encodeURIComponent(window.location.pathname)}`);
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
		instantBuyPostSubmitErrorMessage = '';
		instantBuyCreationState = { state: 'idle' };
		bookNowBuyerMessage = '';
	}

	function handleCloseInstantBuyDrawer() {
		if (showInstantBuyContractCreationProgress) {
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

		return `/hiring/contracts?context=services&highlight=${encodeURIComponent(escrowId)}`;
	}

	async function handleRefreshInstantBuy() {
		if (instantBuyDraft) {
			await refreshInstantBuyFundingCheck(instantBuyDraft);
		}
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
			instantBuyErrorMessage = extractContractError(error).userMessage;
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
				await walletManager.initialize({ prompt: 'funding' });
			} catch {
				// Preflight handles disconnected wallets and returns stable recovery copy.
			}

			try {
				await walletManager.loadAssets();
			} catch {
				// Balance display is best-effort; preflight still gates confirmation.
			}

			const btcPriceValue = btcPrice.price;
			const preflight = await preflightServiceContractCreation(
				{
					freelancerAddress: draft.providerAddress ?? '',
					freelancerPubkey: service?.npub ?? '',
					amountUsdt: draft.amountUsd.toFixed(2),
					estimatedStartTime: draft.snapshot.estimatedStartTime,
					estimatedCompletionTime: draft.snapshot.estimatedEndTime
				},
				btcPriceValue
			);

			if (!preflight.ok) {
				const isInsufficient = preflight.errorCode === 'insufficient_funds';
				let message: string;
				let hint: string | null;

				if (isInsufficient && draft.amountUsd) {
					const baseAmount = draft.amountUsd;
					const platformFee = baseAmount * PLATFORM_FEE_RATE;
					const totalPaymentUsd = baseAmount + platformFee + ESTIMATED_NETWORK_FEE_USD;
					const totalPaymentSats = Math.round((totalPaymentUsd * 100_000_000) / btcPriceValue);
					const walletBalanceSats = $totalBalances.sats;
					const shortfallSats = Math.max(0, totalPaymentSats - walletBalanceSats);
					const shortfallUsd = (shortfallSats / 100_000_000) * btcPriceValue;

					message = $t('dashboard.services.detail.book_now_drawer.insufficient_funds_message', {
						values: {
							sats: formatSats(shortfallSats),
							usd: `$${formatNumberWithTwoDecimals(shortfallUsd)}`
						}
					});
					hint = null;
				} else {
					const feedback = describeServiceContractPreflightFailure(
						preflight.errorCode,
						preflight.error
					);
					message = feedback.message;
					hint = feedback.hint;
				}

				instantBuyErrorMessage = message;
				instantBuyErrorHint = hint ?? '';
				instantBuyFundingCheck = {
					status: 'error',
					errorCode: preflight.errorCode,
					message,
					hint,
					btcPrice: btcPriceValue,
					totalRequiredUsd:
						isInsufficient && preflight.totalRequired
							? Number.parseFloat(preflight.totalRequired) * btcPriceValue
							: null,
					totalRequiredSats:
						isInsufficient && preflight.totalRequired
							? formatSats(Math.round(Number.parseFloat(preflight.totalRequired) * 100_000_000))
							: ''
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
				btcPrice: btcPriceValue,
				totalRequiredUsd: Number.parseFloat(preflight.totalRequired) * btcPriceValue,
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
			return false;
		}
		if (!$authState.isAuthenticated) {
			goto(`/auth/login?returnTo=${encodeURIComponent(window.location.pathname)}`);
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

	async function handleOpenInstantBuy() {
		if (isOwner) {
			appStore.showErrorToast(
				detailText(
					'dashboard.services.detail.self_buy_blocked',
					"You can't buy your own service listing."
				)
			);
			return;
		}

		if (!service) {
			return;
		}

		if (!canBeginInstantBuyReview()) {
			return;
		}

		instantBuyModalOpen = true;
		await prepareInstantBuyDraft(instantBuyDraft);
	}

	async function handleConfirmInstantBuy() {
		if (!instantBuyDraft || instantBuySubmitting || !service) {
			return;
		}

		instantBuySubmitting = true;
		instantBuyPostSubmitErrorMessage = '';

		try {
			const submissionLock = acquireBookNowSubmissionLock(
				getBookNowOutboxStorage(),
				buildBookNowFingerprint(instantBuyDraft),
				ensureBookNowSubmissionOwnerId()
			);
			if (!submissionLock.acquired) {
				throw new Error(
					detailText(
						'dashboard.services.detail.book_now.concurrent_submission_error',
						'Another Book Now order is currently being submitted in another tab. Please wait or check your Contracts.'
					)
				);
			}

			let entry = readBookNowOutboxEntryForDraft(instantBuyDraft);
			if (!entry) {
				entry = updateBookNowOutboxForDraft(instantBuyDraft, 'submission_locked');
			}

			if (entry.state === 'submission_locked') {
				const contractResult = await createServiceContract({
					freelancerPubkey: service.npub,
					freelancerAddress: instantBuyDraft.providerAddress ?? '',
					amountUsdt: instantBuyDraft.amountUsd.toFixed(2),
					serviceId: service.id,
					serviceAddress: instantBuyDraft.serviceAddress,
					serviceTitle: service.title ?? '',
					serviceDescription: service.description,
					contextVersionRef: instantBuyDraft.pricingSnapshot.serviceVersionRef,
					purchaseMode: 'instant_buy',
					instantOrderId: instantBuyDraft.snapshot.instantOrderId,
					selectedTierId: selectedTierId ?? undefined,
					pricingSnapshot: instantBuyDraft.pricingSnapshot,
					agreementSnapshot: {
						...instantBuyDraft.agreementSnapshot,
						buyerMessage: bookNowBuyerMessage.trim() || undefined
					},
					estimatedStartTime: instantBuyDraft.snapshot.estimatedStartTime,
					estimatedCompletionTime: instantBuyDraft.snapshot.estimatedEndTime
				});

				if (!contractResult.success) {
					throw new Error(contractResult.error);
				}

				entry = updateBookNowOutboxForDraft(instantBuyDraft, 'funding_submitted', {
					transactionHash: contractResult.transactionHash,
					amountRbtc: contractResult.amount
				});

				instantBuyCreationState = {
					state: 'pending',
					transactionHash: contractResult.transactionHash
				};

				void (async () => {
					try {
						await Promise.all([
							contractResult.afterBroadcast.then((report) => {
								if (report.failures.length) {
									console.warn(
										'[ServiceDetailsView] afterBroadcast partial failures',
										report.failures
									);
									appStore.showErrorToast(
										'Off-chain sync (Nostr/push) partially failed. Contract may take longer to propagate.'
									);
								}
							}),
							(async () => {
								const receipt = await contractResult.tx.wait();
								if (!receipt) throw new Error('No receipt');
								const { paymentId } = await contractResult.afterConfirmed(receipt);

								instantBuyCreationState = {
									state: 'confirmed',
									transactionHash: contractResult.transactionHash,
									paymentId: String(paymentId)
								};

								// State machine requires: funding_submitted → contract_sync_pending → contract_ready
								updateBookNowOutboxForDraft(instantBuyDraft, 'contract_sync_pending', {
									escrowId: String(paymentId)
								});
								updateBookNowOutboxForDraft(instantBuyDraft, 'contract_ready', {
									escrowId: String(paymentId)
								});

								clearBookNowOutboxForDraft(instantBuyDraft);

								appStore.showSuccessToast(
									detailText(
										'dashboard.services.detail.instant_buy.success',
										'Book Now order confirmed. Opening your service contract.'
									)
								);

								goto(buildContractsHighlightUrl(String(paymentId)));
							})()
						]);
					} catch (err) {
						console.error('[ServiceDetailsView] tx confirmation failed', err);
						instantBuyCreationState = {
							state: 'failed',
							transactionHash: contractResult.transactionHash,
							error: err instanceof Error ? err.message : 'Transaction confirmation failed'
						};
						clearBookNowOutboxForDraft(instantBuyDraft);
						appStore.showErrorToast(
							detailText(
								'dashboard.services.detail.instant_buy.error',
								'Unable to confirm instant buy right now.'
							)
						);
					}
				})();
			} else if (entry.state === 'funding_submitted' && entry.transactionHash) {
				instantBuyCreationState = { state: 'pending', transactionHash: entry.transactionHash };
			}
		} catch (error) {
			console.error('[ServiceDetailsView] Book Now confirmation failed', error);

			const isUserCancel =
				error instanceof Error &&
				(error.message.includes('User rejected') || error.message.includes('ACTION_REJECTED'));

			if (isUserCancel) {
				if (instantBuyDraft) {
					clearBookNowOutboxForDraft(instantBuyDraft);
				}
				instantBuySubmitting = false;
				appStore.showInfoToast('Transaction cancelled');
				return;
			}

			instantBuyPostSubmitErrorMessage = extractContractError(error).userMessage;

			if (instantBuyDraft) {
				clearBookNowOutboxForDraft(instantBuyDraft);
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
			rushDelivery: requestRushDelivery
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
				'dashboard.services.browse.quote_request_submitted',
				'Quote request sent successfully!'
			)
		);

		return { success: true };
	}

	let deleteCheckInFlight = $state(false);
	let deleteSubmitting = $state(false);
	let deleteModalState = $state<{
		mode: 'confirm' | 'blocked';
		openQuoteCount: number;
		activeContractCount: number;
	} | null>(null);

	async function inspectDeleteGuards() {
		if (!service) {
			throw new Error(
				detailText(
					'dashboard.services.detail.service_runtime_unavailable',
					'Service is unavailable.'
				)
			);
		}

		const quoteThreads = await queryTaskeeServiceQuoteThreads(service.id);

		let activeContractCount = 0;
		const pubkey = ndk.$currentPubkey;
		if (pubkey && service) {
			try {
				const events = await ndk.fetchEvents(
					{ kinds: [KINDS.CONTRACT], '#p': [pubkey], limit: 50 },
					{ closeOnEose: true }
				);
				const serviceKeys = new SvelteSet<string>();
				if (service.id) serviceKeys.add(service.id);
				if ((service as Record<string, unknown>).uniqueId)
					serviceKeys.add((service as Record<string, unknown>).uniqueId as string);

				for (const ev of events) {
					const cType = ev.tags.find((t: string[]) => t[0] === 'contextType')?.[1];
					if (cType !== 'service') continue;
					const sTag = ev.tags.find((t: string[]) => t[0] === 's')?.[1];
					if (sTag && ['2', '3', '5', '6', '7', '8'].includes(sTag)) continue;
					const cServiceId = ev.tags.find((t: string[]) => t[0] === 'serviceId')?.[1];
					if (cServiceId && serviceKeys.has(cServiceId)) {
						activeContractCount++;
						continue;
					}
					const cServiceAddr = ev.tags.find((t: string[]) => t[0] === 'serviceAddress')?.[1];
					if (cServiceAddr && serviceKeys.has(cServiceAddr)) {
						activeContractCount++;
					}
				}
			} catch {
				/* NDK query failed */
			}
		}

		return {
			...summarizeDeleteGuardForThreads(quoteThreads, activeContractCount),
			activeContractCount
		};
	}

	async function handleDeleteService() {
		if (!service || !isOwner) return;

		deleteCheckInFlight = true;
		try {
			const guard = await inspectDeleteGuards();

			if (guard.hasBlockingThreads) {
				deleteModalState = {
					mode: 'blocked',
					openQuoteCount: guard.blockingThreadCount,
					activeContractCount: guard.activeContractCount
				};
				return;
			}

			deleteModalState = {
				mode: 'confirm',
				openQuoteCount: guard.totalThreadCount,
				activeContractCount: guard.activeContractCount
			};
		} catch (error) {
			console.error('[ServiceDetailsView] Failed to inspect service delete guards', error);
			appStore.showErrorToast(
				detailText(
					'dashboard.services.detail.delete_guard_error',
					'Unable to verify if service can be safely deleted.'
				)
			);
		} finally {
			deleteCheckInFlight = false;
		}
	}

	async function confirmDeleteService() {
		if (!service || !isOwner || deleteSubmitting) return;

		deleteSubmitting = true;
		try {
			markServiceDeletePending(service.id);
			await deleteService(
				service.id,
				{
					hasOpenQuotes: deleteModalState!.openQuoteCount > 0,
					hasActiveContracts: deleteModalState!.activeContractCount > 0
				},
				{
					uniqueId: service.uniqueId ?? service.id
				}
			);

			if (service.portfolio && service.portfolio.length > 0) {
				try {
					await deleteServicePortfolioMedia(service.portfolio);
				} catch (err) {
					console.warn('[ServiceDetailsView] Portfolio media cleanup failed after delete', err);
				}
			}

			clearPendingServiceDelete(service.id);

			appStore.showSuccessToast(
				detailText(
					'dashboard.services.detail.delete_service_messages.success',
					'Service deleted successfully.'
				)
			);

			goto('/hiring?tab=my-services');
		} catch (error) {
			console.error('[ServiceDetailsView] Failed to delete service', error);
			clearPendingServiceDelete(service.id);
			appStore.showErrorToast(
				detailText(
					'dashboard.services.detail.delete_service_messages.delete_error',
					'Unable to delete service listing.'
				)
			);
		} finally {
			deleteSubmitting = false;
			deleteModalState = null;
		}
	}

	async function handleAddFunds(amountUsd: number) {
		if (!amountUsd || amountUsd <= 0) {
			return;
		}

		receiveInitialState = {
			amount: amountUsd.toFixed(2),
			unit: 'usd',
			mathExpression: '',
			chargeFeesToPayer: true,
			memo: detailText(
				'dashboard.services.detail.book_now.add_funds_memo',
				'Funding for service: {title}',
				{ title: displayTitle }
			)
		};
		isReceiveModalOpen = true;
	}

	// --- Carousel Logic ---
	let currentImageIndex = $state(0);
	let galleryImages = $state<
		{ url: string; alt: string; width: number; height: number; size?: number }[]
	>([]);
	let lightbox: PhotoSwipeLightbox | null = null;
	let isGalleryOpen = $state(false);
	let isUserInteracting = $state(false);
	let carouselInterval: ReturnType<typeof setInterval> | null = null;

	function startCarouselInterval() {
		if (carouselInterval) return;
		carouselInterval = setInterval(() => {
			if (!isGalleryOpen || isUserInteracting) return;
			nextImage();
		}, 5000);
	}

	function stopCarouselInterval() {
		if (carouselInterval) {
			clearInterval(carouselInterval);
			carouselInterval = null;
		}
	}

	onMount(async () => {
		if (service?.portfolio) {
			galleryImages = await prepareGalleryImages(service.portfolio);
			await tick();
		}

		lightbox = new PhotoSwipeLightbox({
			gallery: '#service-gallery',
			children: 'a',
			pswpModule: () => import('photoswipe')
		});
		lightbox.on('open', () => {
			isGalleryOpen = true;
			startCarouselInterval();
		});
		lightbox.on('close', () => {
			isGalleryOpen = false;
			stopCarouselInterval();
		});
		lightbox.init();

		// Handle quote request reentry if needed
		if (browser && service) {
			const reentry = parseServiceQuoteReentryState(page.url);
			if (reentry && reentry.serviceId === service.id) {
				clearServiceQuoteReentryState(page.url);
				handleOpenRequestQuote();
			}
		}

		// Handle Book Now recovery if needed
		// Note: Recovery is only attempted for entries in 'funding_submitted' or 'contract_sync_pending' state
		// The v2 pattern handles most recovery via afterConfirmed(), but we check for orphaned entries here
		if (browser && service && instantBuyDraft) {
			const fingerprint = buildBookNowFingerprint(instantBuyDraft);
			const recoverable = readRecoverableBookNowOutboxEntry(getBookNowOutboxStorage(), fingerprint);

			if (
				recoverable &&
				(recoverable.state === 'funding_submitted' ||
					recoverable.state === 'contract_sync_pending') &&
				recoverable.transactionHash
			) {
				// Attempt recovery for interrupted transactions
				void (async () => {
					try {
						const result = await recoverBookNowContract({
							transactionHash: recoverable.transactionHash!,
							freelancerPubkey: service.npub,
							amountRbtc: recoverable.amountRbtc ?? '',
							estimatedStartTime: instantBuyDraft?.snapshot?.estimatedStartTime ?? 0,
							estimatedCompletionTime: instantBuyDraft?.snapshot?.estimatedEndTime ?? 0,
							serviceId: service.id,
							serviceAddress: instantBuyDraft.serviceAddress,
							serviceTitle: service.title ?? '',
							contextVersionRef: instantBuyDraft.pricingSnapshot?.serviceVersionRef ?? '',
							instantOrderId: recoverable.instantOrderId ?? '',
							pricingSnapshot: instantBuyDraft.pricingSnapshot,
							agreementSnapshot: {
								...instantBuyDraft.agreementSnapshot,
								buyerMessage: bookNowBuyerMessage.trim() || undefined
							},
							escrowId: recoverable.escrowId
						});

						if (result.status === 'contract_ready' && result.escrowId) {
							clearBookNowOutboxForDraft(instantBuyDraft);
							goto(buildContractsHighlightUrl(result.escrowId));
						}
					} catch (err) {
						console.warn('[ServiceDetailsView] Recovery attempt failed:', err);
					}
				})();
			}
		}

		clearTerminalOrStaleBookNowOutboxEntries(getBookNowOutboxStorage());
	});

	onDestroy(() => {
		stopCarouselInterval();
		if (lightbox) {
			lightbox.destroy();
			lightbox = null;
		}
	});

	function nextImage() {
		if (carouselItems.length === 0) return;
		playingVideoKey = null;
		currentImageIndex = (currentImageIndex + 1) % carouselItems.length;
	}

	function prevImage() {
		if (carouselItems.length === 0) return;
		playingVideoKey = null;
		currentImageIndex = (currentImageIndex - 1 + carouselItems.length) % carouselItems.length;
	}
	// --- End Carousel Logic ---

	// --- Video Gallery Logic ---
	function buildVideoThumbnailUrl(cloudflareId: string): string {
		return `https://customer-${import.meta.env.VITE_STREAM_CUSTOMER_CODE}.cloudflarestream.com/${cloudflareId}/thumbnails/thumbnail.jpg`;
	}

	interface CarouselItem {
		url: string;
		width: number;
		height: number;
		isVideo: boolean;
		cloudflareId?: string;
		hlsUrl?: string;
		alt?: string;
		size?: number;
	}

	const carouselItems = $derived.by<CarouselItem[]>(() => {
		// Build a dimension lookup from the async-loaded gallery images (for PhotoSwipe)
		const dimMap = new Map(
			galleryImages.map((g) => [g.url, { width: g.width, height: g.height, alt: g.alt }])
		);
		const seen = new SvelteSet<string>();

		// Walk service.portfolio once in its stored order so the carousel
		// always respects the original upload sequence (video, photo, video, photo → same order).
		return (service?.portfolio ?? []).flatMap((a: Attachment): CarouselItem[] => {
			const isVideo = !!(
				a.cloudflareId ||
				(a.url && a.type?.startsWith('video/')) ||
				(a.url && isVideoFile(a.url))
			);

			if (isVideo) {
				const key = a.cloudflareId ?? a.url;
				if (!key || seen.has(key)) return [];
				seen.add(key);
				return [
					{
						url: a.cloudflareId ? buildVideoThumbnailUrl(a.cloudflareId) : a.url,
						width: 1200,
						height: 630,
						isVideo: true,
						cloudflareId: a.cloudflareId,
						hlsUrl: a.url || undefined,
						alt: a.alt
					}
				];
			} else {
				if (!a.url || seen.has(a.url)) return [];
				seen.add(a.url);
				const dims = dimMap.get(a.url);
				return [
					{
						url: a.url,
						width: dims?.width ?? 0,
						height: dims?.height ?? 0,
						isVideo: false,
						alt: dims?.alt ?? a.alt,
						size: a.size
					}
				];
			}
		});
	});
	// --- End Video Gallery Logic ---

	type ServiceRuntimeFields = Service & {
		instantBuyLeadHours?: number | null;
		instantBuyDeliveryHours?: number | null;
		providerWalletAddress?: string | null;
	};

	interface InstantBuyDraft {
		snapshot: InstantBuyCreateSnapshot;
		amountUsd: number;
		selectedTierLabel: string | null;
		providerName: string | null;
		providerAddress: string | null;
		serviceAddress: string;
		pricingSnapshot: ServiceContractPricingSnapshot;
		agreementSnapshot: ServiceContractAgreementSnapshot;
	}
</script>

<div class="bg-base-200 relative min-h-screen {isPreview ? 'pb-4' : 'pb-32'}">
	{#if isLoading}
		<div class="flex flex-col items-center justify-center p-12 text-center">
			<img
				src="/images/logos/bittasker-logomark.svg"
				alt="BitTasker"
				class="mx-auto h-16 w-16 opacity-20"
			/>
			<div class="mt-4">
				<div class="skeleton h-8 w-48"></div>
				<div class="skeleton mt-2 h-4 w-64"></div>
				<div class="skeleton mt-2 h-4 w-56"></div>
				<div class="skeleton mt-8 h-12 w-32"></div>
			</div>
		</div>
	{:else if !service}
		<div class="flex flex-col items-center justify-center p-12 text-center">
			<img
				src="/images/logos/bittasker-logomark.svg"
				alt="BitTasker"
				class="mx-auto h-16 w-16 opacity-20"
			/>
			<h2 class="mt-4 text-2xl font-bold">
				{detailText('dashboard.services.detail.not_found', 'Service Not Found')}
			</h2>
			<p class="text-base-content/60 mt-2">
				{detailText(
					'dashboard.services.detail.not_found_message',
					"The service you're looking for could not be found or is no longer available."
				)}
			</p>
			<a href="/services" class="btn btn-primary mt-8"
				>{detailText('dashboard.services.detail.back_to_services', 'Back to Services')}</a
			>
		</div>
	{:else}
		<!-- Hero Section / Media. No image: a short neutral bar, not a full-bleed black frame. -->
		{@const heroLayout = serviceHeroLayout(carouselItems.length)}
		<div
			class="group relative w-full overflow-hidden {heroLayout === 'media'
				? 'bg-neutral-950'
				: 'bg-base-200'}"
			data-testid="service-hero"
			data-hero-layout={heroLayout}
		>
			<div
				class="flex w-full items-center justify-center {heroLayout === 'media'
					? 'aspect-video max-h-[60vh]'
					: 'h-16'}"
			>
				{#if heroLayout === 'media'}
					<div class="relative h-full w-full" id="service-gallery">
						{#each carouselItems as item, i (item.url || i)}
							{#if item.isVideo}
								<div
									class="absolute inset-0 transition-opacity duration-500 {i === currentImageIndex
										? 'z-10 opacity-100'
										: 'z-0 opacity-0'}"
								>
									{#if playingVideoKey === (item.cloudflareId || item.hlsUrl || item.url)}
										<div class="relative h-full w-full bg-black">
											{#if item.cloudflareId}
												<StreamPlayer
													videoUid={item.cloudflareId}
													controls={true}
													autoplay={true}
													aspectRatio="video"
												/>
											{:else}
												<video
													src={item.hlsUrl || item.url}
													controls
													autoplay
													playsinline
													class="h-full w-full"
												>
													<track kind="captions" />
												</video>
											{/if}
											<button
												class="absolute top-2 right-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
												onclick={() => (playingVideoKey = null)}
												aria-label="Close video"
											>
												<IconClose class="h-5 w-5" />
											</button>
										</div>
									{:else}
										<button
											class="relative h-full w-full cursor-pointer"
											onclick={() =>
												(playingVideoKey = (item.cloudflareId || item.hlsUrl || item.url) ?? null)}
										>
											<img
												src={item.url}
												alt={item.alt || ''}
												class="h-full w-full object-cover"
												loading={i === 0 ? 'eager' : 'lazy'}
												decoding="async"
											/>
											<div class="absolute inset-0 flex items-center justify-center bg-black/30">
												<div
													class="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-lg"
												>
													<IconPlay class="h-7 w-7 text-black" />
												</div>
											</div>
										</button>
									{/if}
								</div>
							{:else}
								<a
									href={item.url}
									data-pswp-width={item.width || 1200}
									data-pswp-height={item.height || 630}
									class="absolute inset-0 transition-opacity duration-500 {i === currentImageIndex
										? 'z-10 opacity-100'
										: 'z-0 opacity-0'}"
								>
									<img
										src={item.url}
										alt={item.alt || ''}
										class="h-full w-full object-cover"
										loading={i === 0 ? 'eager' : 'lazy'}
										decoding="async"
									/>
								</a>
							{/if}
						{/each}

						{#if carouselItems.length > 1}
							<!-- Full-height arrow navigation -->
							<button
								class="absolute top-0 left-0 z-10 flex h-full w-12 items-center justify-center bg-black/30 text-white hover:bg-black/50"
								onclick={prevImage}
								aria-label="Previous image"
							>
								<IconChevronLeft class="h-8 w-8" />
							</button>
							<button
								class="absolute top-0 right-0 z-10 flex h-full w-12 items-center justify-center bg-black/30 text-white hover:bg-black/50"
								onclick={nextImage}
								aria-label="Next image"
							>
								<IconChevronRight class="h-8 w-8" />
							</button>
						{/if}
					</div>
				{:else}
					<img src="/images/logos/bittasker-logomark.svg" alt="" class="h-8 w-8 opacity-30" />
				{/if}
			</div>
		</div>

		<div
			class="relative z-10 container mx-auto px-4 pb-8 {heroLayout === 'media'
				? '-mt-4 md:-mt-12'
				: 'mt-4'}"
		>
			<div class="grid grid-cols-1 gap-8 lg:grid-cols-3">
				<div class="relative z-20 space-y-4 lg:col-span-2">
					<!-- Desktop Title, Description & Action Header -->
					<div
						class="bg-base-100 border-base-300 hidden rounded-2xl border p-6 shadow-sm md:p-8 lg:block"
					>
						<div class="flex flex-col gap-6 md:flex-row md:items-start">
							<div class="flex-1">
								<h1 class="mb-3 line-clamp-2 text-3xl leading-tight font-bold">
									{displayTitle}
									{#if isPreview}
										<span class="badge badge-secondary ml-2"
											>{$t('dashboard.services.create.review.preview_badge')}</span
										>
									{:else if isDraft}
										<span class="badge badge-warning ml-2"
											>{$t('dashboard.services.create.review.draft_badge')}</span
										>
									{/if}
								</h1>
								<div class="mb-3 flex items-center justify-between gap-1 text-sm font-bold">
									<div class="flex items-center gap-1">
										<div class="text-warning flex items-center">
											{#each Array(5) as _, i (i)}
												<IconStar
													class="h-4 w-4 {i < Math.round(effectiveCreator?.rating || 0)
														? 'text-warning'
														: 'text-base-content/20'}"
												/>
											{/each}
										</div>
										<span class="ml-1"
											>{effectiveCreator?.rating
												? effectiveCreator?.rating.toFixed(1)
												: '0.0'}</span
										>
										<span class="text-base-content/50 ml-1 font-medium"
											>({effectiveCreator?.ratingCount || 0})</span
										>
									</div>
									{#if !isPreview}
										<span class="flex shrink-0 items-center gap-1">
											<ServiceShareButton {service} variant="circle" class="btn-sm" />
											{#if $authState.isAuthenticated && service.npub}
												<ActionsMenu
													contentType="service"
													reportedPubkey={service.npub}
													reportedEventId={service.id}
													username={effectiveCreator?.username}
												/>
											{/if}
										</span>
									{/if}
								</div>
								<div class="text-base-content/70 mb-4 flex items-center gap-2 text-sm">
									<IconMapMarker class="text-primary h-8 w-8 shrink-0" />
									{#if getServiceLocationDisplay(service)}
										{@const headerLocation = getServiceLocationDisplay(service)}
										<a
											href="https://www.google.com/maps/search/?api=1&query={headerLocation!
												.latitude},{headerLocation!.longitude}"
											target="_blank"
											rel="noopener noreferrer"
											class="link link-primary">{headerLocation!.address}</a
										>
									{:else}
										<span>{$t('dashboard.services.detail.location.remote')}</span>
									{/if}
								</div>
								<div class="text-base-content/80 text-sm leading-relaxed whitespace-pre-line">
									{displayDescriptionFull}
								</div>

								{#if service.categories && service.categories.length > 0}
									<div class="mt-6 flex flex-wrap gap-2">
										{#each service.categories as category (category.slug || category.id || category)}
											<span class="badge badge-primary py-3 text-xs">
												{translateCategory(category)}
											</span>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					</div>

					<!-- Tier Comparison Cards (Desktop Only) -->
					{#if tiersWithPrice.length > 0}
						<div class="hidden space-y-6 lg:block">
							<div class="flex items-center justify-between">
								<h3 class="text-2xl font-bold">
									{detailText('dashboard.services.detail.compare_packages', 'Compare packages')}
								</h3>
							</div>

							<div
								class={tiersWithPrice.length >= 3
									? 'scrollbar-hide flex snap-x snap-mandatory gap-4 overflow-x-auto overflow-y-visible pt-4 pr-2 pb-6 pl-4'
									: 'grid grid-cols-1 gap-3 md:grid-cols-2'}
								onscroll={tiersWithPrice.length >= 3 ? updateTierScroll : undefined}
								style={tiersWithPrice.length >= 3 && tierScrolledRight
									? 'mask-image:linear-gradient(to right,black 0%,black 92%,transparent 100%);-webkit-mask-image:linear-gradient(to right,black 0%,black 92%,transparent 100%)'
									: ''}
							>
								{#each tiersWithPrice as tier (tier.id)}
									<div
										class="card bg-base-100 relative cursor-pointer border {tiersWithPrice.length >=
										3
											? 'md:w-[45%] md:shrink-0 md:snap-start'
											: ''} {selectedTierId === tier.id
											? 'border-primary ring-primary/20 shadow-md ring-2'
											: 'border-base-300 hover:border-primary/50 shadow-sm'} transition-all duration-200"
										onclick={() => (selectedTierId = tier.id)}
										onkeydown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') selectedTierId = tier.id;
										}}
										role="button"
										tabindex="0"
									>
										{#if tier.id === popularTierId}
											<div class="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
												<span
													class="badge badge-primary border-none px-4 py-3 text-[10px] font-black tracking-widest uppercase shadow-sm"
												>
													{detailText('dashboard.services.detail.popular', 'Popular')}
												</span>
											</div>
										{/if}
										<div class="card-body flex h-full flex-col p-6">
											<!-- Header -->
											<div class="mb-4">
												<h4
													class="mb-1 min-w-0 truncate text-xs font-black tracking-widest uppercase opacity-60"
												>
													{tier.name}
												</h4>
												<div class="text-primary text-3xl font-black">
													${formatNumberWithTwoDecimals(tier.price)}
												</div>
											</div>

											<!-- Description -->
											<div class="mb-6 flex-none">
												<div
													class="relative overflow-hidden transition-[max-height] duration-500 ease-in-out {tierExpanded[
														tier.id
													]
														? 'max-h-[1000px]'
														: 'max-h-[4.5rem]'}"
												>
													<p class="text-base-content/80 text-sm">
														{tier.description}
													</p>
													{#if !tierExpanded[tier.id] && tier.description && tier.description.length > 80}
														<div
															class="from-base-100 pointer-events-none absolute right-0 bottom-0 left-0 h-8 bg-gradient-to-t to-transparent"
														></div>
													{/if}
												</div>
												{#if tier.description && tier.description.length > 80}
													<button
														class="text-primary relative z-10 mt-2 text-[10px] font-black tracking-wider uppercase transition-opacity hover:opacity-80"
														onclick={(e) => {
															e.stopPropagation();
															toggleTierExpansion(tier.id);
														}}
													>
														{tierExpanded[tier.id]
															? detailText('dashboard.services.detail.see_less', 'Show less')
															: detailText('dashboard.services.detail.see_more', 'Show more')}
													</button>
												{/if}
											</div>

											<!-- Meta -->
											<div
												class="bg-base-200/50 mb-6 flex items-center gap-2 rounded-lg p-3 text-sm font-bold"
											>
												<IconTruckDeliveryOutline
													class="{requestRushDelivery &&
													availableRushDelivery &&
													tier.id === selectedTierId
														? 'text-primary'
														: 'text-base-content/60'} h-5 w-5 shrink-0"
												/>
												{#if requestRushDelivery && availableRushDelivery && tier.id === selectedTierId}
													<span class="text-primary"
														>{formatDeliveryTime(availableRushDelivery.deliveryTime)}</span
													>
												{:else}
													<span>{formatDeliveryTime(tier.deliveryTime)}</span>
												{/if}
											</div>

											<!-- Features -->
											<div class="flex-1">
												{#if tier.features && tier.features.length > 0}
													<h5
														class="mb-3 text-[10px] font-bold tracking-widest uppercase opacity-50"
													>
														{detailText('dashboard.services.detail.included_label', 'Included')}
													</h5>
												{/if}
												<ul class="space-y-3">
													{#each tier.features as feature (feature)}
														<li class="flex items-start gap-3 text-sm">
															<IconCheck class="text-success h-5 w-5 shrink-0" />
															<span class="text-base-content/90 leading-snug font-medium"
																>{feature}</span
															>
														</li>
													{/each}
												</ul>
											</div>

											<!-- Footer Selection Button -->
											<div class="mt-8">
												<button
													class="btn btn-block {selectedTierId === tier.id
														? 'btn-primary shadow-primary/20 shadow-lg'
														: 'btn-outline border-base-300'} transition-all"
													onclick={() => (selectedTierId = tier.id)}
												>
													{selectedTierId === tier.id ? $t('common.selected') : $t('common.select')}
												</button>
											</div>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Desktop Service Location Map -->
					{#if hasValidServiceLocation(service)}
						{@const locationDisplay = getServiceLocationDisplay(service)}
						{#if locationDisplay}
							<div
								class="bg-base-100 border-base-300 hidden rounded-2xl border p-6 shadow-sm lg:block"
							>
								<h3 class="mb-4 text-lg font-bold">
									{detailText('dashboard.services.detail.service_location', 'Location')}
								</h3>
								<div class="mb-3 overflow-hidden rounded-lg">
									<TaskLocationMap
										services={[service]}
										height="250px"
										zoomOffset={3}
										showMyLocationButton={false}
									/>
								</div>
								<p class="text-base-content/70 text-sm">
									📍 <a
										href="https://www.google.com/maps/search/?api=1&query={locationDisplay.latitude},{locationDisplay.longitude}"
										target="_blank"
										rel="noopener noreferrer"
										class="link link-primary">{locationDisplay.address}</a
									>
								</p>
								<p class="text-base-content/60 mt-1 text-sm">
									{#if locationDisplay.locationType === 'taskee'}
										🏠 {$t('dashboard.services.detail.seo.at_taskee_location')}
									{:else}
										🏠 {$t('dashboard.services.detail.seo.at_my_location')}
										{#if locationDisplay.radius}• {locationDisplay.radius} km{/if}
									{/if}
								</p>
							</div>
						{/if}
					{/if}

					<!-- Relocated Title, Description & Provider (Mobile) -->
					<div
						class="bg-base-100 border-base-200 relative z-10 -mt-12 space-y-6 rounded-t-[2rem] rounded-b-2xl border p-6 shadow-xl lg:hidden"
					>
						<div>
							<h3 class="mb-3 line-clamp-2 text-xl font-bold">{displayTitle}</h3>
							<div class="mb-4 flex items-center justify-between">
								<div class="flex items-center gap-1 text-sm font-bold">
									<div class="text-warning flex items-center">
										{#each Array(5) as _, i (i)}
											<IconStar
												class="h-4 w-4 {i < Math.round(effectiveCreator?.rating || 0)
													? 'text-warning'
													: 'text-base-content/20'}"
											/>
										{/each}
									</div>
									<span class="ml-1"
										>{effectiveCreator?.rating ? effectiveCreator?.rating.toFixed(1) : '0.0'}</span
									>
									<span class="text-base-content/50 ml-1 font-medium"
										>({effectiveCreator?.ratingCount || 0})</span
									>
								</div>
								{#if !isPreview}
									<span class="flex shrink-0 items-center gap-1">
										<ServiceShareButton {service} variant="circle" class="btn-sm" />
										{#if $authState.isAuthenticated && service.npub}
											<ActionsMenu
												contentType="service"
												reportedPubkey={service.npub}
												reportedEventId={service.id}
												username={effectiveCreator?.username}
											/>
										{/if}
									</span>
								{/if}
							</div>
							<div class="text-base-content/70 mb-4 flex items-center gap-2 text-sm">
								<IconMapMarker class="text-primary h-8 w-8 shrink-0" />
								{#if getServiceLocationDisplay(service)}
									{@const headerLocation = getServiceLocationDisplay(service)}
									<a
										href="https://www.google.com/maps/search/?api=1&query={headerLocation!
											.latitude},{headerLocation!.longitude}"
										target="_blank"
										rel="noopener noreferrer"
										class="link link-primary">{headerLocation!.address}</a
									>
								{:else}
									<span>{$t('dashboard.services.detail.location.remote')}</span>
								{/if}
							</div>
							<div class="text-base-content/80 text-sm leading-relaxed whitespace-pre-line">
								{displayDescriptionFull}
							</div>

							<div class="mt-6">
								<UserInfoDisplay
									avatar={effectiveCreator?.avatar}
									username={effectiveCreator?.username}
									rating={effectiveCreator?.rating}
									pubkey={isDraft && previewCreator ? previewCreator.pubkey : service.npub}
									size="md"
								/>
							</div>

							<div class="border-base-200 my-4 border-t"></div>

							{#if service.categories && service.categories.length > 0}
								<div class="flex flex-wrap gap-2">
									{#each service.categories as category (category.slug || category.id || category)}
										<span class="badge badge-primary py-3 text-xs">
											{translateCategory(category)}
										</span>
									{/each}
								</div>
							{/if}
						</div>

						{#if isOwner && !isPreview}
							<div class="alert alert-info alert-outline">
								<span class="text-sm">{$t('dashboard.services.detail.you_are_provider')}</span>
							</div>
							<div class="flex gap-2">
								<button
									type="button"
									class="btn btn-error btn-outline flex-1"
									onclick={handleDeleteService}
									disabled={deleteCheckInFlight || deleteSubmitting}
								>
									{#if deleteCheckInFlight || deleteSubmitting}
										<span class="loading loading-spinner loading-xs"></span>
									{/if}
									{detailText('dashboard.services.detail.delete_service', 'Delete')}
								</button>
								<a
									href="/create-service?edit=true&serviceId={service.uniqueId || service.id}"
									class="btn btn-primary flex-1"
								>
									{detailText('dashboard.services.detail.edit_service', 'Edit')}
								</a>
							</div>
						{/if}
					</div>

					<!-- Mobile Tier Selector (Mobile Only) -->
					{#if tiersWithPrice.length > 0}
						<div
							class="bg-base-100 border-base-300 overflow-hidden rounded-2xl border shadow-sm lg:hidden"
						>
							<div class="tabs tabs-bordered bg-base-100 border-base-200 flex border-b p-1">
								{#each tiersWithPrice as tier (tier.id)}
									<button
										class="tab relative flex h-14 flex-1 flex-col justify-end transition-all duration-200 {activeMobileTab ===
										tier.id
											? 'tab-active text-primary font-bold'
											: 'text-base-content/60'}"
										onclick={() => handleTabChange(tier.id)}
									>
										<div class="flex flex-col items-center gap-0.5 pb-1">
											{#if tier.id === popularTierId}
												<span
													class="text-primary/70 -mt-1 text-[10px] font-black tracking-widest uppercase"
													>{detailText('dashboard.services.detail.popular', 'Popular')}</span
												>
											{/if}
											<span
												class="truncate text-[10px] leading-none tracking-tighter uppercase opacity-70"
												>{tier.name}</span
											>
											<span class="text-sm leading-none font-bold"
												>${formatNumberWithTwoDecimals(tier.price)}</span
											>
										</div>
									</button>
								{/each}
							</div>

							{#if selectedTier}
								<div class="space-y-6 p-6">
									<div class="grid grid-cols-[1fr_auto] items-start gap-4">
										<h3 class="line-clamp-2 text-lg font-bold break-words">{selectedTier.name}</h3>
										<span class="text-primary ml-4 shrink-0 text-xl font-black"
											>${formatNumberWithTwoDecimals(selectedTier.price)}</span
										>
									</div>
									<div class="relative">
										<div
											class="relative overflow-hidden transition-[max-height] duration-500 ease-in-out {tierExpanded[
												selectedTier.id
											]
												? 'max-h-[1000px]'
												: 'max-h-[4.5rem]'}"
										>
											<p class="text-base-content/70 text-sm">
												{selectedTier.description}
											</p>
											{#if !tierExpanded[selectedTier.id] && selectedTier.description && selectedTier.description.length > 80}
												<div
													class="from-base-100 pointer-events-none absolute right-0 bottom-0 left-0 h-8 bg-gradient-to-t to-transparent"
												></div>
											{/if}
										</div>
										{#if selectedTier.description && selectedTier.description.length > 80}
											<button
												class="text-primary relative z-10 mt-2 text-[10px] font-black tracking-wider uppercase transition-opacity hover:opacity-80"
												onclick={() => toggleTierExpansion(selectedTier.id)}
											>
												{tierExpanded[selectedTier.id]
													? detailText('dashboard.services.detail.see_less', 'Show less')
													: detailText('dashboard.services.detail.see_more', 'Show more')}
											</button>
										{/if}
									</div>

									<div class="flex items-center gap-2 text-sm">
										<IconTruckDeliveryOutline
											class="{requestRushDelivery && availableRushDelivery
												? 'text-primary'
												: 'text-base-content/60'} h-4 w-4"
										/>
										<span class="font-bold"
											>{requestRushDelivery && availableRushDelivery
												? formatDeliveryTime(availableRushDelivery.deliveryTime)
												: formatDeliveryTime(selectedTier.deliveryTime)}</span
										>
									</div>

									{#if selectedTier.features && selectedTier.features.length > 0}
										<div class="border-base-200 border-t pt-4">
											<h5 class="mb-3 text-[10px] font-bold tracking-widest uppercase opacity-50">
												{detailText('dashboard.services.detail.included_label', 'Included')}
											</h5>
											<ul class="space-y-3">
												{#each selectedTier.features as feature (feature)}
													<li class="flex items-start gap-3 text-sm">
														<IconCheck class="text-success mt-0.5 h-4 w-4 shrink-0" />
														<span class="text-base-content/80 leading-snug font-medium"
															>{feature}</span
														>
													</li>
												{/each}
											</ul>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/if}

					<!-- Mobile Service Location Map -->
					{#if hasValidServiceLocation(service)}
						{@const locationDisplay = getServiceLocationDisplay(service)}
						{#if locationDisplay}
							<div class="bg-base-100 border-base-300 rounded-2xl border p-6 shadow-sm lg:hidden">
								<h3 class="mb-4 text-lg font-bold">
									{detailText('dashboard.services.detail.service_location', 'Location')}
								</h3>
								<div class="mb-3 overflow-hidden rounded-lg">
									<TaskLocationMap
										services={[service]}
										height="200px"
										zoomOffset={3}
										showMyLocationButton={false}
									/>
								</div>
								<p class="text-base-content/70 text-sm">
									📍 <a
										href="https://www.google.com/maps/search/?api=1&query={locationDisplay.latitude},{locationDisplay.longitude}"
										target="_blank"
										rel="noopener noreferrer"
										class="link link-primary">{locationDisplay.address}</a
									>
								</p>
								<p class="text-base-content/60 mt-1 text-sm">
									{#if locationDisplay.locationType === 'taskee'}
										🏠 {$t('dashboard.services.detail.seo.at_taskee_location')}
									{:else}
										🏠 {$t('dashboard.services.detail.seo.at_my_location')}
										{#if locationDisplay.radius}• {locationDisplay.radius} km{/if}
									{/if}
								</p>
							</div>
						{/if}
					{/if}

					<!-- Mobile Add-ons & Total Section -->
					{#if (!isOwner || isPreview) && (service.status === 'active' || isPreview) && (displayAddOns.length > 0 || availableRushDelivery)}
						<div
							class="bg-base-100 border-base-300 space-y-4 rounded-2xl border p-6 shadow-sm lg:hidden"
						>
							<h3 class="text-lg font-bold">
								{detailText('dashboard.services.detail.customize_order', 'Customize Your Order')}
							</h3>

							<div class="border-base-200 space-y-3 border-t pt-4">
								{#if displayAddOns.length > 0 || availableRushDelivery}
									<ServiceAddOnsSelector
										addOns={displayAddOns}
										basePrice={basePriceForAddOns}
										bind:selectedAddOnIds
										bind:requestRushDelivery
										rushDelivery={availableRushDelivery}
										disabled={service?.pricing?.type === ServicePricingTypeEnum.TIERED &&
											!selectedTierId}
									/>
								{/if}
							</div>

							<div class="border-base-200 border-t pt-4">
								<div class="flex items-center justify-between">
									<span class="text-base-content/70 text-sm font-medium"
										>{detailText('dashboard.services.detail.total_amount_label', 'Total')}</span
									>
									<span class="text-primary text-2xl font-black"
										>${formatNumberWithTwoDecimals(totalAmountUsd)}</span
									>
								</div>
							</div>
							<div class="pt-4">
								{#if !isPreview}
									{#if showInstantBuyCta}
										<div class="flex gap-2">
											<button
												class="btn btn-outline flex-1"
												onclick={handleOpenRequestQuote}
												disabled={isOffline || isOwner}
												title={isOffline ? 'You are offline' : ''}
												>{detailText('dashboard.services.detail.request_quote', 'Inquire')}</button
											>
											<button
												data-testid="service-detail-buy-now"
												class="btn btn-primary shadow-primary/20 flex-1 shadow-lg"
												onclick={handleOpenInstantBuy}
												disabled={instantBuyPreparing || isOffline || isOwner}
												title={isOffline ? 'You are offline' : ''}
												>{#if instantBuyPreparing}
													<span class="loading loading-spinner loading-xs"></span>
												{:else if instantBuyFundingCheckInFlight}
													<span class="text-base-content/60 text-xs"
														>{$t(
															'dashboard.services.detail.book_now_drawer.verifying_wallet'
														)}</span
													>
												{:else}
													{instantBuyEligibility.code === 'missing_selected_tier'
														? detailText(
																'dashboard.services.detail.select_package',
																'Select Package'
															)
														: detailText('dashboard.services.detail.book_now', 'Book Now')}
												{/if}</button
											>
										</div>
									{:else}
										<button
											class="btn btn-primary w-full"
											onclick={handleOpenRequestQuote}
											disabled={isOffline || isOwner}
											title={isOffline ? 'You are offline' : ''}
											>{detailText('dashboard.services.detail.request_quote', 'Inquire')}</button
										>
									{/if}
									{#if instantBuyErrorMessage}
										<div class="alert alert-error mt-2">
											<span>{instantBuyErrorMessage}</span>
											<button
												class="btn btn-sm"
												onclick={() => prepareInstantBuyDraft(instantBuyDraft)}
												>{$t('common.buttons.retry')}</button
											>
										</div>
									{/if}
								{/if}
							</div>
						</div>
					{/if}

					<!-- FAQs -->
					{#if displayFaqs.length > 0}
						<div
							class="card bg-base-100 border-base-300 overflow-hidden rounded-2xl border shadow-sm"
						>
							<div class="p-6 pb-0">
								<h2 class="text-xl font-bold">{$t('dashboard.services.detail.faqs')}</h2>
							</div>
							<div class="p-6 pt-4">
								<div class="join join-vertical w-full">
									{#each displayFaqs as faq (faq.id || faq.question)}
										<div
											class="collapse-arrow join-item border-base-200 collapse border-b last:border-b-0"
										>
											<input type="radio" name="my-accordion-4" checked />
											<div class="collapse-title text-base font-bold">
												{faq.question}
											</div>
											<div class="collapse-content text-base-content/70">
												<p>{faq.answer}</p>
											</div>
										</div>
									{/each}
								</div>
							</div>
						</div>
					{/if}
				</div>

				<!-- Sidebar (Desktop Only) -->
				<div class="hidden space-y-6 lg:block">
					<!-- Purchase Card (Sidebar) -->
					<div
						class="bg-base-100 border-base-300 sticky top-24 space-y-6 rounded-2xl border p-6 shadow-sm"
					>
						{#if isOwner && !isPreview}
							<div class="alert alert-info alert-outline">
								<span class="text-sm">{$t('dashboard.services.detail.you_are_provider')}</span>
							</div>
							<div class="flex gap-2">
								<button
									type="button"
									class="btn btn-error btn-outline flex-1"
									onclick={handleDeleteService}
									disabled={deleteCheckInFlight || deleteSubmitting}
									>{#if deleteCheckInFlight || deleteSubmitting}<span
											class="loading loading-spinner loading-xs"
										></span>{/if}{detailText(
										'dashboard.services.detail.delete_service',
										'Delete'
									)}</button
								>
								<a
									href="/create-service?edit=true&serviceId={service.uniqueId || service.id}"
									class="btn btn-primary flex-1"
								>
									{$t('dashboard.services.detail.edit_service')}
								</a>
							</div>
						{/if}

						{#if service.status === 'active' || isPreview}
							<div class="space-y-4">
								<h3 class="text-lg font-bold">
									{#if service.pricing?.type === ServicePricingTypeEnum.TIERED}
										{selectedTier?.name || $t('dashboard.services.detail.select_tier')}
									{:else if !isPreview}
										{$t('dashboard.services.detail.interested')}
									{/if}
								</h3>

								{#if service.pricing?.type === ServicePricingTypeEnum.TIERED && selectedTier}
									<div class="text-primary text-3xl font-black">
										${formatNumberWithTwoDecimals(selectedTier.price)}
									</div>
									<p class="text-base-content/70 line-clamp-3 text-sm">
										{selectedTier.description}
									</p>
									<div class="space-y-2 py-2">
										<div class="flex items-center gap-2 text-sm">
											<IconTruckDeliveryOutline
												class="{requestRushDelivery && availableRushDelivery
													? 'text-primary'
													: 'text-base-content/60'} h-4 w-4"
											/>
											<span
												class="{requestRushDelivery && availableRushDelivery
													? 'text-primary'
													: 'text-base-content/70'} font-bold"
												>{requestRushDelivery && availableRushDelivery
													? formatDeliveryTime(availableRushDelivery.deliveryTime)
													: formatDeliveryTime(selectedTier.deliveryTime)}</span
											>
										</div>
									</div>
								{:else if service.pricing?.type === ServicePricingTypeEnum.FIXED}
									<div class="text-primary text-3xl font-black">
										${formatNumberWithTwoDecimals(service.pricing.amount ?? 0)}
									</div>
									{#if deliveryTimeDisplay}
										<div class="mt-2 flex items-center gap-2 text-sm">
											<IconTruckDeliveryOutline class="text-primary h-4 w-4" />
											<span class="font-bold">{deliveryTimeDisplay}</span>
										</div>
									{/if}
								{:else if service.pricing?.type === ServicePricingTypeEnum.HOURLY}
									<div class="text-primary text-3xl font-black">
										${formatNumberWithTwoDecimals(service.pricing.hourlyRate ?? 0)}
										<span class="text-sm font-bold opacity-60"
											>{detailText('dashboard.services.detail.per_hour', '/ hr')}</span
										>
									</div>
									{#if !isOwner}
										<label class="mt-3 block space-y-1" for="service-booked-hours">
											<span class="text-sm font-medium"
												>{detailText('dashboard.services.detail.hours_label', 'Hours')}</span
											>
											<input
												id="service-booked-hours"
												type="number"
												min="1"
												max="1000"
												step="1"
												class="input input-bordered w-full"
												data-testid="service-booked-hours"
												value={bookedHours}
												disabled={instantBuyModalOpen || instantBuySubmitting}
												oninput={setBookedHoursFromInput}
												onblur={commitBookedHours}
											/>
											<span class="text-base-content/60 text-xs"
												>{detailText(
													'dashboard.services.detail.hours_hint',
													'How many hours to book at this rate.'
												)}</span
											>
										</label>
									{/if}
								{/if}
							</div>
						{:else if !isOwner}
							<div class="alert alert-warning alert-outline">
								<span>{$t('dashboard.services.detail.service_not_available')}</span>
							</div>
						{/if}

						<!-- Sidebar Customize Section (Desktop) -->
						{#if availableRushDelivery || showAddOnsSelector}
							<div class="border-base-200 space-y-4 border-t pt-4">
								<h4 class="font-bold">
									{detailText('dashboard.services.detail.customize_order', 'Customize Your Order')}
								</h4>

								{#if showAddOnsSelector || availableRushDelivery}
									<ServiceAddOnsSelector
										addOns={displayAddOns}
										basePrice={basePriceForAddOns}
										bind:selectedAddOnIds
										bind:requestRushDelivery
										rushDelivery={availableRushDelivery}
										disabled={service?.pricing?.type === ServicePricingTypeEnum.TIERED &&
											!selectedTierId}
									/>
								{/if}
							</div>
						{/if}

						<!-- Total with Add-ons and Rush Delivery -->
						<div class="border-base-200 border-t pt-4">
							<div class="flex items-center justify-between">
								<span class="text-base-content/70 text-sm font-medium"
									>{detailText('dashboard.services.detail.total_amount_label', 'Total')}</span
								>
								<span class="text-primary text-2xl font-black"
									>${formatNumberWithTwoDecimals(totalAmountUsd)}</span
								>
							</div>
						</div>

						<!-- Buttons above User Info -->
						<div class="border-base-200 border-t pt-4">
							{#if isOffline && !isPreview}
								<div class="alert alert-warning alert-outline mb-4 text-xs">
									<span>{$t('dashboard.services.detail.public_cta.offline_notice')}</span>
								</div>
							{/if}

							{#if !isPreview}
								<div class="flex gap-2">
									{#if showInstantBuyCta}
										<button
											class="btn btn-outline flex-1"
											onclick={handleOpenRequestQuote}
											disabled={isOffline || isOwner}
											title={isOffline ? 'You are offline' : ''}
											>{detailText('dashboard.services.detail.request_quote', 'Inquire')}</button
										>
										<button
											data-testid="service-detail-buy-now"
											class="btn btn-primary shadow-primary/20 flex-1 shadow-lg"
											onclick={handleOpenInstantBuy}
											disabled={instantBuyPreparing || isOffline || isOwner}
											title={isOffline ? 'You are offline' : ''}
											>{#if instantBuyPreparing}
												<span class="loading loading-spinner loading-xs"></span>
											{:else if instantBuyFundingCheckInFlight}
												<span class="text-base-content/60 text-xs"
													>{$t('dashboard.services.detail.book_now_drawer.verifying_wallet')}</span
												>
											{:else}
												{instantBuyEligibility.code === 'missing_selected_tier'
													? detailText('dashboard.services.detail.select_package', 'Select Package')
													: detailText('dashboard.services.detail.book_now', 'Book Now')}
											{/if}</button
										>
									{:else}
										<button
											class="btn btn-primary w-full"
											onclick={handleOpenRequestQuote}
											disabled={isOffline || isOwner}
											title={isOffline ? 'You are offline' : ''}
											>{detailText('dashboard.services.detail.request_quote', 'Inquire')}</button
										>
									{/if}
								</div>
								{#if instantBuyErrorMessage}
									<div class="alert alert-error mt-2">
										<span>{instantBuyErrorMessage}</span>
										<button
											class="btn btn-sm"
											onclick={() => prepareInstantBuyDraft(instantBuyDraft)}
											>{$t('common.buttons.retry')}</button
										>
									</div>
								{/if}
							{/if}
						</div>

						<!-- Provider Info (Bottom of sidebar card) -->
						<div class="border-base-200 border-t pt-6">
							<UserInfoDisplay
								avatar={effectiveCreator?.avatar}
								username={effectiveCreator?.username}
								rating={effectiveCreator?.rating}
								pubkey={isDraft && previewCreator ? previewCreator.pubkey : service.npub}
								size="md"
							/>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Mobile Fixed Bottom CTA (Single Row Cart) -->
		{#if !isPreview && !isDraft && !isOwner && service.status === 'active'}
			{@const displayDeliveryTime =
				requestRushDelivery && availableRushDelivery
					? formatDeliveryTime(availableRushDelivery.deliveryTime)
					: formatDeliveryTime(
							selectedTier?.deliveryTime ?? service?.pricing?.deliveryTime ?? null
						)}
			<div
				class="bg-base-100 border-base-200 fixed right-0 left-0 z-50 border-t shadow-[0_-8px_30px_rgba(0,0,0,0.15)] lg:hidden"
				style="bottom: var(--app-dock-height, 64px);"
			>
				<div class="flex items-center justify-between gap-4 p-4">
					<div class="flex min-w-0 items-center gap-4">
						{#if service.pricing?.type === ServicePricingTypeEnum.HOURLY}
							<label class="flex flex-col" for="service-booked-hours-mobile">
								<span class="text-base-content/60 text-[10px] font-bold tracking-wider uppercase"
									>{detailText('dashboard.services.detail.hours_label', 'Hours')}</span
								>
								<input
									id="service-booked-hours-mobile"
									type="number"
									min="1"
									max="1000"
									step="1"
									class="input input-bordered input-sm w-16"
									data-testid="service-booked-hours-mobile"
									value={bookedHours}
									disabled={instantBuyModalOpen || instantBuySubmitting}
									oninput={setBookedHoursFromInput}
									onblur={commitBookedHours}
								/>
							</label>
						{/if}
						<div class="flex flex-col">
							<span class="text-base-content/60 text-[10px] font-bold tracking-wider uppercase"
								>{detailText('dashboard.services.detail.total_price', 'Total')}</span
							>
							<span class="text-primary text-xl leading-none font-black"
								>${formatNumberWithTwoDecimals(totalAmountUsd)}</span
							>
						</div>
						{#if displayDeliveryTime !== '—'}
							<div class="border-base-200 flex items-center gap-2 border-l pl-4">
								{#if requestRushDelivery && availableRushDelivery}
									<IconTruckDeliveryOutline class="text-primary h-6 w-6" />
								{:else}
									<IconTruckDeliveryOutline class="text-base-content/50 h-6 w-6" />
								{/if}
								<div class="flex flex-col">
									<span class="text-base-content/70 text-sm leading-none font-medium"
										>{displayDeliveryTime}</span
									>
									{#if requestRushDelivery && availableRushDelivery}
										<span class="text-primary text-xs font-bold tracking-widest uppercase"
											>{detailText(
												'dashboard.services.detail.rush_delivery_tag',
												'Rush Delivery'
											)}</span
										>
									{/if}
								</div>
							</div>
						{/if}
					</div>

					<div class="flex-none">
						{#if !isPreview && showInstantBuyCta}
							<button
								class="btn btn-primary btn-sm shadow-primary/20 disabled:bg-base-300 disabled:text-base-content/30 disabled:border-base-300 font-black shadow-lg"
								onclick={handleOpenInstantBuy}
								disabled={instantBuyPreparing || isOffline}
							>
								{#if instantBuyPreparing}
									<span class="loading loading-spinner loading-xs"></span>
								{:else if instantBuyEligibility.code === 'missing_selected_tier'}
									{detailText('dashboard.services.detail.select_package', 'Select')}
								{:else}
									{detailText('dashboard.services.detail.book_now', 'Book')}
								{/if}
							</button>
						{:else if !isPreview}
							<button
								class="btn btn-primary btn-sm shadow-primary/20 disabled:bg-base-300 disabled:text-base-content/30 disabled:border-base-300 font-black shadow-lg"
								onclick={handleOpenRequestQuote}
								disabled={isOffline || isOwner}
							>
								{detailText('dashboard.services.detail.request_quote', 'Inquire')}
							</button>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	{/if}

	<RequestQuoteModal
		bind:open={requestQuoteModalOpen}
		{service}
		contextSummary={requestQuoteContextSummary}
		requiresTaskerLocation={requiresTaskerLocationForBooking}
		taskeeServiceRadius={taskeeServiceConfig?.serviceRadius ?? null}
		taskeeBaseLocation={taskeeServiceConfig?.baseLocation ?? null}
		onConfirm={handleQuoteRequestConfirm}
		onClose={() => (requestQuoteModalOpen = false)}
	/>

	<ServiceInstantBuyModal
		open={instantBuyModalOpen}
		serviceTitle={displayTitle}
		providerName={instantBuyDraft?.providerName ?? effectiveCreator?.username ?? null}
		providerAvatar={effectiveCreator?.avatar ?? null}
		providerRating={effectiveCreator?.rating ?? null}
		providerPubkey={service?.npub ?? null}
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
		requiredBalanceSats={totalPaymentSats}
		requiredBalanceUsd={instantBuyRequiredUsdLabel}
		walletVerificationStatus={instantBuyFundingCheckInFlight
			? 'verifying'
			: (instantBuyFundingCheck?.status ?? 'idle')}
		walletVerificationMessage={instantBuyFundingCheckInFlight
			? $t('dashboard.services.detail.book_now_drawer.verifying_wallet')
			: (instantBuyFundingCheck?.message ?? '')}
		walletVerificationErrorCode={instantBuyFundingCheck?.errorCode ?? null}
		isPreparing={instantBuyPreparing}
		isSubmitting={instantBuySubmitting}
		{isOffline}
		{showReconnectNotice}
		errorMessage={instantBuyPostSubmitErrorMessage || instantBuyErrorMessage}
		bind:buyerMessage={bookNowBuyerMessage}
		errorHint={instantBuyErrorHint}
		showContractCreationProgress={showInstantBuyContractCreationProgress}
		contractCreationStatus={instantBuyContractCreationStatus}
		contractCreationMessage={instantBuyContractCreationMessage}
		requiresTaskerLocation={requiresTaskerLocationForBooking}
		taskeeServiceRadius={taskeeServiceConfig?.serviceRadius ?? null}
		taskeeBaseLocation={taskeeServiceConfig?.baseLocation ?? null}
		taskerLocation={bookNowTaskerLocation}
		locationValidation={bookNowLocationValidation}
		onTaskerLocationSelect={handleBookNowLocationSelect}
		canConfirm={instantBuyDraft !== null &&
			instantBuyFundingCheck?.status === 'ready' &&
			(!requiresTaskerLocationForBooking || (bookNowLocationValidation?.valid ?? false))}
		onConfirm={handleConfirmInstantBuy}
		onRefresh={handleRefreshInstantBuy}
		onAddFunds={handleAddFunds}
		onRetry={() => prepareInstantBuyDraft(instantBuyDraft)}
		onClose={() => {
			clearBookNowLocationState();
			handleCloseInstantBuyDrawer();
		}}
	/>

	<Modal
		isOpen={deleteModalState !== null}
		title={deleteModalState?.mode === 'blocked'
			? detailText(
					'dashboard.services.detail.delete_service_modal.blocked_title',
					'Cannot delete service'
				)
			: detailText(
					'dashboard.services.detail.delete_service_modal.confirm_title',
					'Delete service'
				)}
		onClose={closeDeleteModal}
		size="md"
	>
		{#if deleteModalState}
			<p class="text-base-content/80 text-sm">
				{#if deleteModalState.mode === 'blocked'}
					{detailText(
						'dashboard.services.detail.delete_service_modal.blocked_body',
						'This service cannot be deleted at this time.'
					)}
				{:else if deleteModalState.openQuoteCount > 0}
					{detailText(
						'dashboard.services.detail.delete_service_modal.confirm_with_requests',
						'This service has open requests. Are you sure you want to delete it?'
					)}
				{:else}
					{detailText(
						'dashboard.services.detail.delete_service_modal.confirm_without_requests',
						'Are you sure you want to delete this service?'
					)}
				{/if}
			</p>

			{#if deleteModalState.mode === 'blocked'}
				<div class="mt-4 space-y-3">
					{#if deleteModalState.activeContractCount > 0}
						<div class="alert alert-error">
							<span>
								{detailText(
									'dashboard.services.detail.delete_service_modal.active_contracts',
									'Active service contracts are still attached to this service.'
								)}
							</span>
						</div>
					{/if}
				</div>
				<div class="mt-6 flex justify-end">
					<button type="button" class="btn btn-primary" onclick={closeDeleteModal}>
						{detailText('dashboard.services.detail.delete_service_modal.close', 'Close')}
					</button>
				</div>
			{:else}
				<div class="mt-4 space-y-3">
					{#if deleteModalState.openQuoteCount > 0}
						<div class="alert alert-warning">
							<span>
								{detailText(
									'dashboard.services.detail.delete_service_modal.open_requests_notice',
									'This service has open requests.'
								)}
							</span>
						</div>
					{:else}
						<p class="text-base-content/70 text-sm">
							{detailText(
								'dashboard.services.detail.delete_service_modal.no_dependents',
								'This service has no active dependencies and can be safely deleted.'
							)}
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
						{detailText('dashboard.services.detail.delete_service_modal.cancel', 'Cancel')}
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
						{detailText('dashboard.services.detail.delete_service_modal.confirm', 'Confirm Delete')}
					</button>
				</div>
			{/if}
		{/if}
	</Modal>

	<WalletPaymentModal isOpen={isReceiveModalOpen} onClose={() => (isReceiveModalOpen = false)}>
		<div class="flex h-full flex-col p-4">
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-lg font-bold">{$t('wallet.receive.receive_funds')}</h3>
				<button class="btn btn-ghost btn-sm" onclick={() => (isReceiveModalOpen = false)}>
					<IconClose class="h-5 w-5" />
				</button>
			</div>
			<ReceivePaymentForm
				initialFormState={receiveInitialState}
				onCancel={() => (isReceiveModalOpen = false)}
				onOpenPaymentRequest={(data) => {
					isReceiveModalOpen = false;
					openPaymentRequestModal(data);
				}}
			/>
		</div>
	</WalletPaymentModal>

	<!-- Centralized Payment Request Modal -->
	{#if paymentRequestModal.isOpen && (paymentRequestModal.swapId || paymentRequestModal.address)}
		<WalletPaymentModal isOpen={paymentRequestModal.isOpen} onClose={closePaymentRequestModal}>
			<PaymentRequestModal
				isOpen={paymentRequestModal.isOpen}
				swapId={paymentRequestModal.swapId ?? undefined}
				address={paymentRequestModal.address ?? undefined}
				network={paymentRequestModal.network ?? undefined}
				amount={paymentRequestModal.amount ?? undefined}
				memo={paymentRequestModal.memo ?? undefined}
				chargeFeesToPayer={paymentRequestModal.chargeFeesToPayer}
				totalFees={paymentRequestModal.totalFees ?? undefined}
				onClose={closePaymentRequestModal}
				onEdit={() => {
					if (paymentRequestModal.formState) {
						receiveInitialState = paymentRequestModal.formState;
					}
					closePaymentRequestModal();
					isReceiveModalOpen = true;
				}}
			/>
		</WalletPaymentModal>
	{/if}
</div>

<style>
	/* Custom transition for max-height as Tailwind doesn't support dynamic values well */
	.transition-\[max-height\] {
		transition-property: max-height;
	}

	/* Mobile tier tabs active state with primary bottom border */
	.tabs-bordered .tab-active {
		border-bottom: 2px solid var(--color-primary);
	}
</style>
