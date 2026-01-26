<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { t } from 'svelte-i18n';
	import { Html5Qrcode, type Html5QrcodeCameraScanConfig } from 'html5-qrcode';
	import { Capacitor } from '@capacitor/core';
	import {
		BarcodeScanner,
		type Barcode,
		BarcodeFormat,
		LensFacing
	} from '@capacitor-mlkit/barcode-scanning';

	let {
		onScan = () => {},
		onClose = () => {},
		onError = () => {}
	}: {
		onScan?: (scannedText: string) => void;
		onClose?: () => void;
		onError?: (error: string) => void;
	} = $props();

	let showModal = $state(false);
	let isWeb = $state(Capacitor.getPlatform() === 'web');
	let html5QrCode: Html5Qrcode | null = $state(null);
	let squareElement: HTMLDivElement = $state() as HTMLDivElement;
	let isTorchAvailable = $state(false);
	let isSupported = $state(false);
	let scanning = $state(false);

	onDestroy(() => {
		stopScan();
	});

	async function startScan() {
		if (scanning) return;

		try {
			scanning = true;
			showModal = true;

			// Wait for DOM to update so the qr-reader element is available
			await tick();

			// Wait a bit for parent component to be ready and DOM to be stable
			await new Promise(resolve => setTimeout(resolve, 800));

			if (isWeb) {
				await startWebScan();
			} else {
				await startCapacitorScan();
			}
		} catch (error) {
			console.error('Error starting scan:', error);
			onError(error instanceof Error ? error.message : 'Failed to start scanner');
			stopScan();
		}
	}

	async function startWebScan() {
		try {
			// Verify the element exists before initializing
			const qrReaderElement = document.getElementById('qr-reader');
			if (!qrReaderElement) {
				throw new Error('QR reader element not found');
			}

			html5QrCode = new Html5Qrcode('qr-reader');
			
			// Use a function-based qrbox that receives viewfinder dimensions
			// This ensures the qrbox is calculated based on the actual camera viewfinder size
			// Set to 80% of the viewfinder for better scanning area
			const qrboxFunction = (viewfinderWidth: number, viewfinderHeight: number) => {
				// Calculate 80% of the smaller dimension
				const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
				const qrboxSize = Math.max(Math.floor(minEdgeSize * 0.8), 50); // Minimum 50px required
				
				console.log('[QR Scanner] Viewfinder dimensions:', { viewfinderWidth, viewfinderHeight });
				console.log('[QR Scanner] Calculated qrbox size:', qrboxSize);
				
				return {
					width: qrboxSize,
					height: qrboxSize
				};
			};
			
			const config: Html5QrcodeCameraScanConfig = {
				fps: 20, // Higher FPS for faster detection and better reliability
				qrbox: qrboxFunction, // Use function to calculate based on viewfinder dimensions
				aspectRatio: 1.0,
				disableFlip: false, // Allow flipping for better detection
				showTorchButtonIfSupported: false, // Hide torch button (we have our own)
				showZoomSliderIfSupported: false // Hide zoom slider
			};

			// html5-qrcode will request camera permissions automatically when start() is called
			await html5QrCode.start(
				{ facingMode: 'environment' },
				config,
				(decodedText) => {
					// Successfully scanned - trim whitespace before passing to handler
					const trimmedText = decodedText.trim();
					console.log('[QR Scanner] Scanned text (raw):', decodedText);
					console.log('[QR Scanner] Scanned text (trimmed):', trimmedText);
					console.log('[QR Scanner] Text length:', trimmedText.length);
					onScan(trimmedText);
					stopScan();
				},
				(errorMessage) => {
					// Log scanning errors for debugging, but don't stop scanning
					// Only log if it's not a common "not found" error
					if (!errorMessage.includes('No QR code found')) {
						console.debug('[QR Scanner] Scanning error:', errorMessage);
					}
				}
			);

			// Force video created by html5-qrcode to play to avoid play button overlay
			await tick();
			const html5Video = document.querySelector('#qr-reader video') as HTMLVideoElement;
			if (html5Video) {
				try {
					html5Video.muted = true;
					html5Video.playsInline = true;
					await html5Video.play().catch((err) => {
						console.debug('html5-qrcode video autoplay prevented:', err);
					});
				} catch (err) {
					console.debug('Error playing html5-qrcode video:', err);
				}
			}
		} catch (error) {
			console.error('Error starting web scan:', error);
			onError(error instanceof Error ? error.message : 'Failed to access camera');
			stopScan();
		}
	}

	async function startCapacitorScan() {
		// Check if supported (only when user opens modal)
		if (!isSupported) {
			const { supported } = await BarcodeScanner.isSupported();
			isSupported = supported;
			if (!isSupported) {
				onError('QR code scanning is not supported on this device');
				stopScan();
				return;
			}
		}

		// Check and request permissions only when user opens modal
		const { camera } = await BarcodeScanner.checkPermissions();
		if (camera !== 'granted') {
			const { camera: requestedCamera } = await BarcodeScanner.requestPermissions();
			if (requestedCamera !== 'granted') {
				onError('Camera permission denied');
				stopScan();
				return;
			}
		}

		// Add class to hide background
		document.querySelector('body')?.classList.add('barcode-scanning-active');

		// Reset any background colors that might be applied by DaisyUI
		document.documentElement.style.setProperty('--color-base-100', 'transparent');
		document.documentElement.style.setProperty('--background', 'transparent');

		const options = {
			formats: [BarcodeFormat.QrCode],
			lensFacing: LensFacing.Back
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
			if (detectionCornerPoints && cornerPoints) {
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
			// Trim whitespace from scanned text
			const scannedText = firstBarcode.displayValue.trim();
			console.log('[QR Scanner] Scanned text (raw):', firstBarcode.displayValue);
			console.log('[QR Scanner] Scanned text (trimmed):', scannedText);
			console.log('[QR Scanner] Text length:', scannedText.length);
			onScan(scannedText);
			closeModal();
		});

		await BarcodeScanner.startScan(options);

		// Get zoom ratio limits for the camera
		BarcodeScanner.getMinZoomRatio().then((result) => {
			// minZoomRatio = result.zoomRatio;
		});
		BarcodeScanner.getMaxZoomRatio().then((result) => {
			// maxZoomRatio = result.zoomRatio;
		});

		BarcodeScanner.isTorchAvailable().then((result) => {
			isTorchAvailable = result.available;
		});
	}

	async function stopScan() {
		scanning = false;
		showModal = false;
		document.querySelector('body')?.classList.remove('barcode-scanning-active');

		// Restore original theme variables
		document.documentElement.style.removeProperty('--color-base-100');
		document.documentElement.style.removeProperty('--background');

		if (isWeb) {
			// Web: stop html5-qrcode
			if (html5QrCode) {
				try {
					await html5QrCode.stop();
					await html5QrCode.clear();
				} catch (error) {
					console.error('Error stopping html5-qrcode:', error);
				}
				html5QrCode = null;
			}
		} else {
			// Native: stop Capacitor scanner
			try {
				await BarcodeScanner.stopScan();
			} catch (error) {
				// Only log if it's not a platform availability error
				if (error instanceof Error && !error.message.includes('not available on this platform')) {
					console.error('Error stopping Capacitor scanner:', error);
				}
			}
		}
	}

	function closeModal() {
		stopScan();
		onClose();
	}

	function toggleTorch() {
		if (!isWeb) {
			BarcodeScanner.toggleTorch();
		}
	}

	// Expose startScan function
	export function open() {
		startScan();
	}
