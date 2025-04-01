<script lang="ts">
	import type { LocationData, LocationProps } from '$lib/types/props';
	import { Geolocation } from '@capacitor/geolocation';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	// Props
	let {
		label = 'Location',
		defaultLocation = null as LocationData | null,
		onLocationSelect = undefined as ((location: LocationData) => void) | undefined
	} = $props();

	// State
	let map: google.maps.Map;
	let marker: google.maps.marker.AdvancedMarkerElement;
	let searchInput: HTMLInputElement;
	let predictions = $state<google.maps.places.AutocompletePrediction[]>([]);
	let showPredictions = $state(false);
	let isLoading = $state(false);
	let hasError = $state(false);

	let location = $state({
		displayName: '',
		longitude: -122.4194, // Default: San Francisco
		latitude: 37.7749,
		zipCode: '',
		locationLoaded: false
	});

	// Initialize map
	async function initMap() {
		const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
		const { AdvancedMarkerElement } = (await google.maps.importLibrary(
			'marker'
		)) as google.maps.MarkerLibrary;
		const { AutocompleteService, PlacesService } = (await google.maps.importLibrary(
			'places'
		)) as google.maps.PlacesLibrary;

		const mapOptions = {
			center: { lat: location.latitude, lng: location.longitude },
			zoom: 15,
			mapTypeControl: false,
			streetViewControl: false,
			fullscreenControl: false,
			mapId: 'bittasker_map'
		};

		map = new Map(document.getElementById('map')!, mapOptions);
		marker = new AdvancedMarkerElement({
			map,
			position: { lat: location.latitude, lng: location.longitude },
			gmpDraggable: true,
			title: location.displayName || 'Selected location'
		});

		// Initialize autocomplete
		const service = new AutocompleteService();
		const sessionToken = new google.maps.places.AutocompleteSessionToken();
		
		// Create a container div for PlacesService
		const placesDiv = document.createElement('div');
		document.body.appendChild(placesDiv);
		const placesService = new PlacesService(placesDiv);

		// Handle input changes
		let debounceTimer: number;
		searchInput.addEventListener('input', (e) => {
			clearTimeout(debounceTimer);
			const input = (e.target as HTMLInputElement).value;
			hasError = false;
			
			if (input.length === 0) {
				predictions = [];
				showPredictions = false;
				location.displayName = '';
				location.zipCode = '';
				if (onLocationSelect) {
					onLocationSelect(location);
				}
				return;
			}

			debounceTimer = window.setTimeout(() => {
				if (input.length > 2) {
					isLoading = true;
					const request = {
						input,
						sessionToken,
						componentRestrictions: { country: 'US' },
						types: ['address']
					};

					service.getPlacePredictions(request, (results, status) => {
						isLoading = false;
						if (status !== google.maps.places.PlacesServiceStatus.OK || !results) {
							console.error('Place predictions failed:', status);
							predictions = [];
							showPredictions = false;
							hasError = true;
							return;
						}

						predictions = results;
						showPredictions = true;
					});
				}
			}, 300);
		});

		// Handle prediction selection
		async function selectPrediction(prediction: google.maps.places.AutocompletePrediction) {
			const placeRequest = {
				placeId: prediction.place_id,
				fields: ['geometry', 'formatted_address', 'address_components']
			};

			placesService.getDetails(placeRequest, (place, detailStatus) => {
				if (detailStatus === google.maps.places.PlacesServiceStatus.OK && place && place.geometry) {
					const lat = place.geometry.location!.lat();
					const lng = place.geometry.location!.lng();

					updateLocationFromPlace(place);
					if (map) map.setCenter({ lat, lng });
					if (marker) marker.position = { lat, lng };
					
					searchInput.value = prediction.description;
					predictions = [];
					showPredictions = false;
				}
			});
		}

		// Handle marker drag events
		marker.addListener('position_changed', () => {
			const pos = marker.position as google.maps.LatLng;
			if (pos) {
				updateLocationFromCoords(pos.lat(), pos.lng());
			}
		});

		// Add click handler to document to close predictions
		document.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			if (!target.closest('.location-container')) {
				showPredictions = false;
			}
		});

		// Make selectPrediction available in the component scope
		(window as any).selectPrediction = selectPrediction;
	}

	// Update location from coordinates
	async function updateLocationFromCoords(lat: number, lng: number) {
		const { Geocoder } = (await google.maps.importLibrary(
			'geocoding'
		)) as google.maps.GeocodingLibrary;
		const geocoder = new Geocoder();

		try {
			const response = await geocoder.geocode({ location: { lat, lng } });
			if (response.results[0]) {
				updateLocationFromPlace(response.results[0]);
			}
		} catch (error) {
			console.error('Geocoding failed:', error);
		}
	}

	// Update location from place
	function updateLocationFromPlace(
		place: google.maps.places.PlaceResult | google.maps.GeocoderResult
	) {
		const zipCode =
			place.address_components?.find((component) => component.types.includes('postal_code'))
				?.short_name || '';

		location.displayName = place.formatted_address || '';
		location.latitude = place.geometry!.location!.lat();
		location.longitude = place.geometry!.location!.lng();
		location.zipCode = zipCode;
		location.locationLoaded = true;

		if (onLocationSelect) {
			onLocationSelect(location);
		}
	}

	// Get current location
	async function getCurrentLocation() {
		try {
			const { coords } = await Geolocation.getCurrentPosition();
			location.latitude = coords.latitude;
			location.longitude = coords.longitude;

			if (map) map.setCenter({ lat: coords.latitude, lng: coords.longitude });
			if (marker) marker.position = { lat: coords.latitude, lng: coords.longitude };
			await updateLocationFromCoords(coords.latitude, coords.longitude);
		} catch (error) {
			console.error('Error getting location:', error);
			if (defaultLocation) {
				Object.assign(location, defaultLocation);
				if (map) map.setCenter({ lat: location.latitude, lng: location.longitude });
				if (marker) marker.position = { lat: location.latitude, lng: location.longitude };
			}
		}
	}

	onMount(() => {
		if (browser && window.google) {
			initMap();
			if (defaultLocation) {
				Object.assign(location, defaultLocation);
			}
			getCurrentLocation();
		}
	});
