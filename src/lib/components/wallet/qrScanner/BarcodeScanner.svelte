<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { BarcodeFormat, LensFacing } from '@capacitor-mlkit/barcode-scanning';
	import { Capacitor } from '@capacitor/core';
	import {
		checkCameraPermission,
		requestCameraPermission,
		isBarcodeScanningSupported,
		stopScanning,
		isTorchAvailable as checkTorchAvailable,
		toggleTorch,
		setZoomRatio,
		getMinZoomRatio,
		getMaxZoomRatio,
		startScanningWithBounds,
		applyBarcodeScannerStyles
	} from '$lib/utils/helpers/wallet/qrScanner';
	import './barcode-scanner.css';

	// Props
	const {
		title = 'Scan QR Code',
		formats = [BarcodeFormat.QrCode],
		lensFacing = LensFacing.Back,
		onScan,
		onCancel
	} = $props();

	// State variables
	let isTorchAvailable = $state(false);
	let isWeb = $state(Capacitor.getPlatform() === 'web');
	let minZoomRatio = $state<number | undefined>(undefined);
	let maxZoomRatio = $state<number | undefined>(undefined);
	let currentZoomRatio = $state(1);
	let videoElement: HTMLVideoElement = $state() as HTMLVideoElement;
	let squareElement: HTMLDivElement = $state() as HTMLDivElement;
	let listener = $state<any>(null);
	let isScanning = $state(false);
	let permissionDenied = $state(false);
	let errorMessage = $state('');
	let isVisible = $state(true);

	// Initialize when component mounts
	onMount(async () => {
		await initializeScanner();
	});

	// Clean up when component is destroyed
	onDestroy(() => {
		if (isScanning) {
			stopScan();
		}
	});

	// Initialize the scanner
	async function initializeScanner() {
		document.body.classList.add('barcode-scanning-modal');
		// Check permissions first
		const hasPermission = await checkCameraPermission();
		if (!hasPermission) {
			const granted = await requestCameraPermission();
			if (!granted) {
				console.error('Camera permission denied');
				permissionDenied = true;
				errorMessage = 'Camera permission is required to scan barcodes';
				return false;
			}
		}

		// Check if barcode scanning is supported
		const supported = await isBarcodeScanningSupported();
		console.log('Supported:', supported);
		if (!supported) {
			console.error('Barcode scanning not supported on this device');
			permissionDenied = true;
			errorMessage = 'Barcode scanning is not supported on this device';
			return false;
		}

		// Check if torch is available
		isTorchAvailable = await checkTorchAvailable();

		// Get zoom range for native platforms
		if (Capacitor.getPlatform() !== 'web') {
			try {
				minZoomRatio = await getMinZoomRatio();
				maxZoomRatio = await getMaxZoomRatio();
				console.log('Min Zoom Ratio:', minZoomRatio);
				console.log('Max Zoom Ratio:', maxZoomRatio);
			} catch (error) {
				console.error('Error getting zoom ratios:', error);
			}
		}

		// Short delay to ensure DOM is ready
		setTimeout(() => {
			startScan();
		}, 500);
	}

	// Set zoom ratio based on slider input
	function setZoomValue(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		if (!value) return;

		currentZoomRatio = parseFloat(value);
		setZoomRatio(currentZoomRatio);
	}

	// Handle scan result
	function handleResult(barcode?: any) {
		isVisible = false;
		stopScan();

		if (barcode) {
			onScan?.({ value: barcode.rawValue, format: barcode.format });
		} else {
			onCancel?.();
		}
	}

	// Toggle flashlight
	async function handleToggleTorch() {
		await toggleTorch();
	}

	// Start barcode scanning
	async function startScan() {
		try {
			isScanning = true;

			// Apply styles to make background transparent
			applyBarcodeScannerStyles();

			// Start scanning with detection bounds
			const result = await startScanningWithBounds(
				formats,
				lensFacing,
				isWeb ? videoElement : undefined,
				squareElement,
				(barcode) => {
					handleResult(barcode);
				}
			);

			listener = result.listener;
		} catch (error) {
			console.error('Error starting barcode scanner:', error);
			errorMessage = 'Failed to start barcode scanner';
			permissionDenied = true;
			stopScan();
		}
	}

	// Stop barcode scanning
	async function stopScan() {
		isScanning = false;
		await stopScanning(listener);
		listener = null;
	}
</script>

{#if isVisible}
	<div class="barcode-scanner-modal fixed inset-0 z-50">
		<div class="flex h-full w-full flex-col">
			<header class="relative z-[1001] flex items-center justify-between bg-black/70 p-4">
				<div class="text-lg font-semibold text-white">{title}</div>
				<button
					aria-label="Close"
					class="cursor-pointer rounded-full border-none bg-transparent p-2 text-white"
					onclick={() => handleResult()}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<line x1="18" y1="6" x2="6" y2="18"></line>
						<line x1="6" y1="6" x2="18" y2="18"></line>
					</svg>
				</button>
			</header>

			{#if permissionDenied}
				<div class="bg-base-200 flex h-full flex-col items-center justify-center p-4">
					<div class="text-error mb-4 text-xl">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mx-auto mb-4 h-12 w-12"
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
						<p class="text-center">{errorMessage}</p>
					</div>
					<button aria-label="Close" class="btn btn-primary" onclick={() => handleResult()}>
						Close
					</button>
				</div>
			{:else}
				<div class="scanner-content relative flex-1 overflow-hidden">
					{#if isWeb}
						<video
							bind:this={videoElement}
							autoplay
							class="absolute inset-0 h-full w-full object-cover"
						></video>
					{/if}

					<div
						bind:this={squareElement}
						class="absolute top-1/2 left-1/2 h-[200px] w-[200px] -translate-x-1/2 -translate-y-1/2 transform rounded-[16px] border-[6px] border-white shadow-[0_0_0_4000px_rgba(0,0,0,0.3)]"
					></div>

					<div class="absolute bottom-16 left-1/2 w-1/2 -translate-x-1/2 transform">
						{#if minZoomRatio !== undefined && maxZoomRatio !== undefined}
							<input
								type="range"
								min={minZoomRatio}
								max={maxZoomRatio}
								step="0.1"
								value={currentZoomRatio}
								oninput={setZoomValue}
								class="m-0 w-full"
							/>
						{/if}
					</div>

					{#if isTorchAvailable}
						<button
							aria-label="Toggle Torch"
							class="bg-primary absolute right-4 bottom-4 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border-none text-white shadow-lg"
							onclick={handleToggleTorch}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="h-6 w-6"
							>
								<path
									d="M9 18h6M10 22h4M12 2v4M4.93 10H2M22 10h-2.93M17.66 6.34l2.83-2.83M3.51 20.49l2.83-2.83M6.34 6.34L3.51 3.51M20.49 20.49l-2.83-2.83M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
								></path>
							</svg>
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}
