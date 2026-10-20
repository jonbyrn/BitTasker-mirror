<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { t } from 'svelte-i18n';
	import type { Task } from '$lib/types/task';
	import type { Service } from '$lib/types/service.d';
	import type { ListingCluster, ListingPoint } from '$lib/utils/maps/listing-markers';
	import {
		clusterListingPoints,
		resolveServiceMarkers,
		resolveTaskMarkers
	} from '$lib/utils/maps/listing-markers';
	import { geocodeEpoch } from '$lib/utils/maps/nominatim';
	import { taskDetailsPath } from '$lib/utils/tasks/task-path';
	import MapAttribution from '$lib/components/maps/MapAttribution.svelte';
	import {
		MAX_ZOOM,
		MIN_ZOOM,
		fitView,
		latitudeFromWorldPixel,
		longitudeFromWorldPixel,
		panCenter,
		pointPixel,
		visibleTiles,
		worldPixelX,
		worldPixelY
	} from '$lib/utils/maps/slippy-tiles';

	type TaskPin = ListingPoint & { item: Task };
	type ServicePin = ListingPoint & { item: Service };

	interface PopupRow {
		id: string;
		title: string;
	}

	interface MapView {
		latitude: number;
		longitude: number;
		zoom: number;
		key: string;
		focusId: string | null;
	}

	let {
		tasks = [],
		services = [],
		height = '100%',
		selectedTask = null,
		selectedService = null,
		showFullscreen = true,
		showMyLocationButton = true,
		onServiceSelected,
		onViewService
	}: {
		tasks?: Task[];
		services?: Service[];
		height?: string;
		selectedTask?: Task | null;
		selectedService?: Service | null;
		showFullscreen?: boolean;
		showMyLocationButton?: boolean;
		onServiceSelected?: (event: { service: Service }) => void;
		onViewService?: (service: Service) => void;
	} = $props();

	const isServicesMode = $derived((services?.length ?? 0) > 0);
	const geocodeTick = $derived($geocodeEpoch);
	const taskPins = $derived.by(() => {
		void geocodeTick;
		return isServicesMode ? [] : resolveTaskMarkers(tasks);
	});
	const servicePins = $derived.by(() => {
		void geocodeTick;
		return isServicesMode ? resolveServiceMarkers(services) : [];
	});
	const clusters = $derived(
		isServicesMode ? clusterListingPoints(servicePins) : clusterListingPoints(taskPins)
	);
	const clusterKey = $derived(
		clusters
			.map(
				(cluster) =>
					`${cluster.latitude.toFixed(5)},${cluster.longitude.toFixed(5)},${cluster.count}`
			)
			.join('|')
	);
	const focusId = $derived(
		isServicesMode
			? selectedService?.uniqueId || selectedService?.id || null
			: (selectedTask?.id ?? null)
	);
	const focusPoint = $derived.by(() => {
		void geocodeTick;
		if (isServicesMode) {
			return selectedService ? (resolveServiceMarkers([selectedService])[0] ?? null) : null;
		}
		return selectedTask ? (resolveTaskMarkers([selectedTask])[0] ?? null) : null;
	});

	let width = $state(0);
	let heightPx = $state(0);
	let fullscreen = $state(false);
	let locating = $state(false);
	let popup = $state<PopupRow[] | null>(null);
	let popupKind = $state<'task' | 'service'>('task');
	let pan = $state<MapView | null>(null);

	const view = $derived.by((): MapView => {
		if (pan && pan.key === clusterKey && pan.focusId === focusId) return pan;
		if (focusPoint) {
			return {
				latitude: focusPoint.latitude,
				longitude: focusPoint.longitude,
				zoom: 12,
				key: clusterKey,
				focusId
			};
		}
		return {
			...fitView(clusters, width, heightPx),
			key: clusterKey,
			focusId
		};
	});

	const tiles = $derived(visibleTiles(view.latitude, view.longitude, view.zoom, width, heightPx));

	const watchSize: Attachment = (node) => {
		const measure = () => {
			width = node.clientWidth;
			heightPx = node.clientHeight;
		};
		measure();
		if (typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		return () => observer.disconnect();
	};

	function commitView(latitude: number, longitude: number, zoom: number) {
		pan = { latitude, longitude, zoom, key: clusterKey, focusId };
	}

	function onEscape(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		fullscreen = false;
		window.removeEventListener('keydown', onEscape);
	}

	function toggleFullscreen() {
		fullscreen = !fullscreen;
		if (fullscreen) window.addEventListener('keydown', onEscape);
		else window.removeEventListener('keydown', onEscape);
	}

	onDestroy(() => window.removeEventListener('keydown', onEscape));

	function markerPosition(latitude: number, longitude: number): { left: number; top: number } {
		return pointPixel(
			latitude,
			longitude,
			view.latitude,
			view.longitude,
			view.zoom,
			width,
			heightPx
		);
	}

	let dragging = false;
	let lastX = 0;
	let lastY = 0;

	function startPan(event: PointerEvent) {
		if (event.button !== 0) return;
		dragging = true;
		lastX = event.clientX;
		lastY = event.clientY;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function movePan(event: PointerEvent) {
		if (!dragging) return;
		const deltaX = event.clientX - lastX;
		const deltaY = event.clientY - lastY;
		lastX = event.clientX;
		lastY = event.clientY;
		const next = panCenter(view.latitude, view.longitude, view.zoom, deltaX, deltaY);
		commitView(next.latitude, next.longitude, view.zoom);
	}

	function endPan() {
		dragging = false;
	}

	function onWheel(event: WheelEvent) {
		event.preventDefault();
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const direction = event.deltaY > 0 ? -1 : 1;
		const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom + direction));
		if (nextZoom === view.zoom) return;
		const offsetX = event.clientX - rect.left - rect.width / 2;
		const offsetY = event.clientY - rect.top - rect.height / 2;
		const latitude = latitudeFromWorldPixel(
			worldPixelY(view.latitude, view.zoom) + offsetY,
			view.zoom
		);
		const longitude = longitudeFromWorldPixel(
			worldPixelX(view.longitude, view.zoom) + offsetX,
			view.zoom
		);
		commitView(
			latitudeFromWorldPixel(worldPixelY(latitude, nextZoom) - offsetY, nextZoom),
			longitudeFromWorldPixel(worldPixelX(longitude, nextZoom) - offsetX, nextZoom),
			nextZoom
		);
	}

	function changeZoom(direction: number) {
		commitView(
			view.latitude,
			view.longitude,
			Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom + direction))
		);
	}

	function centerOnUser() {
		if (!navigator.geolocation) return;
		locating = true;
		navigator.geolocation.getCurrentPosition(
			(position) => {
				commitView(position.coords.latitude, position.coords.longitude, 13);
				locating = false;
			},
			() => {
				locating = false;
			},
			{ enableHighAccuracy: false, maximumAge: 60_000, timeout: 8000 }
		);
	}

	function openTask(id: string) {
		void goto(resolve(taskDetailsPath(id), {}));
	}

	function openTaskCluster(cluster: ListingCluster<TaskPin>) {
		if (cluster.items.length === 1 && cluster.items[0]?.item.id) {
			popup = null;
			openTask(cluster.items[0].item.id);
			return;
		}
		popupKind = 'task';
		popup = cluster.items.map((entry) => ({
			id: entry.item.id,
			title: entry.item.title || 'Task'
		}));
	}

	function openServiceCluster(cluster: ListingCluster<ServicePin>) {
		if (cluster.items.length === 1) {
			popup = null;
			const service = cluster.items[0].item;
			onServiceSelected?.({ service });
			return;
		}
		popupKind = 'service';
		popup = cluster.items.map((entry) => ({
			id: entry.item.uniqueId || entry.item.id,
			title: entry.item.title || 'Service'
		}));
	}

	function openPopupRow(row: PopupRow) {
		if (popupKind === 'task') {
			openTask(row.id);
			return;
		}
		const service = services.find((item) => (item.uniqueId || item.id) === row.id);
		if (!service) return;
		onServiceSelected?.({ service });
		if (onViewService) onViewService(service);
	}

	function pinLabel(count: number, title: string): string {
		return count > 1 ? `${count} · ${title}` : title;
	}
