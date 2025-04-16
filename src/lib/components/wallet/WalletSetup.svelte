<!-- WalletSetup.svelte - Wallet initialization with seed phrase options -->
<script lang="ts">
	import type { StoragePreference } from '$lib/types/wallet';
	import { onMount } from 'svelte';
	import { appStore } from '$lib/stores/app.store';
	import { walletStore } from '$lib/stores/wallet.store';

	// Component state
	let password = $state('');
	let confirmPassword = $state('');
	let showPassword = $state(false);
	let storagePreference: StoragePreference = $state('service');
	let isLoading = $state(false);
	let mnemonic = $state('');
	let showMnemonic = $state(false);
	let setupComplete = $state(false);
	let hasAcknowledgedWarning = $state(false);

	// Error handling
	let errorMessage = $state('');

	// Modal for displaying mnemonic
	let showMnemonicModal = $state(false);

	// Password requirements
	const MIN_PASSWORD_LENGTH = 8;
	let passwordValid = $derived(password.length >= MIN_PASSWORD_LENGTH);
	let passwordsMatch = $derived(password === confirmPassword);
	const canProceed = $derived(passwordValid && passwordsMatch && hasAcknowledgedWarning);

	// Toggle password visibility
	function togglePasswordVisibility() {
		showPassword = !showPassword;
	}

	// Handle wallet initialization
	async function initializeWallet() {
		if (!canProceed) return;

		isLoading = true;
		errorMessage = '';

		try {
			const result = await walletStore.initializeWallet(password, storagePreference);

			if (result.success) {
				// If self-storage, display the mnemonic
				if (storagePreference === 'self' && result.mnemonic) {
					mnemonic = result.mnemonic;
					showMnemonicModal = true;
				} else {
					setupComplete = true;
					appStore.showSuccessToast('Wallet created successfully!');
				}
			} else {
				errorMessage = 'Failed to create wallet. Please try again.';
			}
		} catch (error) {
			console.error('Wallet initialization error:', error);
			errorMessage = 'An unexpected error occurred. Please try again.';
		} finally {
			isLoading = false;
		}
	}

	// Copy to clipboard functionality
	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
		appStore.showSuccessToast('Seed phrase copied to clipboard');
	}

	// Handle mnemonic copy and acknowledgment
	function confirmMnemonicSaved() {
		showMnemonicModal = false;
		setupComplete = true;
		appStore.showSuccessToast('Wallet created successfully! Please store your seed phrase in a safe place.');
	}
</script>

