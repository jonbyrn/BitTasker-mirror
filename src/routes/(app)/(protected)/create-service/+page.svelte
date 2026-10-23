<script lang="ts">
	import type { ServiceBody } from '$lib/types/service.d';
	import type { Attachment } from '$lib/types/task';
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { appStore } from '$lib/stores/app.store';
	import { serviceStore as store, STEPS } from '$lib/stores/service.store';
	import { createService, updateService, findServiceByUniqueId } from '$lib/nostr/service';
	import { findMyServices } from '$lib/nostr/findServices';
	import { myServicesStore } from '$lib/stores/service.store';
	import {
		ServiceStepEnum,
		ServicePricingTypeEnum,
		ServiceLocationTypeEnum
	} from '$lib/utils/enums/service.enum';
	import { t } from 'svelte-i18n';
	import { browser } from '$app/environment';
	import { user } from '$lib/stores/user.store';
	import { getRSKAddress, walletStore } from '$lib/stores/wallet.store';
	import { loadPageTranslations } from '$lib/i18n/routeTranslations';
	import { buildEarningQueryUrl } from '$lib/utils/dashboardQuery';
	import {
		sanitizeInstantBuyDeliveryHours,
		sanitizeInstantBuyLeadHours,
		supportsInstantBuyAuthoring,
		validateInstantBuyDeliveryHours,
		validateInstantBuyLeadHours
	} from '$lib/utils/service-instant-buy/authoring';
	import {
		getServiceEditConflictMessage,
		isServiceEditConflictError
	} from '$lib/utils/service-edit-conflict';

	// Import step components
	import ServiceBasics from '$lib/components/service/steps/ServiceBasics.svelte';
	import ServiceLocation from '$lib/components/service/steps/ServiceLocation.svelte';
	import ServicePricing from '$lib/components/service/steps/ServicePricing.svelte';
	import ServiceTiers from '$lib/components/service/steps/ServiceTiers.svelte';
	import ServiceAddOns from '$lib/components/service/steps/ServiceAddOns.svelte';
	import ServiceFAQs from '$lib/components/service/steps/ServiceFAQs.svelte';
	import InquiryFormBuilder from '$lib/components/service/steps/InquiryFormBuilder.svelte';
	import ServicePortfolio from '$lib/components/service/steps/ServicePortfolio.svelte';
	import ServiceReview from '$lib/components/service/steps/ServiceReview.svelte';

	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let isLoading = $state(false);
	let isEditDataLoaded = $state(false);
	let direction: 'forward' | 'backward' = $state('forward');
	let attachmentsToRemove = $state<Attachment[]>([]);

	// Function to refresh My Services list after creating/updating a service
	async function refreshMyServices() {
		try {
			const result = await findMyServices({ page: 1, limit: 100, refresh: true });
			myServicesStore.update((s) => ({
				...s,
				items: result.services,
				currentPage: 1,
				hasMore: result.hasMore,
				error: null
			}));
		} catch (error) {
			console.error('Error refreshing My Services:', error);
		}
	}

	// Function to handle cancel/back to previous page
	function handleCancel() {
		// Check if we're in edit or duplicate mode
		const isEditing = $page.url.searchParams.get('edit') === 'true';
		// Clear the appropriate draft (creation or edit)
		store.clearDraft(isEditing);
		// Navigate back to previous page, fallback to My Services
		if (browser && window.history.length > 1) {
			window.history.back();
		} else {
			goto(getMyServicesUrl());
		}
	}

	// Save draft before leaving the page
	let isEditingMode = $state(false);
	let beforeUnloadHandler: (() => void) | null = null;

	function getMyServicesUrl(): string {
		const baseUrl = browser ? new URL(window.location.origin) : new URL('https://bittasker.local');
		return buildEarningQueryUrl(new URL('/earning', baseUrl), {
			tab: 'my-services'
		});
	}

	// Load the draft when the page is loaded
	onMount(async () => {
		try {
			// Load route translations (create service - all 10 steps) same as create-task
			await loadPageTranslations('/create-service');
			isLoading = true;

			// Check if we're in edit or duplicate mode
			const isEditing = $page.url.searchParams.get('edit') === 'true';
			const isDuplicating = $page.url.searchParams.get('duplicate') === 'true';
			const serviceIdParam = $page.url.searchParams.get('serviceId');

			isEditingMode = isEditing;

			if (isEditing && serviceIdParam) {
				// Load service for edit mode
				try {
					const service = await findServiceByUniqueId(serviceIdParam);

					if (!service) {
						appStore.showErrorToast($t('dashboard.services.create.errors.service_not_found'));
						goto(getMyServicesUrl());
						return;
					}

					// Load service into store for editing; always start at step 1 (do not restore draft step)
					await store.loadServiceForEdit(service.id, service);
					store.setStep(ServiceStepEnum.BASICS);
					isEditDataLoaded = true;
				} catch (error) {
					console.error('Error loading service for edit:', error);
					appStore.showErrorToast($t('dashboard.services.create.errors.load_failed'));
					goto(getMyServicesUrl());
					return;
				}
			} else if (isDuplicating && serviceIdParam) {
				// Duplicate option removed: redirect to create
				goto('/create-service');
				return;
			} else {
				// New service: restore create draft from storage so user can resume from last step when they come back
				await store.loadDraft(false);
				isEditDataLoaded = true;
			}

			// Setup auto-save on page unload
			if (browser) {
				beforeUnloadHandler = () => {
					// Force immediate save before leaving
					store.saveDraft(isEditingMode, true);
				};

				window.addEventListener('beforeunload', beforeUnloadHandler);
			}
		} catch (error) {
			console.error('Error loading draft:', error);
		} finally {
			isLoading = false;
		}
	});

	// Save draft when component is destroyed
	onDestroy(() => {
		if (browser) {
			// Remove beforeunload listener
			if (beforeUnloadHandler) {
				window.removeEventListener('beforeunload', beforeUnloadHandler);
			}
			// Save draft one more time when component is destroyed
			store.saveDraft(isEditingMode, true);
		}
	});

	function validateCurrentStep(): boolean {
		errors = {};
		const service = $store.service;

		switch ($store.currentStep) {
			case ServiceStepEnum.BASICS:
				if (!service?.title?.trim())
					errors.title = $t('dashboard.services.create.errors.title_required');
				if (service?.title && service.title.length > 200)
					errors.title = $t('dashboard.services.create.errors.title_too_long');
				if (!service?.description?.trim())
					errors.description = $t('dashboard.services.create.errors.description_required');
				if (service?.description && service.description.length > 5000)
					errors.description = $t('dashboard.services.create.errors.description_too_long');
				if (!service?.categories || service.categories.length === 0)
					errors.category = $t('dashboard.services.create.errors.category_required');
				if (!service?.skills || service.skills.length === 0)
					errors.skill = $t('dashboard.services.create.errors.skill_required');
				break;
			case ServiceStepEnum.LOCATION:
				if (!service?.serviceLocationTypes || service.serviceLocationTypes.length === 0)
					errors.location = $t('dashboard.services.create.errors.location_type_required');
				// Validate location details based on selected types
				if (service?.serviceLocationTypes?.includes(ServiceLocationTypeEnum.TASKER_LOCATION)) {
					if (
						!service.locationDetails?.taskerLocation?.serviceLocation?.latitude ||
						!service.locationDetails?.taskerLocation?.serviceLocation?.longitude
					) {
						errors.location = $t('dashboard.services.create.errors.service_location_required');
					}
				}
				if (service?.serviceLocationTypes?.includes(ServiceLocationTypeEnum.TASKEE_LOCATION)) {
					if (
						!service.locationDetails?.taskeeLocation?.useGlobalLocation &&
						(!service.locationDetails?.taskeeLocation?.serviceLocation?.latitude ||
							!service.locationDetails?.taskeeLocation?.serviceLocation?.longitude)
					) {
						errors.location = $t('dashboard.services.create.errors.taskee_location_required');
					}
				}
				break;
			case ServiceStepEnum.PRICING: {
				if (!service?.pricing?.type) {
					errors.pricing = $t('dashboard.services.create.errors.pricing_required');
				} else if (service.pricing.type === ServicePricingTypeEnum.FIXED) {
					if (service.pricing.amount == null || service.pricing.amount <= 0) {
						errors.amount = $t('dashboard.services.create.errors.budget_required');
						errors.pricing = $t('dashboard.services.create.errors.budget_required');
					}
				} else if (service.pricing.type === ServicePricingTypeEnum.HOURLY) {
					if (service.pricing.hourlyRate == null || service.pricing.hourlyRate <= 0) {
						errors.hourlyRate = $t('dashboard.services.create.errors.hourly_rate_required');
						errors.pricing = $t('dashboard.services.create.errors.hourly_rate_required');
					}
				}
				const instantBuyLeadHoursValidation = validateInstantBuyLeadHours(
					service?.pricing?.type,
					service?.instantBuyLeadHours
				);
				const instantBuyDeliveryHoursValidation = validateInstantBuyDeliveryHours(
					service?.pricing?.type,
					service?.instantBuyDeliveryHours
				);
				if (!instantBuyLeadHoursValidation.valid) {
					errors.instantBuyLeadHours = $t(
						'dashboard.services.create.errors.instant_buy_lead_hours_invalid'
					);
				}
				if (!instantBuyDeliveryHoursValidation.valid) {
					errors.instantBuyDeliveryHours = $t(
						'dashboard.services.create.errors.instant_buy_delivery_hours_invalid'
					);
				}
				if (
					service?.instantBuyLeadHours != null &&
					!supportsInstantBuyAuthoring(service.pricing?.type)
				) {
					errors.instantBuyLeadHours = $t(
						'dashboard.services.create.errors.instant_buy_pricing_only_fixed_tiered'
					);
				}
				// TIERED and INQUIRY_REQUIRED: no amount/tiers required here
				break;
			}
			case ServiceStepEnum.TIERS:
				if (service?.pricing?.type === ServicePricingTypeEnum.TIERED) {
					if (!service.pricing.tiers || service.pricing.tiers.length < 2) {
						errors.pricing = $t('dashboard.services.create.errors.tiers_required');
					} else {
						const invalidTier = service.pricing.tiers.some(
							(t) => !t.description?.trim() || t.price == null || t.price <= 0
						);
						if (invalidTier) {
							errors.tiers = $t(
								'dashboard.services.create.errors.tiers_description_price_required'
							);
						}

						// When Book Now is enabled, all tiers must have delivery time
						if (service.instantBuyLeadHours != null) {
							const tiersMissingDeliveryTime = service.pricing.tiers.some((t) => !t.deliveryTime);
							if (tiersMissingDeliveryTime) {
								errors.tiers = $t(
									'dashboard.services.create.errors.tiers_delivery_time_required_for_book_now'
								);
							}
						}

						// Rush delivery price must be > 0 if enabled
						const invalidRushPrice = service.pricing.tiers.some(
							(t) =>
								t.rushDelivery?.enabled &&
								(t.rushDelivery.price == null || t.rushDelivery.price <= 0)
						);
						if (invalidRushPrice) {
							errors.tiers = $t(
								'dashboard.services.create.errors.tiers_description_price_required'
							);
						}
					}
				}
				break;
			case ServiceStepEnum.ADD_ONS:
				// Add-ons step is optional, no validation needed
				break;
			case ServiceStepEnum.FAQS:
				// FAQs step is optional, no validation needed
				break;
			case ServiceStepEnum.INQUIRY_FORM:
				// Inquiry form step validation is handled in PRICING step
				break;
			case ServiceStepEnum.PORTFOLIO:
				// Portfolio step is optional, no validation needed
				break;
			case ServiceStepEnum.REVIEW:
				// Review step doesn't need validation as it's just reviewing previous inputs
				break;
		}

		return Object.keys(errors).length === 0;
	}

	const handleNext = async () => {
		if (!validateCurrentStep()) return;

		// When "Cotización Requerida" or "Precio fijo": skip only TIERS -> ADD_ONS (do not skip Add-ons)
		if (
			$store.currentStep === ServiceStepEnum.PRICING &&
			($store.service.pricing?.type === ServicePricingTypeEnum.INQUIRY_REQUIRED ||
				$store.service.pricing?.type === ServicePricingTypeEnum.FIXED ||
				$store.service.pricing?.type === ServicePricingTypeEnum.HOURLY)
		) {
			store.setStep(ServiceStepEnum.ADD_ONS);
			store.saveDraft($store.isEditing, true);
		} else {
			store.nextStep();
			store.saveDraft($store.isEditing, true);
		}
		direction = 'forward';
	};

	function handleBack() {
		// When returning from ADD_ONS and we skipped TIERS (Precio fijo or Cotización Requerida), go back to PRICING
		if (
			$store.currentStep === ServiceStepEnum.ADD_ONS &&
			($store.service.pricing?.type === ServicePricingTypeEnum.FIXED ||
				$store.service.pricing?.type === ServicePricingTypeEnum.HOURLY ||
				$store.service.pricing?.type === ServicePricingTypeEnum.INQUIRY_REQUIRED)
		) {
			store.setStep(ServiceStepEnum.PRICING);
		} else {
			store.previousStep();
		}
		direction = 'backward';
	}

	async function handleSubmit() {
		if (!validateCurrentStep()) return;

		try {
			isSubmitting = true;

			const normalizedPricing = $store.service.pricing
				? {
						...$store.service.pricing,
						currency:
							$store.service.pricing.currency === 'USDt'
								? 'USD'
								: ($store.service.pricing.currency ?? 'USD')
					}
				: {
						type: ServicePricingTypeEnum.FIXED,
						currency: 'USD',
						amount: 0
					};

			// Files are uploaded immediately when selected, no need to upload here

			const instantBuyLeadHours = sanitizeInstantBuyLeadHours(
				$store.service.pricing?.type,
				$store.service.instantBuyLeadHours
			);
			const instantBuyDeliveryHours = sanitizeInstantBuyDeliveryHours(
				$store.service.pricing?.type,
				$store.service.instantBuyDeliveryHours
			);
			const requiresProviderWallet =
				supportsInstantBuyAuthoring($store.service.pricing?.type) && instantBuyLeadHours != null;

			// Prefer current wallet if connected, otherwise use stored address (from previous versions/drafts)
			let providerWalletAddress =
				$walletStore.rsk?.address || $store.service.providerWalletAddress || undefined;

			// If Book Now is enabled but we don't have a wallet address yet, attempt to connect
			if (requiresProviderWallet && !providerWalletAddress) {
				try {
					providerWalletAddress = await getRSKAddress();
				} catch {
					// Graceful reuse: If editing an existing Book Now service, we should already have the address
					// in $store.service.providerWalletAddress (from loadServiceForEdit).
					// Only throw if we truly have no address for a service that REQUIRES Book Now.
					if (!$store.isEditing || !providerWalletAddress) {
						throw new Error($t('dashboard.services.create.errors.wallet_connect_book_now'));
					}
					// If editing and we failed to connect but HAVE a previous address, we proceed with the old one.
				}
			}

			const serviceData: ServiceBody = {
				uniqueId: $store.service.uniqueId || '',
				createdAt: $store.service.createdAt || 0,
				creator:
					$store.service.creator ||
					({
						username: '',
						avatar: '',
						name: $user?.name || ''
					} as { username: string; avatar: string; name: string }),
				title: $store.service.title || '',
				description: $store.service.description || '',
				serviceLocationTypes: $store.service.serviceLocationTypes || [],
				locationDetails: $store.service.locationDetails,
				pricing: normalizedPricing,
				skills: $store.service.skills || [],
				categories: $store.service.categories || [],
				portfolio: $store.service.portfolio,
				faqs: $store.service.faqs,
				instantBuyLeadHours,
				instantBuyDeliveryHours,
				status: 'active' // Set to active when publishing
			};

			// If Book Now is enabled, inject the wallet address.
			// If it was explicitly disabled, ensure the field is removed/undefined to clear legacy data.
			if (requiresProviderWallet) {
				serviceData.providerWalletAddress = providerWalletAddress;
			} else {
				serviceData.providerWalletAddress = undefined;
			}

			// Use store state so we update even if URL lost edit=true (e.g. after navigation)
			const dTag = $store.uniqueId || $store.service.uniqueId;
			const isUpdating = $store.isEditing && Boolean(dTag);

			if (isUpdating && dTag) {
				// updateService uses #d tag (human-readable identifier)
				await updateService(dTag, serviceData, {
					expectedServiceEventId: $store.id || undefined
				});
				appStore.showSuccessToast($t('dashboard.services.create.success.updated'));

				await store.clearDraft(true);
				await refreshMyServices();

				await goto(getMyServicesUrl());
			} else {
				await createService(serviceData);
				appStore.showSuccessToast($t('dashboard.services.create.success.created'));

				// Clear the draft (creation or duplicate)
				await store.clearDraft(false);

				// Brief delay so the relay can index the new event before we fetch
				await new Promise((r) => setTimeout(r, 600));
				// Refresh My Services list and update store so the list is ready when we navigate
				await refreshMyServices();

				await goto(getMyServicesUrl());
			}
		} catch (error) {
			const errorMessage = isServiceEditConflictError(error)
				? getServiceEditConflictMessage()
				: error instanceof Error
					? error.message
					: $t('dashboard.services.create.errors.create_failed');
			errors.general = errorMessage;
			appStore.showErrorToast(errorMessage);
		} finally {
			isSubmitting = false;
		}
	}
