<script lang="ts">
	import type { Service, ServiceBody } from '$lib/types/service.d';
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { appStore } from '$lib/stores/app.store';
	import { serviceStore as store, STEPS } from '$lib/stores/service.store';
	import { listService, updateService, findServiceByUniqueId } from '$lib/nostr/service';
	import { findMyServices } from '$lib/nostr/findServices';
	import { myServicesStore } from '$lib/stores/service.store';
	import { ServiceStepEnum, ServicePricingTypeEnum, ServiceLocationTypeEnum } from '$lib/utils/enums/service.enum';
	import { t } from 'svelte-i18n';
	import { browser } from '$app/environment';

	// Import step components
	import ServiceBasics from '$lib/components/service/steps/ServiceBasics.svelte';
	import ServiceLocation from '$lib/components/service/steps/ServiceLocation.svelte';
	import ServiceDetails from '$lib/components/service/steps/ServiceDetails.svelte';
	import ServicePricing from '$lib/components/service/steps/ServicePricing.svelte';
	import ServiceTiers from '$lib/components/service/steps/ServiceTiers.svelte';
	import ServiceAddOns from '$lib/components/service/steps/ServiceAddOns.svelte';
	import ServiceFAQs from '$lib/components/service/steps/ServiceFAQs.svelte';
	import InquiryFormBuilder from '$lib/components/service/steps/InquiryFormBuilder.svelte';
	import ServicePortfolio from '$lib/components/service/steps/ServicePortfolio.svelte';
	import ServiceReview from '$lib/components/service/steps/ServiceReview.svelte';
	import uploadService from '$lib/api/services/upload.service';

	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let isLoading = $state(false);
	let isEditDataLoaded = $state(false);
	let direction: 'forward' | 'backward' = $state('forward');
	let attachmentsToRemove = $state<any[]>([]);
	let servicePortfolioRef = $state<any>(); // Reference to ServicePortfolio component

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

	// Function to handle cancel/back to My Services
	function handleCancel() {
		// Check if we're in edit or duplicate mode
		const isEditing = $page.url.searchParams.get('edit') === 'true';
		const isDuplicating = $page.url.searchParams.get('duplicate') === 'true';
		// Clear the appropriate draft (creation or edit)
		store.clearDraft(isEditing);
		// Navigate back to My Services
		goto('/dashboard/my-services');
	}

	// Save draft before leaving the page
	let isEditingMode = $state(false);
	let isDuplicatingMode = $state(false);
	let beforeUnloadHandler: (() => void) | null = null;

	// Load the draft when the page is loaded
	onMount(async () => {
		try {
			isLoading = true;

			// Check if we're in edit or duplicate mode
			const isEditing = $page.url.searchParams.get('edit') === 'true';
			const isDuplicating = $page.url.searchParams.get('duplicate') === 'true';
			const serviceIdParam = $page.url.searchParams.get('serviceId');

			isEditingMode = isEditing;
			isDuplicatingMode = isDuplicating;

			if (isEditing && serviceIdParam) {
				// Load service for edit mode
				try {
					const service = await findServiceByUniqueId(serviceIdParam);

					if (!service) {
						appStore.showErrorToast($t('dashboard.services.create.errors.service_not_found'));
						goto('/dashboard/my-services');
						return;
					}

					// Load service into store for editing
					await store.loadServiceForEdit(service.id, service);
					await store.loadDraft(true);
					isEditDataLoaded = true;
				} catch (error) {
					console.error('Error loading service for edit:', error);
					appStore.showErrorToast($t('dashboard.services.create.errors.load_failed'));
					goto('/dashboard/my-services');
					return;
				}
			} else if (isDuplicating && serviceIdParam) {
				// Load service for duplicate mode
				try {
					const service = await findServiceByUniqueId(serviceIdParam);

					if (!service) {
						appStore.showErrorToast($t('dashboard.services.create.errors.service_not_found'));
						goto('/dashboard/my-services');
						return;
					}

					// Load service into store for duplication
					await store.loadServiceForDuplicate(service.id, service);
					await store.loadDraft(false); // Duplicate mode uses CREATE_STORAGE_KEY
					isEditDataLoaded = true;
				} catch (error) {
					console.error('Error loading service for duplicate:', error);
					appStore.showErrorToast($t('dashboard.services.create.errors.load_failed'));
					goto('/dashboard/my-services');
					return;
				}
			} else {
				// Load draft for new service creation (uses CREATE_STORAGE_KEY)
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
				if (!service?.title?.trim()) errors.title = $t('dashboard.services.create.errors.title_required');
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
					if (!service.locationDetails?.taskerLocation?.serviceLocation?.latitude ||
						!service.locationDetails?.taskerLocation?.serviceLocation?.longitude) {
						errors.location = $t('dashboard.services.create.errors.service_location_required');
					}
				}
				if (service?.serviceLocationTypes?.includes(ServiceLocationTypeEnum.TASKEE_LOCATION)) {
					if (!service.locationDetails?.taskeeLocation?.useGlobalLocation &&
						(!service.locationDetails?.taskeeLocation?.serviceLocation?.latitude ||
							!service.locationDetails?.taskeeLocation?.serviceLocation?.longitude)) {
						errors.location = $t('dashboard.services.create.errors.taskee_location_required');
					}
				}
				break;
			case ServiceStepEnum.DETAILS:
				// Details step is optional, no validation needed
				break;
			case ServiceStepEnum.PRICING:
				if (!service?.pricing) {
					errors.pricing = $t('dashboard.services.create.errors.pricing_required');
				} else if (service.pricing.type === ServicePricingTypeEnum.FIXED) {
					// Misma validación que Create Task: presupuesto no puede ser cero
					if (service.pricing.amount == null || service.pricing.amount <= 0) {
						errors.amount = $t('dashboard.services.create.errors.budget_required');
						errors.pricing = $t('dashboard.services.create.errors.budget_required');
					}
				} else if (service.pricing.type === ServicePricingTypeEnum.HOURLY) {
					if (!service.pricing.hourlyRate || service.pricing.hourlyRate <= 0)
						errors.pricing = $t('dashboard.services.create.errors.hourly_rate_required');
				} else if (service.pricing.type === ServicePricingTypeEnum.TIERED) {
					if (!service.pricing.tiers || service.pricing.tiers.length < 2)
						errors.pricing = $t('dashboard.services.create.errors.tiers_required');
				}
				// INQUIRY_REQUIRED doesn't need validation (inquiry form is optional)
				break;
			case ServiceStepEnum.TIERS:
				// Tiers step validation is handled in PRICING step
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

		// Proceed to next step immediately
		store.nextStep();
		store.saveDraft();
		direction = 'forward';
	};

	async function handleSubmit() {
		if (!validateCurrentStep()) return;

		let signedEventId: string | null = null;

		try {
			isSubmitting = true;

			// Files are uploaded immediately when selected, no need to upload here

			const serviceData: ServiceBody = {
				uniqueId: $store.service.uniqueId || '',
				createdAt: $store.service.createdAt || 0,
				creator: $store.service.creator || {
					username: '',
					avatar: ''
				},
				title: $store.service.title || '',
				description: $store.service.description || '',
				serviceLocationTypes: $store.service.serviceLocationTypes || [],
				locationDetails: $store.service.locationDetails,
				pricing: $store.service.pricing || {
					type: ServicePricingTypeEnum.FIXED,
					currency: 'USDt',
					amount: 0
				},
				skills: $store.service.skills || [],
				categories: $store.service.categories || [],
				portfolio: $store.service.portfolio,
				faqs: $store.service.faqs,
				status: 'active' // Set to active when publishing
			};

			const isUpdating = $page.url.searchParams.get('edit') === 'true';

			if (isUpdating) {
				// updateService uses #d tag (human-readable identifier)
				const dTag = $store.service.uniqueId;
				if (!dTag) {
					appStore.showErrorToast($t('dashboard.services.create.errors.service_not_found'));
					return;
				}
				signedEventId = await updateService(dTag, serviceData);
				appStore.showSuccessToast($t('dashboard.services.success.updated'));

				// Refresh My Services list to show updated service
				await refreshMyServices();

				const url = new URL($page.url);
				url.searchParams.delete('edit');
				url.searchParams.delete('serviceId');
				goto(url);
			} else {
				signedEventId = await listService(serviceData);
				appStore.showSuccessToast($t('dashboard.services.success.created'));

				// Clear the draft (creation or duplicate)
				await store.clearDraft(false);

				// Brief delay so the relay can index the new event before we fetch
				await new Promise((r) => setTimeout(r, 600));
				// Refresh My Services list and update store so the list is ready when we navigate
				await refreshMyServices();

				await goto('/dashboard/my-services');
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : $t('dashboard.services.create.errors.create_failed');
			errors.general = errorMessage;
			appStore.showErrorToast(errorMessage);
		} finally {
			isSubmitting = false;
		}
	}
</script>

<!-- Mismas dimensiones que Create Task: max-w-6xl, px-2 py-6 md:px-0 md:py-0 -->
<div class="mx-auto h-full max-w-6xl px-2 py-6 md:px-0 md:py-0">
	<!-- Page Header -->
	<div class="mb-6">
		<h3 class="">
			{#if $page.url.searchParams.get('edit') === 'true'}
				{$t('dashboard.services.create.edit_title')}
			{:else if $page.url.searchParams.get('duplicate') === 'true'}
				{$t('dashboard.services.create.duplicate_title')}
			{:else}
				{$t('dashboard.services.create.title')}
			{/if}
		</h3>
		<p class="text-base-content/70">
			{#if $page.url.searchParams.get('edit') === 'true'}
				{$t('dashboard.services.create.edit_description')}
			{:else if $page.url.searchParams.get('duplicate') === 'true'}
				{$t('dashboard.services.create.duplicate_description')}
			{:else}
				{$t('dashboard.services.create.description')}
			{/if}
		</p>
	</div>
	<div class="bg-base-100 rounded-xl">
		<div class="card-body">
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
				<div class="space-y-6">
					<!-- Step Components -->
					{#if $store.currentStep === ServiceStepEnum.BASICS}
						<ServiceBasics {errors} {direction} />
					{:else if $store.currentStep === ServiceStepEnum.LOCATION}
						<ServiceLocation {errors} {direction} />
					{:else if $store.currentStep === ServiceStepEnum.DETAILS}
						<ServiceDetails {errors} {direction} />
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
						<ServicePortfolio {errors} {direction} bind:attachmentsToRemove bind:this={servicePortfolioRef} />
					{:else if $store.currentStep === ServiceStepEnum.REVIEW}
						<ServiceReview {errors} {direction} />
					{/if}

					<!-- Control buttons -->
					<div class="mt-6 flex justify-between">
						{#if $store.currentStep !== ServiceStepEnum.BASICS}
							<button
								class="btn btn-secondary"
								onclick={() => {
									store.previousStep();
									direction = 'backward';
								}}
							>
								{$t('dashboard.services.create.back')}
							</button>
						{:else}
							<button class="btn btn-secondary" onclick={handleCancel}>
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
							<button class="btn btn-primary" onclick={handleNext}>
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

