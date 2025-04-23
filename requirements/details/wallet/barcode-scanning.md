# Barcode Scanning Implementation

This project uses the Capacitor MLKit Barcode Scanning plugin (@capacitor-mlkit/barcode-scanning) to implement barcode scanning functionality. The implementation consists of:

1. A modal component for the camera view and scanning functionality
2. CSS classes for handling the UI during scanning
3. Integration with the native barcode scanning capabilities

## CSS Classes Explanation

1. `barcode-scanning-modal` - Applied to the modal to ensure it remains visible while everything else is hidden during scanning:

   ```css
   .barcode-scanning-modal {
   	visibility: visible;
   }
   ```

2. `barcode-scanning-active` - Added to the body element when scanning starts to hide everything behind the modal:
   ```css
   body.barcode-scanning-active {
   	visibility: hidden;
   	--background: transparent;
   	--ion-background-color: transparent;
   }
   ```

These classes work together - when scanning starts, the body gets the `barcode-scanning-active` class that hides everything, while the modal gets the `barcode-scanning-modal` class that ensures it remains visible.

# Implementation in SvelteKit with Capacitor, TailwindCSS and DaisyUI

## Step 1: Install Dependencies

```bash
npm install @capacitor-mlkit/barcode-scanning
npx cap sync
```

## Step 2: Add Camera Permissions

### iOS (capacitor.config.ts)

```typescript
export default defineConfig({
	plugins: {
		CapacitorMLKitBarcodeScanning: {
			// Config options if needed
		}
	}
});
```

### iOS (Info.plist)

```xml
<key>NSCameraUsageDescription</key>
<string>The app needs camera access to scan barcodes</string>
```

### Android (AndroidManifest.xml)

```xml
<uses-feature android:name="android.hardware.camera" android:required="false" />
<meta-data android:name="com.google.mlkit.vision.DEPENDENCIES" android:value="barcode_ui" />
```

## Step 3: Create Barcode Scanner Component

Create a SvelteKit component (`BarcodeScannerModal.svelte`):

```svelte
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		BarcodeScanner,
		Barcode,
		BarcodeFormat,
		LensFacing
	} from '@capacitor-mlkit/barcode-scanning';
	import { Capacitor } from '@capacitor/core';

	export let formats: BarcodeFormat[] = [];
	export let lensFacing: LensFacing = LensFacing.Back;
	export let onScan: (barcode: Barcode) => void;
	export let onClose: () => void;

	let videoElement: HTMLVideoElement;
	let squareElement: HTMLDivElement;
	let isTorchAvailable = false;
	let isWeb = Capacitor.getPlatform() === 'web';
	let minZoomRatio: number | undefined;
	let maxZoomRatio: number | undefined;

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

	function setZoomRatio(event) {
		const zoomRatio = parseInt(event.target.value);
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
			<button class="btn btn-ghost btn-circle" on:click={closeModal}>
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
					on:change={setZoomRatio}
				/>
			</div>
		{/if}

		{#if isTorchAvailable}
			<button class="btn btn-circle absolute right-4 bottom-4" on:click={toggleTorch}>
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
		visibility: hidden;
		background: transparent;
	}

	.barcode-scanning-modal {
		visibility: visible;
	}
</style>
```

## Step 4: Create Main Scanner Page

Create a page to control the scanner (`+page.svelte`):

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		BarcodeScanner,
		BarcodeFormat,
		LensFacing,
		type Barcode
	} from '@capacitor-mlkit/barcode-scanning';
	import BarcodeScannerModal from '$lib/components/BarcodeScannerModal.svelte';

	let isSupported = false;
	let isPermissionGranted = false;
	let showScanner = false;
	let barcodes: Barcode[] = [];

	// Form values
	let selectedFormats: BarcodeFormat[] = [];
	let selectedLensFacing: LensFacing = LensFacing.Back;

	onMount(async () => {
		const { supported } = await BarcodeScanner.isSupported();
		isSupported = supported;

		const { camera } = await BarcodeScanner.checkPermissions();
		isPermissionGranted = camera === 'granted';
	});

	async function startScan() {
		showScanner = true;
	}

	async function requestPermissions() {
		const { camera } = await BarcodeScanner.requestPermissions();
		isPermissionGranted = camera === 'granted';
	}

	function handleScan(barcode: Barcode) {
		barcodes = [barcode];
		showScanner = false;
	}

	function closeScanner() {
		showScanner = false;
	}
