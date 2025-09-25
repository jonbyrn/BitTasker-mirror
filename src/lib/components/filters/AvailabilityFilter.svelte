<!-- 
  AvailabilityFilter.svelte
  Component for time-based task filtering including date range
  and time of day preferences
-->
<script lang="ts">
	import { t } from 'svelte-i18n';
	import DateInput from '$lib/components/date/DateInput.svelte';

	// Props
	let { onAvailabilityChange = () => {} } = $props<{
		onAvailabilityChange?: (
			filterMode: 'date_range' | 'deadline',
			start: string,
			end: string
		) => void;
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

	// Deadline filter modes
	let filterMode = $state<'date_range' | 'deadline'>('deadline');

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
	}

	// Apply availability filter changes
	function applyChanges() {
		if (filterMode === 'date_range') {
			const startStr = dateRange.start ? dateRange.start.toISOString().split('T')[0] : '';
			const endStr = dateRange.end ? dateRange.end.toISOString().split('T')[0] : '';
			return onAvailabilityChange('date_range', startStr, endStr);
		} else if (filterMode === 'deadline') {
			const deadlineStr = deadline ? deadline.toISOString().split('T')[0] : '';
			return onAvailabilityChange('deadline', deadlineStr);
		}
	}

	// Update parent when our filters change
	$effect(() => {
		applyChanges();
	});
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
				onclick={() => (filterMode = 'date_range')}
			>
				{$t('dashboard.bids.components.filters.availability.date_range')}
			</button>
			<button
				class="btn btn-sm"
				class:btn-primary={filterMode === 'deadline'}
				onclick={() => (filterMode = 'deadline')}
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
					onChange={(date: Date | null) => dateRange.start = date}
				/>
				<DateInput
					bind:value={dateRange.end}
					type="single"
					labelKey="dashboard.bids.components.filters.availability.airdatepicker.select_end_date"
					placeholderKey="dashboard.bids.components.filters.availability.airdatepicker.select_end_date"
					minDate={dateRange.start || new Date()}
					maxDate={undefined}
					onChange={(date: Date | null) => dateRange.end = date}
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
				onChange={(date: Date | null) => deadline = date}
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
