<script lang="ts">
	const { tabs, activeTab, onTabChange } = $props<{
		tabs: { id: string; label: string }[];
		activeTab: string;
		onTabChange: (tabId: string) => void;
	}>();
</script>

<div class="tabs-container no-scrollbar relative overflow-x-auto pb-2 md:overflow-visible md:pb-4">
	<div class="tabs tabs-bordered min-w-max snap-x snap-mandatory flex-nowrap overflow-x-auto">
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
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}

	.no-scrollbar {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}

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
