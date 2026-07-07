<script lang="ts">
	import type { LocationProps } from '$lib/types/props';
	import type { GooglePlaceFields } from '$lib/types/placeFields';
	import LocationPickerMap from '$lib/components/maps/LocationPickerMap.svelte';
	import { t } from 'svelte-i18n';

	// Props
	let {
		label = '',
		placeholder = $t('common.components.location_autocomplete.enter_address'),
		location = {
			displayName: '',
			longitude: -122.4194,
			latitude: 37.7749,
			zipCode: '',
			locationLoaded: false
		},
		onLocationSelect,
		showMap = true,
		mapHeight = '300px',
		searchRadius = 1.5
	}: LocationProps & {
		showMap?: boolean;
		mapHeight?: string;
		searchRadius?: number;
	} = $props();

	// State
	let searchInput: HTMLInputElement;
	let predictions = $state<(google.maps.places.PlacePrediction | null)[]>([]);
	let isLoading = $state(false);
	let hasError = $state(false);
	let showOptions = $state(false);

	async function getPredictions() {
		try {
			if (!searchInput.value) {
				showOptions = false;
				predictions = [];
				return;
			}
			isLoading = true;
			const { AutocompleteSessionToken, AutocompleteSuggestion } = (await google.maps.importLibrary(
				'places'
			)) as google.maps.PlacesLibrary;

			const token = new AutocompleteSessionToken();

			const request = {
				input: searchInput.value,
				language: 'es', // Usar español para mejor resultados en El Salvador
				sessionToken: token
				// Removemos la restricción de país que estaba causando problemas
			};

			const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
			predictions = suggestions.map((suggestion) => suggestion.placePrediction);
			showOptions = true;
			isLoading = false;
		} catch (error) {
			hasError = true;
			console.error('Failed to get predictions:', error);
		} finally {
			isLoading = false;
		}
	}

	// Debounce function
	function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
		let timeoutId: ReturnType<typeof setTimeout>;
		return function (...args: Parameters<T>) {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(() => fn.apply(null, args), delay);
		};
	}

	const debouncedGetPredictions = debounce(() => getPredictions(), 300);

	async function selectPrediction(prediction: google.maps.places.PlacePrediction) {
		let place = prediction.toPlace();
		await place.fetchFields({
			fields: ['displayName', 'formattedAddress', 'location', 'addressComponents'] as GooglePlaceFields[]
		});

		const lat = place.location?.lat();
		const lng = place.location?.lng();

		if (!lat || !lng) return;

		// Usar directamente el texto de la predicción seleccionada
		const displayName = prediction.text.text.toString();

		location.displayName = displayName;
		location.latitude = lat;
		location.longitude = lng;
		location.locationLoaded = true;

		if (onLocationSelect) {
			onLocationSelect(location);
		}

		showOptions = false;
	}

	// Handle location changes from map
	function handleMapLocationChange(event: CustomEvent<{ location: any }>) {
		const newLocation = event.detail.location;
		location = newLocation;
		
		// Update input value
		if (searchInput) {
			searchInput.value = newLocation.displayName;
		}

		if (onLocationSelect) {
			onLocationSelect(newLocation);
		}
	}
</script>

<div class="form-control relative w-full">
	{#if label}
		<label class="label" for="location-search">
			<span class="label-text">{label}</span>
		</label>
	{/if}
	<div class="relative">
		<input
			bind:this={searchInput}
			id="location-search"
			type="text"
			{placeholder}
			class="input input-bordered w-full {hasError ? 'input-error' : ''}"
			value={location.displayName}
			oninput={debouncedGetPredictions}
		/>
		{#if isLoading}
			<div class="absolute top-1/2 right-3 -translate-y-1/2">
				<span class="loading loading-spinner loading-sm"></span>
			</div>
		{/if}
	</div>

	{#if hasError}
		<label class="label" for="location-search">
			<span class="label-text-alt text-error whitespace-break-spaces">
				{$t('common.components.location_autocomplete.failed_suggestions')}
			</span>
		</label>
	{/if}

	{#if showOptions}
		<div
			class="predictions-dropdown bg-base-100 absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg shadow-lg"
		>
			{#if predictions.length > 0}
				{#each predictions as prediction}
					<button
						class="hover:bg-base-200 w-full cursor-pointer px-4 py-2 text-left"
						onclick={() => selectPrediction(prediction!)}
					>
						{prediction?.text}
					</button>
				{/each}
			{:else}
				<label class="label" for="location-search">
					<span class="label-text-alt text-error">{$t('common.components.location_autocomplete.no_places_found')}</span>
				</label>
			{/if}
		</div>
	{/if}

	<!-- Map Component -->
	{#if showMap}
		<div class="mt-4">
			<LocationPickerMap 
				{location} 
				height={mapHeight}
				showPin={true}
				allowPinDrop={true}
				searchRadius={searchRadius}
				on:locationChanged={handleMapLocationChange}
			/>
		</div>
	{/if}
</div>
