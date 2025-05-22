<script lang="ts">
	import type { Event as NostrEvent } from 'nostr-tools';
	import {
		getMessageHistory,
		sendDirectMessage,
		fetchProfileMetadata,
		listenForIncomingMessages
	} from '$lib/utils/nostr-message';
	import ChatMessage from './ChatMessage.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import { nip19 } from 'nostr-tools';
	import { onDestroy } from 'svelte';

	// Props
	let {
		recipientPubkey,
		currentUserPubkey,
		initialProfile
	}: {
		recipientPubkey: string;
		currentUserPubkey: string;
		initialProfile: { name?: string; picture?: string } | null;
	} = $props();

	// State
	let messages = $state<{ plaintext: string; senderPubkey: string; event: NostrEvent }[]>([]);
	let newMessageText = $state('');
	let isLoadingMessages = $state(true);
	let isSendingMessage = $state(false);
	let error = $state('');
	let recipientProfile = $state<{ name?: string; picture?: string }>(initialProfile || {});

	// References
	let messagesContainer: HTMLDivElement;
	let messageInput: HTMLTextAreaElement;

	// Real-time subscription
	let unsubscribe: (() => void) | null = null;

	// Convert pubkeys to display format
	const currentUserHex = $derived(() => {
		try {
			return currentUserPubkey.startsWith('npub')
				? (nip19.decode(currentUserPubkey).data as string)
				: currentUserPubkey;
		} catch {
			return currentUserPubkey;
		}
	});

	const recipientHex = $derived(() => {
		try {
			return recipientPubkey.startsWith('npub')
				? (nip19.decode(recipientPubkey).data as string)
				: recipientPubkey;
		} catch {
			return recipientPubkey;
		}
	});

	// Load messages when recipient changes
	$effect(() => {
		if (recipientPubkey) {
			loadMessages();
			setupRealtimeListener();
		}

		// Cleanup on recipient change
		return () => {
			if (unsubscribe) {
				unsubscribe();
				unsubscribe = null;
			}
		};
	});

	// Auto-scroll to bottom when new messages arrive
	$effect(() => {
		if (messages.length > 0 && messagesContainer) {
			scrollToBottom();
		}
	});

	// Cleanup on component destroy
	onDestroy(() => {
		if (unsubscribe) {
			unsubscribe();
		}
	});

	async function loadMessages() {
		isLoadingMessages = true;
		error = '';

		try {
			// Fetch message history
			const messageHistory = await getMessageHistory(recipientHex(), { limit: 50 });

			// Sort messages by timestamp (oldest first)
			messages = messageHistory.sort((a, b) => a.event.created_at - b.event.created_at);

			// Fetch recipient profile if not provided
			if (!initialProfile || (!initialProfile.name && !initialProfile.picture)) {
				try {
					const profile = await fetchProfileMetadata(recipientPubkey);
					recipientProfile = profile;
				} catch (profileErr) {
					console.error('Failed to fetch recipient profile:', profileErr);
				}
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load messages';
			console.error('Error loading messages:', err);
		} finally {
			isLoadingMessages = false;
		}
	}

	function setupRealtimeListener() {
		// Clean up existing subscription
		if (unsubscribe) {
			unsubscribe();
		}

		// Setup new subscription for real-time messages
		unsubscribe = listenForIncomingMessages((msg) => {
			const { plaintext, senderPubkey, event } = msg;

			// Only add messages that are relevant to this conversation
			if (
				senderPubkey === recipientHex() ||
				(senderPubkey === currentUserHex() &&
					event.tags.some((tag) => tag[0] === 'p' && tag[1] === recipientHex()))
			) {
				// Check if we already have this message to avoid duplicates
				const messageExists = messages.some((existingMsg) => existingMsg.event.id === event.id);
				if (!messageExists) {
					// Insert message in chronological order
					const newMessage = { plaintext, senderPubkey, event };
					messages = [...messages, newMessage].sort(
						(a, b) => a.event.created_at - b.event.created_at
					);
				}
			}
		});
	}

	async function sendMessage() {
		if (!newMessageText.trim() || isSendingMessage) return;

		const messageContent = newMessageText.trim();
		isSendingMessage = true;

		try {
			// Clear the input immediately for better UX
			newMessageText = '';

			// Send the message - real-time listener will add it to the UI
			await sendDirectMessage(messageContent, recipientHex());

			// Focus back on input
			if (messageInput) {
				messageInput.focus();
			}
		} catch (err) {
			// On error, restore the message text so user can retry
			newMessageText = messageContent;
			error = err instanceof Error ? err.message : 'Failed to send message';
			console.error('Error sending message:', err);

			// Clear error after 5 seconds
			setTimeout(() => {
				error = '';
			}, 5000);
		} finally {
			isSendingMessage = false;
		}
	}

	function scrollToBottom() {
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	}

	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}

	function handleSubmit(event: Event) {
		event.preventDefault();
		sendMessage();
	}
</script>

<div class="flex h-full flex-col">
	<!-- Chat Header -->
	<div class="border-base-300 flex items-center gap-3 border-b p-4">
		<Avatar
			user={{
				name: recipientProfile.name || 'Unknown',
				profileImage: recipientProfile.picture || null
			}}
			size="md"
		/>
		<div class="flex-1">
			<h3 class="font-semibold">
				{recipientProfile.name || `${recipientPubkey.slice(0, 8)}...`}
			</h3>
			<p class="text-base-content/60 text-sm">
				{recipientPubkey.startsWith('npub')
					? recipientPubkey
					: `${recipientPubkey.slice(0, 16)}...`}
			</p>
		</div>
	</div>

	<!-- Messages Area -->
	<div
		bind:this={messagesContainer}
		class="flex-1 space-y-1 overflow-y-auto p-4"
		role="log"
		aria-live="polite"
		aria-label="Chat messages"
	>
		{#if isLoadingMessages}
			<!-- Loading State -->
			<div class="flex items-center justify-center py-8">
				<div class="loading loading-spinner loading-md"></div>
				<span class="ml-2">Loading messages...</span>
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
		{:else if messages.length === 0}
			<!-- Empty State -->
			<div class="flex flex-col items-center justify-center py-8 text-center">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-base-content/30 mb-4 h-12 w-12"
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
				<p class="text-base-content/60">No messages yet. Start the conversation!</p>
			</div>
		{:else}
			<!-- Messages List -->
			{#each messages as message}
				<ChatMessage
					{message}
					isSender={message.senderPubkey === currentUserHex()}
					profile={message.senderPubkey === currentUserHex() ? { name: 'You' } : recipientProfile}
				/>
			{/each}
		{/if}
	</div>

	<!-- Message Input Area -->
	<div class="border-base-300 border-t p-4">
		<form onsubmit={handleSubmit} class="flex gap-3">
			<div class="flex-1">
				<textarea
					bind:this={messageInput}
					bind:value={newMessageText}
					onkeydown={handleKeyPress}
					class="textarea textarea-bordered w-full resize-none"
					placeholder="Type a message..."
					rows="1"
					disabled={isSendingMessage}
					autofocus
				></textarea>
			</div>
			<button
				type="submit"
				class="btn btn-primary"
				disabled={!newMessageText.trim() || isSendingMessage}
			>
				{#if isSendingMessage}
					<span class="loading loading-spinner loading-sm"></span>
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
							d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
						/>
					</svg>
				{/if}
			</button>
		</form>
	</div>
</div>
