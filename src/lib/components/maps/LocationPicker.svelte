<script lang="ts">
	import type { Location } from '$lib/types/task';
	import { onMount } from 'svelte';

	let {
		label = '',
		placeholder = 'Enter address or zip code',
		location: locProp,
		onLocationSelect,
		height = '260px'
	} = $props<{
		label?: string;
		placeholder?: string;
		location?: Location;
		onLocationSelect?: (loc: Location) => void;
		height?: string;
	}>();

	let selectedLocation = $state<Location>({
		displayName: locProp?.displayName ?? '',
		longitude: locProp?.longitude ?? null,
		latitude: locProp?.latitude ?? null,
		zipCode: locProp?.zipCode ?? '',
		locationLoaded: locProp?.locationLoaded ?? false
	});

	let map: google.maps.Map | null = null;
	let mapElement: HTMLElement;
	let marker: google.maps.marker.AdvancedMarkerElement | null = null;
	let isMapLoaded = $state(false);
	let hasError = $state(false);
	let error = $state('');
	let scriptLoaded = $state(false);
	let googleMapsReady = $state(false);
	let initRetryCount = $state(0);
	let maxRetries = 3;

	let searchInput: HTMLInputElement;
	let predictions = $state<(google.maps.places.PlacePrediction | null)[]>([]);
	let isLoading = $state(false);
	let showOptions = $state(false);

	const defaultCenter = { lat: 13.6929, lng: -89.2182 };

	// Singleton loader state to avoid multiple script inserts and race conditions
	let gmapsLoader: Promise<void> | null = null;
	let gmapsLoaded = false;

	async function loadGoogleMapsScript() {
		if (window.google?.maps?.Map) {
			scriptLoaded = true;
			googleMapsReady = true;
			gmapsLoaded = true;
			return;
		}

		if (gmapsLoader) {
			await gmapsLoader;
			scriptLoaded = true;
			googleMapsReady = true;
			gmapsLoaded = true;
			return;
		}

		const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
		const src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places,marker&loading=async`;

		// Reuse existing tag if present
		const existing = Array.from(document.getElementsByTagName('script')).find((s) => s.src === src);
		if (existing) {
			gmapsLoader = new Promise<void>((resolve, reject) => {
				existing.addEventListener('load', () => resolve());
				existing.addEventListener('error', () =>
					reject(new Error('Failed to load Google Maps script'))
				);
			});
		} else {
			gmapsLoader = new Promise<void>((resolve, reject) => {
				try {
					const script = document.createElement('script');
					script.src = src;
					script.async = true;
					script.defer = true;
					script.onload = () => resolve();
					script.onerror = () => reject(new Error('Failed to load Google Maps script'));
					document.head.appendChild(script);
				} catch (e) {
					reject(e);
				}
			});
		}

		try {
			await gmapsLoader;
			await new Promise((r) => setTimeout(r, 300));
			if (!window.google?.maps?.Map) throw new Error('Google Maps API not initialized');
			scriptLoaded = true;
			googleMapsReady = true;
			gmapsLoaded = true;
		} catch (e) {
			gmapsLoader = null; // allow retry on next mount
			throw e;
		}
	}

	async function initMap() {
		if (!googleMapsReady || !window.google?.maps?.Map) {
			throw new Error('Google Maps not fully loaded');
		}

		const lat = selectedLocation?.latitude ?? defaultCenter.lat;
		const lng = selectedLocation?.longitude ?? defaultCenter.lng;

		map = new google.maps.Map(mapElement, {
			center: { lat: lat as number, lng: lng as number },
			zoom: selectedLocation?.latitude && selectedLocation?.longitude ? 14 : 12,
			mapTypeId: google.maps.MapTypeId.ROADMAP,
			mapTypeControl: false,
			fullscreenControl: false,
			streetViewControl: false,
			mapId: import.meta.env.PROD ? import.meta.env.VITE_GOOGLE_MAPS_ID : 'DEMO_MAP_ID'
		});

		if (selectedLocation?.latitude && selectedLocation?.longitude) {
			await createOrMoveMarker(selectedLocation.latitude, selectedLocation.longitude, false);
		}

		// Allow click on map to set marker
		map.addListener('click', (event: google.maps.MapMouseEvent) => {
			const clickedLat = event.latLng?.lat();
			const clickedLng = event.latLng?.lng();
			if (clickedLat && clickedLng) updateLocationWithCoordinates(clickedLat, clickedLng, true);
		});
	}

	async function tryInitMap() {
		try {
			if (initRetryCount >= maxRetries) {
				throw new Error('Failed to initialize map after multiple attempts');
			}
			if (!googleMapsReady) {
				initRetryCount++;
				setTimeout(tryInitMap, 300);
				return;
			}
			await initMap();
			isMapLoaded = true;
		} catch (err) {
			console.error('Error initializing map:', err);
			error = err instanceof Error ? err.message : 'Error initializing map';
			hasError = true;
		}
	}

	async function createOrMoveMarker(lat: number, lng: number, pan = true) {
		if (!map || !googleMapsReady || !window.google?.maps) return;
		const position = { lat, lng };

		try {
			const { AdvancedMarkerElement } = (await google.maps.importLibrary(
				'marker'
			)) as google.maps.MarkerLibrary;
			if (!marker) {
				marker = new AdvancedMarkerElement({ position, map, gmpDraggable: true });
				marker.addListener('dragend', () => {
					const pos = marker?.position;
					if (pos) {
						const nlat = typeof pos.lat === 'function' ? pos.lat() : pos.lat;
						const nlng = typeof pos.lng === 'function' ? pos.lng() : pos.lng;
						if (nlat && nlng) updateLocationWithCoordinates(nlat, nlng, true);
					}
				});
			} else {
				marker.position = position as any;
			}
			if (pan) map.panTo(position);
		} catch (e) {
			console.error('Error creating marker:', e);
		}
	}

	async function updateLocationWithCoordinates(lat: number, lng: number, updateInput = false) {
		// Guard against redundant updates to prevent render loops
		if (
			selectedLocation.latitude === lat &&
			selectedLocation.longitude === lng &&
			selectedLocation.locationLoaded
		) {
			if (updateInput && searchInput && selectedLocation.displayName) {
				searchInput.value = selectedLocation.displayName;
			}
			return;
		}
		await createOrMoveMarker(lat, lng);
		if (googleMapsReady && window.google?.maps) {
			try {
				const { Geocoder } = (await google.maps.importLibrary(
					'geocoding'
				)) as google.maps.GeocodingLibrary;
				const geocoder = new Geocoder();
				const result = await geocoder.geocode({ location: { lat, lng } });
				if (result.results[0]) {
					const addressComponents = result.results[0].address_components;
					const zipCode =
						addressComponents.find((c) => c.types.includes('postal_code'))?.short_name || '';
					const displayName = result.results[0].formatted_address;
					selectedLocation = {
						...selectedLocation,
						displayName,
						latitude: lat,
						longitude: lng,
						zipCode,
						locationLoaded: true
					};
					if (updateInput && searchInput) {
						searchInput.value = selectedLocation.displayName;
					}
					if (onLocationSelect) onLocationSelect(selectedLocation);
				}
			} catch (e) {
				console.error('Reverse geocoding failed:', e);
			}
		}
	}

	async function getPredictions() {
		try {
			if (!searchInput.value) {
				showOptions = false;
				return;
			}
			isLoading = true;
			const { AutocompleteSessionToken, AutocompleteSuggestion } = (await google.maps.importLibrary(
				'places'
			)) as google.maps.PlacesLibrary;
			const token = new AutocompleteSessionToken();
			const request = { input: searchInput.value, language: 'en-US', sessionToken: token };
			const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
			predictions = suggestions.map((s) => s.placePrediction);
			showOptions = true;
		} catch (e) {
			hasError = true;
			console.error('Failed to get predictions:', e);
		} finally {
			isLoading = false;
		}
	}

	function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
		let timeoutId: ReturnType<typeof setTimeout>;
		return function (...args: Parameters<T>) {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(() => fn.apply(null, args), delay);
		};
	}

	async function selectPrediction(prediction: google.maps.places.PlacePrediction) {
		let place = prediction.toPlace();
		await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
		const displayName = place.displayName;
		const lat = place.location?.lat();
		const lng = place.location?.lng();
		if (!displayName || !lat || !lng) return;
		searchInput.value = displayName;
		await updateLocationWithCoordinates(lat, lng);
		showOptions = false;
	}

	$effect(() => {
		if (
			selectedLocation &&
			selectedLocation.latitude &&
			selectedLocation.longitude &&
			map &&
			isMapLoaded
		) {
			createOrMoveMarker(selectedLocation.latitude, selectedLocation.longitude, false);
		}
	});

	// Sync external prop changes
	$effect(() => {
		const lat = locProp?.latitude;
		const lng = locProp?.longitude;
		if (lat != null && lng != null) {
			// Skip if values are effectively unchanged
			const sameCoords = selectedLocation.latitude === lat && selectedLocation.longitude === lng;
			const sameName = (locProp?.displayName ?? '') === (selectedLocation.displayName ?? '');
			if (sameCoords && sameName) return;
			selectedLocation = {
				...selectedLocation,
				latitude: lat,
				longitude: lng,
				displayName: locProp?.displayName ?? selectedLocation.displayName,
				zipCode: locProp?.zipCode ?? selectedLocation.zipCode,
				locationLoaded: true
			};
			if (map && isMapLoaded) createOrMoveMarker(lat, lng, false);
		}
	});

	onMount(async () => {
		try {
			await loadGoogleMapsScript();
			await tryInitMap();
		} catch (err) {
			console.error('Error loading Google Maps:', err);
			error = err instanceof Error ? err.message : 'Error loading Google Maps';
		}
	});
</script>

<div class="form-control w-full">
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
			class="input input-bordered w-full"
			value={selectedLocation?.displayName}
			oninput={debounce(() => getPredictions(), 300)}
			onfocus={() => (showOptions = true)}
		/>
		{#if isLoading}
			<div class="absolute top-1/2 right-3 -translate-y-1/2">
				<span class="loading loading-spinner loading-sm"></span>
			</div>
		{/if}
		{#if showOptions}
			<div
				class="bg-base-100 border-base-300 absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border shadow-lg"
			>
				{#if predictions.length > 0}
					{#each predictions as prediction}
						<button
							class="hover:bg-base-200 border-base-200 w-full cursor-pointer border-b px-4 py-2 text-left last:border-b-0"
							onclick={() => selectPrediction(prediction!)}
						>
							{prediction?.text}
						</button>
					{/each}
				{:else}
					<div class="text-error px-4 py-2">No places found.</div>
				{/if}
			</div>
		{/if}
	</div>

	<div class="mt-3">
		<div class="relative w-full" style="height: {height};">
			<div bind:this={mapElement} class="h-full w-full overflow-hidden rounded-lg">
				{#if !isMapLoaded}
					<div class="bg-base-200 flex h-full w-full items-center justify-center">
						<span class="loading loading-spinner loading-md"></span>
					</div>
				{/if}
			</div>
		</div>
	</div>

	{#if error}
		<div class="alert alert-error alert-outline mt-3">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5 shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 14l2-2m0 0l2-2m-2 2l-2 2m2-2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span class="text-sm">{error}</span>
		</div>
	{/if}
</div>

<style>
	:global(.pac-container) {
		z-index: 9999;
	}
</style>
