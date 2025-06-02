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

	// Pagination state
	let isLoadingMore = $state(false);
	let hasMoreMessages = $state(true);
	let oldestMessageTimestamp = $state<number | null>(null);
	let isNearTop = $state(false);

	// Draft persistence state
	let draftSaveTimeout: NodeJS.Timeout | null = null;
	let lastSavedDraft = $state('');

	// References
	let messagesContainer: HTMLDivElement;
	let messageInput: HTMLTextAreaElement;

	// Real-time subscription
	let unsubscribe: (() => void) | null = null;

	// Configuration
	const MESSAGES_PER_PAGE = 50;
	const SCROLL_THRESHOLD = 200; // pixels from top to trigger load more
	const DRAFT_SAVE_DELAY = 1000; // milliseconds to wait before saving draft

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

	// Draft persistence key
	const draftKey = $derived(() => `chat_draft_${currentUserHex()}_${recipientHex()}`);

	// Load messages when recipient changes
	$effect(() => {
		if (recipientPubkey) {
			resetPagination();
			loadMessages();
			setupRealtimeListener();
			loadDraft();
		}

		// Cleanup on recipient change
		return () => {
			if (unsubscribe) {
				unsubscribe();
				unsubscribe = null;
			}
		};
	});

	// Auto-save draft when message text changes
	$effect(() => {
		if (newMessageText !== lastSavedDraft && recipientPubkey) {
			saveDraftDebounced();
		}
	});

	// Auto-scroll to bottom when new messages arrive (but not when loading more)
	$effect(() => {
		if (messages.length > 0 && messagesContainer && !isLoadingMore) {
			scrollToBottom();
		}
	});

	// Monitor scroll position for infinite scroll
	$effect(() => {
		if (messagesContainer) {
			const handleScroll = () => {
				const { scrollTop } = messagesContainer;
				isNearTop = scrollTop < SCROLL_THRESHOLD;

				// Trigger load more when near top and not already loading
				if (isNearTop && hasMoreMessages && !isLoadingMore && !isLoadingMessages) {
					loadMoreMessages();
				}
			};

			messagesContainer.addEventListener('scroll', handleScroll);
			return () => messagesContainer.removeEventListener('scroll', handleScroll);
		}
	});

	// Cleanup on component destroy
	onDestroy(() => {
		if (unsubscribe) {
			unsubscribe();
		}
		if (draftSaveTimeout) {
			clearTimeout(draftSaveTimeout);
		}
		// Save any pending draft before unmounting
		saveDraft();
	});

	// Cleanup old temporary messages that might have failed to send
	$effect(() => {
		if (messages.length > 0) {
			const now = Math.floor(Date.now() / 1000);
			const cleanedMessages = messages.filter((msg) => {
				// Remove temporary messages older than 30 seconds
				if (msg.event.id.startsWith('temp-') && now - msg.event.created_at > 30) {
					return false;
				}
				return true;
			});

			if (cleanedMessages.length !== messages.length) {
				messages = cleanedMessages;
			}
		}
	});

	// --- Draft persistence functions ---
	function loadDraft() {
		try {
			const saved = localStorage.getItem(draftKey());
			if (saved && saved.trim()) {
				newMessageText = saved;
				lastSavedDraft = saved;
			}
		} catch (error) {
			console.error('Failed to load draft:', error);
		}
	}

	function saveDraft() {
		if (!recipientPubkey) return;

		try {
			if (newMessageText.trim()) {
				localStorage.setItem(draftKey(), newMessageText);
				lastSavedDraft = newMessageText;
			} else {
				// Clear empty drafts
				localStorage.removeItem(draftKey());
				lastSavedDraft = '';
			}
		} catch (error) {
			console.error('Failed to save draft:', error);
		}
	}

	function saveDraftDebounced() {
		if (draftSaveTimeout) {
			clearTimeout(draftSaveTimeout);
		}

		draftSaveTimeout = setTimeout(() => {
			saveDraft();
		}, DRAFT_SAVE_DELAY);
	}

	function clearDraft() {
		try {
			localStorage.removeItem(draftKey());
			lastSavedDraft = '';
		} catch (error) {
			console.error('Failed to clear draft:', error);
		}
	}

	// --- Existing functions ---
	function resetPagination() {
		messages = [];
		isLoadingMore = false;
		hasMoreMessages = true;
		oldestMessageTimestamp = null;
		isNearTop = false;
	}

	async function loadMessages() {
		isLoadingMessages = true;
		error = '';

		try {
			console.log('🔄 Loading messages for recipient:', recipientHex());

			// Fetch initial message history
			const messageHistory = await getMessageHistory(recipientHex(), {
				limit: MESSAGES_PER_PAGE
			});

			console.log('📥 Received message history:', messageHistory.length, 'messages');

			// Sort messages by timestamp (oldest first)
			const sortedMessages = messageHistory.sort((a, b) => a.event.created_at - b.event.created_at);
			messages = sortedMessages;

			console.log('📋 Messages set in component state:', messages.length);

			// Update pagination state
			if (sortedMessages.length > 0) {
				oldestMessageTimestamp = sortedMessages[0].event.created_at;
				hasMoreMessages = sortedMessages.length === MESSAGES_PER_PAGE;
			} else {
				hasMoreMessages = false;
			}

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

	async function loadMoreMessages() {
		if (!hasMoreMessages || isLoadingMore || !oldestMessageTimestamp) return;

		isLoadingMore = true;
		const previousScrollHeight = messagesContainer.scrollHeight;

		try {
			// Fetch older messages using the oldest timestamp as 'until'
			const olderMessages = await getMessageHistory(recipientHex(), {
				limit: MESSAGES_PER_PAGE,
				until: oldestMessageTimestamp - 1 // Subtract 1 to exclude the oldest message we already have
			});

			if (olderMessages.length > 0) {
				// Sort and prepend older messages
				const sortedOlderMessages = olderMessages.sort(
					(a, b) => a.event.created_at - b.event.created_at
				);
				messages = [...sortedOlderMessages, ...messages];

				// Update oldest timestamp
				oldestMessageTimestamp = sortedOlderMessages[0].event.created_at;

				// Check if we have more messages to load
				hasMoreMessages = olderMessages.length === MESSAGES_PER_PAGE;

				// Preserve scroll position
				setTimeout(() => {
					if (messagesContainer) {
						const newScrollHeight = messagesContainer.scrollHeight;
						const scrollDiff = newScrollHeight - previousScrollHeight;
						messagesContainer.scrollTop += scrollDiff;
					}
				}, 0);
			} else {
				hasMoreMessages = false;
			}
		} catch (err) {
			console.error('Error loading more messages:', err);
			// Don't show error for pagination failures, just stop trying
			hasMoreMessages = false;
		} finally {
			isLoadingMore = false;
		}
	}

	function setupRealtimeListener() {
		// Clean up existing subscription
		if (unsubscribe) {
			unsubscribe();
		}

		console.log('🎧 Setting up real-time listener for conversation with:', recipientHex());

		// Setup new subscription for real-time messages
		unsubscribe = listenForIncomingMessages((msg) => {
			const { plaintext, senderPubkey, event } = msg;

			console.log('📨 Real-time message received in ChatView:', {
				senderPubkey,
				plaintext,
				eventId: event.id,
				currentRecipient: recipientHex(),
				currentUser: currentUserHex()
			});

			// Only add messages that are relevant to this conversation
			if (
				senderPubkey === recipientHex() ||
				(senderPubkey === currentUserHex() &&
					event.tags.some((tag) => tag[0] === 'p' && tag[1] === recipientHex()))
			) {
				console.log('✅ Message is relevant to current conversation');

				// Check if we already have this message to avoid duplicates
				const existingMessageIndex = messages.findIndex((existingMsg) => {
					// Check by event ID first (most reliable)
					if (existingMsg.event.id === event.id) {
						return true;
					}
					// Check if this is a real message replacing a temporary one
					if (
						existingMsg.event.id.startsWith('temp-') &&
						existingMsg.plaintext === plaintext &&
						existingMsg.senderPubkey === senderPubkey &&
						Math.abs(existingMsg.event.created_at - event.created_at) < 10 // Within 10 seconds
					) {
						return true;
					}
					return false;
				});

				if (existingMessageIndex >= 0) {
					console.log('🔄 Replacing existing message at index:', existingMessageIndex);
					// Replace the existing message (especially if it was temporary)
					const existingMessage = messages[existingMessageIndex];
					if (existingMessage.event.id.startsWith('temp-')) {
						// Replace temporary message with real one
						const newMessage = { plaintext, senderPubkey, event };
						messages = [
							...messages.slice(0, existingMessageIndex),
							newMessage,
							...messages.slice(existingMessageIndex + 1)
						].sort((a, b) => a.event.created_at - b.event.created_at);
						console.log('✅ Replaced temporary message with real one');
					} else {
						console.log('⚠️ Duplicate message ignored');
					}
					// If it's not temporary, it's a duplicate, so ignore it
				} else {
					console.log('➕ Adding new message to conversation');
					// Insert new message in chronological order
					const newMessage = { plaintext, senderPubkey, event };
					messages = [...messages, newMessage].sort(
						(a, b) => a.event.created_at - b.event.created_at
					);
					console.log('📋 Total messages now:', messages.length);
				}
			} else {
				console.log('❌ Message not relevant to current conversation');
			}
		});
	}

	async function sendMessage() {
		if (!newMessageText.trim() || isSendingMessage) return;

		const messageContent = newMessageText.trim();
		const tempId = `temp-${currentUserHex()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		isSendingMessage = true;

		try {
			// Clear the input and draft immediately for better UX
			newMessageText = '';
			clearDraft();

			// Create a local message object to add to the UI immediately
			const localMessage = {
				plaintext: messageContent,
				senderPubkey: currentUserHex(),
				event: {
					id: tempId,
					pubkey: currentUserHex(),
					created_at: Math.floor(Date.now() / 1000),
					kind: 4,
					tags: [['p', recipientHex()]],
					content: '', // Encrypted content, not needed for display
					sig: '' // Not needed for display
				}
			};

			// Add the sent message to the local state immediately
			messages = [...messages, localMessage].sort(
				(a, b) => a.event.created_at - b.event.created_at
			);

			// Send the message
			await sendDirectMessage(messageContent, recipientHex());

			// Focus back on input
			if (messageInput) {
				messageInput.focus();
			}
		} catch (err) {
			// On error, remove the temporary message and restore the input
			messages = messages.filter((msg) => msg.event.id !== tempId);
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

	// Manual load more function for explicit "Load More" button
	function handleLoadMore() {
		loadMoreMessages();
	}

	// Handle input changes for draft saving
	function handleInputChange() {
		// The $effect will handle saving the draft automatically
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
		{:else}
			<!-- Load More Section (shown at top when more messages available) -->
			{#if hasMoreMessages}
				<div class="flex justify-center py-2">
					{#if isLoadingMore}
						<div class="text-base-content/60 flex items-center gap-2 text-sm">
							<div class="loading loading-spinner loading-sm"></div>
							Loading older messages...
						</div>
					{:else}
						<button
							class="btn btn-ghost btn-sm"
							onclick={handleLoadMore}
							aria-label="Load older messages"
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
									d="M5 15l7-7 7 7"
								/>
							</svg>
							Load older messages
						</button>
					{/if}
				</div>
			{/if}

			{#if messages.length === 0}
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
					oninput={handleInputChange}
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
