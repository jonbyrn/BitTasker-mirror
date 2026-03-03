<script lang="ts">
	import type { LocationProps } from '$lib/types/props';
	import type { GooglePlaceFields } from '$lib/types/placeFields';
	import LocationPickerMap from '$lib/components/maps/LocationPickerMap.svelte';
	import { onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';
	/* global google */

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
	let predictionRequestId = 0;
	let debounceTimeoutId: ReturnType<typeof setTimeout> | null = null;
	const inputId = `location-search-${Math.random().toString(36).slice(2, 10)}`;

	async function getPredictions() {
		const currentRequestId = ++predictionRequestId;
		try {
			const rawInput = searchInput?.value ?? '';
			const input = rawInput.trim();
			if (!input) {
				predictions = [];
				showOptions = false;
				hasError = false;
				return;
			}
			isLoading = true;
			hasError = false;
			const { AutocompleteSessionToken, AutocompleteSuggestion } = (await google.maps.importLibrary(
				'places'
			)) as google.maps.PlacesLibrary;

			const token = new AutocompleteSessionToken();

			const request = {
				input,
				language: 'es', // Usar español para mejor resultados en El Salvador
				sessionToken: token
				// Removemos la restricción de país que estaba causando problemas
			};

			const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
			if (currentRequestId !== predictionRequestId) return;
			predictions = suggestions.map((suggestion) => suggestion.placePrediction);
			showOptions = true;
		} catch (error) {
			hasError = true;
			console.error('Failed to get predictions:', error);
		} finally {
			isLoading = false;
		}
	}

	// Debounce function
	function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number) {
		return function (...args: Parameters<T>) {
			if (debounceTimeoutId) {
				clearTimeout(debounceTimeoutId);
			}
			debounceTimeoutId = setTimeout(() => fn.apply(null, args), delay);
		};
	}
	const debouncedGetPredictions = debounce(() => {
		void getPredictions();
	}, 300);

	function handleInput() {
		if (!searchInput?.value?.trim()) {
			predictions = [];
			showOptions = false;
			hasError = false;
		}
		debouncedGetPredictions();
	}

	async function selectPrediction(prediction: google.maps.places.PlacePrediction) {
		let place = prediction.toPlace();
		await place.fetchFields({
			fields: [
				'displayName',
				'formattedAddress',
				'location',
				'addressComponents'
			] as GooglePlaceFields[]
		});

		const lat = place.location?.lat();
		const lng = place.location?.lng();

		if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

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
	function handleMapLocationChange(event: { location: LocationProps['location'] }) {
		const newLocation = event.location;
		location = newLocation;

		// Update input value
		if (searchInput) {
			searchInput.value = newLocation.displayName;
		}

		if (onLocationSelect) {
			onLocationSelect(newLocation);
		}
	}

	onDestroy(() => {
		predictionRequestId += 1;
		if (debounceTimeoutId) {
			clearTimeout(debounceTimeoutId);
			debounceTimeoutId = null;
		}
	});
</script>

<div class="form-control relative w-full">
	{#if label}
		<label class="label" for={inputId}>
			<span class="label-text">{label}</span>
		</label>
	{/if}
	<div class="relative">
		<input
			bind:this={searchInput}
			id={inputId}
			type="text"
			{placeholder}
			class="input input-bordered w-full {hasError ? 'input-error' : ''}"
			value={location.displayName}
			oninput={handleInput}
		/>
		{#if isLoading}
			<div class="absolute top-1/2 right-3 -translate-y-1/2">
				<span class="loading loading-spinner loading-sm"></span>
			</div>
		{/if}
	</div>

	{#if hasError}
		<label class="label" for={inputId}>
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
				{#each predictions as prediction, index (`${prediction?.placeId ?? 'unknown'}-${index}`)}
					<button
						class="hover:bg-base-200 w-full cursor-pointer px-4 py-2 text-left"
						onclick={() => selectPrediction(prediction!)}
					>
						{prediction?.text}
					</button>
				{/each}
			{:else}
				<label class="label" for={inputId}>
					<span class="label-text-alt text-error"
						>{$t('common.components.location_autocomplete.no_places_found')}</span
					>
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
				{searchRadius}
				onLocationChanged={handleMapLocationChange}
			/>
		</div>
	{/if}
</div>
