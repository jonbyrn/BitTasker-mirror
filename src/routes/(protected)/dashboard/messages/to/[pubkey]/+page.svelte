<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { fetchProfileMetadata } from '$lib/utils/nostr-message';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { nip19 } from 'nostr-tools';
	import ChatView from '$lib/components/messages/ChatView.svelte';
	import Avatar from '$lib/components/Avatar.svelte';

	// Get pubkey from URL
	let recipientPubkey = $derived(page.params.pubkey ?? '');

	// State
	let currentUserNpub = $state<string>('');
	let recipientProfile = $state<{ name?: string; picture?: string } | null>(null);
	let isLoading = $state(true);
	let error = $state('');

	onMount(async () => {
		try {
			// Get current user's npub
			currentUserNpub = await getNpub();

			// Validate and process recipient pubkey
			let hexPubkey = recipientPubkey;

			// Convert npub to hex if needed
			if (recipientPubkey.startsWith('npub')) {
				try {
					hexPubkey = nip19.decode(recipientPubkey).data.toString();
				} catch {
					error = 'Invalid npub format';
					isLoading = false;
					return;
				}
			} else if (!/^[a-fA-F0-9]{64}$/.test(recipientPubkey)) {
				error = 'Invalid public key format';
				isLoading = false;
				return;
			}

			// Update the pubkey to hex format for consistency
			if (hexPubkey !== recipientPubkey) {
				goto(`/dashboard/messages/to/${hexPubkey}`, { replaceState: true });
				return;
			}

			// Fetch recipient profile
			try {
				const profile = await fetchProfileMetadata(hexPubkey);
				recipientProfile = profile;
			} catch (profileErr) {
				console.error('Failed to fetch recipient profile:', profileErr);
				// Continue even if profile fetch fails
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load chat';
		} finally {
			isLoading = false;
		}
	});

	function goBackToMessages() {
		goto('/dashboard/messages');
	}
</script>

<div class="bg-base-100 flex h-full max-h-screen flex-col rounded-[2rem]">
	{#if isLoading}
		<!-- Loading State -->
		<div class="flex h-full items-center justify-center">
			<div class="loading loading-spinner loading-lg"></div>
		</div>
	{:else if error}
		<!-- Error State -->
		<div class="flex h-full flex-col items-center justify-center">
			<div class="alert alert-error alert-outline max-w-md">
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
			<button class="btn btn-primary mt-4" onclick={goBackToMessages}> Back to Messages </button>
		</div>
	{:else}
		<!-- ChatView Component -->
		<div class="min-h-0 flex-1 overflow-hidden">
			<ChatView
				{recipientPubkey}
				currentUserPubkey={currentUserNpub}
				initialProfile={recipientProfile}
			/>
		</div>
	{/if}
</div>
