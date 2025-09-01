<script lang="ts">
	import type { Task, Location } from '$lib/types/task';
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';

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
	let mapElement: HTMLElement;
	let markers: google.maps.marker.AdvancedMarkerElement[] = $state([]);
	let circles: google.maps.Circle[] = $state([]);
	let isMapLoaded = $state(false);
	let hasError = $state(false);
	let error = $state('');
	let scriptLoaded = $state(false);
	let googleMapsReady = $state(false);
	let initRetryCount = $state(0);
	let maxRetries = 3;
	let lastTaskIds = $state('');
	let lastSelectedTaskId = $state<string | null>(null);
	let serviceRadius = $state(5); // Default to 5 km

	// Default location (San Salvador) - used when no tasks have locations
	const defaultLocation: Location = {
		displayName: 'San Salvador, El Salvador',
		latitude: 13.6929,
		longitude: -89.2182,
		zipCode: '',
		locationLoaded: false
	};

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
							reject(new Error('Google Maps API not initialized'));
						}
					}, 500);
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

	async function initMap() {
		if (!googleMapsReady || !window.google?.maps?.Map) {
			throw new Error('Google Maps not fully loaded');
		}

		try {
			// Get center location from tasks or use default
			const centerLocation = getMapCenter();

			// Initialize Google Maps
			map = new google.maps.Map(mapElement, {
				center: { lat: centerLocation.latitude!, lng: centerLocation.longitude! },
				zoom: 11,
				maxZoom: 18, // Establece el zoom máximo
				minZoom: 5, // Opcional: también puedes establecer un zoom mínimo
				mapTypeId: google.maps.MapTypeId.ROADMAP,

				mapTypeControl: true, // Selector de capas (Roadmap, Satellite, etc.)
				streetViewControl: true,
				fullscreenControl: true,

				// Opcional: estilo del control de capas
				mapTypeControlOptions: {
					style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR, // o HORIZONTAL_BAR
					position: google.maps.ControlPosition.TOP_RIGHT
				},

				// Opcional: estilo del control de zoom
				zoomControlOptions: {
					position: google.maps.ControlPosition.RIGHT_CENTER
				},

				// Opcional: control de street view
				streetViewControlOptions: {
					position: google.maps.ControlPosition.RIGHT_TOP
				},
				mapId: import.meta.env.PROD ? import.meta.env.VITE_GOOGLE_MAPS_ID : 'DEMO_MAP_ID'
			});

			// Create markers for all tasks with locations
			await createTaskMarkers();

			// Fit bounds to show all markers if there are any
			if (markers.length > 0) {
				fitMapToMarkers();
			}
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

		return defaultLocation;
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
		} catch (err) {
			console.error('Error initializing map:', err);
			error = err instanceof Error ? err.message : 'Error initializing map';
			hasError = true;
		}
	}

	async function createTaskMarkers() {
		if (!map || !googleMapsReady || !window.google?.maps) return;

		// Clear existing markers and circles
		clearMarkers();
		clearCircles();

		try {
			const { AdvancedMarkerElement } = (await google.maps.importLibrary(
				'marker'
			)) as google.maps.MarkerLibrary;

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
		if (!map || !googleMapsReady || !window.google?.maps) return null;

		try {
			const { AdvancedMarkerElement } = (await google.maps.importLibrary(
				'marker'
			)) as google.maps.MarkerLibrary;

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

			// Agregar indicador de tipo de ubicación
			const locationIndicator = document.createElement('div');

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

				console.log(
					'Task clicked:',
					selectedTask.title,
					'Location type:',
					locationType,
					'Total tasks at location:',
					tasks.length
				);
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

	function fitMapToMarkers() {
		if (!map || markers.length === 0) return;

		const bounds = new google.maps.LatLngBounds();
		markers.forEach((marker) => {
			if (marker.position) {
				bounds.extend(marker.position);
			}
		});

		// Add some padding to the bounds
		map.fitBounds(bounds);

		// Ensure minimum zoom level
		google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
			if (map!.getZoom()! > 15) {
				map!.setZoom(15);
			}
		});
	}

	// Función para actualizar markers cuando cambien las tasks
	async function updateMarkers() {
		if (map && isMapLoaded) {
			await createTaskMarkers();
			if (markers.length > 0) {
				fitMapToMarkers();
			}
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

	onMount(async () => {
		try {
			// Load Google Maps API dynamically if not already loaded
			await loadGoogleMapsScript();

			// Try to initialize the map
			await tryInitMap();
		} catch (err) {
			console.error('Error loading Google Maps:', err);
			error = err instanceof Error ? err.message : 'Error loading Google Maps';
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
	<div class="map-container relative w-full max-h-[800px]" style="height: {height};">
		<div bind:this={mapElement} class="h-full w-full overflow-hidden rounded-lg">
			{#if !isMapLoaded}
				<div class="bg-base-200 flex h-full w-full items-center justify-center">
					<span class="loading loading-spinner loading-lg"></span>
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
