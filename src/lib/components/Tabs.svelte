<script lang="ts">
	const { tabs, activeTab, onTabChange } = $props<{
		tabs: { id: string; label: string }[];
		activeTab: string;
		onTabChange: (tabId: string) => void;
	}>();
</script>

<div class="tabs-container relative pb-2 md:pb-4">
	<div class="tabs tabs-bordered w-full">
		{#each tabs as tab (tab.id)}
			<button
				class="tab {activeTab === tab.id ? 'active-tab' : ''}"
				onclick={() => onTabChange(tab.id)}
				aria-selected={activeTab === tab.id}
				role="tab"
				aria-controls="panel-{tab.id}"
				id="tab-{tab.id}"
			>
				{tab.label}
			</button>
		{/each}
	</div>
</div>

<style>
	.tab.active-tab {
		position: relative;
	}

	.tab.active-tab::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		height: 2px;
		background-color: orange;
		border-radius: 1px;
	}
</style>
