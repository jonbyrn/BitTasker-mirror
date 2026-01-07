<script lang="ts">
	import type { SearchTaskeesParams } from '$lib/nostr/findTaskees';
	import SkillsMultiselect from '$lib/components/SkillsMultiselect.svelte';
	import LocationAutoComplete from '../LocationAutoComplete.svelte';
	import { t } from 'svelte-i18n';

	// Helper to safely get translations with fallback
	function safeTranslate(key: string, fallback: string): string {
		try {
			const translated = $t(key);
			// svelte-i18n returns the key itself if translation is missing
			// Also check if it's empty or just whitespace
			if (!translated || translated === key || translated.trim() === '' || translated.startsWith('find_taskees.')) {
				return fallback;
			}
			return translated;
		} catch (error) {
			console.warn(`Translation error for key "${key}":`, error);
			return fallback;
		}
	}

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
		location: undefined,
		radius: 10, // Default radius in km
		minRating: undefined,
		page: 1,
		limit: 20
	});

	// Location mode: 'anywhere' or 'specific'
	let locationMode = $state<'anywhere' | 'specific'>('specific');

	// Store selected location coordinates for distance calculation
	let selectedLocationCoords = $state<{ latitude: number; longitude: number } | null>(null);

	// Sync with initial filters when drawer opens
	$effect(() => {
		if (isOpen && initialFilters) {
			// Deep copy to avoid reference issues
			filters.search = initialFilters.search;
			filters.skills = initialFilters.skills ? [...initialFilters.skills] : [];
			filters.location = initialFilters.location;
			filters.radius = initialFilters.radius || 10;
			filters.minRating = initialFilters.minRating;
			
			// Set location mode based on whether location is set, default to 'specific'
			locationMode = initialFilters.location ? 'specific' : 'specific';
		}
	});

	// Track active filter count
	let activeFilterCount = $state(0);

	$effect(() => {
		// Calculate active filter count for badge
		let count = 0;

		if (filters.skills && filters.skills.length > 0) count++;
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
		filters.location = undefined;
		filters.radius = 10;
		filters.minRating = undefined;
		locationMode = 'specific';
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
		<h3 id="drawer-title" class="text-xl font-bold">{safeTranslate('find_taskees.filters.title', 'Filters')}</h3>
		<button
			class="btn btn-ghost btn-circle"
			onclick={onClose}
			aria-label={safeTranslate('find_taskees.filters.close_dialog', 'Close dialog')}
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
	<div class="px-4 pb-4">
		<!-- Location -->
		<div class="mb-6">
			<h4 class="mb-3 text-sm font-semibold text-base-content/90">
				{safeTranslate('find_taskees.filters.location.label', 'Location')}
			</h4>
			<!-- Location Mode Buttons -->
			<div class="mb-4">
				<div class="flex flex-wrap gap-2">
					<button
						class="btn btn-sm rounded-full"
						class:btn-primary={locationMode === 'anywhere'}
						class:btn-outline={locationMode !== 'anywhere'}
						onclick={() => handleLocationModeChange('anywhere')}
					>
						{safeTranslate('find_taskees.filters.location.mode.anywhere', 'Anywhere')}
					</button>
					<button
						class="btn btn-sm rounded-full"
						class:btn-primary={locationMode === 'specific'}
						class:btn-outline={locationMode !== 'specific'}
						onclick={() => handleLocationModeChange('specific')}
					>
						{safeTranslate('find_taskees.filters.location.mode.specific_location', 'Specific Location')}
					</button>
				</div>
			</div>

			<!-- Search Radius and Location Input (shown only when specific location is selected) -->
			{#if locationMode === 'specific'}
				<!-- Search Radius -->
				<div class="mb-4">
					<label class="label" for="search-radius">
						<span class="label-text text-sm font-medium">{safeTranslate('find_taskees.filters.location.search_radius', 'Search Radius')}</span>
						<span class="label-text-alt text-xs">{filters.radius || 10} {safeTranslate('find_taskees.filters.location.radius_unit', 'km')}</span>
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
					placeholder={safeTranslate('find_taskees.filters.location.placeholder', 'Enter location...')}
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

		<!-- Skills -->
		<div class="mb-6">
			<h4 class="mb-3 text-sm font-semibold text-base-content/90">
				{safeTranslate('find_taskees.filters.skills.label', 'Skills')}
			</h4>
			<SkillsMultiselect
				bind:selectedSkills={filters.skills}
				onChange={handleSkillsChange}
				maxSelections={10}
				placeholder={safeTranslate('find_taskees.filters.skills.placeholder', 'Select skills...')}
				className="w-full"
			/>
		</div>

		<!-- Filter Actions -->
		<div class="divider"></div>
		<div class="mt-8 mb-20 flex justify-between">
			<button class="btn btn-ghost btn-outline" onclick={clearFilters}>
				{safeTranslate('find_taskees.filters.clear', 'Clear Filters')}
			</button>
			<button class="btn btn-primary" onclick={applyFilters}>
				{safeTranslate('find_taskees.filters.apply', 'Apply')}
				{#if activeFilterCount > 0}
					<div class="badge badge-secondary ml-2">{activeFilterCount}</div>
				{/if}
			</button>
		</div>
	</div>
</div>

