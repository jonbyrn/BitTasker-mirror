<!-- 
  HistoryBasedSuggestions.svelte
  Component that displays suggestions based on user's task history
  and platform interaction patterns
-->
<script lang="ts">
	import type { TaskData } from '$lib/types/task.d';
	import userHistoryService from '$lib/api/services/user-history.service';

	// Props
	let { onTaskClick } = $props<{ onTaskClick: (taskId: string) => void }>();

	// State
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	// History-based data
	let recentlyViewed = $state<TaskData[]>([]);
	let taskInteractionStats = $state<{
		categoryPreferences: Array<{ categoryId: number; weight: number; name: string }>;
		skillUtilization: Array<{ skillId: number; weight: number; name: string }>;
		budgetRangePreference: { min: number; max: number; currency: string };
		locationPreferences: Array<{
			latitude: number;
			longitude: number;
			radius: number;
			weight: number;
		}>;
		availabilityPatterns: {
			preferredDays: Array<{ day: string; weight: number }>;
			preferredTimeOfDay: Array<{
				timeSlot: 'morning' | 'midday' | 'afternoon' | 'evening';
				weight: number;
			}>;
		};
	} | null>(null);

	let engagedTasks = $state<{
		bidTasks: TaskData[];
		savedTasks: TaskData[];
		viewedTasks: TaskData[];
	}>({
		bidTasks: [],
		savedTasks: [],
		viewedTasks: []
	});

	// Load user history data
	async function loadUserHistoryData() {
		try {
			isLoading = true;
			error = null;

			// Load data in parallel
			const [recentlyViewedData, statsData, engagedTasksData] = await Promise.all([
				userHistoryService.getRecentlyViewedTasks(),
				userHistoryService.getTaskInteractionStats(),
				userHistoryService.getEngagedTasks()
			]);

			recentlyViewed = recentlyViewedData;
			taskInteractionStats = statsData;
			engagedTasks = engagedTasksData;
		} catch (err) {
			console.error('Error loading user history data:', err);
			error = 'Failed to load your task history and preferences.';
		} finally {
			isLoading = false;
		}
	}

	// Call on component mount
	loadUserHistoryData();

	// Handle task click
	function handleTaskClick(taskId: string) {
		// Record view event
		userHistoryService
			.recordTaskView(taskId)
			.catch((err) => console.error('Error recording task view:', err));

		// Call the parent handler
		onTaskClick(taskId);
	}

	// Get time of day preference label
	function getTimeOfDayPreferenceLabel(timeSlot: string): string {
		switch (timeSlot) {
			case 'morning':
				return 'Morning (6am-12pm)';
			case 'midday':
				return 'Midday (12pm-3pm)';
			case 'afternoon':
				return 'Afternoon (3pm-6pm)';
			case 'evening':
				return 'Evening (6pm-10pm)';
			default:
				return timeSlot;
		}
	}
</script>

<div class="mb-8">
	<h2 class="mb-4 text-xl font-bold">Your Task Preferences</h2>

	{#if isLoading}
		<div class="flex justify-center p-6">
			<div class="loading loading-spinner loading-lg"></div>
		</div>
	{:else if error}
		<div class="alert alert-error">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span>{error}</span>
			<button class="btn btn-sm" onclick={loadUserHistoryData}>Try Again</button>
		</div>
	{:else if !taskInteractionStats}
		<div class="bg-base-200 rounded-md p-6 text-center">
			<p class="text-lg font-semibold">No task history yet</p>
			<p class="text-gray-500">
				Start browsing and engaging with tasks to see personalized insights.
			</p>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
			<!-- Category Preferences Card -->
			<div class="card bg-base-200">
				<div class="card-body">
					<h3 class="card-title text-md">Your Category Preferences</h3>
					{#if taskInteractionStats.categoryPreferences.length === 0}
						<p class="text-sm">No category preferences yet.</p>
					{:else}
						<div class="mt-2">
							{#each taskInteractionStats.categoryPreferences.slice(0, 5) as category}
								<div class="mb-2 flex items-center gap-2">
									<div class="bg-base-300 h-2.5 w-full rounded-full">
										<div
											class="bg-primary h-2.5 rounded-full"
											style="width: {Math.min(100, category.weight * 100)}%"
										></div>
									</div>
									<span class="text-sm">{category.name}</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- Skill Utilization Card -->
			<div class="card bg-base-200">
				<div class="card-body">
					<h3 class="card-title text-md">Your Top Skills</h3>
					{#if taskInteractionStats.skillUtilization.length === 0}
						<p class="text-sm">No skill preferences yet.</p>
					{:else}
						<div class="mt-2 flex flex-wrap gap-2">
							{#each taskInteractionStats.skillUtilization.slice(0, 8) as skill}
								<div class="badge badge-primary">{skill.name}</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- Budget Preference Card -->
			<div class="card bg-base-200">
				<div class="card-body">
					<h3 class="card-title text-md">Your Budget Preference</h3>
					<div class="py-4 text-center">
						<p class="text-2xl font-bold">
							{taskInteractionStats.budgetRangePreference.min} - {taskInteractionStats
								.budgetRangePreference.max}
							{taskInteractionStats.budgetRangePreference.currency}
						</p>
						<p class="text-sm text-gray-500">Typical budget range</p>
					</div>
				</div>
			</div>

			<!-- Time Preference Card -->
			{#if taskInteractionStats.availabilityPatterns.preferredTimeOfDay.length > 0}
				<div class="card bg-base-200">
					<div class="card-body">
						<h3 class="card-title text-md">Preferred Time of Day</h3>
						<div class="mt-2 grid grid-cols-2 gap-2">
							{#each taskInteractionStats.availabilityPatterns.preferredTimeOfDay as timePreference}
								<div class="flex items-center gap-2">
									<div class="bg-base-300 h-2.5 w-full rounded-full">
										<div
											class="bg-primary h-2.5 rounded-full"
											style="width: {Math.min(100, timePreference.weight * 100)}%"
										></div>
									</div>
									<span class="text-xs">{getTimeOfDayPreferenceLabel(timePreference.timeSlot)}</span
									>
								</div>
							{/each}
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- Recently Viewed Tasks -->
		{#if recentlyViewed.length > 0}
			<div class="mt-8">
				<h3 class="mb-2 text-lg font-bold">Recently Viewed Tasks</h3>
				<div class="carousel carousel-center max-w-full space-x-4 p-2">
					{#each recentlyViewed as task}
						<button
							class="carousel-item w-64 cursor-pointer"
							onclick={() => handleTaskClick(task.id.toString())}
						>
							<div class="card bg-base-100 h-full shadow-sm">
								<div class="card-body p-4">
									<h4 class="card-title line-clamp-1 text-sm">{task.title}</h4>
									<div class="mt-1 flex items-center justify-between">
										<div class="badge badge-outline badge-sm">
											{task.taskType === 'REMOTE' ? 'Remote' : 'In Person'}
										</div>
										<div class="text-sm font-semibold">
											{task.budget}
											{task.currency || 'BTC'}
										</div>
									</div>
								</div>
							</div>
						</button>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>
