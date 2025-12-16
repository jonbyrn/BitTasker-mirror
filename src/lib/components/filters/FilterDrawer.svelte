<script lang="ts">
	import type { SearchTasksParams } from '$lib/types/task.d';
	import { BudgetTypeEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import PriceRangeSlider from '$lib/components/filters/PriceRangeSlider.svelte';
	import AvailabilityFilter from '$lib/components/filters/AvailabilityFilter.svelte';
	import CategoryMultiselect from '$lib/components/CategoryMultiselect.svelte';
	import SkillsMultiselect from '$lib/components/SkillsMultiselect.svelte';
	import LocationAutoComplete from '../LocationAutoComplete.svelte';
	import { t } from 'svelte-i18n';

	const TASKS_PER_PAGE = 15;

	// Props
	let { onApply, initialFilters } = $props<{
		onApply: (filters: SearchTasksParams) => void;
		initialFilters?: SearchTasksParams;
	}>();

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

	// Sync with initial filters when they change
	$effect(() => {
		if (initialFilters) {
			filters.search = initialFilters.search;
			filters.taskType = initialFilters.taskType;
			filters.categories = initialFilters.categories ? [...initialFilters.categories] : [];
			filters.skills = initialFilters.skills ? [...initialFilters.skills] : [];
			filters.budget = {
				tier: initialFilters.budget?.tier,
				currency: initialFilters.budget?.currency,
				type: initialFilters.budget?.type
			};
			filters.location = initialFilters.location;
			filters.radius = initialFilters.radius;
			filters.deadline = initialFilters.deadline;
			filters.dateRange = initialFilters.dateRange;
		}
	});

	// Track active filter count
	let activeFilterCount = $state(0);

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
		if (filters.radius) count++;
		if (filters.dateRange) count++;
		if (filters.deadline) count++;

		activeFilterCount = count;
	});

	// Clear all filters
	function clearFilters() {

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
			radius: 1.5,
			deadline: undefined,
			dateRange: undefined,
			page: 1,
			limit: TASKS_PER_PAGE
		});
	}

	// Apply filters
	function applyFilters() {
		// Create a clean copy of filters to avoid proxy issues
		const cleanFilters = {
			...filters,
			categories: [...(filters.categories || [])],
			skills: [...(filters.skills || [])],
			// Include location coordinates for distance calculation
			locationCoords: selectedLocationCoords
		};
		onApply(cleanFilters);
	}

	// Handle task type change
	function handleTaskTypeChange(type: TaskTypeEnum | undefined) {
		filters.taskType = type;
	}

	// Handle availability change
	function handleAvailabilityChange(
		filterMode: 'date_range' | 'deadline',
		start: string,
		end: string
	) {
		if (filterMode === 'date_range') {
			filters.dateRange = { start, end };
		}
		if (filterMode === 'deadline') {
			filters.deadline = start;
		}
	}

	// Handle price range change
	function handlePriceRangeChange(tier: string) {
		filters.budget && (filters.budget.tier = tier);
	}

	// Handle budget type change
	function handleBudgetTypeChange(type: BudgetTypeEnum | undefined) {
		filters.budget && (filters.budget.type = type);
	}

	// Handle category tags change
	function handleCategoryChange(tags: string[]) {
		// Tags now contain category IDs directly
		filters.categories = [...tags]; // Create a new array to avoid proxy issues
	}

	// Handle skills change
	function handleSkillsChange(skills: string[]) {
		filters.skills = skills;
	}
</script>

<div class="px-2">
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
				currency={filters.budget?.currency}
				initialTier={filters.budget?.tier}
			/>

			<div class="mt-8">
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
			</div>
		</div>
	</div>

	<!-- Location -->
	<div class="collapse-arrow collapse mb-2" style="overflow: visible; z-index: 1000;">
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
				onAvailabilityChange={handleAvailabilityChange}
				initialDateRange={filters.dateRange}
				initialDeadline={filters.deadline}
			/>
		</div>
	</div>

	<!-- Categories -->
	<div class="collapse-arrow collapse z-50 mb-2" style="overflow: visible;">
		<input
			type="checkbox"
			class="peer"
			aria-label={$t('find_tasks.toggle_categories_section')}
			aria-describedby="categories-section"
		/>
		<div class="collapse-title font-medium" id="categories-section">
			{$t('find_tasks.categories')}
		</div>
		<div class="collapse-content">
			<CategoryMultiselect
				bind:externalCategoryIds={filters.categories}
				onChange={handleCategoryChange}
				maxSelections={5}
				placeholder={$t('find_tasks.add_categories')}
				className="w-full"
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

	<!-- Filter Actions -->
	<div class="divider"></div>
	<div class="mt-8 mb-20 flex justify-between">
		<button class="btn btn-ghost btn-outline" onclick={clearFilters}>
			{$t('find_tasks.clear_filters')}
		</button>
		<button class="btn btn-primary" onclick={applyFilters}>
			{$t('find_tasks.apply')}
			{#if activeFilterCount > 0}
				<div class="badge badge-secondary ml-2">{activeFilterCount}</div>
			{/if}
		</button>
	</div>
</div>
