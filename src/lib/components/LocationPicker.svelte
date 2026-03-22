<script lang="ts">
	import type { Location } from '$lib/types/task';
	import { onMount } from 'svelte';
	import { Geolocation } from '@capacitor/geolocation';
	import { ScreenOrientation } from '@capacitor/screen-orientation';
	import { t } from 'svelte-i18n';
	import { Capacitor } from '@capacitor/core';
	import { tick } from 'svelte';

	let {
		placeholder = $t('common.components.location_picker.enter_address'),
		location = {
			displayName: '',
			longitude: -122.4194,
			latitude: 37.7749,
			zipCode: '',
			locationLoaded: false
		},
		onLocationSelect,
		mapHeight = '300px',
		showFullscreen = true,
		showGeolocation = true,
		showServiceRadius = false,
		serviceRadius = 1.6, // 1 milla = 1.6 km
		useCustomPin = true,
		showRadiusCircle = true
	} = $props<{
		label?: string;
		placeholder?: string;
		location?: Location;
		onLocationSelect?: (location: Location) => void;
		showMap?: boolean;
		mapHeight?: string;
		showFullscreen?: boolean;
		showGeolocation?: boolean;
		showServiceRadius?: boolean;
		serviceRadius?: number;
		useCustomPin?: boolean;
		showRadiusCircle?: boolean;
	}>();

	// State
	let map: google.maps.Map | null = null;
	let mapElement: HTMLElement;
	let searchInput: HTMLInputElement;
	let marker: google.maps.marker.AdvancedMarkerElement | null = null;
	let circle: google.maps.Circle | null = null;
	// Initialize with default values to avoid capturing initial prop values
	let currentServiceRadius = $state(1.6);
	let currentLocation = $state<Location>({
		displayName: '',
		longitude: -122.4194,
		latitude: 37.7749,
		zipCode: '',
		locationLoaded: false
	});
	let isLoading = $state(false);
	let isMapLoaded = $state(false);
	let hasError = $state(false);
	let error = $state('');
	let predictions = $state<(google.maps.places.PlacePrediction | null)[]>([]);
	let showOptions = $state(false);
	let googleMapsReady = $state(false);
	let isFullscreen = $state(false);
	let mapContainerDiv: HTMLElement | null = $state(null);
	let initRetryCount = $state(0);
	let maxRetries = 3;
	let markerLibrary: google.maps.MarkerLibrary | null = $state(null);

	// Update currentLocation and currentServiceRadius when props change
	$effect(() => {
		// Explicitly track props to ensure reactivity
		const propLocation = location;
		const propServiceRadius = serviceRadius;
		currentLocation = propLocation;
		currentServiceRadius = propServiceRadius;
	});

	// Default fallback coordinates (San Francisco)
	const DEFAULT_COORDINATES = {
		lat: 37.7749,
		lng: -122.4194
	};

	// Function to validate coordinates
	function isValidCoordinate(lat: number | null, lng: number | null): boolean {
		return (
			lat !== null &&
			lng !== null &&
			!isNaN(lat) &&
			!isNaN(lng) &&
			lat >= -90 &&
			lat <= 90 &&
			lng >= -180 &&
			lng <= 180
		);
	}

	// Function to get safe coordinates
	function getSafeCoordinates(): { lat: number; lng: number } {
		if (isValidCoordinate(currentLocation.latitude, currentLocation.longitude)) {
			return {
				lat: currentLocation.latitude!,
				lng: currentLocation.longitude!
			};
		}
		return DEFAULT_COORDINATES;
	}

	// Helper function to extract address components from Google Maps address components
	function extractAddressComponents(
		components: google.maps.GeocoderAddressComponent[]
	): Location['addressComponents'] {
		const addressComponents: Location['addressComponents'] = {};

		components.forEach((component) => {
			const types = component.types;
			const longName = component.long_name;
			const shortName = component.short_name;

			if (types.includes('street_number')) {
				addressComponents.streetNumber = longName;
			} else if (types.includes('route')) {
				addressComponents.street = longName;
			} else if (types.includes('neighborhood')) {
				addressComponents.neighborhood = longName;
			} else if (types.includes('sublocality') || types.includes('sublocality_level_1')) {
				addressComponents.sublocality = longName;
			} else if (types.includes('locality')) {
				addressComponents.city = longName;
			} else if (types.includes('administrative_area_level_1')) {
				addressComponents.state = longName;
			} else if (types.includes('country')) {
				addressComponents.country = longName;
			} else if (types.includes('postal_code')) {
				addressComponents.postalCode = shortName || longName;
			}
		});

		return addressComponents;
	}

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
						// Check if the API is actually available
						if (window.google?.maps?.Map) {
							googleMapsReady = true;
							resolve();
						} else {
							reject(new Error($t('task.location_picker.google_maps_api_not_initialized')));
						}
					}, 500);
				};

				script.onerror = () => {
					reject(new Error($t('task.location_picker.google_maps_script_failed_load')));
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
		if (!googleMapsReady || !window.google?.maps?.Map) {
			throw new Error($t('task.location_picker.google_maps_not_fully_loaded'));
		}

		// Check if mapElement is available
		if (!mapElement) {
			throw new Error('Map element not available');
		}

		try {
			const safeCoords = getSafeCoordinates();

			// Initialize Google Maps with zoom restrictions
			map = new google.maps.Map(mapElement, {
				center: safeCoords,
				zoom: 12,
				minZoom: 8, // City level minimum zoom
				maxZoom: 18, // Reducir el zoom máximo para evitar nivel de calle
				mapTypeId: google.maps.MapTypeId.ROADMAP,
				mapTypeControl: false,
				fullscreenControl: false,
				streetViewControl: false,
				zoomControl: false, // Disable zoom controls completely
				disableDoubleClickZoom: true, // Disable double-click zoom
				mapId: import.meta.env.PROD ? import.meta.env.VITE_GOOGLE_MAPS_ID : 'DEMO_MAP_ID'
			});

			// Load marker library
			await loadMarkerLibrary();

			// Add map click event to place marker
			map.addListener('click', (event: google.maps.MapMouseEvent) => {
				const clickedLat = event.latLng?.lat();
				const clickedLng = event.latLng?.lng();
				if (clickedLat && clickedLng) {
					updateLocationWithCoordinates(clickedLat, clickedLng);
				}
			});

			// Create initial marker with safe coordinates
			await createMarkerAndCircle(safeCoords.lat, safeCoords.lng);

			// If we have a valid existing location, update the search input with complete address
			if (
				isValidCoordinate(currentLocation.latitude, currentLocation.longitude) &&
				currentLocation.displayName
			) {
				if (searchInput) {
					searchInput.value = currentLocation.formattedAddress || currentLocation.displayName;
				}
			}
		} catch (error) {
			console.error('Error initializing Google Maps:', error);
			throw error;
		}
	}

	async function getUserLocation() {
		try {
			isLoading = true;
			const isNative = Capacitor.isNativePlatform();

			let lat: number | null = null;
			let lng: number | null = null;

			if (isNative) {
				// Native (iOS/Android): manage permissions explicitly
				const permissionStatus = await Geolocation.checkPermissions();
				if (permissionStatus.location !== 'granted') {
					await Geolocation.requestPermissions();
				}

				const position = await Geolocation.getCurrentPosition({
					enableHighAccuracy: true,
					timeout: 10000
				});
				lat = position.coords.latitude;
				lng = position.coords.longitude;
			} else if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
				// Web: browsers prompt implicitly on first call
				const position = await new Promise<GeolocationPosition>((resolve, reject) =>
					navigator.geolocation.getCurrentPosition(resolve, reject, {
						enableHighAccuracy: true,
						timeout: 10000
					})
				);
				lat = position.coords.latitude;
				lng = position.coords.longitude;
			} else {
				throw new Error('Geolocation is not supported in this environment');
			}

			// Update map and marker only if we have valid coordinates
			if (isValidCoordinate(lat, lng)) {
				updateLocationWithCoordinates(lat!, lng!);
			} else {
				throw new Error('Invalid geolocation coordinates received');
			}
		} catch (error) {
			console.warn('Geolocation failed, using default location:', error);
			// Use safe default coordinates instead of potentially invalid ones
			const safeCoords = getSafeCoordinates();
			createMarkerAndCircle(safeCoords.lat, safeCoords.lng);
		} finally {
			isLoading = false;
		}
	}

	async function tryInitMap() {
		try {
			if (initRetryCount >= maxRetries) {
				throw new Error($t('task.location_picker.failed_initialize_map_after_multiple_attempts'));
			}

			// Only proceed if Google Maps is ready
			if (!googleMapsReady) {
				initRetryCount++;
				// Wait a bit and try again
				setTimeout(tryInitMap, 1000);
				return;
			}

			// Wait for DOM element to be available
			if (!mapElement) {
				initRetryCount++;
				setTimeout(tryInitMap, 500);
				return;
			}

			await initMap();
			isMapLoaded = true;

			// Only try to get user's geolocation if no valid location is already provided
			if (
				!isValidCoordinate(currentLocation.latitude, currentLocation.longitude) ||
				!currentLocation.locationLoaded
			) {
				getUserLocation();
			} else {
				// If we have a valid existing location, update the marker to that location
				updateLocationWithCoordinates(currentLocation.latitude!, currentLocation.longitude!);
			}
		} catch (err) {
			console.error('Error initializing map:', err);
			error =
				err instanceof Error ? err.message : $t('task.location_picker.error_initializing_map');
			hasError = true;
		}
	}

	onMount(async () => {
		try {
			isLoading = true;

			// Load Google Maps API dynamically if not already loaded
			await loadGoogleMapsScript();

			// Wait for DOM to be ready
			await tick();

			// Try to initialize the map
			await tryInitMap();
		} catch (err) {
			console.error('Error loading Google Maps:', err);
			error =
				err instanceof Error ? err.message : $t('task.location_picker.error_loading_google_maps');
		} finally {
			isLoading = false;
		}
	});

	async function updateLocationWithCoordinates(lat: number, lng: number) {
		// Validate coordinates before proceeding
		if (!isValidCoordinate(lat, lng)) {
			console.error('Invalid coordinates provided:', { lat, lng });
			return;
		}

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
					location: { lat, lng },
					// Agregar opciones para mejorar la precisión
					language: 'es', // Usar español para mejor resultados en El Salvador
					region: 'SV' // Especificar El Salvador como región
				});

				if (result.results[0]) {
					const geocodeResult = result.results[0];
					const addressComponents = geocodeResult.address_components;
					const zipCode =
						addressComponents.find((component) => component.types.includes('postal_code'))
							?.short_name || '';

					// Extract all address components
					const extractedComponents = extractAddressComponents(addressComponents);

					// Extraer ciudad y estado para displayName
					const city = extractedComponents?.city || '';
					const stateRegion = extractedComponents?.state || '';
					const country = extractedComponents?.country || '';
					const neighborhood = extractedComponents?.neighborhood || '';
					const sublocality = extractedComponents?.sublocality || '';

					let displayName = '';

					// Construir displayName de manera más robusta con más opciones
					if (neighborhood && stateRegion) {
						displayName = `${neighborhood}, ${stateRegion}`;
					} else if (sublocality && stateRegion) {
						displayName = `${sublocality}, ${stateRegion}`;
					} else if (city && stateRegion) {
						displayName = `${city}, ${stateRegion}`;
					} else if (city && country) {
						displayName = `${city}, ${country}`;
					} else if (stateRegion && country) {
						displayName = `${stateRegion}, ${country}`;
					} else if (neighborhood) {
						displayName = neighborhood;
					} else if (sublocality) {
						displayName = sublocality;
					} else if (city) {
						displayName = city;
					} else if (stateRegion) {
						displayName = stateRegion;
					} else if (country) {
						displayName = country;
					} else {
						// Fallback: usar la dirección formateada completa
						displayName = geocodeResult.formatted_address;
					}

					// Update location state with full address details
					const newLocation: Location = {
						...currentLocation,
						displayName: displayName,
						latitude: lat,
						longitude: lng,
						zipCode,
						locationLoaded: true,
						formattedAddress: geocodeResult.formatted_address,
						placeId: geocodeResult.place_id,
						addressComponents: extractedComponents
					};

					currentLocation = newLocation;

					// Update input value with complete address (formattedAddress from Google Maps)
					if (searchInput) {
						searchInput.value = newLocation.formattedAddress || newLocation.displayName;
					}

					// Call callback
					if (onLocationSelect) {
						onLocationSelect(newLocation);
					}
				}
			}
		} catch (err: unknown) {
			console.error('Error updating location:', err);
			error =
				err instanceof Error ? err.message : $t('task.location_picker.error_updating_location');
		}
	}

	async function createMarkerAndCircle(lat: number, lng: number) {
		if (!map || !googleMapsReady || !window.google?.maps || !markerLibrary) return;

		// Validate coordinates before creating marker
		if (!isValidCoordinate(lat, lng)) {
			console.error('Cannot create marker with invalid coordinates:', { lat, lng });
			return;
		}

		const position = { lat, lng };

		// Remove existing marker and circle
		if (marker) marker.map = null;
		if (circle) circle.setMap(null);

		try {
			const { AdvancedMarkerElement } = markerLibrary;

			// Create custom marker if enabled
			if (useCustomPin) {
				// Crear un contenedor personalizado para el marcador
				const markerContainer = document.createElement('div');
				markerContainer.style.position = 'relative';
				markerContainer.style.cursor = 'pointer';

				// Usar imagen personalizada
				const img = document.createElement('img');
				img.src = '/map-pin.png';
				img.style.width = '3rem'; // Tamaño optimizado para el picker
				img.style.height = '3rem';
				img.style.display = 'block';
				img.style.borderRadius = '50%'; // Hacer la imagen redonda

				markerContainer.appendChild(img);

				// Create new advanced marker with custom content
				marker = new AdvancedMarkerElement({
					position,
					map,
					content: markerContainer,
					gmpDraggable: true
				});
			} else {
				// Create standard marker
				marker = new AdvancedMarkerElement({
					position,
					map,
					gmpDraggable: true
				});
			}

			// Create circle for service radius if enabled
			if (showServiceRadius || showRadiusCircle) {
				circle = new google.maps.Circle({
					strokeColor: '#F59E0B', // Color anaranjado como en TaskLocationMap
					strokeOpacity: 0.8,
					strokeWeight: 2,
					fillColor: '#F59E0B',
					fillOpacity: 0.1,
					map,
					center: position,
					radius: currentServiceRadius * 1000 // Convert km to meters
				});
			}

			// Add drag event to marker
			marker.addListener('dragend', () => {
				const position = marker?.position;
				if (position) {
					const newLat = typeof position.lat === 'function' ? position.lat() : position.lat;
					const newLng = typeof position.lng === 'function' ? position.lng() : position.lng;
					if (isValidCoordinate(newLat, newLng)) {
						// Update circle position
						if (circle) circle.setCenter({ lat: newLat!, lng: newLng! });
						// Update location data
						updateLocationWithCoordinates(newLat!, newLng!);
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
			circle.setRadius(currentServiceRadius * 1000); // Convert km to meters
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
				language: 'es', // Usar español para mejor resultados en El Salvador
				sessionToken: token
				// Removemos la restricción de país que estaba causando problemas
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
	function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number) {
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
			fields: ['displayName', 'formattedAddress', 'location', 'addressComponents', 'id']
		});

		const lat = place.location?.lat();
		const lng = place.location?.lng();

		if (!isValidCoordinate(lat!, lng!)) return;

		// Usar directamente el texto de la predicción seleccionada
		const displayName = prediction.text.text.toString();

		// Extract address components
		const addressComponents = place.addressComponents;
		const extractedComponents = addressComponents
			? extractAddressComponents(addressComponents as google.maps.GeocoderAddressComponent[])
			: undefined;

		// Extract postal code
		const zipCode =
			addressComponents?.find((component) => component.types.includes('postal_code'))?.longText ||
			'';

		// Update location state with full address details
		const newLocation: Location = {
			...currentLocation,
			displayName: displayName,
			latitude: lat || null,
			longitude: lng || null,
			zipCode,
			locationLoaded: true,
			formattedAddress: place.formattedAddress || displayName,
			placeId: place.id || undefined,
			addressComponents: extractedComponents
		};

		currentLocation = newLocation;

		// Update input value with complete address (formattedAddress from Google Maps)
		if (searchInput) {
			searchInput.value = newLocation.formattedAddress || newLocation.displayName;
		}

		// Call callback
		if (onLocationSelect) {
			onLocationSelect(newLocation);
		}

		// Update marker and circle
		createMarkerAndCircle(lat!, lng!);

		// Clear predictions
		showOptions = false;
	}

	// Fullscreen functionality
	async function toggleFullscreen() {
		if (isFullscreen) {
			await exitFullscreen();
		} else {
			await enterFullscreen();
		}
	}

	let fullscreenResizeHandler: ((this: Window, ev: UIEvent) => void) | null = null;
	let escKeyHandler: ((this: Window, ev: KeyboardEvent) => void) | null = null;

	async function enterFullscreen() {
		isFullscreen = true;

		try {
			// Try to use Capacitor's native fullscreen if available
			await ScreenOrientation.lock({ orientation: 'portrait' });
		} catch {
			console.log('Using fallback fullscreen method - Capacitor ScreenOrientation not available');
		}

		// Calculate navigation bar heights
		const headerEl = document.querySelector('.app-shell__header') as HTMLElement;
		const headerHeight = headerEl ? Math.ceil(headerEl.getBoundingClientRect().height) : 0;

		// Get footer height from CSS variable (set dynamically by layout)
		const footerHeightStr =
			getComputedStyle(document.documentElement).getPropertyValue('--app-footer-height') || '0px';
		const footerHeight = parseFloat(footerHeightStr.replace('px', '')) || 0;

		// Calculate available height (viewport minus navigation bars)
		const viewportHeight = window.innerHeight;
		const availableHeight = viewportHeight - headerHeight - footerHeight;

		// Store original dimensions for restoring later
		if (mapContainerDiv) {
			// Apply fullscreen styles - position below header, above footer
			// Remove all height-related classes that might interfere
			mapContainerDiv.className = 'map-container';
			mapContainerDiv.style.position = 'fixed';
			mapContainerDiv.style.top = `${headerHeight}px`;
			mapContainerDiv.style.bottom = `${footerHeight}px`;
			mapContainerDiv.style.left = '0';
			mapContainerDiv.style.right = '0';
			mapContainerDiv.style.width = '100vw';
			mapContainerDiv.style.height = `${availableHeight}px`;
			mapContainerDiv.style.maxHeight = `${availableHeight}px`;
			mapContainerDiv.style.minHeight = `${availableHeight}px`;
			mapContainerDiv.style.zIndex = '1000'; // High z-index to be above content but below modals
			mapContainerDiv.style.backgroundColor = 'white';
			mapContainerDiv.style.overflow = 'hidden';
			mapContainerDiv.style.margin = '0';
			mapContainerDiv.style.padding = '0';
		}

		// Ensure inner map element fills the fullscreen container
		// Remove height-related classes
		if (mapElement) {
			mapElement.className = 'w-full overflow-hidden';
			mapElement.style.width = '100%';
			mapElement.style.height = '100%';
			mapElement.style.minHeight = '100%';
			mapElement.style.maxHeight = '100%';
			mapElement.style.borderRadius = '0';
			mapElement.style.margin = '0';
			mapElement.style.padding = '0';
		}

		// Await DOM flush, then trigger Google Maps resize and re-center
		await tick();
		if (map) {
			google.maps.event.trigger(map, 'resize');
			if (marker && marker.position) {
				const position = marker.position;
				const lat = typeof position.lat === 'function' ? position.lat() : position.lat;
				const lng = typeof position.lng === 'function' ? position.lng() : position.lng;
				if (isValidCoordinate(lat, lng)) {
					map.setCenter({ lat: lat!, lng: lng! });
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
			// Only handle resize if still in fullscreen
			if (!isFullscreen) return;

			// Recalculate navigation bar heights on resize
			const headerEl = document.querySelector('.app-shell__header') as HTMLElement;
			const headerHeight = headerEl ? Math.ceil(headerEl.getBoundingClientRect().height) : 0;

			const footerHeightStr =
				getComputedStyle(document.documentElement).getPropertyValue('--app-footer-height') || '0px';
			const footerHeight = parseFloat(footerHeightStr.replace('px', '')) || 0;

			const viewportHeight = window.innerHeight;
			const availableHeight = viewportHeight - headerHeight - footerHeight;

			if (mapContainerDiv) {
				mapContainerDiv.style.top = `${headerHeight}px`;
				mapContainerDiv.style.bottom = `${footerHeight}px`;
				mapContainerDiv.style.height = `${availableHeight}px`;
				mapContainerDiv.style.maxHeight = `${availableHeight}px`;
				mapContainerDiv.style.minHeight = `${availableHeight}px`;
			}

			if (mapElement) {
				mapElement.style.height = '100%';
				mapElement.style.minHeight = '100%';
				mapElement.style.maxHeight = '100%';
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
		} catch {
			console.log('Capacitor ScreenOrientation not available');
		}

		// Restore original CSS styles
		if (mapContainerDiv) {
			// Restore original classes
			mapContainerDiv.className = 'map-container relative w-full';
			mapContainerDiv.style.position = 'relative';
			mapContainerDiv.style.top = 'auto';
			mapContainerDiv.style.bottom = 'auto';
			mapContainerDiv.style.left = 'auto';
			mapContainerDiv.style.right = 'auto';
			mapContainerDiv.style.width = '100%';
			mapContainerDiv.style.maxHeight = '';
			mapContainerDiv.style.minHeight = '';
			mapContainerDiv.style.height = 'auto';
			mapContainerDiv.style.zIndex = 'auto';
			mapContainerDiv.style.backgroundColor = 'transparent';
			mapContainerDiv.style.overflow = 'visible';
			mapContainerDiv.style.margin = '';
			mapContainerDiv.style.padding = '';
		}

		// Restore map element size
		if (mapElement) {
			// Restore original classes
			mapElement.className = 'h-full w-full overflow-hidden rounded-lg';
			mapElement.style.width = '100%';
			mapElement.style.height = '';
			mapElement.style.minHeight = mapHeight;
			mapElement.style.maxHeight = '';
			mapElement.style.borderRadius = '0.5rem'; // rounded-lg
			mapElement.style.margin = '';
			mapElement.style.padding = '';
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
				if (isValidCoordinate(lat, lng)) {
					map.setCenter({ lat: lat!, lng: lng! });
				}
			}
			const currentZoom = map.getZoom();
			if (typeof currentZoom === 'number') {
				map.setZoom(currentZoom);
			}
		}
	}
</script>

<div class="enhanced-location-picker w-full">
	<!-- Map Container -->
	<div class="map-container relative w-full">
		<!-- Search bar - using fixed positioning when in fullscreen mode -->
		<div
			class={isFullscreen
				? 'fixed top-6 right-6 left-6 z-1000'
				: 'absolute top-4 right-0 left-0 z-10 px-4'}
		>
			{#if isFullscreen}
				<div class="pointer-events-auto mb-4 flex w-full items-center justify-center">
					<button
						class="btn btn-md bg-base-100/90 text-base-content hover:bg-base-100/90 border-none shadow-md hover:opacity-100"
						onclick={exitFullscreen}
					>
						{$t('task.location_picker.exit_fullscreen')}
					</button>
				</div>
			{/if}
			<div class="form-control relative w-full">
				<div class="flex gap-2">
					<input
						bind:this={searchInput}
						type="text"
						{placeholder}
						oninput={debounce(() => getPredictions(), 300)}
						onfocus={() => (showOptions = true)}
						class="input input-bordered mb-2 flex-1"
						value={currentLocation.displayName}
					/>
					{#if showGeolocation}
						<button
							aria-label={$t('task.location_picker.use_my_location')}
							onclick={getUserLocation}
							class="btn btn-square btn-secondary"
							disabled={isLoading}
							title={$t('task.location_picker.use_my_location')}
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
					{/if}
				</div>

				{#if isLoading}
					<div class="absolute top-1/2 right-20 -translate-y-1/2">
						<span class="loading loading-spinner loading-sm"></span>
					</div>
				{/if}

				{#if showOptions}
					<div
						class="predictions-dropdown bg-base-100 border-base-300 absolute z-1000 mt-2 max-h-60 w-full overflow-y-auto rounded-lg border shadow-lg"
					>
						{#if predictions.length > 0}
							{#each predictions as prediction (prediction?.placeId ?? prediction?.text?.text)}
								<button
									class="hover:bg-base-200 border-base-200 w-full cursor-pointer border-b px-4 py-3 text-left last:border-b-0"
									onclick={() => selectPrediction(prediction!)}
								>
									{prediction?.text}
								</button>
							{/each}
						{:else}
							<div class="text-error px-4 py-3">{$t('task.location_picker.no_places_found')}</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<!-- Map Container -->
		<div bind:this={mapContainerDiv} class="map-container relative w-full">
			<div
				bind:this={mapElement}
				class="h-full w-full overflow-hidden rounded-lg"
				style="height: {mapHeight}; min-height: {mapHeight};"
			>
				{#if !isMapLoaded}
					<div class="bg-base-200 flex h-full w-full items-center justify-center">
						<span class="loading loading-spinner loading-lg"></span>
					</div>
				{/if}
			</div>
		</div>

		<!-- Fullscreen Button - positioned relative to map container -->
		{#if showFullscreen}
			<button
				onclick={toggleFullscreen}
				class="btn btn-circle btn-lg bg-base-100/90 hover:bg-base-100 absolute top-4 right-4 z-20 shadow-md"
				class:z-1000={isFullscreen}
				aria-label={isFullscreen
					? $t('task.location_picker.exit_fullscreen')
					: $t('task.location_picker.enter_fullscreen')}
				title={isFullscreen
					? $t('task.location_picker.exit_fullscreen')
					: $t('task.location_picker.enter_fullscreen')}
			>
				{#if isFullscreen}
					<!-- Exit fullscreen icon -->
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-base-content h-5 w-5"
						viewBox="0 0 24 24"
						fill="currentColor"
					>
						<path
							d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
						/>
					</svg>
				{:else}
					<!-- Enter fullscreen icon -->
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-base-content h-5 w-5"
						viewBox="0 0 24 24"
						fill="currentColor"
					>
						<path
							d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
						/>
					</svg>
				{/if}
			</button>
		{/if}

		<!-- Service Radius Panel - mejor posicionado y espaciado -->
		{#if showServiceRadius}
			<div class={isFullscreen ? 'fixed top-32 right-6 z-1000' : 'absolute top-16 right-4 z-20'}>
				<div class="bg-base-100/95 border-base-300 rounded-lg border p-4 shadow-lg">
					<div class="text-base-content mb-3 text-sm font-medium">
						{$t('task.location_picker.service_radius')}: {currentServiceRadius}
						{$t('task.location_picker.miles')}
					</div>
					<input
						type="range"
						min="0.5"
						max="10"
						step="0.1"
						bind:value={currentServiceRadius}
						onchange={updateServiceRadius}
						class="range range-sm range-primary mb-2"
					/>
					<div class="text-base-content/70 flex justify-between text-xs">
						<span>0.5 {$t('task.location_picker.miles')}</span>
						<span>10 {$t('task.location_picker.miles')}</span>
					</div>
				</div>
			</div>
		{/if}
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

	{#if currentLocation.locationLoaded}
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
			<span
				>{$t('task.location_picker.location_set')}: {currentLocation.formattedAddress ||
					currentLocation.displayName}</span
			>
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
				<h3 class="font-bold">{$t('task.location_picker.map_loading_failed')}</h3>
				<div class="text-xs">{$t('task.location_picker.try_reloading_the_map')}</div>
			</div>
			<button
				class="btn btn-sm"
				onclick={() => {
					hasError = false;
					loadGoogleMapsScript().then(() => tryInitMap());
				}}
			>
				{$t('task.location_picker.retry')}
			</button>
		</div>
	{/if}
</div>

<style>
	:global(.pac-container) {
		z-index: 9999;
	}
</style>
