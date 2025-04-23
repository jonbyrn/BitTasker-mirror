<script lang="ts">
	import { walletStore } from '$lib/stores/wallet.store';
	import { checkCameraPermission, requestCameraPermission, isBarcodeScanningSupported } from '$lib/utils/helpers/wallet/qr-scanner';
	import BarcodeScanner from '$lib/components/wallet/qrScanner/BarcodeScanner.svelte';

	let invoice = $state('');
	let isPaying = $state(false);
	let isScanning = $state(false);
	let error = $state('');
	let success = $state(false);
	let debugInfo = $state('');
	let showScanner = $state(false);

	async function payInvoice() {
		isPaying = true;
		error = '';
		success = false;

		try {
			const walletState = $walletStore;
			if (!walletState.isInitialized) {
				throw new Error('Wallet is not initialized');
			}

			// Pay the invoice
			await walletStore.payLightningInvoice(invoice);
			success = true;
			invoice = ''; // Clear the invoice after successful payment
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : 'Failed to pay invoice';
		} finally {
			isPaying = false;
		}
	}

	async function scanQRCode() {
		isScanning = true;
		error = '';
		success = false;
		debugInfo = 'Starting scan...';

		try {
			// Check if barcode scanning is supported on this device
			const supported = await isBarcodeScanningSupported();
			debugInfo = `Barcode scanning supported: ${supported}`;
			
			if (!supported) {
				error = 'Barcode scanning is not supported on this device';
				return;
			}
			
			// Check camera permission
			const granted = await checkCameraPermission();
			debugInfo = `${debugInfo}\nCamera permission: ${granted}`;
			
			if (!granted) {
				// Request permission if not granted
				debugInfo = `${debugInfo}\nRequesting camera permission...`;
				const requested = await requestCameraPermission();
				debugInfo = `${debugInfo}\nPermission request result: ${requested}`;
				
				if (!requested) {
					error = 'Camera permission is required to scan QR codes';
					return;
				}
			}

		// 	// Scan for a single barcode
        //     debugInfo = `${debugInfo}\nStarting barcode scan...`;
        //     const scannedInvoice = await scanSingleBarcode();
        //     debugInfo = `${debugInfo}\nScan completed. Result: ${scannedInvoice ? 'Success' : 'No barcode detected'}`;
            
        //     if (scannedInvoice) {
        //         // Check if the scanned content is a valid Lightning invoice
        //         if (scannedInvoice.startsWith('lnbc')) {
        //             invoice = scannedInvoice;
        //             // Automatically pay after scanning
        //             await payInvoice();
        //         } else {
        //             error = 'Invalid Lightning invoice';
        //             debugInfo = `${debugInfo}\nInvalid content: ${scannedInvoice.substring(0, 10)}...`;
        //         }
        //     } else {
        //         error = 'No QR code detected or scan was canceled';
        //     }
        // } catch (err: unknown) {
        //     const message = err instanceof Error ? err.message : 'An error occurred while scanning QR code';
        //     error = message;
        //     debugInfo = `${debugInfo}\nError: ${message}`;
        //     console.error('QR scan error:', err);
        // }

			// Show the scanner modal
			showScanner = true;
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'An error occurred while scanning QR code';
			error = message;
			debugInfo = `${debugInfo}\nError: ${message}`;
			console.error('QR scan error:', err);
		} finally {
			isScanning = false;
		}
	}

	// Handle the scan result from the scanner modal
	function handleScan(event: CustomEvent) {
		const scannedInvoice = event.detail.value;
		debugInfo = `${debugInfo}\nScan completed. Result: ${scannedInvoice ? 'Success' : 'No barcode detected'}`;
		
		if (scannedInvoice) {
			// Check if the scanned content is a valid Lightning invoice
			if (scannedInvoice.startsWith('lnbc')) {
				invoice = scannedInvoice;
				// Automatically pay after scanning
				payInvoice();
			} else {
				error = 'Invalid Lightning invoice';
				debugInfo = `${debugInfo}\nInvalid content: ${scannedInvoice.substring(0, 10)}...`;
			}
		} else {
			error = 'No QR code detected or scan was canceled';
		}
		
		// Close the scanner
		showScanner = false;
	}

	// Handle when the user cancels scanning
	function handleScanCancel() {
		debugInfo = `${debugInfo}\nScan canceled by user`;
		showScanner = false;
	}
</script>

<div class="p-4">
	<h2 class="mb-4 text-xl font-bold">Pay Lightning Invoice</h2>

	<div class="mb-4">
		<label for="invoice" class="mb-1 block text-sm font-medium">Lightning Invoice</label>
		<input
			id="invoice"
			type="text"
			bind:value={invoice}
			placeholder="lnbc..."
			class="w-full rounded border p-2"
		/>
	</div>

	<div class="flex gap-2">
		<button onclick={payInvoice} disabled={isPaying || !invoice} class="btn btn-primary">
			{#if isPaying}
				Paying...
			{:else}
				Pay Invoice
			{/if}
		</button>

		<button onclick={scanQRCode} disabled={isScanning} class="btn btn-secondary">
			{#if isScanning}
				Scanning...
			{:else}
				Scan QR Code
			{/if}
		</button>
	</div>

	{#if error}
		<div class="mt-4 rounded bg-red-100 p-2 text-red-700">
			{error}
		</div>
	{/if}

	{#if success}
		<div class="mt-4 rounded bg-green-100 p-2 text-green-700">
			Payment successful!
		</div>
	{/if}
	
	{#if import.meta.env.DEV && debugInfo}
		<div class="mt-4 p-2 border border-gray-300 rounded bg-gray-50 text-xs font-mono whitespace-pre-wrap">
			<p class="text-sm font-semibold mb-1">Debug Info:</p>
			{debugInfo}
		</div>
	{/if}
</div>

{#if showScanner}
	<BarcodeScanner 
		title="Scan Lightning Invoice"
		onScan={handleScan}
		onCancel={handleScanCancel}
	/>
{/if}