<script lang="ts">
	import type { NostrRegistrationData } from '$lib/types/auth';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { bytesToHex } from '@noble/hashes/utils';
	import {
		getLoginChallenge,
		loginWithNostr,
		loginWithPasskey,
		registerWithNostr
	} from '$lib/services/auth.service';
	import {
		validateEmail,
		validateName,
		validateNostrPrivateKey,
		validatePassword
	} from '$lib/utils/helpers/validators';
	import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
	import { encryptNostrPrivateKeyWithPassword } from '$lib/utils/helpers/auth';
	import { NDKNip07Signer } from '@nostr-dev-kit/ndk';
	import { Preferences } from '@capacitor/preferences';
	import { user } from '$lib/states/user.store';
	import { authState } from '$lib/states/auth.store';
	import { getDeviceIdentifier } from '$lib/utils/helpers/deviceIdentity';

	const provider = page.url.searchParams.get('provider') || '';
	let npub = $state(page.url.searchParams.get('npub') || '');
	let token = $state(page.url.searchParams.get('token') || '');
	let nsec = $state('');
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let isLoading = $state(false);
	let error = $state('');
	let passwordError = $state('');

	// Fetch nsec using the token
	$effect.pre(() => {
		if (token) {
			void (async () => {
				const storedNsec = await Preferences.get({ key: token });
				if (storedNsec.value) {
					nsec = storedNsec.value;
					await Preferences.remove({ key: token });
				} else {
					error = 'Recovery token expired or invalid';
					goto('/auth');
				}
			})();
		}
	});

	async function handleSubmit(event: Event) {
		event.preventDefault();

		try {
			isLoading = true;
			error = '';
			passwordError = '';

			if (!name || !email || !password || !confirmPassword) {
				error = 'All fields are required';
				return;
			}

			const emailValidation = validateEmail(email);
			if (!emailValidation.isValid) {
				error = emailValidation.error!;
				return;
			}

			const nameValidation = validateName(name);
			if (!nameValidation.isValid) {
				error = nameValidation.error!;
				return;
			}

			if (password !== confirmPassword) {
				passwordError = 'Passwords do not match';
				return;
			}

			const passwordValidation = validatePassword(password);
			if (!passwordValidation.isValid) {
				passwordError = passwordValidation.error!;
				return;
			}

			if (provider === 'alby') {
				const validateNsec = validateNostrPrivateKey(nsec);
				if (!validateNsec.isValid) {
					error = validateNsec.error!;
					return;
				}
			}

			if (!npub || !nsec) {
				// Generate Nostr keypair
				const sk = generateSecretKey();
				const npriv = bytesToHex(sk);
				nsec = npriv;
				npub = getPublicKey(sk);
			}

			const { encrypted, salt } = await encryptNostrPrivateKeyWithPassword(nsec, password);

			const data: NostrRegistrationData = {
				name,
				email,
				publicKey: npub,
				encryptedPrivateKey: encrypted.data,
				iv: encrypted.iv,
				authTag: encrypted.authTag,
				salt: salt,
				iterations: 100000
			};
			if (provider === 'passkey') data.authMethod = 'passkey';
			const res = await registerWithNostr(data);

			if (res.publicKey) {
				let accessToken: string | null = null;
				if (provider === 'alby') {
					const { challenge } = await getLoginChallenge();
					const signer = new NDKNip07Signer();
					const signerUser = await signer.user();
					if (!signerUser) {
						throw new Error('No user returned from Nostr');
					}
					const event = {
						kind: 22242,
						created_at: Math.floor(Date.now() / 1000),
						content: challenge,
						tags: [],
						pubkey: signerUser.pubkey
					};
					const signedEvent = await signer.sign(event);

					const res = await loginWithNostr(signerUser.pubkey, challenge, signedEvent);
					if (res.access_token) accessToken = res.access_token;
				} else if (provider === 'passkey') {
					const deviceId = await getDeviceIdentifier();
					const res = await loginWithPasskey(npub, deviceId);
					if (res.access_token) accessToken = res.access_token;
				}

				if (accessToken) {
					await Preferences.set({
						key: 'access_token',
						value: accessToken
					});
					user.updateProfile(res.user);
					authState.login();
					goto('/dashboard');
				}
			}
		} catch (err: any) {
			error = err || 'Registration failed';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="bg-base-200 flex flex-col items-center justify-center gap-4 px-4 py-10 md:pt-20">
	<div class="alert alert-warning w-full max-w-md">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="inline-block h-6 w-6 shrink-0 stroke-current"
			fill="none"
			viewBox="0 0 24 24"
			><path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
			/></svg
		>
		<div class="inline-block">
			<h3 class="font-bold">Important Security Notice</h3>
			<p class="text-sm">
				This password will be used to encrypt your account recovery key. If you lose this password,
				there will be no way to recover your account. Please store it securely.
			</p>
		</div>
	</div>

	<div class="card bg-base-100 w-full max-w-md shadow-xl">
		<div class="card-body">
			<h2 class="card-title mb-6 justify-center text-2xl font-bold">Complete Registration</h2>

			<form onsubmit={handleSubmit} class="space-y-4">
				<div class="form-control space-y-1">
					<label class="label" for="name">
						<span class="label-text">Name</span>
					</label>
					<input
						type="text"
						id="name"
						bind:value={name}
						placeholder="Enter your name"
						class="input input-bordered w-full"
						required
					/>
				</div>

				<div class="form-control space-y-1">
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

				<div class="form-control space-y-1">
					<label class="label" for="password">
						<span class="label-text">Recovery Password</span>
					</label>
					<input
						type="password"
						id="password"
						bind:value={password}
						placeholder="Enter a strong password"
						class="input input-bordered w-full {passwordError ? 'input-error' : ''}"
						required
					/>
				</div>

				<div class="form-control space-y-1">
					<label class="label" for="confirmPassword">
						<span class="label-text">Confirm Recovery Password</span>
					</label>
					<input
						type="password"
						id="confirmPassword"
						bind:value={confirmPassword}
						placeholder="Confirm your password"
						class="input input-bordered w-full {passwordError ? 'input-error' : ''}"
						required
					/>
					{#if passwordError}
						<span class="text-error text-sm">{passwordError}</span>
					{/if}
				</div>

				<div class="alert alert-info">
					<div class="flex items-start gap-3">
						<ul class="list-inside list-disc text-sm whitespace-nowrap">
							<li>Use at least 8 characters</li>
							<li>Include numbers and special characters</li>
							<li>Avoid using personal information</li>
						</ul>
					</div>
				</div>

				<button type="submit" class="btn btn-primary w-full" disabled={isLoading}>
					{#if isLoading}
						<span class="loading loading-spinner"></span>
					{:else}
						Set Recovery Password
					{/if}
				</button>
			</form>

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
					<span>{error}</span>
				</div>
			{/if}
		</div>
	</div>
</div>
