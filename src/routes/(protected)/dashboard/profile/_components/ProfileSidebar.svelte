<script lang="ts">
	import { profileStore } from '$lib/stores/profile.store';
	import { t } from 'svelte-i18n';

	let { formatDate } = $props<{
		formatDate: (date: string) => string;
	}>();

	// Format time slot for display
	function formatTimeSlot(start: string, end: string): string {
		return `${start} - ${end}`;
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
											<span class="text-base-content/50">{$t('profile_availability.unavailable')}</span>
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
							<p class="text-base-content/70">{$profileStore.data.availability.timezone}</p>
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

		<!-- Payment Methods Card -->
		<div class="card bg-base-200 mb-6 rounded-xl p-4">
			<h3 class="mb-4 text-lg font-bold">{$t('profile_availability.payment_methods')}</h3>
			<div class="space-y-4">
				<div class="flex items-center gap-2">
					<div class="badge badge-primary">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4"
							viewBox="0 0 24 24"
							fill="currentColor"
						>
							<path
								d="M19.1 2.9l-14 14.1L8.5 24l3.4-7 7.1-7.1c.4-.4.4-1 0-1.4l-3.6-3.6c-.4-.4-1-.4-1.4 0zm-4.8 7.7c-.4.4-1 .4-1.4 0-.4-.4-.4-1 0-1.4.4-.4 1-.4 1.4 0 .4.4.4 1 0 1.4z"
							/>
						</svg>
					</div>
					<p class="font-medium">{$t('profile_availability.payment_lightning')}</p>
				</div>
				<div class="flex items-center gap-2">
					<div class="badge badge-secondary">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4"
							viewBox="0 0 24 24"
							fill="currentColor"
						>
							<path
								d="M21.89 6.55c-1.98-3.08-5.79-4.82-9.52-4.41C8.47 2.54 4.9 5.33 3.71 9.25c-.82 2.7-.48 5.75 1.06 8.19 2.18 3.4 6.31 5.18 10.32 4.51 3.09-.51 5.78-2.46 7.2-5.22 1.69-3.28 1.45-7.25-.4-10.18zm-1.34 4.54c-.11.83-.52 1.72-1.11 2.33-.69.71-1.56 1.12-2.49 1.25-.66.09-1.4.05-2-.16-.87-.31-1.59-.83-2.3-1.32-.18-.12-.35-.25-.53-.37-.21-.14-.43-.27-.66-.39-.44-.23-.9-.42-1.35-.59-.45-.16-.92-.28-1.39-.29-.66-.01-1.37.17-1.77.7-.39.52-.38 1.13-.2 1.71.2.64.64 1.22 1.15 1.68.3.27.71.61.86.64-.14.27-.7.28-.97.28-.95 0-1.83-.43-2.45-1.2-.65-.82-.94-1.82-.8-2.84.13-.93.64-1.8 1.47-2.33.83-.53 1.87-.72 2.82-.52 1.35.28 2.64 1.15 3.94 1.76 1.14.53 2.33.91 3.58.59.58-.15 1.04-.43 1.42-.89.38-.46.62-1.03.68-1.64.13-.95-.19-1.72-.55-2.57.56 1.12.99 2.48.3 3.97z"
							/>
						</svg>
					</div>
					<p class="font-medium">Nostr</p>
				</div>
			</div>
		</div>

		<!-- Stats Card -->
		<div class="card bg-base-200 rounded-xl p-4">
			<h3 class="mb-4 text-lg font-bold">{$t('profile_availability.your_stats')}</h3>
			<div class="stats stats-vertical shadow">
				<div class="stat">
					<div class="stat-title">{$t('profile_availability.stats.tasks_completed')}</div>
					<div class="stat-value">{$profileStore.stats.tasksCompleted}</div>
					<div class="stat-desc">↗︎ 4 (30%)</div>
				</div>

				<div class="stat">
					<div class="stat-title">{$t('profile_availability.stats.success_rate')}</div>
					<div class="stat-value">{$profileStore.stats.rating}%</div>
					<div class="stat-desc">↗︎ 6%</div>
				</div>

				<div class="stat">
					<div class="stat-title">{$t('profile_availability.stats.response_rate')}</div>
					<div class="stat-value">{$profileStore.stats.responseRate}%</div>
					<div class="stat-desc">↗︎ 2%</div>
				</div>
			</div>
		</div>
	{:else if $profileStore.error}
		<div class="alert alert-outline alert-error">
			<span>{$t('profile_availability.error_load')}</span>
		</div>
	{/if}
</div>
