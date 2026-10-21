<script lang="ts">
	import type { LiveTask } from '$lib/types/homepage';
	import { t } from 'svelte-i18n';
	import FeaturedHomepageCardShell from '$lib/components/homepage/FeaturedHomepageCardShell.svelte';

	let { task } = $props<{
		task: LiveTask;
	}>();
</script>

<FeaturedHomepageCardShell
	href={`/tasks/${encodeURIComponent(task.id)}`}
	title={task.title}
	description={task.description || ''}
	price={`$${task.budget}`}
	priceLabel={$t('common.homepage.featured.tasks.budget')}
	location={task.location}
	image={task.image}
	imageAlt={task.title}
	ctaLabel={$t('common.homepage.featured.tasks.view')}
	testId="featured-task-card"
/>
