<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';
	import {
		BarcodeScanner,
		type Barcode,
		BarcodeFormat,
		LensFacing
	} from '@capacitor-mlkit/barcode-scanning';
	import { Capacitor } from '@capacitor/core';

	let {
		formats = [BarcodeFormat.QrCode],
		lensFacing = LensFacing.Back,
		onScan = () => {},
		onClose = () => {},
		scanBtn,
		permissionsBtn
	}: {
		formats?: BarcodeFormat[];
		lensFacing?: LensFacing;
		onScan?: (barcode: Barcode) => void;
		onClose?: () => void;
		scanBtn?: import('svelte').Snippet<[{ disabled: boolean; onStartScan: () => void }]>;
		permissionsBtn?: import('svelte').Snippet<
			[{ disabled: boolean; onRequest: () => void; isPermissionGranted: boolean }]
		>;
	} = $props();

	let videoElement: HTMLVideoElement = $state() as HTMLVideoElement;
	let squareElement: HTMLDivElement = $state() as HTMLDivElement;
	let isTorchAvailable = $state(false);
	let isWeb = $state(Capacitor.getPlatform() === 'web');
	let minZoomRatio: number | undefined = $state();
	let maxZoomRatio: number | undefined = $state();
	let isSupported = $state(false);
	let isPermissionGranted = $state(false);
	let disabled = $state(false);
	let showScanner = $state(false);

	onMount(async () => {
		const { supported } = await BarcodeScanner.isSupported();
		isSupported = supported;

		const { camera } = await BarcodeScanner.checkPermissions();
		isPermissionGranted = camera === 'granted';

		// Auto-start if no scanBtn is provided (used in SendPaymentForm)
		if (!scanBtn) {
			// Wait a bit for parent component to be ready and DOM to be stable
			await new Promise(resolve => setTimeout(resolve, 800));
			await startScan();
		}
	});

	onDestroy(() => {
		stopScan();
	});

	async function requestPermissions() {
		if (!isSupported) return;
		const { camera } = await BarcodeScanner.requestPermissions();
		isPermissionGranted = camera === 'granted';
	}

	async function startScan() {
		// Check if permissions are granted
		if (!isPermissionGranted) await requestPermissions();

		showScanner = true;
		// Add class to hide background
		document.querySelector('body')?.classList.add('barcode-scanning-active');

		// Reset any background colors that might be applied by DaisyUI
		document.documentElement.style.setProperty('--color-base-100', 'transparent');
		document.documentElement.style.setProperty('--background', 'transparent');

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

		BarcodeScanner.isTorchAvailable().then((result) => {
			isTorchAvailable = result.available;
		});
	}

	async function stopScan() {
		showScanner = false;
		document.querySelector('body')?.classList.remove('barcode-scanning-active');

		// Restore original theme variables
		document.documentElement.style.removeProperty('--color-base-100');
		document.documentElement.style.removeProperty('--background');

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

{@render scanBtn?.({ disabled, onStartScan: startScan })}
{@render permissionsBtn?.({ disabled, onRequest: requestPermissions, isPermissionGranted })}

{#if showScanner}
	<div class="barcode-scanning-modal fixed inset-0 z-[9999]">
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

		<div class="relative h-full">
			{#if isWeb}
				<video
					bind:this={videoElement}
					autoplay
					class="absolute inset-0 h-full w-full object-cover"
				>
					<track kind="captions" label="English" srclang="en" default />
				</video>
			{/if}
			<div
				bind:this={squareElement}
				class="square absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-[75%] transform rounded-2xl border-4 border-white shadow-[0_0_0_4000px_rgba(0,0,0,0.5)]"
			></div>

			{#if minZoomRatio !== undefined && maxZoomRatio !== undefined}
				<div class="absolute bottom-4 left-1/2 w-1/2 -translate-x-1/2 transform">
					<input
						type="range"
						min={minZoomRatio}
						max={maxZoomRatio}
						class="range"
						value={minZoomRatio}
						oninput={setZoomRatio}
					/>
				</div>
			{/if}

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
	/* Enhanced global styles for barcode scanner */
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
	}

	/* Ensure video display */
	video {
		object-fit: cover !important;
		width: 100% !important;
		height: 100% !important;
		background: transparent !important;
	}

	/* Override any DaisyUI styles that might affect the scanner */
	/* :global(body.barcode-scanning-active *) {
		--background: transparent;
	}

	:global(body.barcode-scanning-active .barcode-scanning-modal *) {
		visibility: visible !important;
	} */
</style>
