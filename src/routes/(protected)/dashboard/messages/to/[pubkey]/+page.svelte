<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { fetchProfileMetadata } from '$lib/utils/nostr-message';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { nip19 } from 'nostr-tools';
	import ChatView from '$lib/components/messages/ChatView.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import { t } from 'svelte-i18n';

	// Get pubkey from URL
	let recipientPubkey = $derived($page.params.pubkey);

	// State
	let currentUserNpub = $state<string>('');
	let recipientProfile = $state<{ name?: string; picture?: string } | null>(null);
	let isLoading = $state(true);
	let error = $state('');
	let copySuccess = $state(false);

	onMount(async () => {
		try {
			// Get current user's npub
			currentUserNpub = await getNpub();

			// Validate and process recipient pubkey
			let hexPubkey = recipientPubkey;

			// Convert npub to hex if needed
			if (recipientPubkey.startsWith('npub')) {
				try {
					hexPubkey = nip19.decode(recipientPubkey).data as string;
				} catch {
					error = $t('messages.invalid_npub_format');
					isLoading = false;
					return;
				}
			} else if (!/^[a-fA-F0-9]{64}$/.test(recipientPubkey)) {
				error = $t('messages.invalid_pubkey_format');
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
			error = err instanceof Error ? err.message : $t('messages.failed_to_load_chat');
		} finally {
			isLoading = false;
		}
	});

	function goBackToMessages() {
		goto('/dashboard/messages');
	}

	async function copyPubkey() {
		try {
			await navigator.clipboard.writeText(recipientPubkey);
			copySuccess = true;
			setTimeout(() => {
				copySuccess = false;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy pubkey:', err);
		}
	}
</script>

<div class="bg-base-100 mx-2 md:mx-auto max-w-7xl p-4 md:p-0 rounded-2xl shadow-lg mt-8 md:mt-4 ">
	{#if isLoading}
		<!-- Loading State -->
		<div class="flex h-full items-center justify-center">
			<div class="loading loading-spinner loading-md text-primary"></div>
		</div>
	{:else if error}
		<!-- Error State -->
		<div class="flex h-full flex-col items-center justify-center p-6">
			<div class="text-center space-y-4 max-w-md">
				<div class="alert alert-error alert-outline">
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
				<button class="btn btn-primary" onclick={goBackToMessages}> 
					{$t('messages.back_to_messages')} 
				</button>
			</div>
		</div>
	{:else}
		<!-- Chat Header with Back Button -->
		<div class="flex flex-shrink-0 items-center border-b border-base-300/20">
			<!-- Back Button -->
			<button
				class="btn btn-ghost btn-sm hover:bg-base-200 transition-colors flex-shrink-0 ml-2"
				onclick={goBackToMessages}
				aria-label={$t('messages.go_back_to_messages')}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M15 19l-7-7 7-7"
					/>
				</svg>
			</button>

			<!-- Recipient Info -->
			<div class="flex flex-1 items-center justify-between min-w-0 p-0 md:p-4">
				<div class="flex items-center gap-2 min-w-0 flex-1">
					<div class="flex-shrink-0">
						<Avatar
							name={recipientProfile?.name || $t('messages.unknown')}
							picture={recipientProfile?.picture || undefined}
							size="sm"
						/>
					</div>
					<div class="min-w-0 flex-1">
						<h4 class="text-base font-medium truncate">
							{recipientProfile?.name || `${recipientPubkey.slice(0, 8)}...`}
						</h4>
					</div>
				</div>

				<!-- Action Buttons -->
				<div class="flex items-center gap-2 flex-shrink-0">
					<!-- Copy Public Key Button -->
					<button
						class="btn btn-ghost btn-sm hover:bg-base-200 transition-colors relative"
						onclick={copyPubkey}
						title={copySuccess ? $t('messages.copied') : $t('messages.copy_public_key')}
						aria-label={copySuccess ? $t('messages.copied') : $t('messages.copy_public_key')}
					>
						{#if copySuccess}
							<!-- Check icon for success state -->
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4 text-success"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M5 13l4 4L19 7"
								/>
							</svg>
						{:else}
							<!-- Copy icon -->
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
								/>
							</svg>
						{/if}
					</button>
				</div>
			</div>
		</div>

		<!-- ChatView Component -->
		<div class="flex-1 overflow-hidden">
			<ChatView
				{recipientPubkey}
				currentUserPubkey={currentUserNpub}
				initialProfile={recipientProfile}
			/>
		</div>
	{/if}
</div>
