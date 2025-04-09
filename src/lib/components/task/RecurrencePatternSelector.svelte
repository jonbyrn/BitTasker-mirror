<script lang="ts">
	import type { RecurrencePattern } from '$lib/types/recurring-tasks';
	import { RECURRINGFREQUENCYENUM } from '$lib/utils/enums/recurringTask.enums';

	let { pattern, onUpdate } = $props<{
		pattern: RecurrencePattern;
		onUpdate: (pattern: RecurrencePattern) => void;
	}>();

	const localPattern = $state<RecurrencePattern>({
		frequency: pattern.frequency,
		interval: pattern.interval,
		daysOfWeek: pattern.daysOfWeek || [],
		dayOfMonth: pattern.dayOfMonth || 1,
		endDate: pattern.endDate || '',
		maxOccurrences: pattern.maxOccurrences || 12
	});

	// Labels for days of the week
	const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	// Handle interval change
	function handleIntervalChange(event: Event) {
		const value = parseInt((event.target as HTMLInputElement).value);
		localPattern.interval = value > 0 ? value : 1;
		emitUpdate();
	}

	// Toggle day of week selection
	function toggleDayOfWeek(day: number) {
		if (localPattern.daysOfWeek?.includes(day)) {
			localPattern.daysOfWeek = localPattern.daysOfWeek.filter((d) => d !== day);
		} else {
			localPattern.daysOfWeek = [...(localPattern.daysOfWeek || []), day].sort((a, b) => a - b);
		}
		emitUpdate();
	}

	// Handle day of month change
	function handleDayOfMonthChange(event: Event) {
		const value = parseInt((event.target as HTMLInputElement).value);
		localPattern.dayOfMonth = value >= 1 && value <= 31 ? value : 1;
		emitUpdate();
	}

	// Handle max occurrences change
	function handleMaxOccurrencesChange(event: Event) {
		const value = parseInt((event.target as HTMLInputElement).value);
		localPattern.maxOccurrences = value > 0 ? value : 1;
		emitUpdate();
	}

	// Handle frequency change
	function handleFrequencyChange(event: Event) {
		const value = (event.target as HTMLSelectElement).value as RECURRINGFREQUENCYENUM;
		localPattern.frequency = value;

		// Set reasonable defaults for the selected frequency
		if (value === RECURRINGFREQUENCYENUM.DAILY) {
			localPattern.interval = 1;
		} else if (value === RECURRINGFREQUENCYENUM.WEEKLY) {
			localPattern.interval = 1;
			if (!localPattern.daysOfWeek?.length) {
				localPattern.daysOfWeek = [1]; // Monday by default
			}
		} else if (value === RECURRINGFREQUENCYENUM.BIWEEKLY) {
			localPattern.interval = 2;
			if (!localPattern.daysOfWeek?.length) {
				localPattern.daysOfWeek = [1]; // Monday by default
			}
		} else if (value === RECURRINGFREQUENCYENUM.MONTHLY) {
			localPattern.interval = 1;
			localPattern.dayOfMonth = 1;
		} else if (value === RECURRINGFREQUENCYENUM.CUSTOM) {
			if (!localPattern.daysOfWeek?.length) {
				localPattern.daysOfWeek = [1, 3, 5]; // Mon, Wed, Fri by default
			}
		}

		emitUpdate();
	}

	// Handle end date change
	function handleEndDateChange(event: Event) {
		localPattern.endDate = (event.target as HTMLInputElement).value;
		emitUpdate();
	}

	// Emit the updated pattern to parent
	function emitUpdate() {
		onUpdate({ ...localPattern });
	}

	// Initialize with props
	$effect(() => {
		localPattern.frequency = pattern.frequency;
		localPattern.interval = pattern.interval;
		localPattern.daysOfWeek = pattern.daysOfWeek || [];
		localPattern.dayOfMonth = pattern.dayOfMonth || 1;
		localPattern.endDate = pattern.endDate || '';
		localPattern.maxOccurrences = pattern.maxOccurrences || 12;
	});
</script>

