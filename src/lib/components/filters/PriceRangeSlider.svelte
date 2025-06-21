<!-- 
  PriceRangeSlider.svelte
  Dual-handle slider component for selecting price/budget ranges
-->
<script lang="ts">
	import { getBudgetTiersForCurrency, getBudgetTiersForRange } from '$lib/utils/helpers/budgetTier';
	import Input from '$lib/components/Input.svelte';
	// Props
	let { onRangeChange, currency = $bindable() } = $props<{
		onRangeChange: (tier: string) => void;
		currency: string | undefined;
	}>();

	// Default price range settings
	const ABSOLUTE_MIN = 0;
	const ABSOLUTE_MAX = 10000000000; // Default 10 billion

	let { minBudget, maxBudget } = $state<{
		minBudget: number | undefined;
		maxBudget: number | undefined;
	}>({
		minBudget: undefined,
		maxBudget: undefined
	});

	// Apply changes when direct input is provided
	function applyInputChanges() {
		// Ensure min <= max
		if (minBudget !== undefined && maxBudget !== undefined && minBudget < maxBudget) {
			const tier = getBudgetTiersForRange(minBudget, maxBudget, currency);
			// Notify parent component
			onRangeChange(tier);
		}
	}

	// Apply preset range
	function applyPreset(min: number, max: number | null) {
		minBudget = min;
		maxBudget = max !== null ? max : undefined;

		const tier = getBudgetTiersForRange(minBudget, maxBudget, currency);

		// Notify parent component
		onRangeChange(tier);
	}

	const handleCurrencyChange = (option: { value: string; label: string }) => {
		currency = option.value === 'All' ? undefined : option.value;
		onRangeChange();
	};

	// Clear budget tier
	const clearBudgetTier = () => {
		minBudget = undefined;
		maxBudget = undefined;
		onRangeChange(undefined);
	};
</script>

<!-- Direct input fields -->
<div class="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
	<div class="col-span-2 sm:col-span-1">
		<label class="label mb-1 p-0" for="min">
			<span class="label-text">Currency</span>
		</label>
		<Input
			type="select"
			options={[
				{ value: 'All', label: 'All' },
				{ value: 'USD', label: 'USD' },
				{ value: 'BTC', label: 'BTC' }
			]}
			value={currency}
			className="input-sm"
			onChange={handleCurrencyChange}
		/>
	</div>
	<div>
		<label class="label mb-1 p-0" for="min">
			<span class="label-text">Min <small>({currency || 'All'})</small></span>
		</label>
		<input
			type="number"
			placeholder="Min"
			class="input input-bordered input-sm w-full"
			bind:value={minBudget}
			oninput={applyInputChanges}
			min={ABSOLUTE_MIN}
		/>
	</div>
	<div>
		<label class="label mb-1 p-0" for="max">
			<span class="label-text">Max <small>({currency || 'All'})</small></span>
		</label>
		<input
			type="number"
			placeholder="Max"
			class="input input-bordered input-sm w-full"
			bind:value={maxBudget}
			oninput={applyInputChanges}
			max={ABSOLUTE_MAX}
		/>
	</div>
</div>

<!-- Preset ranges -->
<div>
	<label class="label mb-1 p-0" for="presetRanges">
		<span class="label-text">Common Ranges</span>
		<button class="btn btn-xs" onclick={clearBudgetTier}>Clear</button>
	</label>
	<div class="flex flex-wrap gap-2">
		{#each getBudgetTiersForCurrency(currency || 'USD') as preset}
			<button class="btn btn-xs" onclick={() => applyPreset(preset.min, preset.max)}>
				{preset.label}
			</button>
		{/each}
	</div>
</div>
