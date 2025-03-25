<script lang="ts">
	import { isAuthenticated, authLoading } from '$lib/stores/auth';
	const { children } = $props();
</script>

{#if $authLoading}
	<div class="flex h-full w-full flex-col items-center justify-center">
		<span class="loading loading-spinner loading-xl"></span>
		<p>Loading...</p>
	</div>
{:else if $isAuthenticated}
	{@render children()}
{:else}
	<!-- This shouldn't be seen since the +layout.ts should redirect -->
	<div class="flex h-full w-full flex-col items-center justify-center">
		<p>Redirecting to login...</p>
	</div>
{/if}
