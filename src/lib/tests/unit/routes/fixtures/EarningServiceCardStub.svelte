<script lang="ts">
	import type { Service } from '$lib/types/service.d';

	type ActionButton = {
		label: string;
		class?: string;
		onclick: (event: MouseEvent) => void;
		icon?: string;
	};

	let {
		service,
		getActionButtons,
		onStatusToggle,
		isTogglingStatus = false
	}: {
		service: Service;
		getActionButtons?: (service: Service) => ActionButton[];
		onStatusToggle?: (event: MouseEvent) => void;
		isTogglingStatus?: boolean;
	} = $props();

	const actions = $derived.by(() => getActionButtons?.(service) ?? []);
</script>

<div data-testid={`service-card-${service.uniqueId ?? service.id}`}>
	<button type="button" onclick={onStatusToggle} disabled={isTogglingStatus}>Toggle Status</button>
	{#each actions as action (action.label)}
		<button type="button" class={action.class} onclick={action.onclick}>
			{action.label}
		</button>
	{/each}
</div>
