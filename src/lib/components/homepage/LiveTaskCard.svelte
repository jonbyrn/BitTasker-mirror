<script lang="ts">
	import type { LiveTask } from '$lib/types/homepage';
	import { t } from 'svelte-i18n';

	let { task } = $props<{
		task: LiveTask;
	}>();
</script>

<div class="card card-compact bg-base-100 shadow-xl transition-transform hover:scale-105 h-full flex flex-col">
	<figure>
		<img src={task.image} alt={task.title} class="h-48 w-full object-cover" loading="lazy" />
	</figure>
	<div class="card-body flex-1 flex flex-col">
		<div class="h-14 mb-2"> <!-- Fixed height container for title -->
			<h6 class="card-title text-lg line-clamp-2 min-h-[3.5rem]">{task.title}</h6>
		</div>
		<div class="flex items-center justify-between">
			<span class="text-lg font-bold text-accent">${task.budget}</span>
			<span class="text-sm text-base-content/70">{task.proposals} {$t('dashboard.bids.components.homepage.live_task_card.proposals')}</span>
		</div>
		<div class="card-actions items-center justify-between mt-auto">
			<span class="text-sm text-base-content/70">{$t('dashboard.bids.components.homepage.live_task_card.time_left')} {task.timeLeft}</span>
			<button class="btn btn-primary btn-sm">{$t('dashboard.bids.components.homepage.live_task_card.bid_now')}</button>
		</div>
	</div>
</div>
