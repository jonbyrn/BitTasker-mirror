<script lang="ts">
	import type { Service } from '$lib/types/service.d';

	let {
		service,
		canRequestQuote = true
	}: {
		service: Service;
		canRequestQuote?: boolean;
	} = $props();
</script>

<div data-testid={`service-card-${service.id}`}>
	{#if canRequestQuote}
		<button type="button">Request quote for {service.title}</button>
	{/if}
</div>