</script>

<div class="location-container">
	<div class="form-control w-full relative">
		<label class="label" for="location-search">
			<span class="label-text">{label}</span>
		</label>
		<input
			bind:this={searchInput}
			id="location-search"
			type="text"
			placeholder="Enter address..."
			class="input input-bordered w-full {hasError ? 'input-error' : ''}"
			value={location.displayName}
		/>
		{#if isLoading}
			<div class="absolute right-3 top-[2.8rem]">
				<span class="loading loading-spinner loading-sm"></span>
			</div>
		{/if}
		{#if hasError}
			<label class="label" for="location-search">
				<span class="label-text-alt text-error">Failed to get address suggestions. Please try again.</span>
			</label>
		{/if}
		{#if showPredictions && predictions.length > 0}
			<div class="predictions-dropdown absolute w-full bg-base-100 shadow-lg rounded-lg mt-1 z-50 max-h-60 overflow-y-auto">
				{#each predictions as prediction}
					<button
						class="w-full text-left px-4 py-2 hover:bg-base-200 cursor-pointer"
						onclick={() => (window as any).selectPrediction(prediction)}
					>
						{prediction.description}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<div id="map" class="map-container"></div>
</div>

<style>
	.location-container {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.map-container {
		width: 100%;
		height: 300px;
		border-radius: 0.5rem;
		overflow: hidden;
	}

	.predictions-dropdown {
		border: 1px solid hsl(var(--b2));
	}

	.predictions-dropdown button {
		transition: background-color 0.2s ease;
	}
</style>
