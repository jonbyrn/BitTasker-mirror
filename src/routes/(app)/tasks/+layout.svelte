<script lang="ts">
	import PublicListingLayoutShell from '$lib/components/listing/PublicListingLayoutShell.svelte';
	import { page } from '$app/state';

	let { children } = $props();

const isTaskDetailsRoute = $derived(
	page.url.pathname.startsWith('/tasks/') && page.url.pathname !== '/tasks'
);
</script>

<svelte:head>
	<title>Tasks - BitTasker</title>
	<meta
		name="description"
		content="Browse and search for tasks on BitTasker."
	/>
</svelte:head>
<PublicListingLayoutShell
	layoutClassName="tasks-layout"
	activeSectionId="find-tasks"
	activeBasePath="/tasks"
	isDetailsRoute={isTaskDetailsRoute}
>
	{@render children?.()}
</PublicListingLayoutShell>
