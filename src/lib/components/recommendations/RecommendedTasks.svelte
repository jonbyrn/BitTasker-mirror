<!-- 
  RecommendedTasks.svelte
  Component that displays personalized task recommendations
  with explanations of why they're recommended
-->
<script lang="ts">
	import type { TaskData } from '$lib/types/task.d';
	import recommendationsService from '$lib/api/services/recommendations.service';
	import RecommendationReason from '$lib/components/recommendations/RecommendationReason.svelte';

	// Props
	let { limit, onTaskClick } = $props<{ limit: number; onTaskClick: (taskId: string) => void }>();

	// State
	let recommendations = $state<
		Array<{
			task: TaskData;
			reason: {
				type:
					| 'skill_match'
					| 'category_preference'
					| 'location_based'
					| 'budget_range'
					| 'client_history';
				score: number;
				description: string;
			};
		}>
	>([]);

	let isLoading = $state(false);
	let error = $state<string | null>(null);

	// Load recommendations on component mount
	loadRecommendations();

	// Function to load recommendations
	async function loadRecommendations() {
		try {
			isLoading = true;
			error = null;

			const response = await recommendationsService.getRecommendations(limit);
			recommendations = response.recommendations;
		} catch (err) {
			error = 'Failed to load recommendations. Please try again.';
			console.error('Error loading recommendations:', err);
		} finally {
			isLoading = false;
		}
	}

	// Refresh recommendations
	async function refreshRecommendations() {
		try {
			isLoading = true;
			error = null;

			const response = await recommendationsService.generateFreshRecommendations();
			recommendations = response.recommendations;
		} catch (err) {
			error = 'Failed to refresh recommendations. Please try again.';
			console.error('Error refreshing recommendations:', err);
		} finally {
			isLoading = false;
		}
	}

	// Handle task click
	function handleTaskClick(taskId: string) {
		// Record the interaction for improved recommendations
		recommendationsService
			.markRecommendationViewed(taskId, 'clicked')
			.catch((err) => console.error('Error recording recommendation view:', err));

		// Call the parent handler
		onTaskClick(taskId);
	}

	// Provide feedback on recommendation
	function provideRecommendationFeedback(taskId: string, isRelevant: boolean) {
		recommendationsService
			.provideFeedback(taskId, isRelevant)
			.then(() => {
				// Visual feedback to user that their input was recorded
				const task = recommendations.find((rec) => rec.task.id.toString() === taskId);
				if (task) {
					// Update the UI to show feedback was recorded
					task.reason.description = isRelevant
						? 'Thanks for your positive feedback!'
						: "We'll show you fewer tasks like this.";
				}
			})
			.catch((err) => console.error('Error providing recommendation feedback:', err));
	}
</script>

<section class="bg-base-200 mb-8">
	<div class="mb-4 flex items-center justify-between">
		<h2 class="text-xl font-bold">Recommended For You</h2>
		<button class="btn btn-sm btn-ghost" onclick={refreshRecommendations} disabled={isLoading}>
			{#if isLoading}
				<div class="loading loading-spinner loading-xs"></div>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
					/>
				</svg>
			{/if}
			Refresh
		</button>
	</div>

	{#if error}
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
			<button class="btn btn-sm" onclick={loadRecommendations}>Try Again</button>
		</div>
	{:else if isLoading}
		<div class="flex justify-center p-10">
			<div class="loading loading-spinner loading-lg"></div>
		</div>
	{:else if recommendations.length === 0}
		<div class="bg-base-100 rounded-xl p-6 text-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-primary mx-auto mb-4 h-12 w-12"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
				/>
			</svg>
			<p class="text-lg font-semibold">No recommendations yet</p>
			<p class="mb-4 text-gray-500">
				As you engage with tasks, we'll learn your preferences and provide personalized
				recommendations.
			</p>
			<button class="btn btn-primary" onclick={refreshRecommendations}>
				Generate Recommendations
			</button>
		</div>
	{:else}
		<!-- Recommendations carousel -->
		<div class="carousel carousel-center rounded-box max-w-full space-x-4 p-2">
			{#each recommendations as recommendation}
				<div class="carousel-item w-full p-2 md:w-96">
					<div
						role="button"
						tabindex="0"
						onkeydown={(e) => {
							e.preventDefault();
							handleTaskClick(recommendation.task.id.toString());
						}}
						class="card bg-base-100 transform cursor-pointer shadow-md transition hover:scale-[1.02]"
						onclick={() => handleTaskClick(recommendation.task.id.toString())}
					>
						<!-- Task info -->
						<div class="card-body">
							<div class="flex items-start justify-between">
								<h3 class="card-title text-lg">{recommendation.task.title}</h3>
								{#if recommendation.task.isBoosted}
									<div class="badge badge-secondary">Featured</div>
								{/if}
							</div>

							<p class="line-clamp-2 text-sm">{recommendation.task.description}</p>

							<div class="mt-2 flex items-center justify-between">
								<div class="badge badge-outline">
									{recommendation.task.taskType === 'REMOTE' ? 'Remote' : 'In Person'}
								</div>

								<div class="font-semibold">
									{recommendation.task.budget}
									{recommendation.task.currency || 'BTC'}
								</div>
							</div>

							<!-- Recommendation reason -->
							<div class="mt-3 border-t pt-2">
								<RecommendationReason
									type={recommendation.reason.type}
									description={recommendation.reason.description}
								/>

								<!-- Feedback buttons -->
								<div class="mt-2 flex justify-end gap-2">
									<button
										class="btn btn-xs btn-ghost"
										onclick={(e) => {
											e.stopPropagation();
											provideRecommendationFeedback(recommendation.task.id.toString(), false);
										}}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M6 18L18 6M6 6l12 12"
											/>
										</svg>
										Not for me
									</button>
									<button
										class="btn btn-xs btn-ghost"
										onclick={(e) => {
											e.stopPropagation();
											provideRecommendationFeedback(recommendation.task.id.toString(), true);
										}}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017a2 2 0 01-1.386-.54l-2.892-2.893a2 2 0 012.77-2.883L12 17l6-6z"
											/>
										</svg>
										Relevant
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>

		<!-- Navigation dots -->
		{#if recommendations.length > 1}
			<div class="flex w-full justify-center gap-2 py-2">
				{#each recommendations as _, i}
					<button class="btn btn-xs btn-circle">{i + 1}</button>
				{/each}
			</div>
		{/if}
	{/if}
</section>
