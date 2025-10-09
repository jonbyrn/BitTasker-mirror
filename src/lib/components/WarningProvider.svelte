<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import WarningPopup from './WarningPopup.svelte';

	interface Props {
		children: any;
	}

	let { children }: Props = $props();

	let showWarning = $state(false);
	let isLoaded = $state(false);

	onMount(async () => {
		if (!browser) {
			isLoaded = true;
			return;
		}

		// Always show warning on every login
		showWarning = true;
		isLoaded = true;
	});

	function handleWarningClose() {
		showWarning = false;
	}
</script>

<!-- Render children immediately -->
{@render children()}

<!-- Show warning popup if needed -->
{#if isLoaded && showWarning}
	<WarningPopup onClose={handleWarningClose} />
{/if}
