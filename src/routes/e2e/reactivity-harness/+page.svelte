<script lang="ts">
	import TagsInput from '$lib/components/TagsInput.svelte';
	import LocationFilter from '$lib/components/filters/LocationFilter.svelte';

	let tags = $state<string[]>([]);
	let options = $state<string[]>(['React', 'Svelte', 'TypeScript']);

	let location = $state<string | undefined>('');
	let radius = $state<number | undefined>(5);
	let locationChangeCount = $state(0);
	let lastLocationValue = $state<string>('unset');
	let lastRadiusValue = $state<string>('unset');

	function applyPresetLocation() {
		location = 'Preset City';
		radius = 25;
	}

	function swapOptions() {
		options = ['Vue', 'Angular', 'Solid'];
	}

	function handleLocationChange(nextLocation: string | undefined, nextRadius: number | undefined) {
		locationChangeCount += 1;
		lastLocationValue = nextLocation ?? 'undefined';
		lastRadiusValue = nextRadius?.toString() ?? 'undefined';
		location = nextLocation;
		radius = nextRadius;
	}
</script>

<main class="space-y-10 p-6">
	<section class="space-y-3" data-testid="tags-section">
		<h1 class="text-xl font-bold">TagsInput Harness</h1>
		<div class="max-w-xl space-y-3">
			<button class="btn btn-sm" onclick={swapOptions} data-testid="swap-options"
				>Swap Options</button
			>
			<TagsInput
				id="e2e-tags"
				label="Skills"
				autoComplete="on"
				{options}
				bind:tags
				placeholder="Add tag"
			/>
			<div data-testid="tags-output">{JSON.stringify(tags)}</div>
		</div>
	</section>

	<section class="space-y-3" data-testid="location-section">
		<h2 class="text-xl font-bold">LocationFilter Harness</h2>
		<div class="max-w-xl space-y-3">
			<button class="btn btn-sm" onclick={applyPresetLocation} data-testid="set-location-props">
				Set Preset Location
			</button>
			<LocationFilter {location} {radius} onLocationChange={handleLocationChange} />
			<div data-testid="location-change-count">{locationChangeCount}</div>
			<div data-testid="location-last">{lastLocationValue}</div>
			<div data-testid="radius-last">{lastRadiusValue}</div>
		</div>
	</section>
</main>
