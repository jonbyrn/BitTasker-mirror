<script lang="ts">
	import { CheckUsernameAvailabilityStore } from '$houdini';
	import { validateUsername } from '$lib/utils/helpers/validators';
    import IconCheck from '~icons/mdi/check-circle-outline';

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
            <div class="step-indicator text-primary mb-2 text-sm font-medium text-end">Step 1 of 7</div>
            <h3 class="step-title mb-3 mt-4">Choose Your Username</h3>
            <h5 class="mb-3">Make it memorable</h5>

            <div class="features-list mb-6 space-y-2 text-left mx-auto max-w-lg">
                <div class="feature-item flex items-center justify-start gap-2 text-lg">
                    <IconCheck class="text-primary min-w-[1.5em]" />
                    <span><strong>Claim your name</strong> — your dedicated name on BitTasker</span>
                </div>
                <div class="feature-item flex items-center justify-start gap-2 text-lg">
                    <IconCheck class="text-primary min-w-[1.5em]" />
                    <span><strong>Professional</strong> — use your brand or real name</span>
                </div>
                <div class="feature-item flex items-center justify-start gap-2 text-lg">
                    <IconCheck class="text-primary min-w-[1.5em]" />
                    <span><strong>Shareable</strong> — appears on your public profile and links</span>
                </div>
                <div class="feature-item flex items-center justify-start gap-2 text-lg">
                    <IconCheck class="text-primary min-w-[1.5em]" />
                    <span><strong>Nostr‑portable</strong> — one handle across compatible Nostr apps</span>
                </div>
            </div>

            <p class="text-primary mb-6 text-lg">First impressions matter — make yours stand out.</p>
        </div>

        <form onsubmit={handleSubmit} class="space-y-4">
			<!-- Username Field -->
			<div class="form-control max-w-lg mx-auto">
				<label class="label" for="username">
                    <span class="label-text text-base-content">Username</span>
				</label>
				<input
					type="text"
					id="username"
					bind:value={username}
                    autofocus
					class="input input-bordered w-full {usernameError ? 'input-error' : ''}"
					placeholder="Choose a username"
					required
				/>
                <div class="label">
                    <span class="label-text-alt text-base-content/70">
                        3+ characters. Letters, numbers, dashes and underscores work best.
                    </span>
                </div>
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
