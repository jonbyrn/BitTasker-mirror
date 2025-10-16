<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { nip19 } from 'nostr-tools';
	import { goto } from '$app/navigation';
	import {
		fetchProfileMetadata,
		getMessagedPeople,
		getMessageHistory,
		listenForIncomingMessages
	} from '$lib/utils/nostr-message';
	import { profileCache } from '$lib/utils/profile-cache';
	import { getNostrKeyPair } from '$lib/utils/nostrKeys';
	import { subscribeToEvents } from '$lib/utils/nostr';
	import type { Event as NostrEvent, Filter } from 'nostr-tools';
	import { formatTimeAgo } from '$lib/utils/helpers/date';
	import { conversationManager } from '$lib/utils/conversation-manager';
	import Avatar from '$lib/components/Avatar.svelte';
	import { t } from 'svelte-i18n';
	import KINDS from '$lib/utils/constants/kinds';

	// State
	let conversations = $state<
		{
			pubkey: string;
			lastEvent: any;
			profile: { name?: string; picture?: string };
		}[]
	>([]);
	let isLoading = $state(true);
	let error = $state('');

	// Search state
	let searchQuery = $state('');
	let filteredConversations = $derived(
		conversationManager.searchConversations(
			conversations.map((c) => ({
				pubkey: c.pubkey,
				lastEvent: c.lastEvent,
				lastMessage: c.lastEvent.content || '',
				lastMessageTime: c.lastEvent.created_at,
				profile: c.profile
			})),
			searchQuery
		).sort((a, b) => {
			// Asegurar que el ordenamiento se mantenga después del filtrado
			const timeA = a.lastMessageTime || 0;
			const timeB = b.lastMessageTime || 0;
			return timeB - timeA; // Más reciente primero
		})
	);

	// Modal state
	let showModal = $state(false);
	let newMessagePubkey = $state('');
	let newMessageError = $state('');
	let newMessageProfile = $state<{ name?: string; picture?: string } | null>(null);
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
	let searchTimeout: NodeJS.Timeout | null = null;

	// Real-time subscription for conversation list updates
	let conversationListUnsubscribe: (() => void) | null = null;

	// Profile subscriptions removed - using props instead

	// Load conversations on mount
	onMount(async () => {
		try {
			// Clear profile cache to ensure we only show conversations for current user
			const { nsec, npub } = await getNostrKeyPair();
			const currentUserPubkey = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;
			
			console.log('🧹 Clearing profile cache for user:', currentUserPubkey);
			profileCache.clear(); // Clear all cached profiles
			
			// Obtener conversaciones pero excluir las que solo contengan bids
			const people = await getMessagedPeople();

			// Process conversations in parallel for better performance
			const conversationPromises = people.map(async (person) => {
				try {
					// Obtener historial de mensajes con esta persona (limit to 10 for performance)
					const messageHistory = await getMessageHistory(person.pubkey, { limit: 10 });

					// Verificar si hay mensajes que NO sean JSON (system messages)
					const hasNonJsonMessages = messageHistory.some((message) => {
						const isJsonMessage = message.plaintext.startsWith('[') || message.plaintext.startsWith('{');
						return !isJsonMessage;
					});

					// Solo incluir conversaciones que tengan mensajes normales (no JSON)
					if (hasNonJsonMessages) {
						// Find the most recent non-JSON message for preview
						const lastNonJsonMessage = messageHistory
							.filter(message => {
								const isJsonMessage = message.plaintext.startsWith('[') || message.plaintext.startsWith('{');
								return !isJsonMessage;
							})
							.sort((a, b) => b.event.created_at - a.event.created_at)[0];

						// Update the person's lastEvent with the filtered content
						if (lastNonJsonMessage) {
							return {
								...person,
								lastEvent: {
									...person.lastEvent,
									content: lastNonJsonMessage.plaintext,
									created_at: lastNonJsonMessage.event.created_at
								}
							};
						} else {
							return person;
						}
					}
					// Don't include conversations with only JSON messages - return undefined to filter out
					return undefined;
				} catch (err) {
					// Si hay error, incluir la conversación por seguridad
					return person;
				}
			});

			// Wait for all conversations to be processed
			const conversationResults = await Promise.all(conversationPromises);
			const filteredConversations = conversationResults.filter((conversation): conversation is NonNullable<typeof conversation> => conversation !== undefined);

			// Ordenar conversaciones del más reciente al más antiguo
			conversations = filteredConversations.sort((a, b) => {
				const timeA = a.lastEvent?.created_at || 0;
				const timeB = b.lastEvent?.created_at || 0;
				return timeB - timeA; // Más reciente primero
			});

			// Setup profile subscriptions for existing conversations
			for (const conversation of conversations) {
				// Profile subscription removed - using props instead
			}
		} catch (err) {
			error = 'messages.failed_load_conversations';
		} finally {
			isLoading = false;
		}

		// Setup real-time updates for conversation list
		setupConversationListListener();
	});

	// Cleanup on component destroy
	onDestroy(() => {
		if (conversationListUnsubscribe) {
			conversationListUnsubscribe();
		}

		// Profile subscriptions removed
	});

	function setupConversationListListener() {
		// Clean up existing subscription
		if (conversationListUnsubscribe) {
			conversationListUnsubscribe();
		}

		// Setup new subscription for real-time conversation updates
		conversationListUnsubscribe = listenForIncomingMessages(async (msg) => {
			const { plaintext, senderPubkey, event } = msg;

			// Filter out JSON messages (system messages) - they should be handled by notifications
			const isJsonMessage = plaintext.startsWith('[') || plaintext.startsWith('{');
			if (isJsonMessage) {
				return; // Skip JSON messages in conversation list
			}

			// Find or create conversation for this message
			const existingConversationIndex = conversations.findIndex((c) => c.pubkey === senderPubkey);

			if (existingConversationIndex >= 0) {
				// Update existing conversation
				const existingConversation = conversations[existingConversationIndex];

				// Only update if this message is newer and not JSON
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
				// Create new conversation
				try {
					const profile = await fetchProfileMetadata(senderPubkey);
					const newConversation = {
						pubkey: senderPubkey,
						lastEvent: {
							...event,
							content: plaintext // Store decrypted content for display
						},
						profile: profile || {}
					};

					// Add to top of conversations
					conversations = [newConversation, ...conversations];

					// Setup profile subscription for new conversation
				} catch (err) {
					console.error('Failed to fetch profile for new conversation:', err);
				}
			}
		});
	}

	// Profile subscription removed - using props instead

	// Handle conversation selection
	function selectConversation(pubkey: string) {
		goto(`/dashboard/messages/to/${pubkey}`);
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

		// Check if it's a valid npub or hex pubkey first
		let hexPubkey = value;
		let isValidPubkey = false;

		if (value.startsWith('npub')) {
			try {
				hexPubkey = nip19.decode(value).data as string;
				isValidPubkey = true;
			} catch {
				newMessageError = 'messages.invalid_npub_format';
				return;
			}
		} else if (/^[a-fA-F0-9]{64}$/.test(value)) {
			hexPubkey = value;
			isValidPubkey = true;
		}

		// If it's a valid pubkey, fetch profile directly
		if (isValidPubkey) {
			isProfileLoading = true;
			try {
				const profileEvent = await fetchProfileMetadata(hexPubkey);
				if (profileEvent && profileEvent.name && profileEvent.picture) {
					newMessageProfile = { name: profileEvent.name, picture: profileEvent.picture };
				}
			} catch {
				newMessageError = 'messages.failed_fetch_profile';
			} finally {
				isProfileLoading = false;
			}
		} else {
			// If it's not a valid pubkey, search by username
			// Only search if the input looks like a username (not a pubkey)
			if (value.length >= 2 && !/^[a-fA-F0-9]+$/.test(value)) {
				// Clear previous timeout
				if (searchTimeout) {
					clearTimeout(searchTimeout);
					searchTimeout = null;
				}

				// Set new timeout for debounced search
				searchTimeout = setTimeout(() => {
					searchUsersByUsername(value);
				}, 500); // 500ms delay
			} else {
				// Clear search results if input is too short or looks like a pubkey
				if (searchTimeout) {
					clearTimeout(searchTimeout);
					searchTimeout = null;
				}
				showUsernameResults = false;
				usernameSearchResults = [];
				usernameSearchError = '';
				isUsernameSearching = false;
			}
		}
	}

	// Search for users by username
	async function searchUsersByUsername(username: string) {
		if (username.length < 2) {
			showUsernameResults = false;
			isUsernameSearching = false;
			return;
		}

		isUsernameSearching = true;
		usernameSearchError = '';
		showUsernameResults = true;

		try {
			const profiles: { pubkey: string; profile: { name?: string; picture?: string } }[] = [];
			const profileMap = new Map<string, { name?: string; picture?: string }>();
			const relayUrl = import.meta.env.VITE_NOSTR_RELAY_URL;

			if (!relayUrl) {
				throw new Error('No relay URL configured');
			}


			// Search for profile events with matching names
			const filter: Filter = {
				kinds: [0], // Profile events
				limit: 50 // Increase limit to get more results
			};

			// Also search for image events (kind 30063) to get profile pictures
			const imageFilter: Filter = {
				kinds: [KINDS.PROFILE_IMAGES], // Image events
				'#d': ['profile-images'], // Profile images tag
				limit: 50
			};

			let eventCount = 0;
			const maxEvents = 100; // Limit total events processed
			let searchCompleted = false;

			// First, search for profile events
			const unsubscribeProfiles = subscribeToEvents(relayUrl, [filter], (event: NostrEvent) => {
				if (searchCompleted) return;

				eventCount++;

				// Stop processing if we've seen too many events
				if (eventCount > maxEvents) {
					searchCompleted = true;
					unsubscribeProfiles();
					return;
				}

				try {
					const profileData = JSON.parse(event.content);

					// Check if the profile has a name and it matches our search
					if (profileData.name) {
						const profileName = profileData.name.toLowerCase();
						const searchTerm = username.toLowerCase();

						// More flexible matching - check if search term is contained in name
						// or if name starts with search term
						if (profileName.includes(searchTerm) || profileName.startsWith(searchTerm)) {

							// Store profile data in map
							profileMap.set(event.pubkey, {
								name: profileData.name,
								picture: profileData.picture || profileData.banner // Try banner if no picture
							});

							// Update results immediately as we find them
							usernameSearchResults = Array.from(profileMap.entries()).map(([pubkey, profile]) => ({
								pubkey,
								profile
							})).slice(0, 5);
							
							// Stop searching if we have enough results
							if (profileMap.size >= 5) {
								searchCompleted = true;
								unsubscribeProfiles();
								isUsernameSearching = false;
							}
						}
					}
				} catch (err) {
					// Skip invalid profile data
				}
			});

			// Also search for image events to get profile pictures
			const unsubscribeImages = subscribeToEvents(relayUrl, [imageFilter], (event: NostrEvent) => {
				if (searchCompleted) return;

				try {
					const imageData = JSON.parse(event.content);
					
					// If we have a profile for this pubkey, add the image
					if (profileMap.has(event.pubkey) && imageData.length > 0) {
						const profile = profileMap.get(event.pubkey);
						if (profile && !profile.picture) {
							profile.picture = imageData[0].url;
							
							// Update results with the new image
							usernameSearchResults = Array.from(profileMap.entries()).map(([pubkey, profile]) => ({
								pubkey,
								profile
							})).slice(0, 5);
						}
					}
				} catch (err) {
					// Skip invalid image data
				}
			});

			// Wait for search to complete or timeout
			await new Promise((resolve) => {
				const timeoutId = setTimeout(() => {
					searchCompleted = true;
					unsubscribeProfiles();
					unsubscribeImages();
					resolve(undefined);
				}, 2000); // Reduced to 2 second search duration
				
				// Also resolve if we have enough results
				const checkResults = setInterval(() => {
					if (searchCompleted || profileMap.size >= 3) {
						clearTimeout(timeoutId);
						clearInterval(checkResults);
						searchCompleted = true;
						unsubscribeProfiles();
						unsubscribeImages();
						isUsernameSearching = false;
						resolve(undefined);
					}
				}, 100); // Check every 100ms
			});

			// Final update of results
			usernameSearchResults = Array.from(profileMap.entries()).map(([pubkey, profile]) => ({
				pubkey,
				profile
			})).slice(0, 5);

			if (profileMap.size === 0) {
				usernameSearchError = 'No users found with that name';
			}
		} catch (err) {
			usernameSearchError = 'Search failed';
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
			newMessageProfile = selectedUser.profile;
			showUsernameResults = false;
			usernameSearchResults = [];
		}
	}

	async function submitNewMessage(e: Event) {
		e.preventDefault();
		let value = newMessagePubkey.trim();
		let hexPubkey = value;
		if (value.startsWith('npub')) {
			try {
				hexPubkey = nip19.decode(value).data as string;
			} catch {
				newMessageError = 'messages.invalid_npub_format';
				return;
			}
		} else if (!/^[a-fA-F0-9]{64}$/.test(value)) {
			newMessageError = 'messages.invalid_pubkey_format';
			return;
		}

		// Navigate to the new chat page
		goto(`/dashboard/messages/to/${hexPubkey}`);
		showModal = false;
	}
