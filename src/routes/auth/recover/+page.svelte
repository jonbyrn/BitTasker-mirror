<script lang="ts">
	import type { AxiosError } from 'axios';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { bytesToHex } from '@noble/hashes/utils';
	import { registerWithNostr } from '$lib/services/auth.service';
	import { validatePassword } from '$lib/utils/helpers/validators';
	import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
	import { encryptNostrPrivateKeyWithPassword } from '$lib/utils/helpers/auth';
	
	const email = page.url.searchParams.get('email') || '';

	let name = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let isLoading = $state(false);
	let error = $state('');
	let passwordError = $state('');

	async function handleSubmit(event: Event) {
		event.preventDefault();

		try {
			isLoading = true;
			error = '';
			passwordError = '';

			if (password !== confirmPassword) {
				passwordError = 'Passwords do not match';
				return;
			}

			const passwordValidation = validatePassword(password);
			if (!passwordValidation.isValid) {
				passwordError = passwordValidation.error!;
				return;
			}

			// Generate Nostr keypair
			const sk = generateSecretKey();
			const pk = getPublicKey(sk);
			const npriv = bytesToHex(sk);
			const { encrypted, salt } = await encryptNostrPrivateKeyWithPassword(npriv, password);

			const res = await registerWithNostr({
				name,
				email,
				publicKey: pk,
				encryptedPrivateKey: encrypted.data,
				iv: encrypted.iv,
				salt: salt,
				authTag: 'auth-tag-data',
				iterations: 100000,
				useBiometrics: false // Password-based registration
			});

			goto('/dashboard');
		} catch (err: any) {
			error = err.response?.data?.message || 'Registration failed';
			console.error(err);
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="bg-base-200 flex min-h-screen flex-col items-center justify-center gap-4 px-4">
	<div class="alert alert-warning w-full max-w-md">
		<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
		</svg>
		<span>Please set a strong password to protect your account</span>
	</div>

	<div class="card bg-base-100 w-full max-w-md shadow-xl">
		<div class="card-body">
			<h2 class="card-title mb-6 justify-center text-2xl font-bold">Complete Registration</h2>

			{#if error}
				<div class="alert alert-error">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<span>{error}</span>
				</div>
			{/if}

			<form onsubmit={handleSubmit} class="space-y-4">
				<div class="form-control">
					<label class="label" for="name">
						<span class="label-text">Full Name</span>
					</label>
					<input
						type="text"
						id="name"
						bind:value={name}
						placeholder="Enter your full name"
						class="input input-bordered w-full"
						required
					/>
				</div>

				<div class="form-control">
					<label class="label" for="email">
						<span class="label-text">Email</span>
					</label>
					<input
						type="email"
						id="email"
						value={email}
						class="input input-bordered w-full"
						disabled
					/>
				</div>

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
						class:input-error={passwordError}
						required
					/>
					{#if passwordError}
						<label class="label" for="password">
							<span class="label-text-alt text-error">{passwordError}</span>
						</label>
					{/if}
				</div>

				<div class="form-control">
					<label class="label" for="confirmPassword">
						<span class="label-text">Confirm Password</span>
					</label>
					<input
						type="password"
						id="confirmPassword"
						bind:value={confirmPassword}
						placeholder="Confirm your password"
						class="input input-bordered w-full"
						class:input-error={passwordError}
						required
					/>
				</div>

				<button type="submit" class="btn btn-primary w-full" disabled={isLoading}>
					{#if isLoading}
						<span class="loading loading-spinner"></span>
					{:else}
						Complete Registration
					{/if}
				</button>
			</form>
		</div>
	</div>
</div>
