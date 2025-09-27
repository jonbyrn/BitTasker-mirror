<!-- 
  RecommendedTasks.svelte
  Component that displays personalized task recommendations
  with explanations of why they're recommended
-->
<script lang="ts">
	import type { Task, TaskRecommendation } from '$lib/types/task.d';
	import { user } from '$lib/stores/user.store';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import { getRecommendedTasks, updatePreferencesFromFeedback } from '$lib/nostr/recommendations';
	import { t } from 'svelte-i18n';
	let { onSelectTask } = $props<{
		onSelectTask: (task: Task) => void;
	}>();

	// State
	let limit = 10;
	let recommendations = $state<TaskRecommendation[]>([]);
	let loaders = $state({
		data: false,
		feedbackPositive: false,
		feedbackNegative: false
	});
	let error = $state<string | null>(null);

	// Load recommendations on component mount
	loadRecommendations();

	// Function to load recommendations using Nostr=
	async function loadRecommendations() {
		try {
			loaders.data = true;
			error = null;

			recommendations = await getRecommendedTasks(limit);
		} catch (err) {
			error = $t('common.components.recommendations.error.load_failed');
			console.error('Error loading recommendations:', err);
		} finally {
			loaders.data = false;
		}
	}

	// Refresh recommendations - same as load since Nostr system handles caching
	async function refreshRecommendations() {
		await loadRecommendations();
	}

	// Enhanced feedback tracking that updates user preferences
	async function provideRecommendationFeedback(index: number, isRelevant: boolean) {
		if (index === -1) return;

		const recommendation = recommendations[index];

		try {
			loaders.feedbackPositive = isRelevant;
			// Update user preferences based on feedback
			await updatePreferencesFromFeedback(
				isRelevant,
				recommendation.matchedSkills || [],
				recommendation.matchedCategories || []
			);

			// Update the reason text to show feedback was recorded
			recommendations[index] = {
				...recommendations[index],
				reason: isRelevant
					? $t('common.components.recommendations.feedback.thanks_more')
					: $t('common.components.recommendations.feedback.thanks_fewer')
			};
		} catch (error) {
			console.error('Error updating preferences from feedback:', error);

			// Fallback to visual feedback only if preference update fails
			recommendations[index] = {
				...recommendations[index],
				reason: isRelevant ? $t('common.components.recommendations.feedback.thanks_simple') : $t('common.components.recommendations.feedback.thanks_fewer')
			};
		} finally {
			loaders.feedbackPositive = false;
		}
	}
</script>

<section class="bg-base-200 mb-8">
	<div class="mb-4 flex items-center justify-between">
		<h3 class="">{$t('recommendations.type.title')}</h3> 
		<!-- <button class="btn btn-sm btn-ghost" onclick={refreshRecommendations} disabled={loaders.data}>
			{#if loaders.data}
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
			{$t('recommendations.type.update')} 
		</button> -->
	</div>

	{#if error}
		<div class="alert alert-error alert-outline">
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
			<button class="btn btn-sm" onclick={loadRecommendations}>{$t('common.components.recommendations.error.generate')}</button>
		</div>
	{:else if loaders.data}
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
			<p class="text-lg font-semibold">{$t('recommendations.type.not_found')}</p>
			<p class="mb-4 text-gray-500">{$t('recommendations.type.description')}</p>
			<button class="btn btn-primary" onclick={refreshRecommendations}
				>{$t('common.components.recommendations.error.generate')}</button
			>
		</div>
	{:else}
		<!-- Recommendations carousel -->
		<div class="card bg-base-100 space-y-4 rounded-xl shadow-md">
			{#each recommendations as item, index}
				<!-- Task info -->
				<div class="card-body">
					<div class="flex items-start justify-between">
						<h3 class="card-title text-lg">{item.task.title}</h3>
						{#if item.task.isBoosted}
							<div class="badge badge-secondary">{$t('recommend.featured')}</div>
						{/if}
					</div>

					<p class="line-clamp-2 text-sm">{item.task.description}</p>

					<div class="mt-2 flex items-center justify-between">
						<div class="badge badge-outline">
							{item.task.taskType === 'remote' ? $t('recommend.remote') : $t('recommend.in_person')}
						</div>
						<div class="font-semibold">
							{item.task.budget?.amount || 'TBD'}{item.task.budget?.currency || ''}
						</div>
					</div>

					{#if item.task.skills && item.task.skills.length > 0}
						<div class="mt-1 flex flex-wrap gap-1">
							{#each item.task.skills.slice(0, 3) as skill}
								<span class="badge badge-sm badge-primary">{skill}</span>
							{/each}
							{#if item.task.skills.length > 3}
								<span class="badge badge-sm badge-ghost">+{item.task.skills.length - 3}</span>
							{/if}
						</div>
					{/if}

					<!-- Recommendation reason -->
					<div class="mt-3 border-t pt-2">
						<div class="flex items-center gap-1 text-xs">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-3 w-3"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M13 10V3L4 14h7v7l9-11h-7z"
								/>
							</svg>
							{item.reason}
						</div>

						<!-- Feedback buttons -->
						<div class="mt-2 flex items-center justify-end gap-2">
							<button
								class="btn btn-xs btn-neutral"
								onclick={(e) => {
									e.stopPropagation();
									provideRecommendationFeedback(index, false);
								}}
							>
								{#if loaders.feedbackNegative}
									<div class="loading loading-spinner loading-xs"></div>
								{:else}
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
								{/if}
								{$t('recommend.reject')}
							</button>
							<button
								class="btn btn-xs btn-neutral"
								onclick={(e) => {
									e.stopPropagation();
									provideRecommendationFeedback(index, true);
								}}
							>
								{#if loaders.feedbackPositive}
									<div class="loading loading-spinner loading-xs"></div>
								{:else}
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
								{/if}
								{$t('recommend.accept')}
							</button>

							<button
								class="btn btn-primary btn-xs self-end"
								class:btn-disabled={item.task.status !== TaskStatusEnum.OPEN ||
									item.task?.npub === $user?.npub}
								onclick={() => onSelectTask(item.task)}
								aria-label="Bid on this task"
							>
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
										d="M12 4v16m8-8H4"
									/>
								</svg>
								{item.task.status === TaskStatusEnum.OPEN
									? $t('recommend.bid')
									: $t('recommend.closed')}
							</button>
						</div>
					</div>
				</div>

				{#if index < recommendations.length - 1}
					<div class="divider mx-auto w-[90%]"></div>
				{/if}
			{/each}
		</div>
	{/if}
</section>
