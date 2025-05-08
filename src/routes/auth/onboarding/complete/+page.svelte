<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Preferences } from '@capacitor/preferences';
	import { user } from '$lib/stores/user.store';
	import { authState } from '$lib/stores/auth.store';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import { getDeviceIdentifier, getDeviceName } from '$lib/utils/helpers/deviceIdentity';
	import { encryptNsec } from '$lib/utils/helpers/auth';
	import { 
		checkBiometricAvailability, 
		setBiometricKey 
	} from '$lib/utils/helpers/biometrics';
	import {
		checkWebBiometricAvailability,
		setWebBiometricKey
	} from '$lib/utils/helpers/webBiometrics';
	import authService from '$lib/api/services/auth.service';

	// Completion status
	let isLoading = $state(true);
	let isComplete = $state(false);
	let isError = $state(false);
	let progressSteps = $state({
		accountSetup: { complete: false, current: false },
		profile: { complete: false, current: false },
		location: { complete: false, current: false },
		biometrics: { complete: false, current: false },
		serverSync: { complete: false, current: false }
	});
	let error = $state('');
	let onboardingData = $state<any>(null);

	onMount(async () => {
		try {
			// Start with account setup step
			progressSteps.accountSetup.current = true;
			
			// Load onboarding data
			const result = await Preferences.get({ key: 'bittasker_onboarding_data' });
			if (!result.value) {
				error = 'No onboarding data found. Please restart the process.';
				isError = true;
				isLoading = false;
				return;
			}

			onboardingData = JSON.parse(result.value);
			progressSteps.accountSetup.complete = true;
			progressSteps.accountSetup.current = false;
			
			// Process profile info
			progressSteps.profile.current = true;
			await new Promise(resolve => setTimeout(resolve, 500)); // Simulate processing
			progressSteps.profile.complete = true;
			progressSteps.profile.current = false;

			// Process location info
			progressSteps.location.current = true;
			await new Promise(resolve => setTimeout(resolve, 500)); // Simulate processing
			progressSteps.location.complete = true;
			progressSteps.location.current = false;

			// Set up biometrics
			progressSteps.biometrics.current = true;
			await setupBiometrics();
			progressSteps.biometrics.complete = true;
			progressSteps.biometrics.current = false;

			// Sync with server
			progressSteps.serverSync.current = true;
			await syncWithServer();
			progressSteps.serverSync.complete = true;
			progressSteps.serverSync.current = false;

			// Complete onboarding
			isComplete = true;
			isLoading = false;

			// Clean up onboarding data
			await Preferences.remove({ key: 'bittasker_onboarding_data' });
			
			// Set onboarding as completed
			await Preferences.set({
				key: StorageKeys.ONBOARDING_COMPLETED,
				value: 'true'
			});
		} catch (err: unknown) {
			console.error('Onboarding completion failed:', err);
			error = err instanceof Error ? err.message : 'Onboarding completion failed';
			isError = true;
			isLoading = false;
		}
	});

	async function setupBiometrics() {
		// Check if biometrics are available
		const biometricAvailable = await checkBiometricAvailability();
		const webAuthnAvailable = await checkWebBiometricAvailability();
		
		if (!biometricAvailable && !webAuthnAvailable) {
			// If biometrics are not available, we'll skip this step
			console.log('Biometrics not available, skipping');
			return;
		}

		// Get device identifier
		const deviceId = await getDeviceIdentifier();
		
		// Encrypt private key with device ID
		const { encrypted, salt, exportedKey, iterations } = await encryptNsec(
			onboardingData.nsec,
			deviceId
		);

		// Store encryption data with biometrics
		if (biometricAvailable) {
			await setBiometricKey(onboardingData.npub, {
				key: exportedKey,
				iv: encrypted.iv,
				authTag: encrypted.authTag,
				data: encrypted.data,
				salt
			});
		} else if (webAuthnAvailable) {
			await setWebBiometricKey(onboardingData.npub, {
				key: exportedKey,
				iv: encrypted.iv,
				authTag: encrypted.authTag,
				data: encrypted.data,
				salt
			});
		}
	}

	async function syncWithServer() {
		// Register with server
		await authService.registerWithNostr({
			publicKey: onboardingData.npub,
			encryptedPrivateKey: 'encrypted_key_data', // In a real implementation, this would be the encrypted private key
			iv: 'iv_data',
			salt: 'salt_data',
			authTag: 'auth_tag_data',
			iterations: 10000,
			authMethod: 'passkey'
		});

		// Register device with server
		const deviceId = await getDeviceIdentifier();
		const deviceName = await getDeviceName();
		await authService.registerPasskeyDevice(onboardingData.npub, deviceId, deviceName);

		// Submit profile data
		await authService.updateProfile({
			username: onboardingData.username,
			displayName: onboardingData.displayName,
			professionalTitle: onboardingData.professionalTitle,
			description: onboardingData.profileDescription,
			skills: onboardingData.skills,
			location: onboardingData.location
		});

		// Get user data
		const userData = await authService.getUserProfile();
		
		// Update user state
		user.updateProfile(userData);
		authState.login();
	}

	function goToDashboard() {
		goto('/dashboard');
	}
