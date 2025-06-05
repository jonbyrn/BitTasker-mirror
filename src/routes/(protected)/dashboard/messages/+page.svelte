<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		fetchProfileMetadata,
		getMessagedPeople,
		listenForIncomingMessages,
		subscribeToProfileUpdates
	} from '$lib/utils/nostr-message';
	import { conversationManager } from '$lib/utils/conversation-manager';
	import Avatar from '$lib/components/Avatar.svelte';
	import { formatTimeAgo } from '$lib/utils/helpers/date';
	import { nip19 } from 'nostr-tools';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { page } from '$app/stores';
	import ChatView from '$lib/components/messages/ChatView.svelte';

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
	let selectedPubkey = $state<string | null>(null);
	let currentUserNpub = $state<string>('');

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
		)
	);

	// Modal state
	let showModal = $state(false);
	let newMessagePubkey = $state('');
	let newMessageError = $state('');
	let newMessageProfile = $state<{ name?: string; picture?: string } | null>(null);
	let isProfileLoading = $state(false);

	// Real-time subscription for conversation list updates
	let conversationListUnsubscribe: (() => void) | null = null;

	// Profile subscriptions map to track individual profile updates
	let profileSubscriptions = new Map<string, () => void>();

	// Load conversations and handle URL parameters on mount
	onMount(async () => {
		try {
			// Get current user's npub
			currentUserNpub = await getNpub();

			// Load existing conversations
			const people = await getMessagedPeople();
			conversations = people;

			// Setup profile subscriptions for existing conversations
			for (const conversation of conversations) {
				setupProfileSubscription(conversation.pubkey);
			}

			// Handle chatWith URL parameter
			const chatWithParam = $page.url.searchParams.get('chatWith');
			if (chatWithParam) {
				try {
					let hexPubkey = chatWithParam;

					// Convert npub to hex if needed
					if (chatWithParam.startsWith('npub')) {
						hexPubkey = nip19.decode(chatWithParam).data as string;
					}

					// Set selected conversation
					selectedPubkey = hexPubkey;

					// If this user is not in conversations, fetch their profile and add them
					if (!conversations.some((c) => c.pubkey === hexPubkey)) {
						try {
							// fetchProfileMetadata expects hex format
							const profile = await fetchProfileMetadata(hexPubkey);
							newMessageProfile = profile;
							conversations = [
								{
									pubkey: hexPubkey,
									lastEvent: { content: '', created_at: Math.floor(Date.now() / 1000) },
									profile: profile || {}
								},
								...conversations
							];

							// Setup profile subscription for new conversation
							setupProfileSubscription(hexPubkey);
						} catch (profileErr) {
							console.error('Failed to fetch profile for chatWith user:', profileErr);
						}
					}
				} catch (urlErr) {
					console.error('Invalid chatWith parameter:', urlErr);
				}
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load conversations';
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

		// Clean up all profile subscriptions
		for (const unsubscribe of profileSubscriptions.values()) {
			unsubscribe();
		}
		profileSubscriptions.clear();
	});

	function setupConversationListListener() {
		// Clean up existing subscription
		if (conversationListUnsubscribe) {
			conversationListUnsubscribe();
		}

		// Setup new subscription for real-time conversation updates
		conversationListUnsubscribe = listenForIncomingMessages(async (msg) => {
			const { plaintext, senderPubkey, event } = msg;

			// Find or create conversation for this message
			const existingConversationIndex = conversations.findIndex((c) => c.pubkey === senderPubkey);

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
					setupProfileSubscription(senderPubkey);
				} catch (err) {
					console.error('Failed to fetch profile for new conversation:', err);
				}
			}
		});
	}

	function setupProfileSubscription(pubkey: string) {
		// Don't subscribe if already subscribed
		if (profileSubscriptions.has(pubkey)) {
			return;
		}

		const unsubscribe = subscribeToProfileUpdates(pubkey, (profile) => {
			// Update the conversation with new profile data
			const conversationIndex = conversations.findIndex((c) => c.pubkey === pubkey);
			if (conversationIndex >= 0) {
				conversations[conversationIndex] = {
					...conversations[conversationIndex],
					profile: profile
				};

				// Trigger reactivity
				conversations = [...conversations];
			}
		});

		profileSubscriptions.set(pubkey, unsubscribe);
	}

	// Handle conversation selection
	function selectConversation(pubkey: string) {
		selectedPubkey = pubkey;
	}

	// Handle going back to conversation list
	function goBackToList() {
		selectedPubkey = null;
	}

	// Handle new message
	function startNewMessage() {
		newMessagePubkey = '';
		newMessageError = '';
		newMessageProfile = null;
		showModal = true;
	}

	function closeModal() {
		showModal = false;
	}

	async function handlePubkeyInput(e: Event) {
		const value = (e.target as HTMLInputElement).value.trim();
		newMessagePubkey = value;
		newMessageError = '';
		newMessageProfile = null;
		if (!value) return;

		let hexPubkey = value;

		// Convert npub to hex if needed
		if (value.startsWith('npub')) {
			try {
				hexPubkey = nip19.decode(value).data as string;
			} catch {
				newMessageError = 'Invalid npub format';
				return;
			}
		} else if (!/^[a-fA-F0-9]{64}$/.test(value)) {
			newMessageError = 'Invalid public key format';
			return;
		}

		isProfileLoading = true;
		try {
			// fetchProfileMetadata expects hex format
			const profileEvent = await fetchProfileMetadata(hexPubkey);
			if (profileEvent && profileEvent.name && profileEvent.picture) {
				newMessageProfile = { name: profileEvent.name, picture: profileEvent.picture };
			}
		} catch {
			newMessageError = 'Failed to fetch profile';
		} finally {
			isProfileLoading = false;
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
				newMessageError = 'Invalid npub format';
				return;
			}
		} else if (!/^[a-fA-F0-9]{64}$/.test(value)) {
			newMessageError = 'Invalid public key format';
			return;
		}
		selectedPubkey = hexPubkey;
		showModal = false;
		// Optionally, add to conversations if not present
		if (!conversations.some((c) => c.pubkey === hexPubkey)) {
			conversations = [
				{
					pubkey: hexPubkey,
					lastEvent: { content: '', created_at: Math.floor(Date.now() / 1000) },
					profile: newMessageProfile || {}
				},
				...conversations
			];
		}
	}