</script>

<!-- Mismas dimensiones que Create Task: max-w-6xl, px-2 py-6 md:px-0 md:py-0 -->
<div class="service-create-flow mx-auto h-full min-w-0 px-2 py-6 md:px-0 md:py-0">
	<!-- Page Header -->
	<div class="mb-6">
		<h3 class="">
			{#if $store.isEditing}
				{$t('dashboard.services.create.edit_title')}
			{:else}
				{$t('dashboard.services.create.title')}
			{/if}
		</h3>
		<p class="text-base-content/70">
			{#if $store.isEditing}
				{$t('dashboard.services.create.edit_description')}
			{:else}
				{$t('dashboard.services.create.description')}
			{/if}
		</p>
	</div>
	<div class="bg-base-100 rounded-xl">
		<div class="card-body min-w-0">
			<!-- Step counter (igual que Create Task) -->
			<div class="mb-4 flex items-center justify-between">
				<div class="text-sm">
					{$t('dashboard.services.create.step')}
					{$STEPS.indexOf($store.currentStep) + 1}
					{$t('dashboard.services.create.of')}
					{$STEPS.length}
				</div>
			</div>

			{#if isLoading || !isEditDataLoaded}
				<div class="flex justify-center">
					<span class="loading loading-spinner loading-lg"></span>
				</div>
			{:else}
				<div class="service-create-step-content min-w-0 space-y-6">
					<!-- Step Components -->
					{#if $store.currentStep === ServiceStepEnum.BASICS}
						<ServiceBasics {errors} {direction} />
					{:else if $store.currentStep === ServiceStepEnum.LOCATION}
						<ServiceLocation {errors} {direction} />
					{:else if $store.currentStep === ServiceStepEnum.PRICING}
						<ServicePricing {errors} {direction} />
					{:else if $store.currentStep === ServiceStepEnum.TIERS}
						<ServiceTiers {errors} {direction} />
					{:else if $store.currentStep === ServiceStepEnum.ADD_ONS}
						<ServiceAddOns {errors} {direction} />
					{:else if $store.currentStep === ServiceStepEnum.FAQS}
						<ServiceFAQs {errors} {direction} />
					{:else if $store.currentStep === ServiceStepEnum.INQUIRY_FORM}
						<InquiryFormBuilder {errors} {direction} />
					{:else if $store.currentStep === ServiceStepEnum.PORTFOLIO}
						<ServicePortfolio {errors} {direction} bind:attachmentsToRemove />
					{:else if $store.currentStep === ServiceStepEnum.REVIEW}
						<ServiceReview {errors} {direction} />
					{/if}

					<!-- Control buttons -->
					<div class="mt-6 flex justify-between gap-3">
						{#if $store.currentStep !== ServiceStepEnum.BASICS}
							<button type="button" class="btn btn-secondary" onclick={handleBack}>
								{$t('dashboard.services.create.back')}
							</button>
						{:else}
							<button type="button" class="btn btn-secondary" onclick={handleCancel}>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="mr-1 h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
								{$t('dashboard.services.create.back_to_services')}
							</button>
						{/if}

						{#if $STEPS.indexOf($store.currentStep) === $STEPS.length - 1}
							<button
								type="button"
								class="btn btn-primary {isSubmitting ? 'loading' : ''}"
								onclick={handleSubmit}
								disabled={isSubmitting}
							>
								{#if isSubmitting}
									<span></span>
								{:else if $page.url.searchParams.get('edit') === 'true'}
									{$t('dashboard.services.create.update')}
								{:else}
									{$t('dashboard.services.create.publish')}
								{/if}
							</button>
						{:else}
							<button type="button" class="btn btn-primary" onclick={handleNext}>
								{$t('dashboard.services.create.next')}
							</button>
						{/if}
					</div>
				</div>

				{#if errors.general}
					<div class="alert alert-error alert-outline mt-6 shadow-lg">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6 shrink-0 stroke-current"
							fill="none"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span>{errors.general}</span>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	.service-create-flow {
		scrollbar-gutter: stable both-edges;
	}

	.service-create-step-content :global(.card),
	.service-create-step-content :global(.collapse),
	.service-create-step-content :global(.alert),
	.service-create-step-content :global(.form-control),
	.service-create-step-content :global(.label),
	.service-create-step-content :global(.join),
	.service-create-step-content :global(.mockup-window),
	.service-create-step-content :global(.collapse-title),
	.service-create-step-content :global(.card-title),
	.service-create-step-content :global(.badge) {
		min-width: 0;
		max-width: 100%;
	}

	.service-create-step-content :global(label),
	.service-create-step-content :global(.label-text),
	.service-create-step-content :global(.label-text-alt),
	.service-create-step-content :global(h1),
	.service-create-step-content :global(h2),
	.service-create-step-content :global(h3),
	.service-create-step-content :global(h4),
	.service-create-step-content :global(h5),
	.service-create-step-content :global(h6),
	.service-create-step-content :global(p),
	.service-create-step-content :global(span),
	.service-create-step-content :global(button),
	.service-create-step-content :global(div),
	.service-create-step-content :global(li),
	.service-create-step-content :global(a) {
		overflow-wrap: anywhere;
		word-break: break-word;
	}

	.service-create-step-content :global(input),
	.service-create-step-content :global(textarea),
	.service-create-step-content :global(select) {
		max-width: 100%;
	}
</style>
