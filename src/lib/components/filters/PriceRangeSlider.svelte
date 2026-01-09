<script lang="ts">
	import { getBudgetTiersForCurrency, getBudgetTiersForRange } from '$lib/utils/helpers/budgetTier';
	import { t } from 'svelte-i18n';
	// Props with bindable tier
	let { 
		onRangeChange, 
		currency = $bindable(), 
		tier = $bindable<string | undefined>(undefined)
	} = $props<{
		onRangeChange: (tier: string | undefined) => void;
		currency: string | undefined;
		tier?: string | undefined;
	}>();

	let { minBudget, maxBudget } = $state<{
		minBudget: number | undefined;
		maxBudget: number | undefined;
	}>({
		minBudget: undefined,
		maxBudget: undefined
	});

	// Track selected tier - sync with bound tier prop
	let selectedTier = $state<string | undefined>(tier);
	
	// Track last tier value to prevent loops
	let lastTier = $state<string | undefined>(tier);

	// Apply preset range
	function applyPreset(min: number, max: number | null) {
		minBudget = min;
		maxBudget = max !== null ? max : undefined;

		const newTier = getBudgetTiersForRange(minBudget, maxBudget, currency);
		selectedTier = newTier === null ? undefined : newTier;
		
		// Update bound tier value
		tier = newTier === null ? undefined : newTier;
		lastTier = tier;

		// Notify parent component (for backwards compatibility)
		onRangeChange(newTier === null ? undefined : newTier);
	}

	// Clear budget tier
	const clearBudgetTier = () => {
		minBudget = undefined;
		maxBudget = undefined;
		selectedTier = undefined;
		tier = undefined;
		lastTier = undefined;
		onRangeChange(undefined);
	};
</script>

<!-- Preset ranges -->
<div>
	<label class="label mb-1 p-0" for="presetRanges">
		<small class=""
			>{$t('dashboard.bids.components.filters.price_range.common_ranges')}</small
		>
		<button class="btn btn-xs" onclick={clearBudgetTier}
			>{$t('dashboard.bids.components.filters.price_range.clear')}</button
		>
	</label>
	<div class="flex flex-wrap gap-2">
		{#each getBudgetTiersForCurrency(currency || 'USD') as preset}
			<button 
				class="btn btn-sm transition-all duration-200"
				class:btn-primary={selectedTier === preset.tier}
				onclick={() => applyPreset(preset.min, preset.max)}
			>
				{preset.label}
				
			</button>
		{/each}
	</div>
</div>
