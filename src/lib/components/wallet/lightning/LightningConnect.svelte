<script lang="ts">
	import { walletStore } from '$lib/stores/wallet.store';
	import {
		checkCameraPermission,
		requestCameraPermission,
		isBarcodeScanningSupported
	} from '$lib/utils/helpers/wallet/qrScanner';
	import BarcodeScanner from '$lib/components/wallet/qrScanner/BarcodeScanner.svelte';

	let nwcUrl = $state('');
	let isConnecting = $state(false);
	let isScanning = $state(false);
	let error = $state('');
	let debugInfo = $state('');
	let showScanner = $state(false);

	async function connectWallet() {
		isConnecting = true;
		error = '';

		try {
			const success = await walletStore.connectLightningWallet(nwcUrl);
			if (!success) {
				error = 'Failed to connect to Lightning wallet';
			}
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : 'An error occurred while connecting';
		} finally {
			isConnecting = false;
		}
	}

	async function scanQRCode() {
		isScanning = true;
		error = '';
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

			// Scan for a single barcode
			// 	debugInfo = `${debugInfo}\nStarting barcode scan...`;
			//     const scannedUrl = await scanSingleBarcode();
			//     debugInfo = `${debugInfo}\nScan completed. Result: ${scannedUrl ? 'Success' : 'No barcode detected'}`;

			//     if (scannedUrl) {
			//         // Check if the scanned content is a valid NWC URL
			//         if (scannedUrl.startsWith('nostr+walletconnect://')) {
			//             nwcUrl = scannedUrl;
			//             // Automatically connect after scanning
			//             await connectWallet();
			//         } else {
			//             error = 'Invalid Nostr Wallet Connect URL';
			//             debugInfo = `${debugInfo}\nInvalid content: ${scannedUrl.substring(0, 10)}...`;
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

			// Show scanner modal
			showScanner = true;
		} catch (err: unknown) {
			const message =
				err instanceof Error ? err.message : 'An error occurred while scanning QR code';
			error = message;
			debugInfo = `${debugInfo}\nError: ${message}`;
			console.error('QR scan error:', err);
		} finally {
			isScanning = false;
		}
	}

	// Handle scan result
	function handleScan({ value, format }: { value: string; format: string }) {
		const scannedUrl = value;
		debugInfo = `${debugInfo}\nScan completed. Result: ${scannedUrl ? 'Success' : 'No barcode detected'}`;

		if (scannedUrl) {
			// Check if the scanned content is a valid NWC URL
			if (scannedUrl.startsWith('nostr+walletconnect://')) {
				nwcUrl = scannedUrl;
				// Automatically connect after scanning
				connectWallet();
			} else {
				error = 'Invalid Nostr Wallet Connect URL';
				debugInfo = `${debugInfo}\nInvalid content: ${scannedUrl.substring(0, 10)}...`;
			}
		} else {
			error = 'No QR code detected or scan was canceled';
		}

		// Close scanner
		showScanner = false;
	}

	// Handle when the user cancels scanning
	function handleScanCancel() {
		debugInfo = `${debugInfo}\nScan canceled by user`;
		showScanner = false;
	}
</script>

<div class="p-4">
	<h2 class="mb-4 text-xl font-bold">Connect Lightning Wallet</h2>

	<div class="mb-4">
		<label for="nwc-url" class="mb-1 block text-sm font-medium">Nostr Wallet Connect URL</label>
		<input
			id="nwc-url"
			type="text"
			bind:value={nwcUrl}
			placeholder="nostr+walletconnect://..."
			class="w-full rounded border p-2"
		/>
	</div>

	<div class="flex gap-2">
		<button onclick={connectWallet} disabled={isConnecting || !nwcUrl} class="btn btn-primary">
			{#if isConnecting}
				Connecting...
			{:else}
				Connect Wallet
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

	{#if debugInfo}
		<div
			class="mt-4 rounded border border-gray-300 bg-gray-500 p-2 font-mono text-xs whitespace-pre-wrap"
		>
			<p class="mb-1 text-sm font-semibold">Debug Info:</p>
			{debugInfo}
		</div>
	{/if}
</div>

{#if showScanner}
	<BarcodeScanner
		title="Scan Wallet Connect QR Code"
		onScan={handleScan}
		onCancel={handleScanCancel}
	/>
{/if}
