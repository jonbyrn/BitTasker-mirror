<script lang="ts">
	import { profileStore } from '$lib/stores/profile.store';
	import { t } from 'svelte-i18n';
	import { formatTime12Hour } from '$lib/utils/helpers/dateFormatter';

	let { formatDate } = $props<{
		formatDate: (date: string) => string;
	}>();

	// Format time slot for display in 12-hour format
	function formatTimeSlot(start: string, end: string): string {
		const formattedStart = formatTime12Hour(start);
		const formattedEnd = formatTime12Hour(end);
		return `${formattedStart} - ${formattedEnd}`;
	}

	// Get schedule for a specific day
	function getDaySchedule(
		timeSlots: Array<{ day: number; start: string; end: string }>,
		dayNumber: number
	) {
		const slot = timeSlots.find((slot) => slot.day === dayNumber);
		return slot
			? { available: true, hours: formatTimeSlot(slot.start, slot.end) }
			: { available: false };
	}

	// Calculate next available time
	function getNextAvailable(
		timeSlots: Array<{ day: number; start: string; end: string }>,
		noticeHours: number
	): string | null {
		if (!timeSlots.length) return null;

		const now = new Date();
		const noticeMs = noticeHours * 60 * 60 * 1000;
		const earliestPossibleTime = new Date(now.getTime() + noticeMs);

		// Sort time slots by day and start time
		const sortedSlots = [...timeSlots].sort((a, b) => {
			if (a.day === b.day) return a.start.localeCompare(b.start);
			return a.day - b.day;
		});

		// Function to get next occurrence of a day
		function getNextDay(targetDay: number): Date {
			const result = new Date(now);
			result.setHours(0, 0, 0, 0);
			const currentDay = result.getDay();
			const daysToAdd = (targetDay - currentDay + 7) % 7;
			result.setDate(result.getDate() + daysToAdd);
			return result;
		}

		// Check each slot for the next available time
		for (let i = 0; i < 14; i++) {
			// Check next 2 weeks
			for (const slot of sortedSlots) {
				const slotDate = getNextDay(slot.day);
				if (i > 0) slotDate.setDate(slotDate.getDate() + 7);

				const [hours, minutes] = slot.start.split(':').map(Number);
				slotDate.setHours(hours, minutes, 0, 0);

				if (slotDate > earliestPossibleTime) {
					return slotDate.toISOString();
				}
			}
		}

		return null;
	}

	// Create full week schedule
	let schedule = $derived(() => {
		if (!$profileStore.data?.availability?.timeSlots) return {};

		const weekSchedule: Record<string, { available: boolean; hours?: string; label: string }> = {};

		const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

		dayKeys.forEach((dayKey, index) => {
			const scheduleData = getDaySchedule($profileStore.data!.availability!.timeSlots, index);

			weekSchedule[dayKey] = {
				...scheduleData,
				label: $t(`days.${dayKey}`)
			};
		});

		return weekSchedule;
	});

	// Calculate next available time
	let nextAvailable = $derived(() => {
		const availability = $profileStore.data?.availability;
		if (!availability?.timeSlots?.length) return null;
		return getNextAvailable(availability.timeSlots, availability.noticeHours);
	});
</script>

<!-- Profile Sidebar -->
<div class="flex-1">
	{#if $profileStore.isLoading}
		<div class="space-y-6">
			<div class="animate-pulse space-y-4">
				<div class="bg-base-300 h-6 w-48 rounded"></div>
				<div class="bg-base-300 h-4 w-full rounded"></div>
				<div class="bg-base-300 h-4 w-3/4 rounded"></div>
			</div>
		</div>
	{:else if $profileStore.data}
		<!-- Availability Card -->
		<div class="card bg-base-200 mb-6 rounded-xl">
			<div class="card-body">
				<h3 class="card-title text-lg">{$t('profile_availability.availabilityTitle')}</h3>

				{#if $profileStore.data.availability}
					<div class="mt-2">
						<p class="font-medium">{$t('profile_availability.weeklySchedule')}</p>
						<div class="mt-2 space-y-2">
							{#each Object.entries(schedule()) as [day, scheduleData]}
								<div class="border-base-300 flex items-center justify-between border-b py-1">
									<span class="capitalize">{scheduleData.label}</span>
									<span>
										{#if scheduleData.available}
											{scheduleData.hours}
										{:else}
											<span class="text-base-content/50"
												>{$t('profile_availability.unavailable')}</span
											>
										{/if}
									</span>
								</div>
							{/each}
						</div>
					</div>

					<div class="divider"></div>

					<div class="flex items-center justify-between">
						{#if nextAvailable()}
							<div class="">
								<p class="font-medium">{$t('profile_availability.nextAvailable')}</p>
								<p class="text-primary">{formatDate(nextAvailable())}</p>
							</div>
						{/if}

						<div>
							<p class="font-medium">{$t('profile_availability.timezone')}</p>
							<p class="text-base-content/70">
								{$profileStore.data.availability?.timezone ||
									Intl.DateTimeFormat().resolvedOptions().timeZone}
							</p>
						</div>
					</div>

					<div class="divider"></div>

					<div class="space-y-2 text-sm">
						<div class="flex justify-between">
							<span>{$t('profile_availability.noticeRequired')}</span>
							<span class="text-base-content/70">
								{$profileStore.data.availability.noticeHours}
								{$t('profile_availability.hours')}
							</span>
						</div>
						<div class="flex justify-between">
							<span>{$t('profile_availability.maxBookingsPerDay')}</span>
							<span class="text-base-content/70"
								>{$profileStore.data.availability.maxBookingsPerDay}</span
							>
						</div>
						<div class="flex justify-between">
							<span>{$t('profile_availability.breakBetweenBookings')}</span>
							<span class="text-base-content/70">
								{$profileStore.data.availability.breakBetweenBookings}
								{$t('profile_availability.minutes')}
							</span>
						</div>
					</div>
				{/if}

				<!-- <div class="card-actions mt-4">
					<button class="btn btn-primary btn-block">Contact</button>
				</div> -->
			</div>
		</div>


	{:else if $profileStore.error}
		<div class="alert alert-outline alert-error">
			<span>{$t('profile_availability.error_load')}</span>
		</div>
	{/if}
</div>
