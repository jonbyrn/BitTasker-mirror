<script lang="ts">
	import { importExistingPasskey, checkWebBiometricAvailability } from '$lib/utils/helpers/webBiometrics';
	import { appStore } from '$lib/stores/app.store';
	import { authState } from '$lib/stores/auth.store';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let isLoading = $state(false);
	let error = $state('');
	let success = $state(false);
	let isAvailable = $state(false);

	onMount(async () => {
		isAvailable = await checkWebBiometricAvailability();
	});

	async function handleImport() {
		try {
			isLoading = true;
			error = '';
			success = false;

			const credentials = await importExistingPasskey();
			
			if (credentials) {
				success = true;
				
				// Update app state
				appStore.update((state) => ({ ...state, biometricData: credentials }));
				authState.login();
				
				// Redirect to dashboard after a brief success message
				setTimeout(() => {
					goto('/dashboard');
				}, 2000);
			} else {
				error = 'No existing passkeys found or passkey data could not be recovered. You may need to set up biometric authentication again.';
			}
		} catch (err: unknown) {
			console.error('Passkey import failed:', err);
			error = err instanceof Error ? err.message : 'Failed to import passkey. Please try again.';
		} finally {
			isLoading = false;
		}
	}
</script>

{#if isAvailable}
	<div class="card bg-base-100 w-full max-w-md shadow-xl">
		<div class="card-body">
			<h2 class="card-title justify-center text-xl font-bold">Import Existing Passkey</h2>
			
			<div class="alert alert-info">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					class="h-6 w-6 shrink-0 stroke-current"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<div>
					<p class="text-sm">
						We detected you may have an existing passkey on this device. Click below to recover your account access.
					</p>
				</div>
			</div>

			{#if success}
				<div class="alert alert-success">
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
							d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<span>Passkey imported successfully! Redirecting to dashboard...</span>
				</div>
			{/if}

			{#if error}
				<div class="alert alert-error">
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
					<span class="text-sm">{error}</span>
				</div>
			{/if}

			<div class="card-actions justify-center">
				<button 
					class="btn btn-primary w-full"
					onclick={handleImport}
					disabled={isLoading || success}
				>
					{#if isLoading}
						<span class="loading loading-spinner loading-sm"></span>
						Searching for passkeys...
					{:else if success}
						Import Complete
					{:else}
						Import Existing Passkey
					{/if}
				</button>
			</div>

			<div class="text-center text-sm text-base-content/70 mt-4">
				<p>
					This will search for any existing passkeys on your device and restore your account access.
				</p>
			</div>
		</div>
	</div>
{:else}
	<div class="alert alert-warning">
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
				d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
			/>
		</svg>
		<div>
			<h3 class="font-bold">Passkeys Not Available</h3>
			<div class="text-sm">
				Passkey authentication is not available on this device or browser.
			</div>
		</div>
	</div>
{/if} 