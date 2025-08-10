<script lang="ts">
	import { nip19 } from 'nostr-tools';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { validateNostrPrivateKey } from '$lib/utils/helpers/validators';

	let {
		nextStep,
		prevStep,
		onNostrKeyChange
	}: {
		nextStep: () => void;
		prevStep: () => void;
		onNostrKeyChange: (nsec: string, hasKey: boolean) => void;
	} = $props();

	// User data
	let nsec = $state('');
	let importNostrKey = $state(false);
	let nsecError = $state('');
	let showPrivateKey = $state(false);

	function validateNostrKey(key: string): { isValid: boolean; error?: string } {
		// First use the basic validator
		const basicValidation = validateNostrPrivateKey(key);
		if (!basicValidation.isValid) {
			return basicValidation;
		}

		// Then verify it can be properly decoded with nostr-tools
		try {
			const { type } = nip19.decode(key);
			if (type !== 'nsec') {
				return { isValid: false, error: 'Invalid Nostr private key format' };
			}
			return { isValid: true };
		} catch (err) {
			return { isValid: false, error: 'Invalid Nostr private key. Please check your key and try again.' };
		}
	}

	function handleSubmit() {
		nsecError = '';

		// If importing key, validate it
		if (importNostrKey && nsec) {
			const validation = validateNostrKey(nsec);
			if (!validation.isValid) {
				nsecError = validation.error!;
				return;
			}
		}

		// Update parent with key data
		onNostrKeyChange(nsec, importNostrKey && !!nsec);
		nextStep();
	}

	// Update parent when checkbox changes
	$effect(() => {
		if (!importNostrKey) {
			nsec = '';
			nsecError = '';
		}
		onNostrKeyChange(nsec, importNostrKey && !!nsec);
	});
</script>

<div class="card bg-base-100 w-full shadow-xl">
	<div class="card-body">
		<!-- Educational Header -->
		<div class="education-header mb-6 text-center">
			<div class="step-indicator text-sm font-medium text-primary mb-2 text-end">Step 2 of 7 - Optional</div>
			<h2 class="step-title !text-xl font-bold mb-3 mt-4">
				<span class="mr-2">🔐</span>
				Import Your Nostr Key
			</h2>
			<p class="step-description text-base-content/70 mb-6">
				If you have an existing Nostr key, you can enter it here and use your existing account on BitTasker. 
				If not, don't worry, we'll generate one for you and you can access it in the app settings at any time. 
				This key is similar to your Bitcoin key, so you must keep it secret at all times.
			</p>
		</div>

		<form onsubmit={handleSubmit} class="space-y-4">
			<!-- Nostr Key Import Option -->
			<div class="form-control">
				<label class="label flex cursor-pointer items-center justify-start gap-2">
					<input type="checkbox" bind:checked={importNostrKey} class="checkbox checkbox-sm" />
					<div class="flex items-center gap-2">
						<span class="label-text">Import existing Nostr key (nsec)</span>
					</div>
				</label>
			</div>

			<!-- Private Key Field (Only shown if import is checked) -->
			{#if importNostrKey}
				<div class="form-control" in:fly={{ duration: 200, y: -20, easing: linear }}>
					<label class="label" for="privateKey">
						<span class="label-text">Private Key (nsec)</span>
					</label>
					<div class="relative">
						<input
							type={showPrivateKey ? 'text' : 'password'}
							id="privateKey"
							bind:value={nsec}
							class="input input-bordered w-full pr-10 {nsecError ? 'input-error' : ''}"
							placeholder="Enter your Nostr private key (nsec1...)"
							required
						/>
						<button
							type="button"
							class="absolute inset-y-0 right-0 flex items-center pr-3"
							onclick={() => (showPrivateKey = !showPrivateKey)}
						>
							{#if showPrivateKey}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-5 w-5"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
									/>
								</svg>
							{:else}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-5 w-5"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
									/>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
									/>
								</svg>
							{/if}
						</button>
					</div>
					{#if nsecError}
						<label class="label" for="privateKey">
							<span class="label-text-alt text-error">{nsecError}</span>
						</label>
					{/if}
				</div>
			{:else}
				<div
					class="alert alert-info alert-outline mt-4 rounded-2xl text-sm"
					in:fly={{ duration: 200, y: -20, easing: linear }}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6 shrink-0"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<span>
						We'll generate a secure Nostr key for you automatically. You can view and backup your key 
						anytime in the app settings.
					</span>
				</div>
			{/if}

			<!-- Form Actions -->
			<div class="mt-6 flex justify-between">
				<button type="button" class="btn btn-outline" onclick={prevStep}>Back</button>
				<button type="submit" class="btn btn-primary">Next</button>
			</div>
		</form>
	</div>
</div>
