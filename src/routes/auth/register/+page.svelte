<script lang="ts">
	import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
	import { bytesToHex } from '@noble/hashes/utils';
	import { encryptNostrPrivateKeyWithPassword } from '$lib/utils/helpers/auth';
	import { validateEmail, validatePassword, validateName } from '$lib/utils/helpers/validators';
	import { registerWithNostr } from '$lib/services/auth.service';

	let email = $state<string>('');
	let name = $state<string>('');
	let password = $state<string>('');
	let isLoading = $state<boolean>(false);
	let error = $state<string>('');
	let emailError = $state<string>('');
	let nameError = $state<string>('');
	let passwordError = $state<string>('');

	async function handleSignup() {
		try {
			isLoading = true;
			error = '';
			emailError = '';
			nameError = '';
			passwordError = '';

			const emailValidation = validateEmail(email);
			const nameValidation = validateName(name);
			const passwordValidation = validatePassword(password);

			if (!emailValidation.isValid) {
				emailError = emailValidation.error!;
				return;
			}

			if (!nameValidation.isValid) {
				nameError = nameValidation.error!;
				return;
			}

			if (!passwordValidation.isValid) {
				passwordError = passwordValidation.error!;
				return;
			}

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
				iterations: 100000
			});

			console.log({ res });
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
			<h2 class="card-title mb-6 justify-center text-2xl font-bold">Sign up to Bittasker</h2>

			<!-- Name Input -->
			<div class="form-control space-y-2">
				<label class="label" for="name">
					<span class="label-text">Full Name</span>
					<span class="label-text-alt text-gray-500">(First and Last Name)</span>
				</label>
				<input
					type="text"
					id="name"
					bind:value={name}
					placeholder="e.g. John Smith"
					class="input input-bordered w-full {nameError ? 'input-error' : ''}"
					onblur={() => {
						const validation = validateName(name);
						nameError = validation.error || '';
					}}
				/>
				{#if nameError}
					<span class="text-error text-sm">{nameError}</span>
				{/if}
			</div>

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
					onblur={() => {
						const validation = validateEmail(email);
						emailError = validation.error || '';
					}}
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
					onblur={() => {
						const validation = validatePassword(password);
						passwordError = validation.error || '';
					}}
				/>
				{#if passwordError}
					<span class="text-error text-sm">{passwordError}</span>
				{/if}
				<!-- TODO: Implement better UI for password requirements -->
				<!-- <div class="mt-1 text-sm text-gray-600">
					Password must:
					<ul class="list-inside list-disc">
						<li>Be at least 8 characters long</li>
						<li>Contain at least one uppercase letter</li>
						<li>Contain at least one lowercase letter</li>
						<li>Contain at least one number</li>
						<li>Contain at least one special character (!@#$%^&*)</li>
					</ul>
				</div> -->
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