</script>

<div class="container mx-auto p-4">
	<div class="card bg-base-200 mb-4 shadow-xl">
		<div class="card-body">
			<h2 class="card-title">Barcode Scanner</h2>
			<p>Scan QR codes and barcodes with your camera</p>
		</div>
	</div>

	<div class="card bg-base-200 shadow-xl">
		<div class="card-body">
			<h2 class="card-title">Scanner Options</h2>

			<div class="form-control">
				<label class="label">
					<span class="label-text">Barcode Formats</span>
				</label>
				<select class="select select-bordered" multiple bind:value={selectedFormats}>
					<option value={BarcodeFormat.QrCode}>QR Code</option>
					<option value={BarcodeFormat.Aztec}>Aztec</option>
					<option value={BarcodeFormat.Code128}>Code 128</option>
					<option value={BarcodeFormat.Code39}>Code 39</option>
					<option value={BarcodeFormat.Code93}>Code 93</option>
					<option value={BarcodeFormat.DataMatrix}>Data Matrix</option>
					<option value={BarcodeFormat.Ean13}>EAN-13</option>
					<option value={BarcodeFormat.Ean8}>EAN-8</option>
					<option value={BarcodeFormat.Itf}>ITF</option>
					<option value={BarcodeFormat.Pdf417}>PDF417</option>
					<option value={BarcodeFormat.UpcA}>UPC-A</option>
					<option value={BarcodeFormat.UpcE}>UPC-E</option>
				</select>
			</div>

			<div class="form-control">
				<label class="label">
					<span class="label-text">Camera</span>
				</label>
				<select class="select select-bordered" bind:value={selectedLensFacing}>
					<option value={LensFacing.Back}>Back Camera</option>
					<option value={LensFacing.Front}>Front Camera</option>
				</select>
			</div>

			<div class="mt-4 flex flex-col gap-2">
				<button class="btn btn-primary" on:click={startScan} disabled={!isSupported}>
					Start Scan
				</button>

				<button
					class="btn btn-secondary"
					on:click={requestPermissions}
					disabled={isPermissionGranted}
				>
					Request Permissions
				</button>
			</div>
		</div>
	</div>

	{#if barcodes.length > 0}
		<div class="card bg-base-200 mt-4 shadow-xl">
			<div class="card-body">
				<h2 class="card-title">Scan Result</h2>

				<div class="overflow-x-auto">
					<table class="table">
						<tbody>
							<tr>
								<td>Format</td>
								<td>{barcodes[0].format}</td>
							</tr>
							<tr>
								<td>Value</td>
								<td>{barcodes[0].rawValue}</td>
							</tr>
							<tr>
								<td>Display Value</td>
								<td>{barcodes[0].displayValue}</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		</div>
	{/if}
</div>

{#if showScanner}
	<BarcodeScannerModal
		formats={selectedFormats}
		lensFacing={selectedLensFacing}
		onScan={handleScan}
		onClose={closeScanner}
	/>
{/if}
```

## Step 5: Add Global Styles

In your global CSS file, add the following:

```css
/* app.css or wherever your global styles live */
body.barcode-scanning-active {
	visibility: hidden;
	background: transparent;
}

.barcode-scanning-modal {
	visibility: visible;
}
```

This implementation follows the same pattern as the original project but adapts it for SvelteKit with TailwindCSS and DaisyUI. The core functionality remains the same:

1. Use @capacitor-mlkit/barcode-scanning for barcode detection
2. Create a modal overlay for camera scanning
3. Use CSS classes to hide everything except the scanner while active
4. Detect when barcodes are within a designated scanning area
