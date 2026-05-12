<!-- 
  AvailabilityFilter.svelte
  Component for time-based task filtering including date range
  and time of day preferences
-->
<script lang="ts">
	import { t } from 'svelte-i18n';
	import DateInput from '$lib/components/date/DateInput.svelte';

	// Props with bindable date range and deadline
	let {
		start = $bindable<string | undefined>(),
		end = $bindable<string | undefined>(),
		deadlineDate = $bindable<string | undefined>(),
		filterMode = $bindable<'date_range' | 'deadline'>('deadline')
	} = $props<{
		start?: string | undefined;
		end?: string | undefined;
		deadlineDate?: string | undefined;
		filterMode?: 'date_range' | 'deadline';
	}>();

	// Internal state for Date objects (derived from bound string props)
	let dateRange = $state<{ start: Date | null; end: Date | null }>({
		start: null,
		end: null
	});
	let deadline = $state<Date | null>(null);

	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used in template
	let timePreferences = $state<string[]>([]);

	// Track last prop values to prevent unnecessary updates
	let lastStart = $state<string | undefined>(start);
	let lastEnd = $state<string | undefined>(end);
	let lastDeadlineDate = $state<string | undefined>(deadlineDate);

	// Only sync when props actually change from parent, not when we update them
	$effect(() => {
		if (filterMode === 'date_range') {
			// Only update if the prop value actually changed (from parent)
			if (start !== lastStart) {
				dateRange.start = start ? new Date(start) : null;
				lastStart = start;
			}
			if (end !== lastEnd) {
				dateRange.end = end ? new Date(end) : null;
				lastEnd = end;
			}
		} else if (filterMode === 'deadline') {
			if (deadlineDate !== lastDeadlineDate) {
				deadline = deadlineDate ? new Date(deadlineDate) : null;
				lastDeadlineDate = deadlineDate;
			}
		}
	});

	// Extract YYYY-MM-DD from local date components (avoids UTC timezone shift)
	function toLocalDateString(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	// Clear availability filters
	function clearAvailability() {
		timePreferences = [];
		start = undefined;
		end = undefined;
		deadlineDate = undefined;
	}

	// Handle date changes and update bound values
	function handleStartDateChange(date: Date | null) {
		dateRange.start = date;
		const newValue = date ? toLocalDateString(date) : undefined;
		start = newValue;
		lastStart = newValue;
	}

	function handleEndDateChange(date: Date | null) {
		dateRange.end = date;
		const newValue = date ? toLocalDateString(date) : undefined;
		end = newValue;
		lastEnd = newValue;
	}

	function handleDeadlineChange(date: Date | null) {
		deadline = date;
		const newValue = date ? toLocalDateString(date) : undefined;
		deadlineDate = newValue;
		lastDeadlineDate = newValue;
	}
</script>

<div class="space-y-4">
	<!-- Filter Type Selection -->
	<div class="flex items-center justify-between gap-2">
		<label class="label" for="filter-type">
			<span class="label-text font-medium"
				>{$t('dashboard.bids.components.filters.availability.filter_type')}</span
			>
		</label>
		<div class="flex flex-wrap gap-2">
			<button
				class="btn btn-sm"
				class:btn-primary={filterMode === 'date_range'}
				onclick={() => {
					filterMode = 'date_range';
				}}
			>
				{$t('dashboard.bids.components.filters.availability.date_range')}
			</button>
			<button
				class="btn btn-sm"
				class:btn-primary={filterMode === 'deadline'}
				onclick={() => {
					filterMode = 'deadline';
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
				<span class="label-text font-medium"
					>{$t('dashboard.bids.components.filters.availability.date_range')}</span
				>
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
