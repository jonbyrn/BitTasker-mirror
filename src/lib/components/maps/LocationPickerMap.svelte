<script lang="ts">
	import type { Location } from '$lib/types/task';
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { withTimeout } from '$lib/utils/with-timeout';
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
		allowPinDrop = true,
		searchRadius = 1.5
	} = $props<{
		location?: Location;
		height?: string;
		showPin?: boolean;
		allowPinDrop?: boolean;
		searchRadius?: number;
	}>();

	// Event dispatcher
	const dispatch = createEventDispatcher<{
		locationChanged: { location: Location };
	}>();

	// State
	let map: google.maps.Map | null = null;
	let mapElement: HTMLElement | null = null;
	let marker: google.maps.marker.AdvancedMarkerElement | null = null;
	let searchRadiusCircle: google.maps.Circle | null = null;
	let isMapLoaded = $state(false);
	let hasError = $state(false);
	let error = $state('');
	let __scriptLoaded = $state(false);
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
					__scriptLoaded = true;
					googleMapsReady = true;
					resolve();
					return;
				}

				// Check if script is already being loaded
				const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
				if (existingScript) {
					// Check if script is already loaded
					if (existingScript.getAttribute('data-loaded') === 'true' || window.google?.maps?.Map) {
						// Script already loaded, just wait a bit for it to be ready
						setTimeout(() => {
							if (window.google?.maps?.Map) {
								__scriptLoaded = true;
								googleMapsReady = true;
								resolve();
							} else {
								// Wait a bit more and try again
								const checkInterval = setInterval(() => {
									if (window.google?.maps?.Map) {
										clearInterval(checkInterval);
										__scriptLoaded = true;
										googleMapsReady = true;
										resolve();
									}
								}, 100);

								// Timeout after 5 seconds
								setTimeout(() => {
									clearInterval(checkInterval);
									if (!window.google?.maps?.Map) {
										reject(new Error('Google Maps API not initialized'));
									}
								}, 5000);
							}
						}, 500);
						return;
					}

					// Wait for existing script to load
					existingScript.addEventListener('load', () => {
						existingScript.setAttribute('data-loaded', 'true');
						setTimeout(() => {
							if (window.google?.maps?.Map) {
								__scriptLoaded = true;
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
					script.setAttribute('data-loaded', 'true');
					__scriptLoaded = true;
					setTimeout(() => {
						if (window.google?.maps?.Map) {
							googleMapsReady = true;
							resolve();
						} else {
							// Wait a bit more and try again
							const checkInterval = setInterval(() => {
								if (window.google?.maps?.Map) {
									clearInterval(checkInterval);
									googleMapsReady = true;
									resolve();
								}
							}, 100);

							// Timeout after 5 seconds
							setTimeout(() => {
								clearInterval(checkInterval);
								if (!window.google?.maps?.Map) {
									reject(new Error('Google Maps API not initialized'));
								}
							}, 5000);
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

			// Create search radius circle
			createSearchRadiusCircle();

			// Add click listener for pin dropping if allowed
			if (allowPinDrop) {
				map.addListener('click', handleMapClick as unknown as (...args: unknown[]) => void);
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

			// Crear un contenedor personalizado para el marcador
			const markerContainer = document.createElement('div');
			markerContainer.style.position = 'relative';
			markerContainer.style.cursor = allowPinDrop ? 'grab' : 'pointer';

			// Usar la imagen personalizada
			const img = document.createElement('img');
			img.src = '/map-pin.png';
			img.style.width = '3.5rem';
			img.style.height = '3.5rem';
			img.style.display = 'block';
			img.style.borderRadius = '50%';

			markerContainer.appendChild(img);

			// Create marker with custom content
			marker = new AdvancedMarkerElement({
				position,
				map,
				content: markerContainer,
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

	// Function to create or update the search radius circle
	function createSearchRadiusCircle() {
		if (!map || !googleMapsReady || !window.google?.maps) return;

		// Remove existing circle
		if (searchRadiusCircle) {
			searchRadiusCircle.setMap(null);
		}

		const position = { lat: location.latitude!, lng: location.longitude! };

		// Create new circle
		searchRadiusCircle = new google.maps.Circle({
			strokeColor: '#ff6b35',
			strokeOpacity: 0.8,
			strokeWeight: 2,
			fillColor: '#ff6b35',
			fillOpacity: 0.1,
			map: map,
			center: position,
			radius: searchRadius * 1000 // Convert km to meters
		});
	}

	// Function to update the search radius circle
	function updateSearchRadiusCircle() {
		if (!searchRadiusCircle || !map) return;

		const position = { lat: location.latitude!, lng: location.longitude! };
		searchRadiusCircle.setCenter(position);
		searchRadiusCircle.setRadius(searchRadius * 1000); // Convert km to meters
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
		const zipComponent = components.find((component) => component.types.includes('postal_code'));
		return zipComponent?.long_name || '';
	}

	async function tryInitMap() {
		try {
			// Only proceed if Google Maps is ready and mapElement exists
			if (!googleMapsReady) {
				// Don't throw error immediately, wait a bit more
				setTimeout(() => {
					if (!googleMapsReady) {
						console.warn('Google Maps not ready after waiting');
						error = 'Google Maps API not initialized';
						hasError = true;
						isLoading = false;
					}
				}, 2000);
				return;
			}

			if (!mapElement) {
				throw new Error('Map element not found');
			}

			await initMap();
			isMapLoaded = true;
			hasError = false; // Clear any previous errors
			error = '';

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

		// Update search radius circle
		updateSearchRadiusCircle();
	}

	// Watch for location changes
	$effect(() => {
		if (location.latitude && location.longitude && isMapLoaded) {
			updateMapCenter();
		}
	});

	// Watch for search radius changes
	$effect(() => {
		if (isMapLoaded && searchRadiusCircle) {
			updateSearchRadiusCircle();
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

	let mapLoadWatch: ReturnType<typeof setTimeout> | undefined;

	onMount(async () => {
		mapLoadWatch = setTimeout(() => {
			if (isLoading) {
				hasError = true;
				isLoading = false;
			}
		}, 8000);
		try {
			// Mark component as mounted
			isComponentMounted = true;

			// Load Google Maps script
			await withTimeout(loadGoogleMapsScript(), 8000);
		} catch (err) {
			console.error('Error loading Google Maps:', err);
			error = err instanceof Error ? err.message : 'Error loading Google Maps';
			hasError = true;
			isLoading = false;
		}
	});

	onDestroy(() => {
		clearTimeout(mapLoadWatch);
		// Cleanup
		if (marker) marker.map = null;
		if (searchRadiusCircle) searchRadiusCircle.setMap(null);
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
						<p class="text-base-content/70 text-sm">Loading map...</p>
					</div>
				</div>
			{:else if hasError}
				<div class="bg-base-200 flex h-full w-full items-center justify-center">
					<div class="text-center">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="text-error mx-auto mb-2 h-12 w-12"
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
						<p class="text-error text-sm">
							{$t('dashboard.bids.components.maps.location_picker_map.error_loading_map')}
						</p>
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
