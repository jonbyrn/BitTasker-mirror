<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { nip19 } from 'nostr-tools';
	import { lookupChatProfile } from '$lib/nostr/direct-messages';
	import { conversationPeerLabel } from '$lib/nostr/profile/peer-label';
	import { profileIdentityRevision } from '$lib/stores/profile-identity.store';
	import { t } from 'svelte-i18n';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { get } from 'svelte/store';
	import { muteStore } from '$lib/stores/mute.store';
	import ChatView from '$lib/components/messages/ChatView.svelte';
	import TranslationSettings from '$lib/components/translation/TranslationSettings.svelte';

	// Get pubkey from URL
	let recipientPubkey = $derived($page.params.pubkey);

	// State
	let currentUserNpub = $state<string>('');
	let recipientProfile = $state<{ name?: string; picture?: string } | null>(null);
	let isLoading = $state(true);
	let error = $state('');
	let copySuccess = $state(false);

	$effect(() => {
		const revision = $profileIdentityRevision;
		const pubkey = recipientPubkey;
		if (revision === 0 || !pubkey) return;
		void lookupChatProfile(pubkey).then((profile) => {
			recipientProfile = {
				name: profile?.name || undefined,
				picture: profile?.picture || undefined
			};
		});
	});

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
				goto(resolve('/(app)/(protected)/messages/to/[pubkey]', { pubkey: hexPubkey }), {
					replaceState: true
				});
				return;
			}

			// Redirect silently if this user is muted — no error needed
			if (get(muteStore).mutedPubkeys.has(hexPubkey)) {
				goto(resolve('/(app)/(protected)/messages'), { replaceState: true });
				return;
			}

			// Fetch recipient profile
			try {
				const profile = await lookupChatProfile(hexPubkey);
				recipientProfile = {
					name: profile?.name || undefined,
					picture: profile?.picture || undefined
				};
			} catch (err) {
				console.error('Failed to fetch recipient profile:', err);
				// Set default profile if fetch fails
				recipientProfile = { name: undefined, picture: undefined };
			}
		} catch (err) {
			error = err instanceof Error ? err.message : $t('messages.failed_to_load_chat');
		} finally {
			isLoading = false;
		}
	});

	function goBackToMessages() {
		goto(resolve('/(app)/(protected)/messages'));
	}

	async function copyPubkey() {
		try {
			copyToClipboard(recipientPubkey);
			copySuccess = true;
			setTimeout(() => {
				copySuccess = false;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy pubkey:', err);
		}
	}
</script>

<div
	class="bg-base-100 border-base-300/20 mx-auto mt-6 flex h-[70vh] max-w-6xl flex-col overflow-hidden rounded-2xl border shadow-xl sm:h-[80dvh] md:mt-0"
>
	{#if isLoading}
		<!-- Loading State -->
		<div class="flex h-full items-center justify-center">
			<div class="loading loading-spinner loading-md text-primary"></div>
		</div>
	{:else if error}
		<!-- Error State -->
		<div class="flex h-full flex-col items-center justify-center p-6">
			<div class="max-w-md space-y-4 text-center">
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
		<!-- Chat Header with Back Button - Fixed Header -->
		<div
			class="border-base-300/30 bg-base-200/30 flex shrink-0 items-center border-b px-4 py-3 md:px-6 md:py-4"
		>
			<!-- Back Button -->
			<button
				class="btn btn-ghost btn-sm hover:bg-base-300 mr-3 shrink-0 transition-all duration-200"
				onclick={goBackToMessages}
				aria-label={$t('messages.go_back_to_messages')}
			>
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
						d="M15 19l-7-7 7-7"
					/>
				</svg>
			</button>

			<!-- Recipient Info -->
			<div class="flex min-w-0 flex-1 items-center justify-between">
				<div class="flex min-w-0 flex-1 items-center gap-3">
					<div class="shrink-0">
						{#if recipientProfile?.picture}
							<img
								src={recipientProfile.picture}
								alt={recipientProfile.name || $t('messages.unknown')}
								class="ring-base-300 h-12 w-12 rounded-full object-cover shadow-md ring-2 md:h-14 md:w-14"
								width={56}
								height={56}
							/>
						{:else}
							<div
								class="from-primary/20 to-secondary/20 ring-base-300 flex h-12 w-12 items-center justify-center rounded-full bg-linear-to-br shadow-md ring-2 md:h-14 md:w-14"
							>
								{#if recipientProfile?.name}
									<span class="text-primary text-base font-bold md:text-lg">
										{recipientProfile.name.charAt(0).toUpperCase()}
									</span>
								{:else}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="text-primary h-6 w-6 md:h-7 md:w-7"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
										/>
									</svg>
								{/if}
							</div>
						{/if}
					</div>
					<div class="min-w-0 flex-1">
						<h4 class="truncate text-lg font-bold md:text-xl">
							{conversationPeerLabel(recipientProfile, recipientPubkey)}
						</h4>
					</div>
				</div>

				<!-- Action Buttons -->
				<div class="flex shrink-0 items-center gap-2">
					<!-- Translation Settings Button -->
					<TranslationSettings />

					<!-- Copy Public Key Button -->
					<button
						class="btn btn-ghost btn-sm hover:bg-base-300 relative transition-all duration-200"
						onclick={copyPubkey}
						title={copySuccess ? $t('messages.copied') : $t('messages.copy_public_key')}
						aria-label={copySuccess ? $t('messages.copied') : $t('messages.copy_public_key')}
					>
						{#if copySuccess}
							<!-- Check icon for success state -->
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="text-success h-5 w-5"
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
								class="h-5 w-5"
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

		<!-- ChatView Component - Scrollable Area -->
		<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
			<ChatView
				{recipientPubkey}
				currentUserPubkey={currentUserNpub}
				initialProfile={recipientProfile}
			/>
		</div>
	{/if}
</div>
