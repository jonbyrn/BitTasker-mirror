<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { getCookie } from '$lib/utils/helpers/cookies';
	import { StorageKeys } from '$lib/utils/constants/storage';
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

		try {
			// Check if user has already acknowledged the warning
			const hasAcknowledged = await getCookie(StorageKeys.WARNING_ACKNOWLEDGED);
			
			// Show warning if user hasn't acknowledged it yet
			showWarning = !hasAcknowledged;
		} catch (error) {
			console.error('Error checking warning acknowledgment:', error);
			// If there's an error, don't show the warning to avoid blocking the user
			showWarning = false;
		} finally {
			isLoaded = true;
		}
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
