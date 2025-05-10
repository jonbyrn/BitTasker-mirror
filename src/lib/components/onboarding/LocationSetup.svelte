<script lang="ts">
	import { onMount } from 'svelte';
	import type { Location } from '$lib/types/task';
	import { Geolocation } from '@capacitor/geolocation';
	import { Preferences } from '@capacitor/preferences';
	import { ScreenOrientation } from '@capacitor/screen-orientation';

	let { nextStep, prevStep, onLocationSelect = (location: Location) => {} } = $props();

	// State
	let map: google.maps.Map | null = null;
	let mapElement: HTMLElement;
	let searchInput: HTMLInputElement;
	let marker: google.maps.Marker | null = null;
	let circle: google.maps.Circle | null = null;
	let serviceRadius = $state(10); // Default to 10 km
	let location = $state<Location>({
		displayName: '',
		latitude: 37.7749,
		longitude: -122.4194,
		zipCode: '',
		locationLoaded: false
	});
	let isLoading = $state(false);
	let isMapLoaded = $state(false);
	let hasError = $state(false);
	let predictions = $state<(google.maps.places.PlacePrediction | null)[]>([]);
	let showOptions = $state(false);
	let scriptLoaded = $state(false);
	let isFullscreen = $state(false);
	let toggleRadius = $state(false);
	let mapContainerDiv: HTMLElement | null = $state(null);

	// Function to dynamically load Google Maps script
	async function loadGoogleMapsScript() {
		return new Promise<void>((resolve, reject) => {
			try {
				// Check if script is already loaded
				if (window.google?.maps) {
					scriptLoaded = true;
					resolve();
					return;
				}

				const API_KEY = 'AIzaSyAqWtItXmQGJWbTOGX-CW2VciMuKiUMqZY'; // Replace with your actual API key
				const script = document.createElement('script');
				script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places`;
				script.async = true;
				script.defer = true;

				script.onload = () => {
					scriptLoaded = true;
					resolve();
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
		if (!scriptLoaded) {
			throw new Error('Google Maps not loaded yet');
		}

		try {
			// Initialize Google Maps
			map = new google.maps.Map(mapElement, {
				center: { lat: location.latitude!, lng: location.longitude! },
				zoom: 12,
				mapTypeId: google.maps.MapTypeId.ROADMAP,
				mapTypeControl: false,
				fullscreenControl: false,
				streetViewControl: false
			});

			// Add map click event to place marker
			map.addListener('click', (event: google.maps.MapMouseEvent) => {
				const clickedLat = event.latLng?.lat();
				const clickedLng = event.latLng?.lng();
				if (clickedLat && clickedLng) {
					updateLocationWithCoordinates(clickedLat, clickedLng);
				}
			});
		} catch (error) {
			console.error('Error initializing Google Maps:', error);
			throw error;
		}
	}

	async function getUserLocation() {
		try {
			isLoading = true;
			// Check permissions first
			const permissionStatus = await Geolocation.checkPermissions();

			if (permissionStatus.location !== 'granted') {
				// Request permissions if not granted
				await Geolocation.requestPermissions();
			}

			// Get current position
			const position = await Geolocation.getCurrentPosition({
				enableHighAccuracy: true,
				timeout: 10000
			});

			const lat = position.coords.latitude;
			const lng = position.coords.longitude;

			// Update map and marker
			updateLocationWithCoordinates(lat, lng);
		} catch (error) {
			console.error('Geolocation error:', error);
			// Use default location if geolocation fails
			createMarkerAndCircle(location.latitude!, location.longitude!);
		} finally {
			isLoading = false;
		}
	}

	onMount(async () => {
		try {
			// Load Google Maps API dynamically if not already loaded
			if (!scriptLoaded && !window.google?.maps) {
				await loadGoogleMapsScript();
			} else {
				scriptLoaded = true;
			}

			// Wait for Google Maps to load
			await initMap();
			isMapLoaded = true;

			// Try to get user's geolocation
			getUserLocation();
		} catch (error) {
			console.error('Error initializing map:', error);
			hasError = true;
		}
	});

	async function updateLocationWithCoordinates(lat: number, lng: number) {
		try {
			// Update marker and circle
			createMarkerAndCircle(lat, lng);

			// Reverse geocode to get address
			if (window.google?.maps) {
				const { Geocoder } = (await google.maps.importLibrary(
					'geocoding'
				)) as google.maps.GeocodingLibrary;
				const geocoder = new Geocoder();

				const result = await geocoder.geocode({
					location: { lat, lng }
				});

				if (result.results[0]) {
					const address = result.results[0];

					// Find zip/postal code
					let postalCode = '';
					for (const component of address.address_components) {
						if (component.types.includes('postal_code')) {
							postalCode = component.short_name;
							break;
						}
					}

					// Update location
					location = {
						displayName: address.formatted_address,
						latitude: lat,
						longitude: lng,
						zipCode: postalCode,
						locationLoaded: true
					};

					// Call the callback function
					if (onLocationSelect) {
						onLocationSelect(location);
					}

					// Save location to preferences
					await Preferences.set({
						key: 'user_location',
						value: JSON.stringify(location)
					});
				}
			}
		} catch (error) {
			console.error('Error updating location:', error);
			hasError = true;
		}
	}

	function createMarkerAndCircle(lat: number, lng: number) {
		if (!map || !window.google?.maps) return;

		const position = { lat, lng };

		// Remove existing marker and circle
		if (marker) marker.setMap(null);
		if (circle) circle.setMap(null);

		// Create new marker
		marker = new google.maps.Marker({
			position,
			map,
			draggable: true,
			animation: google.maps.Animation.DROP
		});

		// Create circle for service radius
		circle = new google.maps.Circle({
			strokeColor: '#4CAF50',
			strokeOpacity: 0.8,
			strokeWeight: 2,
			fillColor: '#4CAF50',
			fillOpacity: 0.2,
			map,
			center: position,
			radius: serviceRadius * 1000 // Convert km to meters
		});

		// Add drag event to marker
		marker.addListener('dragend', () => {
			const newLat = marker?.getPosition()?.lat();
			const newLng = marker?.getPosition()?.lng();
			if (newLat && newLng) {
				// Update circle position
				if (circle) circle.setCenter({ lat: newLat, lng: newLng });
				// Update location data
				updateLocationWithCoordinates(newLat, newLng);
			}
		});

		// Pan map to new location
		map.panTo(position);
	}

	// Handle service radius change
	function updateServiceRadius() {
		if (circle) {
			circle.setRadius(serviceRadius * 1000); // Convert km to meters
		}
	}

	// Place search functionality
	async function getPredictions() {
		if (!window.google?.maps) {
			hasError = true;
			return;
		}

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

			const request = {
				input: searchInput.value,
				language: 'en-US',
				sessionToken: token
			};

			const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
			predictions = suggestions.map((suggestion) => suggestion.placePrediction);
			showOptions = true;
		} catch (error) {
			hasError = true;
			console.error('Failed to get predictions:', error);
		} finally {
			isLoading = false;
		}
	}

	// Debounce function for search input
	function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
		let timeoutId: ReturnType<typeof setTimeout>;
		return function (...args: Parameters<T>) {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(() => fn.apply(null, args), delay);
		};
	}

	async function selectPrediction(prediction: google.maps.places.PlacePrediction) {
		if (!window.google?.maps) return;

		let place = prediction.toPlace();
		await place.fetchFields({
			fields: ['displayName', 'formattedAddress', 'location']
		});

		const displayName = place.displayName;
		const lat = place.location?.lat();
		const lng = place.location?.lng();

		if (!displayName || !lat || !lng) return;

		// Update location
		updateLocationWithCoordinates(lat, lng);

		// Clear predictions
		showOptions = false;
		searchInput.value = displayName;
	}

	// Fullscreen functionality
	async function toggleFullscreen() {
		if (isFullscreen) {
			await exitFullscreen();
		} else {
			await enterFullscreen();
		}
	}

	async function enterFullscreen() {
		isFullscreen = true;

		try {
			// Try to use Capacitor's native fullscreen if available
			await ScreenOrientation.lock({ orientation: 'portrait' });
		} catch (error) {
			console.log('Using fallback fullscreen method - Capacitor ScreenOrientation not available');
		}

		// Store original dimensions for restoring later
		if (mapContainerDiv) {
			// Apply fullscreen styles
			mapContainerDiv.style.position = 'fixed';
			mapContainerDiv.style.top = '0';
			mapContainerDiv.style.left = '0';
			mapContainerDiv.style.width = '100%';
			mapContainerDiv.style.height = '100%';
			mapContainerDiv.style.zIndex = '10'; // Lower z-index to ensure controls stay on top
			mapContainerDiv.style.backgroundColor = 'white';
		}

		// Trigger resize to update map
		if (map) {
			google.maps.event.trigger(map, 'resize');
			if (marker && marker.getPosition()) {
				map.setCenter(marker.getPosition()!);
			}
		}
	}

	async function exitFullscreen() {
		isFullscreen = false;

		try {
			// Release orientation lock if we used Capacitor
			await ScreenOrientation.unlock();
		} catch (error) {
			console.log('Capacitor ScreenOrientation not available');
		}

		// Restore original CSS styles
		if (mapContainerDiv) {
			mapContainerDiv.style.position = 'relative';
			mapContainerDiv.style.top = 'auto';
			mapContainerDiv.style.left = 'auto';
			mapContainerDiv.style.width = '100%';
			mapContainerDiv.style.zIndex = 'auto';
			mapContainerDiv.style.backgroundColor = 'transparent';
		}

		// Trigger resize to update map
		if (map) {
			google.maps.event.trigger(map, 'resize');
			if (marker && marker.getPosition()) {
				map.setCenter(marker.getPosition()!);
			}
		}
	}
</script>

<div class="card w-full">
	<div class="card-body relative p-0">
		<!-- Search bar - using fixed positioning when in fullscreen mode -->
		<div
			class={isFullscreen
				? 'fixed top-4 right-4 left-4 z-[999]'
				: 'absolute top-4 right-0 left-0 z-10 px-4'}
		>
			<div class="form-control relative w-full">
				<div class="input-group flex w-full items-center justify-center gap-4">
					<input
						bind:this={searchInput}
						type="text"
						placeholder="Search for a location..."
						class="input input-bordered w-full {hasError ? 'input-error' : ''}"
						oninput={debounce(() => getPredictions(), 300)}
					/>
					<button
						aria-label="Use current location"
						class="btn btn-square"
						onclick={() => getUserLocation()}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
							/>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
							/>
						</svg>
					</button>
				</div>

				{#if isLoading}
					<div class="absolute top-1/2 right-16 -translate-y-1/2">
						<span class="loading loading-spinner loading-sm"></span>
					</div>
				{/if}

				{#if showOptions}
					<div
						class="predictions-dropdown bg-base-100 absolute z-[1000] mt-1 max-h-60 w-full overflow-y-auto rounded-lg shadow-lg"
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
							<div class="text-error px-4 py-2">No places found..</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<!-- Map Container -->
		<div bind:this={mapContainerDiv} class="map-container relative">
			<!-- Service Radius Slider -->
			<div
				class="{isFullscreen
					? 'fixed bottom-20 left-4 z-[999]'
					: 'absolute bottom-20 left-4 z-20 '} btn btn-circle btn-lg bg-base-100/90 shadow-md"
			>
				<button
					aria-label="Toggle radius"
					onclick={() => {
						toggleRadius = !toggleRadius;
						console.log(toggleRadius);
					}}
					class="relative"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 1024 1024">
						<path
							fill="#fff"
							d="M518.5 360.3a7.95 7.95 0 0 0-12.9 0l-178 246c-3.8 5.3 0 12.7 6.5 12.7H381c10.2 0 19.9-4.9 25.9-13.2L512 460.4l105.2 145.4c6 8.3 15.6 13.2 25.9 13.2H690c6.5 0 10.3-7.4 6.5-12.7z"
						/>
						<path
							fill="#fff"
							d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448s448-200.6 448-448S759.4 64 512 64m0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372s372 166.6 372 372s-166.6 372-372 372"
						/>
					</svg>

					{#if toggleRadius}
						<div
							class="bg-base-100/80 absolute -top-3 left-0 -translate-y-full rounded-lg px-4 font-semibold"
						>
							<label class="form-control w-full">
								<div class="label text-xs sm:text-sm">
									<span class="label-text text-white">Service Radius: {serviceRadius} km</span>
								</div>
								<input
									type="range"
									min="1"
									max="50"
									bind:value={serviceRadius}
									onchange={updateServiceRadius}
									class="range range-success range-xs"
									step="1"
								/>
								<div class="label text-xs sm:text-sm">
									<span class="label-text-alt text-white">1 km</span>
									<span class="label-text-alt text-white">50 km</span>
								</div>
							</label>
						</div>
					{/if}
				</button>
			</div>

			<!-- Fullscreen Button - using fixed positioning when in fullscreen mode -->
			<button
				onclick={toggleFullscreen}
				class="{isFullscreen
					? 'fixed bottom-4 left-4 z-[999]'
					: 'absolute bottom-4 left-4 z-20'} btn btn-circle btn-lg bg-base-100/90 shadow-md"
				aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
				title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
			>
				{#if isFullscreen}
					<!-- Exit fullscreen icon -->
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-8 w-8"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M5 9V7a2 2 0 012-2h2v2H7v2H5zm10 0V7a2 2 0 00-2-2h-2v2h2v2h2zm0 6v-2a2 2 0 00-2-2h-2v2h2v2h2zm-10 0v-2a2 2 0 012-2h2v2H7v2H5z"
							clip-rule="evenodd"
						/>
					</svg>
				{:else}
					<!-- Enter fullscreen icon -->
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-8 w-8"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 011.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 011.414-1.414L15 13.586V12a1 1 0 011-1z"
							clip-rule="evenodd"
						/>
					</svg>
				{/if}
			</button>
			<div bind:this={mapElement} class="h-full min-h-96 w-full overflow-hidden rounded-lg">
				{#if !isMapLoaded}
					<div class="bg-base-200 flex h-full w-full items-center justify-center">
						<span class="loading loading-spinner loading-lg"></span>
					</div>
				{/if}
			</div>
		</div>

		{#if hasError}
			<div class="alert alert-error mx-4 mt-4">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/></svg
				>
				<span>Error loading the map. Please try again.</span>
			</div>
		{/if}

		{#if location.locationLoaded}
			<div class="alert alert-success mx-4 mt-4">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
					/></svg
				>
				<span>Location set: {location.displayName}</span>
			</div>
		{/if}
	</div>
</div>
