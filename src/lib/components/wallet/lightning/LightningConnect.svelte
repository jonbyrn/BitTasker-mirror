<script lang="ts">
	import { walletStore } from '$lib/stores/wallet.store';
	import { requestProvider } from '@getalby/bitcoin-connect';
	import { checkCameraPermission, requestCameraPermission, scanSingleBarcode } from '$lib/utils/helpers/wallet/qr-scanner';

	let nwcUrl = $state('');
	let isConnecting = $state(false);
	let isScanning = $state(false);
	let error = $state('');

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
			const scannedUrl = await scanSingleBarcode();
			
			if (scannedUrl) {
				// Check if the scanned content is a valid NWC URL
				if (scannedUrl.startsWith('nostr+walletconnect://')) {
					nwcUrl = scannedUrl;
					// Automatically connect after scanning
					await connectWallet();
				} else {
					error = 'Invalid Nostr Wallet Connect URL';
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
</div>

<style>
	:global(body.barcode-scanner-active) {
		--background: transparent;
		--ion-background-color: transparent;
	}
</style>
