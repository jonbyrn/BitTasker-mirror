<script lang="ts">
	import { Connect, ConnectURI } from '@nostr-connect/connect';
	import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
	import { bytesToHex } from '@noble/hashes/utils';
	import { goto } from '$app/navigation';
	import NDK, { NDKNip07Signer } from '@nostr-dev-kit/ndk';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	const ndk = new NDK({
		explicitRelayUrls: ['wss://relay.nostr.band', 'wss://relay.damus.io', 'wss://relay.ayu.io', 'wss://purplepag.es'],
		// signer: new NDKNip07Signer()
	})

	if(browser){
		ndk.connect().then(() => {
			console.log('connected')
		})
	}


	function login() {
		console.log('login')
		const signer = new NDKNip07Signer();
		signer.user().then((user) => {
			console.log('User signed in', user);
		})
	}

	// onMount(async () => {
	// 	const sk = generateSecretKey();
	// 	const user = ndk.getUser({
	// 		npub: getPublicKey(sk)
	// 	});
	// 	// const eventPromise = await ndk.fetchEvents({kinds: [1], authors: [user.pubkey]})
	// 	console.log({user});
	// });

	let username = $state('');
	let password = $state('');
	let selectedProvider = $state('');
	let isLoading = $state(false);
	let error = $state('');

	async function generateLoginChallenge() {
		const array = new Uint8Array(32);
		crypto.getRandomValues(array);
		const challenge = Array.from(array)
			.map(b => b.toString(16).padStart(2, '0'))
			.join('');
		return {
			challenge,
			message: `Sign this message to login: ${challenge}`
		};
	}

	async function handleSignup() {
		try {
			isLoading = true;
			error = '';

			if (!username || !password) {
				error = 'Please fill in all fields';
				return;
			}

			// Generate a challenge
			const { challenge, message } = await generateLoginChallenge();

			// Generate a key pair from the password
			const passwordBuffer = new TextEncoder().encode(password);
			const passwordHash = await crypto.subtle.digest('SHA-256', passwordBuffer);
			const secretKey = bytesToHex(new Uint8Array(passwordHash));
			const publicKey = getPublicKey(secretKey);

			// Create and sign the event
			const event = {
				kind: 27235, // Custom kind for signup
				created_at: Math.floor(Date.now() / 1000),
				tags: [
					['challenge', challenge],
					['email', username]
				],
				content: message,
				pubkey: publicKey
			};

			// const signedEvent = await signEvent(event, secretKey);

			// TODO: Send the signed event to your backend
			// const response = await fetch('/api/auth/signup', {
			//     method: 'POST',
			//     headers: { 'Content-Type': 'application/json' },
			//     body: JSON.stringify({
			//         event: signedEvent,
			//         email: username
			//     })
			// });

			// if (response.ok) {
			//     await goto('/dashboard');
			// } else {
			//     error = 'Signup failed. Please try again.';
			// }

			// For now, just log the signed event
			// console.log('Signed event:', signedEvent);
			await goto('/dashboard');

		} catch (e) {
			error = e.message || 'An error occurred during signup';
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
				<label class="label" for="username">
					<span class="label-text">Email</span>
				</label>
				<input
					type="email"
					id="username"
					bind:value={username}
					placeholder="Enter your email"
					class="input input-bordered w-full"
				/>
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
					class="input input-bordered w-full"
				/>
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
