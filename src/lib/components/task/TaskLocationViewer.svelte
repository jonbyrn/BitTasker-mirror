<script lang="ts">
	import { appStore } from '$lib/stores/app.store';
	import type { Location } from '$lib/types/task';
	import { onMount } from 'svelte';

	let {
		pickupLocation,
		dropOffLocation = null,
		isRemovals = false,
		height = '300px',
		showDirections = true
	} = $props<{
		pickupLocation: Location;
		dropOffLocation?: Location | null;
		isRemovals?: boolean;
		height?: string;
		showDirections?: boolean;
	}>();

	// State
	let map: google.maps.Map | null = $state(null);
	let mapElement: HTMLElement | null = $state(null);
	let pickupMarker: google.maps.marker.AdvancedMarkerElement | null = $state(null);
	let dropoffMarker: google.maps.marker.AdvancedMarkerElement | null = $state(null);
	let directionsService: google.maps.DirectionsService | null = $state(null);
	let directionsRenderer: google.maps.DirectionsRenderer | null = $state(null);
	let isLoading = $state(false);
	let hasError = $state(false);
	let error = $state('');
	let googleMapsReady = $state(false);

	// Function to dynamically load Google Maps script
	async function loadGoogleMapsScript() {
		return new Promise<void>((resolve, reject) => {
			try {
				// Check if script is already loaded and API is available
				if (window.google?.maps?.Map) {
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
					// Add a small delay to ensure Google Maps API is fully initialized
					setTimeout(() => {
						if (window.google?.maps?.Map) {
							googleMapsReady = true;
							resolve();
						} else {
							reject(new Error('Google Maps API not initialized correctly'));
						}
					}, 500);
				};

				script.onerror = () => {
					reject(new Error('Google Maps script failed to load'));
				};

				document.head.appendChild(script);
			} catch (error) {
				reject(error);
			}
		});
	}

	async function initMap() {
		if (!googleMapsReady || !window.google?.maps?.Map) {
			throw new Error('Google Maps not fully loaded yet');
		}

		if (!mapElement) {
			throw new Error('Map element not available');
		}

		try {
			// Use pickup location as center, or default center
			const center =
				pickupLocation.latitude && pickupLocation.longitude
					? { lat: pickupLocation.latitude, lng: pickupLocation.longitude }
					: { lat: 37.7749, lng: -122.4194 }; // Default to SF

			// Initialize Google Maps
			map = new google.maps.Map(mapElement, {
				center,
				zoom: 12,
				mapTypeId: google.maps.MapTypeId.ROADMAP,
				mapTypeControl: false,
				fullscreenControl: false,
				streetViewControl: false,
				zoomControl: true,
				gestureHandling: 'cooperative',
				mapId: 'DEMO_MAP_ID' // Required for AdvancedMarkerElement //TODO: Get map id from console dataset  
			});

			// Create markers and directions if needed
			await createMarkersAndDirections();
		} catch (error) {
			console.error('Error initializing Google Maps:', error);
			throw error;
		}
	}

	// Function to create custom marker element
	function createMarkerElement(color: string, label: string): HTMLElement {
		const markerElement = document.createElement('div');
		markerElement.innerHTML = `
			<div style="
				width: 32px;
				height: 40px;
				position: relative;
				cursor: pointer;
			">
				<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
					<path fill="${color}" d="M16 0C7.2 0 0 7.2 0 16c0 8.8 16 24 16 24s16-15.2 16-24C32 7.2 24.8 0 16 0zm0 22c-3.3 0-6-2.7-6-6s2.7-6 6-6 6 2.7 6 6-2.7 6-6 6z"/>
					<circle fill="white" cx="16" cy="16" r="4"/>
				</svg>
			</div>
		`;
		return markerElement;
	}

	async function createMarkersAndDirections() {
		if (!map || !googleMapsReady || !window.google?.maps) return;

		const bounds = new google.maps.LatLngBounds();

		// Create pickup marker using AdvancedMarkerElement
		if (pickupLocation.latitude && pickupLocation.longitude) {
			const pickupPosition = {
				lat: pickupLocation.latitude,
				lng: pickupLocation.longitude
			};

			// Check if AdvancedMarkerElement is available
			if (window.google.maps.marker?.AdvancedMarkerElement) {
				const pickupMarkerElement = createMarkerElement('#10B981', 'P');
				
				pickupMarker = new google.maps.marker.AdvancedMarkerElement({
					position: pickupPosition,
					map,
					title: isRemovals ? 'Pickup Location' : 'Task Location',
					content: pickupMarkerElement
				});

				// Add click listener for info window
				pickupMarker.addListener('click', () => {
					const infoWindow = new google.maps.InfoWindow({
						content: `
							<div class="p-2">
								<h3 class="font-semibold text-sm">${isRemovals ? 'Pickup Location' : 'Task Location'}</h3>
								<p class="text-xs text-gray-600">${pickupLocation.displayName}</p>
							</div>
						`
					});
					infoWindow.open(map, pickupMarker);
				});
			} else {
				// Fallback to regular marker if AdvancedMarkerElement is not available
				pickupMarker = new google.maps.Marker({
					position: pickupPosition,
					map,
					title: isRemovals ? 'Pickup Location' : 'Task Location'
				}) as any;
			}

			bounds.extend(pickupPosition);
		}

		// Create dropoff marker for removal tasks
		if (isRemovals && dropOffLocation?.latitude && dropOffLocation?.longitude) {
			const dropoffPosition = {
				lat: dropOffLocation.latitude,
				lng: dropOffLocation.longitude
			};

			// Check if AdvancedMarkerElement is available
			if (window.google.maps.marker?.AdvancedMarkerElement) {
				const dropoffMarkerElement = createMarkerElement('#EF4444', 'D');
				
				dropoffMarker = new google.maps.marker.AdvancedMarkerElement({
					position: dropoffPosition,
					map,
					title: 'Drop-off Location',
					content: dropoffMarkerElement
				});

				// Add click listener for info window
				dropoffMarker.addListener('click', () => {
					const infoWindow = new google.maps.InfoWindow({
						content: `
							<div class="p-2">
								<h3 class="font-semibold text-sm">Drop-off Location</h3>
								<p class="text-xs text-gray-600">${dropOffLocation.displayName}</p>
							</div>
						`
					});
					infoWindow.open(map, dropoffMarker);
				});
			} else {
				// Fallback to regular marker if AdvancedMarkerElement is not available
				dropoffMarker = new google.maps.Marker({
					position: dropoffPosition,
					map,
					title: 'Drop-off Location'
				}) as any;
			}

			bounds.extend(dropoffPosition);

			// Try to add directions between pickup and dropoff
			if (pickupLocation.latitude && pickupLocation.longitude && showDirections) {
				try {
					await createDirections(
						{ lat: pickupLocation.latitude, lng: pickupLocation.longitude },
						dropoffPosition
					);
				} catch (err) {
					console.warn('Directions service not available, showing markers only:', err);
					// Continue without directions - just show the markers
				}
			}
		}

		// Fit map to show all markers
		if (bounds.isEmpty()) {
			// If no valid locations, center on pickup or default
			if (pickupLocation.latitude && pickupLocation.longitude) {
				map.setCenter({ lat: pickupLocation.latitude, lng: pickupLocation.longitude });
				map.setZoom(15);
			}
		} else {
			map.fitBounds(bounds);
			// Add some padding
			const padding = { top: 50, right: 50, bottom: 50, left: 50 };
			map.fitBounds(bounds, padding);
		}
	}

	async function createDirections(
		origin: google.maps.LatLngLiteral,
		destination: google.maps.LatLngLiteral
	) {
		if (!map || !googleMapsReady || !window.google?.maps) return;

		try {
			// For now, use simple polyline instead of directions API to avoid legacy API warnings
			// This creates a straight line between pickup and dropoff points
			await createSimpleRoute(origin, destination);
		} catch (error) {
			appStore.showErrorToast('Could not create direction route');
			throw error;
		}
	}

	async function createSimpleRoute(
		origin: google.maps.LatLngLiteral,
		destination: google.maps.LatLngLiteral
	) {
		// Create a simple straight line between pickup and dropoff points
		// This avoids the legacy Directions API warnings
		const path = [origin, destination];
		
		const polyline = new google.maps.Polyline({
			path: path,
			geodesic: true,
			strokeColor: '#3B82F6',
			strokeOpacity: 0.8,
			strokeWeight: 4,
		});

		polyline.setMap(map);
	}

	// TODO: Unused - To be removed when refactoring
	async function createDirectionsWithLegacyAPI(
		origin: google.maps.LatLngLiteral,
		destination: google.maps.LatLngLiteral
	) {
		directionsService = new google.maps.DirectionsService();
		directionsRenderer = new google.maps.DirectionsRenderer({
			map,
			suppressMarkers: true, // We're using custom markers
			polylineOptions: {
				strokeColor: '#3B82F6',
				strokeWeight: 4,
				strokeOpacity: 0.8
			}
		});

		const request: google.maps.DirectionsRequest = {
			origin,
			destination,
			travelMode: google.maps.TravelMode.DRIVING,
			avoidHighways: false,
			avoidTolls: false
		};

		// Use promise-based approach for better error handling
		const result = await new Promise<google.maps.DirectionsResult>((resolve, reject) => {
			directionsService!.route(request, (result, status) => {
				if (status === google.maps.DirectionsStatus.OK && result) {
					resolve(result);
				} else {
					reject(new Error(`Directions request failed: ${status}`));
				}
			});
		});

		directionsRenderer.setDirections(result);
	}

	onMount(async () => {
		try {
			isLoading = true;

			// Load Google Maps API dynamically if not already loaded
			await loadGoogleMapsScript();

			// Initialize the map with a slight delay to ensure DOM is ready
			setTimeout(async () => {
				try {
					await initMap();
				} catch (err) {
					console.error('Error initializing map:', err);
					error = err instanceof Error ? err.message : 'Error initializing map';
					hasError = true;
				}
			}, 1000);
		} catch (err) {
			console.error('Error loading Google Maps:', err);
			error = err instanceof Error ? err.message : 'Error loading Google Maps';
			hasError = true;
		} finally {
			isLoading = false;
		}
	});
