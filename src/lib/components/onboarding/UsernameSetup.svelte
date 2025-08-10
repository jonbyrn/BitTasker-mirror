<script lang="ts">
	import { CheckUsernameAvailabilityStore } from '$houdini';
	import { validateUsername } from '$lib/utils/helpers/validators';

	let {
		nextStep,
		onUsernameChange
	}: {
		nextStep: () => void;
		onUsernameChange: (username: string, isAvailable: boolean) => void;
	} = $props();

	// Create the store for username availability checking
	const usernameStore = new CheckUsernameAvailabilityStore();

	// User data
	let username = $state('');
	let isCheckingUsername = $state(false);
	let usernameError = $state('');
	let usernameAvailable = $state(false);

	async function checkUsernameAvailability() {
		if (!username) {
			usernameError = 'Username is required';
			usernameAvailable = false;
			onUsernameChange(username, false);
			return;
		}

		const validation = validateUsername(username);
		if (!validation.isValid) {
			usernameError = validation.error!;
			usernameAvailable = false;
			onUsernameChange(username, false);
			return;
		}

		try {
			isCheckingUsername = true;
			usernameError = '';

			const { data, errors } = await usernameStore.fetch({
				variables: {
					username
				}
			});

			if (errors) {
				throw new Error(errors[0].message);
			}

			usernameAvailable = data?.checkUsernameAvailability || false;

			if (!usernameAvailable) {
				usernameError = 'Username is already taken';
			}

			onUsernameChange(username, usernameAvailable);
		} catch (err) {
			usernameError = 'Failed to check username availability';
			usernameAvailable = false;
			onUsernameChange(username, false);
		} finally {
			isCheckingUsername = false;
		}
	}

	async function handleSubmit() {
		// Check username availability when Next button is clicked
		await checkUsernameAvailability();
		
		// Only proceed if username is available
		if (usernameAvailable && username) {
			nextStep();
		}
	}
</script>

<div class="card bg-base-100 w-full shadow-xl">
	<div class="card-body">
		<!-- Educational Header -->
		<div class="education-header mb-6 text-center">
			<div class="step-indicator text-sm font-medium text-primary mb-2 text-end">Step 1 of 7</div>
			<h2 class="step-title !text-xl font-bold mb-3 mt-4">Choose Your Username</h2>
			<p class="step-description text-base-content/70 mb-4">
				This is your username on Nostr, the secure, Bitcoin-native decentralized network.
			</p>
		</div>

		<form onsubmit={handleSubmit} class="space-y-4">
			<!-- Username Field -->
			<div class="form-control">
				<label class="label" for="username">
					<span class="label-text">Username</span>
				</label>
				<input
					type="text"
					id="username"
					bind:value={username}
					class="input input-bordered w-full {usernameError ? 'input-error' : ''}"
					placeholder="Choose a username"
					required
				/>
				{#if usernameError}
					<label class="label" for="username">
						<span class="label-text-alt text-error">{usernameError}</span>
					</label>
				{/if}
			</div>

			<!-- Form Actions -->
			<div class="mt-6 flex justify-between">
				<div></div> <!-- Empty div for spacing since there's no back on step 1 -->
				<button type="submit" class="btn btn-primary" disabled={!username || isCheckingUsername}>
					{#if isCheckingUsername}
						<span class="loading loading-spinner loading-sm"></span>
						Checking...
					{:else}
						Next
					{/if}
				</button>
			</div>
		</form>
	</div>
</div>
