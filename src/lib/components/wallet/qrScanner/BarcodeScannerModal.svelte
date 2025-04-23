<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		BarcodeScanner,
		type Barcode,
		BarcodeFormat,
		LensFacing
	} from '@capacitor-mlkit/barcode-scanning';
	import { Capacitor } from '@capacitor/core';

	let {
		formats,
		lensFacing,
		onScan,
		onClose
	}: {
		formats: BarcodeFormat[];
		lensFacing: LensFacing;
		onScan: (barcode: Barcode) => void;
		onClose: () => void;
	} = $props();

	let videoElement: HTMLVideoElement = $state() as HTMLVideoElement;
	let squareElement: HTMLDivElement = $state() as HTMLDivElement;
	let isTorchAvailable = $state(false);
	let isWeb = $state(Capacitor.getPlatform() === 'web');
	let minZoomRatio: number | undefined = $state();
	let maxZoomRatio: number | undefined = $state();

	onMount(() => {
		setTimeout(() => {
			startScan().then(() => {
				BarcodeScanner.isTorchAvailable().then((result) => {
					isTorchAvailable = result.available;
				});
			});
		}, 500);
	});

	onDestroy(() => {
		stopScan();
	});

	async function startScan() {
		// Add class to hide background
		document.querySelector('body')?.classList.add('barcode-scanning-active');

		const options = {
			formats,
			lensFacing,
			videoElement: isWeb ? videoElement : undefined
		};

		// Get bounding rectangle for the scanning square
		const rect = squareElement?.getBoundingClientRect();
		const scaledRect = rect
			? {
					left: rect.left * window.devicePixelRatio,
					right: rect.right * window.devicePixelRatio,
					top: rect.top * window.devicePixelRatio,
					bottom: rect.bottom * window.devicePixelRatio,
					width: rect.width * window.devicePixelRatio,
					height: rect.height * window.devicePixelRatio
				}
			: undefined;

		// Create detection points for the rectangle
		const detectionCornerPoints = scaledRect
			? [
					[scaledRect.left, scaledRect.top],
					[scaledRect.left + scaledRect.width, scaledRect.top],
					[scaledRect.left + scaledRect.width, scaledRect.top + scaledRect.height],
					[scaledRect.left, scaledRect.top + scaledRect.height]
				]
			: undefined;

		// Listen for barcode detection
		const listener = await BarcodeScanner.addListener('barcodesScanned', async (event) => {
			const firstBarcode = event.barcodes[0];
			if (!firstBarcode) return;

			// Check if barcode is inside the scanning square
			const cornerPoints = firstBarcode.cornerPoints;
			if (detectionCornerPoints && cornerPoints && Capacitor.getPlatform() !== 'web') {
				if (
					detectionCornerPoints[0][0] > cornerPoints[0][0] ||
					detectionCornerPoints[0][1] > cornerPoints[0][1] ||
					detectionCornerPoints[1][0] < cornerPoints[1][0] ||
					detectionCornerPoints[1][1] > cornerPoints[1][1] ||
					detectionCornerPoints[2][0] < cornerPoints[2][0] ||
					detectionCornerPoints[2][1] < cornerPoints[2][1] ||
					detectionCornerPoints[3][0] > cornerPoints[3][0] ||
					detectionCornerPoints[3][1] < cornerPoints[3][1]
				) {
					return;
				}
			}

			// Remove listener and call handler
			listener.remove();
			onScan(firstBarcode);
			closeModal();
		});

		await BarcodeScanner.startScan(options);

		// Get zoom ratio limits for the camera
		if (Capacitor.getPlatform() !== 'web') {
			BarcodeScanner.getMinZoomRatio().then((result) => {
				minZoomRatio = result.zoomRatio;
			});
			BarcodeScanner.getMaxZoomRatio().then((result) => {
				maxZoomRatio = result.zoomRatio;
			});
		}
	}

	async function stopScan() {
		document.querySelector('body')?.classList.remove('barcode-scanning-active');
		await BarcodeScanner.stopScan();
	}

	async function closeModal() {
		await stopScan();
		onClose();
	}

	function setZoomRatio(event: Event) {
		const zoomRatio = parseInt((event.target as HTMLInputElement).value);
		BarcodeScanner.setZoomRatio({ zoomRatio });
	}

	function toggleTorch() {
		BarcodeScanner.toggleTorch();
	}
</script>

<div class="barcode-scanning-modal fixed inset-0 z-50">
	<div class="navbar bg-base-100">
		<div class="navbar-start">
			<span class="text-xl">Scanning</span>
		</div>
		<div class="navbar-end">
			<button aria-label="Close" class="btn btn-ghost btn-circle" onclick={closeModal}>
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
						d="M6 18L18 6M6 6l12 12"
					/>
				</svg>
			</button>
		</div>
	</div>

	<div class="relative h-full">
		{#if isWeb}
			<video bind:this={videoElement} autoplay class="absolute inset-0 h-full w-full object-cover"
			></video>
		{/if}
		<div
			bind:this={squareElement}
			class="square absolute top-1/2 left-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 transform rounded-2xl border-4 border-white shadow-[0_0_0_4000px_rgba(0,0,0,0.3)]"
		></div>

		{#if minZoomRatio !== undefined && maxZoomRatio !== undefined}
			<div class="absolute bottom-4 left-1/2 w-1/2 -translate-x-1/2 transform">
				<input
					type="range"
					min={minZoomRatio}
					max={maxZoomRatio}
					class="range"
					onchange={setZoomRatio}
				/>
			</div>
		{/if}

		{#if isTorchAvailable}
			<button
				aria-label="Toggle Torch"
				class="btn btn-circle absolute right-4 bottom-4"
				onclick={toggleTorch}
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
						d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
					/>
				</svg>
			</button>
		{/if}
	</div>
</div>

<style>
	/* Global styles needed in app.css or layout */
	:global(body.barcode-scanning-active) {
		visibility: hidden !important;
		background: transparent !important;
		--background: transparent !important;
	}

	:global(.barcode-scanning-modal) {
		visibility: visible !important;
	}
</style>
