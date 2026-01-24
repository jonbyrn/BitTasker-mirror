<script lang="ts">
	import type { Task, Location } from '$lib/types/task';
	import { smallCountries, mediumCountries, largeCountries } from '$lib/utils/constants/countries';
	import { onMount, onDestroy, tick } from 'svelte';
	import { ScreenOrientation } from '@capacitor/screen-orientation';
	import { t } from 'svelte-i18n';

	let {
		tasks = [],
		height = '60vh',
		selectedTask = null,
		onTaskSelected,
		showFullscreen = true
	} = $props<{
		tasks: Task[];
		height?: string;
		selectedTask?: Task | null;
		onTaskSelected?: (event: { task: Task; locationType: 'pickup' | 'dropoff' }) => void;
		showFullscreen?: boolean;
	}>();

	// State
	let map: google.maps.Map | null = null;
	let mapElement: HTMLElement | null = null;
	let markers: google.maps.marker.AdvancedMarkerElement[] = $state([]);
	let circles: google.maps.Circle[] = $state([]);
	let isMapLoaded = $state(false);
	let hasError = $state(false);
	let error = $state('');
	let scriptLoaded = $state(false);
	let googleMapsReady = $state(false);
	let lastTaskIds = $state('');
	let lastSelectedTaskId = $state<string | null>(null);
	let serviceRadius = $state(5); // Default to 5 km
	let isComponentMounted = $state(false);
	let isLoading = $state(true);
	let userLocation: Location | null = $state(null);
	let markerLibrary: google.maps.MarkerLibrary | null = $state(null);
	let userCountry: string | null = $state(null);
	let mapHeight = $derived(height); // Add mapHeight variable - use $derived to react to prop changes

	// Fullscreen state
	let isFullscreen = $state(false);
	let mapContainerDiv: HTMLElement | null = $state(null);
	let fullscreenResizeHandler: ((this: Window, ev: UIEvent) => any) | null = null;
	let escKeyHandler: ((this: Window, ev: KeyboardEvent) => any) | null = null;
	let containerResizeObserver: ResizeObserver | null = null;
	
	// Location button state
	let isLocating = $state(false);
	
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
				(error) => {
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

	// Function to get country from coordinates using reverse geocoding
	async function getCountryFromCoordinates(lat: number, lng: number): Promise<string | null> {
		if (!window.google?.maps) return null;

		try {
			const geocoder = new google.maps.Geocoder();
			const latlng = { lat, lng };

			return new Promise((resolve) => {
				geocoder.geocode({ location: latlng }, (results, status) => {
					if (status === 'OK' && results && results.length > 0) {
						// Look for country in the address components
						for (const result of results) {
							for (const component of result.address_components) {
								if (component.types.includes('country')) {
									resolve(component.long_name);
									return;
								}
							}
						}
					}
					resolve(null);
				});
			});
		} catch (error) {
			console.error('Error getting country:', error);
			return null;
		}
	}

	// Function to determine appropriate zoom level based on country
	function getZoomLevelForCountry(
		country: string | null,
		latitude: number,
		longitude: number
	): number {
		// If we have country info, use specific zoom levels
		if (country) {
			if (smallCountries.includes(country)) {
				return 8;
			}

			if (mediumCountries.includes(country)) {
				return 6;
			}

			if (largeCountries.includes(country)) {
				return 4;
			}
		}

		// Fallback: determine zoom based on latitude/longitude ranges
		// North America
		if (latitude >= 15 && latitude <= 72 && longitude >= -180 && longitude <= -50) {
			return 4;
		}

		// South America
		if (latitude >= -60 && latitude <= 15 && longitude >= -90 && longitude <= -30) {
			return 4;
		}

		// Europe
		if (latitude >= 35 && latitude <= 72 && longitude >= -25 && longitude <= 45) {
			return 5;
		}

		// Africa
		if (latitude >= -35 && latitude <= 38 && longitude >= -20 && longitude <= 55) {
			return 4;
		}

		// Asia
		if (latitude >= -10 && latitude <= 55 && longitude >= 45 && longitude <= 180) {
			return 4;
		}

		// Australia/Oceania
		if (latitude >= -50 && latitude <= -10 && longitude >= 110 && longitude <= 180) {
			return 4;
		}

		// Default zoom for unknown locations
		return 3;
	}

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
				script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&loading=async&libraries=marker,geometry`;
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
			// Center on the current map center instead of a specific marker
			const center = map.getCenter();
			if (center) {
				map.setCenter(center);
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
			// Restore height based on prop - use '100%' if that's what was passed, otherwise use the prop value
			if (height === '100%') {
				mapContainerDiv.style.height = '';
			} else {
				mapContainerDiv.style.height = height;
			}
			mapContainerDiv.style.zIndex = 'auto';
			mapContainerDiv.style.backgroundColor = 'transparent';
			mapContainerDiv.style.overflow = 'visible';
		}

		// Restore map element size
		if (mapElement) {
			mapElement.style.width = '100%';
			mapElement.style.height = '';
			mapElement.style.minHeight = '';
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
			// Center on the current map center instead of a specific marker
			const center = map.getCenter();
			if (center) {
				map.setCenter(center);
			}
			const currentZoom = map.getZoom();
			if (typeof currentZoom === 'number') {
				map.setZoom(currentZoom);
			}
		}
	}

	// Function to center map on user's current location
	async function centerOnUserLocation() {
		if (!map || !isMapLoaded) return;

		isLocating = true;
		try {
			const location = await getUserLocation();
			
			if (location && location.latitude && location.longitude) {
				const position = {
					lat: location.latitude,
					lng: location.longitude
				};

				// Center map on user location
				map.setCenter(position);
				
				// Set appropriate zoom level (city level for privacy)
				map.setZoom(14);
				
				// Pan smoothly to location
				map.panTo(position);
			} else {
				// Show error if location couldn't be obtained
				console.warn('Unable to get user location');
			}
		} catch (error) {
			console.error('Error centering on user location:', error);
		} finally {
			isLocating = false;
		}
	}

	async function initMap() {
		try {
			// Check if mapElement exists before proceeding
			if (!mapElement) {
				throw new Error('Map element not found');
			}

		// Determine map center: first task pickup location > user location > default
		let centerLocation: Location;
		
		if (tasks.length > 0) {
			// Use first task's pickup location if available
			const firstTask = tasks[0];
			if (firstTask.pickupLocation?.latitude && firstTask.pickupLocation.longitude) {
				centerLocation = {
					displayName: firstTask.pickupLocation.displayName || 'Task Location',
					latitude: firstTask.pickupLocation.latitude,
					longitude: firstTask.pickupLocation.longitude,
					zipCode: firstTask.pickupLocation.zipCode || '',
					locationLoaded: true
				};
			} else {
				// Fallback to user location or default
				centerLocation = userLocation || {
					displayName: 'Centroamérica',
					latitude: 13.6929,
					longitude: -89.2182,
					zipCode: '',
					locationLoaded: false
				};
			}
		} else {
			// Fallback to user location or default
			centerLocation = userLocation || {
				displayName: 'Centroamérica',
				latitude: 13.6929,
				longitude: -89.2182,
				zipCode: '',
				locationLoaded: false
			};
		}

			// Get country and determine zoom level
			const country = await getCountryFromCoordinates(
				centerLocation.latitude!,
				centerLocation.longitude!
			);
			userCountry = country;
			const zoomLevel = getZoomLevelForCountry(
				country,
				centerLocation.latitude!,
				centerLocation.longitude!
			);

			// Initialize Google Maps with zoom restrictions for privacy
			map = new google.maps.Map(mapElement, {
				center: { lat: centerLocation.latitude!, lng: centerLocation.longitude! },
				zoom: zoomLevel,
				maxZoom: 14, // Máximo zoom de ciudad - no mostrar direcciones exactas
				minZoom: 2, // Permitir zoom out para ver áreas más amplias
				mapTypeId: google.maps.MapTypeId.ROADMAP,
				mapTypeControl: true,
				streetViewControl: false, // Deshabilitar Street View para privacidad
				fullscreenControl: false,
				mapTypeControlOptions: {
					style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
					position: google.maps.ControlPosition.TOP_LEFT
				},
				zoomControlOptions: {
					position: google.maps.ControlPosition.RIGHT_CENTER
				},
				mapId: import.meta.env.PROD ? import.meta.env.VITE_GOOGLE_MAPS_ID : 'DEMO_MAP_ID'
			});

			// Load marker library
			await loadMarkerLibrary();

			// Create markers after map is initialized
			setTimeout(() => {
				createTaskMarkers();
			}, 1000);
		} catch (error) {
			console.error('Error initializing Google Maps:', error);
			throw error;
		}
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

			// Ensure map element has explicit height before initialization
			if (mapElement) {
				// Force height calculation from parent
				const parentHeight = mapElement.parentElement?.offsetHeight;
				if (parentHeight && parentHeight > 0) {
					mapElement.style.height = `${parentHeight}px`;
				} else {
					// Fallback: use computed height or set minimum
					const computedHeight = window.getComputedStyle(mapElement).height;
					if (!computedHeight || computedHeight === '0px' || computedHeight === 'auto') {
						mapElement.style.height = height === '100%' ? '100%' : height;
					}
				}
			}

			await initMap();
			isMapLoaded = true;

			// Ensure map element has explicit height after initialization
			await tick();
			if (mapElement) {
				const parentHeight = mapElement.parentElement?.offsetHeight;
				if (parentHeight && parentHeight > 0) {
					mapElement.style.height = `${parentHeight}px`;
					mapElement.style.minHeight = `${parentHeight}px`;
				} else {
					// Fallback: ensure minimum height
					const computedHeight = window.getComputedStyle(mapElement.parentElement || mapElement).height;
					if (computedHeight && computedHeight !== '0px' && computedHeight !== 'auto') {
						mapElement.style.height = computedHeight;
						mapElement.style.minHeight = computedHeight;
					} else {
						// Last resort: set a minimum height
						mapElement.style.minHeight = '400px';
					}
				}
			}

			// Trigger resize after map is initialized to ensure proper rendering
			if (map) {
				google.maps.event.trigger(map, 'resize');
			}

			// Hide loading after everything is ready
			setTimeout(() => {
				isLoading = false;
				// Ensure height is maintained after loading completes
				if (mapElement && map) {
					// Re-check and set height after loading state changes
					const parentHeight = mapElement.parentElement?.offsetHeight;
					if (parentHeight && parentHeight > 0) {
						mapElement.style.height = `${parentHeight}px`;
						mapElement.style.minHeight = `${parentHeight}px`;
					}
					google.maps.event.trigger(map, 'resize');
				}
			}, 1500);
		} catch (err) {
			console.error('Error initializing map:', err);
			error = err instanceof Error ? err.message : 'Error initializing map';
			hasError = true;
			isLoading = false;
		}
	}

	// Función para agrupar tareas por ubicación de recogida cercana
	function groupTasksByLocation(tasks: Task[]) {
		const groups: Array<{
			latitude: number;
			longitude: number;
			tasks: Task[];
			locationType: 'pickup';
		}> = [];

		const processedLocations = new Set<string>();

		for (const task of tasks) {
			// Solo procesar pickup location
			if (task.pickupLocation?.latitude && task.pickupLocation.longitude) {
				const locationKey = `${task.pickupLocation.latitude.toFixed(4)},${task.pickupLocation.longitude.toFixed(4)}`;

				if (!processedLocations.has(locationKey)) {
					processedLocations.add(locationKey);

					// Buscar tareas cercanas en la misma ubicación de recogida
					const nearbyTasks = tasks.filter(
						(t) =>
							t.pickupLocation?.latitude &&
							t.pickupLocation.longitude &&
							Math.abs(t.pickupLocation.latitude - task?.pickupLocation?.latitude!) < 0.001 &&
							Math.abs(t.pickupLocation.longitude - task?.pickupLocation?.longitude!) < 0.001
					);

					groups.push({
						latitude: task.pickupLocation.latitude,
						longitude: task.pickupLocation.longitude,
						tasks: nearbyTasks,
						locationType: 'pickup'
					});
				}
			}
		}

		return groups;
	}

	async function createTaskMarkers() {
		if (!map || !googleMapsReady || !window.google?.maps || !markerLibrary) return;

		try {
			// Agrupar tareas por ubicación para evitar superposiciones
			const groupedTasks = groupTasksByLocation(tasks);

			// Create markers for grouped tasks
			for (const group of groupedTasks) {
				const marker = await createTaskMarker(
					group.latitude,
					group.longitude,
					group.tasks,
					group.locationType
				);
				if (marker) markers.push(marker);
			}
		} catch (error) {
			console.error('Error creating task markers:', error);
		}
	}

	async function createTaskMarker(
		lat: number,
		lng: number,
		tasks: Task[],
		locationType: 'pickup'
	): Promise<google.maps.marker.AdvancedMarkerElement | null> {
		if (!map || !googleMapsReady || !window.google?.maps || !markerLibrary) return null;

		try {
			const { AdvancedMarkerElement } = markerLibrary;

			// Crear un contenedor personalizado para el marcador
			const markerContainer = document.createElement('div');
			markerContainer.style.position = 'relative';
			markerContainer.style.cursor = 'pointer';

			// Usamos tu imagen personalizada original
			const img = document.createElement('img');
			img.src = '/map-pin.png';
			img.style.width = '3.5rem'; // Tamaño optimizado
			img.style.height = '3.5rem';
			img.style.display = 'block';
			img.style.borderRadius = '50%'; // Hacer la imagen redonda

			// Agregar indicador de cantidad de tareas si hay más de una
			if (tasks.length > 1) {
				const taskCount = document.createElement('div');
				taskCount.style.cssText = `
					position: absolute;
					top: -8px;
					right: -8px;
					background: linear-gradient(135deg, #EF4444, #DC2626);
					color: white;
					border-radius: 50%;
					width: 20px;
					height: 20px;
					display: flex;
					align-items: center;
					justify-content: center;
					font-size: 11px;
					font-weight: bold;
					border: 2px solid white;
				`;
				taskCount.textContent = tasks.length.toString();
				markerContainer.appendChild(taskCount);
			}

			markerContainer.appendChild(img);

			const marker = new AdvancedMarkerElement({
				position: { lat, lng },
				map,
				content: markerContainer,
				gmpDraggable: false
			});

			// 🖱️ Evento click en el marcador → ajusta zoom al círculo con restricciones
			marker.addListener('click', () => {
				// Ocultar todos los círculos primero
				hideAllCircles();

				// Crear y mostrar el círculo para este marcador
				showCircleForMarker(lat, lng, locationType);

				// Hacer zoom al círculo pero con restricción de zoom máximo
				const position = { lat, lng };
				const circle = circles.find(
					(c) => c.getCenter()?.lat() === lat && c.getCenter()?.lng() === lng
				);

				if (circle) {
					// Ajustar el zoom pero respetar el máximo de 14
					const bounds = circle.getBounds()!;
					map!.fitBounds(bounds);

					// Asegurar que el zoom no exceda 14
					const currentZoom = map!.getZoom() || 0;
					if (currentZoom > 14) {
						map!.setZoom(14);
					}

					// Pan inicial
					map!.panTo(position);
				}

				// Emitir evento usando la nueva sintaxis de Svelte 5
				// Si hay múltiples tareas, seleccionar la primera
				const selectedTask = tasks[0];
				onTaskSelected?.({ task: selectedTask, locationType });
			});

			return marker;
		} catch (error) {
			console.error('Error creating task marker:', error);
			return null;
		}
	}

	function showCircleForMarker(lat: number, lng: number, locationType: 'pickup') {
		if (!map || !googleMapsReady || !window.google?.maps) return;

		const position = { lat, lng };

		// Crear círculo de radio
		const circle = new google.maps.Circle({
			strokeColor: '#F59E0B',
			strokeOpacity: 0.8,
			strokeWeight: 2,
			fillColor: '#F59E0B',
			fillOpacity: 0.1,
			map,
			center: position,
			radius: serviceRadius * 100 // Convertir km a metros
		});

		circles.push(circle);
	}

	function hideAllCircles() {
		circles.forEach((circle) => {
			if (circle) circle.setMap(null);
		});
		circles = [];
	}

	function clearMarkers() {
		markers.forEach((marker) => {
			if (marker) marker.map = null;
		});
		markers = [];
	}

	function clearCircles() {
		circles.forEach((circle) => {
			if (circle) circle.setMap(null);
		});
		circles = [];
	}

	// Función para actualizar markers cuando cambien las tasks
	async function updateMarkers() {
		if (map && isMapLoaded) {
			// Limpiar markers existentes
			clearMarkers();

			// Crear nuevos markers
			await createTaskMarkers();
		}
	}

	// Función para mostrar el círculo de una task específica con restricciones de zoom
	function highlightTaskOnMap(task: Task) {
		if (!map || !isMapLoaded) return;

		// Ocultar todos los círculos primero
		hideAllCircles();

		// Solo mostrar pickup location
		if (task.pickupLocation?.latitude && task.pickupLocation.longitude) {
			showCircleForMarker(task.pickupLocation.latitude, task.pickupLocation.longitude, 'pickup');

			// Hacer zoom al círculo con restricciones
			const position = {
				lat: task.pickupLocation.latitude,
				lng: task.pickupLocation.longitude
			};
			const circle = circles.find(
				(c) =>
					c.getCenter()?.lat() === task.pickupLocation?.latitude &&
					c.getCenter()?.lng() === task.pickupLocation?.longitude
			);

			if (circle) {
				map.fitBounds(circle.getBounds()!);

				// Asegurar que el zoom no exceda 14
				const currentZoom = map.getZoom() || 0;
				if (currentZoom > 14) {
					map.setZoom(14);
				}

				map.panTo(position);
			}
		}
	}

	// Function to update map element height
	function updateMapElementHeight() {
		if (!mapElement || !mapContainerDiv) return;
		
		// Walk up the parent chain to find a parent with actual height
		let parent = mapContainerDiv.parentElement;
		let foundHeight = 0;
		let foundElement: HTMLElement | null = null;
		
		// Check up to 5 levels of parents
		for (let i = 0; i < 5 && parent; i++) {
			const parentHeight = parent.offsetHeight;
			const computedHeight = window.getComputedStyle(parent).height;
			const heightValue = parseFloat(computedHeight);
			
			if (parentHeight > 100) {
				foundHeight = parentHeight;
				foundElement = parent as HTMLElement;
				break;
			} else if (!isNaN(heightValue) && heightValue > 100) {
				foundHeight = heightValue;
				foundElement = parent as HTMLElement;
				break;
			}
			
			parent = parent.parentElement;
		}
		
		// If we found a height, use it
		if (foundHeight > 100) {
			mapContainerDiv.style.height = `${foundHeight}px`;
			mapElement.style.height = `${foundHeight}px`;
			mapElement.style.minHeight = `${foundHeight}px`;
			
			// Trigger resize if map is loaded
			if (map && isMapLoaded && window.google?.maps) {
				requestAnimationFrame(() => {
					if (map) {
						google.maps.event.trigger(map, 'resize');
					}
				});
			}
		} else {
			// Fallback: use viewport-based calculation
			const viewportHeight = window.innerHeight;
			// Estimate: viewport - header (200px) - bottom nav (80px) = available height
			const estimatedHeight = Math.max(400, viewportHeight - 280);
			mapContainerDiv.style.height = `${estimatedHeight}px`;
			mapElement.style.height = `${estimatedHeight}px`;
			mapElement.style.minHeight = `${estimatedHeight}px`;
			
			if (map && isMapLoaded && window.google?.maps) {
				requestAnimationFrame(() => {
					if (map) {
						google.maps.event.trigger(map, 'resize');
					}
				});
			}
		}
	}

	/**
	 * Calculate map height using viewport and CSS variables
	 * Extracted to single function to avoid duplication
	 */
	function calculateMapHeight(): number {
		const viewportHeight = window.innerHeight;
		const dockHeightStr = getComputedStyle(document.documentElement).getPropertyValue('--app-dock-height') || 
			getComputedStyle(document.documentElement).getPropertyValue('--app-footer-height') || '64px';
		const dockHeight = parseFloat(dockHeightStr.replace('px', '')) || 64;
		
		const headerHeightStr = getComputedStyle(document.documentElement).getPropertyValue('--header-controls-height') || '10rem';
		const headerHeightRem = parseFloat(headerHeightStr.replace('rem', '')) || 10;
		const headerHeightPx = headerHeightRem * 16; // Convert rem to px (assuming 16px base)
		
		return Math.max(400, viewportHeight - dockHeight - headerHeightPx);
	}
	
	/**
	 * Apply calculated height to map container and element
	 */
	function applyMapHeight(calculatedHeight: number): void {
		if (!mapContainerDiv || !mapElement) return;
		
		mapContainerDiv.style.height = `${calculatedHeight}px`;
		mapElement.style.height = `${calculatedHeight}px`;
		mapElement.style.minHeight = `${calculatedHeight}px`;
		
		// Trigger resize if map is loaded
		if (map && isMapLoaded && window.google?.maps) {
			requestAnimationFrame(() => {
				if (map) {
					google.maps.event.trigger(map, 'resize');
				}
			});
		}
	}

	// Watch for container and map element changes to ensure proper height
	$effect(() => {
		if (mapElement && mapContainerDiv) {
			// Calculate and apply height immediately
			const calculatedHeight = calculateMapHeight();
			applyMapHeight(calculatedHeight);
			
			// Set up ResizeObserver to watch for container size changes
			if (typeof ResizeObserver !== 'undefined') {
				if (containerResizeObserver) {
					containerResizeObserver.disconnect();
				}
				
				containerResizeObserver = new ResizeObserver(() => {
					updateMapElementHeight();
				});
				
				containerResizeObserver.observe(mapContainerDiv);
				
				// Also observe parent to catch when it gets height
				if (mapContainerDiv.parentElement) {
					containerResizeObserver.observe(mapContainerDiv.parentElement);
				}
				
				return () => {
					if (containerResizeObserver) {
						containerResizeObserver.disconnect();
						containerResizeObserver = null;
					}
				};
			}
		}
	});

	// Watch for tasks changes - usando $effect.pre para evitar bucles infinitos
	$effect.pre(() => {
		if (tasks.length > 0 && map && isMapLoaded) {
			// Solo actualizar si realmente cambió algo
			const currentTaskIds = tasks.map((t: Task) => t.id).join(',');
			if (currentTaskIds !== lastTaskIds) {
				lastTaskIds = currentTaskIds;
				// Usar setTimeout para evitar problemas de sincronización
				setTimeout(() => {
					updateMarkers();
				}, 0);
			}
		}
	});

	// Watch for selectedTask changes - usando $effect.pre para evitar bucles infinitos
	$effect.pre(() => {
		if (selectedTask && map && isMapLoaded) {
			// Solo actualizar si realmente cambió la task seleccionada
			const currentSelectedTaskId = selectedTask.id;
			if (currentSelectedTaskId !== lastSelectedTaskId) {
				lastSelectedTaskId = currentSelectedTaskId;
				// Usar setTimeout para evitar problemas de sincronización
				setTimeout(() => {
					highlightTaskOnMap(selectedTask);
				}, 0);
			}
		}
	});


	onMount(async () => {
		try {
			// Mark component as mounted
			isComponentMounted = true;

			// Get user location first - this is now the primary way to determine map center
			userLocation = await getUserLocation();

			// Load Google Maps script
			await loadGoogleMapsScript();
			
			// Wait for DOM to be ready
			await tick();
			
			// Wait for layout to stabilize - multiple frames to ensure parent heights are calculated
			await new Promise(resolve => requestAnimationFrame(resolve));
			await new Promise(resolve => requestAnimationFrame(resolve));
			await new Promise(resolve => requestAnimationFrame(resolve));
			
			// Force height calculation before initialization - use extracted function
			if (mapContainerDiv && mapElement) {
				const calculatedHeight = calculateMapHeight();
				applyMapHeight(calculatedHeight);
			}
			
			// Initialize map if all conditions are met
			if (mapElement && googleMapsReady && !isMapLoaded && !hasError) {
				await tryInitMap();
			}
		} catch (err) {
			console.error('Error loading Google Maps:', err);
			error = err instanceof Error ? err.message : 'Error loading Google Maps';
			isLoading = false;
		}
	});

	onDestroy(() => {
		// Cleanup
		clearMarkers();
		clearCircles();
		if (containerResizeObserver) {
			containerResizeObserver.disconnect();
			containerResizeObserver = null;
		}
		if (map) {
			google.maps.event.clearInstanceListeners(map);
		}
	});
</script>

<div 
	bind:this={mapContainerDiv}
	class="task-location-map relative w-full h-full"
>
	<div 
		bind:this={mapElement} 
		class="w-full h-full overflow-hidden rounded-lg"
	>
			{#if isLoading}
				<div class="bg-base-200 flex h-full w-full items-center justify-center">
					<div class="text-center">
						<span class="loading loading-spinner loading-lg mb-2"></span>
						<p class="text-base-content/70 text-sm">{$t('dashboard.bids.components.maps.task_location_map.loading_map')}</p>
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
						<p class="text-error text-sm">{$t('dashboard.bids.components.maps.task_location_map.error_loading_map')}</p>
					</div>
				</div>
			{/if}
	</div>

	<!-- Map Control Buttons -->
	<div class="{isFullscreen
		? 'fixed top-4 right-4 z-1000'
		: 'absolute top-4 right-4 z-20'} flex gap-2">
		<!-- My Location Button -->
		<button
			onclick={centerOnUserLocation}
			disabled={isLocating || !isMapLoaded}
			class="btn btn-circle btn-lg bg-base-100/90 hover:bg-base-100 shadow-md disabled:opacity-50"
			aria-label={$t('common.task.location_picker.my_location') || 'Center on my location'}
			title={$t('common.task.location_picker.my_location') || 'Center on my location'}
		>
			{#if isLocating}
				<span class="loading loading-spinner loading-sm"></span>
			{:else}
				<!-- Map pin icon (matches task cards) -->
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-base-content h-5 w-5"
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
			{/if}
		</button>

		<!-- Fullscreen Button -->
		{#if showFullscreen}
			<button
				onclick={toggleFullscreen}
				class="btn btn-circle btn-lg bg-base-100/90 hover:bg-base-100 shadow-md"
				aria-label={isFullscreen
					? $t('common.task.location_picker.exit_fullscreen')
					: $t('common.task.location_picker.enter_fullscreen')}
				title={isFullscreen
					? $t('common.task.location_picker.exit_fullscreen')
					: $t('common.task.location_picker.enter_fullscreen')}
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

<style>
	:global(.pac-container) {
		z-index: 9999;
	}
</style>
