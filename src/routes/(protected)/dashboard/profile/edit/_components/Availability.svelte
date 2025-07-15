<script lang="ts">
	import type { Availability, TimeSlot } from '$lib/types/profile.d';
	import { t } from '$lib/stores/i18n.store';
	import { onDestroy, onMount } from 'svelte';
	import { subscribeToProfileUpdates, publishAvailabilityUpdate } from '$lib/nostr/profile';
	import Input from '$lib/components/Input.svelte';

	let { onComplete } = $props<{ onComplete: (completed: boolean) => void }>();

	// Local state
	let timeSlots = $state<TimeSlot[]>([]);
	let timezone = $state(Intl.DateTimeFormat().resolvedOptions().timeZone);
	let noticeHours = $state(24);
	let maxBookingsPerDay = $state(5);
	let breakBetweenBookings = $state('');
	let isLoading = $state(false);
	let isInitialLoading = $state(false);
	let error = $state('');
	let timeSlotError = $state({
		day: -1,
		slotIndex: -1,
		start: '',
		end: ''
	});
	let cleanup: (() => void) | null = null;

	// Days of the week
	const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

	// Available timezones
	const timezones = Intl.supportedValuesOf('timeZone');

	// Subscribe to availability updates
	onMount(async () => {
		cleanup = await subscribeToProfileUpdates(
			async (event) => {
				try {
					isInitialLoading = true;
					if (
						event.kind === 30002 &&
						event.tags.find((t) => t[0] === 'd' && t[1] === 'availability')
					) {
						const availabilityData = JSON.parse(event.content);
						timeSlots = availabilityData.timeSlots || [];
						timezone = availabilityData.timezone || timezone;
						noticeHours = availabilityData.noticeHours || noticeHours;
						maxBookingsPerDay = availabilityData.maxBookingsPerDay || maxBookingsPerDay;
						breakBetweenBookings = availabilityData.breakBetweenBookings || breakBetweenBookings;
					}
				} catch (err) {
					console.error('Failed to process availability update:', err);
					error = 'Failed to load availability data. Please try again later.';
				} finally {
					isInitialLoading = false;
				}
			},
			{
				30002: { d: 'availability' }
			}
		);
	});

	// Cleanup subscription on component destroy
	onDestroy(() => {
		if (cleanup) cleanup();
	});

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

	// Helper function to verify time slots
	function verifyTimeSlot(end: string, start: string): boolean {
		// Convert times to minutes since midnight for comparison
		const [endHours, endMinutes] = end.split(':').map(Number);
		const [startHours, startMinutes] = start.split(':').map(Number);

		const endTotalMinutes = endHours * 60 + endMinutes;
		const startTotalMinutes = startHours * 60 + startMinutes;

		// End time should be at least 15 minutes after start time
		return endTotalMinutes - startTotalMinutes < 15;
	}

	// Helper function to check for time slot conflicts
	function checkTimeSlotConflicts(
		day: number,
		start: string,
		end: string,
		excludeIndex: number
	): boolean {
		const slotsForDay = timeSlots.filter((slot, idx) => slot.day === day && idx !== excludeIndex);

		// Convert current slot times to minutes
		const [startHours, startMinutes] = start.split(':').map(Number);
		const [endHours, endMinutes] = end.split(':').map(Number);
		const startMins = startHours * 60 + startMinutes;
		const endMins = endHours * 60 + endMinutes;

		// Check for conflicts with existing slots
		return slotsForDay.some((slot) => {
			const [existingStartHours, existingStartMinutes] = slot.start.split(':').map(Number);
			const [existingEndHours, existingEndMinutes] = slot.end.split(':').map(Number);
			const existingStartMins = existingStartHours * 60 + existingStartMinutes;
			const existingEndMins = existingEndHours * 60 + existingEndMinutes;

			// Check if the new slot overlaps with existing slot
			return startMins < existingEndMins && endMins > existingStartMins;
		});
	}

	// Update time slot
	function updateTimeSlot(index: number, field: 'start' | 'end', value: string, slotIndex: number) {
		timeSlotError = { day: -1, slotIndex: -1, start: '', end: '' };

		const currentSlot = timeSlots[index];
		const updatedStart = field === 'start' ? value : currentSlot.start;
		const updatedEnd = field === 'end' ? value : currentSlot.end;

		if (field === 'end') {
			// verify that the end time is after start time
			if (verifyTimeSlot(value, currentSlot.start)) {
				timeSlotError.day = currentSlot.day;
				timeSlotError.slotIndex = slotIndex;
				timeSlotError.end = 'End time must be at least 15 minutes after start time';
				return;
			}
		}
		if (field === 'start') {
			// verify that the start time is before end time
			if (verifyTimeSlot(currentSlot.end, value)) {
				timeSlotError.day = currentSlot.day;
				timeSlotError.slotIndex = slotIndex;
				timeSlotError.start = 'Start time must be at least 15 minutes before end time';
				return;
			}
		}

		// Check for conflicts with other slots on the same day
		if (checkTimeSlotConflicts(currentSlot.day, updatedStart, updatedEnd, index)) {
			timeSlotError.day = currentSlot.day;
			timeSlotError.slotIndex = slotIndex;
			timeSlotError.start = field === 'start' ? 'Time slot conflicts with another slot' : '';
			timeSlotError.end = field === 'end' ? 'Time slot conflicts with another slot' : '';
			return;
		}

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
			const availabilityData: Availability = {
				timeSlots,
				timezone,
				noticeHours,
				maxBookingsPerDay,
				breakBetweenBookings: parseInt(breakBetweenBookings)
			};

			// Publish availability update to Nostr
			await publishAvailabilityUpdate(availabilityData);
		} catch (err) {
			console.error('Availability update failed:', err);
			error = err instanceof Error ? err.message : 'Failed to update availability';
		} finally {
			isLoading = false;
		}
	}
