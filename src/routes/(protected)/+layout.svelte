<script lang="ts">
	import { authState } from '$lib/stores/auth.store';
	import { appStore } from '$lib/stores/app.store';
	import { initWasm } from '$lib/wallet/breez/wasmLoader';
	const { children } = $props();

	// Load global data when authenticated
	$effect.pre(() => {
		if ($authState.isAuthenticated) {
			appStore.loadGlobalData();
			initWasm();
		}
	});
</script>

{#if $authState.isLoading}
	<div class="flex h-[100dvh] w-full flex-col items-center justify-center">
		<span class="loading loading-spinner loading-xl"></span>
		<p>Loading...</p>
	</div>
{:else if $authState.isAuthenticated}
	{@render children()}
{:else}
	<!-- This shouldn't be seen since the +layout.ts should redirect -->
	<div class="flex h-full w-full flex-col items-center justify-center">
		<p>Redirecting to login...</p>
	</div>
{/if}
