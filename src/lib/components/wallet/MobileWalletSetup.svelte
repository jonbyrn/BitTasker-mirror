<!-- 
  MobileWalletSetup.svelte
  Mobile-specific wallet setup flow for BitTasker wallet
  Includes:
  - Biometric enrollment
  - Device security check
  - Mobile-optimized recovery phrase backup
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import * as mobileWalletService from '$lib/services/mobile-wallet.service';
	import * as walletService from '$lib/services/wallet.service';
	import * as walletCryptoService from '$lib/services/wallet-crypto.service';
	import { fade, slide } from 'svelte/transition';
	import { Capacitor } from '@capacitor/core';
	import 'iconify-icon';

	// Props
	let { onSetupComplete = () => {} } = $props<{ onSetupComplete: () => void }>();

	// Local state
	let isMobile = $state(false);
	let currentStep = $state(1);
	let totalSteps = 4;
	let loading = $state(false);
	let error = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let biometricsAvailable = $state(false);
	let enableBiometrics = $state(true);
	let deviceSecurityEnabled = $state(true);
	let mnemonicWords = $state<string[]>([]);
	let mnemonic = '';
	let mnemonicConfirmed = false;

	onMount(async () => {
		// Check if we're on a mobile device
		isMobile = mobileWalletService.isMobileDevice();

		if (!isMobile) {
			// Skip to standard wallet setup if not on mobile
			onSetupComplete();
			return;
		}

		// Check if biometric authentication is available
		biometricsAvailable = await mobileWalletService.isBiometricAvailable();

		// Check if device security is enabled
		deviceSecurityEnabled = await mobileWalletService.hasDeviceSecurityEnabled();

		// Generate a random mnemonic for the setup
		mnemonic = await walletCryptoService.generateMnemonic();
		mnemonicWords = mnemonic.split(' ');
	});

	// Functions
	function nextStep() {
		if (currentStep < totalSteps) {
			currentStep++;
		}
	}

	function prevStep() {
		if (currentStep > 1) {
			currentStep--;
		}
	}

	function validatePasswords() {
		if (!password) {
			error = 'Password is required';
			return false;
		}

		if (password.length < 8) {
			error = 'Password must be at least 8 characters';
			return false;
		}

		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return false;
		}

		error = '';
		return true;
	}

	async function confirmRecoveryPhrase() {
		mnemonicConfirmed = true;
		nextStep();
	}

	async function completeSetup() {
		if (!validatePasswords()) {
			return;
		}

		loading = true;
		error = '';

		try {
			// Initialize the wallet with the password and mnemonic
			const initialized = await walletService.initializeWallet(password, mnemonic);

			if (!initialized) {
				error = 'Failed to initialize wallet';
				return;
			}

			// If biometrics are available and enabled, set up biometric auth
			if (biometricsAvailable && enableBiometrics) {
				await mobileWalletService.setupBiometricAuth(password);
			}

			// Setup complete
			onSetupComplete();
		} catch (err) {
			console.error('Error setting up wallet:', err);
			error = 'An error occurred during wallet setup';
		} finally {
			loading = false;
		}
	}
</script>

