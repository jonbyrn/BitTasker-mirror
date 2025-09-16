<script lang="ts">
	import type { Location } from '$lib/types/task';
	import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
	import { t } from 'svelte-i18n';

	let {
		location = {
			displayName: '',
			longitude: -122.4194,
			latitude: 37.7749,
			zipCode: '',
			locationLoaded: false
		},
		height = '300px',
		showPin = true,
		allowPinDrop = true
	} = $props<{
		location?: Location;
		height?: string;
		showPin?: boolean;
		allowPinDrop?: boolean;
	}>();

	// Event dispatcher
	const dispatch = createEventDispatcher<{
		locationChanged: { location: Location };
	}>();

	// State
	let map: google.maps.Map | null = null;
	let mapElement: HTMLElement | null = null;
	let marker: google.maps.marker.AdvancedMarkerElement | null = null;
	let isMapLoaded = $state(false);
	let hasError = $state(false);
	let error = $state('');
	let scriptLoaded = $state(false);
	let googleMapsReady = $state(false);
	let isComponentMounted = $state(false);
	let isLoading = $state(true);
	let markerLibrary: google.maps.MarkerLibrary | null = $state(null);

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

				// Check if script is already being loaded
				const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
				if (existingScript) {
					// Wait for existing script to load
					existingScript.addEventListener('load', () => {
						setTimeout(() => {
							if (window.google?.maps?.Map) {
								scriptLoaded = true;
								googleMapsReady = true;
								resolve();
							} else {
								reject(new Error('Google Maps API not initialized'));
							}
						}, 500);
					});
					return;
				}

				const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
				const script = document.createElement('script');
				script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&loading=async&libraries=marker,places`;
				script.async = true;
				script.defer = true;

				script.onload = () => {
					scriptLoaded = true;
					setTimeout(() => {
						if (window.google?.maps?.Map) {
							googleMapsReady = true;
							resolve();
						} else {
							reject(new Error('Google Maps API not initialized'));
						}
					}, 500);
					return;
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

	// Function to load marker library
	async function loadMarkerLibrary() {
		if (markerLibrary) return markerLibrary;
		
		try {
			markerLibrary = (await google.maps.importLibrary('marker')) as google.maps.MarkerLibrary;
			return markerLibrary;
		} catch (error) {
			console.error('Error loading marker library:', error);
			throw error;
		}
	}

	async function initMap() {
		try {
			// Check if mapElement exists before proceeding
			if (!mapElement) {
				throw new Error('Map element not found');
			}

			// Initialize Google Maps
			map = new google.maps.Map(mapElement, {
				center: { lat: location.latitude!, lng: location.longitude! },
				zoom: 15,
				maxZoom: 18,
				minZoom: 3,
				mapTypeId: google.maps.MapTypeId.ROADMAP,
				mapTypeControl: true,
				streetViewControl: true,
				fullscreenControl: true,
				mapTypeControlOptions: {
					style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
					position: google.maps.ControlPosition.TOP_RIGHT
				},
				zoomControlOptions: {
					position: google.maps.ControlPosition.RIGHT_CENTER
				},
				streetViewControlOptions: {
					position: google.maps.ControlPosition.RIGHT_TOP
				},
				mapId: import.meta.env.PROD ? import.meta.env.VITE_GOOGLE_MAPS_ID : 'DEMO_MAP_ID'
			});

			// Load marker library
			await loadMarkerLibrary();

			// Create marker if showPin is true
			if (showPin) {
				await createMarker();
			}

			// Add click listener for pin dropping if allowed
			if (allowPinDrop) {
				map.addListener('click', handleMapClick);
			}

		} catch (error) {
			console.error('Error initializing Google Maps:', error);
			throw error;
		}
	}

	async function createMarker() {
		if (!map || !googleMapsReady || !window.google?.maps || !markerLibrary) return;

		const position = { lat: location.latitude!, lng: location.longitude! };

		// Remove existing marker
		if (marker) marker.map = null;

		try {
			const { AdvancedMarkerElement } = markerLibrary;

			// Create marker
			marker = new AdvancedMarkerElement({
				position,
				map,
				gmpDraggable: allowPinDrop
			});

			// Add drag event to marker if pin dropping is allowed
			if (allowPinDrop) {
				marker.addListener('dragend', () => {
					const position = marker?.position;
					if (position) {
						const newLat = typeof position.lat === 'function' ? position.lat() : position.lat;
						const newLng = typeof position.lng === 'function' ? position.lng() : position.lng;
						if (newLat && newLng) {
							updateLocationFromCoordinates(newLat, newLng);
						}
					}
				});
			}

		} catch (error) {
			console.error('Error creating marker:', error);
		}
	}

	async function handleMapClick(event: google.maps.MapMouseEvent) {
		if (!event.latLng || !allowPinDrop) return;

		const lat = event.latLng.lat();
		const lng = event.latLng.lng();

		// Update location
		updateLocationFromCoordinates(lat, lng);

		// Create or update marker
		if (showPin) {
			await createMarker();
		}
	}

	async function updateLocationFromCoordinates(lat: number, lng: number) {
		try {
			// Use reverse geocoding to get address
			const geocoder = new google.maps.Geocoder();
			const result = await geocoder.geocode({ location: { lat, lng } });

			if (result.results && result.results.length > 0) {
				const place = result.results[0];
				const newLocation: Location = {
					displayName: place.formatted_address,
					latitude: lat,
					longitude: lng,
					zipCode: extractZipCode(place.address_components),
					locationLoaded: true
				};

				// Update location
				location = newLocation;

				// Dispatch event
				dispatch('locationChanged', { location: newLocation });
			}
		} catch (error) {
			console.error('Error reverse geocoding:', error);
		}
	}

	function extractZipCode(components: google.maps.GeocoderAddressComponent[]): string {
		const zipComponent = components.find(component => 
			component.types.includes('postal_code')
		);
		return zipComponent?.long_name || '';
	}

	async function tryInitMap() {
		try {
			// Only proceed if Google Maps is ready and mapElement exists
			if (!googleMapsReady) {
				throw new Error('Google Maps not ready');
			}
			
			if (!mapElement) {
				throw new Error('Map element not found');
			}

			await initMap();
			isMapLoaded = true;
			
			// Hide loading after everything is ready
			setTimeout(() => {
				isLoading = false;
			}, 500);
			
		} catch (err) {
			console.error('Error initializing map:', err);
			error = err instanceof Error ? err.message : 'Error initializing map';
			hasError = true;
			isLoading = false;
		}
	}

	// Function to update map center when location changes
	function updateMapCenter() {
		if (!map || !isMapLoaded) return;

		const newCenter = { lat: location.latitude!, lng: location.longitude! };
		map.panTo(newCenter);

		// Update marker position
		if (marker && showPin) {
			marker.position = newCenter;
		}
	}

	// Watch for location changes
	$effect(() => {
		if (location.latitude && location.longitude && isMapLoaded) {
			updateMapCenter();
		}
	});

	// Effect to initialize map when component is ready
	$effect(() => {
		if (isComponentMounted && googleMapsReady && mapElement && !isMapLoaded && !hasError) {
			// Use a small delay to ensure DOM is fully ready
			setTimeout(() => {
				tryInitMap();
			}, 300);
		}
	});

	onMount(async () => {
		try {
			// Mark component as mounted
			isComponentMounted = true;
			
			// Load Google Maps script
			await loadGoogleMapsScript();
			
		} catch (err) {
			console.error('Error loading Google Maps:', err);
			error = err instanceof Error ? err.message : 'Error loading Google Maps';
			isLoading = false;
		}
	});

	onDestroy(() => {
		// Cleanup
		if (marker) marker.map = null;
		if (map) {
			google.maps.event.clearInstanceListeners(map);
		}
	});
</script>

<div class="location-picker-map w-full">
	<!-- Map Container -->
	<div class="map-container relative w-full" style="height: {height};">
		<div bind:this={mapElement} class="h-full w-full overflow-hidden rounded-lg">
			{#if isLoading}
				<div class="bg-base-200 flex h-full w-full items-center justify-center">
					<div class="text-center">
						<span class="loading loading-spinner loading-lg mb-2"></span>
						<p class="text-sm text-base-content/70">Loading map...</p>
					</div>
				</div>
			{:else if hasError}
				<div class="bg-base-200 flex h-full w-full items-center justify-center">
					<div class="text-center">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mx-auto h-12 w-12 text-error mb-2"
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
						<p class="text-sm text-error">{$t('dashboard.bids.components.maps.location_picker_map.error_loading_map')}</p>
					</div>
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
</div>

<style>
	:global(.pac-container) {
		z-index: 9999;
	}
</style>
