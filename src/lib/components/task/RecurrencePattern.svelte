<script lang="ts">
	import { type MyTaskTemplates$result, type RecurrencePatternInput } from '$houdini';
	import { RecurringFrequencyEnum } from '$lib/utils/enums/task.enum';
	import Input from '../Input.svelte';
	import DatePicker from '$lib/components/date/DatePicker.svelte';

	// Define a more specific type for the pattern prop, handling potential null
	type PatternProp =
		| (MyTaskTemplates$result['taskTemplates'][0]['recurrencePattern'] & { frequency: string }) // Ensure frequency is always string from Houdini
		| RecurrencePatternInput
		| null; // Allow null for initialization or empty states

	let {
		pattern,
		isEditing = false,
		onPatternChange = (pattern: RecurrencePatternInput) => {}
	} = $props<{
		pattern: PatternProp;
		isEditing?: boolean;
		onPatternChange?: (pattern: RecurrencePatternInput) => void;
	}>();

	// Use mutable state initialized from the prop
	let localPattern = $state<RecurrencePatternInput>({
		frequency: pattern?.frequency ?? RecurringFrequencyEnum.WEEKLY,
		interval: pattern?.interval ?? 1,
		daysOfWeek: pattern?.daysOfWeek ?? [1], // Default to Monday if null
		dayOfMonth: pattern?.dayOfMonth ?? null,
		endDate: pattern?.endDate ?? null,
		maxOccurrences: pattern?.maxOccurrences ?? 12
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
		const currentDays = localPattern.daysOfWeek ?? [];
		if (currentDays.includes(day)) {
			localPattern.daysOfWeek = currentDays.filter((d) => d !== day);
		} else {
			localPattern.daysOfWeek = [...currentDays, day].sort((a, b) => a - b);
		}
		emitUpdate();
	}

	// Handle day of month change
	function handleDayOfMonthChange(event: Event) {
		const value = parseInt((event.target as HTMLInputElement).value);
		localPattern.dayOfMonth = value >= 1 && value <= 31 ? value : null; // Allow null
		emitUpdate();
	}

	// Handle max occurrences change
	function handleMaxOccurrencesChange(event: Event) {
		const value = parseInt((event.target as HTMLInputElement).value);
		localPattern.maxOccurrences = value > 0 ? value : null; // Allow null
		emitUpdate();
	}

	// Handle frequency change
	function handleFrequencyChange(value: RecurringFrequencyEnum) {
		localPattern.frequency = value;

		// Set reasonable defaults for the selected frequency
		if (value === RecurringFrequencyEnum.DAILY) {
			localPattern.interval = 1;
			localPattern.daysOfWeek = null; // Daily doesn't use daysOfWeek
			localPattern.dayOfMonth = null;
		} else if (value === RecurringFrequencyEnum.WEEKLY) {
			localPattern.interval = 1;
			if (!localPattern.daysOfWeek?.length) {
				localPattern.daysOfWeek = [1]; // Monday by default
			}
			localPattern.dayOfMonth = null;
		} else if (value === RecurringFrequencyEnum.BIWEEKLY) {
			localPattern.interval = 2;
			if (!localPattern.daysOfWeek?.length) {
				localPattern.daysOfWeek = [1]; // Monday by default
			}
			localPattern.dayOfMonth = null;
		} else if (value === RecurringFrequencyEnum.MONTHLY) {
			localPattern.interval = 1;
			localPattern.dayOfMonth = localPattern.dayOfMonth ?? 1; // Keep existing or default to 1
			localPattern.daysOfWeek = null;
		} else if (value === RecurringFrequencyEnum.CUSTOM) {
			// Custom might need specific logic or retain existing days
			if (!localPattern.daysOfWeek?.length) {
				localPattern.daysOfWeek = [1, 3, 5]; // Mon, Wed, Fri by default
			}
			localPattern.dayOfMonth = null;
		}

		emitUpdate();
	}

	// Handle end date change
	function handleEndDateChange(value: string | null) {
		localPattern.endDate = value;
		emitUpdate();
	}

	// Emit the updated pattern to parent
	function emitUpdate() {
		if (isEditing) {
			// Ensure the object passed matches RecurrencePatternInput (e.g., handle nulls appropriately)
			const patternToSend: RecurrencePatternInput = {
				frequency: localPattern.frequency as RecurringFrequencyEnum,
				interval: localPattern.interval,
				daysOfWeek: localPattern.daysOfWeek,
				dayOfMonth: localPattern.dayOfMonth,
				endDate: localPattern.endDate,
				maxOccurrences: localPattern.maxOccurrences
			};
			onPatternChange(patternToSend);
		}
		return;
	}
</script>

<div class="rounded-box border-base-300 bg-base-100 border p-4">
	<!-- Frequency Selection -->
	<div class="form-control mb-4 w-full">
		<label class="label" for="frequency">
			<span class="label-text">How often should this task repeat?</span>
		</label>
		<Input
			id="frequency"
			type="select"
			value={localPattern.frequency}
			onChange={({ value }) => handleFrequencyChange(value as RecurringFrequencyEnum)}
			options={[
				{ value: RecurringFrequencyEnum.DAILY, label: 'Daily' },
				{ value: RecurringFrequencyEnum.WEEKLY, label: 'Weekly' },
				{ value: RecurringFrequencyEnum.BIWEEKLY, label: 'Every 2 weeks' },
				{ value: RecurringFrequencyEnum.MONTHLY, label: 'Monthly' },
				{ value: RecurringFrequencyEnum.CUSTOM, label: 'Custom' }
			]}
		/>
	</div>

	<!-- Frequency-specific options -->
	<div class="mb-8">
		{#if localPattern.frequency === RecurringFrequencyEnum.DAILY}
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
		{:else if localPattern.frequency === RecurringFrequencyEnum.WEEKLY || localPattern.frequency === RecurringFrequencyEnum.BIWEEKLY}
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

			<div class="form-control space-y-1">
				<label class="label" for="daysOfWeek">
					<span class="label-text">On these days:</span>
				</label>
				<div class="flex flex-wrap gap-2">
					{#each dayLabels as day, index}
						<button
							type="button"
							class="btn btn-sm {localPattern.daysOfWeek?.includes(index)
								? 'btn-primary'
								: 'btn-outline'}"
							onclick={() => toggleDayOfWeek(index)}
						>
							{day}
						</button>
					{/each}
				</div>
			</div>
		{:else if localPattern.frequency === RecurringFrequencyEnum.MONTHLY}
			<div class="flex items-center justify-start gap-4">
				<div class="form-control w-full">
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

				<div class="form-control w-full">
					<label class="label" for="dayOfMonth">
						<span class="label-text">On day</span>
					</label>
					<div class="flex items-center gap-2">
						<input
							type="number"
							class="input input-bordered w-24"
							min="1"
							max="31"
							value={localPattern.dayOfMonth ?? ''}
							onchange={handleDayOfMonthChange}
						/>
						<span>of the month</span>
					</div>
				</div>
			</div>
		{:else if localPattern.frequency === RecurringFrequencyEnum.CUSTOM}
			<div class="form-control mb-4">
				<label class="label" for="daysOfWeek">
					<span class="label-text">Select specific days:</span>
				</label>
				<div class="flex flex-wrap gap-2">
					{#each dayLabels as day, index}
						<button
							type="button"
							class="btn btn-sm {localPattern.daysOfWeek?.includes(index)
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
			<DatePicker
				value={localPattern.endDate ? localPattern.endDate : undefined}
				onChange={handleEndDateChange}
			/>
		</div>

		<div class="form-control space-y-2 md:w-1/2">
			<label class="label" for="maxOccurrences">
				<span class="label-text">Maximum Occurrences</span>
			</label>
			<div class="flex items-center gap-2">
				<input
					type="number"
					class="input input-bordered h-10 w-full"
					min="1"
					max="365"
					value={localPattern.maxOccurrences ?? ''}
					onchange={handleMaxOccurrencesChange}
				/>
				<span>tasks</span>
			</div>
		</div>
	</div>
</div>
