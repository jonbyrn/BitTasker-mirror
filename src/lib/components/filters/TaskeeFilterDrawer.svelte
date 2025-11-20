<script lang="ts">
	import type { SearchTaskeesParams } from '$lib/nostr/findTaskees';
	import SkillsMultiselect from '$lib/components/SkillsMultiselect.svelte';
	import LocationAutoComplete from '../LocationAutoComplete.svelte';
	import { t } from 'svelte-i18n';

	// Props
	let { isOpen, onClose, onApply, initialFilters } = $props<{
		isOpen: boolean;
		onClose: () => void;
		onApply: (filters: SearchTaskeesParams) => void;
		initialFilters?: SearchTaskeesParams;
	}>();

	// State
	const filters = $state<SearchTaskeesParams>({
		search: undefined,
		skills: [],
		professionalTitle: undefined,
		location: undefined,
		radius: 10, // Default radius in km
		minRating: undefined,
		page: 1,
		limit: 20
	});

	// Location mode: 'anywhere' or 'specific'
	let locationMode = $state<'anywhere' | 'specific'>('anywhere');

	// Store selected location coordinates for distance calculation
	let selectedLocationCoords = $state<{ latitude: number; longitude: number } | null>(null);

	// Sync with initial filters when drawer opens
	$effect(() => {
		if (isOpen && initialFilters) {
			// Deep copy to avoid reference issues
			filters.search = initialFilters.search;
			filters.skills = initialFilters.skills ? [...initialFilters.skills] : [];
			filters.professionalTitle = initialFilters.professionalTitle;
			filters.location = initialFilters.location;
			filters.radius = initialFilters.radius || 10;
			filters.minRating = initialFilters.minRating;
			
			// Set location mode based on whether location is set
			locationMode = initialFilters.location ? 'specific' : 'anywhere';
		}
	});

	// Track active filter count
	let activeFilterCount = $state(0);

	$effect(() => {
		// Calculate active filter count for badge
		let count = 0;

		if (filters.skills && filters.skills.length > 0) count++;
		if (filters.professionalTitle) count++;
		if (filters.location && locationMode === 'specific') count++;
		if (filters.minRating) count++;

		activeFilterCount = count;
	});

	// Scroll lock management
	const disableBodyScroll = () => {
		document.body.classList.add('overflow-hidden');
	};

	const enableBodyScroll = () => {
		document.body.classList.remove('overflow-hidden');
	};

	// Handle drawer state changes, including scroll locking
	$effect(() => {
		if (isOpen) {
			// Lock scroll when drawer is open
			disableBodyScroll();
		} else {
			// Restore scrolling when drawer is closed
			enableBodyScroll();
		}

		// Handle cleanup when component is unmounted
		return enableBodyScroll;
	});

	// Clear all filters
	function clearFilters() {
		filters.search = undefined;
		filters.skills = [];
		filters.professionalTitle = undefined;
		filters.location = undefined;
		filters.radius = 10;
		filters.minRating = undefined;
		locationMode = 'anywhere';
		selectedLocationCoords = null;
		
		// Apply cleared filters immediately
		const cleanFilters = {
			...filters,
			skills: [],
			location: undefined,
			radius: undefined
		};
		onApply(cleanFilters);
	}

	// Apply filters and close drawer
	function applyFilters() {
		// Create a clean copy of filters to avoid proxy issues
		const cleanFilters: SearchTaskeesParams = {
			...filters,
			skills: [...(filters.skills || [])],
			// Only include location and radius if specific location is selected
			location: locationMode === 'specific' ? filters.location : undefined,
			radius: locationMode === 'specific' ? filters.radius : undefined
		};
		console.log('🔧 TaskeeFilterDrawer: Applying filters:', cleanFilters);
		onApply(cleanFilters);
		onClose();
	}

	// Handle skills change
	function handleSkillsChange(skills: string[]) {
		filters.skills = skills;
	}

	// Handle professional title change
	function handleProfessionalTitleChange(title: string) {
		filters.professionalTitle = title.trim() || undefined;
	}

	// Handle location mode change
	function handleLocationModeChange(mode: 'anywhere' | 'specific') {
		locationMode = mode;
		if (mode === 'anywhere') {
			filters.location = undefined;
			filters.radius = undefined;
			selectedLocationCoords = null;
		} else if (mode === 'specific') {
			// Set default radius to 10km when switching to specific location
			if (!filters.radius) {
				filters.radius = 10;
			}
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
		<h3 id="drawer-title" class="text-xl font-bold">{$t('find_taskees.filters')}</h3>
		<button
			class="btn btn-ghost btn-circle"
			onclick={onClose}
			aria-label={$t('find_taskees.close_dialog')}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6"
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
		</button>
	</div>
	<div class="px-2">
		<!-- Location -->
		<div class="collapse-arrow collapse mb-2" style="overflow: visible; z-index: 1000;">
			<input
				type="checkbox"
				class="peer"
				aria-label={$t('find_taskees.toggle_location_section')}
				aria-describedby="location-section"
			/>
			<div class="collapse-title font-medium" id="location-section">
				{$t('find_taskees.location')}
			</div>
			<div class="collapse-content">
				<!-- Location Mode Buttons -->
				<div class="mb-4">
					<div class="flex flex-wrap gap-2">
						<button
							class="btn btn-sm"
							class:btn-primary={locationMode === 'anywhere'}
							onclick={() => handleLocationModeChange('anywhere')}
						>
							{$t('find_taskees.location_mode.anywhere')}
						</button>
						<button
							class="btn btn-sm"
							class:btn-primary={locationMode === 'specific'}
							onclick={() => handleLocationModeChange('specific')}
						>
							{$t('find_taskees.location_mode.specific_location')}
						</button>
					</div>
				</div>

				<!-- Search Radius and Location Input (shown only when specific location is selected) -->
				{#if locationMode === 'specific'}
					<!-- Search Radius -->
					<div class="mb-4">
						<label class="label" for="search-radius">
							<span class="label-text font-medium">{$t('find_taskees.search_radius')}</span>
							<span class="label-text-alt">{filters.radius || 10} km</span>
						</label>
						<input
							id="search-radius"
							type="range"
							min="1"
							max="100"
							step="1"
							class="range range-primary w-full"
							value={filters.radius || 10}
							oninput={(e) => {
								filters.radius = Number(e.currentTarget.value) || 10;
							}}
						/>
						<div class="flex justify-between text-xs text-base-content/60 mt-1">
							<span>1 km</span>
							<span>50 km</span>
							<span>100 km</span>
						</div>
					</div>

					<!-- Location Input -->
					<LocationAutoComplete
						placeholder={$t('find_taskees.location_placeholder')}
						location={{
							displayName: filters.location || '',
							longitude: selectedLocationCoords?.longitude || 0,
							latitude: selectedLocationCoords?.latitude || 0,
							zipCode: '',
							locationLoaded: !!selectedLocationCoords
						}}
						onLocationSelect={(location) => {
							filters.location = location.displayName;
							selectedLocationCoords = {
								latitude: location.latitude || 0,
								longitude: location.longitude || 0
							};
						}}
						showMap={false}
						searchRadius={filters.radius || 10}
					/>
				{/if}
			</div>
		</div>

		<!-- Skills -->
		<div class="collapse-arrow collapse mb-2">
			<input
				type="checkbox"
				class="peer"
				defaultChecked
				aria-label={$t('find_taskees.toggle_skills_section')}
				aria-describedby="skills-section"
			/>
			<div class="collapse-title font-medium" id="skills-section">{$t('find_taskees.skills')}</div>
			<div class="collapse-content">
				<SkillsMultiselect
					bind:selectedSkills={filters.skills}
					onChange={handleSkillsChange}
					maxSelections={10}
					placeholder={$t('find_taskees.add_skills')}
					className="w-full"
				/>
			</div>
		</div>

		<!-- Professional Title -->
		<div class="collapse-arrow collapse mb-2">
			<input
				type="checkbox"
				class="peer"
				aria-label={$t('find_taskees.toggle_professional_title_section')}
				aria-describedby="professional-title-section"
			/>
			<div class="collapse-title font-medium" id="professional-title-section">
				{$t('find_taskees.professional_title')}
			</div>
			<div class="collapse-content">
				<input
					type="text"
					class="input input-bordered w-full"
					placeholder={$t('find_taskees.professional_title_placeholder')}
					bind:value={filters.professionalTitle}
					oninput={(e) => handleProfessionalTitleChange(e.currentTarget.value)}
				/>
			</div>
		</div>

		<!-- Filter Actions -->
		<div class="divider"></div>
		<div class="mt-8 mb-20 flex justify-between mx-4">
			<button class="btn btn-ghost btn-outline" onclick={clearFilters}>
				{$t('find_taskees.clear_filters')}
			</button>
			<button class="btn btn-primary" onclick={applyFilters}>
				{$t('find_taskees.apply')}
				{#if activeFilterCount > 0}
					<div class="badge badge-secondary ml-2">{activeFilterCount}</div>
				{/if}
			</button>
		</div>
	</div>
</div>