</script>

{#if showModal}
	<div class="barcode-scanning-modal fixed inset-0 z-[9999]">
		<!-- Header - same style as QrCodeScanner -->
		<header class="relative z-[1001] flex items-center justify-between bg-black/70 p-4">
			<div class="text-lg font-semibold text-white">{$t('common.components.qr_scanner.scan_qr_code')}</div>
			<button
				aria-label={$t('common.components.qr_scanner.close')}
				class="btn btn-circle cursor-pointer rounded-full p-2 text-white"
				onclick={closeModal}
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

		<!-- Scanner Area - same structure as QrCodeScanner -->
		<div class="relative h-full">
			{#if isWeb}
				<!-- Web: html5-qrcode -->
				<div id="qr-reader" class="w-full h-full"></div>
			{/if}
			<div
				bind:this={squareElement}
				class="square absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-[75%] transform rounded-2xl border-4 border-white shadow-[0_0_0_4000px_rgba(0,0,0,0.5)]"
			></div>

			<!-- Info Alert - positioned at bottom -->
			<div class="absolute bottom-20 left-1/2 -translate-x-1/2 z-[1002] px-4 w-full max-w-md">
				<div class="alert alert-outline alert-info">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6 shrink-0 stroke-current"
						fill="none"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<span class="text-sm">{@html $t('common.components.qr_scanner.get_qr_from_settings')}</span>
				</div>
			</div>

			<!-- Torch button (mobile only) - same position as QrCodeScanner -->
			{#if !isWeb && isTorchAvailable}
				<button
					aria-label={$t('common.components.qr_scanner.toggle_torch')}
					class="btn btn-circle absolute top-4 right-4"
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
{/if}

<style>
	/* Enhanced global styles for barcode scanner - same as QrCodeScanner.svelte */
	:global(body.barcode-scanning-active) {
		visibility: hidden !important;
		background: transparent !important;
		--background: transparent !important;
		--color-base-100: transparent !important;
		overflow: hidden !important;
	}

	:global(.barcode-scanning-modal) {
		visibility: visible !important;
		position: fixed !important;
		top: 0 !important;
		left: 0 !important;
		width: 100% !important;
		height: 100% !important;
		background: transparent !important;
		backdrop-filter: none !important;
		display: flex !important;
		flex-direction: column !important;
		z-index: 9999 !important;
	}

	:global(#qr-reader) {
		width: 100% !important;
		height: 100% !important;
	}

	:global(#qr-reader__dashboard) {
		display: none !important;
	}

	:global(#qr-reader__scan_region) {
		width: 100% !important;
		height: 100% !important;
	}

	:global(#qr-reader__camera_selection) {
		display: none !important;
	}

	:global(#qr-reader__dashboard_section_csr) {
		display: none !important;
	}

	/* Hide video controls created by html5-qrcode */
	:global(#qr-reader video) {
		pointer-events: none !important;
	}

	:global(#qr-reader video::-webkit-media-controls),
	:global(#qr-reader video::-webkit-media-controls-enclosure),
	:global(#qr-reader video::-webkit-media-controls-panel),
	:global(#qr-reader video::-webkit-media-controls-play-button),
	:global(#qr-reader video::-webkit-media-controls-start-playback-button) {
		display: none !important;
	}

	.square {
		pointer-events: none;
	}
</style>
