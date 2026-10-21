<script lang="ts">
	import type { Event as NostrEvent } from 'nostr-tools';
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount, onDestroy, untrack } from 'svelte';
	import { profileIdentityRevision } from '$lib/stores/profile-identity.store';
	import { isUserToUserMessage } from '$lib/utils/helpers/messageParser';
	import { fetchProfileMetadata } from '$lib/nostr/profile';
	import {
		getMessagedPeople,
		listenForIncomingMessages,
		parseDMEvent
	} from '$lib/nostr/direct-messages';
	import { recipientPubkey, searchChatProfiles } from '$lib/nostr/profile-search';
	import { getNostrKeyPair, signerReady } from '$lib/utils/nostrKeys';
	import { getBiometricData, prefetchPasskeyChallenge } from '$lib/utils/helpers/biometrics';
	import {
		SignerLockedError,
		isPasskeyPromptError,
		passkeyPromptSuppressed
	} from '$lib/utils/helpers/passkey-prompt';
	import { signerCached } from '$lib/utils/helpers/session-mnemonic';
	import { toHexPubkey } from '$lib/nostr/messaging-policy';
	import { bytesToHex } from '@noble/hashes/utils';
	import { formatTimeAgo } from '$lib/utils/helpers/date';
	import { messageTranslations } from '$lib/stores/translation.store';
	import { parseMessageContent } from '$lib/utils/helpers/messageParser';
	import { muteStore } from '$lib/stores/mute.store';
	import { truncateNpub } from '$lib/utils/nostr';
	import Avatar from '$lib/components/Avatar.svelte';

	/**
	 * Helper function to get display content for a conversation
	 */
	function getDisplayContent(conversation: (typeof conversations)[0]): string {
		if (!conversation.lastEvent.content) {
			return $t('messages.no_messages');
		}

		const messageId = conversation.lastEvent.id;
		const messageTranslation = $messageTranslations.get(messageId);
		const parsedContent = parseMessageContent(conversation.lastEvent.content);
		const isReply = parsedContent.startsWith('> ') && parsedContent.includes('\n\n');

		// If it's a reply, only show the actual message (not the quoted part)
		if (isReply) {
			const parts = parsedContent.split('\n\n');
			const actualMessage = parts.slice(1).join('\n\n').trim();
			const actualMessageTranslation = $messageTranslations.get(messageId);
			return actualMessageTranslation ? actualMessageTranslation.translatedText : actualMessage;
		}

		// For regular messages, show translation if available
		if (messageTranslation) {
			return messageTranslation.translatedText;
		}

		return translateMessageContent(conversation.lastEvent.content);
	}

	/**
	 * Helper function to translate message content if it's a translation key
	 * Translation keys typically follow patterns like: dashboard.bids.bid_acceptance.acceptance_message
	 * This function is used in the template, so it will be reactive to language changes
	 */
	function translateMessageContent(content: string): string {
		if (!content || !content.trim()) {
			return content;
		}

		// Check if it looks like a translation key (contains dots and follows a pattern)
		// Translation keys typically have at least 2 segments separated by dots
		const translationKeyPattern = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)+$/i;
		const trimmedContent = content.trim();

		if (translationKeyPattern.test(trimmedContent)) {
			try {
				// Try to translate it using the reactive $t function
				// Since this is called from the template, $t will be reactive
				const translated = $t(trimmedContent);
				// If translation returns the key itself or an error, return original
				// svelte-i18n returns the key if translation is missing, so check if it changed
				return translated && translated !== trimmedContent ? translated : content;
			} catch {
				// If translation fails, return original content
				return content;
			}
		}

		// Not a translation key, return as-is
		return content;
	}

	// State
	type ConversationLastEvent = Omit<NostrEvent, 'content'> & { content: string };

	let conversations = $state<
		{
			pubkey: string;
			lastEvent: ConversationLastEvent;
			profile: { name?: string; picture?: string };
		}[]
	>([]);
	let isLoading = $state(true);
	let error = $state('');
	let passkeyLocked = $state(false);
	let errorDetail = $state('');

	// Search state
	let searchQuery = $state('');

	// First filter out muted users, then apply the search query
	const unmutedConversations = $derived(
		$muteStore.mutedPubkeys.size > 0
			? conversations.filter((c) => !$muteStore.mutedPubkeys.has(c.pubkey))
			: conversations
	);

	$effect(() => {
		const revision = $profileIdentityRevision;
		if (revision === 0) return;
		const current = untrack(() => conversations);
		if (current.length === 0) return;
		void Promise.all(
			current.map(async (conversation) => {
				try {
					const profile = await fetchProfileMetadata(conversation.pubkey);
					return {
						...conversation,
						profile: {
							name: profile.name,
							picture: profile.picture
						}
					};
				} catch {
					return conversation;
				}
			})
		).then((next) => {
			conversations = next;
		});
	});

	let filteredConversations = $derived(
		searchQuery.trim() === ''
			? unmutedConversations
			: unmutedConversations.filter((c) => {
					const query = searchQuery.toLowerCase();
					return (
						c.profile.name?.toLowerCase().includes(query) ||
						c.pubkey.toLowerCase().includes(query) ||
						c.lastEvent.content?.toLowerCase().includes(query)
					);
				})
	);

	// Modal state
	let showModal = $state(false);
	let newMessagePubkey = $state('');
	let newMessageError = $state('');
	let newMessageProfile = $state<{ name?: string; picture?: string; pubkey?: string } | null>(null);
	let isProfileLoading = $state(false);

	// Username search state
	let isUsernameSearching = $state(false);
	let usernameSearchError = $state('');
	let showUsernameResults = $state(false);
	let usernameSearchResults = $state<
		{
			pubkey: string;
			profile: { name?: string; picture?: string };
		}[]
	>([]);
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	// Real-time subscription for conversation list updates
	let conversationListUnsubscribe: (() => void) | null = null;

	// Load conversations on mount
	onMount(async () => {
		await loadConversations();
	});

	// Cleanup on component destroy
	onDestroy(() => {
		if (conversationListUnsubscribe) {
			conversationListUnsubscribe();
		}
	});

	function setupConversationListListener(npub: string, nsec: Uint8Array) {
		// Clean up existing subscription
		if (conversationListUnsubscribe) {
			conversationListUnsubscribe();
		}

		// Setup new subscription for real-time conversation updates
		const mine = toHexPubkey(npub);
		conversationListUnsubscribe = listenForIncomingMessages(npub, nsec, async (msg) => {
			const { plaintext, senderPubkey, event } = msg;

			// Filter out system messages - only show user-to-user messages in conversation list
			// System messages should be handled by notifications, not shown in chat previews
			if (!isUserToUserMessage(plaintext)) {
				return; // Skip system messages in conversation list
			}

			const sender = toHexPubkey(senderPubkey);
			const recipientTag = event.tags.find((tag) => tag[0] === 'p');
			const recipient = toHexPubkey(recipientTag?.[1] ?? '');
			const otherPartyPubkey = sender && mine && sender === mine ? recipient : sender;
			if (otherPartyPubkey && $muteStore.mutedPubkeys.has(otherPartyPubkey)) {
				return; // Skip messages from muted users
			}

			if (!otherPartyPubkey) {
				console.error('No recipient found in message tags');
				return;
			}
			const otherPubkey = otherPartyPubkey;

			// Find or create conversation for this OTHER person
			const existingConversationIndex = conversations.findIndex((c) => c.pubkey === otherPubkey);

			if (existingConversationIndex >= 0) {
				// Update existing conversation
				const existingConversation = conversations[existingConversationIndex];

				// Only update if this message is newer
				if (event.created_at > existingConversation.lastEvent.created_at) {
					const updatedConversation = {
						...existingConversation,
						lastEvent: {
							...event,
							content: plaintext // Store decrypted content for display
						}
					};

					// Remove from current position and add to top
					conversations = [
						updatedConversation,
						...conversations.slice(0, existingConversationIndex),
						...conversations.slice(existingConversationIndex + 1)
					];
				}
			} else {
				// Create new conversation with the OTHER person
				try {
					const profile = await fetchProfileMetadata(otherPubkey);
					const newConversation = {
						pubkey: otherPubkey,
						lastEvent: {
							...event,
							content: plaintext // Store decrypted content for display
						},
						profile: profile || {}
					};

					// Add to top of conversations
					conversations = [newConversation, ...conversations];
				} catch (err) {
					console.error('Failed to fetch profile for new conversation:', err);
				}
			}
		});
	}

	async function loadConversations() {
		try {
			isLoading = true;
			error = '';
			passkeyLocked = false;
			errorDetail = '';

			const { nsec, npub } = await getNostrKeyPair();
			setupConversationListListener(npub, nsec);

			const people = await getMessagedPeople();

			if (!people.length) {
				return (isLoading = false);
			}

			const privkey = bytesToHex(nsec);

			const conversationPromises = people.map(async (person) => {
				try {
					const { plaintext } = await parseDMEvent(person.lastEvent, privkey, npub);

					// Filter system messages
					if (!isUserToUserMessage(plaintext)) {
						return null;
					}

					return {
						pubkey: person.pubkey,
						lastEvent: { ...person.lastEvent, content: plaintext },
						profile: person.profile
					};
				} catch (err) {
					console.error('Failed to decrypt last message:', err);
					return null;
				}
			});

			const results = await Promise.all(conversationPromises);
			conversations = results
				.filter((c) => c !== null)
				.sort((a, b) => b.lastEvent.created_at - a.lastEvent.created_at);
		} catch (err) {
			if (err instanceof SignerLockedError && !signerCached()) {
				passkeyLocked = true;
				error = 'messages.passkey_required';
				errorDetail = '';
				prefetchPasskeyChallenge();
			} else if (err instanceof SignerLockedError) {
				passkeyLocked = false;
				error = 'messages.failed_load_conversations';
				errorDetail = '';
			} else {
				error = 'messages.failed_load_conversations';
				errorDetail = err instanceof Error ? err.message : '';
			}
		} finally {
			isLoading = false;
		}
	}

	async function retryConversations() {
		// A saved session is read again. WebAuthn starts in this click only when that session is gone.
		const prompted =
			passkeyLocked && !signerReady() && !passkeyPromptSuppressed()
				? getBiometricData(true, [])
				: null;
		if (prompted) {
			try {
				await getNostrKeyPair({ prompt: true, prompted });
				passkeyLocked = false;
			} catch (err) {
				error = isPasskeyPromptError(err)
					? 'messages.passkey_failed'
					: 'messages.failed_load_conversations';
				prefetchPasskeyChallenge();
				return;
			}
		}
		await loadConversations();
	}

	// Profile subscription removed - using props instead

	// Handle conversation selection
	function selectConversation(pubkey: string) {
		goto(resolve('/(app)/(protected)/messages/to/[pubkey]', { pubkey }));
	}

	// Handle new message
	function startNewMessage() {
		newMessagePubkey = '';
		newMessageError = '';
		newMessageProfile = null;
		showModal = true;
		// Reset username search state
		showUsernameResults = false;
		usernameSearchResults = [];
		usernameSearchError = '';
		isUsernameSearching = false;
	}

	function closeModal() {
		showModal = false;
		// Clear search timeout when closing modal
		if (searchTimeout) {
			clearTimeout(searchTimeout);
			searchTimeout = null;
		}
		// Reset all search states
		isUsernameSearching = false;
		showUsernameResults = false;
		usernameSearchResults = [];
		usernameSearchError = '';
	}

	async function handlePubkeyInput(e: Event) {
		const value = (e.target as HTMLInputElement).value.trim();
		newMessagePubkey = value;
		newMessageError = '';
		newMessageProfile = null;
		showUsernameResults = false;
		usernameSearchResults = [];
		usernameSearchError = '';
		isUsernameSearching = false;

		if (!value) return;

		const hexPubkey = recipientPubkey(value);
		if (value.toLowerCase().startsWith('npub') && !hexPubkey) {
			newMessageError = 'messages.invalid_npub_format';
			return;
		}

		if (hexPubkey) {
			isProfileLoading = true;
			try {
				const [hit] = await searchChatProfiles(value);
				newMessageProfile = {
					name: hit?.name || '',
					picture: hit?.picture,
					pubkey: hexPubkey
				};
				newMessagePubkey = hexPubkey;
			} catch (error: unknown) {
				newMessageProfile = { name: '', pubkey: hexPubkey };
				newMessagePubkey = hexPubkey;
				console.warn(
					'[messages] profile lookup failed',
					error instanceof Error ? error.message : error
				);
			} finally {
				isProfileLoading = false;
			}
			return;
		}

		if (value.length < 2) return;
		if (searchTimeout) {
			clearTimeout(searchTimeout);
			searchTimeout = null;
		}
		searchTimeout = setTimeout(() => {
			void searchUsersByUsername(value);
		}, 300);
	}

	async function searchUsersByUsername(username: string) {
		if (username.trim() !== newMessagePubkey.trim()) return;
		if (recipientPubkey(username)) return;
		if (username.trim().length < 2) {
			showUsernameResults = false;
			isUsernameSearching = false;
			return;
		}

		isUsernameSearching = true;
		usernameSearchError = '';
		showUsernameResults = true;

		try {
			const hits = await searchChatProfiles(username);
			if (username.trim() !== newMessagePubkey.trim()) return;
			usernameSearchResults = hits.slice(0, 8).map((hit) => ({
				pubkey: hit.pubkey,
				profile: { name: hit.name, picture: hit.picture }
			}));
			if (usernameSearchResults.length === 0) {
				usernameSearchError = 'messages.no_users_found';
			}
		} catch (err) {
			usernameSearchError = 'messages.search_failed';
			console.error('Username search failed:', err);
		} finally {
			isUsernameSearching = false;
		}
	}

	// Select user from search results
	function selectUserFromSearch(pubkey: string) {
		const selectedUser = usernameSearchResults.find((user) => user.pubkey === pubkey);
		if (selectedUser) {
			newMessagePubkey = pubkey;
			newMessageProfile = { ...selectedUser.profile, pubkey: selectedUser.pubkey };
			showUsernameResults = false;
			usernameSearchResults = [];
		}
	}

	async function submitNewMessage(e: Event) {
		e.preventDefault();
		const value = newMessagePubkey.trim();
		const hexPubkey = recipientPubkey(value);
		if (!hexPubkey) {
			newMessageError = value.toLowerCase().startsWith('npub')
				? 'messages.invalid_npub_format'
				: 'messages.invalid_pubkey_format';
			return;
		}

		goto(resolve('/(app)/(protected)/messages/to/[pubkey]', { pubkey: hexPubkey }));
		showModal = false;
	}
