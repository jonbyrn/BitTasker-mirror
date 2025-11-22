<script lang="ts">
	import type { LiveTask } from '$lib/types/homepage';
	import TranslatableTask from '$lib/components/task/TranslatableTask.svelte';

	let { task } = $props<{
		task: LiveTask;
	}>();

	// Handle click to navigate to task details
	const handleTaskClick = () => {
		// Use uniqueId if available, fallback to id for backward compatibility
		const taskIdentifier = (task as any).uniqueId || task.id;
		window.location.href = `/tasks/${taskIdentifier}`;
	};

	// Handle keyboard events for accessibility
	const handleKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleTaskClick();
		}
	};
</script>

<div 
	class="card card-compact bg-base-100 shadow-xl transition-transform hover:scale-105 h-full flex flex-col cursor-pointer" 
	role="button"
	tabindex="0"
	onclick={handleTaskClick}
	onkeydown={handleKeyDown}
	aria-label="View task: {task.title}"
>
	{#if task.image}
		<figure>
			<img src={task.image} alt={task.title} class="h-48 w-full object-cover" loading="lazy" />
		</figure>
	{:else}
		<div class="h-48 w-full bg-base-200 flex items-center justify-center">
			<div class="text-center text-base-content/50">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12 mx-auto mb-2">
					<path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
				</svg>
				<p class="text-sm">No image</p>
			</div>
		</div>
	{/if}
	<div class="card-body flex-1 flex flex-col">
		<div class="h-14 mb-2"> <!-- Fixed height container for title -->
			<div class="card-title text-lg line-clamp-2 min-h-[3.5rem]">
				<TranslatableTask task={task} showDescription={false} showToggle={false} titleClass="card-title text-lg line-clamp-2 min-h-[3.5rem]" />
			</div>
		</div>
		<div class="flex items-center justify-between">
			<span class="text-lg font-bold text-accent">${task.budget}</span>
		</div>
		<div class="card-actions items-center justify-between mt-auto">
			<span class="text-sm text-base-content/70">Time left: {task.timeLeft}</span>
			<button class="btn btn-primary btn-sm" onclick={(e) => { e.stopPropagation(); handleTaskClick(); }}>View Task</button>
		</div>
	</div>
</div>
