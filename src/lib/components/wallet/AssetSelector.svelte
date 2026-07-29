<script lang="ts">
	export interface AssetOption {
		id: string;
		label: string;
		icon: string;
		symbol?: string;
		balance?: string;
		balanceSub?: string;
		subLabel?: string;
		available?: boolean;
	}

	interface Props {
		selectedId: string;
		onSelect: (id: string) => void;
		assets: AssetOption[];
		expanded: boolean;
		onToggle: () => void;
	}

	let { selectedId, onSelect, assets, expanded, onToggle }: Props = $props();

	let selectedAsset = $derived(assets.find((a) => a.id === selectedId));
	let availableAssets = $derived(assets.filter((a) => a.available !== false));
</script>

<div
	class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
	class:collapse-open={expanded}
>
	<button
		type="button"
		class="collapse-title flex min-h-[44px] items-center gap-2 px-3 py-2.5 pr-10 text-sm font-medium"
		onclick={onToggle}
		aria-expanded={expanded}
		aria-controls="asset-selector-panel"
	>
		{#if selectedAsset}
			<img
				src={selectedAsset.icon}
				alt={selectedAsset.label}
				class="h-5 w-5 shrink-0 rounded-full"
			/>
			<span class="font-medium" id="asset-selector-title">{selectedAsset.label}</span>
			{#if selectedAsset.balance !== undefined}
				<div class="ml-auto text-right">
					<div class="text-xs font-semibold tabular-nums">{selectedAsset.balance}</div>
					{#if selectedAsset.balanceSub}
						<div class="text-base-content/50 text-xs">{selectedAsset.balanceSub}</div>
					{/if}
				</div>
			{/if}
		{/if}
	</button>

	<div
		class="collapse-content px-2"
		id="asset-selector-panel"
		role="region"
		aria-labelledby="asset-selector-title"
	>
		<div class="space-y-1">
			{#each availableAssets as asset (asset.id)}
				<button
					class="flex w-full items-center gap-2 rounded-lg border-2 border-transparent p-2 transition-colors {selectedId ===
					asset.id
						? 'bg-primary/10'
						: 'hover:bg-base-200'}"
					onclick={() => {
						onSelect(asset.id);
						onToggle();
					}}
				>
					<img src={asset.icon} alt={asset.label} class="h-5 w-5 shrink-0 rounded-full" />
					<div class="min-w-0 flex-1 text-left">
						<div class="text-sm font-medium">{asset.label}</div>
						{#if asset.subLabel}
							<div class="text-base-content/50 truncate text-xs">{asset.subLabel}</div>
						{/if}
					</div>
					{#if asset.balance !== undefined}
						<div class="ml-auto shrink-0 text-right">
							<div class="text-xs font-semibold tabular-nums">{asset.balance}</div>
							{#if asset.balanceSub}
								<div class="text-base-content/50 text-xs">{asset.balanceSub}</div>
							{/if}
						</div>
					{/if}
				</button>
			{/each}
		</div>
	</div>
</div>
