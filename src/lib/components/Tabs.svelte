<script lang="ts">
	const {
		tabs,
		activeTab,
		onTabChange,
		evenSplit = false
	} = $props<{
		tabs: { id: string; label: string }[];
		activeTab: string;
		onTabChange: (tabId: string) => void;
		evenSplit?: boolean;
	}>();
</script>

{#if evenSplit}
	<div
		class="tabs tabs-bordered grid w-full"
		style="grid-template-columns: repeat({tabs.length}, 1fr)"
	>
		{#each tabs as tab (tab.id)}
			<button
				class="tab text-center {activeTab === tab.id ? 'tab-active active-tab' : ''}"
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
{:else}
	<div
		class="tabs-container no-scrollbar relative overflow-x-auto pb-2 md:overflow-visible md:pb-4"
	>
		<div class="tabs tabs-bordered flex w-full min-w-0 flex-wrap">
			{#each tabs as tab (tab.id)}
				<button
					class="tab {activeTab === tab.id ? 'tab-active active-tab' : ''}"
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
{/if}

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
		background-color: oklch(var(--p));
		border-radius: 1px;
	}
</style>
