<script lang="ts">
	import { onMount } from 'svelte';
	import { NativeBiometric } from 'capacitor-native-biometric';
	import { isValidEmail } from '$lib/utils/helpers/validators';
	import { createPasskey, verifyIdentity } from '$lib/utils/helpers/biometrics';
	import Google from '$lib/components/AuthProviders/Google.svelte';
	import { mockLogin } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import Facebook from '$lib/components/AuthProviders/Facebook.svelte';
	import XTwitter from '$lib/components/AuthProviders/X.svelte';
	import Alby from '$lib/components/AuthProviders/Alby.svelte';

	let isPasskey = $state(false);
	let email = $state('');
	let password = $state('');
	let isBiometricAvailable = $state(false);

	onMount(async () => {
		// TOOD: Only check biometric availability on mobile
		const result = await NativeBiometric.isAvailable();
		if (result.isAvailable) isBiometricAvailable = true;
	});

	const handleSubmit = async (e: Event) => {
		e.preventDefault();

		if (!isValidEmail(email)) return console.error('email validation failed');

		// Handle login
		console.log('Login:', { email, password });

		// Create passkey if enabled
		if (isPasskey) {
			createPasskey(email);
		}

		// Mock login
		await mockLogin(email, password);
		goto('/dashboard');
	}
</script>

<div class="bg-base-200 flex min-h-screen items-center justify-center px-4">
	<div class="card bg-base-100 w-full max-w-md shadow-xl">
		<div class="card-body">
			<h2 class="card-title mb-6 justify-center text-2xl font-bold">Login to Bittasker</h2>

			<form onsubmit={handleSubmit} class="space-y-4">
				<div class="form-control">
					<label class="label" for="email">
						<span class="label-text">Email</span>
					</label>
					<input
						type="email"
						id="email"
						bind:value={email}
						placeholder="Enter your email"
						class="input input-bordered w-full"
						required
					/>
				</div>

				{#if !isPasskey}
					<div class="form-control">
						<label class="label" for="password">
							<span class="label-text">Password</span>
						</label>
						<input
							type="password"
							id="password"
							bind:value={password}
							placeholder="Enter your password"
							class="input input-bordered w-full"
							required
						/>
					</div>
				{/if}

				<button type="submit" class="btn btn-primary w-full"> Login </button>
			</form>

			<div class="divider">OR</div>

			{#if isBiometricAvailable && !isPasskey}
				<button class="btn btn-outline w-full" onclick={verifyIdentity}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="size-6"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M7.864 4.243A7.5 7.5 0 0 1 19.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 0 0 4.5 10.5a7.464 7.464 0 0 1-1.15 3.993m1.989 3.559A11.209 11.209 0 0 0 8.25 10.5a3.75 3.75 0 1 1 7.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 0 1-3.6 9.75m6.633-4.596a18.666 18.666 0 0 1-2.485 5.33"
						/>
					</svg>
					Continue with Biometric
				</button>
			{/if}

            <Google />
            <Facebook />
            <XTwitter />
            <Alby />

			<div class="mt-4 text-center">
				<a class="link link-primary" href="/auth/register" data-sveltekit-reload="off">
					Don't have an account? Sign up
				</a>
			</div>
		</div>
	</div>
</div>
