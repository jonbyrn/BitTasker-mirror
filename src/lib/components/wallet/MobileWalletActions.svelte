<!-- 
  MobileWalletActions.svelte
  Mobile-specific wallet actions for BitTasker wallet
  Includes:
  - Biometric authentication
  - QR code scanning
  - Secure storage
  - Mobile-friendly UI components
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import * as mobileWalletService from '$lib/services/mobile-wallet.service';
	import * as walletService from '$lib/services/wallet.service';
	import walletStore from '$lib/stores/wallet.store';
	import { fade, slide } from 'svelte/transition';
	import { Capacitor } from '@capacitor/core';
	import 'iconify-icon';

	// Props
	let { onAddressScanned = (address: string, type: string) => {}, onAuthenticated = () => {} } =
		$props<{
			onAddressScanned?: (address: string, type: string) => void;
			onAuthenticated?: () => void;
		}>();

	// Local state
	let isMobile = $state(false);
	let biometricsAvailable = $state(false);
	let isLoading = $state(false);
	let scanningQR = $state(false);
	let errorMessage = $state('');
	let showActions = $state(false);

	onMount(async () => {
		// Check if we're on a mobile device
		isMobile = mobileWalletService.isMobileDevice();

		if (isMobile) {
			// Check if biometric authentication is available
			biometricsAvailable = await mobileWalletService.isBiometricAvailable();

			// Check if device security is enabled
			const securityEnabled = await mobileWalletService.hasDeviceSecurityEnabled();
			if (!securityEnabled) {
				errorMessage =
					'Please enable device security (PIN, pattern, or fingerprint) for wallet security.';
			}
		}
	});

	// Functions
	async function authenticateWithBiometrics() {
		if (!isMobile || !biometricsAvailable) {
			return;
		}

		isLoading = true;
		errorMessage = '';

		try {
			const password = await mobileWalletService.authenticateWithBiometrics();

			if (password) {
				// If we have a password, we can unlock the wallet
				onAuthenticated();
			} else {
				errorMessage = 'Authentication failed. Please try again.';
			}
		} catch (error) {
			errorMessage = 'Authentication error. Please try again.';
			console.error('Biometric authentication error:', error);
		} finally {
			isLoading = false;
		}
	}

	async function scanQRCode() {
		if (!isMobile) {
			return;
		}

		scanningQR = true;
		errorMessage = '';

		try {
			const result = await mobileWalletService.scanQRCode();

			if (result) {
				// Notify parent component of the scanned address/invoice
				onAddressScanned(result.value, result.type);
			} else {
				errorMessage = 'No QR code detected. Please try again.';
			}
		} catch (error) {
			errorMessage = 'Error scanning QR code. Please try again.';
			console.error('QR scanning error:', error);
		} finally {
			scanningQR = false;
		}
	}

	function toggleActions() {
		showActions = !showActions;
	}
</script>

{#if isMobile}
	<div class="mobile-wallet-actions" transition:fade={{ duration: 200 }}>
		<button
			class="primary-action-button"
			onclick={toggleActions}
			aria-label="Mobile wallet actions"
		>
			<iconify-icon icon="mdi:cellphone" width="24" height="24" ></iconify-icon>
		</button>

		{#if showActions}
			<div class="actions-panel" transition:slide={{ duration: 300 }}>
				{#if biometricsAvailable}
					<button
						class="action-button"
						onclick={authenticateWithBiometrics}
						disabled={isLoading}
						aria-label="Authenticate with biometrics"
					>
						<iconify-icon icon="mdi:fingerprint" width="20" height="20" ></iconify-icon>
						<span>Authenticate</span>
					</button>
				{/if}

				<button
					class="action-button"
					onclick={scanQRCode}
					disabled={scanningQR}
					aria-label="Scan QR code"
				>
					<iconify-icon icon="mdi:qrcode-scan" width="20" height="20" ></iconify-icon>
					<span>{scanningQR ? 'Scanning...' : 'Scan QR'}</span>
				</button>
			</div>
		{/if}

		{#if errorMessage}
			<div class="error-message" transition:fade={{ duration: 200 }}>
				{errorMessage}
			</div>
		{/if}
	</div>
{/if}

<style>
	.mobile-wallet-actions {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		z-index: 100;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.5rem;
	}

	.primary-action-button {
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 50%;
		background-color: var(--primary-color, #3b82f6);
		color: white;
		border: none;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.actions-panel {
		background-color: white;
		border-radius: 0.75rem;
		padding: 0.75rem;
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
		margin-bottom: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 10rem;
	}

	.action-button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background-color: var(--surface-color, #f9fafb);
		border: 1px solid var(--border-color, #e5e7eb);
		border-radius: 0.5rem;
		padding: 0.75rem;
		font-size: 0.875rem;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.action-button:hover {
		background-color: var(--hover-color, #f3f4f6);
	}

	.action-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.error-message {
		background-color: var(--error-color, #fee2e2);
		color: var(--error-text-color, #b91c1c);
		padding: 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		max-width: 20rem;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
	}
</style>