</script>

<div class="flex h-full flex-col">
	<!-- Header -->
	<div class="mb-6 flex flex-shrink-0 items-center justify-between">
		<h2 class="text-2xl font-bold">Messages</h2>
		<button class="btn btn-primary" onclick={startNewMessage}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mr-2 h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
			New Message
		</button>
	</div>

	<!-- Modal -->
	<input type="checkbox" class="modal-toggle" checked={showModal} style="display:none" readonly />
	{#if showModal}
		<div class="modal modal-open">
			<div class="modal-box">
				<h3 class="mb-2 text-lg font-bold">Start New Message</h3>
				<form onsubmit={submitNewMessage}>
					<label class="form-control mb-2 w-full">
						<span class="label-text mb-1">Recipient Public Key (npub or hex)</span>
						<input
							type="text"
							class="input input-bordered w-full"
							bind:value={newMessagePubkey}
							oninput={handlePubkeyInput}
							autofocus
							placeholder="npub... or hex pubkey"
						/>
					</label>
					{#if newMessageError}
						<div class="text-error mb-2">{newMessageError}</div>
					{/if}
					{#if isProfileLoading}
						<div class="mb-2">Loading profile...</div>
					{:else if newMessageProfile}
						<div class="mb-2 flex items-center gap-2">
							<Avatar
								user={{
									name: newMessageProfile.name || 'Unknown',
									profileImage: newMessageProfile.picture || null
								}}
								size="sm"
							/>
							<span>{newMessageProfile.name}</span>
						</div>
					{/if}
					<div class="modal-action">
						<button type="button" class="btn" onclick={closeModal}>Cancel</button>
						<button
							type="submit"
							class="btn btn-primary"
							disabled={!newMessagePubkey || !!newMessageError}>Start</button
						>
					</div>
				</form>
			</div>
			<button class="modal-backdrop" onclick={closeModal} aria-label="Close modal"></button>
		</div>
	{/if}

	<!-- Main Content -->
	<div class="card bg-base-100 flex-1 overflow-hidden shadow-xl">
		{#if selectedPubkey}
			<!-- Chat View -->
			<div class="flex h-full flex-col">
				<!-- Chat Header with Back Button -->
				<div class="border-base-300 flex items-center gap-3 border-b p-4">
					<button
						class="btn btn-ghost btn-sm"
						onclick={goBackToList}
						aria-label="Go back to conversations"
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
					<h3 class="text-lg font-semibold">Back to Messages</h3>
				</div>

				<!-- ChatView Component -->
				<div class="flex-1 overflow-hidden">
					<ChatView
						recipientPubkey={selectedPubkey}
						currentUserPubkey={currentUserNpub}
						initialProfile={newMessageProfile}
					/>
				</div>
			</div>
		{:else}
			<!-- Conversation List -->
			<div class="card-body p-4">
				<!-- Search Input -->
				{#if conversations.length > 0}
					<div class="mb-4">
						<div class="relative">
							<input
								type="text"
								placeholder="Search conversations..."
								class="input input-bordered w-full pl-10"
								bind:value={searchQuery}
							/>
							<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-5 w-5 text-gray-400"
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

				{#if isLoading}
					<!-- Loading State -->
					<div class="space-y-4">
						{#each Array(5) as _}
							<div class="flex animate-pulse items-center gap-4">
								<div class="bg-base-300 h-12 w-12 rounded-full"></div>
								<div class="flex-1">
									<div class="bg-base-300 mb-2 h-4 w-1/4 rounded"></div>
									<div class="bg-base-300 h-3 w-2/3 rounded"></div>
								</div>
							</div>
						{/each}
					</div>
				{:else if error}
					<!-- Error State -->
					<div class="alert alert-error">
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
						<h3 class="mt-4 text-lg font-semibold">No messages yet</h3>
						<p class="text-base-content/60 mt-1">Start a conversation with someone</p>
						<button class="btn btn-primary mt-4" onclick={startNewMessage}>Start New Message</button
						>
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
						<h3 class="mt-4 text-lg font-semibold">No conversations found</h3>
						<p class="text-base-content/60 mt-1">Try a different search term</p>
						<button class="btn btn-ghost mt-4" onclick={() => (searchQuery = '')}>
							Clear search
						</button>
					</div>
				{:else}
					<!-- Conversation List -->
					<div class="space-y-2">
						{#each filteredConversations as conversation}
							<button
								class="hover:bg-base-200 flex w-full items-center gap-4 rounded-lg p-3 transition-colors"
								onclick={() => selectConversation(conversation.pubkey)}
							>
								<div class="flex w-10 items-center gap-2 rounded-full">
									<img
										src={conversation.profile.picture}
										alt={conversation.profile.name || 'Unknown'}
										class="h-10 w-10 rounded-full object-cover"
										width={40}
										height={40}
									/>
								</div>
								<div class="">
									<div class="flex flex-col items-baseline justify-between">
										<h3 class="font-medium">
											{conversation.profile.name || conversation.pubkey.slice(0, 8) + '...'}
										</h3>
										<span class="text-base-content/60 text-sm">
											{formatTimeAgo(new Date(conversation.lastMessageTime * 1000))}
										</span>
									</div>
									<p
										class="text-base-content/60 line-clamp-1 max-w-[500px] overflow-hidden text-sm text-ellipsis"
									>
										{conversation.lastMessage}
									</p>
								</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