{#if isMobile}
	<div class="mobile-wallet-setup" transition:fade={{ duration: 200 }}>
		<!-- Progress indicator -->
		<div class="progress-bar">
			{#each Array(totalSteps) as _, i}
				<div class="progress-step" class:active={i + 1 <= currentStep}></div>
			{/each}
		</div>

		<!-- Step content -->
		<div class="step-content">
			{#if currentStep === 1}
				<div class="step" transition:fade={{ duration: 200 }}>
					<h2>Setup Your Mobile Wallet</h2>

					{#if !deviceSecurityEnabled}
						<div class="warning-box">
							<iconify-icon icon="mdi:shield-alert" width="24" height="24"></iconify-icon>
							<p>
								Your device does not have a PIN, pattern, or biometric security enabled. For maximum
								wallet security, please enable device security in your system settings first.
							</p>
						</div>
					{/if}

					<p>
						This will create a secure Bitcoin wallet on your mobile device. Your keys will be
						encrypted and stored only on your device.
					</p>

					<div class="action-buttons">
						<button class="primary-button" onclick={nextStep}>Get Started</button>
					</div>
				</div>
			{:else if currentStep === 2}
				<div class="step" transition:fade={{ duration: 200 }}>
					<h2>Your Recovery Phrase</h2>

					<div class="warning-box">
						<iconify-icon icon="mdi:shield-alert" width="24" height="24"></iconify-icon>
						<p>
							Write down these words in order and keep them safe. They are the only way to recover
							your wallet if you lose access to your device.
						</p>
					</div>

					<div class="seed-phrase">
						{#each mnemonicWords as word, i}
							<div class="seed-word">
								<span class="seed-number">{i + 1}</span>
								<span class="seed-text">{word}</span>
							</div>
						{/each}
					</div>

					<div class="action-buttons">
						<button class="secondary-button" onclick={prevStep}>Back</button>
						<button class="primary-button" onclick={confirmRecoveryPhrase}
							>I've Written It Down</button
						>
					</div>
				</div>
			{:else if currentStep === 3}
				<div class="step" transition:fade={{ duration: 200 }}>
					<h2>Create Password</h2>

					<p>
						Create a password to encrypt your wallet. You'll need this password to access your
						wallet.
					</p>

					<div class="form-group">
						<label for="password">Password</label>
						<input
							type="password"
							id="password"
							bind:value={password}
							placeholder="Enter password"
						/>
					</div>

					<div class="form-group">
						<label for="confirmPassword">Confirm Password</label>
						<input
							type="password"
							id="confirmPassword"
							bind:value={confirmPassword}
							placeholder="Confirm password"
						/>
					</div>

					{#if biometricsAvailable}
						<div class="form-group">
							<label class="checkbox-label">
								<input type="checkbox" bind:checked={enableBiometrics} />
								<span>Enable biometric authentication</span>
							</label>
							<p class="help-text">
								This allows you to unlock your wallet using your fingerprint or face recognition.
							</p>
						</div>
					{/if}

					{#if error}
						<div class="error-message">{error}</div>
					{/if}

					<div class="action-buttons">
						<button class="secondary-button" onclick={prevStep}>Back</button>
						<button class="primary-button" onclick={nextStep}>Continue</button>
					</div>
				</div>
			{:else if currentStep === 4}
				<div class="step" transition:fade={{ duration: 200 }}>
					<h2>Complete Setup</h2>

					<div class="summary">
						<p>Your wallet is almost ready to use. Please confirm the following:</p>

						<ul class="summary-list">
							<li>
								<iconify-icon icon="mdi:check-circle" width="20" height="20"></iconify-icon>
								<span>I have saved my recovery phrase securely</span>
							</li>
							<li>
								<iconify-icon icon="mdi:check-circle" width="20" height="20"></iconify-icon>
								<span>I understand that I am responsible for my funds</span>
							</li>
							<li>
								<iconify-icon icon="mdi:check-circle" width="20" height="20"></iconify-icon>
								<span>I understand that my keys are only stored on this device</span>
							</li>
							{#if biometricsAvailable && enableBiometrics}
								<li>
									<iconify-icon icon="mdi:check-circle" width="20" height="20"></iconify-icon>
									<span>I have enabled biometric authentication for easier access</span>
								</li>
							{/if}
						</ul>
					</div>

					{#if error}
						<div class="error-message">{error}</div>
					{/if}

					<div class="action-buttons">
						<button class="secondary-button" onclick={prevStep}>Back</button>
						<button class="primary-button" onclick={completeSetup} disabled={loading}>
							{loading ? 'Setting up...' : 'Create My Wallet'}
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.mobile-wallet-setup {
		width: 100%;
		max-width: 500px;
		margin: 0 auto;
		padding: 1.5rem;
	}

	.progress-bar {
		display: flex;
		justify-content: space-between;
		margin-bottom: 2rem;
	}

	.progress-step {
		flex: 1;
		height: 4px;
		background-color: var(--border-color, #e5e7eb);
		margin: 0 2px;
		border-radius: 2px;
	}

	.progress-step.active {
		background-color: var(--primary-color, #3b82f6);
	}

	.step-content {
		background-color: white;
		border-radius: 1rem;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
		overflow: hidden;
	}

	.step {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	h2 {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0;
		color: var(--heading-color, #111827);
	}

	p {
		margin: 0;
		font-size: 1rem;
		color: var(--text-color, #374151);
	}

	.warning-box {
		background-color: var(--warning-bg, #fef3c7);
		border-radius: 0.5rem;
		padding: 1rem;
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
	}

	.warning-box p {
		color: var(--warning-text, #92400e);
		font-size: 0.875rem;
		flex: 1;
	}

	.seed-phrase {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
		background-color: var(--surface-color, #f9fafb);
		border-radius: 0.75rem;
		padding: 1rem;
	}

	.seed-word {
		display: flex;
		align-items: center;
		background-color: white;
		border-radius: 0.5rem;
		padding: 0.5rem;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
	}

	.seed-number {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 1.5rem;
		height: 1.5rem;
		background-color: var(--primary-color, #3b82f6);
		color: white;
		border-radius: 50%;
		font-size: 0.75rem;
		margin-right: 0.5rem;
	}

	.seed-text {
		font-size: 0.875rem;
		font-weight: 500;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--label-color, #374151);
	}

	input[type='password'] {
		padding: 0.75rem;
		border-radius: 0.5rem;
		border: 1px solid var(--border-color, #e5e7eb);
		font-size: 1rem;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}

	.help-text {
		font-size: 0.75rem;
		color: var(--help-text, #6b7280);
		margin-top: 0.25rem;
	}

	.error-message {
		background-color: var(--error-color, #fee2e2);
		color: var(--error-text-color, #b91c1c);
		padding: 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.875rem;
	}

	.action-buttons {
		display: flex;
		justify-content: space-between;
		margin-top: 1rem;
	}

	.primary-button {
		background-color: var(--primary-color, #3b82f6);
		color: white;
		border: none;
		border-radius: 0.5rem;
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
	}

	.primary-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.secondary-button {
		background-color: var(--surface-color, #f9fafb);
		color: var(--text-color, #374151);
		border: 1px solid var(--border-color, #e5e7eb);
		border-radius: 0.5rem;
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
	}

	.summary {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.summary-list {
		list-style-type: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.summary-list li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
	}

	/* Mobile-specific adjustments */
	@media (max-width: 480px) {
		.mobile-wallet-setup {
			padding: 1rem;
		}

		.seed-phrase {
			grid-template-columns: repeat(2, 1fr);
		}

		.action-buttons {
			flex-direction: column;
			gap: 0.75rem;
		}

		.primary-button,
		.secondary-button {
			width: 100%;
		}
	}
</style>
