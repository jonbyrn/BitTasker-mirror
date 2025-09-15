<!-- 
  AvailabilityFilter.svelte
  Component for time-based task filtering including date range
  and time of day preferences
-->
<script lang="ts">
	import { t } from 'svelte-i18n';

	// Props
	let { onAvailabilityChange = () => {} } = $props<{
		onAvailabilityChange?: (
			filterMode: 'date_range' | 'deadline',
			start: string,
			end: string
		) => void;
	}>();

	// State
	let dateRange = $state<{ start: string; end: string }>({
		start: '',
		end: ''
	});
	let deadline = $state<string>('');

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
		dateRange.start = '';
		dateRange.end = '';
		timePreferences = [];
	}

	// Apply availability filter changes
	function applyChanges() {
		if (filterMode === 'date_range') {
			return onAvailabilityChange('date_range', dateRange.start, dateRange.end);
		} else if (filterMode === 'deadline') {
			return onAvailabilityChange('deadline', deadline);
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
				<div>
					<label class="label mb-1 p-0" for="start-date">
						<span class="label-text text-xs">{$t('dashboard.bids.components.filters.availability.start_date')}</span>
					</label>
					<input
						type="date"
						class="input input-bordered input-sm w-full"
						bind:value={dateRange.start}
					/>
				</div>
				<div>
					<label class="label mb-1 p-0" for="end-date">
						<span class="label-text text-xs">{$t('dashboard.bids.components.filters.availability.end_date')}</span>
					</label>
					<input
						type="date"
						class="input input-bordered input-sm w-full"
						bind:value={dateRange.end}
					/>
				</div>
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
			<input
				type="date"
				class="input input-bordered input-sm w-full"
				bind:value={deadline}
				id="deadline-before-date"
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
