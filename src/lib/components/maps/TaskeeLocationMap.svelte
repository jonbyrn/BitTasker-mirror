<script lang="ts">
	import type { TaskeeProfile } from '$lib/nostr/findTaskees';
	import type { Location } from '$lib/types/task';
	import { onMount, onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';

	let {
		taskees = [],
		height = '60vh',
		selectedTaskee = null,
		onTaskeeSelected,
		showFullscreen = true
	} = $props<{
		taskees: TaskeeProfile[];
		height?: string;
		selectedTaskee?: TaskeeProfile | null;
		onTaskeeSelected?: (event: { taskee: TaskeeProfile }) => void;
		showFullscreen?: boolean;
	}>();

	void taskees;
	void onTaskeeSelected;

	type MapInstance = object;
	type MarkerInstance = { map: unknown | null };

	// State
	let map: MapInstance | null = null;
	let mapElement: HTMLElement | null = $state(null);
	let markers: MarkerInstance[] = $state([]);
	let isMapLoaded = $state(false);
	let hasError = $state(false);
	let googleMapsReady = $state(false);
	let isLoading = $state(true);
	let userLocation: Location | null = $state(null);
	let markerLibrary: unknown | null = $state(null);

	function getGoogleMaps() {
		if (!window.google?.maps) {
			throw new Error('Google Maps API not available');
		}

		return window.google.maps;
	}

	// Function to get user's location
	async function getUserLocation(): Promise<Location | null> {
		return new Promise((resolve) => {
			if (!navigator.geolocation) {
				resolve(null);
				return;
			}

			navigator.geolocation.getCurrentPosition(
				(position) => {
					const userLoc: Location = {
						displayName: $t('dashboard.bids.components.maps.task_location_map.your_location'),
						latitude: position.coords.latitude,
						longitude: position.coords.longitude,
						zipCode: '',
						locationLoaded: true
					};
					resolve(userLoc);
				},
				() => {
					resolve(null);
				},
				{
					timeout: 10000,
					enableHighAccuracy: true,
					maximumAge: 300000 // 5 minutes
				}
			);
		});
	}

	// Load Google Maps script
	async function loadGoogleMapsScript(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			try {
				// Check if script is already loaded and API is available
				if (window.google?.maps?.Map) {
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
				script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&loading=async&libraries=marker`;
				script.async = true;
				script.defer = true;

				script.onload = () => {
					setTimeout(() => {
						if (window.google?.maps?.Map) {
							googleMapsReady = true;
							resolve();
						} else {
							reject(new Error('Google Maps API not initialized'));
						}
					}, 500);
				};

				script.onerror = () => {
					hasError = true;
					reject(new Error('Failed to load Google Maps'));
				};

				document.head.appendChild(script);
			} catch (err) {
				reject(err);
			}
		});
	}

	// Initialize map
	async function initMap(): Promise<void> {
		if (!mapElement || !googleMapsReady) return;

		try {
			const googleMaps = getGoogleMaps();
			// Get user location for map center
			userLocation = await getUserLocation();

			// Determine map center: user location > default
			const centerLocation: Location = userLocation || {
				displayName: 'Centroamérica',
				latitude: 13.6929,
				longitude: -89.2182,
				zipCode: '',
				locationLoaded: false
			};

			// Initialize map
			map = new googleMaps.Map(mapElement, {
				center: { lat: centerLocation.latitude!, lng: centerLocation.longitude! },
				zoom: 6,
				mapId: 'TASKEES_MAP',
				disableDefaultUI: false,
				zoomControl: true,
				mapTypeControl: false,
				scaleControl: true,
				streetViewControl: false,
				rotateControl: false,
				fullscreenControl: showFullscreen
			});

			// Load marker library
			const markerLibraryImport = await googleMaps.importLibrary('marker');
			markerLibrary = markerLibraryImport;

			isMapLoaded = true;
			isLoading = false;

			// Update markers when taskees change
			updateMarkers();
		} catch (err) {
			console.error('Error initializing map:', err);
			hasError = true;
			isLoading = false;
		}
	}

	// Update markers on map
	// Note: Since taskees don't currently have location data, this is a placeholder
	// When location data is added, we can implement proper marker updates
	function updateMarkers(): void {
		if (!map || !markerLibrary || !isMapLoaded) return;

		// Clear existing markers
		markers.forEach((marker) => {
			marker.map = null;
		});
		markers = [];

		// Note: Taskees don't currently have location data
		// This is a placeholder for when location data is added
		// For now, we just show the map without markers

		// If we have a selected taskee, we could center on it if it had location data
		if (selectedTaskee) {
			// Future: center on taskee location if available
		}
	}

	// Initialize on mount
	onMount(async () => {
		try {
			await loadGoogleMapsScript();
			await initMap();
		} catch (err) {
			console.error('Error setting up map:', err);
			hasError = true;
			isLoading = false;
		}
	});

	// Cleanup on destroy
	onDestroy(() => {
		if (markers) {
			markers.forEach((marker) => {
				marker.map = null;
			});
		}
		if (map) {
			getGoogleMaps().event.clearInstanceListeners(map as object);
		}
	});
</script>

<div class="taskee-location-map w-full">
	<!-- Map Container -->
	<div class="map-container relative max-h-[800px] w-full" style="height: {height};">
		<div bind:this={mapElement} class="h-full w-full overflow-hidden rounded-lg">
			{#if isLoading}
				<div class="bg-base-200 flex h-full w-full items-center justify-center">
					<div class="text-center">
						<span class="loading loading-spinner loading-lg mb-2"></span>
						<p class="text-base-content/70 text-sm">
							{$t('dashboard.bids.components.maps.task_location_map.loading_map')}
						</p>
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
							{$t('dashboard.bids.components.maps.task_location_map.error_loading_map')}
						</p>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
