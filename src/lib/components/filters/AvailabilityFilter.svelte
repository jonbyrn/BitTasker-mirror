<!-- 
  AvailabilityFilter.svelte
  Component for time-based task filtering including date range
  and time of day preferences
-->
<script lang="ts">
	import { t } from 'svelte-i18n';
	import DateInput from '$lib/components/date/DateInput.svelte';

	// Props
	let { 
		onAvailabilityChange = () => {},
		initialDateRange,
		initialDeadline
	} = $props<{
		onAvailabilityChange?: (
			filterMode: 'date_range' | 'deadline',
			start: string,
			end: string
		) => void;
		initialDateRange?: { start: string; end: string } | undefined;
		initialDeadline?: string | undefined;
	}>();

	// State
	let dateRange = $state<{ start: Date | null; end: Date | null }>({
		start: null,
		end: null
	});
	let deadline = $state<Date | null>(null);

	let timePreferences = $state<string[]>([]);
	const timeOptions = $state([
		{ value: 'morning', label: 'Morning (6am-12pm)' },
		{ value: 'midday', label: 'Midday (12pm-3pm)' },
		{ value: 'afternoon', label: 'Afternoon (3pm-6pm)' },
		{ value: 'evening', label: 'Evening (6pm-10pm)' }
	]);

	// Deadline filter modes - determine initial mode based on what's provided
	let filterMode = $state<'date_range' | 'deadline'>(
		initialDateRange ? 'date_range' : (initialDeadline ? 'deadline' : 'deadline')
	);

	// Track if component is initialized to avoid calling onAvailabilityChange during init
	let isInitialized = $state(false);

	// Initialize from props - only run once on mount
	$effect(() => {
		if (isInitialized) return;
		
		if (initialDateRange) {
			filterMode = 'date_range';
			dateRange.start = initialDateRange.start ? new Date(initialDateRange.start) : null;
			dateRange.end = initialDateRange.end ? new Date(initialDateRange.end) : null;
		} else if (initialDeadline) {
			filterMode = 'deadline';
			deadline = new Date(initialDeadline);
		}
		
		// Mark as initialized after a tick to allow DOM to settle
		setTimeout(() => {
			isInitialized = true;
		}, 0);
	});

	// Toggle time preference
	function toggleTimePreference(value: string) {
		if (timePreferences.includes(value)) {
			timePreferences = timePreferences.filter((item) => item !== value);
		} else {
			timePreferences = [...timePreferences, value];
		}
	}

	// Clear availability filters
	function clearAvailability() {
		dateRange.start = null;
		dateRange.end = null;
		deadline = null;
		timePreferences = [];
		// Apply changes after clearing
		if (isInitialized) {
			applyChanges();
		}
	}

	// Apply availability filter changes
	function applyChanges() {
		if (!isInitialized) return;
		
		if (filterMode === 'date_range') {
			const startStr = dateRange.start ? dateRange.start.toISOString().split('T')[0] : '';
			const endStr = dateRange.end ? dateRange.end.toISOString().split('T')[0] : '';
			onAvailabilityChange('date_range', startStr, endStr);
		} else if (filterMode === 'deadline') {
			const deadlineStr = deadline ? deadline.toISOString().split('T')[0] : '';
			onAvailabilityChange('deadline', deadlineStr, '');
		}
	}

	// Handle date changes explicitly to avoid infinite loops
	function handleStartDateChange(date: Date | null) {
		dateRange.start = date;
		if (isInitialized) {
			applyChanges();
		}
	}

	function handleEndDateChange(date: Date | null) {
		dateRange.end = date;
		if (isInitialized) {
			applyChanges();
		}
	}

	function handleDeadlineChange(date: Date | null) {
		deadline = date;
		if (isInitialized) {
			applyChanges();
		}
	}
</script>

<div class="space-y-4">
	<!-- Filter Type Selection -->
	<div class="flex items-center justify-between gap-2">
		<label class="label" for="filter-type">
			<span class="label-text font-medium">{$t('dashboard.bids.components.filters.availability.filter_type')}</span>
		</label>
		<div class="flex flex-wrap gap-2">
			<button
				class="btn btn-sm"
				class:btn-primary={filterMode === 'date_range'}
				onclick={() => {
					filterMode = 'date_range';
					// Clear deadline when switching to date range
					deadline = null;
					if (isInitialized) {
						applyChanges();
					}
				}}
			>
				{$t('dashboard.bids.components.filters.availability.date_range')}
			</button>
			<button
				class="btn btn-sm"
				class:btn-primary={filterMode === 'deadline'}
				onclick={() => {
					filterMode = 'deadline';
					// Clear date range when switching to deadline
					dateRange.start = null;
					dateRange.end = null;
					if (isInitialized) {
						applyChanges();
					}
				}}
			>
				{$t('dashboard.bids.components.filters.availability.deadline')}
			</button>
		</div>
	</div>

	{#if filterMode === 'date_range'}
		<!-- Date Range -->
		<div>
			<label class="label" for="date-range">
				<span class="label-text font-medium">{$t('dashboard.bids.components.filters.availability.date_range')}</span>
			</label>
			<div class="grid grid-cols-2 gap-2">
				<DateInput
					bind:value={dateRange.start}
					type="single"
					labelKey="dashboard.bids.components.filters.availability.airdatepicker.select_start_date"
					placeholderKey="dashboard.bids.components.filters.availability.airdatepicker.select_start_date"
					minDate={new Date()}
					maxDate={undefined}
					onChange={handleStartDateChange}
				/>
				<DateInput
					bind:value={dateRange.end}
					type="single"
					labelKey="dashboard.bids.components.filters.availability.airdatepicker.select_end_date"
					placeholderKey="dashboard.bids.components.filters.availability.airdatepicker.select_end_date"
					minDate={dateRange.start || new Date()}
					maxDate={undefined}
					onChange={handleEndDateChange}
				/>
			</div>
		</div>
	{/if}

	<!-- Time Preferences -->
	<!-- <div>
		<label class="label" for="time-preferences">
			<span class="label-text font-medium">Time Preferences</span>
		</label>
		<div class="flex flex-wrap gap-2">
			{#each timeOptions as option}
				<button
					class="btn btn-sm"
					class:btn-primary={timePreferences.includes(option.value)}
					onclick={() => toggleTimePreference(option.value)}
				>
					{option.label}
				</button>
			{/each}
		</div>
	</div> -->

	{#if filterMode === 'deadline'}
		<!-- Deadline Before -->
		<div>
			<DateInput
				bind:value={deadline}
				type="single"
				labelKey="dashboard.bids.components.filters.availability.airdatepicker.select_date"
				placeholderKey="dashboard.bids.components.filters.availability.airdatepicker.select_date"
				minDate={new Date()}
				maxDate={undefined}
				onChange={handleDeadlineChange}
			/>
		</div>
	{/if}

	<!-- Clear button -->
	<div>
		<button class="btn btn-sm btn-ghost" onclick={clearAvailability}>
			{$t('dashboard.bids.components.filters.availability.clear_availability_filters')}
		</button>
	</div>
</div>
