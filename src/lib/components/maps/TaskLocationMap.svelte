<script lang="ts">
	import type { Location } from '$lib/types/task';
	import { onMount, onDestroy } from 'svelte';
	import { Geolocation } from '@capacitor/geolocation';
	import { Capacitor } from '@capacitor/core';
	import { tick } from 'svelte';
	let { location, height = '400px' } = $props<{
		location?: Location | null;
		height?: string;
	}>();

	// State
	let map: google.maps.Map | null = null;
	let mapElement: HTMLElement;
	let marker: google.maps.marker.AdvancedMarkerElement | null = null;
	let circle: google.maps.Circle | null = null;
	let serviceRadius = $state(10); // Default to 10 km
	let isMapLoaded = $state(false);
	let hasError = $state(false);
	let error = $state('');
	let scriptLoaded = $state(false);
	let googleMapsReady = $state(false);
	let initRetryCount = $state(0);
	let maxRetries = 3;

	// Default location (San Salvador)
	const defaultLocation: Location = {
		displayName: 'San Salvador, El Salvador',
		latitude: 13.6929,
		longitude: -89.2182,
		zipCode: '',
		locationLoaded: false
	};

	// Function to dynamically load Google Maps script
	async function loadGoogleMapsScript() {
		return new Promise<void>((resolve, reject) => {
			try {
				// Check if script is already loaded and API is available
				if (window.google?.maps?.Map) {
					scriptLoaded = true;
					googleMapsReady = true;
					resolve();
					return;
				}

				const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
				const script = document.createElement('script');
				script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places,marker&loading=async`;
				script.async = true;
				script.defer = true;

				script.onload = () => {
					scriptLoaded = true;
					// Add a small delay to ensure Google Maps API is fully initialized
					setTimeout(() => {
						// Check if the API is actually available
						if (window.google?.maps?.Map) {
							googleMapsReady = true;
							resolve();
						} else {
							reject(new Error('Google Maps API not initialized'));
						}
					}, 500);
				};

				script.onerror = () => {
					reject(new Error('Failed to load Google Maps script'));
				};

				document.head.appendChild(script);
			} catch (error) {
				reject(error);
			}
		});
	}

	async function initMap() {
		if (!googleMapsReady || !window.google?.maps?.Map) {
			throw new Error('Google Maps not fully loaded');
		}

		try {
			const currentLocation = location || defaultLocation;

			// Initialize Google Maps
			map = new google.maps.Map(mapElement, {
				center: { lat: currentLocation.latitude!, lng: currentLocation.longitude! },
				zoom: 11, // Zoom out a bit to see all pins
				mapTypeId: google.maps.MapTypeId.ROADMAP,
				mapTypeControl: false,
				fullscreenControl: false,
				streetViewControl: false,
				mapId: import.meta.env.PROD ? import.meta.env.VITE_GOOGLE_MAPS_ID : 'DEMO_MAP_ID'
			});

			// Create marker and circle for the selected location
			if (currentLocation.latitude && currentLocation.longitude) {
				createMarkerAndCircle(currentLocation.latitude, currentLocation.longitude);
			}

			// Create fake task location pins
			createFakeTaskPins();
		} catch (error) {
			console.error('Error initializing Google Maps:', error);
			throw error;
		}
	}

	async function tryInitMap() {
		try {
			if (initRetryCount >= maxRetries) {
				throw new Error('Failed to initialize map after multiple attempts');
			}

			// Only proceed if Google Maps is ready
			if (!googleMapsReady) {
				initRetryCount++;
				// Wait a bit and try again
				setTimeout(tryInitMap, 1000);
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

	async function createMarkerAndCircle(lat: number, lng: number) {
		if (!map || !googleMapsReady || !window.google?.maps) return;

		const position = { lat, lng };

		// Remove existing marker and circle
		if (marker) marker.map = null;
		if (circle) circle.setMap(null);

		try {
			// Import the marker library
			const { AdvancedMarkerElement } = (await google.maps.importLibrary(
				'marker'
			)) as google.maps.MarkerLibrary;

			// Create new advanced marker
			marker = new AdvancedMarkerElement({
				position,
				map,
				gmpDraggable: false // Disable dragging for task location display
			});

			// Create circle for service radius
			circle = new google.maps.Circle({
				strokeColor: '#F7931A',
				strokeOpacity: 0.8,
				strokeWeight: 2,
				fillColor: '#F7931A',
				fillOpacity: 0.2,
				map,
				center: position,
				radius: serviceRadius * 1000 // Convert km to meters
			});

			// Pan map to new location
			map.panTo(position);
		} catch (error) {
			console.error('Error creating advanced marker:', error);
		}
	}

	async function createFakeTaskPins() {
		if (!map || !googleMapsReady || !window.google?.maps) return;

		try {
			// Import the marker library
			const { AdvancedMarkerElement } = (await google.maps.importLibrary(
				'marker'
			)) as google.maps.MarkerLibrary;
		} catch (error) {
			console.error('Error creating fake task pins:', error);
		}
	}

	// Watch for location changes
	$effect(() => {
		if (location && location.latitude && location.longitude && map && isMapLoaded) {
			createMarkerAndCircle(location.latitude, location.longitude);
		}
	});

	onMount(async () => {
		try {
			// Load Google Maps API dynamically if not already loaded
			await loadGoogleMapsScript();

			// Try to initialize the map
			await tryInitMap();
		} catch (err) {
			console.error('Error loading Google Maps:', err);
			error = err instanceof Error ? err.message : 'Error loading Google Maps';
		}
	});

	onDestroy(() => {
		// Cleanup
		if (map) {
			google.maps.event.clearInstanceListeners(map);
		}
	});
</script>

<div class="task-location-map w-full">
	<!-- Map Container -->
	<div class="map-container relative w-full" style="height: {height};">
		<div bind:this={mapElement} class="h-full w-full overflow-hidden rounded-lg">
			{#if !isMapLoaded}
				<div class="bg-base-200 flex h-full w-full items-center justify-center">
					<span class="loading loading-spinner loading-lg"></span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Error Message -->
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

	<!-- Location Info -->
	{#if location && location.displayName}
		<div class="bg-base-200 mt-3 rounded-lg p-3">
			<h4 class="mb-1 text-sm font-semibold">Task Location</h4>
			<p class="text-base-content/70 text-sm">{location.displayName}</p>
		</div>
	{/if}
</div>

<style>
	:global(.pac-container) {
		z-index: 9999;
	}
</style>
