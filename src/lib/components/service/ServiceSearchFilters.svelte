<script lang="ts">
	import type { SearchServicesParams } from '$lib/types/service.d';
	import { ServicePricingTypeEnum, ServiceLocationTypeEnum } from '$lib/utils/enums/service.enum';
	import CategoryMultiselect from '$lib/components/CategoryMultiselect.svelte';
	import SkillsMultiselect from '$lib/components/SkillsMultiselect.svelte';
	import UnifiedFilterDrawer from '$lib/components/listing/UnifiedFilterDrawer.svelte';
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

	function getDefaultFilters(): SearchServicesParams {
		return {
			search: undefined,
			categories: [],
			skills: [],
			serviceLocationTypes: [],
			pricingType: undefined,
			minPrice: undefined,
			maxPrice: undefined,
			deliveryTime: undefined,
			location: undefined,
			radius: undefined,
			status: undefined,
			page: 1,
			limit: SERVICES_PER_PAGE
		};
	}

	// State — use getDefaultFilters directly instead of a separate object literal
	let filters = $state<SearchServicesParams>(getDefaultFilters());
	let priceError = $state<string | null>(null);
	let priceErrorId = 'min-price-error';

	// Store selected location coordinates for distance calculation
	let selectedLocationCoords = $state<{ latitude: number; longitude: number } | null>(null);
	let skillsOpen = $state(false);
	let locationTypesOpen = $state(false);
	let pricingTypeOpen = $state(false);
	let priceRangeOpen = $state(false);
	let locationOpen = $state(false);

	// Sync filters with initialFilters when drawer opens (assign from getDefaultFilters + initialFilters)
	$effect(() => {
		if (isOpen && initialFilters) {
			filters = {
				...getDefaultFilters(),
				...initialFilters,
				categories: initialFilters.categories ? [...initialFilters.categories] : [],
				skills: initialFilters.skills ? [...initialFilters.skills] : [],
				serviceLocationTypes: initialFilters.serviceLocationTypes
					? [...initialFilters.serviceLocationTypes]
					: [],
				radius: initialFilters.radius ?? 10
			};
			selectedLocationCoords = initialFilters.locationCoords
				? { ...initialFilters.locationCoords }
				: null;
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

	// Clear all filters (use getDefaultFilters directly)
	function filtersForApply(source: SearchServicesParams): SearchServicesParams {
		const location = source.location?.trim() ? source.location : undefined;
		return {
			...source,
			location,
			locationCoords: location ? source.locationCoords : undefined,
			// Radius is only a filter once a place is chosen. The slider default is not.
			radius: location ? (source.radius ?? 10) : undefined,
			status: source.status && source.status.length > 0 ? source.status : undefined,
			categories: [...(source.categories || [])]
		};
	}

	function clearFilters() {
		filters = getDefaultFilters();
		selectedLocationCoords = null;
		onApply(filtersForApply(getDefaultFilters()));
	}

	// Apply filters and close drawer
	function applyFilters() {
		const cleanFilters: SearchServicesParams = filtersForApply({
			...filters,
			categories: [...(filters.categories || [])],
			skills: [...(filters.skills || [])],
			serviceLocationTypes: [...(filters.serviceLocationTypes || [])],
			locationCoords: selectedLocationCoords ? { ...selectedLocationCoords } : undefined
		});
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

	// Handle location selection
	function handleLocationSelect(
		location: {
			displayName: string;
			latitude: number | null;
			longitude: number | null;
			zipCode?: string;
			locationLoaded?: boolean;
		} | null
	) {
		if (location && location.latitude !== null && location.longitude !== null) {
			selectedLocationCoords = { latitude: location.latitude, longitude: location.longitude };
			filters.location = location.displayName;
			if (filters.radius == null) filters.radius = 10;
		} else {
			selectedLocationCoords = null;
			filters.location = undefined;
		}
	}

	function validatePriceRange(): boolean {
		if (
			filters.minPrice !== undefined &&
			filters.maxPrice !== undefined &&
			filters.minPrice > filters.maxPrice
		) {
			priceError =
				$t('dashboard.services.browse.filters.price_error') || 'Min price cannot exceed max price';
			return false;
		}
		priceError = null;
		return true;
	}
</script>

<UnifiedFilterDrawer
	{isOpen}
	title={$t('dashboard.services.browse.filters_button') || 'Filters'}
	{onClose}
	onClear={clearFilters}
	onApply={applyFilters}
	clearLabel={$t('dashboard.services.browse.clear_filters') || 'Clear Filters'}
	applyLabel={$t('dashboard.services.browse.filters.apply') || 'Apply'}
	{activeFilterCount}
>
	<!-- Categories -->
	<div class="mb-4">
		<label for="categories" class="label">
			<span class="label-text text-sm font-medium"
				>{$t('dashboard.services.browse.filters.categories') || 'Categories'}</span
			>
		</label>
		<CategoryMultiselect
			controlId="categories"
			bind:externalCategoryIds={filters.categories}
			onChange={handleCategoryChange}
			maxSelections={3}
			placeholder={$t('dashboard.services.browse.filters.add_categories') || 'Add categories...'}
			className="w-full"
		/>
	</div>

	<!-- Skills -->
	<div class="collapse-arrow collapse mb-2">
		<input
			type="checkbox"
			class="peer"
			aria-label={$t('dashboard.services.browse.filters.toggle_skills') || 'Toggle skills'}
			aria-expanded={skillsOpen}
			onchange={() => (skillsOpen = !skillsOpen)}
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
			aria-label={$t('dashboard.services.browse.filters.toggle_location_types') ||
				'Toggle location types'}
			aria-expanded={locationTypesOpen}
			onchange={() => (locationTypesOpen = !locationTypesOpen)}
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
						checked={filters.serviceLocationTypes?.includes(
							ServiceLocationTypeEnum.TASKER_LOCATION
						)}
						onchange={() => toggleLocationType(ServiceLocationTypeEnum.TASKER_LOCATION)}
					/>
					<span class="label-text">
						{$t('dashboard.services.create.location.tasker_title') || 'At Tasker Location'}
					</span>
				</label>
				<label class="label cursor-pointer justify-start gap-3">
					<input
						type="checkbox"
						class="checkbox"
						checked={filters.serviceLocationTypes?.includes(
							ServiceLocationTypeEnum.TASKEE_LOCATION
						)}
						onchange={() => toggleLocationType(ServiceLocationTypeEnum.TASKEE_LOCATION)}
					/>
					<span class="label-text">
						{$t('dashboard.services.create.location.taskee_title') || 'At My Location'}
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
			aria-label={$t('dashboard.services.browse.filters.toggle_pricing_type') ||
				'Toggle pricing type'}
			aria-expanded={pricingTypeOpen}
			onchange={() => (pricingTypeOpen = !pricingTypeOpen)}
		/>
		<div class="collapse-title font-medium">
			{$t('dashboard.services.browse.filters.pricing_type') || 'Pricing Type'}
		</div>
		<div class="collapse-content">
			<fieldset>
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
			</fieldset>
		</div>
	</div>

	<!-- Price Range -->
	<div class="collapse-arrow collapse mb-2">
		<input
			type="checkbox"
			class="peer"
			aria-label={$t('dashboard.services.browse.filters.toggle_price_range') ||
				'Toggle price range'}
			aria-expanded={priceRangeOpen}
			onchange={() => (priceRangeOpen = !priceRangeOpen)}
		/>
		<div class="collapse-title font-medium">
			{$t('dashboard.services.browse.filters.price_range') || 'Price Range'}
		</div>
		<div class="collapse-content">
			<fieldset>
				<div class="grid grid-cols-2 gap-4">
					<div class="form-control">
						<label class="label" for="min-price">
							<span class="label-text">
								{$t('dashboard.services.browse.filters.min_price') || 'Min ($)'}
							</span>
						</label>
						<input
							id="min-price"
							type="number"
							class="input input-bordered w-full"
							class:input-error={priceError !== null}
							placeholder="0"
							min="0"
							step="1"
							bind:value={filters.minPrice}
							aria-invalid={priceError !== null}
							aria-describedby={priceError ? priceErrorId : undefined}
							oninput={(e) => {
								const value = e.currentTarget.value;
								filters.minPrice = value ? parseFloat(value) : undefined;
							}}
							onblur={() => validatePriceRange()}
						/>
						{#if priceError}
							<p id={priceErrorId} class="text-error mt-1 text-sm" data-testid="price-error">
								{priceError}
							</p>
						{/if}
					</div>
					<div class="form-control">
						<label class="label" for="max-price">
							<span class="label-text">
								{$t('dashboard.services.browse.filters.max_price') || 'Max ($)'}
							</span>
						</label>
						<input
							id="max-price"
							type="number"
							class="input input-bordered w-full"
							class:input-error={priceError !== null}
							placeholder="10000"
							min="0"
							step="1"
							bind:value={filters.maxPrice}
							oninput={(e) => {
								const value = e.currentTarget.value;
								filters.maxPrice = value ? parseFloat(value) : undefined;
							}}
							onblur={() => validatePriceRange()}
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
			</fieldset>
		</div>
	</div>

	<!-- Location -->
	<div class="collapse-arrow collapse mb-2" style="overflow: visible; z-index: 1000;">
		<input
			type="checkbox"
			class="peer"
			aria-label={$t('dashboard.services.browse.filters.toggle_location') || 'Toggle location'}
			aria-expanded={locationOpen}
			onchange={() => (locationOpen = !locationOpen)}
		/>
		<div class="collapse-title font-medium">
			{$t('dashboard.services.browse.filters.location') || 'Location'}
		</div>
		<div class="collapse-content">
			<LocationAutoComplete
				location={{
					displayName: filters.location || '',
					latitude: selectedLocationCoords?.latitude ?? 0,
					longitude: selectedLocationCoords?.longitude ?? 0,
					zipCode: '',
					locationLoaded: !!selectedLocationCoords
				}}
				onLocationSelect={handleLocationSelect}
				placeholder={$t('dashboard.services.browse.filters.location_placeholder') ||
					'Search location...'}
				showMap={false}
				searchRadius={filters.radius || 10}
			/>

			{#if filters.location}
				<div class="mt-4">
					<label class="label" for="search-radius">
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
					<div class="text-base-content/60 flex justify-between px-2 text-xs">
						<span>1 km</span>
						<span>{filters.radius || 10} km</span>
						<span>100 km</span>
					</div>
				</div>
			{/if}
		</div>
	</div>
</UnifiedFilterDrawer>
