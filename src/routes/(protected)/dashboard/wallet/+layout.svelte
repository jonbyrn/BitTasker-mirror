<script lang="ts">
	import { initWasm } from '$lib/wallet/breez/wasmLoader';
	import { onMount } from 'svelte';
	const { children } = $props();

	onMount(async () => {
		await initWasm();
	});
</script>

{@render children()}
