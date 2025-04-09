<script lang="ts">
	const { tabs, activeTab, onTabChange } = $props<{
		tabs: { id: string; label: string }[];
		activeTab: string;
		onTabChange: (tabId: string) => void;
	}>();

	// Tab references for slider animation
	let tabContainer = $state<HTMLElement | null>(null);
	let tabElements = $state<Map<string, HTMLElement>>(new Map());
	let sliderStyle = $state('');

	// Register a tab element with its id
	function registerTabElement(id: string, element: HTMLElement | null) {
		if (element) {
			tabElements.set(id, element);
		}
	}

	// Update slider position when active tab changes
	$effect(() => {
		if (tabContainer && activeTab && tabElements.has(activeTab)) {
			const containerRect = tabContainer.getBoundingClientRect();
			const activeElement = tabElements.get(activeTab)!;
			const activeRect = activeElement.getBoundingClientRect();

			// Calculate position relative to container
			const left = activeRect.left - containerRect.left;
			const width = activeRect.width;

			sliderStyle = `left: ${left}px; width: ${width}px;`;
		}
	});
	// Svelte action to bind tab elements
	function bindTabElement(node: HTMLElement, id: string) {
		registerTabElement(id, node);

		return {
			update(newId: string) {
				registerTabElement(newId, node);
			},
			destroy() {
				tabElements.delete(id);
			}
		};
	}
</script>

<div class="tabs-container relative" bind:this={tabContainer}>
	<div class="tabs tabs-bordered w-full">
		{#each tabs as tab}
			<button
				class="tab {activeTab === tab.id ? 'tab-active' : ''}"
				onclick={() => onTabChange(tab.id)}
				aria-selected={activeTab === tab.id}
				role="tab"
				aria-controls="panel-{tab.id}"
				id="tab-{tab.id}"
				use:bindTabElement={tab.id}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	<!-- Animated slider -->
	<div
		class="tab-slider bg-primary absolute bottom-0 h-0.5 transition-all duration-300"
		style={sliderStyle}
	></div>
</div>

<style>
	.tabs-container {
		overflow: hidden;
	}

	.tab-slider {
		height: 2px;
		border-radius: 1px;
	}
</style>
