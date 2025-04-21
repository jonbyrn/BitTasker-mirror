<script lang="ts">
	import { walletStore } from '$lib/stores/wallet.store';
	import { checkCameraPermission, requestCameraPermission, scanSingleBarcode } from '$lib/utils/helpers/wallet/qr-scanner';

	let invoice = $state('');
	let isPaying = $state(false);
	let isScanning = $state(false);
	let error = $state('');
	let success = $state(false);

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

		try {
			// Check camera permission
			const granted = await checkCameraPermission();
			
			if (!granted) {
				// Request permission if not granted
				const requested = await requestCameraPermission();
				if (!requested) {
					error = 'Camera permission is required to scan QR codes';
					return;
				}
			}

			// Scan for a single barcode
			const scannedInvoice = await scanSingleBarcode();
			
			if (scannedInvoice) {
				// Check if the scanned content is a valid Lightning invoice
				if (scannedInvoice.startsWith('lnbc')) {
					invoice = scannedInvoice;
					// Automatically pay after scanning
					await payInvoice();
				} else {
					error = 'Invalid Lightning invoice';
				}
			}
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : 'An error occurred while scanning QR code';
		} finally {
			isScanning = false;
		}
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
</div>

<style>
	:global(body.barcode-scanner-active) {
		--background: transparent;
		--ion-background-color: transparent;
	}
</style>
