<script lang="ts">
	import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
	import { bytesToHex } from '@noble/hashes/utils';
	import NDK, { NDKNip07Signer } from '@nostr-dev-kit/ndk';
	import { browser } from '$app/environment';
	import { PUBLIC_NOSTR_RELAY_URL } from '$env/static/public';
	import { encryptNostrPrivateKeyWithPassword, generateLoginChallenge } from '$lib/utils/helpers/auth';

	const ndk = new NDK({ explicitRelayUrls: [PUBLIC_NOSTR_RELAY_URL] });

	if(browser){
		ndk.connect().then(() => { console.log('connected') });
	}

	function login() {
		console.log('login')
		const signer = new NDKNip07Signer();
		signer.user().then((user) => {
			console.log('User signed in', user);
		});
	}

	// onMount(async () => {
	// 	const sk = generateSecretKey();
	// 	const user = ndk.getUser({
	// 		npub: getPublicKey(sk)
	// 	});
	// 	// const eventPromise = await ndk.fetchEvents({kinds: [1], authors: [user.pubkey]})
	// 	console.log({user});
	// });

	let email = $state<string>('');
	let password = $state<string>('');
	let isLoading = $state<boolean>(false);
	let error = $state<string>('');
	let emailError = $state<string>('');
	let passwordError = $state<string>('');

	const validateEmail = (email: string): boolean => {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!email) {
			emailError = 'Email is required';
			return false;
		}
		if (!emailRegex.test(email)) {
			emailError = 'Please enter a valid email address';
			return false;
		}
		emailError = '';
		return true;
	};

	const validatePassword = (password: string): boolean => {
		if (!password) {
			passwordError = 'Password is required';
			return false;
		}
		if (password.length < 8) {
			passwordError = 'Password must be at least 8 characters long';
			return false;
		}
		if (!/[A-Z]/.test(password)) {
			passwordError = 'Password must contain at least one uppercase letter';
			return false;
		}
		if (!/[a-z]/.test(password)) {
			passwordError = 'Password must contain at least one lowercase letter';
			return false;
		}
		if (!/[0-9]/.test(password)) {
			passwordError = 'Password must contain at least one number';
			return false;
		}
		if (!/[!@#$%^&*]/.test(password)) {
			passwordError = 'Password must contain at least one special character (!@#$%^&*)';
			return false;
		}
		passwordError = '';
		return true;
	};

	async function handleSignup() {
		try {
			isLoading = true;
			error = '';
			emailError = '';
			passwordError = '';

			const isEmailValid = validateEmail(email);
			const isPasswordValid = validatePassword(password);

			// if (!isEmailValid || !isPasswordValid) {
			// 	return;
			// }

			const sk = generateSecretKey();
			const pk = getPublicKey(sk);
			const npriv = bytesToHex(sk);
			const { encrypted, salt } = await encryptNostrPrivateKeyWithPassword(npriv, password);

			console.log({ encrypted, salt })

		} catch (err) {
			error = (err as Error)?.message || 'An error occurred during signup';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="bg-base-200 flex min-h-screen flex-col items-center justify-center p-4">
	<div class="card bg-base-100 w-96 shadow-xl">
		<div class="card-body">
			<h2 class="card-title">Sign Up with Nostr</h2>

			<!-- Email Input -->
			<div class="form-control space-y-2">
				<label class="label" for="email">
					<span class="label-text">Email</span>
				</label>
				<input
					type="email"
					id="email"
					bind:value={email}
					placeholder="Enter your email"
					class="input input-bordered w-full {emailError ? 'input-error' : ''}"
					onblur={() => validateEmail(email)}
				/>
				{#if emailError}
					<span class="text-error text-sm">{emailError}</span>
				{/if}
			</div>

			<!-- Password Input -->
			<div class="form-control space-y-2">
				<label class="label" for="password">
					<span class="label-text">Password</span>
				</label>
				<input
					type="password"
					id="password"
					bind:value={password}
					placeholder="Enter your password"
					class="input input-bordered w-full {passwordError ? 'input-error' : ''}"
					onblur={() => validatePassword(password)}
				/>
				{#if passwordError}
					<span class="text-error text-sm">{passwordError}</span>
				{/if}
				<div class="text-sm text-gray-600 mt-1">
					Password must:
					<ul class="list-disc list-inside">
						<li>Be at least 8 characters long</li>
						<li>Contain at least one uppercase letter</li>
						<li>Contain at least one lowercase letter</li>
						<li>Contain at least one number</li>
						<li>Contain at least one special character (!@#$%^&*)</li>
					</ul>
				</div>
			</div>

			<!-- Error Display -->
			{#if error}
				<div class="alert alert-error mt-4">
					<span>{error}</span>
				</div>
			{/if}

			<!-- Submit Button -->
			<div class="card-actions mt-6 justify-end">
				<button class="btn btn-primary" onclick={handleSignup} disabled={isLoading}>
					{isLoading ? 'Signing up...' : 'Sign Up'}
				</button>
			</div>
		</div>
	</div>
</div>