</script>

<div class="w-full" style="height: {height}">
	{#if isLoading}
		<div class="bg-base-200 flex h-full w-full items-center justify-center rounded-lg">
			<div class="text-center">
				<span class="loading loading-spinner loading-lg"></span>
				<p class="mt-2 text-sm text-gray-600">Loading map...</p>
			</div>
		</div>
	{:else if hasError}
		<div class="bg-base-200 flex h-full w-full items-center justify-center rounded-lg">
			<div class="text-center">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-error mx-auto h-12 w-12"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/>
				</svg>
				<p class="text-error mt-2 text-sm">{error}</p>
			</div>
		</div>
	{:else}
		<div bind:this={mapElement} class="h-full w-full overflow-hidden rounded-lg border"></div>
	{/if}
</div>

<!-- Legend for removal tasks -->
{#if isRemovals && dropOffLocation?.latitude && dropOffLocation?.longitude}
	<div class="mt-3 flex items-center justify-center gap-4 text-sm">
		<div class="flex items-center gap-1">
			<div class="h-3 w-3 rounded-full bg-green-500"></div>
			<span>Pickup</span>
		</div>
		<div class="flex items-center gap-1">
			<div class="h-3 w-3 rounded-full bg-red-500"></div>
			<span>Drop-off</span>
		</div>
		{#if showDirections}
			<div class="flex items-center gap-1">
				<div class="h-0.5 w-4 bg-blue-500"></div>
				<span>Route</span>
			</div>
		{/if}
	</div>
{/if}
