<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { nip19 } from 'nostr-tools';
	import { goto } from '$app/navigation';
	import {
		fetchProfileMetadata,
		getMessagedPeople,
		listenForIncomingMessages,
		subscribeToProfileUpdates
	} from '$lib/utils/nostr-message';
	import { formatTimeAgo } from '$lib/utils/helpers/date';
	import { conversationManager } from '$lib/utils/conversation-manager';
	import Avatar from '$lib/components/Avatar.svelte';

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

	// Load conversations on mount
	onMount(async () => {
		try {
			// Load existing conversations
			const people = await getMessagedPeople();
			conversations = people;

			// Setup profile subscriptions for existing conversations
			for (const conversation of conversations) {
				setupProfileSubscription(conversation.pubkey);
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
		goto(`/dashboard/messages/to/${pubkey}`);
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

		// Navigate to the new chat page
		goto(`/dashboard/messages/to/${hexPubkey}`);
		showModal = false;
	}
</script>

<div class="mx-auto flex h-full max-w-7xl flex-col p-4 sm:p-0">
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
	<input 
		type="checkbox" 
		class="modal-toggle" 
		checked={showModal} 
		style="display:none" 
		readonly 
		aria-label="Toggle new message modal"
	/>
	{#if showModal}
		<div class="modal modal-open">
			<div class="modal-box max-w-md">
				<!-- Modal Header -->
				<div class="mb-6">
					<h3 class="text-xl font-semibold">Start New Message</h3>
					<p class="text-base-content/60 mt-1 text-sm">
						Enter a public key to start a conversation
					</p>
				</div>

				<form onsubmit={submitNewMessage} class="space-y-4">
					<!-- Input Section -->
					<div class="space-y-2">
						<label for="recipient-pubkey" class="text-sm font-medium">Recipient Public Key</label>
						<input
							id="recipient-pubkey"
							type="text"
							class="input input-bordered w-full text-sm"
							bind:value={newMessagePubkey}
							oninput={handlePubkeyInput}
							placeholder="npub1... or hex pubkey"
						/>
						<p class="text-base-content/50 text-xs">
							Enter an npub (starts with npub1) or hex public key
						</p>
					</div>

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
							<Avatar
								user={{
									name: newMessageProfile.name || 'Unknown',
									picture: newMessageProfile.picture || null
								}}
								size="md"
							/>
							<div class="min-w-0 flex-1">
								<p class="truncate font-medium">{newMessageProfile.name || 'Unknown User'}</p>
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
					{:else if newMessagePubkey && !newMessageError}
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
								<p class="text-base-content/60 font-medium">No profile found</p>
								<p class="text-base-content/50 truncate text-xs">
									{newMessagePubkey.startsWith('npub')
										? `${newMessagePubkey.slice(0, 16)}...`
										: `${newMessagePubkey.slice(0, 8)}...`}
								</p>
							</div>
						</div>
					{/if}

					<!-- Action Buttons -->
					<div class="flex gap-3 pt-4">
						<button type="button" class="btn btn-ghost flex-1" onclick={closeModal}>
							Cancel
						</button>
						<button
							type="submit"
							class="btn btn-primary flex-1"
							disabled={!newMessagePubkey || !!newMessageError}
						>
							{#if isProfileLoading}
								<span class="loading loading-spinner loading-sm"></span>
								Loading...
							{:else}
								Start Chat
							{/if}
						</button>
					</div>
				</form>
			</div>
			<button class="modal-backdrop" onclick={closeModal} aria-label="Close modal"></button>
		</div>
	{/if}

	<!-- Main Content - Conversation List Only -->
	<div class="card bg-base-100 flex-1 overflow-hidden shadow-xl">
		<div class="card-body flex h-full flex-col overflow-hidden p-4">
			<!-- Search Input -->
			{#if conversations.length > 0}
				<div class="mb-4 flex-shrink-0">
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

			<!-- Scrollable content area -->
			<div class="min-h-0 flex-1 overflow-y-auto">
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
			<!-- Close scrollable content area -->
		</div>
	</div>
</div>
