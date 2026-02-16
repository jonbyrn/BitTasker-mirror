<script lang="ts">
	import type { SearchServicesParams } from '$lib/types/service.d';
	import { ServicePricingTypeEnum, ServiceLocationTypeEnum } from '$lib/utils/enums/service.enum';
	import CategoryMultiselect from '$lib/components/CategoryMultiselect.svelte';
	import SkillsMultiselect from '$lib/components/SkillsMultiselect.svelte';
	import LocationAutoComplete from '$lib/components/LocationAutoComplete.svelte';
	import { t } from 'svelte-i18n';

	const SERVICES_PER_PAGE = 20;

	// Props
	let { isOpen, onClose, onApply, initialFilters } = $props<{
		isOpen: boolean;
		onClose: () => void;
		onApply: (filters: SearchServicesParams) => void;
		initialFilters?: SearchServicesParams;
	}>();

	// State
	const filters = $state<SearchServicesParams>({
		search: undefined,
		categories: [],
		skills: [],
		serviceLocationTypes: [],
		pricingType: undefined,
		minPrice: undefined,
		maxPrice: undefined,
		deliveryTime: undefined,
		location: undefined,
		radius: 10, // Default radius in km
		status: undefined,
		page: 1,
		limit: SERVICES_PER_PAGE
	});

	// Store selected location coordinates for distance calculation
	let selectedLocationCoords = $state<{ latitude: number; longitude: number } | null>(null);

	// Sync filters with initialFilters when drawer opens
	$effect(() => {
		if (isOpen && initialFilters) {
			filters.categories = initialFilters.categories ? [...initialFilters.categories] : [];
			filters.skills = initialFilters.skills ? [...initialFilters.skills] : [];
			filters.serviceLocationTypes = initialFilters.serviceLocationTypes
				? [...initialFilters.serviceLocationTypes]
				: [];
			filters.pricingType = initialFilters.pricingType;
			filters.minPrice = initialFilters.minPrice;
			filters.maxPrice = initialFilters.maxPrice;
			filters.deliveryTime = initialFilters.deliveryTime;
			filters.location = initialFilters.location;
			filters.radius = initialFilters.radius ?? 10;
			filters.status = initialFilters.status;
		}
	});

	// Track active filter count
	let activeFilterCount = $state(0);

	$effect(() => {
		let count = 0;
		if (filters.categories && filters.categories.length > 0) count++;
		if (filters.skills && filters.skills.length > 0) count++;
		if (filters.serviceLocationTypes && filters.serviceLocationTypes.length > 0) count++;
		if (filters.pricingType) count++;
		if (filters.minPrice !== undefined || filters.maxPrice !== undefined) count++;
		if (filters.location) count++;
		if (filters.status && filters.status.length > 0) count++;
		activeFilterCount = count;
	});

	// Scroll lock management
	const disableBodyScroll = () => {
		document.body.classList.add('overflow-hidden');
	};

	const enableBodyScroll = () => {
		document.body.classList.remove('overflow-hidden');
	};

	$effect(() => {
		if (isOpen) {
			disableBodyScroll();
		} else {
			enableBodyScroll();
		}
		return enableBodyScroll;
	});

	// Clear all filters
	function clearFilters() {
		filters.categories = [];
		filters.skills = [];
		filters.serviceLocationTypes = [];
		filters.pricingType = undefined;
		filters.minPrice = undefined;
		filters.maxPrice = undefined;
		filters.deliveryTime = undefined;
		filters.location = undefined;
		filters.radius = 10;
		filters.status = undefined;
		selectedLocationCoords = null;

		const cleanFilters: SearchServicesParams = {
			...filters,
			categories: [],
			skills: [],
			serviceLocationTypes: [],
			location: undefined,
			radius: undefined
		};
		onApply(cleanFilters);
	}

	// Apply filters and close drawer
	function applyFilters() {
		const cleanFilters: SearchServicesParams = {
			...filters,
			categories: [...(filters.categories || [])],
			skills: [...(filters.skills || [])],
			serviceLocationTypes: [...(filters.serviceLocationTypes || [])],
			location: filters.location ? `${selectedLocationCoords?.latitude},${selectedLocationCoords?.longitude}` : undefined
		};
		onApply(cleanFilters);
		onClose();
	}

	// Handle category change
	function handleCategoryChange(tags: string[]) {
		filters.categories = [...tags];
	}

	// Handle skills change
	function handleSkillsChange(skills: string[]) {
		filters.skills = skills;
	}

	// Handle location type toggle
	function toggleLocationType(type: ServiceLocationTypeEnum) {
		if (!filters.serviceLocationTypes) {
			filters.serviceLocationTypes = [];
		}
		const index = filters.serviceLocationTypes.indexOf(type);
		if (index > -1) {
			filters.serviceLocationTypes = filters.serviceLocationTypes.filter((t) => t !== type);
		} else {
			filters.serviceLocationTypes = [...filters.serviceLocationTypes, type];
		}
	}

	// Handle pricing type change
	function handlePricingTypeChange(type: ServicePricingTypeEnum | undefined) {
		filters.pricingType = type;
	}

	// Handle price range change
	function handlePriceRangeChange(min: number | undefined, max: number | undefined) {
		filters.minPrice = min;
		filters.maxPrice = max;
	}

	// Handle location selection
	function handleLocationSelect(location: {
		displayName: string;
		latitude: number | null;
		longitude: number | null;
		zipCode?: string;
		locationLoaded?: boolean;
	} | null) {
		if (location && location.latitude !== null && location.longitude !== null) {
			selectedLocationCoords = { latitude: location.latitude, longitude: location.longitude };
			filters.location = location.displayName;
		} else {
			selectedLocationCoords = null;
			filters.location = undefined;
		}
	}