</script>

{#if isInitialLoading}
	<div class="space-y-6">
		<!-- Timezone Selection Skeleton -->
		<div class="form-control">
			<div class="bg-base-300 h-4 w-32 animate-pulse rounded"></div>
			<div class="bg-base-300 mt-2 h-12 w-full animate-pulse rounded"></div>
		</div>

		<!-- Scheduling Preferences Skeleton -->
		<div class="grid gap-4">
			<!-- Minimum Notice -->
			<div class="form-control">
				<div class="flex justify-between">
					<div class="bg-base-300 h-4 w-32 animate-pulse rounded"></div>
					<div class="bg-base-300 h-4 w-16 animate-pulse rounded"></div>
				</div>
				<div class="bg-base-300 mt-2 h-12 w-full animate-pulse rounded"></div>
			</div>

			<!-- Maximum Bookings -->
			<div class="form-control">
				<div class="flex justify-between">
					<div class="bg-base-300 h-4 w-32 animate-pulse rounded"></div>
					<div class="bg-base-300 h-4 w-16 animate-pulse rounded"></div>
				</div>
				<div class="bg-base-300 mt-2 h-12 w-full animate-pulse rounded"></div>
			</div>

			<!-- Break Time -->
			<div class="form-control">
				<div class="flex justify-between">
					<div class="bg-base-300 h-4 w-32 animate-pulse rounded"></div>
					<div class="bg-base-300 h-4 w-16 animate-pulse rounded"></div>
				</div>
				<div class="bg-base-300 mt-2 h-12 w-full animate-pulse rounded"></div>
			</div>
		</div>

		<!-- Weekly Schedule Skeleton -->
		<div class="space-y-4">
			<div class="bg-base-300 h-6 w-36 animate-pulse rounded"></div>

			{#each Array(3) as _}
				<div class="card bg-base-200 space-y-2 rounded-xl p-4">
					<div class="bg-base-300 h-5 w-24 animate-pulse rounded"></div>
					<div class="bg-base-300 h-4 w-32 animate-pulse rounded"></div>
					<div class="flex justify-end gap-2">
						<div class="bg-base-300 h-8 w-32 animate-pulse rounded"></div>
						<div class="bg-base-300 h-8 w-24 animate-pulse rounded"></div>
					</div>
				</div>
			{/each}
		</div>

		<!-- Submit Button Skeleton -->
		<div class="flex justify-end">
			<div class="bg-base-300 h-10 w-40 animate-pulse rounded"></div>
		</div>
	</div>
{:else}
	<div class="space-y-6">
		<h3 class="text-lg font-medium">{$t('profile.availability.title')}</h3>

		<!-- Timezone Selection -->
		<div class="form-control">
			<label class="label" for="timezone">
				<span class="label-text font-medium">{$t('profile.availability.timezone')}</span>
			</label>
			<Input
				id="timezone"
				options={timezones.map((tz) => ({ label: tz, value: tz }))}
				value={timezone}
				onChange={({ value }) => (timezone = value)}
				autoComplete="on"
				placeholder={$t('profile.availability.timezone_placeholder')}
			/>
		</div>

		<!-- Scheduling Preferences -->
		<div class="grid gap-4">
			<!-- Minimum Notice -->
			<div class="form-control">
				<label class="label" for="noticeHours">
					<span class="label-text font-medium">{$t('profile.availability.min_notice')}</span>
				</label>
				<br />
				<label for="noticeHours" class="label">
					<span class="label-text-alt">{$t('profile.availability.min_notice_desc')}</span>
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

			<!-- Maximum Bookings -->
			<div class="form-control">
				<label class="label" for="maxBookings">
					<span class="label-text font-medium">{$t('profile.availability.max_bookings')}</span>
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

			<!-- Break Time -->
			<div class="form-control">
				<label class="label" for="breakTime">
					<span class="label-text font-medium">{$t('profile.availability.break_time')}</span>
				</label>
				<br />
				<label for="breakTime" class="label">
					<span class="label-text-alt">{$t('profile.availability.break_time_desc')}</span>
				</label>
				<Input
					type="number"
					id="breakTime"
					autoComplete="off"
					options={['15', '30', '45', '60'].map((minutes) => ({
						label: minutes,
						value: minutes
					}))}
					value={breakBetweenBookings}
					onChange={({ value }) => (breakBetweenBookings = value)}
				/>
			</div>
		</div>

		<!-- Weekly Schedule -->
		<div class="space-y-4">
			<h3 class="text-lg font-medium">Weekly Schedule</h3>

			{#each days as day, index}
				<div class="card bg-base-200 space-y-2 rounded-xl p-4">
					<h4 class="font-medium">{day}</h4>

					{#if timeSlots.filter((slot) => slot.day === index).length === 0}
						<p class="text-base-content/70">No availability set</p>
					{:else}
						<div class="space-y-2">
							{#each timeSlots.filter((slot) => slot.day === index) as slot, slotIndex}
								<div
									class="relative space-y-2 rounded-xl border border-white/50 p-4 pt-10 shadow-md"
								>
									<div class="flex flex-col items-center gap-4 sm:flex-row">
										<div class="flex w-full flex-row items-center justify-start gap-2">
											<span class="text-base-content/70 w-1/5">from</span>
											<input
												type="time"
												value={slot.start}
												onchange={(e) =>
													updateTimeSlot(
														timeSlots.findIndex((s) => s === slot),
														'start',
														(e.target as HTMLInputElement).value,
														slotIndex
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
														(e.target as HTMLInputElement).value,
														slotIndex
													)}
												class="input input-bordered"
											/>
										</div>
									</div>
									{#if timeSlotError.day === index && timeSlotError.slotIndex === slotIndex}
										<div class="alert alert-outline alert-error w-full rounded-xl">
											<span>{timeSlotError?.end || timeSlotError?.start}</span>
										</div>
									{/if}
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

					<div class="flex justify-end gap-2">
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
			<div class="alert alert-error alert-outline">
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
{/if}
