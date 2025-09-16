<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import { authState } from '$lib/stores/auth.store';

	let { children } = $props();

	// Redirect authenticated users to protected routes
	$effect(() => {
		if ($authState.isAuthenticated) {
			// If user is logged in, redirect to protected route
			if ($page.url.pathname.startsWith('/tasks')) {
				const protectedPath = $page.url.pathname.replace('/tasks', '/dashboard');
				goto(protectedPath);
			}
		}
	});
</script>

<svelte:head>
	<title>{$t('dashboard.task_details_by_task.title')} - BitTasker</title>
	<meta
		name="description"
		content={$t('dashboard.task_details_by_task.description')}
	/>
</svelte:head>

<div class="h-full pt-4">
	<!-- Main content -->
	<main class="flex-1">
		{@render children()}
	</main>

</div>
