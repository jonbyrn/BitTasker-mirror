<script lang="ts">
	import type { LiveTask } from '$lib/types/homepage';
	import TranslatableTask from '$lib/components/task/TranslatableTask.svelte';

	let { task } = $props<{
		task: LiveTask;
	}>();

	// Handle click to navigate to task details
	const handleTaskClick = () => {
		window.location.href = `/tasks/${task.id}`;
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
	<figure>
		<img 
			src={task.image || '/images/placeholders/were-hiring-task-image-placeholder.jpg'} 
			alt={task.title} 
			class="h-48 w-full object-cover" 
			loading="lazy" 
		/>
	</figure>
	<div class="card-body flex-1 flex flex-col">
		<div class="h-14 mb-2"> <!-- Fixed height container for title -->
			<div class="card-title text-lg line-clamp-2 min-h-14">
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
