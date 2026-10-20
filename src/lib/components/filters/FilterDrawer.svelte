<script lang="ts">
	import type { SearchTasksParams } from '$lib/types/task.d';
	import { TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import PriceRangeSlider from '$lib/components/filters/PriceRangeSlider.svelte';
	import AvailabilityFilter from '$lib/components/filters/AvailabilityFilter.svelte';
	import CategoryMultiselect from '$lib/components/CategoryMultiselect.svelte';
	import SkillsMultiselect from '$lib/components/SkillsMultiselect.svelte';
	import UnifiedFilterDrawer from '$lib/components/listing/UnifiedFilterDrawer.svelte';
	import LocationAutoComplete from '../LocationAutoComplete.svelte';
	import { t } from 'svelte-i18n';
	import { TASKS_PER_PAGE } from '$lib/stores/task.store';

	// Props
	let { isOpen, onClose, onApply, initialFilters, title } = $props<{
		isOpen: boolean;
		onClose: () => void;
		onApply: (filters: SearchTasksParams) => void;
		initialFilters?: SearchTasksParams;
		title?: string;
	}>();
	const drawerTitle = $derived(title ?? $t('find_tasks.filters'));

	// State
	const filters = $state<SearchTasksParams>({
		search: undefined,
		taskType: undefined,
		categories: [],
		skills: [],
		budget: {
			tier: undefined,
			currency: undefined,
			type: undefined
		},
		location: undefined,
		radius: 1.5, // Default radius of 1.5 km
		deadline: undefined,
		dateRange: undefined,
		page: 1,
		limit: TASKS_PER_PAGE
	});

	// Store selected location coordinates for distance calculation
	let selectedLocationCoords = $state<{ latitude: number; longitude: number } | null>(null);

	// Intermediate state for availability filter bindings (must be $state for bindable props)
	let availabilityStart = $state<string | undefined>(undefined);
	let availabilityEnd = $state<string | undefined>(undefined);
	let availabilityDeadline = $state<string | undefined>(undefined);
	let availabilityFilterMode = $state<'date_range' | 'deadline'>('deadline');

	// Track active filter count
	let activeFilterCount = $state(0);

	// Sync filters with initialFilters when they change
	$effect(() => {
		if (initialFilters) {
			// Deep merge initialFilters into filters state
			filters.taskType = initialFilters.taskType;
			filters.categories = initialFilters.categories ? [...initialFilters.categories] : [];
			filters.skills = initialFilters.skills ? [...initialFilters.skills] : [];
			filters.budget = {
				tier: initialFilters.budget?.tier,
				currency: initialFilters.budget?.currency,
				type: initialFilters.budget?.type
			};
			filters.location = initialFilters.location;
			filters.radius = initialFilters.radius ?? 1.5;
			filters.deadline = initialFilters.deadline;
			filters.dateRange = initialFilters.dateRange;
			filters.search = initialFilters.search;
			selectedLocationCoords = initialFilters.locationCoords
				? { ...initialFilters.locationCoords }
				: null;
		}
	});

	// Sync availability filter bindings from filters object (single source of truth)
	// This eliminates redundancy by syncing from filters instead of manually from initialFilters
	$effect(() => {
		if (filters.dateRange) {
			availabilityFilterMode = 'date_range';
			availabilityStart = filters.dateRange.start;
			availabilityEnd = filters.dateRange.end;
			availabilityDeadline = undefined;
		} else if (filters.deadline) {
			availabilityFilterMode = 'deadline';
			availabilityDeadline = filters.deadline;
			availabilityStart = undefined;
			availabilityEnd = undefined;
		} else {
			// Both are cleared - reset to default state
			availabilityFilterMode = 'deadline';
			availabilityStart = undefined;
			availabilityEnd = undefined;
			availabilityDeadline = undefined;
		}
	});

	$effect(() => {
		// Calculate active filter count for badge
		let count = 0;

		if (filters.taskType) count++;
		if (filters.categories && filters.categories.length > 0) count++;
		if (filters.skills && filters.skills.length > 0) count++;
		if (filters.budget?.tier) count++;
		if (filters.budget?.currency) count++;
		if (filters.budget?.type) count++;
		if (filters.location) count++;
		if (filters.dateRange) count++;
		if (filters.deadline) count++;

		activeFilterCount = count;
	});

	// Clear all filters
	function clearFilters() {
		selectedLocationCoords = null;

		onApply({
			search: '',
			taskType: undefined,
			categories: [],
			skills: [],
			budget: {
				tier: undefined,
				currency: undefined,
				type: undefined
			},
			location: undefined,
			locationCoords: undefined,
			radius: undefined,
			deadline: undefined,
			dateRange: undefined,
			page: 1,
			limit: TASKS_PER_PAGE
		});
	}

	// Apply filters
	function applyFilters() {
		// Sync availability filter values with filters object before applying
		// availabilityStart, availabilityEnd, and availabilityDeadline are derived from filters,
		// but we need to sync them back when the user changes them in AvailabilityFilter
		if (availabilityFilterMode === 'date_range') {
			// Set dateRange if both start and end are provided
			if (availabilityStart && availabilityEnd) {
				filters.dateRange = {
					start: availabilityStart,
					end: availabilityEnd
				};
				filters.deadline = undefined; // Clear deadline when using date range
			} else {
				filters.dateRange = undefined;
			}
		} else if (availabilityFilterMode === 'deadline') {
			// Set deadline if provided
			if (availabilityDeadline) {
				filters.deadline = availabilityDeadline;
				filters.dateRange = undefined; // Clear date range when using deadline
			} else {
				filters.deadline = undefined;
			}
		} else {
			// Clear both if no mode selected
			filters.deadline = undefined;
			filters.dateRange = undefined;
		}

		// Create a clean copy of filters to avoid proxy issues
		const hasLocation = Boolean(filters.location?.trim());
		const cleanFilters = {
			...filters,
			categories: [...(filters.categories || [])],
			skills: [...(filters.skills || [])],
			location: hasLocation ? filters.location : undefined,
			// A default radius without a place must not become a location filter.
			radius: hasLocation ? filters.radius : undefined,
			locationCoords: hasLocation ? selectedLocationCoords : undefined
		};
		onApply(cleanFilters);
	}

	// Handle task type change
	function handleTaskTypeChange(type: TaskTypeEnum | undefined) {
		filters.taskType = type;
	}

	// Handle price range change (kept for backwards compatibility, but bindable handles updates)
	function handlePriceRangeChange(tier: string | undefined) {
		if (filters.budget) {
			filters.budget.tier = tier;
		}
	}

	// Handle category tags change
	function handleCategoryChange(tags: string[]) {
		filters.categories = [...tags];
	}

	// Handle skills change
	function handleSkillsChange(skills: string[]) {
		filters.skills = skills;
	}
</script>

<UnifiedFilterDrawer
	{isOpen}
	title={drawerTitle}
	{onClose}
	onClear={clearFilters}
	onApply={applyFilters}
	clearLabel={$t('dashboard.contracts.clear_filters')}
	applyLabel={$t('find_tasks.apply')}
	{activeFilterCount}
	actionsClass="mt-8 mb-20 flex justify-between"
>
	<!-- Categories -->
	<div class="mb-4">
		<CategoryMultiselect
			bind:externalCategoryIds={filters.categories}
			onChange={handleCategoryChange}
			maxSelections={5}
			placeholder={$t('find_tasks.add_categories')}
			className="w-full"
		/>
	</div>

	<!-- Task Type -->
	<div class="collapse-arrow collapse mb-2">
		<input
			type="checkbox"
			class="peer"
			defaultChecked
			aria-label={$t('find_tasks.toggle_task_type_section')}
			aria-describedby="task-type-section"
		/>
		<div class="collapse-title font-medium" id="task-type-section">
			{$t('find_tasks.task_type')}
		</div>
		<div class="collapse-content">
			<div class="flex flex-wrap gap-2">
				<button
					class="btn btn-sm"
					class:btn-primary={filters.taskType === TaskTypeEnum.IN_PERSON}
					onclick={() => handleTaskTypeChange(TaskTypeEnum.IN_PERSON)}
				>
					{$t('find_tasks.in_person')}
				</button>
				<button
					class="btn btn-sm"
					class:btn-primary={filters.taskType === TaskTypeEnum.REMOTE}
					onclick={() => handleTaskTypeChange(TaskTypeEnum.REMOTE)}
				>
					{$t('find_tasks.remote')}
				</button>
				<button
					class="btn btn-sm"
					class:btn-primary={filters.taskType === undefined}
					onclick={() => handleTaskTypeChange(undefined)}
				>
					{$t('find_tasks.any')}
				</button>
			</div>
		</div>
	</div>

	<!-- Budget Range -->
	<div class="collapse-arrow collapse mb-2">
		<input
			type="checkbox"
			class="peer"
			defaultChecked
			aria-label={$t('find_tasks.toggle_budget_range_section')}
			aria-describedby="budget-range-section"
		/>
		<div class="collapse-title font-medium" id="budget-range-section">
			{$t('find_tasks.budget_range')}
		</div>
		<div class="collapse-content">
			<PriceRangeSlider
				onRangeChange={handlePriceRangeChange}
				currency={filters.budget?.currency || 'USD'}
				tier={filters.budget?.tier}
			/>

			<!-- 	<div class="mt-8">
				<label class="font-medium" for="budget-type">{$t('find_tasks.budget_type')}</label>
				<div class="mt-4 flex flex-wrap gap-2">
					{#each Object.values(BudgetTypeEnum) as type}
						<button
							class="btn btn-sm"
							class:btn-primary={filters.budget?.type === type}
							onclick={() => handleBudgetTypeChange(type)}
						>
							{#if type === BudgetTypeEnum.FIXED}
								{$t('find_tasks.budget_type_values.fixed')}
							{:else if type === BudgetTypeEnum.HOURLY}
								{$t('find_tasks.budget_type_values.hourly')}
							{:else}
								{type}
							{/if}
						</button>
					{/each}
					<button
						class="btn btn-sm"
						class:btn-primary={filters.budget?.type === undefined}
						onclick={() => handleBudgetTypeChange(undefined)}
					>
						{$t('find_tasks.any')}
					</button>
				</div>
			</div> -->
		</div>
	</div>

	<!-- Location -->
	<div class="collapse-arrow collapse mb-2">
		<input
			type="checkbox"
			class="peer"
			aria-label={$t('find_tasks.toggle_location_section')}
			aria-describedby="location-section"
		/>
		<div class="collapse-title font-medium" id="location-section">
			{$t('find_tasks.location')}
		</div>
		<div class="collapse-content">
			<LocationAutoComplete
				placeholder={$t('find_tasks.location_placeholder')}
				location={{
					displayName: filters.location || '',
					longitude: selectedLocationCoords?.longitude ?? 0,
					latitude: selectedLocationCoords?.latitude ?? 0,
					zipCode: '',
					locationLoaded: !!selectedLocationCoords
				}}
				onLocationSelect={(location) => {
					filters.location = location.displayName;
					if (!filters.radius) filters.radius = 1.5;
					selectedLocationCoords = {
						latitude: location.latitude ?? 0,
						longitude: location.longitude ?? 0
					};
				}}
				showMap={false}
				searchRadius={filters.radius || 1.5}
			/>

			<!-- Radio de búsqueda -->
			{#if filters.location}
				<div class="mt-4">
					<label class="label" for="search-radius">
						<span class="label-text font-medium">{$t('find_tasks.search_radius')}</span>
						<span class="label-text-alt">{filters.radius || 1.5} km</span>
					</label>
					<input
						id="search-radius"
						type="range"
						min="0.5"
						max="10"
						step="0.5"
						class="range range-primary w-full"
						bind:value={filters.radius}
						oninput={() => {
							// Asegurar que siempre tengamos un valor por defecto
							if (!filters.radius) filters.radius = 1.5;
						}}
					/>
					<div class="text-base-content/60 mt-1 flex justify-between text-xs">
						<span>0.5 km</span>
						<span>5 km</span>
						<span>10 km</span>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Availability -->
	<div class="collapse-arrow collapse mb-2">
		<input
			type="checkbox"
			class="peer"
			aria-label={$t('find_tasks.toggle_availability_section')}
			aria-describedby="availability-section"
		/>
		<div class="collapse-title font-medium" id="availability-section">
			{$t('find_tasks.availability')}
		</div>
		<div class="collapse-content">
			<AvailabilityFilter
				bind:start={availabilityStart}
				bind:end={availabilityEnd}
				bind:deadlineDate={availabilityDeadline}
				bind:filterMode={availabilityFilterMode}
			/>
		</div>
	</div>

	<!-- Skills -->
	<div class="collapse-arrow collapse mb-2">
		<input
			type="checkbox"
			class="peer"
			aria-label={$t('find_tasks.toggle_skills_section')}
			aria-describedby="skills-section"
		/>
		<div class="collapse-title font-medium" id="skills-section">{$t('find_tasks.skills')}</div>
		<div class="collapse-content">
			<SkillsMultiselect
				bind:selectedSkills={filters.skills}
				onChange={handleSkillsChange}
				maxSelections={10}
				placeholder={$t('find_tasks.add_skills')}
				className="w-full"
			/>
		</div>
	</div>
</UnifiedFilterDrawer>