</script>

<!-- Mismas dimensiones que Mi Panel -->
<div class="mx-auto h-full w-full max-w-6xl min-w-0 px-2 py-6 md:px-0 md:py-0">
	<!-- Header -->
	<div class="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3 md:mb-6">
		<div class="min-w-0 flex-1 space-y-1">
			<h3 class="truncate text-2xl font-bold tracking-tight md:text-3xl">{$t('messages.title')}</h3>
			<p class="text-base-content/60 text-sm md:text-base">{$t('messages.subtitle')}</p>
		</div>
		<button
			class="btn btn-primary btn-sm md:btn-md flex max-w-full min-w-0 gap-2 whitespace-normal shadow-md transition-all hover:shadow-lg"
			onclick={startNewMessage}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
			{$t('messages.new_message')}
		</button>
	</div>

	<!-- Modal -->
	<input
		type="checkbox"
		class="modal-toggle"
		checked={showModal}
		style="display:none"
		readonly
		aria-label={$t('messages.toggle_new_message_modal')}
	/>
	{#if showModal}
		<div class="modal modal-open">
			<div class="modal-box max-w-md">
				<!-- Modal Header -->
				<div class="mb-6">
					<div class="mb-2 flex items-center gap-3">
						<div class="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full">
							<svg
								class="text-primary h-5 w-5"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
								></path>
							</svg>
						</div>
						<div>
							<h4 class="text-sm font-semibold">{$t('messages.start_new_message')}</h4>
						</div>
					</div>
				</div>

				<form onsubmit={submitNewMessage} class="space-y-4">
					<!-- Input Section -->
					<div class="space-y-3">
						<div>
							<label
								for="recipient-pubkey"
								class="text-base-content mb-2 block text-sm font-medium"
							>
								{$t('messages.recipient_label')}
							</label>
							<div class="relative">
								<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
									<svg
										class="text-base-content/40 h-4 w-4"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
										></path>
									</svg>
								</div>
								<input
									id="recipient-pubkey"
									type="text"
									class="input input-bordered focus:input-primary w-full pl-10 text-sm"
									bind:value={newMessagePubkey}
									oninput={handlePubkeyInput}
									placeholder={$t('messages.recipient_placeholder')}
									autocomplete="off"
								/>
							</div>
						</div>

						<!-- Help text -->
						<div class="bg-base-200/50 rounded-lg p-3">
							<div class="flex items-start gap-2">
								<svg
									class="text-info mt-0.5 h-4 w-4 shrink-0"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
									></path>
								</svg>
								<div class="text-base-content/70 text-xs">
									<p class="mb-1 font-medium">{$t('messages.search_by_username_title')}</p>
									<p class="text-xs">
										{$t('messages.search_by_username_desc')}
									</p>
								</div>
							</div>
						</div>
					</div>

					<!-- Username Search Loading -->
					{#if isUsernameSearching}
						<div class="flex justify-center py-2">
							<span class="loading loading-spinner loading-sm"></span>
						</div>
					{/if}

					<!-- Username Search Results -->
					{#if showUsernameResults && usernameSearchResults.length > 0}
						<div class="space-y-3">
							<div class="flex items-center gap-2">
								<svg
									class="text-success h-4 w-4"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
									></path>
								</svg>
								<span class="text-sm font-medium">{$t('messages.search_results')}</span>
							</div>
							<div class="border-base-300 max-h-48 space-y-1 overflow-y-auto rounded-lg border p-1">
								{#each usernameSearchResults as result (result.pubkey)}
									<button
										type="button"
										class="hover:bg-primary/5 hover:border-primary/20 flex w-full items-center gap-3 rounded-lg border border-transparent p-3 transition-all duration-200"
										onclick={() => selectUserFromSearch(result.pubkey)}
										aria-label={$t('messages.select_user')}
									>
										<div class="user-avatar shrink-0">
											{#if result.profile.picture}
												<img
													src={result.profile.picture}
													alt={result.profile.name || truncateNpub(result.pubkey)}
													class="ring-base-300 h-10 w-10 rounded-full object-cover ring-2"
													width={40}
													height={40}
												/>
											{/if}
											<div
												class="avatar-fallback from-primary/20 to-secondary/20 ring-base-300 flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br ring-2"
												style="display: {result.profile.picture ? 'none' : 'flex'};"
											>
												{#if result.profile.name}
													<span class="text-primary text-sm font-semibold">
														{result.profile.name.charAt(0).toUpperCase()}
													</span>
												{:else}
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="text-primary h-5 w-5"
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
										</div>
										<div class="min-w-0 flex-1 text-left">
											<h5 class="text-base-content truncate text-sm font-medium">
												{result.profile.name || truncateNpub(result.pubkey)}
											</h5>
											<p class="text-base-content/60 truncate font-mono text-xs">
												{result.pubkey.slice(0, 12)}...{result.pubkey.slice(-8)}
											</p>
										</div>
										<div class="shrink-0">
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="text-primary h-4 w-4"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M9 5l7 7-7 7"
												/>
											</svg>
										</div>
									</button>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Username Search Error -->
					{#if usernameSearchError}
						<div class="alert alert-error alert-outline py-2">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4 shrink-0 stroke-current"
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
							<span class="text-sm">
								{usernameSearchError.startsWith('messages.')
									? $t(usernameSearchError)
									: usernameSearchError}
							</span>
						</div>
					{/if}

					<!-- Error Display -->
					{#if newMessageError}
						<div class="alert alert-error alert-outline py-2">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4 shrink-0 stroke-current"
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
							<span class="text-sm">
								{newMessageError.startsWith('messages.') ? $t(newMessageError) : newMessageError}
							</span>
						</div>
					{/if}

					<!-- Profile Preview -->
					{#if isProfileLoading}
						<div class="bg-base-200 flex animate-pulse items-center gap-3 rounded-lg p-3">
							<div class="bg-base-300 h-10 w-10 rounded-full"></div>
							<div class="flex-1">
								<div class="bg-base-300 mb-1 h-4 w-24 rounded"></div>
								<div class="bg-base-300 h-3 w-32 rounded"></div>
							</div>
						</div>
					{:else if newMessageProfile}
						<div class="bg-base-200 flex items-center gap-3 rounded-lg p-3">
							<div class="shrink-0">
								{#if newMessageProfile.picture}
									<img
										src={newMessageProfile.picture}
										alt={newMessageProfile.name ||
											(newMessageProfile.pubkey ? truncateNpub(newMessageProfile.pubkey) : '')}
										class="ring-base-300 h-10 w-10 rounded-full object-cover ring-2"
										width={40}
										height={40}
									/>
								{:else}
									<div
										class="from-primary/20 to-secondary/20 ring-base-300 flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br ring-2"
									>
										{#if newMessageProfile.name}
											<span class="text-primary text-sm font-semibold">
												{newMessageProfile.name.charAt(0).toUpperCase()}
											</span>
										{:else}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="text-primary h-5 w-5"
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
								<p class="truncate font-medium">
									{newMessageProfile.name ||
										(newMessageProfile.pubkey ? truncateNpub(newMessageProfile.pubkey) : '')}
								</p>
								<p class="text-base-content/60 truncate text-xs">
									{newMessagePubkey.startsWith('npub')
										? `${newMessagePubkey.slice(0, 16)}...`
										: `${newMessagePubkey.slice(0, 8)}...`}
								</p>
							</div>
							<div class="shrink-0">
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
							</div>
						</div>
					{/if}

					<!-- Action Buttons -->
					<div class="border-base-300 flex gap-3 border-t pt-6">
						<button type="button" class="btn btn-ghost flex-1" onclick={closeModal}>
							<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M6 18L18 6M6 6l12 12"
								></path>
							</svg>
							{$t('messages.cancel')}
						</button>
						<button
							type="submit"
							class="btn btn-primary flex-1"
							disabled={!newMessagePubkey || !!newMessageError || isProfileLoading}
						>
							{#if isProfileLoading}
								<span class="loading loading-spinner loading-sm mr-2"></span>
								{$t('messages.loading')}
							{:else}
								<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
									></path>
								</svg>
								{$t('messages.start_chat')}
							{/if}
						</button>
					</div>
				</form>
			</div>
			<button class="modal-backdrop" onclick={closeModal} aria-label={$t('messages.close_modal')}
			></button>
		</div>
	{/if}

	<style>
		/* Hide image if it fails to load and show fallback */
		.user-avatar img:not([src]),
		.user-avatar img[src=''] {
			display: none;
		}

		.user-avatar img:not([src]) + .avatar-fallback,
		.user-avatar img[src=''] + .avatar-fallback {
			display: flex !important;
		}
	</style>

	<!-- Main Content - Conversation List Only -->
	<div class="bg-base-100 border-base-300/20 flex-1 overflow-hidden rounded-2xl border shadow-xl">
		<div class="card-body flex h-full flex-col overflow-hidden p-0">
			<!-- Search Input -->
			{#if unmutedConversations.length > 0}
				<div class="border-base-300/30 bg-base-200/30 shrink-0 border-b p-4">
					<div class="relative">
						<input
							type="text"
							placeholder={$t('messages.search_placeholder')}
							class="input input-bordered bg-base-100 border-base-300/50 focus:border-primary focus:ring-primary/20 w-full py-3 pr-4 pl-12 text-sm transition-all duration-200 focus:ring-2 md:text-base"
							bind:value={searchQuery}
						/>
						<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="text-base-content/40 h-5 w-5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
								/>
							</svg>
						</div>
					</div>
				</div>
			{/if}

			<!-- Scrollable content area -->
			<div class="min-h-0 flex-1 overflow-y-auto">
				{#if isLoading}
					<!-- Loading State -->
					<div class="divide-base-300/20 divide-y">
						{#each [0, 1, 2] as i (i)}
							<div class="flex animate-pulse items-center gap-3 p-4">
								<div class="bg-base-300 h-10 w-10 rounded-full"></div>
								<div class="flex-1">
									<div class="bg-base-300 mb-1 h-4 w-1/4 rounded"></div>
									<div class="bg-base-300 h-3 w-2/3 rounded"></div>
								</div>
								<div class="bg-base-300 h-4 w-4 rounded"></div>
							</div>
						{/each}
					</div>
				{:else if error}
					<!-- Error State. One text column so the title wraps as a sentence at phone width. -->
					<div
						class="alert alert-error alert-outline messages-load-error w-full max-w-full"
						role="alert"
						data-testid="messages-load-error"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mt-0.5 h-6 w-6 shrink-0 stroke-current"
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
						<div class="messages-load-copy flex min-w-0 flex-col items-start gap-2">
							<p>{$t(error)}</p>
							{#if errorDetail}
								<p data-testid="messages-error-detail">{errorDetail}</p>
							{/if}
							<div class="alert-actions">
								<button
									aria-label="Retry"
									class="btn btn-error btn-outline btn-sm"
									onclick={retryConversations}
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
											d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
										/>
									</svg>
									{$t('messages.retry')}
								</button>
							</div>
						</div>
					</div>
				{:else if unmutedConversations.length > 0}
					<!-- Show conversations with optional loading indicator -->
					<div class="divide-base-300/20 divide-y">
						{#each filteredConversations as conversation (conversation.pubkey)}
							<button
								class="group hover:bg-base-200/60 active:bg-base-200 flex w-full items-center gap-4 p-4 text-left transition-all duration-200 md:gap-5 md:p-5"
								onclick={() => selectConversation(conversation.pubkey)}
							>
								<!-- Avatar -->
								<div class="shrink-0">
									<Avatar
										picture={conversation.profile.picture}
										name={conversation.profile.name}
										size="md"
									/>
								</div>

								<!-- Conversation Info -->
								<div class="min-w-0 flex-1 cursor-pointer">
									<div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
										<span class="line-clamp-1 truncate text-sm font-semibold md:text-lg">
											{conversation.profile.name || `${conversation.pubkey.slice(0, 8)}...`}
										</span>
										<span class="text-base-content/50 ml-2 shrink-0 text-xs font-medium">
											{formatTimeAgo(new Date(conversation.lastEvent.created_at * 1000))}
										</span>
									</div>
									<p
										class="text-base-content/60 md:text-md mt-1.5 line-clamp-2 text-sm leading-relaxed"
									>
										{getDisplayContent(conversation)}
									</p>
								</div>
							</button>
						{/each}

						{#if isLoading}
							<div class="p-2 text-center text-xs opacity-50">
								{$t('messages.loading_more_conversations')}
							</div>
						{/if}
					</div>
				{:else if unmutedConversations.length === 0}
					<!-- Empty State -->
					<div class="flex flex-col items-center justify-center px-4 py-16 text-center md:py-24">
						<div
							class="bg-primary/10 mb-6 flex h-20 w-20 items-center justify-center rounded-full md:h-24 md:w-24"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="text-primary h-10 w-10 md:h-12 md:w-12"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
								/>
							</svg>
						</div>
						<h3 class="text-xl font-bold md:text-2xl">{$t('messages.no_messages')}</h3>
						<p class="text-base-content/60 mt-2 text-sm md:text-base">
							{$t('messages.start_conversation')}
						</p>
						<button
							class="btn btn-primary mt-6 gap-2 shadow-md transition-all hover:shadow-lg"
							onclick={startNewMessage}
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
									d="M12 4v16m8-8H4"
								/>
							</svg>
							{$t('messages.start_new_message')}
						</button>
					</div>
				{:else if filteredConversations.length === 0}
					<!-- No Search Results -->
					<div class="flex flex-col items-center justify-center px-4 py-16 text-center md:py-24">
						<div
							class="bg-base-200/50 mb-6 flex h-20 w-20 items-center justify-center rounded-full md:h-24 md:w-24"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="text-base-content/40 h-10 w-10 md:h-12 md:w-12"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
								/>
							</svg>
						</div>
						<h3 class="text-xl font-bold md:text-2xl">{$t('messages.no_conversations_found')}</h3>
						<p class="text-base-content/60 mt-2 text-sm md:text-base">
							{$t('messages.try_different_search')}
						</p>
						<button class="btn btn-ghost mt-6" onclick={() => (searchQuery = '')}>
							{$t('messages.clear_search')}
						</button>
					</div>
				{/if}
			</div>
			<!-- Close scrollable content area -->
		</div>
	</div>
</div>

<style>
	.messages-load-error {
		grid-template-columns: auto minmax(0, 1fr) !important;
		width: 100%;
		max-width: 100%;
	}

	.messages-load-copy,
	.messages-load-copy p {
		min-width: 0;
		width: 100%;
		white-space: normal;
		word-break: normal;
		overflow-wrap: break-word;
		hyphens: manual;
	}
</style>
