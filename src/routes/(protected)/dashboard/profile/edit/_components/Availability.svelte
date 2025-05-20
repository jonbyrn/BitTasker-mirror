<script lang="ts">
	import { UpdateUserProfileStore } from '$houdini';
	import Input from '$lib/components/Input.svelte';

	interface TimeSlot {
		day: number; // 0-6 (Sunday-Saturday)
		start: string; // HH:mm format
		end: string; // HH:mm format
	}

	interface AvailabilityData {
		timeSlots: TimeSlot[];
		timezone: string;
		noticeHours: number;
		maxBookingsPerDay: number;
		breakBetweenBookings: number; // minutes
	}

	let { user, onComplete } = $props<{
		user: { availability?: AvailabilityData | null } | null | undefined;
		onComplete: (completed: boolean) => void;
	}>();

	const profileStore = new UpdateUserProfileStore();

	// Local state
	let timeSlots = $state<TimeSlot[]>(user?.availability?.timeSlots || []);
	let timezone = $state(
		user?.availability?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
	);
	let noticeHours = $state(user?.availability?.noticeHours || 24);
	let maxBookingsPerDay = $state(user?.availability?.maxBookingsPerDay || 5);
	let breakBetweenBookings = $state(user?.availability?.breakBetweenBookings || 30);
	let isLoading = $state(false);
	let error = $state('');

	// Days of the week
	const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

	// Available timezones
	const timezones = Intl.supportedValuesOf('timeZone');

	// Track completion
	$effect(() => {
		const isComplete = timeSlots.length > 0;
		onComplete(isComplete);
	});

	// Add time slot
	function addTimeSlot(day: number) {
		timeSlots = [
			...timeSlots,
			{
				day,
				start: '09:00',
				end: '17:00'
			}
		];
	}

	// Update time slot
	function updateTimeSlot(index: number, field: 'start' | 'end', value: string) {
		timeSlots = timeSlots.map((slot, i) => (i === index ? { ...slot, [field]: value } : slot));
	}

	// Remove time slot
	function removeTimeSlot(index: number) {
		timeSlots = timeSlots.filter((_, i) => i !== index);
	}

	// Copy time slots to other days
	function copyToOtherDays(fromDay: number) {
		const daySlots = timeSlots.filter((slot) => slot.day === fromDay);
		const otherDays = Array.from({ length: 7 }, (_, i) => i).filter((d) => d !== fromDay);

		timeSlots = [
			...timeSlots.filter((slot) => slot.day === fromDay),
			...otherDays.flatMap((day) =>
				daySlots.map((slot) => ({
					...slot,
					day
				}))
			)
		];
	}

	// Save availability
	async function handleSubmit() {
		try {
			isLoading = true;
			error = '';

			if (timeSlots.length === 0) {
				error = 'Please add at least one time slot';
				return;
			}

			// Validate time slots
			for (const slot of timeSlots) {
				if (slot.start >= slot.end) {
					error = 'End time must be after start time';
					return;
				}
			}

			// Create availability data
			const availabilityData: AvailabilityData = {
				timeSlots,
				timezone,
				noticeHours,
				maxBookingsPerDay,
				breakBetweenBookings
			};

			// Update profile using GraphQL
			const result = await profileStore.mutate({
				input: {
					availability: availabilityData
				}
			});

			if (result.errors) {
				throw new Error(result.errors[0].message);
			}

			// Show success message
			const toast = document.getElementById('availability-toast-success');
			if (toast) toast.style.display = 'block';
		} catch (err) {
			console.error('Availability update failed:', err);
			error = err instanceof Error ? err.message : 'Failed to update availability';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="space-y-6">
	<!-- Timezone Selection -->
	<div class="form-control">
		<label class="label" for="timezone">
			<span class="label-text font-medium">Your Timezone</span>
		</label>
		<Input id="timezone" options={timezones.map(tz => ({ label: tz, value: tz }))} value={timezone} autoComplete="on" />
	</div>

	<!-- Scheduling Preferences -->
	<div class="grid gap-4">
		<!-- Minimum Notice -->
		<div class="form-control">
			<label class="label block" for="noticeHours">
				<span class="label-text font-medium">Minimum Notice</span>
				<span class="label-text-alt">{noticeHours} hours</span>
			</label>
			<input
				type="range"
				id="noticeHours"
				bind:value={noticeHours}
				min="1"
				max="72"
				class="range range-primary range-xs w-full"
			/>
		</div>

		<!-- Max Bookings Per Day -->
		<div class="form-control">
			<label class="label" for="maxBookings">
				<span class="label-text font-medium">Max Daily Bookings</span>
			</label>
			<input
				type="number"
				id="maxBookings"
				bind:value={maxBookingsPerDay}
				min="1"
				max="20"
				class="input input-bordered w-full"
			/>
		</div>

		<!-- Break Between Bookings -->
		<div class="form-control">
			<label class="label" for="breakTime">
				<span class="label-text font-medium">Break Between Bookings</span>
				<span class="label-text-alt">minutes</span>
			</label>
			<select
				id="breakTime"
				bind:value={breakBetweenBookings}
				class="select select-bordered w-full"
			>
				<option value={15}>15 minutes</option>
				<option value={30}>30 minutes</option>
				<option value={45}>45 minutes</option>
				<option value={60}>1 hour</option>
			</select>
		</div>
	</div>

	<!-- Weekly Schedule -->
	<div class="space-y-4">
		<h3 class="text-lg font-medium">Weekly Schedule</h3>

		{#each days as day, index}
			<div class="card bg-base-200 p-4 rounded-xl space-y-2">
				<h4 class="font-medium">{day}</h4>

				{#if timeSlots.filter((slot) => slot.day === index).length === 0}
					<p class="text-base-content/70">No availability set</p>
				{:else}
					<div class="space-y-2">
						{#each timeSlots.filter((slot) => slot.day === index) as slot, slotIndex}
							<div
								class="relative flex flex-col items-center gap-4 rounded-xl border border-white/50 p-4 pt-10 shadow-md sm:flex-row"
							>
								<div class="flex w-full flex-row items-center justify-start gap-2">
									<span class="text-base-content/70 w-1/5">from</span>
									<input
										type="time"
										value={slot.start}
										onchange={(e) =>
											updateTimeSlot(
												timeSlots.findIndex((s) => s === slot),
												'start',
												(e.target as HTMLInputElement).value
											)}
										class="input input-bordered"
									/>
								</div>
								<div class="flex w-full flex-row items-center justify-start gap-2">
									<span class="text-base-content/70 w-1/5">to</span>
									<input
										type="time"
										value={slot.end}
										onchange={(e) =>
											updateTimeSlot(
												timeSlots.findIndex((s) => s === slot),
												'end',
												(e.target as HTMLInputElement).value
											)}
										class="input input-bordered"
									/>
								</div>
								<button
									class="btn btn-ghost btn-xs btn-outline btn-circle absolute top-2 right-2"
									onclick={() => removeTimeSlot(timeSlots.findIndex((s) => s === slot))}
								>
									✕
								</button>
							</div>
						{/each}
					</div>
				{/if}

				<div class="flex gap-2 justify-end">
					<button
						class="btn btn-ghost btn-outline btn-xs sm:btn-sm"
						onclick={() => copyToOtherDays(index)}
					>
						Copy to Other Days
					</button>
					<button class="btn btn-primary btn-xs sm:btn-sm" onclick={() => addTimeSlot(index)}>
						Add Time Slot
					</button>
				</div>
			</div>
		{/each}
	</div>

	<!-- Error Message -->
	{#if error}
		<div class="alert alert-error">
			<span>{error}</span>
		</div>
	{/if}

	<!-- Submit Button -->
	<div class="flex justify-end">
		<button
			class="btn btn-primary"
			onclick={handleSubmit}
			disabled={isLoading || timeSlots.length === 0}
		>
			{#if isLoading}
				<span class="loading loading-spinner"></span>
			{/if}
			Save Availability
		</button>
	</div>
</div>

<!-- Success Toast -->
<div id="availability-toast-success" class="toast toast-end" style="display: none;">
	<div class="alert alert-success">
		<span>Availability updated successfully!</span>
	</div>
</div>
