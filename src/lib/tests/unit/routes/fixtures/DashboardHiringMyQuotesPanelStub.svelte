<script lang="ts">
	import { onMount } from 'svelte';

	let {
		focusedRequestId = null,
		onInvalidFocusedRequest
	} = $props<{
		focusedRequestId?: string | null;
		onInvalidFocusedRequest?: () => void;
	}>();

	onMount(() => {
		if (focusedRequestId === 'qr_missing99') {
			onInvalidFocusedRequest?.();
		}
	});
</script>

<div data-testid="my-quotes-panel">{focusedRequestId ?? ''}</div>
