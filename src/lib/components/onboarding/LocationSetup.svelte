<script lang="ts">
	import type { Location } from '$lib/types/task';
	import { onMount } from 'svelte';
	import { Geolocation } from '@capacitor/geolocation';
	import { ScreenOrientation } from '@capacitor/screen-orientation';
	import { publishLocation, getLatestLocation } from '$lib/nostr/location';
	import { t } from 'svelte-i18n';
	import IconCheck from '~icons/mdi/check-circle-outline';

	let { nextStep, prevStep } = $props();

	// State
	let map: google.maps.Map | null = null;
	let mapElement: HTMLElement;
	let searchInput: HTMLInputElement;
	let marker: google.maps.marker.AdvancedMarkerElement | null = null;
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
	let error = $state('');
	let predictions = $state<(google.maps.places.PlacePrediction | null)[]>([]);
	let showOptions = $state(false);
	let scriptLoaded = $state(false);
	let googleMapsReady = $state(false);
	let isFullscreen = $state(false);
	let toggleRadius = $state(false);
	let mapContainerDiv: HTMLElement | null = $state(null);
	let initRetryCount = $state(0);
	let maxRetries = 3;

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
							reject(new Error($t('onboarding_auth.form.google_maps_api_not_initialized')));
						}
					}, 500);
				};

				script.onerror = () => {
					reject(new Error($t('onboarding_auth.form.google_maps_script_failed_load')));
				};

				document.head.appendChild(script);
			} catch (error) {
				reject(error);
			}
		});
	}

	async function initMap() {
		if (!googleMapsReady || !window.google?.maps?.Map) {
			throw new Error($t('onboarding_auth.form.google_maps_not_fully_loaded'));
		}

		try {
			// Initialize Google Maps
			map = new google.maps.Map(mapElement, {
				center: { lat: location.latitude!, lng: location.longitude! },
				zoom: 12,
				mapTypeId: google.maps.MapTypeId.ROADMAP,
				mapTypeControl: false,
				fullscreenControl: false,
				streetViewControl: false,
				mapId: import.meta.env.PROD ? import.meta.env.VITE_GOOGLE_MAPS_ID : 'DEMO_MAP_ID' // Required for AdvancedMarkerElement
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

			const savedLocation = await getLatestLocation();
			if (savedLocation) {
				location = savedLocation;
				createMarkerAndCircle(savedLocation.latitude!, savedLocation.longitude!);
			} else {
				// Try to get user's geolocation
				getUserLocation();
			}
		} catch (err) {
			console.error('Error initializing map:', err);
			error =
				err instanceof Error ? err.message : $t('onboarding_auth.form.error_initializing_map');
			hasError = true;
		}
	}

	onMount(async () => {
		try {
			isLoading = true;

			// Load Google Maps API dynamically if not already loaded
			await loadGoogleMapsScript();

			// Try to initialize the map
			await tryInitMap();
		} catch (err) {
			console.error('Error loading Google Maps:', err);
			error =
				err instanceof Error ? err.message : $t('onboarding_auth.form.error_loading_google_maps');
		} finally {
			isLoading = false;
		}
	});

	async function updateLocationWithCoordinates(lat: number, lng: number) {
		try {
			// Update marker and circle
			createMarkerAndCircle(lat, lng);

			// Reverse geocode to get address
			if (googleMapsReady && window.google?.maps) {
				const { Geocoder } = (await google.maps.importLibrary(
					'geocoding'
				)) as google.maps.GeocodingLibrary;
				const geocoder = new Geocoder();

				const result = await geocoder.geocode({
					location: { lat, lng }
				});

				if (result.results[0]) {
					const addressComponents = result.results[0].address_components;
					const zipCode =
						addressComponents.find((component) => component.types.includes('postal_code'))
							?.short_name || '';

					// Update location state
					location = {
						...location,
						displayName: result.results[0].formatted_address,
						latitude: lat,
						longitude: lng,
						zipCode,
						locationLoaded: true
					};
				}
			}
		} catch (err: unknown) {
			console.error('Error updating location:', err);
			error =
				err instanceof Error ? err.message : $t('onboarding_auth.form.error_updating_location');
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
				gmpDraggable: true
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
				const position = marker?.position;
				if (position) {
					const newLat = typeof position.lat === 'function' ? position.lat() : position.lat;
					const newLng = typeof position.lng === 'function' ? position.lng() : position.lng;
					if (newLat && newLng) {
						// Update circle position
						if (circle) circle.setCenter({ lat: newLat, lng: newLng });
						// Update location data
						updateLocationWithCoordinates(newLat, newLng);
					}
				}
			});

			// Pan map to new location
			map.panTo(position);
		} catch (error) {
			console.error('Error creating advanced marker:', error);
		}
	}

	// Handle service radius change
	function updateServiceRadius() {
		if (circle) {
			circle.setRadius(serviceRadius * 1000); // Convert km to meters
		}
	}

	// Place search functionality
	async function getPredictions() {
		if (!googleMapsReady || !window.google?.maps) {
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
		if (!googleMapsReady || !window.google?.maps) return;

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
			if (marker && marker.position) {
				const position = marker.position;
				const lat = typeof position.lat === 'function' ? position.lat() : position.lat;
				const lng = typeof position.lng === 'function' ? position.lng() : position.lng;
				if (lat && lng) {
					map.setCenter({ lat, lng });
				}
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
			if (marker && marker.position) {
				const position = marker.position;
				const lat = typeof position.lat === 'function' ? position.lat() : position.lat;
				const lng = typeof position.lng === 'function' ? position.lng() : position.lng;
				if (lat && lng) {
					map.setCenter({ lat, lng });
				}
			}
		}
	}

	async function handleSubmit() {
		try {
			isLoading = true;

			// If map failed to load, allow user to proceed without setting location
			if (hasError && !isMapLoaded) {
				console.log('Map failed to load, proceeding without location');
				nextStep();
				return;
			}

			// Don't proceed if location isn't loaded yet (only when map is working)
			if (location.latitude === null || location.longitude === null) {
				error = $t('onboarding_auth.form.please_select_a_location');
				throw new Error($t('onboarding_auth.form.please_select_a_location'));
			}

			// Publish location to Nostr
			await publishLocation(location);

			// Go to next step
			nextStep();
		} catch (err: unknown) {
			console.error('Error saving location:', err);
			error = err instanceof Error ? err.message : $t('onboarding_auth.form.error_saving_location');
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="card bg-base-100 w-full shadow-xl">
	<div class="card-body relative">
		<!-- Educational Header -->
		<div class="education-header mb-6 text-center">
			<div class="step-indicator text-primary mb-2 text-end text-sm font-medium">Step 6 of 7</div>
			<h3 class="step-title mt-4 mb-3">Set Your Service Location</h3>
			<h5 class="mb-3">Choose where you work</h5>
			<p class="step-description text-base-content mx-auto mb-6 max-w-xl text-lg">
				Define where you can provide services. This helps match you with nearby Taskers, and Taskees.
			</p>

			<!-- Features List -->
			<div class="features-list mx-auto mb-6 max-w-xl space-y-2 text-left">
				<div class="feature-item flex items-center justify-start gap-2 text-lg">
					<IconCheck class="text-primary min-w-[1.5em]" />
					<span><strong>Flexible</strong> — set a custom service or search radius</span>
				</div>
				<div class="feature-item flex items-center justify-start gap-2 text-lg">
					<IconCheck class="text-primary min-w-[1.5em]" />
					<span><strong>Private</strong> — only your approximate area is shared</span>
				</div>
				<div class="feature-item flex items-center justify-start gap-2 text-lg">
					<IconCheck class="text-primary min-w-[1.5em]" />
					<span><strong>Adjustable</strong> — change your location anytime in settings</span>
				</div>
				<div class="feature-item flex items-center justify-start gap-2 text-lg">
					<IconCheck class="text-primary min-w-[1.5em]" />
					<span><strong>Optional</strong> — you can set it later if you want</span>
				</div>
			</div>
			<p class="text-primary mb-6 text-lg">Find tasks near you. Set where you work.</p>
		</div>
	</div>
	<!-- Constrained Map Wrapper -->
	<div class="mx-auto w-full max-w-xl">
		<!-- Map Container -->
		<div class="map-container relative w-full">
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
								<div class="text-error px-4 py-2">{$t('onboarding_auth.form.no_places_found')}</div>
							{/if}
						</div>
					{/if}
				</div>
			</div>

			<!-- Map Container -->
			<div bind:this={mapContainerDiv} class="map-container relative w-full">
				<!-- Service Radius Slider -->
                <div
                    class="{isFullscreen
                        ? 'fixed bottom-20 left-4 z-[999]'
                        : 'absolute bottom-4 left-4 z-20 '} btn btn-circle btn-lg bg-base-100/90 shadow-md"
                >
					<button
						aria-label={$t('onboarding_auth.form.toggle_radius')}
						onclick={() => (toggleRadius = !toggleRadius)}
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
										<span class="label-text text-white"
											>{$t('onboarding_auth.form.service_radius')}: {serviceRadius} km</span
										>
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
			</div>

			<!-- Fullscreen Button - using fixed positioning when in fullscreen mode -->
			<button
				onclick={toggleFullscreen}
				class="{isFullscreen
					? 'fixed bottom-4 left-4 z-[999]'
					: 'absolute bottom-4 left-4 z-20'} btn btn-circle btn-lg bg-base-100/90 shadow-md"
				aria-label={isFullscreen
					? $t('onboarding_auth.form.exit_fullscreen')
					: $t('onboarding_auth.form.enter_fullscreen')}
				title={isFullscreen
					? $t('onboarding_auth.form.exit_fullscreen')
					: $t('onboarding_auth.form.enter_fullscreen')}
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
					<div class="bg-base-200 flex h-full min-h-96 w-full items-center justify-center">
						<span class="loading loading-spinner loading-lg"></span>
					</div>
				{/if}
			</div>
		</div>

		{#if error}
			<div class="alert alert-error alert-outline mx-4 mt-4">
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
				<span>{error}</span>
			</div>
		{/if}

		{#if location.locationLoaded}
			<div class="alert alert-success alert-outline mx-4 mt-4">
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

		<!-- Retry button for map loading issues -->
		{#if hasError && !isMapLoaded}
			<div class="alert alert-warning alert-outline mx-4 mt-4">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/></svg
				>
				<div>
					<h3 class="font-bold">{$t('onboarding_auth.form.map_loading_failed')}</h3>
					<div class="text-xs">{$t('onboarding_auth.form.try_reloading_the_map')}</div>
				</div>
				<button
					class="btn btn-sm"
					onclick={() => {
						hasError = false;
						loadGoogleMapsScript().then(() => tryInitMap());
					}}
				>
					{$t('onboarding_auth.form.retry')}
				</button>
			</div>
		{/if}
	</div>

	<div class="mt-6 flex justify-between">
		<button type="button" class="btn btn-outline" onclick={prevStep}>
			{$t('onboarding_auth.form.back')}
		</button>
		<button
			type="button"
			class="btn btn-primary"
			onclick={handleSubmit}
			disabled={isLoading || (!location.locationLoaded && !hasError && !isMapLoaded)}
		>
			{#if isLoading}
				<span class="loading loading-spinner"></span>
			{/if}
			{$t('onboarding_auth.form.next')}
		</button>
	</div>
</div>

<style>
	:global(.pac-container) {
		z-index: 9999;
	}
</style>
