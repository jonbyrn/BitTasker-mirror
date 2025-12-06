<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';
	import { Html5Qrcode, type Html5QrcodeResult } from 'html5-qrcode';
	import { Capacitor } from '@capacitor/core';

	let {
		onScan = () => {},
		onClose = () => {},
		onError = () => {}
	}: {
		onScan?: (result: string) => void;
		onClose?: () => void;
		onError?: (error: string) => void;
	} = $props();

	let scannerContainer: HTMLDivElement = $state() as HTMLDivElement;
	let html5QrCode: Html5Qrcode | null = $state(null);
	let isScanning = $state(false);
	let errorMessage = $state<string | null>(null);
	let cameraPermissionGranted = $state(false);
	let scanCompleted = $state(false); // Track if scan was completed to prevent restart

	const config = {
		fps: 10,
		qrbox: { width: 300, height: 300 },
		aspectRatio: 1.0,
		disableFlip: false,
		supportedScanTypes: ['qr_code'] as const
	};

	onMount(async () => {
		// Only initialize on web platform
		if (Capacitor.getPlatform() !== 'web') {
			console.warn('WebQrCodeScanner should only be used on web platform');
			return;
		}

		try {
			html5QrCode = new Html5Qrcode('qr-reader');
			await startScanning();
		} catch (error) {
			console.error('Failed to initialize QR scanner:', error);
			errorMessage = error instanceof Error ? error.message : String(error);
			onError(errorMessage);
		}
	});

	onDestroy(async () => {
		await stopScanning();
	});

	async function startScanning() {
		if (!html5QrCode) return;
		
		// Don't start if scan was already completed
		if (scanCompleted) return;

		try {
			// Get available cameras
			const devices = await Html5Qrcode.getCameras();
			if (devices.length === 0) {
				throw new Error($t('common.components.qr_scanner.no_camera_found'));
			}

			// Use the first available camera (usually the back camera)
			const cameraId = devices[0].id;

			// Start scanning
			await html5QrCode.start(
				cameraId,
				config,
				async (qrCodeMessage: string, result: Html5QrcodeResult) => {
					// Successfully scanned QR code - stop scanning immediately
					scanCompleted = true;
					await stopScanning();
					onScan(qrCodeMessage);
				},
				(errorMessage: string) => {
					// Scan error (usually just means no QR code detected yet)
					// Don't show error for normal scanning process
				}
			);

			isScanning = true;
			cameraPermissionGranted = true;
			errorMessage = null;
		} catch (error) {
			console.error('Failed to start scanning:', error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			
			// Check if it's a permission error
			if (errorMsg.includes('Permission denied') || errorMsg.includes('NotAllowedError')) {
				errorMessage = $t('common.components.qr_scanner.camera_permission_denied');
			} else if (errorMsg.includes('NotFoundError') || errorMsg.includes('no camera')) {
				errorMessage = $t('common.components.qr_scanner.no_camera_found');
			} else {
				errorMessage = errorMsg;
			}
			
			onError(errorMessage);
			isScanning = false;
		}
	}

	async function stopScanning() {
		if (!html5QrCode) return;

		try {
			// Always try to stop the scanner to ensure camera is released
			// The library will handle cases where it's already stopped
			try {
				await html5QrCode.stop();
			} catch (stopError) {
				// Ignore "already stopped" errors - this is expected if scanner was already stopped
				if (stopError instanceof Error) {
					const errorMsg = stopError.message.toLowerCase();
					if (!errorMsg.includes('already stopped') && !errorMsg.includes('not started')) {
						console.warn('Error stopping scanner:', stopError);
					}
				}
			}
			
			// Always clear to ensure camera is fully released
			try {
				await html5QrCode.clear();
			} catch (clearError) {
				// Ignore clear errors - they're usually harmless
				console.warn('Error clearing scanner:', clearError);
			}
		} catch (error) {
			console.error('Unexpected error stopping scanner:', error);
		} finally {
			isScanning = false;
		}
	}

	async function handleClose() {
		await stopScanning();
		onClose();
	}

	async function handleRetry() {
		errorMessage = null;
		scanCompleted = false;
		await startScanning();
	}
</script>

<div class="web-qr-scanner flex flex-col items-center justify-center gap-4 w-full min-h-full">
	<div id="qr-reader" bind:this={scannerContainer} class="w-full max-w-md"></div>

	{#if errorMessage}
		<div class="alert alert-error alert-outline w-full max-w-md">
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
					d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span class="text-sm">{errorMessage}</span>
		</div>
		<button class="btn btn-primary" onclick={handleRetry}>
			{$t('common.buttons.retry')}
		</button>
	{/if}
</div>

<style>
	:global(#qr-reader) {
		width: 100%;
	}

	:global(#qr-reader__dashboard_section_csr) {
		display: none !important;
	}

	:global(#qr-reader__scan_region) {
		border: 2px solid hsl(var(--p)) !important;
		border-radius: 0.5rem;
	}

	:global(#qr-reader__dashboard_section_swaplink) {
		display: none !important;
	}
</style>

