<script lang="ts">
	let {
		tabs = [],
		activeTab,
		onTabChange
	}: {
		tabs?: { id: string; label: string }[];
		activeTab?: string;
		onTabChange?: (tabId: string) => void;
	} = $props();
</script>

<div data-testid="tabs-stub">
	{#each tabs as tab (tab.id)}
		<button
			type="button"
			role="tab"
			aria-selected={activeTab === tab.id}
			onclick={() => onTabChange?.(tab.id)}
		>
			{tab.label}
		</button>
	{/each}
</div>
