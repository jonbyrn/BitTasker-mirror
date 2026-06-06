<script lang="ts">
	import { t } from 'svelte-i18n';
	import ActionsMenu from '$lib/components/moderation/ActionsMenu.svelte';
	import { formatTime12Hour } from '$lib/utils/helpers/dateFormatter';
	import IconStar from '~icons/mdi/star';
	import IconBriefcase from '~icons/mdi/briefcase';
	import IconWrench from '~icons/mdi/wrench';
	import IconImage from '~icons/mdi/image';

	let {
		hexPubkey,
		username,
		rating,
		reviewCount = 0,
		tasksCompleted = 0,
		skillsCount = 0,
		portfolioCount = 0,
		availability,
		isLoading = false
	}: {
		hexPubkey: string;
		username: string;
		rating: number | null;
		reviewCount?: number;
		tasksCompleted?: number;
		skillsCount?: number;
		portfolioCount?: number;
		availability?: {
			timeSlots?: Array<{ day: number; start: string; end: string }>;
			noticeHours?: number;
			maxBookingsPerDay?: number;
		};
		isLoading?: boolean;
	} = $props();

	const formattedRating = $derived(rating !== null ? rating.toFixed(1) : null);

	// Availability helper functions
	function formatTimeSlot(start: string, end: string): string {
		return `${formatTime12Hour(start)} - ${formatTime12Hour(end)}`;
	}

	function getDaySchedule(
		timeSlots: Array<{ day: number; start: string; end: string }>,
		dayNumber: number
	) {
		const slot = timeSlots.find((s) => s.day === dayNumber);
		return slot
			? { available: true, hours: formatTimeSlot(slot.start, slot.end) }
			: { available: false };
	}

	const schedule = $derived.by(() => {
		if (!availability?.timeSlots) return [];
		const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
		return dayKeys.map((dayKey, index) => {
			const data = getDaySchedule(availability.timeSlots!, index);
			return { ...data, label: $t(`days.${dayKey}`) };
		});
	});
</script>

<!-- Desktop sidebar - hidden on mobile -->
<aside class="hidden md:block md:w-80 lg:w-96">
	<div class="sticky top-32 space-y-4">
		{#if isLoading}
			<div class="animate-pulse space-y-4">
				<div class="bg-base-300 h-48 rounded-lg"></div>
				<div class="bg-base-300 h-32 rounded-lg"></div>
			</div>
		{:else}
			<!-- Performance Stats -->
			<div class="bg-base-100 border-base-300 rounded-lg border p-4">
				<h3 class="text-base-content mb-3 text-sm font-semibold tracking-wider uppercase">
					{$t('common.profile.performance')}
				</h3>
				<div class="space-y-3">
					<!-- Tasks completed -->
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<IconBriefcase class="text-base-content/50 h-4 w-4" aria-hidden="true" />
							<span class="text-base-content/70 text-sm"
								>{$t('common.profile.tasks_completed')}</span
							>
						</div>
						<span class="text-base-content font-semibold">{tasksCompleted}</span>
					</div>

					<!-- Rating -->
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<IconStar class="text-warning h-4 w-4" aria-hidden="true" />
							<span class="text-base-content/70 text-sm">{$t('common.profile.rating')}</span>
						</div>
						{#if formattedRating}
							<span
								class="text-base-content font-semibold"
								aria-label="{formattedRating} {$t('common.profile.out_of')} 5, {reviewCount} {$t(
									'common.reviews'
								)}"
							>
								<IconStar class="text-warning inline h-3 w-3" aria-hidden="true" />
								{formattedRating} ({reviewCount})
							</span>
						{:else}
							<span class="text-base-content/50 text-sm">—</span>
						{/if}
					</div>

					<!-- Skills count -->
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<IconWrench class="text-base-content/50 h-4 w-4" aria-hidden="true" />
							<span class="text-base-content/70 text-sm">{$t('common.profile.skills')}</span>
						</div>
						<span class="text-base-content font-semibold">{skillsCount}</span>
					</div>

					<!-- Portfolio count -->
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<IconImage class="text-base-content/50 h-4 w-4" aria-hidden="true" />
							<span class="text-base-content/70 text-sm"
								>{$t('common.profile.portfolio_items')}</span
							>
						</div>
						<span class="text-base-content font-semibold">{portfolioCount}</span>
					</div>
				</div>
			</div>

			<!-- Availability Widget -->
			{#if availability?.timeSlots?.length}
				<div class="bg-base-100 border-base-300 rounded-lg border p-4">
					<h3 class="text-base-content mb-3 text-sm font-semibold tracking-wider uppercase">
						{$t('common.profile.availability')}
					</h3>
					<div class="space-y-1.5">
						{#each schedule as day (day.label)}
							<div class="flex items-center justify-between text-sm">
								<span class="text-base-content/70">{day.label}</span>
								{#if day.available}
									<span class="text-success font-medium">{day.hours}</span>
								{:else}
									<span class="text-base-content/40">—</span>
								{/if}
							</div>
						{/each}
					</div>
					{#if availability.maxBookingsPerDay}
						<p class="text-base-content/50 border-base-300 mt-3 border-t pt-2 text-xs">
							{$t('common.profile.max_bookings_per_day', {
								values: { count: availability.maxBookingsPerDay }
							})}
						</p>
					{/if}
				</div>
			{:else}
				<div class="bg-base-100 border-base-300 rounded-lg border p-4">
					<h3 class="text-base-content mb-2 text-sm font-semibold tracking-wider uppercase">
						{$t('common.profile.availability')}
					</h3>
					<p class="text-base-content/50 text-sm">{$t('common.profile.availability_not_set')}</p>
				</div>
			{/if}

			<!-- Actions: Report -->
			<div class="bg-base-100 border-base-300 rounded-lg border p-4">
				<div class="flex items-center justify-between">
					<span class="text-base-content/70 text-sm">{$t('common.profile.actions')}</span>
					<ActionsMenu
						contentType="user"
						reportedPubkey={hexPubkey}
						{username}
						profileMode={true}
					/>
				</div>
			</div>
		{/if}
	</div>
</aside>
