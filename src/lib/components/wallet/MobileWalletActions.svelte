<!-- 
  MobileWalletActions.svelte
  Mobile-specific wallet actions for BitTasker wallet
  Includes:
  - Biometric authentication
  - Mobile QR code scanning
  - Touch-optimized UI elements
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { isMobileDevice, isBiometricAvailable } from '$lib/utils/helpers/wallet/mobile-wallet';
	import { walletStore } from '$lib/stores/wallet.store';
	import { fade } from 'svelte/transition';
	import 'iconify-icon';

	// Local state
	let biometricsAvailable = $state(false);
	let loading = $state(false);
	let error = $state('');

	// Props
	let { onBiometricUnlock = () => {} } = $props<{ onBiometricUnlock?: () => void }>();

	onMount(async () => {
		if (!isMobileDevice()) return;

		// Check if biometrics are available
		try {
			biometricsAvailable = await isBiometricAvailable();
		} catch (err) {
			console.error('Error checking biometric availability:', err);
		}
	});

	async function unlockWithBiometrics() {
		if (!biometricsAvailable) return;

		loading = true;
		error = '';

		try {
			const success = await walletStore.unlockWithBiometrics();
			
			if (success) {
				onBiometricUnlock();
			} else {
				error = 'Biometric authentication failed';
			}
		} catch (err) {
			console.error('Error with biometric unlock:', err);
			error = 'Error with biometric authentication';
		} finally {
			loading = false;
		}
	}
</script>

{#if biometricsAvailable}
	<div class="biometric-actions" transition:fade={{ duration: 200 }}>
		<button 
			class="biometric-button" 
			onclick={unlockWithBiometrics}
			disabled={loading}
			aria-label="Unlock with biometrics"
		>
			{#if loading}
				<span class="loading-spinner"></span>
			{:else}
				<iconify-icon icon="mdi:fingerprint" width="28" height="28"></iconify-icon>
			{/if}
			<span>Unlock with Biometrics</span>
		</button>
		
		{#if error}
			<div class="error-message">
				{error}
			</div>
		{/if}
	</div>
{/if}

<style>
	.biometric-actions {
		margin: 1rem 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
	}

	.biometric-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		background-color: var(--surface-color, #f9fafb);
		border: 1px solid var(--border-color, #e5e7eb);
		border-radius: 0.5rem;
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
		font-weight: 500;
		width: 100%;
		max-width: 300px;
		cursor: pointer;
		transition: background-color 0.2s, transform 0.1s;
	}

	.biometric-button:hover {
		background-color: var(--hover-color, #f3f4f6);
	}

	.biometric-button:active {
		transform: scale(0.98);
	}

	.biometric-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.error-message {
		margin-top: 0.75rem;
		color: var(--error-color, #ef4444);
		font-size: 0.875rem;
	}

	.loading-spinner {
		display: inline-block;
		width: 24px;
		height: 24px;
		border: 3px solid rgba(0, 0, 0, 0.1);
		border-radius: 50%;
		border-top-color: var(--primary-color, #3b82f6);
		animation: spin 1s ease-in-out infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
