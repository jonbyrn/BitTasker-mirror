<script lang="ts">
	import type { Location } from '$lib/types/task';
	import { onMount } from 'svelte';
	import { Geolocation } from '@capacitor/geolocation';
	import { ScreenOrientation } from '@capacitor/screen-orientation';
	import { publishLocation, getLatestLocation } from '$lib/nostr/location';
    import { t } from 'svelte-i18n';
    import { tick } from 'svelte';
	import IconCheck from '~icons/mdi/check-circle-outline';
    import IconMagnify from '~icons/mdi/magnify';

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
		latitude: 13.6929,
		longitude: -89.2182,
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
				strokeColor: '#F7931A',
				strokeOpacity: 0.8,
				strokeWeight: 2,
				fillColor: '#F7931A',
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

    let fullscreenResizeHandler: ((this: Window, ev: UIEvent) => any) | null = null;
    let escKeyHandler: ((this: Window, ev: KeyboardEvent) => any) | null = null;

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
			mapContainerDiv.style.width = '100vw';
			mapContainerDiv.style.height = '100vh';
			mapContainerDiv.style.zIndex = '100'; // Lower z-index so controls stay on top
			mapContainerDiv.style.backgroundColor = 'white';
			mapContainerDiv.style.overflow = 'hidden';
		}

        // Ensure inner map element fills the fullscreen container
        if (mapElement) {
            mapElement.style.width = '100%';
            mapElement.style.height = '100%';
            mapElement.style.minHeight = '100vh';
            mapElement.style.borderRadius = '0';
        }

        // Await DOM flush, then trigger Google Maps resize and re-center
        await tick();
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
            // Force a redraw by toggling zoom
            const currentZoom = map.getZoom();
            if (typeof currentZoom === 'number') {
                map.setZoom(currentZoom);
            }
        }

        // Keep size in sync when device UI chrome changes (mobile) or orientation changes
        fullscreenResizeHandler = () => {
            if (mapElement) {
                mapElement.style.height = '100%';
                mapElement.style.minHeight = '100vh';
            }
            if (map) {
                google.maps.event.trigger(map, 'resize');
            }
        };
        window.addEventListener('resize', fullscreenResizeHandler);

        // Enable ESC to exit fullscreen
        escKeyHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                exitFullscreen();
            }
        };
        window.addEventListener('keydown', escKeyHandler);
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
			mapContainerDiv.style.height = 'auto';
			mapContainerDiv.style.zIndex = 'auto';
			mapContainerDiv.style.backgroundColor = 'transparent';
			mapContainerDiv.style.overflow = 'visible';
		}

        // Restore map element size
        if (mapElement) {
            mapElement.style.width = '100%';
            mapElement.style.height = '';
            mapElement.style.minHeight = '24rem'; // 96px = 24rem
            mapElement.style.borderRadius = '0.5rem'; // rounded-lg
        }

        // Remove resize listener if present
        if (fullscreenResizeHandler) {
            window.removeEventListener('resize', fullscreenResizeHandler);
            fullscreenResizeHandler = null;
        }

        if (escKeyHandler) {
            window.removeEventListener('keydown', escKeyHandler);
            escKeyHandler = null;
        }

		// Trigger resize to update map
        await tick();
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
            const currentZoom = map.getZoom();
            if (typeof currentZoom === 'number') {
                map.setZoom(currentZoom);
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

<div class="card bg-base-100 w-full shadow-xl p-6">
	<div class="card-body relative">
		<!-- Educational Header -->
		<div class="education-header mb-6 text-center">
			<div class="step-indicator text-primary mb-2 text-end text-sm font-medium">Step 6 of 7</div>
			<h3 class="step-title mt-4 mb-3">Set Your Location</h3>
			<h5 class="mb-3">Find Taskers and Taskees near you</h5>
			<p class="step-description text-base-content mx-auto mb-6 max-w-xl text-lg">
				Define where you can provide services as a Taskee, or are searching as a Tasker. This helps match you with nearby Taskers and Taskees.
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
					? 'fixed top-6 left-6 right-6 z-[1000]'
					: 'absolute top-4 right-0 left-0 z-10 px-4'}
			>
                {#if isFullscreen}
                <div class="pointer-events-auto mb-4 flex w-full items-center justify-center">
                    <button class="btn btn-md bg-base-100/90 shadow-md border-none text-base-content hover:bg-base-100/90 hover:opacity-100" onclick={exitFullscreen}>
                        {$t('onboarding_auth.form.exit_fullscreen')}
                    </button>
                </div>
                {/if}
				<div class="form-control relative w-full">
					<div class="input-group">
						<input
							bind:this={searchInput}
							type="text"
							placeholder={$t('onboarding_auth.form.search_location')}
							oninput={getPredictions}
							onfocus={() => (showOptions = true)}
							class="input input-bordered w-full pr-20 mb-2"
						/>
						<button
							aria-label={$t('onboarding_auth.form.use_my_location')}
							onclick={getUserLocation}
							class="btn btn-square btn-primary"
							disabled={isLoading}
							title={$t('onboarding_auth.form.use_my_location')}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
								<circle cx="12" cy="10" r="3" />
							</svg>
						</button>
						<button
							onclick={() => (showOptions = false)}
							class="btn btn-square btn-primary"
							title={$t('onboarding_auth.form.search')}
						>
							<IconMagnify class="h-5 w-5" />
						</button>
					</div>

					{#if isLoading}
						<div class="absolute top-1/2 right-20 -translate-y-1/2">
							<span class="loading loading-spinner loading-sm"></span>
						</div>
					{/if}

					{#if showOptions}
						<div
							class="predictions-dropdown bg-base-100 absolute z-[1000] mt-2 max-h-60 w-full overflow-y-auto rounded-lg shadow-lg border border-base-300"
						>
							{#if predictions.length > 0}
								{#each predictions as prediction}
									<button
										class="hover:bg-base-200 w-full cursor-pointer px-4 py-3 text-left border-b border-base-200 last:border-b-0"
										onclick={() => selectPrediction(prediction!)}
									>
										{prediction?.text}
									</button>
								{/each}
							{:else}
								<div class="text-error px-4 py-3">{$t('onboarding_auth.form.no_places_found')}</div>
							{/if}
						</div>
					{/if}
				</div>
			</div>

			<!-- Map Container -->
			<div bind:this={mapContainerDiv} class="map-container relative w-full">
				<div bind:this={mapElement} class="h-full min-h-96 w-full overflow-hidden rounded-lg">
					{#if !isMapLoaded}
						<div class="bg-base-200 flex h-full min-h-96 w-full items-center justify-center">
							<span class="loading loading-spinner loading-lg"></span>
						</div>
					{/if}
				</div>
			</div>

			<!-- Fullscreen Button - using fixed positioning when in fullscreen mode -->
			<button
				onclick={toggleFullscreen}
				class="{isFullscreen
					? 'fixed bottom-4 left-4 z-[1000]'
					: 'absolute bottom-4 left-4 z-20'} btn btn-circle btn-lg bg-base-100/90 shadow-md hover:bg-base-100"
				aria-label={isFullscreen
					? $t('onboarding_auth.form.exit_fullscreen')
					: $t('onboarding_auth.form.enter_fullscreen')}
				title={isFullscreen
					? $t('onboarding_auth.form.exit_fullscreen')
					: $t('onboarding_auth.form.enter_fullscreen')}
			>
				{#if isFullscreen}
					<!-- Exit fullscreen icon - icono claro de salir -->
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5 text-base-content"
						viewBox="0 0 24 24"
						fill="currentColor"
					>
						<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
					</svg>
				{:else}
					<!-- Enter fullscreen icon - icono claro de entrar -->
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5 text-base-content"
						viewBox="0 0 24 24"
						fill="currentColor"
					>
						<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
					</svg>
				{/if}
			</button>

			<!-- Service Radius Panel - mejor posicionado y espaciado -->
			<div
				class={isFullscreen
					? 'fixed top-32 right-6 z-[1000]'
					: 'absolute top-16 right-4 z-20'}
			>
				<div class="bg-base-100/95 rounded-lg p-4 shadow-lg border border-base-300">
					<div class="mb-3 text-sm font-medium text-base-content">Service Radius: {serviceRadius} km</div>
					<input
						type="range"
						min="1"
						max="50"
						bind:value={serviceRadius}
						onchange={updateServiceRadius}
						class="range range-sm range-primary mb-2"
					/>
					<div class="flex justify-between text-xs text-base-content/70">
						<span>1 km</span>
						<span>50 km</span>
					</div>
				</div>
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
			<div class="alert alert-success alert-outline mt-4">
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
