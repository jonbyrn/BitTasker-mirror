<!-- 
  FilterDrawer.svelte
  Main filter drawer component that organizes all filtering options
  for task discovery
-->
<script lang="ts">
	import type { SearchTasksParams } from '$lib/types/task.d';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';
	import {
		BudgetTypeEnum,
		TaskTypeEnum,
		TaskStatusEnum
	} from '$lib/utils/enums/task.enum';
	import PriceRangeSlider from '$lib/components/filters/PriceRangeSlider.svelte';
	import AvailabilityFilter from '$lib/components/filters/AvailabilityFilter.svelte';
	import CategoryMultiselect from '$lib/components/CategoryMultiselect.svelte';
	import SkillsMultiselect from '$lib/components/SkillsMultiselect.svelte';
	import LocationAutoComplete from '../LocationAutoComplete.svelte';
    import { t } from 'svelte-i18n';

	// Props
	let { isOpen, onClose, onApply } = $props<{
		isOpen: boolean;
		onClose: () => void;
		onApply: (filters: SearchTasksParams) => void;
	}>();

	// State
	const filters = $state<SearchTasksParams>({
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
		radius: undefined,
		deadline: undefined,
		dateRange: undefined,
		page: 1,
		limit: 10
	});

	// Track active filter count
	let activeFilterCount = $state(0);

	$effect(() => {
		// Calculate active filter count for badge
		let count = 0;

		if (filters.search) count++;
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
		filters.search = '';
		filters.taskType = undefined;
		filters.categories = [];
		filters.skills = [];
		filters.budget = {
			currency: undefined,
			type: undefined,
			tier: undefined
		};
		filters.location = undefined;
		filters.radius = undefined;
		filters.deadline = undefined;
		filters.dateRange = undefined;
	}

	// Apply filters and close drawer
	function applyFilters() {
		onApply({ ...filters });
		onClose();
	}

	// Handle task type change
	function handleTaskTypeChange(type: TaskTypeEnum | undefined) {
		filters.taskType = type;
	}

	// Handle status selection
	function handleStatusChange(status: TaskStatusEnum) {
		if (filters.status?.includes(status)) {
			filters.status = filters.status.filter((s) => s !== status);
		} else {
			filters.status = [...(filters.status || []), status];
		}
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
		filters.categories = tags.map((tag) => tag.toLowerCase());
	}

	// Handle skills change
	function handleSkillsChange(skills: string[]) {
		filters.skills = skills;
	}

	// Handle location filter changes
	function handleLocationChange(location: string | undefined, radius: number | undefined) {
		filters.location = location;
		filters.radius = radius;
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
    <div class="bg-base-200 sticky top-0 z-10 flex items-center justify-between border-b p-4">
        <h2 id="drawer-title" class="text-xl font-bold">{$t('find_tasks.filters')}</h2>
        <button class="btn btn-ghost btn-circle" onclick={onClose} aria-label={$t('find_tasks.close_dialog')}>
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
	<div class="px-2 py-4 sm:p-8">
		<!-- Search term -->
        <div class="form-control mb-4">
            <label class="label font-medium" for="search-term">{$t('find_tasks.search_term')}</label>
			<input
				type="text"
                placeholder={$t('find_tasks.search_placeholder')}
				class="input input-bordered w-full"
				bind:value={filters.search}
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
            <div class="collapse-title font-medium" id="task-type-section">{$t('find_tasks.task_type')}</div>
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

		<!-- Task Status -->
		<!-- <div class="collapse-arrow collapse mb-2">
			<input type="checkbox" class="peer" />
			<div class="collapse-title font-medium">Status</div>
			<div class="collapse-content">
				<div class="flex flex-wrap gap-2">
					{#each Object.values(TaskStatusEnum) as status}
						<button
							class="btn btn-sm"
							class:btn-primary={filters.status?.includes(status)}
							onclick={() => handleStatusChange(status)}
						>
							{status.replace('_', ' ')}
						</button>
					{/each}
				</div>
			</div>
		</div> -->

		<!-- Budget Range -->
        <div class="collapse-arrow collapse mb-2">
			<input 
				type="checkbox" 
				class="peer" 
				defaultChecked 
                aria-label={$t('find_tasks.toggle_budget_range_section')}
				aria-describedby="budget-range-section"
			/>
            <div class="collapse-title font-medium" id="budget-range-section">{$t('find_tasks.budget_range')}</div>
			<div class="collapse-content">
				<PriceRangeSlider
					onRangeChange={handlePriceRangeChange}
					bind:currency={filters.budget!.currency}
				/>

				<div class="mt-4">
                    <label class="label font-medium" for="budget-type">{$t('find_tasks.budget_type')}</label>
					<div class="flex flex-wrap gap-2">
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
            <div class="collapse-title font-medium" id="location-section">{$t('find_tasks.location')}</div>
			<div class="collapse-content">
				<LocationAutoComplete
                    placeholder={$t('find_tasks.location_placeholder')}
					location={{
						displayName: filters.location || '',
						longitude: 0,
						latitude: 0,
						zipCode: '',
						locationLoaded: false
					}}
					onLocationSelect={(location) => (filters.location = location.displayName)}
					showMap={false}
				/>
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
            <div class="collapse-title font-medium" id="availability-section">{$t('find_tasks.availability')}</div>
			<div class="collapse-content">
				<AvailabilityFilter onAvailabilityChange={handleAvailabilityChange} />
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
            <div class="collapse-title font-medium" id="categories-section">{$t('find_tasks.categories')}</div>
			<div class="collapse-content">
				<CategoryMultiselect
					bind:selectedCategories={filters.categories}
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
					maxSelections={10}
					placeholder={$t('find_tasks.add_skills')}
					className="w-full"
				/>
			</div>
		</div>

		<!-- Filter Actions -->
		<div class="divider"></div>
        <div class="mt-8 mb-20 flex justify-between">
            <button class="btn btn-ghost btn-outline" onclick={clearFilters}> {$t('find_tasks.clear_filters')} </button>
            <button class="btn btn-primary" onclick={applyFilters}>
                {$t('find_tasks.apply')}
				{#if activeFilterCount > 0}
					<div class="badge badge-secondary ml-2">{activeFilterCount}</div>
				{/if}
			</button>
		</div>
	</div>
</div>
