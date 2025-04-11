<!-- 
  PriceRangeSlider.svelte
  Dual-handle slider component for selecting price/budget ranges
-->
<script lang="ts">
	// Props
	let { minBudget, maxBudget, onRangeChange, currency } = $props<{
		minBudget: number | undefined;
		maxBudget: number | undefined;
		onRangeChange: (min: number | undefined, max: number | undefined) => void;
		currency?: string;
	}>();

	// Default price range settings
	const ABSOLUTE_MIN = 0;
	const ABSOLUTE_MAX = 10000;

	// Internal state - using string for input control
	let minValue = $state(minBudget?.toString() || '');
	let maxValue = $state(maxBudget?.toString() || '');

	// Slider state values - as numbers
	let sliderMin = $state(minBudget || ABSOLUTE_MIN);
	let sliderMax = $state(maxBudget || ABSOLUTE_MAX);

	// Price distribution for visualization (mock data)
	const priceDistribution = $state([
		{ range: '0-100', count: 45 },
		{ range: '100-500', count: 78 },
		{ range: '500-1000', count: 52 },
		{ range: '1000-2000', count: 34 },
		{ range: '2000-5000', count: 21 },
		{ range: '5000+', count: 12 }
	]);

	// Common preset ranges
	const presetRanges = $state([
		{ label: 'Under 100', min: 0, max: 100 },
		{ label: '100-500', min: 100, max: 500 },
		{ label: '500-1000', min: 500, max: 1000 },
		{ label: '1000-5000', min: 1000, max: 5000 },
		{ label: '5000+', min: 5000, max: null }
	]);

	// Apply changes when direct input is provided
	function applyInputChanges() {
		// Parse input values
		const newMin = minValue ? Number(minValue) : undefined;
		const newMax = maxValue ? Number(maxValue) : undefined;

		// Validate and apply changes
		if (newMin !== undefined && !isNaN(newMin) && newMin >= ABSOLUTE_MIN) {
			sliderMin = newMin;
		}

		if (newMax !== undefined && !isNaN(newMax) && newMax <= ABSOLUTE_MAX) {
			sliderMax = newMax;
		}

		// Ensure min <= max
		if (newMin !== undefined && newMax !== undefined && newMin > newMax) {
			if (minValue !== '') {
				sliderMin = newMax;
				minValue = newMax.toString();
			} else if (maxValue !== '') {
				sliderMax = newMin;
				maxValue = newMin.toString();
			}
		}

		// Notify parent component
		onRangeChange(
			newMin !== undefined && !isNaN(newMin) ? newMin : undefined,
			newMax !== undefined && !isNaN(newMax) ? newMax : undefined
		);
	}

	// Update input fields when slider changes
	$effect(() => {
		minValue = sliderMin !== ABSOLUTE_MIN ? sliderMin.toString() : '';
		maxValue = sliderMax !== ABSOLUTE_MAX ? sliderMax.toString() : '';

		// Notify parent component
		onRangeChange(
			sliderMin !== ABSOLUTE_MIN ? sliderMin : undefined,
			sliderMax !== ABSOLUTE_MAX ? sliderMax : undefined
		);
	});

	// Apply preset range
	function applyPreset(min: number, max: number | null) {
		sliderMin = min;
		sliderMax = max !== null ? max : ABSOLUTE_MAX;

		// Update input fields
		minValue = min.toString();
		maxValue = max !== null ? max.toString() : '';
	}
</script>

<div class="mt-4">
	<!-- Price distribution visualization (simplified) -->
	<div class="mb-4">
		<div class="mb-2 text-sm font-medium">Price Distribution</div>
		<div class="flex h-16 items-end">
			{#each priceDistribution as item}
				<div
					class="group relative mr-px flex-1"
					style="height: {Math.max(20, (item.count / 78) * 100)}%"
				>
					<div class="bg-primary/30 absolute top-0 right-0 bottom-0 left-0"></div>
					<div
						class="bg-base-300 absolute -top-8 left-1/2 -translate-x-1/2 transform rounded px-2 py-1 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100"
					>
						{item.range}: {item.count} tasks
					</div>
				</div>
			{/each}
		</div>
		<div class="mt-1 flex justify-between text-xs text-gray-500">
			<span>0</span>
			<span>5,000+</span>
		</div>
	</div>

	<!-- Range slider -->
	<div class="mb-6">
		<input
			type="range"
			min={ABSOLUTE_MIN}
			max={ABSOLUTE_MAX}
			step={10}
			class="range range-primary range-sm"
			bind:value={sliderMin}
		/>
		<input
			type="range"
			min={ABSOLUTE_MIN}
			max={ABSOLUTE_MAX}
			step={10}
			class="range range-primary range-sm"
			bind:value={sliderMax}
		/>
	</div>

	<!-- Direct input fields -->
	<div class="mb-4 grid grid-cols-2 gap-4">
		<div>
			<label class="label mb-1 p-0" for="min">
				<span class="label-text">Min {currency}</span>
			</label>
			<input
				type="number"
				placeholder="Min"
				class="input input-bordered input-sm w-full"
				bind:value={minValue}
				onblur={applyInputChanges}
				min={ABSOLUTE_MIN}
			/>
		</div>
		<div>
			<label class="label mb-1 p-0" for="max">
				<span class="label-text">Max {currency}</span>
			</label>
			<input
				type="number"
				placeholder="Max"
				class="input input-bordered input-sm w-full"
				bind:value={maxValue}
				onblur={applyInputChanges}
				max={ABSOLUTE_MAX}
			/>
		</div>
	</div>

	<!-- Preset ranges -->
	<div>
		<label class="label mb-1 p-0" for="presetRanges">
			<span class="label-text">Common Ranges</span>
		</label>
		<div class="flex flex-wrap gap-2">
			{#each presetRanges as preset}
				<button class="btn btn-xs" onclick={() => applyPreset(preset.min, preset.max)}>
					{preset.label}
				</button>
			{/each}
		</div>
	</div>
</div>