<div class="rounded-box border-base-300 bg-base-100 border p-4">
	<!-- Frequency Selection -->
	<div class="form-control mb-4 w-full">
		<label class="label" for="frequency">
			<span class="label-text">How often should this task repeat?</span>
		</label>
		<select
			class="select select-bordered w-full"
			value={localPattern.frequency}
			onchange={handleFrequencyChange}
		>
			<option value={RECURRINGFREQUENCYENUM.DAILY}>Daily</option>
			<option value={RECURRINGFREQUENCYENUM.WEEKLY}>Weekly</option>
			<option value={RECURRINGFREQUENCYENUM.BIWEEKLY}>Every 2 weeks</option>
			<option value={RECURRINGFREQUENCYENUM.MONTHLY}>Monthly</option>
			<option value={RECURRINGFREQUENCYENUM.CUSTOM}>Custom</option>
		</select>
	</div>

	<!-- Frequency-specific options -->
	<div class="mb-4">
		{#if localPattern.frequency === RECURRINGFREQUENCYENUM.DAILY}
			<div class="form-control">
				<label class="label" for="interval">
					<span class="label-text">Repeat every</span>
				</label>
				<div class="flex items-center gap-2">
					<input
						type="number"
						class="input input-bordered w-24"
						min="1"
						max="30"
						value={localPattern.interval}
						onchange={handleIntervalChange}
					/>
					<span>day(s)</span>
				</div>
			</div>
		{:else if localPattern.frequency === RECURRINGFREQUENCYENUM.WEEKLY || localPattern.frequency === RECURRINGFREQUENCYENUM.BIWEEKLY}
			<div class="form-control mb-4">
				<label class="label" for="interval">
					<span class="label-text">Repeat every</span>
				</label>
				<div class="flex items-center gap-2">
					<input
						type="number"
						class="input input-bordered w-24"
						min="1"
						max="12"
						value={localPattern.interval}
						onchange={handleIntervalChange}
					/>
					<span>week(s)</span>
				</div>
			</div>

			<div class="form-control">
				<label class="label" for="daysOfWeek">
					<span class="label-text">On these days:</span>
				</label>
				<div class="flex flex-wrap gap-2">
					{#each dayLabels as day, index}
						<button
							type="button"
							class="btn btn-sm {localPattern?.daysOfWeek?.includes(index)
								? 'btn-primary'
								: 'btn-outline'}"
							onclick={() => toggleDayOfWeek(index)}
						>
							{day}
						</button>
					{/each}
				</div>
			</div>
		{:else if localPattern.frequency === RECURRINGFREQUENCYENUM.MONTHLY}
			<div class="form-control mb-4">
				<label class="label" for="interval">
					<span class="label-text">Repeat every</span>
				</label>
				<div class="flex items-center gap-2">
					<input
						type="number"
						class="input input-bordered w-24"
						min="1"
						max="12"
						value={localPattern.interval}
						onchange={handleIntervalChange}
					/>
					<span>month(s)</span>
				</div>
			</div>

			<div class="form-control">
				<label class="label" for="dayOfMonth">
					<span class="label-text">On day</span>
				</label>
				<div class="flex items-center gap-2">
					<input
						type="number"
						class="input input-bordered w-24"
						min="1"
						max="31"
						value={localPattern.dayOfMonth}
						onchange={handleDayOfMonthChange}
					/>
					<span>of the month</span>
				</div>
			</div>
		{:else if localPattern.frequency === RECURRINGFREQUENCYENUM.CUSTOM}
			<div class="form-control mb-4">
				<label class="label" for="daysOfWeek">
					<span class="label-text">Select specific days:</span>
				</label>
				<div class="flex flex-wrap gap-2">
					{#each dayLabels as day, index}
						<button
							type="button"
							class="btn btn-sm {localPattern?.daysOfWeek?.includes(index)
								? 'btn-primary'
								: 'btn-outline'}"
							onclick={() => toggleDayOfWeek(index)}
						>
							{day}
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<!-- End Conditions -->
	<div class="divider text-sm">End Conditions</div>

	<div class="flex flex-col gap-4 md:flex-row">
		<div class="form-control md:w-1/2">
			<label class="label" for="endDate">
				<span class="label-text">End Date (optional)</span>
			</label>
			<input
				type="date"
				class="input input-bordered w-full"
				value={localPattern.endDate}
				onchange={handleEndDateChange}
			/>
		</div>

		<div class="form-control md:w-1/2">
			<label class="label" for="maxOccurrences">
				<span class="label-text">Maximum Occurrences</span>
			</label>
			<div class="flex items-center gap-2">
				<input
					type="number"
					class="input input-bordered w-full"
					min="1"
					max="365"
					value={localPattern.maxOccurrences}
					onchange={handleMaxOccurrencesChange}
				/>
				<span>tasks</span>
			</div>
		</div>
	</div>
</div>