</script>

<div class="mx-auto max-w-7xl p-2 md:p-4 lg:p-0">
	<!-- Header -->
	<div class="mb-6 flex flex-shrink-0 items-center justify-between">
		<div class="min-w-0 flex-1 space-y-1">
			<h3 class="truncate text-xl font-semibold tracking-tight">{$t('messages.title')}</h3>
			<p class="text-base-content/70 text-sm">{$t('messages.subtitle')}</p>
		</div>
		<button class="btn btn-primary btn-sm hidden sm:flex" onclick={startNewMessage}
			>{$t('messages.new_message')}
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
							<h4 class="text-sm font-semibold">Start New Message</h4>
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
								Recipient (npub or username)
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
									placeholder="Enter npub or username"
									autocomplete="off"
								/>
							</div>
						</div>

						<!-- Help text -->
						<div class="bg-base-200/50 rounded-lg p-3">
							<div class="flex items-start gap-2">
								<svg
									class="text-info mt-0.5 h-4 w-4 flex-shrink-0"
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
									<p class="mb-1 font-medium">Search by username</p>
									<p class="text-xs">
										Enter a username to search for users, or paste an npub/hex pubkey directly
									</p>
								</div>
							</div>
						</div>
					</div>

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
								<span class="text-sm font-medium">Search Results</span>
							</div>
							<div class="border-base-300 max-h-48 space-y-1 overflow-y-auto rounded-lg border p-1">
								{#each usernameSearchResults as result}
									<button
										type="button"
										class="hover:bg-primary/5 hover:border-primary/20 flex w-full items-center gap-3 rounded-lg border border-transparent p-3 transition-all duration-200"
										onclick={() => selectUserFromSearch(result.pubkey)}
										aria-label={`Select ${result.profile.name || 'Unknown User'}`}
									>
										<div class="user-avatar flex-shrink-0">
											{#if result.profile.picture}
												<img
													src={result.profile.picture}
													alt={result.profile.name || 'Unknown User'}
													class="ring-base-300 h-10 w-10 rounded-full object-cover ring-2"
													width={40}
													height={40}
												/>
											{/if}
											<div
												class="avatar-fallback from-primary/20 to-secondary/20 ring-base-300 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ring-2"
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
												{result.profile.name || 'Unknown User'}
											</h5>
											<p class="text-base-content/60 truncate font-mono text-xs">
												{result.pubkey.slice(0, 12)}...{result.pubkey.slice(-8)}
											</p>
										</div>
										<div class="flex-shrink-0">
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
							<span class="text-sm">{usernameSearchError}</span>
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
							<span class="text-sm">{newMessageError}</span>
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
							<div class="flex-shrink-0">
								{#if newMessageProfile.picture}
									<img
										src={newMessageProfile.picture}
										alt={newMessageProfile.name || $t('messages.unknown_user')}
										class="h-10 w-10 rounded-full object-cover ring-2 ring-base-300"
										width={40}
										height={40}
									/>
								{:else}
									<div class="bg-gradient-to-br from-primary/20 to-secondary/20 flex h-10 w-10 items-center justify-center rounded-full ring-2 ring-base-300">
										{#if newMessageProfile.name}
											<span class="text-primary font-semibold text-sm">
												{newMessageProfile.name.charAt(0).toUpperCase()}
											</span>
										{:else}
											<svg xmlns="http://www.w3.org/2000/svg" class="text-primary h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
											</svg>
										{/if}
									</div>
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<p class="truncate font-medium">
									{newMessageProfile.name || $t('messages.unknown_user')}
								</p>
								<p class="text-base-content/60 truncate text-xs">
									{newMessagePubkey.startsWith('npub')
										? `${newMessagePubkey.slice(0, 16)}...`
										: `${newMessagePubkey.slice(0, 8)}...`}
								</p>
							</div>
							<div class="flex-shrink-0">
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
					{:else if newMessagePubkey && !newMessageError && !showUsernameResults}
						<div class="bg-base-200 flex items-center gap-3 rounded-lg p-3">
							<div class="bg-base-300 flex h-10 w-10 items-center justify-center rounded-full">
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
										d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
									/>
								</svg>
							</div>
							<div class="min-w-0 flex-1">
								<p class="text-base-content/60 font-medium">No se encontró perfil</p>
								<p class="text-base-content/50 truncate text-xs">
									{newMessagePubkey.startsWith('npub')
										? `${newMessagePubkey.slice(0, 16)}...`
										: `${newMessagePubkey.slice(0, 8)}...`}
								</p>
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
							Cancel
						</button>
						<button
							type="submit"
							class="btn btn-primary flex-1"
							disabled={!newMessagePubkey || !!newMessageError || isProfileLoading}
						>
							{#if isProfileLoading}
								<span class="loading loading-spinner loading-sm mr-2"></span>
								Loading...
							{:else}
								<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
									></path>
								</svg>
								Start Chat
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
	<div class="bg-base-100 flex-1 overflow-hidden rounded-2xl p-2 shadow-lg sm:p-4">
		<div class="card-body flex h-full flex-col overflow-hidden p-0">
			<!-- Search Input -->
			{#if conversations.length > 0}
				<div class="border-base-300/20 flex-shrink-0 border-b p-3 pb-2 sm:p-4 sm:pb-3">
					<div class="relative">
						<input
							type="text"
							placeholder={$t('messages.search_placeholder')}
							class="input input-bordered bg-base-200/50 border-base-300/50 focus:border-primary focus:bg-base-100 w-full py-2 pr-4 pl-10 text-sm transition-all duration-200"
							bind:value={searchQuery}
						/>
						<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="text-base-content/50 h-4 w-4"
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
						{#each Array(3) as _}
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
					<!-- Error State -->
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
						<span>{$t(error)}</span>
					</div>
				{:else if conversations.length === 0}
					<!-- Empty State -->
					<div class="py-12 text-center">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="text-base-content/30 mx-auto h-12 w-12"
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
						<h3 class="mt-4 text-lg font-semibold">{$t('messages.no_messages')}</h3>
						<p class="text-base-content/60 mt-1">{$t('messages.start_conversation')}</p>
						<button class="btn btn-primary mt-4" onclick={startNewMessage}>
							{$t('messages.start_new_message')}
						</button>
					</div>
				{:else if filteredConversations.length === 0}
					<!-- No Search Results -->
					<div class="py-12 text-center">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="text-base-content/30 mx-auto h-12 w-12"
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
						<h3 class="mt-4 text-lg font-semibold">{$t('messages.no_conversations_found')}</h3>
						<p class="text-base-content/60 mt-1">{$t('messages.try_different_search')}</p>
						<button class="btn btn-ghost mt-4" onclick={() => (searchQuery = '')}>
							{$t('messages.clear_search')}
						</button>
					</div>
				{:else}
					<!-- Conversation List -->
					<div class="divide-base-300/20 divide-y">
						{#each filteredConversations as conversation}
							<button
								class="hover:bg-base-200/50 active:bg-base-200 flex w-full items-center gap-3 px-4 py-3 transition-colors sm:gap-4 sm:px-6 sm:py-4"
								onclick={() => selectConversation(conversation.pubkey)}
							>
								<!-- Avatar -->
									<div class="flex-shrink-0">
										{#if conversation.profile.picture}
											<img
												src={conversation.profile.picture}
												alt={conversation.profile.name || $t('messages.unknown_user')}
												class="h-10 w-10 rounded-full object-cover ring-2 ring-base-300"
												width={40}
												height={40}
											/>
										{:else}
											<div class="bg-gradient-to-br from-primary/20 to-secondary/20 flex h-10 w-10 items-center justify-center rounded-full ring-2 ring-base-300">
												{#if conversation.profile.name}
													<span class="text-primary font-semibold text-sm">
														{conversation.profile.name.charAt(0).toUpperCase()}
													</span>
												{:else}
													<svg xmlns="http://www.w3.org/2000/svg" class="text-primary h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
													</svg>
												{/if}
											</div>
										{/if}
									</div>

								<!-- Content -->
								<div class="min-w-0 flex-1 text-left pl-2">
									<div class="mb-2 flex items-center justify-between">
										<h4 class="truncate text-sm font-medium">
											{conversation.profile.name}
										</h4>
										<span class="text-base-content/50 ml-3 flex-shrink-0 text-xs">
											{formatTimeAgo(new Date(conversation.lastMessageTime * 1000))}
										</span>
									</div>
									<p class="text-base-content/70 line-clamp-2 text-xs leading-relaxed">
										{conversation.lastMessage}
									</p>
								</div>

								<!-- Arrow indicator -->
								<div class="flex-shrink-0 pl-2">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="text-base-content/30 h-4 w-4"
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
				{/if}
			</div>
			<!-- Close scrollable content area -->
		</div>
	</div>
</div>
