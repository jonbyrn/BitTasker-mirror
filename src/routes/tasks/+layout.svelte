<script lang="ts">

	let { children } = $props();

	// Allow authenticated users to view public pages
	// No automatic redirect - let users choose between public and protected views
</script>

<svelte:head>
	<title>Task Details - BitTasker</title>
	<meta
		name="description"
		content="Here you can see the details of the task."
	/>
</svelte:head>

<div class="h-full pt-4 w-full">
	<!-- Main content -->
	<main class="flex-1">
		{@render children()}
	</main>

</div>
