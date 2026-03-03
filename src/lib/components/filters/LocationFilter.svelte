<!-- 
  LocationFilter.svelte
  Component for location-based task discovery with autocomplete,
  radius selection, and current location detection
-->
<script lang="ts">
	import locationService from '$lib/api/services/location.service';
	import { t } from 'svelte-i18n';

	// Props
	let { location, radius, onLocationChange } = $props<{
		location: string | undefined;
		radius: number | undefined;
		onLocationChange: (location: string | undefined, radius: number | undefined) => void;
	}>();

	// Internal state
	let searchQuery = $state('');
	let radiusValue = $state(5);
	let searchResults = $state<
		Array<{
			displayName: string;
			latitude: number;
			longitude: number;
			zipCode: string;
		}>
	>([]);
	let isLoading = $state(false);
	let showResults = $state(false);
	let isGettingCurrentLocation = $state(false);
	let locationError = $state<string | null>(null);

	$effect(() => {
		searchQuery = location || '';
	});

	$effect(() => {
		radiusValue = radius || 5;
	});

	// Debounce search to avoid excessive API calls
	let searchTimeout: NodeJS.Timeout | null = null;

	$effect(() => {
		// Update parent component when our internal state changes
		if (searchQuery || radiusValue) {
			onLocationChange(searchQuery || undefined, radiusValue || undefined);
		}
	});

	// Search for locations based on the user input
	async function searchLocations() {
		if (!searchQuery.trim() || searchQuery.length < 2) {
			searchResults = [];
			showResults = false;
			return;
		}

		// Clear any existing timeout
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}

		// Set a new timeout to debounce the search
		searchTimeout = setTimeout(async () => {
			try {
				isLoading = true;
				const results = await locationService.searchLocations(searchQuery);
				searchResults = results.locations;
				showResults = true;
			} catch (error) {
				console.error('Error searching locations:', error);
				searchResults = [];
			} finally {
				isLoading = false;
			}
		}, 300); // 300ms debounce
	}

	// Use the browser's geolocation API to get current location
	async function getCurrentLocation() {
		try {
			isGettingCurrentLocation = true;
			locationError = null;

			const location = await locationService.getCurrentLocation();

			searchQuery = location.displayName;
			showResults = false;

			// Update parent component
			onLocationChange(location.displayName, radiusValue);
		} catch (error) {
			console.error('Error getting current location:', error);
			locationError = $t('dashboard.bids.components.filters.location.location_error');
		} finally {
			isGettingCurrentLocation = false;
		}
	}

	// Select a location from the search results
	function selectLocation(result: {
		displayName: string;
		latitude: number;
		longitude: number;
		zipCode: string;
	}) {
		searchQuery = result.displayName;
		showResults = false;

		// Update parent component
		onLocationChange(result.displayName, radiusValue);
	}

	// Handle radius change
	function handleRadiusChange(event: Event) {
		const target = event.target as HTMLInputElement;
		radiusValue = parseInt(target.value, 10);

		// Update parent component
		onLocationChange(searchQuery || undefined, radiusValue);
	}

	// Clear location
	function clearLocation() {
		searchQuery = '';
		showResults = false;
		searchResults = [];

		// Update parent component
		onLocationChange(undefined, radiusValue);
	}
</script>

<div class="space-y-4">
	<!-- Location search -->
	<div class="relative">
		<div class="flex items-center gap-2">
			<div class="relative flex-grow">
				<input
					type="text"
					class="input input-bordered w-full pr-10"
					placeholder={$t('dashboard.bids.components.filters.location.search_location_placeholder')}
					bind:value={searchQuery}
					oninput={searchLocations}
					onfocus={() => searchQuery && (showResults = true)}
				/>

				<!-- Clear button -->
				{#if searchQuery}
					<button
						aria-label={$t('dashboard.bids.components.filters.location.clear_location')}
						class="absolute top-1/2 right-2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
						onclick={clearLocation}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				{/if}
			</div>

			<!-- Current location button -->
			<button
				class="btn btn-square btn-primary btn-sm"
				onclick={getCurrentLocation}
				disabled={isGettingCurrentLocation}
			>
				{#if isGettingCurrentLocation}
					<div class="loading loading-spinner loading-xs"></div>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
						/>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
						/>
					</svg>
				{/if}
			</button>
		</div>

		<!-- Location error -->
		{#if locationError}
			<div class="text-error mt-1 text-sm">{locationError}</div>
		{/if}

		<!-- Search results dropdown -->
		{#if showResults && searchResults.length > 0}
			<div
				class="bg-base-100 absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md shadow-lg"
			>
				{#each searchResults as result}
					<button
						class="hover:bg-base-200 block w-full cursor-pointer px-4 py-2 text-left"
						onclick={() => selectLocation(result)}
					>
						<div class="font-medium">{result.displayName}</div>
						<div class="text-sm text-gray-500">{$t('dashboard.bids.components.filters.location.zip')} {result.zipCode}</div>
					</button>
				{/each}
			</div>
		{:else if isLoading}
			<div class="bg-base-100 absolute z-20 mt-1 w-full rounded-md p-4 text-center shadow-lg">
				<div class="loading loading-spinner loading-md"></div>
			</div>
		{/if}
	</div>

	<!-- Radius selection -->
	<div>
		<label class="label" for="radius">
			<span class="label-text">{$t('dashboard.bids.components.filters.location.search_radius', { values: { radius: radiusValue } })}</span>
		</label>
		<input
			type="range"
			min="1"
			max="100"
			class="range range-primary range-sm"
			value={radiusValue}
			oninput={handleRadiusChange}
		/>
		<div class="mt-1 flex justify-between px-1 text-xs">
			<span>{$t('dashboard.bids.components.filters.location.radius_1km')}</span>
			<span>{$t('dashboard.bids.components.filters.location.radius_25km')}</span>
			<span>{$t('dashboard.bids.components.filters.location.radius_50km')}</span>
			<span>{$t('dashboard.bids.components.filters.location.radius_100km')}</span>
		</div>
	</div>

	<!-- Map link (placeholder for future map implementation) -->
	<div class="text-center">
		<button class="btn btn-sm btn-outline mt-2">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mr-1 h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4"
				/>
			</svg>
			{$t('dashboard.bids.components.filters.location.view_on_map')}
		</button>
	</div>
</div>