<div class="wallet-setup-container">
	<div class="card bg-base-100 mx-auto max-w-lg p-6 shadow-lg">
		<div class="mb-6 text-center">
			<div class="bg-primary/10 mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
				</svg>
			</div>
			<h2 class="text-2xl font-bold">Set Up Your Bitcoin Wallet</h2>
			<p class="text-base-content/70 mt-2">Create a new wallet to send and receive Bitcoin</p>
		</div>

		{#if !setupComplete}
			<!-- Password setup -->
			<div class="mb-6 space-y-4">
				<div class="form-control">
					<label for="password" class="label">
						<span class="label-text">Wallet Password</span>
					</label>
					<div class="relative">
						<input
							type={showPassword ? 'text' : 'password'}
							id="password"
							bind:value={password}
							placeholder="Enter a strong password"
							class="input input-bordered w-full pr-10"
						/>
						<button
							type="button"
							class="absolute inset-y-0 right-0 flex items-center pr-3"
							onclick={togglePasswordVisibility}
						>
							{#if showPassword}
								<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
								</svg>
							{:else}
								<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
								</svg>
							{/if}
						</button>
					</div>
					{#if password && !passwordValid}
						<label class="label" for="password">
							<span class="label-text-alt text-error">
								Password must be at least {MIN_PASSWORD_LENGTH} characters
							</span>
						</label>
					{/if}
				</div>

				<div class="form-control">
					<label for="confirmPassword" class="label">
						<span class="label-text">Confirm Password</span>
					</label>
					<input
						type={showPassword ? 'text' : 'password'}
						id="confirmPassword"
						bind:value={confirmPassword}
						placeholder="Confirm your password"
						class="input input-bordered w-full"
					/>
					{#if confirmPassword && !passwordsMatch}
						<label class="label" for="confirmPassword">
							<span class="label-text-alt text-error">Passwords do not match</span>
						</label>
					{/if}
				</div>
			</div>

			<!-- Storage preference selection -->
			<div class="mb-6">
				<label class="label" for="storage-preference">
					<span class="label-text text-base font-medium">Seed Phrase Storage</span>
				</label>
				<p class="text-base-content/70 mb-4 text-sm">
					Choose how you want to store your wallet's seed phrase
				</p>

				<div class="space-y-4">
					<div class="flex items-start space-x-3 rounded-md border p-3">
						<input
							type="radio"
							id="store-with-us"
							class="radio"
							name="storage-preference"
							value="service"
							bind:group={storagePreference}
							checked={storagePreference === 'service'}
						/>
						<div>
							<label for="store-with-us" class="flex items-center font-medium cursor-pointer">
								Store securely with BitTasker (recommended)
							</label>
							<p class="text-base-content/70 mt-1 text-sm">
								We'll store your seed phrase end-to-end encrypted. Only you can access it with
								your password.
							</p>
						</div>
					</div>

					<div class="flex items-start space-x-3 rounded-md border p-3">
						<input
							type="radio"
							id="store-myself"
							class="radio"
							name="storage-preference"
							value="self"
							bind:group={storagePreference}
							checked={storagePreference === 'self'}
						/>
						<div>
							<label for="store-myself" class="flex items-center font-medium cursor-pointer">
								I'll store it myself
							</label>
							<p class="text-base-content/70 mt-1 text-sm">
								We'll show you the seed phrase once. You are responsible for storing it securely.
							</p>
						</div>
					</div>
				</div>
			</div>

			<!-- Warning and acknowledgment -->
			<div class="mb-6 alert alert-warning">
				<div class="flex items-start">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mt-0.5 flex-shrink-0 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<div class="ml-3">
						<h3 class="text-sm font-medium">Important Security Information</h3>
						{#if storagePreference === 'service'}
							<p class="mt-1 text-sm opacity-80">
								If you store your seed phrase with us and someone gains unauthorized access to your
								account, they could access your Bitcoin. Use a strong password and enable 2FA for
								extra security.
							</p>
						{:else}
							<p class="mt-1 text-sm opacity-80">
								If you don't store your seed phrase with us and you lose it, we cannot recover your
								Bitcoin. Write it down and keep it in a secure location.
							</p>
						{/if}
					</div>
				</div>

				<div class="mt-3 flex items-center">
					<label class="cursor-pointer label">
						<input type="checkbox" class="toggle toggle-sm" bind:checked={hasAcknowledgedWarning} />
						<span class="ml-2 text-sm">I understand the risks and want to proceed</span>
					</label>
				</div>
			</div>

			{#if errorMessage}
				<div class="alert alert-error mb-6">
					{errorMessage}
				</div>
			{/if}

			<button class="btn btn-primary w-full" disabled={!canProceed || isLoading} onclick={initializeWallet}>
				{isLoading ? 'Creating Wallet...' : 'Create Wallet'}
			</button>
		{:else}
			<!-- Setup complete message -->
			<div class="py-4 text-center">
				<div class="mb-2 text-success">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mx-auto h-12 w-12"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M5 13l4 4L19 7"
						/>
					</svg>
				</div>
				<h3 class="text-xl font-semibold">Wallet Created Successfully!</h3>
				<p class="text-base-content/70 mt-2">
					{#if storagePreference === 'service'}
						Your wallet has been set up and your seed phrase is securely stored.
					{:else}
						Your wallet has been set up. Make sure to keep your seed phrase in a safe place.
					{/if}
				</p>
				<a href="/wallet" class="btn btn-primary mt-4">Go to Wallet</a>
			</div>
		{/if}
	</div>
</div>

<!-- Mnemonic display modal using DaisyUI -->
{#if showMnemonicModal}
	<div class="modal modal-open">
		<div class="modal-box max-w-md">
			<h3 class="mb-4 text-center text-xl font-semibold">Your Seed Phrase</h3>
			
			<p class="mb-4 text-sm text-error">
				This is your wallet's recovery phrase. Write it down and store it in a secure location. It
				will never be shown again!
			</p>
			
			<div class="mb-4 rounded-md bg-base-200 p-4">
				<p class="text-center font-mono text-lg break-words select-all">{mnemonic}</p>
			</div>
			
			<div class="mb-4 flex justify-center">
				<button class="btn btn-outline flex items-center" onclick={() => copyToClipboard(mnemonic)}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
					</svg>
					Copy to Clipboard
				</button>
			</div>
			
			<div class="flex justify-center">
				<button class="btn btn-primary" onclick={confirmMnemonicSaved}>
					I've Saved My Seed Phrase
				</button>
			</div>
		</div>
		<div class="modal-backdrop" onclick={() => {}} />
	</div>
{/if}

<style>
	.wallet-setup-container {
		max-width: 640px;
		margin: 0 auto;
		padding: 1rem;
	}
</style>