</script>

<div
	class="keyless-listing-map bg-base-200 relative w-full overflow-hidden rounded-lg"
	class:fixed={fullscreen}
	class:inset-0={fullscreen}
	class:z-50={fullscreen}
	style:height={fullscreen ? '100dvh' : height}
	data-keyless-map
>
	<div
		class="relative h-full w-full touch-none overflow-hidden"
		{@attach watchSize}
		onpointerdown={startPan}
		onpointermove={movePan}
		onpointerup={endPan}
		onpointercancel={endPan}
		onwheel={onWheel}
		role="application"
		aria-label={$t('find_tasks.map') || 'Map'}
	>
		{#each tiles as tile (tile.key)}
			<img
				src={tile.url}
				alt=""
				class="pointer-events-none absolute max-w-none"
				style:left="{tile.left}px"
				style:top="{tile.top}px"
				width="256"
				height="256"
				draggable="false"
			/>
		{/each}

		{#if isServicesMode}
			{#each clusters as cluster (`${cluster.latitude},${cluster.longitude}`)}
				{@const position = markerPosition(cluster.latitude, cluster.longitude)}
				{@const title = (cluster.items[0] as ServicePin).item.title || 'Service'}
				<button
					type="button"
					class="absolute z-10 -translate-x-1/2 -translate-y-full border-0 bg-transparent p-0"
					style:left="{position.left}px"
					style:top="{position.top}px"
					data-listing-pin
					data-pin-count={cluster.count}
					aria-label={pinLabel(cluster.count, title)}
					onpointerdown={(event) => event.stopPropagation()}
					onclick={() => openServiceCluster(cluster as ListingCluster<ServicePin>)}
				>
					<img src="/map-pin.png" alt="" class="pointer-events-none h-14 w-14 rounded-full" />
					{#if cluster.count > 1}
						<span
							class="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-red-500 text-[11px] font-bold text-white"
						>
							{cluster.count}
						</span>
					{/if}
				</button>
			{/each}
		{:else}
			{#each clusters as cluster (`${cluster.latitude},${cluster.longitude}`)}
				{@const position = markerPosition(cluster.latitude, cluster.longitude)}
				{@const title = (cluster.items[0] as TaskPin).item.title || 'Task'}
				<button
					type="button"
					class="absolute z-10 -translate-x-1/2 -translate-y-full border-0 bg-transparent p-0"
					style:left="{position.left}px"
					style:top="{position.top}px"
					data-listing-pin
					data-pin-count={cluster.count}
					aria-label={pinLabel(cluster.count, title)}
					onpointerdown={(event) => event.stopPropagation()}
					onclick={() => openTaskCluster(cluster as ListingCluster<TaskPin>)}
				>
					<img src="/map-pin.png" alt="" class="pointer-events-none h-14 w-14 rounded-full" />
					{#if cluster.count > 1}
						<span
							class="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-red-500 text-[11px] font-bold text-white"
						>
							{cluster.count}
						</span>
					{/if}
				</button>
			{/each}
		{/if}
	</div>

	{#if popup}
		<div
			class="bg-base-100 absolute bottom-8 left-2 z-30 max-h-48 w-56 overflow-auto rounded-lg p-2 shadow-md"
		>
			{#each popup as row (row.id)}
				<button
					type="button"
					class="hover:bg-base-200 block w-full rounded px-2 py-1 text-left text-sm"
					onclick={() => openPopupRow(row)}
				>
					{row.title}
				</button>
			{/each}
		</div>
	{/if}

	<MapAttribution />

	<div class="absolute top-4 right-4 z-20 flex gap-2">
		{#if showMyLocationButton}
			<button
				type="button"
				class="btn btn-circle btn-lg bg-base-100/90 hover:bg-base-100 shadow-md"
				aria-label={$t('common.task.location_picker.my_location') || 'Center on my location'}
				onclick={centerOnUser}
				disabled={locating}
			>
				{#if locating}
					<span class="loading loading-spinner loading-sm"></span>
				{:else}
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
		{/if}
		<button
			type="button"
			class="btn btn-circle btn-lg bg-base-100/90 hover:bg-base-100 text-xl shadow-md"
			aria-label={$t('common.task.location_picker.zoom_in') || 'Zoom in'}
			onclick={() => changeZoom(1)}
		>
			+
		</button>
		<button
			type="button"
			class="btn btn-circle btn-lg bg-base-100/90 hover:bg-base-100 text-xl shadow-md"
			aria-label={$t('common.task.location_picker.zoom_out') || 'Zoom out'}
			onclick={() => changeZoom(-1)}
		>
			−
		</button>
		{#if showFullscreen}
			<button
				type="button"
				class="btn btn-circle btn-lg bg-base-100/90 hover:bg-base-100 shadow-md"
				aria-label={fullscreen
					? $t('common.task.location_picker.exit_fullscreen') || 'Exit fullscreen'
					: $t('common.task.location_picker.enter_fullscreen') || 'Enter fullscreen'}
				onclick={toggleFullscreen}
			>
				{#if fullscreen}
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