</script>

<div class="flex min-h-[85vh] w-full flex-col items-center justify-center px-4 py-8">
	<div class="w-full max-w-md">
		<div class="mb-8 flex flex-col items-center justify-center">
			<img src="/logo.svg" alt="BitTasker" class="h-16 w-auto" />
			<h1 class="mt-4 text-center text-2xl font-bold">Setting Up Your Account</h1>
			<div class="mt-2 flex w-full justify-between">
				<div class="flex flex-col items-center opacity-50">
					<div class="badge badge-outline">Step 1</div>
					<span class="mt-1 text-xs">Account</span>
				</div>
				<div class="flex flex-col items-center opacity-50">
					<div class="badge badge-outline">Step 2</div>
					<span class="mt-1 text-xs">Profile</span>
				</div>
				<div class="flex flex-col items-center opacity-50">
					<div class="badge badge-outline">Step 3</div>
					<span class="mt-1 text-xs">Location</span>
				</div>
				<div class="flex flex-col items-center">
					<div class="badge badge-primary">Step 4</div>
					<span class="mt-1 text-xs">Complete</span>
				</div>
			</div>
		</div>

		<div class="card bg-base-100 w-full shadow-xl">
			<div class="card-body">
				{#if isLoading}
					<div class="space-y-6">
						<div class="text-center">
							<h2 class="text-lg font-medium">Just a moment...</h2>
							<p class="text-sm text-base-content/70">
								We're setting up your account with all the information you provided.
							</p>
						</div>

						<ul class="steps steps-vertical w-full">
							<li class="step {progressSteps.accountSetup.complete ? 'step-primary' : ''} {progressSteps.accountSetup.current ? 'step-info' : ''}">
								{#if progressSteps.accountSetup.current}
									<span class="loading loading-spinner loading-xs"></span>
								{/if}
								Setting up your account
							</li>
							<li class="step {progressSteps.profile.complete ? 'step-primary' : ''} {progressSteps.profile.current ? 'step-info' : ''}">
								{#if progressSteps.profile.current}
									<span class="loading loading-spinner loading-xs"></span>
								{/if}
								Saving your profile
							</li>
							<li class="step {progressSteps.location.complete ? 'step-primary' : ''} {progressSteps.location.current ? 'step-info' : ''}">
								{#if progressSteps.location.current}
									<span class="loading loading-spinner loading-xs"></span>
								{/if}
								Setting up your service location
							</li>
							<li class="step {progressSteps.biometrics.complete ? 'step-primary' : ''} {progressSteps.biometrics.current ? 'step-info' : ''}">
								{#if progressSteps.biometrics.current}
									<span class="loading loading-spinner loading-xs"></span>
								{/if}
								Setting up secure authentication
							</li>
							<li class="step {progressSteps.serverSync.complete ? 'step-primary' : ''} {progressSteps.serverSync.current ? 'step-info' : ''}">
								{#if progressSteps.serverSync.current}
									<span class="loading loading-spinner loading-xs"></span>
								{/if}
								Syncing with the BitTasker network
							</li>
						</ul>
					</div>
				{:else if isError}
					<div class="flex flex-col items-center space-y-4 text-center">
						<div class="mt-2 text-error">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
							</svg>
						</div>
						<h2 class="text-xl font-bold">Oops! Something went wrong</h2>
						<p class="text-base-content/70">{error}</p>
						<button class="btn btn-primary mt-4" onclick={() => goto('/auth/signup')}>
							Restart Setup
						</button>
					</div>
				{:else if isComplete}
					<div class="flex flex-col items-center space-y-4 text-center">
						<div class="mt-2 text-success">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
						</div>
						<h2 class="text-xl font-bold">Your account is ready!</h2>
						<p class="text-base-content/70">
							You've successfully completed the onboarding process and your BitTasker account is now active.
						</p>
						<div class="mt-2 space-y-2">
							<p class="font-medium">What's next?</p>
							<ul class="list-inside list-disc text-start text-sm text-base-content/70">
								<li>Browse available tasks or create your own</li>
								<li>Complete your profile to attract more clients</li>
								<li>Set up your payment preferences</li>
								<li>Explore the platform features</li>
							</ul>
						</div>
						<button class="btn btn-primary mt-6" onclick={goToDashboard}>
							Go to Dashboard
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div> 