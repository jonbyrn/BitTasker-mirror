<script lang="ts">
	import { nip19 } from 'nostr-tools';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { validateNostrPrivateKey } from '$lib/utils/helpers/validators';
    import IconCheck from '~icons/mdi/check-circle-outline';

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
    // Ref to the input element (stateful to satisfy linter)
    let privateKeyInput = $state<HTMLInputElement | null>(null);

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

    // Focus the private key field when the import option is enabled
    $effect(() => {
        importNostrKey;
        if (importNostrKey) {
            // Defer to next frame to ensure the element is mounted
            requestAnimationFrame(() => privateKeyInput?.focus());
        }
    });
</script>

<div class="card bg-base-100 w-full shadow-xl">
	<div class="card-body">
		<!-- Educational Header -->
    <div class="education-header mb-6 text-center">
            <div class="step-indicator text-primary mb-2 text-sm font-medium text-end">Step 2 of 7 - Optional</div>
            <h3 class="step-title mb-3 mt-4">
                Import Your Nostr Key (Optional)
            </h3>
            <h5 class="mb-3">What is a Nostr key?</h5>
            <p class="step-description text-base-content mb-6 text-lg max-w-xl mx-auto">
                A Nostr private key (nsec…) is like your Bitcoin private key: it gives you ownership of your data. <br /><br />You can import an existing key, or let us generate one for you.
            </p>

            <!-- Features List (style matched to PasskeySetup) -->
            <div class="features-list mb-6 space-y-2 text-left mx-auto w-fit">
                <div class="feature-item flex items-center justify-start gap-2 text-lg">
                    <IconCheck class="text-primary min-w-[1.5em]" />
                    <span><strong>Use existing</strong> — import your nsec to keep your identity</span>
                </div>
                <div class="feature-item flex items-center justify-start gap-2 text-lg">
                    <IconCheck class="text-primary min-w-[1.5em]" />
                    <span><strong>Generate new</strong> — we’ll create a secure key if you don’t have one</span>
                </div>
                <div class="feature-item flex items-center justify-start gap-2 text-lg">
                    <IconCheck class="text-primary min-w-[1.5em]" />
                    <span><strong>Manage anytime</strong> — view/export your key in App Settings</span>
                </div>
                <div class="feature-item flex items-center justify-start gap-2 text-lg">
                    <IconCheck class="text-primary min-w-[1.5em]" />
                    <span><strong>Stored Securely</strong> — encrypted on your device so we can't see it</span>
                </div>
            </div>

            <p class="text-primary mb-6 text-lg">You control access. Keep your key safe.</p>
        </div>

		<form onsubmit={handleSubmit} class="space-y-4">
			<!-- Nostr Key Import Option -->
			<div class="form-control max-w-xl mx-auto">
				<label class="label flex cursor-pointer items-center justify-start gap-2">
					<input type="checkbox" bind:checked={importNostrKey} class="checkbox checkbox-sm" />
					<div class="flex items-center gap-2">
						<span class="label-text text-base-content">Import existing Nostr key (nsec)</span>
					</div>
				</label>
			</div>

			<!-- Private Key Field (Only shown if import is checked) -->
			{#if importNostrKey}
				<div class="form-control max-w-xl mx-auto" in:fly={{ duration: 200, y: -20, easing: linear }}>
					<label class="label" for="privateKey">
						<span class="label-text text-base-content">Private Key (nsec)</span>
					</label>
					<div class="relative">
                        <input
							type={showPrivateKey ? 'text' : 'password'}
							id="privateKey"
							bind:value={nsec}
                            bind:this={privateKeyInput}
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
			{/if}

			<!-- Form Actions -->
			<div class="mt-6 flex justify-between">
				<button type="button" class="btn btn-outline" onclick={prevStep}>Back</button>
				<button type="submit" class="btn btn-primary">Next</button>
			</div>
		</form>
	</div>
</div>
