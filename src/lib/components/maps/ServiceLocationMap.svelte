<script lang="ts">
import type { Service } from '$lib/types/service.d';
	import type { Location } from '$lib/types/task.d';
import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { t } from 'svelte-i18n';

	let {
		services = [],
		height = '60vh',
		selectedService = null,
		onServiceSelected
	} = $props<{
		services: Service[];
		height?: string;
		selectedService?: Service | null;
		onServiceSelected?: (event: { service: Service }) => void;
	}>();

let mapElement: HTMLElement | null = null;
	let map: google.maps.Map | null = null;
	let markers: google.maps.marker.AdvancedMarkerElement[] = [];
	let isMapLoaded = $state(false);
	let hasError = $state(false);
	let error = $state('');
	let scriptLoaded = $state(false);
	let googleMapsReady = $state(false);

	function getServiceLocation(service: Service): Location | null {
		if (service.locationDetails?.taskerLocation?.serviceLocation) {
			return service.locationDetails.taskerLocation.serviceLocation;
		}

		if (service.locationDetails?.taskeeLocation?.serviceLocation) {
			return service.locationDetails.taskeeLocation.serviceLocation;
		}

		return null;
	}

	function getInitialCenter(): google.maps.LatLngLiteral {
		for (const service of services) {
			const location = getServiceLocation(service);
			if (location && location.latitude !== null && location.longitude !== null) {
				return {
					lat: location.latitude,
					lng: location.longitude
				};
			}
		}

		// Default to a neutral world view if no locations are available
		return { lat: 20, lng: 0 };
	}

	function clearMarkers() {
		for (const marker of markers) {
			marker.setMap(null);
		}
		markers = [];
	}

	async function createMarkers() {
		if (!map) return;

		clearMarkers();

		for (const service of services) {
			const location = getServiceLocation(service);
			if (!location || location.latitude === null || location.longitude === null) {
				continue;
			}

			const marker = await createServiceMarker(location.latitude, location.longitude, service);
			if (marker) {
				markers = [...markers, marker];
			}
		}
	}

	async function createServiceMarker(
		lat: number,
		lng: number,
		service: Service
	): Promise<google.maps.marker.AdvancedMarkerElement | null> {
		if (!map || !googleMapsReady || !window.google?.maps) return null;

		try {
			// Use AdvancedMarkerElement via dynamic importLibrary like TaskLocationMap
			const markerLib = (await google.maps.importLibrary('marker')) as google.maps.MarkerLibrary;
			const { AdvancedMarkerElement } = markerLib;

			const markerContainer = document.createElement('div');
			markerContainer.style.position = 'relative';
			markerContainer.style.cursor = 'pointer';

			const img = document.createElement('img');
			img.src = '/map-pin.png';
			img.style.width = '3.5rem';
			img.style.height = '3.5rem';
			img.style.display = 'block';
			img.style.borderRadius = '50%';

			markerContainer.appendChild(img);

			const marker = new AdvancedMarkerElement({
				position: { lat, lng },
				map,
				content: markerContainer,
				gmpDraggable: false
			});

			marker.addListener('click', () => {
				selectedService = service;
				if (onServiceSelected) {
					onServiceSelected({ service });
				}
			});

			return marker;
		} catch (error) {
			console.error('Error creating service marker:', error);
			return null;
		}
	}

	// Dynamically load Google Maps script (simplified copy of TaskLocationMap helper)
	async function loadGoogleMapsScript() {
		return new Promise<void>((resolve, reject) => {
			try {
				if (window.google?.maps?.Map) {
					scriptLoaded = true;
					googleMapsReady = true;
					resolve();
					return;
				}

				const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
				if (existingScript) {
					existingScript.addEventListener('load', () => {
						if (window.google?.maps?.Map) {
							scriptLoaded = true;
							googleMapsReady = true;
							resolve();
							return;
						}

						let attempts = 0;
						const maxAttempts = 50;
						const checkReady = () => {
							if (window.google?.maps?.Map) {
								scriptLoaded = true;
								googleMapsReady = true;
								resolve();
							} else if (attempts < maxAttempts) {
								attempts += 1;
								setTimeout(checkReady, 100);
							} else {
								reject(new Error('Google Maps API not initialized after timeout'));
							}
						};
						checkReady();
					});
					return;
				}

				const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
				const script = document.createElement('script');
				script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&loading=async`;
				script.async = true;
				script.defer = true;

				script.onload = () => {
					scriptLoaded = true;
					if (window.google?.maps?.Map) {
						googleMapsReady = true;
						resolve();
						return;
					}

					let attempts = 0;
					const maxAttempts = 50;
					const checkReady = () => {
						if (window.google?.maps?.Map) {
							googleMapsReady = true;
							resolve();
						} else if (attempts < maxAttempts) {
							attempts += 1;
							setTimeout(checkReady, 100);
						} else {
							reject(new Error('Google Maps API not initialized after timeout'));
						}
					};
					checkReady();
				};

				script.onerror = () => {
					reject(new Error('Failed to load Google Maps script'));
				};

				document.head.appendChild(script);
			} catch (err) {
				reject(err);
			}
		});
	}

	async function initMap() {
		if (!browser || !mapElement || map || isMapLoaded) return;

		try {
			await loadGoogleMapsScript();

			if (!googleMapsReady) {
				throw new Error('Google Maps API not ready');
			}

			const center = getInitialCenter();

			map = new google.maps.Map(mapElement, {
				center,
				zoom: 4,
				mapTypeControl: false,
				streetViewControl: false,
				fullscreenControl: false
			});

			createMarkers();
			isMapLoaded = true;
		} catch (err) {
			console.error('Error initializing ServiceLocationMap:', err);
			hasError = true;
			error = err instanceof Error ? err.message : 'Failed to load map';
		}
	}

	onMount(async () => {
		if (!browser) return;
		await initMap();
	});

	onDestroy(() => {
		clearMarkers();
		map = null;
	});
</script>

<div class="relative w-full overflow-hidden rounded-xl bg-base-200">
	{#if hasError}
		<div class="flex h-full items-center justify-center p-4">
			<span class="text-sm text-error">
				{$t('dashboard.services.browse.map_error') || error || 'Unable to load map.'}
			</span>
		</div>
	{:else}
		<div
			bind:this={mapElement}
			style={`height: ${height}; width: 100%;`}
			class="w-full"
		></div>

		{#if !isMapLoaded}
			<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
				<span class="loading loading-spinner loading-lg"></span>
			</div>
		{/if}
	{/if}
</div>

