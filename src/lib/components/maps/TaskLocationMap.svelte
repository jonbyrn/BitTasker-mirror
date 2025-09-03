<script lang="ts">
	import type { Task, Location } from '$lib/types/task';
	import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';

	let {
		tasks = [],
		height = '60vh',
		selectedTask = null
	} = $props<{
		tasks: Task[];
		height?: string;
		selectedTask?: Task | null;
	}>();

	// Event dispatcher para comunicar con el componente padre
	const dispatch = createEventDispatcher<{
		taskSelected: { task: Task; locationType: 'pickup' | 'dropoff' };
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

	// Default location (San Salvador) - used when no tasks have locations
	const defaultLocation: Location = {
		displayName: 'San Salvador, El Salvador',
		latitude: 13.6929,
		longitude: -89.2182,
		zipCode: '',
		locationLoaded: false
	};

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
						displayName: 'Tu ubicación',
						latitude: position.coords.latitude,
						longitude: position.coords.longitude,
						zipCode: '',
						locationLoaded: true
					};
					resolve(userLoc);
				},
				(error) => {
					console.log('Geolocation error:', error);
					resolve(null);
				},
				{
					timeout: 5000,
					enableHighAccuracy: false,
					maximumAge: 300000 // 5 minutes
				}
			);
		});
	}

	// Function to determine appropriate zoom level based on location
	function getZoomLevelForLocation(location: Location): number {
		// El Salvador coordinates
		const elSalvadorBounds = {
			north: 14.4241,
			south: 13.1490,
			east: -87.7235,
			west: -90.0956
		};

		// Check if location is in El Salvador
		if (
			location.latitude! >= elSalvadorBounds.south &&
			location.latitude! <= elSalvadorBounds.north &&
			location.longitude! >= elSalvadorBounds.west &&
			location.longitude! <= elSalvadorBounds.east
		) {
			return 10; // Zoom closer for El Salvador
		}

		// Central America bounds
		const centralAmericaBounds = {
			north: 18.5,
			south: 7.2,
			east: -77.0,
			west: -92.2
		};

		// Check if location is in Central America
		if (
			location.latitude! >= centralAmericaBounds.south &&
			location.latitude! <= centralAmericaBounds.north &&
			location.longitude! >= centralAmericaBounds.west &&
			location.longitude! <= centralAmericaBounds.east
		) {
			return 7; // Medium zoom for Central America
		}

		// Default zoom for other locations
		return 5;
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
				script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&loading=async&libraries=marker`;
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

			// Get center location from tasks, user location, or use default
			const centerLocation = getMapCenter();
			const zoomLevel = getZoomLevelForLocation(centerLocation);

			// Initialize Google Maps
			map = new google.maps.Map(mapElement, {
				center: { lat: centerLocation.latitude!, lng: centerLocation.longitude! },
				zoom: zoomLevel,
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

			// Ajustar el zoom a las tareas después de inicializar el mapa
			setTimeout(() => {
				fitMapToTasks();
			}, 1000);

		} catch (error) {
			console.error('Error initializing Google Maps:', error);
			throw error;
		}
	}

	function getMapCenter(): Location {
		// Find the first task with a valid location
		const taskWithLocation = tasks.find(
			(task: Task) =>
				(task.pickupLocation?.latitude && task.pickupLocation?.longitude) ||
				(task.dropOffLocation?.latitude && task.dropOffLocation?.longitude)
		);

		if (taskWithLocation?.pickupLocation?.latitude && taskWithLocation.pickupLocation.longitude) {
			return taskWithLocation.pickupLocation;
		} else if (
			taskWithLocation?.dropOffLocation?.latitude &&
			taskWithLocation.dropOffLocation.longitude
		) {
			return taskWithLocation.dropOffLocation;
		}

		// Use user location if available, otherwise default
		return userLocation || defaultLocation;
	}

	// Nueva función para ajustar el zoom a las tareas
	function fitMapToTasks() {
		if (!map || !tasks.length) return;

		// Recopilar todas las ubicaciones válidas
		const validLocations: { lat: number; lng: number }[] = [];
		
		tasks.forEach((task: Task) => {
			if (task.pickupLocation?.latitude && task.pickupLocation?.longitude) {
				validLocations.push({
					lat: task.pickupLocation.latitude,
					lng: task.pickupLocation.longitude
				});
			}
			if (task.dropOffLocation?.latitude && task.dropOffLocation?.longitude) {
				validLocations.push({
					lat: task.dropOffLocation.latitude,
					lng: task.dropOffLocation.longitude
				});
			}
		});

		if (validLocations.length === 0) return;

		// Si solo hay una ubicación, centrar en ella con zoom apropiado
		if (validLocations.length === 1) {
			map.setCenter(validLocations[0]);
			map.setZoom(13); // Zoom más cercano para una sola ubicación
			return;
		}

		// Si hay múltiples ubicaciones, ajustar el bounds
		const bounds = new google.maps.LatLngBounds();
		validLocations.forEach(location => {
			bounds.extend(location);
		});

		// Ajustar el mapa a los bounds con padding
		map.fitBounds(bounds, {
			top: 50,
			right: 50,
			bottom: 50,
			left: 50
		});

		// Asegurar un zoom máximo para evitar que se vea demasiado lejos
		google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
			if (map!.getZoom()! > 15) {
				map!.setZoom(15);
			}
		});
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
			await createTaskMarkers();
			
			// Hide loading after everything is ready
			setTimeout(() => {
				isLoading = false;
			}, 1500);
			
		} catch (err) {
			console.error('Error initializing map:', err);
			error = err instanceof Error ? err.message : 'Error initializing map';
			hasError = true;
			isLoading = false;
		}
	}

	// Función para agrupar tareas por ubicación cercana
	function groupTasksByLocation(tasks: Task[]) {
		const groups: Array<{
			latitude: number;
			longitude: number;
			tasks: Task[];
			locationType: 'pickup' | 'dropoff';
		}> = [];

		const processedLocations = new Set<string>();

		for (const task of tasks) {
			// Procesar pickup location
			if (task.pickupLocation?.latitude && task.pickupLocation.longitude) {
				const locationKey = `${task.pickupLocation.latitude.toFixed(4)},${task.pickupLocation.longitude.toFixed(4)}`;

				if (!processedLocations.has(locationKey)) {
					processedLocations.add(locationKey);

					// Buscar tareas cercanas en la misma ubicación
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

			// Procesar dropoff location
			if (task.dropOffLocation?.latitude && task.dropOffLocation.longitude) {
				const locationKey = `${task.dropOffLocation.latitude.toFixed(4)},${task.dropOffLocation.longitude.toFixed(4)}`;

				if (!processedLocations.has(locationKey)) {
					processedLocations.add(locationKey);

					// Buscar tareas cercanas en la misma ubicación
					const nearbyTasks = tasks.filter(
						(t) =>
							t.dropOffLocation?.latitude &&
							t.dropOffLocation.longitude &&
							Math.abs(t.dropOffLocation.latitude - task?.dropOffLocation?.latitude!) < 0.001 &&
							Math.abs(t.dropOffLocation.longitude - task?.dropOffLocation?.longitude!) < 0.001
					);

					groups.push({
						latitude: task.dropOffLocation.latitude,
						longitude: task.dropOffLocation.longitude,
						tasks: nearbyTasks,
						locationType: 'dropoff'
					});
				}
			}
		}

		return groups;
	}

	async function createTaskMarker(
		lat: number,
		lng: number,
		tasks: Task[],
		locationType: 'pickup' | 'dropoff'
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
			img.style.width = '4rem'; // Tamaño optimizado
			img.style.height = '4rem';
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

			// 🖱️ Evento click en el marcador → ajusta zoom al círculo
			marker.addListener('click', () => {
				// Ocultar todos los círculos primero
				hideAllCircles();

				// Crear y mostrar el círculo para este marcador
				showCircleForMarker(lat, lng, locationType);

				// Hacer zoom al círculo
				const position = { lat, lng };
				const circle = circles.find(
					(c) => c.getCenter()?.lat() === lat && c.getCenter()?.lng() === lng
				);

				if (circle) {
					map!.fitBounds(circle.getBounds()!);
					// Pan inicial
					map!.panTo(position);
				}

				// Emitir evento para que el componente padre sepa qué task fue seleccionada
				// Si hay múltiples tareas, seleccionar la primera
				const selectedTask = tasks[0];
				dispatch('taskSelected', { task: selectedTask, locationType });
			});

			return marker;
		} catch (error) {
			console.error('Error creating task marker:', error);
			return null;
		}
	}

	function showCircleForMarker(lat: number, lng: number, locationType: 'pickup' | 'dropoff') {
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
			radius: serviceRadius * 50 // Convertir km a metros
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
			
			// Ajustar el zoom a las nuevas tareas
			fitMapToTasks();
		}
	}

	// Función para mostrar el círculo de una task específica
	function highlightTaskOnMap(task: Task) {
		if (!map || !isMapLoaded) return;

		// Ocultar todos los círculos primero
		hideAllCircles();

		// Buscar si la task tiene pickup location
		if (task.pickupLocation?.latitude && task.pickupLocation.longitude) {
			showCircleForMarker(task.pickupLocation.latitude, task.pickupLocation.longitude, 'pickup');

			// Hacer zoom al círculo
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
				map.panTo(position);
			}
			return;
		}

		// Si no tiene pickup, buscar dropoff location
		if (task.dropOffLocation?.latitude && task.dropOffLocation.longitude) {
			showCircleForMarker(task.dropOffLocation.latitude, task.dropOffLocation.longitude, 'dropoff');

			// Hacer zoom al círculo
			const position = {
				lat: task.dropOffLocation.latitude,
				lng: task.dropOffLocation.longitude
			};
			const circle = circles.find(
				(c) =>
					c.getCenter()?.lat() === task.dropOffLocation?.latitude &&
					c.getCenter()?.lng() === task.dropOffLocation?.longitude
			);

			if (circle) {
				map.fitBounds(circle.getBounds()!);
				map.panTo(position);
			}
		}
	}

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
			
			// Get user location first
			userLocation = await getUserLocation();
			
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
		clearMarkers();
		clearCircles();
		if (map) {
			google.maps.event.clearInstanceListeners(map);
		}
	});
</script>

<div class="task-location-map w-full">
	<!-- Map Container -->
	<div class="map-container relative max-h-[800px] w-full" style="height: {height};">
		<div bind:this={mapElement} class="h-full w-full overflow-hidden rounded-lg">
			{#if isLoading}
				<div class="bg-base-200 flex h-full w-full items-center justify-center">
					<div class="text-center">
						<span class="loading loading-spinner loading-lg mb-2"></span>
						<p class="text-sm text-base-content/70">Cargando mapa...</p>
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
						<p class="text-sm text-error">Error al cargar el mapa</p>
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
