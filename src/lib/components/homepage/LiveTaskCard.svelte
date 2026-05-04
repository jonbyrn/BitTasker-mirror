<script lang="ts">
	import type { LiveTask } from '$lib/types/homepage';
	import FeaturedHomepageCardShell from '$lib/components/homepage/FeaturedHomepageCardShell.svelte';

	let { task } = $props<{
		task: LiveTask;
	}>();
</script>

<FeaturedHomepageCardShell
	href={`/tasks/${task.id}`}
	title={task.title}
	description={task.description || ''}
	price={`$${task.budget}`}
	priceLabel="Budget"
	location={task.location}
	image={task.image}
	imageAlt={task.title}
	ctaLabel="View Task"
	testId="featured-task-card"
/>
