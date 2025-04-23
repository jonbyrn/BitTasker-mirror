<script lang="ts">
	import { onMount } from 'svelte';
	import {
		BarcodeScanner,
		BarcodeFormat,
		LensFacing,
		type Barcode
	} from '@capacitor-mlkit/barcode-scanning';
	import BarcodeScannerModal from '$lib/components/wallet/qrScanner/BarcodeScannerModal.svelte';

	let isSupported = $state(false);
	let isPermissionGranted = $state(false);
	let showScanner = $state(false);
	let barcodes: Barcode[] = $state([]);

	// Form values
	let selectedFormats: BarcodeFormat[] = $state([]);
	let selectedLensFacing: LensFacing = $state(LensFacing.Back);

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
				<button class="btn btn-primary" onclick={startScan} disabled={!isSupported}>
					Start Scan
				</button>

				<button
					class="btn btn-secondary"
					onclick={requestPermissions}
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