</script>

<!-- Drawer Overlay -->
<div
	class="fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ease-in-out"
	class:opacity-0={!isOpen}
	class:invisible={!isOpen}
	onclick={onClose}
	onkeydown={(e) => e.key === 'Escape' && onClose()}
	role="dialog"
	tabindex="-1"
></div>

<div
	class="bg-base-100 fixed top-0 right-0 z-50 h-full w-full transform overflow-auto shadow-xl transition-transform duration-300 sm:w-[70%] {isOpen
		? 'translate-x-0'
		: 'translate-x-full'}"
>
	<!-- Header -->
	<div class="bg-base-200 sticky top-0 z-10 flex items-center justify-between p-4">
		<h3 id="drawer-title" class="text-xl font-bold">{$t('dashboard.services.browse.filters_button') || 'Filters'}</h3>
		<button
			class="btn btn-ghost btn-circle"
			onclick={onClose}
			aria-label={$t('dashboard.services.browse.close_dialog') || 'Close'}
		>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>
	</div>

	<div class="px-2">
		<!-- Categories -->
		<div class="collapse-arrow collapse mb-2">
			<input
				type="checkbox"
				class="peer"
				aria-label={$t('dashboard.services.browse.filters.toggle_categories') || 'Toggle categories'}
			/>
			<div class="collapse-title font-medium">
				{$t('dashboard.services.browse.filters.categories') || 'Categories'}
			</div>
			<div class="collapse-content">
				<CategoryMultiselect
					bind:selectedCategories={filters.categories}
					onChange={handleCategoryChange}
					maxSelections={3}
					placeholder={$t('dashboard.services.browse.filters.add_categories') || 'Add categories...'}
					className="w-full"
				/>
			</div>
		</div>

		<!-- Skills -->
		<div class="collapse-arrow collapse mb-2">
			<input
				type="checkbox"
				class="peer"
				aria-label={$t('dashboard.services.browse.filters.toggle_skills') || 'Toggle skills'}
			/>
			<div class="collapse-title font-medium">
				{$t('dashboard.services.browse.filters.skills') || 'Skills'}
			</div>
			<div class="collapse-content">
				<SkillsMultiselect
					bind:selectedSkills={filters.skills}
					onChange={handleSkillsChange}
					maxSelections={10}
					placeholder={$t('dashboard.services.browse.filters.add_skills') || 'Add skills...'}
					className="w-full"
				/>
			</div>
		</div>

		<!-- Location Types -->
		<div class="collapse-arrow collapse mb-2">
			<input
				type="checkbox"
				class="peer"
				aria-label={$t('dashboard.services.browse.filters.toggle_location_types') || 'Toggle location types'}
			/>
			<div class="collapse-title font-medium">
				{$t('dashboard.services.browse.filters.location_types') || 'Location Types'}
			</div>
			<div class="collapse-content">
				<div class="flex flex-col gap-2">
					<label class="label cursor-pointer justify-start gap-3">
						<input
							type="checkbox"
							class="checkbox"
							checked={filters.serviceLocationTypes?.includes(ServiceLocationTypeEnum.REMOTE)}
							onchange={() => toggleLocationType(ServiceLocationTypeEnum.REMOTE)}
						/>
						<span class="label-text">
							{$t('dashboard.services.create.location.remote_title') || 'Remote'}
						</span>
					</label>
					<label class="label cursor-pointer justify-start gap-3">
						<input
							type="checkbox"
							class="checkbox"
							checked={filters.serviceLocationTypes?.includes(ServiceLocationTypeEnum.TASKER_LOCATION)}
							onchange={() => toggleLocationType(ServiceLocationTypeEnum.TASKER_LOCATION)}
						/>
						<span class="label-text">
							{$t('dashboard.services.create.location.tasker_title') || 'At My Location'}
						</span>
					</label>
					<label class="label cursor-pointer justify-start gap-3">
						<input
							type="checkbox"
							class="checkbox"
							checked={filters.serviceLocationTypes?.includes(ServiceLocationTypeEnum.TASKEE_LOCATION)}
							onchange={() => toggleLocationType(ServiceLocationTypeEnum.TASKEE_LOCATION)}
						/>
						<span class="label-text">
							{$t('dashboard.services.create.location.taskee_title') || 'At Client Location'}
						</span>
					</label>
				</div>
			</div>
		</div>

		<!-- Pricing Type -->
		<div class="collapse-arrow collapse mb-2">
			<input
				type="checkbox"
				class="peer"
				aria-label={$t('dashboard.services.browse.filters.toggle_pricing_type') || 'Toggle pricing type'}
			/>
			<div class="collapse-title font-medium">
				{$t('dashboard.services.browse.filters.pricing_type') || 'Pricing Type'}
			</div>
			<div class="collapse-content">
				<div class="flex flex-col gap-2">
					<label class="label cursor-pointer justify-start gap-3">
						<input
							type="radio"
							name="pricingType"
							class="radio"
							checked={filters.pricingType === ServicePricingTypeEnum.FIXED}
							onchange={() => handlePricingTypeChange(ServicePricingTypeEnum.FIXED)}
						/>
						<span class="label-text">
							{$t('dashboard.services.create.pricing.fixed_title') || 'Fixed Price'}
						</span>
					</label>
					<label class="label cursor-pointer justify-start gap-3">
						<input
							type="radio"
							name="pricingType"
							class="radio"
							checked={filters.pricingType === ServicePricingTypeEnum.HOURLY}
							onchange={() => handlePricingTypeChange(ServicePricingTypeEnum.HOURLY)}
						/>
						<span class="label-text">
							{$t('dashboard.services.create.pricing.hourly_title') || 'Hourly Rate'}
						</span>
					</label>
					<label class="label cursor-pointer justify-start gap-3">
						<input
							type="radio"
							name="pricingType"
							class="radio"
							checked={filters.pricingType === ServicePricingTypeEnum.TIERED}
							onchange={() => handlePricingTypeChange(ServicePricingTypeEnum.TIERED)}
						/>
						<span class="label-text">
							{$t('dashboard.services.create.pricing.tiered_title') || 'Tiered Packages'}
						</span>
					</label>
					<label class="label cursor-pointer justify-start gap-3">
						<input
							type="radio"
							name="pricingType"
							class="radio"
							checked={filters.pricingType === ServicePricingTypeEnum.INQUIRY_REQUIRED}
							onchange={() => handlePricingTypeChange(ServicePricingTypeEnum.INQUIRY_REQUIRED)}
						/>
						<span class="label-text">
							{$t('dashboard.services.create.pricing.inquiry_title') || 'Inquiry Required'}
						</span>
					</label>
					<label class="label cursor-pointer justify-start gap-3">
						<input
							type="radio"
							name="pricingType"
							class="radio"
							checked={filters.pricingType === undefined}
							onchange={() => handlePricingTypeChange(undefined)}
						/>
						<span class="label-text">
							{$t('dashboard.services.browse.filters.any_pricing') || 'Any'}
						</span>
					</label>
				</div>
			</div>
		</div>

		<!-- Price Range -->
		<div class="collapse-arrow collapse mb-2">
			<input
				type="checkbox"
				class="peer"
				aria-label={$t('dashboard.services.browse.filters.toggle_price_range') || 'Toggle price range'}
			/>
			<div class="collapse-title font-medium">
				{$t('dashboard.services.browse.filters.price_range') || 'Price Range'}
			</div>
			<div class="collapse-content">
				<div class="space-y-4">
					<div class="form-control">
						<label class="label" for="min-price">
							<span class="label-text">
								{$t('dashboard.services.browse.filters.min_price') || 'Minimum Price ($)'}
							</span>
						</label>
						<input
							id="min-price"
							type="number"
							class="input input-bordered w-full"
							placeholder="0"
							min="0"
							step="1"
							bind:value={filters.minPrice}
							oninput={(e) => {
								const value = e.currentTarget.value;
								filters.minPrice = value ? parseFloat(value) : undefined;
							}}
						/>
					</div>
					<div class="form-control">
						<label class="label" for="max-price">
							<span class="label-text">
								{$t('dashboard.services.browse.filters.max_price') || 'Maximum Price ($)'}
							</span>
						</label>
						<input
							id="max-price"
							type="number"
							class="input input-bordered w-full"
							placeholder="10000"
							min="0"
							step="1"
							bind:value={filters.maxPrice}
							oninput={(e) => {
								const value = e.currentTarget.value;
								filters.maxPrice = value ? parseFloat(value) : undefined;
							}}
						/>
					</div>
					{#if filters.minPrice !== undefined || filters.maxPrice !== undefined}
						<button
							class="btn btn-xs btn-ghost"
							onclick={() => {
								filters.minPrice = undefined;
								filters.maxPrice = undefined;
							}}
						>
							{$t('dashboard.services.browse.filters.clear_price_range') || 'Clear'}
						</button>
					{/if}
				</div>
			</div>
		</div>

		<!-- Location -->
		<div class="collapse-arrow collapse mb-2" style="overflow: visible; z-index: 1000;">
			<input
				type="checkbox"
				class="peer"
				aria-label={$t('dashboard.services.browse.filters.toggle_location') || 'Toggle location'}
			/>
			<div class="collapse-title font-medium">
				{$t('dashboard.services.browse.filters.location') || 'Location'}
			</div>
			<div class="collapse-content">
				<LocationAutoComplete
					location={{
						displayName: filters.location || '',
						latitude: selectedLocationCoords?.latitude || 0,
						longitude: selectedLocationCoords?.longitude || 0,
						zipCode: '',
						locationLoaded: !!selectedLocationCoords
					}}
					onLocationSelect={handleLocationSelect}
					placeholder={$t('dashboard.services.browse.filters.location_placeholder') || 'Search location...'}
					showMap={false}
					searchRadius={filters.radius || 10}
				/>

				{#if filters.location}
					<div class="mt-4">
						<label class="label" for="search-radius" id="search-radius-label">
							<span class="label-text">
								{$t('dashboard.services.browse.filters.search_radius') || 'Search Radius (km)'}
							</span>
						</label>
						<input
							id="search-radius"
							type="range"
							class="range range-primary"
							min="1"
							max="100"
							step="1"
							bind:value={filters.radius}
						/>
						<div class="flex justify-between text-xs text-base-content/60 px-2">
							<span>1 km</span>
							<span>{filters.radius || 10} km</span>
							<span>100 km</span>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Filter Actions -->
		<div class="divider"></div>
		<div class="mt-8 mb-20 flex justify-between mx-4">
			<button class="btn btn-ghost btn-outline" onclick={clearFilters}>
				{$t('dashboard.services.browse.clear_filters') || 'Clear Filters'}
			</button>
			<button class="btn btn-primary" onclick={applyFilters}>
				{$t('dashboard.services.browse.filters.apply') || 'Apply'}
				{#if activeFilterCount > 0}
					<div class="badge badge-secondary ml-2">{activeFilterCount}</div>
				{/if}
			</button>
		</div>
	</div>
</div>

