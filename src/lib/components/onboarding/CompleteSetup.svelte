<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { subscribeToProfileUpdates } from '$lib/nostr/profile';
	import { getNostrKeyPair } from '$lib/utils/nostrKeys';
	import { bytesToHex } from '@noble/hashes/utils';
	import nip44 from '$lib/nostr/nip44';

	let { restartSetup }: { restartSetup: () => void } = $props();

	// Completion status
	let isLoading = $state(true);
	let isComplete = $state(false);
	let missingFields = $state<string[]>([]);
	let error = $state('');
	let cleanup: (() => void) | null = null;

	// Profile data
	let profile = $state({
		displayName: '',
		professionalTitle: '',
		about: '',
		picture: null,
		location: null
	});

	// Handle restart setup click - destroy component first
	function handleRestartSetup() {
		restartSetup();
	}

	function checkCompletionStatus() {
		const missing: string[] = [];

		if (!profile.displayName) missing.push('Display Name');
		if (!profile.professionalTitle) missing.push('Professional Title');
		if (!profile.about) missing.push('About');
		if (!profile.picture) missing.push('Profile Picture');
		if (!profile.location) missing.push('Location');

		missingFields = missing;
		isComplete = missing.length === 0;
		isLoading = false;
	}

	onMount(async () => {
		// Subscribe to profile metadata and location updates
		cleanup = await subscribeToProfileUpdates(
			async (event) => {
				isLoading = true;
				try {
					if (event.kind === 0) {
						// Handle profile metadata
						const metadata = JSON.parse(event.content);
						profile.displayName = metadata.displayName || '';
						profile.professionalTitle = metadata.professionalTitle || '';
						profile.about = metadata.about || '';
						profile.picture = metadata.pictures?.[0]?.url || null;
						checkCompletionStatus();
					} else if (event.kind === 30063) {
						// Handle profile images
						const images = JSON.parse(event.content);
						if (images.length > 0) {
							profile.picture = images[0].url;
						}
					} else if (
						event.kind === 30005 &&
						event.tags.find((t) => t[0] === 'd' && t[1] === 'location')
					) {
						// Handle location data
						try {
							const keyPair = await getNostrKeyPair();
							const nsec = bytesToHex(keyPair.nsec);
							const conversationKey = await nip44.getConversationKey(nsec, keyPair.npub);
							const decryptedContent = await nip44.decrypt(event.content, conversationKey);

							const locationData = JSON.parse(decryptedContent);
							profile.location = locationData;
							checkCompletionStatus();
						} catch (err) {
							console.error('Failed to parse location data:', err);
						}
					}
				} catch (err) {
					console.error('Failed to process profile update:', err);
					error = 'Failed to connect to Nostr relay. Please try again later.';
				} finally {
					isLoading = false;
				}
			},
			{
				0: null, // Kind 0 for profile metadata
				30063: { d: 'profile-images' },
				30005: { d: 'location' } // Kind 30005 for location data
			}
		);
	});

	onDestroy(() => {
		if (cleanup) cleanup();
	});
</script>

<div class="card bg-base-100 w-full shadow-xl">
	<div class="card-body">
		{#if isLoading}
			<div class="flex min-h-96 flex-col items-center justify-center space-y-4 text-center">
				<div>
					<span class="loading loading-spinner loading-lg"></span>
					<p class="text-base-content/70">Checking your onboarding status...</p>
				</div>
			</div>
		{:else if error}
			<div class="flex flex-col items-center space-y-4 text-center">
				<div class="text-error mt-2">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-16 w-16"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
				</div>
				<h2 class="text-xl font-bold">Something went wrong</h2>
				<p class="text-base-content/70">{error}</p>
				<button class="btn btn-primary mt-4" onclick={handleRestartSetup}>Try Again</button>
			</div>
		{:else if !isComplete}
			<div class="flex flex-col items-center space-y-4 text-center">
				<div class="text-error mt-2">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-16 w-16"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
				</div>
				<h2 class="text-xl font-bold">Oops! Your profile is not complete</h2>

				{#if missingFields.length > 0}
					<div class="mt-2 w-full space-y-2 text-start">
						<p class="font-medium">Missing information:</p>
						<ul class="text-base-content/70 list-inside list-disc text-start text-sm">
							{#each missingFields as field}
								<li>{field}</li>
							{/each}
						</ul>
					</div>
				{/if}

				<p class="text-base-content/70">
					Don't worry you can continue using BitTasker, and complete your onboarding process later.
					<br /> <br />
					Or you can restart the onboarding process.
				</p>
				<div class="mt-4 flex max-w-md flex-col items-center space-y-4">
					<button class="btn btn-primary w-full" onclick={handleRestartSetup}>
						Restart Setup
					</button>
					<button class="btn btn-secondary w-full" onclick={() => goto('/dashboard/find-tasks')}>
						Continue without completing
					</button>
				</div>
			</div>
		{:else}
			<div class="flex flex-col items-center space-y-4 text-center">
				<div class="text-success mt-2">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-16 w-16"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
				</div>
				<h2 class="text-xl font-bold">Your account is ready!</h2>
				<p class="text-base-content/70">
					You've successfully completed the onboarding process and your BitTasker account is now
					active.
				</p>
				<div class="mt-2 space-y-2">
					<p class="font-medium">What's next?</p>
					<ul class="text-base-content/70 list-inside list-disc text-start text-sm">
						<li>Browse available tasks or create your own</li>
						<li>Complete your profile to attract more clients</li>
						<li>Set up your payment preferences</li>
						<li>Explore the platform features</li>
					</ul>
				</div>
				<button class="btn btn-primary mt-6" onclick={() => goto('/dashboard/find-tasks')}>
					Find Tasks
				</button>
			</div>
		{/if}
	</div>
</div>
