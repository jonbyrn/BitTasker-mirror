<script lang="ts">
	import type { Location } from '$lib/types/task';
	import { onMount } from 'svelte';
	import { Geolocation } from '@capacitor/geolocation';
	import { ScreenOrientation } from '@capacitor/screen-orientation';
	import { t } from 'svelte-i18n';
	import { Capacitor } from '@capacitor/core';
	import { tick } from 'svelte';
	import {
		DEFAULT_EL_SALVADOR_PLACE,
		EL_SALVADOR_PLACES,
		elSalvadorPlaceByKey,
		elSalvadorPlaceKey,
		elSalvadorPlaceLabel,
		placeMatchingText,
		withElSalvador,
		type ElSalvadorPlace
	} from '$lib/utils/maps/el-salvador-places';

	const google = window.google as NonNullable<typeof window.google>;
	const mapsDisabled =
		import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true' ||
		!import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

	function getLocationPickerTranslation(key: string): string {
		const servicesKey = `dashboard.services.create.location.location_picker.${key}`;
		const tasksKey = `task.location_picker.${key}`;
		const servicesTranslation = $t(servicesKey);
		if (servicesTranslation && servicesTranslation !== servicesKey) {
			return servicesTranslation;
		}
		return $t(tasksKey);
	}

	let {
		placeholder = $t('common.components.location_picker.enter_address'),
		location = {
			displayName: '',
			longitude: -88.5311,
			latitude: 13.4971,
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
		showRadiusCircle = true,
		circleCenterLocation = null
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
		circleCenterLocation?: Location | null;
	}>();

	// Map and DOM element references
	let map: google.maps.Map | null = null;
	let mapElement: HTMLElement;
	let searchInput: HTMLInputElement;
	let marker: google.maps.marker.AdvancedMarkerElement | null = null;
	let circle: google.maps.Circle | null = null;
	let markerLibrary: google.maps.MarkerLibrary | null = $state(null);
	let mapContainerDiv: HTMLElement | null = $state(null);

	// Component state
	let currentServiceRadius = $state(1.6);
	let currentLocation = $state<Location>({
		displayName: '',
		longitude: -88.5311,
		latitude: 13.4971,
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
	let initRetryCount = $state(0);
	const maxRetries = 3;
	let departmentKey = $state('');
	let fallbackOffered = false;
	let pendingTyped = '';
	let typedCommitTimer: ReturnType<typeof setTimeout> | undefined;
	const showPlaceFallback = $derived((hasError || mapsDisabled) && !isMapLoaded);

	// Event handler references for cleanup
	let fullscreenResizeHandler: ((this: Window, ev: UIEvent) => void) | null = null;
	let escKeyHandler: ((this: Window, ev: KeyboardEvent) => void) | null = null;

	// Default fallback coordinates (Berlín, El Salvador)
	const DEFAULT_COORDINATES = { lat: 13.4971, lng: -88.5311 };

	// Sync props into local state when they change
	$effect(() => {
		// Explicitly track props to ensure reactivity
		const propLocation = location;
		const propServiceRadius = serviceRadius;
		currentLocation = propLocation;
		currentServiceRadius = propServiceRadius;
	});

	$effect(() => {
		const nextRadius = currentServiceRadius;
		if (!circle || !Number.isFinite(nextRadius)) return;
		circle.setRadius(nextRadius * 1000);
		fitMapToCircle();
	});

	// Update circle center when circleCenterLocation changes (for external center point)
	$effect(() => {
		if (!circle || !circleCenterLocation) return;
		if (isValidCoordinate(circleCenterLocation.latitude, circleCenterLocation.longitude)) {
			circle.setCenter({
				lat: circleCenterLocation.latitude!,
				lng: circleCenterLocation.longitude!
			});
			fitMapToCircle();
		}
	});

	// ─── Coordinate helpers ────────────────────────────────────────────────────
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

	function getSafeCoordinates(): { lat: number; lng: number } {
		if (isValidCoordinate(currentLocation.latitude, currentLocation.longitude)) {
			return { lat: currentLocation.latitude!, lng: currentLocation.longitude! };
		}
		return DEFAULT_COORDINATES;
	}

	function publishLocation(nextLocation: Location) {
		currentLocation = nextLocation;
		onLocationSelect?.(nextLocation);
	}

	function applyElSalvadorPlace(place: ElSalvadorPlace) {
		const label = elSalvadorPlaceLabel(place);
		departmentKey = elSalvadorPlaceKey(place);
		publishLocation({
			...currentLocation,
			displayName: label,
			formattedAddress: label,
			latitude: place.latitude,
			longitude: place.longitude,
			zipCode: '',
			locationLoaded: true,
			placeId: undefined,
			addressComponents: {
				city: place.city,
				state: place.department,
				country: 'El Salvador'
			}
		});
	}

	/** Use San Salvador when the map cannot load and the task has no place yet. */
	function offerPlaceFallback() {
		if (mapsDisabled || fallbackOffered) return;
		const named =
			currentLocation.displayName?.trim() || currentLocation.formattedAddress?.trim() || '';
		if (named || currentLocation.locationLoaded) return;
		fallbackOffered = true;
		applyElSalvadorPlace(DEFAULT_EL_SALVADOR_PLACE);
	}

	function onDepartmentChange(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value;
		departmentKey = value;
		const place = elSalvadorPlaceByKey(value);
		if (place) applyElSalvadorPlace(place);
	}

	/**
	 * Keep typed place text when Google Places does not return coordinates.
	 * A paused field is enough for Next. Blur adds the country for a later geocode.
	 */
	function commitTypedPlace(finalize = false) {
		const typed = (finalize ? (searchInput?.value ?? '') : pendingTyped).trim();
		if (typed.length < 3) return;
		const known = placeMatchingText(typed);
		if (known) {
			applyElSalvadorPlace(known);
			return;
		}
		const displayName = finalize ? withElSalvador(typed) : typed;
		const currentName = currentLocation.displayName?.trim() ?? '';
		const formattedAddress = currentLocation.formattedAddress?.trim() ?? '';
		if (
			currentLocation.locationLoaded &&
			(displayName === currentName || displayName === formattedAddress)
		) {
			return;
		}

		publishLocation({
			...currentLocation,
			displayName,
			latitude: null,
			longitude: null,
			zipCode: '',
			locationLoaded: true,
			formattedAddress: undefined,
			placeId: undefined,
			addressComponents: undefined
		});
	}

	function scheduleTypedCommit() {
		pendingTyped = searchInput?.value.trim() ?? '';
		if (typedCommitTimer) clearTimeout(typedCommitTimer);
		typedCommitTimer = setTimeout(() => commitTypedPlace(false), 300);
	}

	function retryMap() {
		hasError = false;
		error = '';
		initRetryCount = 0;
		loadGoogleMapsScript()
			.then(() => initMapWithRetry())
			.catch((err: unknown) => {
				error =
					err instanceof Error
						? err.message
						: getLocationPickerTranslation('error_loading_google_maps');
				hasError = true;
				offerPlaceFallback();
			});
	}

	// ─── Address component extraction ─────────────────────────────────────────

	/**
	 * Normalised address component that works with both the Geocoder API
	 * (long_name / short_name) and the Places New API (longText / shortText).
	 */
	interface NormalisedAddressComponent {
		types: string[];
		longName: string;
		shortName: string;
	}

	function normaliseGeocoderComponents(
		components: google.maps.GeocoderAddressComponent[]
	): NormalisedAddressComponent[] {
		return components.map((c) => ({
			types: c.types,
			longName: c.long_name,
			shortName: c.short_name
		}));
	}

	function normalisePlacesComponents(
		components: google.maps.places.AddressComponent[]
	): NormalisedAddressComponent[] {
		return components.map((c) => ({
			types: c.types,
			longName: c.longText ?? '',
			shortName: c.shortText ?? ''
		}));
	}

	function extractAddressFields(
		components: NormalisedAddressComponent[]
	): Location['addressComponents'] {
		const result: Location['addressComponents'] = {};

		for (const { types, longName, shortName } of components) {
			if (types.includes('street_number')) result.streetNumber = longName;
			else if (types.includes('route')) result.street = longName;
			else if (types.includes('neighborhood')) result.neighborhood = longName;
			else if (types.includes('sublocality') || types.includes('sublocality_level_1'))
				result.sublocality = longName;
			else if (types.includes('locality')) result.city = longName;
			else if (types.includes('administrative_area_level_1')) result.state = longName;
			else if (types.includes('country')) result.country = longName;
			else if (types.includes('postal_code')) result.postalCode = shortName || longName;
		}

		return result;
	}

	// ─── Google Maps script loading ────────────────────────────────────────────

	async function loadGoogleMapsScript() {
		return new Promise<void>((resolve, reject) => {
			try {
				if (mapsDisabled) {
					resolve();
					return;
				}

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
					// Small delay to ensure the API is fully initialised after the script executes
					setTimeout(() => {
						if (window.google?.maps?.Map) {
							googleMapsReady = true;
							resolve();
						} else {
							reject(new Error(getLocationPickerTranslation('google_maps_api_not_initialized')));
						}
					}, 500);
				};

				script.onerror = () => {
					reject(new Error(getLocationPickerTranslation('google_maps_script_failed_load')));
				};

				document.head.appendChild(script);
			} catch (error) {
				reject(error);
			}
		});
	}

	// ─── Marker library ────────────────────────────────────────────────────────
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

	// ─── Map initialisation ────────────────────────────────────────────────────
	async function initMap() {
		if (!googleMapsReady || !window.google?.maps?.Map) {
			throw new Error(getLocationPickerTranslation('google_maps_not_fully_loaded'));
		}
		if (!mapElement) {
			throw new Error('Map element not available');
		}

		try {
			const safeCoords = getSafeCoordinates();

			map = new google.maps.Map(mapElement, {
				center: safeCoords,
				zoom: currentServiceRadius > 5 ? 10 : 12,
				minZoom: 2, // Allow zooming out more
				maxZoom: 18, // Reduce the maximum zoom level to avoid street view
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
			map.addListener('click', ((event: google.maps.MapMouseEvent) => {
				const clickedLat = event.latLng?.lat();
				const clickedLng = event.latLng?.lng();
				if (clickedLat && clickedLng) {
					reverseGeocodeAndUpdate(clickedLat, clickedLng);
				}
			}) as unknown as (...args: unknown[]) => void);

			// Place initial marker at current (or default) coordinates
			await placeMarker(safeCoords.lat, safeCoords.lng);

			// Restore the address input if we already have a valid location
			if (
				isValidCoordinate(currentLocation.latitude, currentLocation.longitude) &&
				currentLocation.displayName
			) {
				if (searchInput) {
					searchInput.value = currentLocation.formattedAddress || currentLocation.displayName;
				}
			}
		} catch (error) {
			console.error('Error initialising Google Maps:', error);
			throw error;
		}
	}

	async function initMapWithRetry() {
		try {
			if (initRetryCount >= maxRetries) {
				throw new Error(
					getLocationPickerTranslation('failed_initialize_map_after_multiple_attempts')
				);
			}

			if (!googleMapsReady) {
				initRetryCount++;
				setTimeout(initMapWithRetry, 1000);
				return;
			}

			if (!mapElement) {
				initRetryCount++;
				setTimeout(initMapWithRetry, 500);
				return;
			}

			await initMap();
			isMapLoaded = true;

			// If a valid, user-confirmed location was passed in, restore it on the map.
			// Otherwise just show the map at its default coordinates — the user can tap
			// "Use my location" to request GPS access (Google Play policy compliance).
			if (
				isValidCoordinate(currentLocation.latitude, currentLocation.longitude) &&
				currentLocation.locationLoaded
			) {
				reverseGeocodeAndUpdate(currentLocation.latitude!, currentLocation.longitude!);
			} else {
				// Show map at default coordinates without triggering a geocode or GPS request
				const defaultCoords = getSafeCoordinates();
				placeMarker(defaultCoords.lat, defaultCoords.lng);
			}
		} catch (err) {
			console.error('Error initialising map:', err);
			error =
				err instanceof Error ? err.message : getLocationPickerTranslation('error_initializing_map');
			hasError = true;
			offerPlaceFallback();
		}
	}

	onMount(async () => {
		if (mapsDisabled) {
			isLoading = false;
			return;
		}

		try {
			isLoading = true;
			await loadGoogleMapsScript();
			await tick();
			await initMapWithRetry();
		} catch (err) {
			console.error('Error loading Google Maps:', err);
			error =
				err instanceof Error
					? err.message
					: getLocationPickerTranslation('error_loading_google_maps');
			hasError = true;
			offerPlaceFallback();
		} finally {
			isLoading = false;
		}
	});

	// ─── Location update ───────────────────────────────────────────────────────

	/** Reverse-geocodes the given coordinates, updates the marker, and notifies the parent. */
	async function reverseGeocodeAndUpdate(lat: number, lng: number) {
		if (!isValidCoordinate(lat, lng)) {
			console.error('Invalid coordinates provided:', { lat, lng });
			return;
		}

		try {
			placeMarker(lat, lng);

			if (googleMapsReady && window.google?.maps) {
				const { Geocoder } = (await google.maps.importLibrary(
					'geocoding'
				)) as google.maps.GeocodingLibrary;
				const geocoder = new Geocoder();

				const result = await geocoder.geocode({
					location: { lat, lng },
					language: 'es',
					region: 'SV'
				});

				if (result.results[0]) {
					const geocodeResult = result.results[0];
					const rawComponents = geocodeResult.address_components;
					const normalisedComponents = normaliseGeocoderComponents(rawComponents);

					const zipCode =
						normalisedComponents.find((c) => c.types.includes('postal_code'))?.shortName || '';
					const extractedComponents = extractAddressFields(normalisedComponents);

					const displayName = buildDisplayName(
						extractedComponents,
						geocodeResult.formatted_address
					);

					const newLocation: Location = {
						...currentLocation,
						displayName,
						latitude: lat,
						longitude: lng,
						zipCode,
						locationLoaded: true,
						formattedAddress: geocodeResult.formatted_address,
						placeId: geocodeResult.place_id,
						addressComponents: extractedComponents
					};

					currentLocation = newLocation;

					if (searchInput) {
						searchInput.value = newLocation.formattedAddress || newLocation.displayName;
					}

					onLocationSelect?.(newLocation);
				}
			}
		} catch (err: unknown) {
			console.error('Error updating location:', err);
			error =
				err instanceof Error
					? err.message
					: getLocationPickerTranslation('error_updating_location');
		}
	}

	/** Builds a human-readable display name from extracted address fields, falling back to the
	 *  full formatted address when individual parts are unavailable. */
	function buildDisplayName(
		components: Location['addressComponents'],
		formattedAddress: string
	): string {
		const {
			city = '',
			state = '',
			country = '',
			neighborhood = '',
			sublocality = ''
		} = components ?? {};

		if (neighborhood && state) return `${neighborhood}, ${state}`;
		if (sublocality && state) return `${sublocality}, ${state}`;
		if (city && state) return `${city}, ${state}`;
		if (city && country) return `${city}, ${country}`;
		if (state && country) return `${state}, ${country}`;
		if (neighborhood) return neighborhood;
		if (sublocality) return sublocality;
		if (city) return city;
		if (state) return state;
		if (country) return country;
		return formattedAddress;
	}

	// ─── Marker and circle ─────────────────────────────────────────────────────

	/** Places (or replaces) the marker and service-radius circle at the given coordinates. */
	async function placeMarker(lat: number, lng: number) {
		if (!map || !googleMapsReady || !window.google?.maps || !markerLibrary) return;
		if (!isValidCoordinate(lat, lng)) {
			console.error('Cannot place marker at invalid coordinates:', { lat, lng });
			return;
		}

		const position = { lat, lng };

		// Remove existing marker and circle
		if (marker) marker.map = null;
		if (circle) circle.setMap(null);

		try {
			const { AdvancedMarkerElement } = markerLibrary;

			if (useCustomPin) {
				const markerContainer = document.createElement('div');
				markerContainer.style.position = 'relative';
				markerContainer.style.cursor = 'pointer';

				const img = document.createElement('img');
				img.src = '/map-pin.png';
				img.style.width = '3rem';
				img.style.height = '3rem';
				img.style.display = 'block';
				img.style.borderRadius = '50%';

				markerContainer.appendChild(img);

				marker = new AdvancedMarkerElement({
					position,
					map,
					content: markerContainer,
					gmpDraggable: true
				});
			} else {
				marker = new AdvancedMarkerElement({ position, map, gmpDraggable: true });
			}

			if (showServiceRadius || showRadiusCircle) {
				// If circleCenterLocation is provided, use it as the circle center (e.g., Taskee's base location)
				// Otherwise, center the circle on the marker position
				const circleCenter =
					circleCenterLocation &&
					isValidCoordinate(circleCenterLocation.latitude, circleCenterLocation.longitude)
						? { lat: circleCenterLocation.latitude!, lng: circleCenterLocation.longitude! }
						: position;

				circle = new google.maps.Circle({
					strokeColor: '#F59E0B',
					strokeOpacity: 0.8,
					strokeWeight: 2,
					fillColor: '#F59E0B',
					fillOpacity: 0.1,
					map,
					center: circleCenter,
					radius: currentServiceRadius * 1000, // km → metres
					clickable: false // Allow clicks to pass through to the map
				});
			}

			marker.addListener('dragend', () => {
				const pos = marker?.position;
				if (pos) {
					const newLat = typeof pos.lat === 'function' ? pos.lat() : pos.lat;
					const newLng = typeof pos.lng === 'function' ? pos.lng() : pos.lng;
					if (isValidCoordinate(newLat, newLng)) {
						// Only move circle center with marker if no external circleCenterLocation is set
						if (circle && !circleCenterLocation) {
							circle.setCenter({ lat: newLat!, lng: newLng! });
						}
						reverseGeocodeAndUpdate(newLat!, newLng!);
					}
				}
			});

			map.panTo(position);
		} catch (error) {
			console.error('Error creating advanced marker:', error);
		}
	}

	// ─── Service radius ────────────────────────────────────────────────────────

	function fitMapToCircle() {
		if (map && circle && (showServiceRadius || showRadiusCircle)) {
			const bounds = circle.getBounds();
			if (bounds) {
				map.fitBounds(bounds);
			}
		}
	}

	function updateServiceRadius() {
		if (circle) {
			circle.setRadius(currentServiceRadius * 1000); // km → metres
			fitMapToCircle();
		}
	}

	// ─── Zoom controls ────────────────────────────────────────────────────────
	function zoomIn() {
		if (map) {
			const currentZoom = map.getZoom();
			if (typeof currentZoom === 'number') map.setZoom(currentZoom + 1);
		}
	}

	function zoomOut() {
		if (map) {
			const currentZoom = map.getZoom();
			if (typeof currentZoom === 'number') map.setZoom(currentZoom - 1);
		}
	}

	// ─── GPS location (user-initiated only) ───────────────────────────────────
	async function requestUserLocation() {
		try {
			isLoading = true;
			const isNative = Capacitor.isNativePlatform();

			let lat: number | null = null;
			let lng: number | null = null;

			if (isNative) {
				// Native (iOS/Android): check and request permission explicitly
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
				// Web: browser prompts the user implicitly on first call
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

			if (isValidCoordinate(lat, lng)) {
				reverseGeocodeAndUpdate(lat!, lng!);
			} else {
				throw new Error('Invalid geolocation coordinates received');
			}
		} catch (error) {
			console.warn('Geolocation failed, falling back to default coordinates:', error);
			const safeCoords = getSafeCoordinates();
			placeMarker(safeCoords.lat, safeCoords.lng);
		} finally {
			isLoading = false;
		}
	}

	// ─── Place search / autocomplete ───────────────────────────────────────────

	function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number) {
		let timeoutId: ReturnType<typeof setTimeout>;
		return function (...args: Parameters<T>) {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(() => fn.apply(null, args), delay);
		};
	}

	const debouncedFetchPredictions = debounce(() => fetchPlacePredictions(), 300);

	async function fetchPlacePredictions() {
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
				language: 'es',
				sessionToken: token
			};

			const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
			predictions = suggestions.map((suggestion) => suggestion.placePrediction);
			showOptions = true;
		} catch (error) {
			hasError = true;
			console.error('Failed to fetch place predictions:', error);
		} finally {
			isLoading = false;
		}
	}

	async function selectPlacePrediction(prediction: google.maps.places.PlacePrediction) {
		if (!googleMapsReady || !window.google?.maps) return;

		const place = prediction.toPlace();
		await place.fetchFields({
			fields: ['displayName', 'formattedAddress', 'location', 'addressComponents', 'id']
		});

		const lat = place.location?.lat();
		const lng = place.location?.lng();

		if (!isValidCoordinate(lat!, lng!)) return;

		// Use the prediction's text directly as the display name
		const displayName = prediction.text.text.toString();

		const rawComponents = place.addressComponents;
		const normalisedComponents = rawComponents ? normalisePlacesComponents(rawComponents) : [];
		const extractedComponents = rawComponents
			? extractAddressFields(normalisedComponents)
			: undefined;

		const zipCode =
			normalisedComponents.find((c) => c.types.includes('postal_code'))?.shortName || '';

		const newLocation: Location = {
			...currentLocation,
			displayName,
			latitude: lat ?? null,
			longitude: lng ?? null,
			zipCode,
			locationLoaded: true,
			formattedAddress: place.formattedAddress || displayName,
			placeId: place.id || undefined,
			addressComponents: extractedComponents
		};

		currentLocation = newLocation;

		if (searchInput) {
			searchInput.value = newLocation.formattedAddress || newLocation.displayName;
		}

		onLocationSelect?.(newLocation);
		placeMarker(lat!, lng!);
		showOptions = false;
	}

	// ─── Fullscreen ────────────────────────────────────────────────────────────

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
			await ScreenOrientation.lock({ orientation: 'portrait' });
		} catch {
			console.log('Using fallback fullscreen method - Capacitor ScreenOrientation not available');
		}

		const headerEl = document.querySelector('.app-shell__header') as HTMLElement;
		const headerHeight = headerEl ? Math.ceil(headerEl.getBoundingClientRect().height) : 0;

		const footerHeightStr =
			getComputedStyle(document.documentElement).getPropertyValue('--app-footer-height') || '0px';
		const footerHeight = parseFloat(footerHeightStr.replace('px', '')) || 0;

		const viewportHeight = window.innerHeight;
		const availableHeight = viewportHeight - headerHeight - footerHeight;

		if (mapContainerDiv) {
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
			mapContainerDiv.style.zIndex = '500'; // Higher than page but lower than search controls (z-1000)
			mapContainerDiv.style.backgroundColor = 'white';
			mapContainerDiv.style.overflow = 'hidden';
			mapContainerDiv.style.margin = '0';
			mapContainerDiv.style.padding = '0';
		}

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

		await tick();
		if (map) {
			google.maps.event.trigger(map, 'resize');
			if (marker?.position) {
				const pos = marker.position;
				const lat = typeof pos.lat === 'function' ? pos.lat() : pos.lat;
				const lng = typeof pos.lng === 'function' ? pos.lng() : pos.lng;
				if (isValidCoordinate(lat, lng)) {
					map.setCenter({ lat: lat!, lng: lng! });
				}
			}
			const currentZoom = map.getZoom();
			if (typeof currentZoom === 'number') map.setZoom(currentZoom);
		}

		// Keep size in sync when the mobile browser chrome changes or orientation changes
		fullscreenResizeHandler = () => {
			if (!isFullscreen) return;

			const headerEl = document.querySelector('.app-shell__header') as HTMLElement;
			const headerHeight = headerEl ? Math.ceil(headerEl.getBoundingClientRect().height) : 0;
			const footerHeightStr =
				getComputedStyle(document.documentElement).getPropertyValue('--app-footer-height') || '0px';
			const footerHeight = parseFloat(footerHeightStr.replace('px', '')) || 0;
			const availableHeight = window.innerHeight - headerHeight - footerHeight;

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
			if (map) google.maps.event.trigger(map, 'resize');
		};
		window.addEventListener('resize', fullscreenResizeHandler);

		escKeyHandler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') exitFullscreen();
		};
		window.addEventListener('keydown', escKeyHandler);
	}

	async function exitFullscreen() {
		isFullscreen = false;

		try {
			await ScreenOrientation.unlock();
		} catch {
			console.log('Capacitor ScreenOrientation not available');
		}

		if (mapContainerDiv) {
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

		if (mapElement) {
			mapElement.className = 'h-full w-full overflow-hidden rounded-lg';
			mapElement.style.width = '100%';
			mapElement.style.height = '';
			mapElement.style.minHeight = mapHeight;
			mapElement.style.maxHeight = '';
			mapElement.style.borderRadius = '0.5rem';
			mapElement.style.margin = '';
			mapElement.style.padding = '';
		}

		if (fullscreenResizeHandler) {
			window.removeEventListener('resize', fullscreenResizeHandler);
			fullscreenResizeHandler = null;
		}
		if (escKeyHandler) {
			window.removeEventListener('keydown', escKeyHandler);
			escKeyHandler = null;
		}

		await tick();
		if (map) {
			google.maps.event.trigger(map, 'resize');
			if (marker?.position) {
				const pos = marker.position;
				const lat = typeof pos.lat === 'function' ? pos.lat() : pos.lat;
				const lng = typeof pos.lng === 'function' ? pos.lng() : pos.lng;
				if (isValidCoordinate(lat, lng)) {
					map.setCenter({ lat: lat!, lng: lng! });
				}
			}
			const currentZoom = map.getZoom();
			if (typeof currentZoom === 'number') map.setZoom(currentZoom);
		}
	}
</script>

<div class="enhanced-location-picker w-full">
	<!-- Map Container -->
	<div class="map-container relative w-full">
		<!-- Search bar — uses fixed positioning when in fullscreen mode -->
		<div
			class={isFullscreen
				? 'fixed top-6 right-6 left-6 z-1000'
				: 'absolute top-4 right-0 left-0 z-40 px-4'}
		>
			{#if isFullscreen}
				<div class="pointer-events-auto mb-4 flex w-full items-center justify-center">
					<button
						class="btn btn-md bg-base-100/90 text-base-content hover:bg-base-100/90 border-none shadow-md hover:opacity-100"
						onclick={exitFullscreen}
					>
						{getLocationPickerTranslation('exit_fullscreen')}
					</button>
				</div>
			{/if}
			<div class="form-control relative w-full">
				<div class="flex gap-2">
					<input
						bind:this={searchInput}
						type="text"
						{placeholder}
						oninput={() => {
							debouncedFetchPredictions();
							scheduleTypedCommit();
						}}
						onblur={() => commitTypedPlace(true)}
						class="input input-bordered mb-2 flex-1"
						value={currentLocation.displayName}
					/>
					{#if showGeolocation}
						<button
							aria-label={getLocationPickerTranslation('use_my_location')}
							onclick={requestUserLocation}
							class="btn btn-square btn-secondary"
							disabled={isLoading}
							title={getLocationPickerTranslation('use_my_location')}
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

				<!-- Fullscreen toggle — matching style and position -->
				{#if showFullscreen}
					<button
						onclick={toggleFullscreen}
						class="btn btn-square btn-secondary absolute right-0 z-20 shadow-md"
						class:top-14={!isFullscreen}
						class:top-0={isFullscreen}
						class:z-1000={isFullscreen}
						aria-label={isFullscreen
							? getLocationPickerTranslation('exit_fullscreen')
							: getLocationPickerTranslation('enter_fullscreen')}
						title={isFullscreen
							? getLocationPickerTranslation('exit_fullscreen')
							: getLocationPickerTranslation('enter_fullscreen')}
					>
						{#if isFullscreen}
							<!-- Close icon for fullscreen -->
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
							</svg>
						{:else}
							<!-- Enter fullscreen icon -->
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"
								/>
							</svg>
						{/if}
					</button>
				{/if}

				{#if showOptions}
					<div
						class="predictions-dropdown bg-base-100 border-base-300 absolute z-1000 mt-2 max-h-60 w-full overflow-y-auto rounded-lg border shadow-lg"
					>
						{#if predictions.length > 0}
							{#each predictions as prediction (prediction?.placeId ?? prediction?.text?.text)}
								<button
									class="hover:bg-base-200 border-base-200 w-full cursor-pointer border-b px-4 py-3 text-left last:border-b-0"
									onmousedown={(event) => event.preventDefault()}
									onclick={() => selectPlacePrediction(prediction!)}
								>
									{prediction?.text}
								</button>
							{/each}
						{:else}
							<div class="text-error px-4 py-3">
								{getLocationPickerTranslation('no_places_found')}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<!-- Map element -->
		<div bind:this={mapContainerDiv} class="map-container relative w-full">
			<div
				bind:this={mapElement}
				class="h-full w-full overflow-hidden rounded-lg"
				style="height: {mapHeight}; min-height: {mapHeight};"
			>
				{#if mapsDisabled}
					<div
						class="bg-base-200 text-base-content/60 flex h-full w-full items-center justify-center px-4 text-center text-sm"
					>
						{currentLocation.displayName || placeholder}
					</div>
				{:else if !isMapLoaded}
					<div class="bg-base-200 flex h-full w-full items-center justify-center">
						<span class="loading loading-spinner loading-lg"></span>
					</div>
				{/if}
			</div>

			<!-- Custom Zoom Controls in lower left corner -->
			{#if !mapsDisabled}
				<div class="absolute bottom-4 left-4 z-1 flex flex-col gap-2">
					<button
						onclick={zoomIn}
						class="btn btn-square btn-secondary btn-sm shadow-md"
						aria-label="Zoom in"
						title="Zoom in"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
						</svg>
					</button>
					<button
						onclick={zoomOut}
						class="btn btn-square btn-secondary btn-sm shadow-md"
						aria-label="Zoom out"
						title="Zoom out"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M20 12H4" />
						</svg>
					</button>
				</div>
			{/if}
		</div>

		<!-- Service radius panel -->
		{#if showServiceRadius && !mapsDisabled}
			<div class={isFullscreen ? 'fixed top-32 right-6 z-1000' : 'absolute top-16 right-4 z-20'}>
				<div class="bg-base-100/95 border-base-300 rounded-lg border p-4 shadow-lg">
					<div class="text-base-content mb-3 text-sm font-medium">
						{getLocationPickerTranslation('service_radius')}: {currentServiceRadius}
						{getLocationPickerTranslation('miles')}
					</div>
					<input
						type="range"
						min="0.5"
						max="100"
						step="0.5"
						bind:value={currentServiceRadius}
						onchange={updateServiceRadius}
						class="range range-sm range-primary mb-2"
					/>
					<div class="text-base-content/70 flex justify-between text-xs">
						<span>0.5 {getLocationPickerTranslation('miles')}</span>
						<span>100 {getLocationPickerTranslation('miles')}</span>
					</div>
				</div>
			</div>
		{/if}
	</div>

	{#if showPlaceFallback}
		<div class="mx-4 mt-4" data-testid="location-fallback">
			<label class="form-control w-full">
				<span class="label-text mb-1">{getLocationPickerTranslation('department')}</span>
				<select
					class="select select-bordered w-full"
					data-testid="location-department"
					value={departmentKey}
					onchange={onDepartmentChange}
				>
					<option value="">{getLocationPickerTranslation('department')}</option>
					{#each EL_SALVADOR_PLACES as place (elSalvadorPlaceKey(place))}
						<option value={elSalvadorPlaceKey(place)}>{elSalvadorPlaceLabel(place)}</option>
					{/each}
				</select>
			</label>
			<p class="text-base-content/70 mt-2 text-sm">{getLocationPickerTranslation('map_fallback')}</p>
		</div>
	{/if}

	{#if error && !mapsDisabled}
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
		<div class="alert alert-success alert-outline z-30 mt-4">
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
				>{getLocationPickerTranslation('location_set')}: {currentLocation.formattedAddress ||
					currentLocation.displayName}</span
			>
		</div>
	{/if}

	<!-- Retry button shown when map failed to load -->
	{#if hasError && !isMapLoaded && !mapsDisabled}
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
				<h3 class="font-bold">{getLocationPickerTranslation('map_loading_failed')}</h3>
				<div class="text-xs">{getLocationPickerTranslation('try_reloading_the_map')}</div>
			</div>
			<button class="btn btn-sm" onclick={retryMap}>
				{getLocationPickerTranslation('retry')}
			</button>
		</div>
	{/if}
</div>

<style>
	:global(.pac-container) {
		z-index: 9999;
	}
</style>
