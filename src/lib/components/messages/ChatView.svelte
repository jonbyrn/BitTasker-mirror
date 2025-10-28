<script lang="ts">
	import type { Event as NostrEvent } from 'nostr-tools';
	import {
		getMessageHistory,
		sendDirectMessage,
		fetchProfileMetadata,
		listenForIncomingMessages,
		subscribeToProfileUpdates
	} from '$lib/utils/nostr-message';
	import ChatMessage from './ChatMessage.svelte';
	import { nip19 } from 'nostr-tools';
	import { onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';
	import EmojiPicker from '$lib/components/EmojiPicker.svelte';
	import { TranslationStore } from '$lib/stores/translation.store';
	import { TranslationService } from '$lib/services/translation.service';
	import { smartMessageCache } from '$lib/utils/messageCache';

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
	let recipientProfile = $state<{ name?: string; picture?: string }>({});
	let currentUserProfile = $state<{ name?: string; picture?: string }>({
		name: $t('dashboard.bids.components.messages.chat_message.you')
	});

	// Reply state
	let replyingToMessage = $state<{
		plaintext: string;
		senderPubkey: string;
		event: NostrEvent;
	} | null>(null);

	// Emoji picker state
	let showEmojiPicker = $state(false);
	let emojiButtonRef = $state<HTMLElement | null>(null);

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

	// Real-time subscriptions
	let unsubscribe: (() => void) | null = null;
	let profileUnsubscribe: (() => void) | null = null;
	let currentUserProfileUnsubscribe: (() => void) | null = null;

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
		} catch (error) {
			console.error('Error converting currentUserPubkey to hex:', error);
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

	// Track translated message IDs to prevent duplicate calls
	// Note: translatedMessageIds is now managed by TranslationStore to avoid conflicts

	// Track previous message count for auto-scroll
	let previousMessageCount = $state(0);

	// Track if user is at bottom for scroll-to-bottom button
	let isAtBottom = $state(true);

	// Translation service instance
	const translationService = new TranslationService();

	// Preload translations for current conversation
	$effect(() => {
		if (messages.length > 0) {
			const messageIds = messages.map((msg) => msg.event.id);
			TranslationStore.preloadConversationTranslations(messageIds);
		}
	});

	// Load messages when recipient changes
	$effect(() => {
		if (recipientPubkey) {
			// Clear processed message IDs when switching conversations
			processedMessageIds.clear();
			// TranslationStore handles message ID tracking internally
			resetPagination();
			loadMessages();
			setupRealtimeListener();
			setupProfileSubscription();
			setupCurrentUserProfileSubscription();
			loadDraft();
		}

		// Cleanup on recipient change
		return () => {
			if (unsubscribe) {
				unsubscribe();
				unsubscribe = null;
			}
			if (profileUnsubscribe) {
				profileUnsubscribe();
				profileUnsubscribe = null;
			}
			if (currentUserProfileUnsubscribe) {
				currentUserProfileUnsubscribe();
				currentUserProfileUnsubscribe = null;
			}
		};
	});

	// Track processed message IDs to avoid re-processing
	let processedMessageIds = $state(new Set<string>());

	// Auto-translate only NEW messages when they arrive
	$effect(() => {
		const currentMessages = messages;

		if (currentMessages.length > 0) {
			// Find only NEW messages that haven't been processed yet
			const newMessages = currentMessages.filter((message) => {
				const messageId = message.event.id;
				return !processedMessageIds.has(messageId);
			});

			// Process new messages for translation
			newMessages.forEach(async (message) => {
				const messageId = message.event.id;
				const isFromCurrentUser = message.senderPubkey === currentUserHex();
				const hasText = message.plaintext.trim();

				// Mark as processed immediately to avoid duplicates
				processedMessageIds.add(messageId);

				// Only translate incoming messages with text content
				if (!isFromCurrentUser && hasText && hasText.length > 3) {
					const isNotSystemMessage =
						!message.plaintext.startsWith('[') && !message.plaintext.startsWith('{');

					if (isNotSystemMessage) {
						try {
							// TranslationStore handles duplicate prevention internally
							const result = await TranslationStore.translateMessage(messageId, message.plaintext);
						} catch (error) {
							console.error('Translation error for new message', messageId, ':', error);
						}
					}
				}
			});
		}
	});

	// Auto-save draft when message text changes
	$effect(() => {
		if (newMessageText !== lastSavedDraft && recipientPubkey) {
			saveDraftDebounced();
		}
	});

	// Auto-resize textarea when message text changes
	$effect(() => {
		if (newMessageText !== undefined) {
			autoResizeTextarea();
		}
	});

	// Auto-scroll to bottom when new messages arrive (but not when loading more)
	$effect(() => {
		if (messages.length > 0 && messagesContainer && !isLoadingMore) {
			// Use setTimeout to ensure DOM is updated
			setTimeout(() => {
				scrollToBottom();
			}, 100);
		}
	});

	// Auto-scroll when new messages are added (not just when array changes)
	$effect(() => {
		const currentMessageCount = messages.length;
		const hasNewMessages = currentMessageCount > previousMessageCount;

		if (hasNewMessages && messagesContainer && !isLoadingMore) {
			// Immediate scroll for new messages
			setTimeout(() => {
				scrollToBottomImmediate();
			}, 50);
		}

		previousMessageCount = currentMessageCount;
	});

	// Auto-scroll when translations complete
	$effect(() => {
		if (messages.length > 0 && messagesContainer && !isLoadingMore) {
			// Scroll after a short delay to allow translations to render
			setTimeout(() => {
				scrollToBottom();
			}, 500);
		}
	});

	// Monitor scroll position for infinite scroll and bottom detection
	$effect(() => {
		if (messagesContainer) {
			const handleScroll = () => {
				const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
				isNearTop = scrollTop < SCROLL_THRESHOLD;

				// Check if user is at bottom (within 50px)
				const isNearBottom = scrollTop + clientHeight >= scrollHeight - 50;
				isAtBottom = isNearBottom;

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
		if (profileUnsubscribe) {
			profileUnsubscribe();
		}
		if (currentUserProfileUnsubscribe) {
			currentUserProfileUnsubscribe();
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
			const currentUserHexPubkey = currentUserHex();
			const recipientHexPubkey = recipientHex();
			
			// STEP 1: Try to load from cache first
			const cached = smartMessageCache.get(currentUserHexPubkey, recipientHexPubkey);
			if (cached && !smartMessageCache.isStale(`${currentUserHexPubkey}:${recipientHexPubkey}`)) {
				messages = cached.messages;
				oldestMessageTimestamp = cached.oldestMessageTimestamp;
				hasMoreMessages = true; // Assume there might be more
				isLoadingMessages = false; // Show cached immediately
			}
			
			// STEP 2: Fetch fresh messages in background (with timeout already applied!)
			const messageHistory = await getMessageHistory(recipientHexPubkey, {
				limit: MESSAGES_PER_PAGE
			});
			
			// Sort messages by timestamp (oldest first)
			const sortedMessages = messageHistory.sort((a, b) => a.event.created_at - b.event.created_at);
			messages = sortedMessages;
			
			// Update cache
			if (sortedMessages.length > 0) {
				oldestMessageTimestamp = sortedMessages[0].event.created_at;
				hasMoreMessages = sortedMessages.length === MESSAGES_PER_PAGE;
				smartMessageCache.set(currentUserHexPubkey, recipientHexPubkey, sortedMessages, oldestMessageTimestamp);
			} else {
				hasMoreMessages = false;
			}
			
			// Fetch recipient profile if not provided (with timeout already applied!)
			if (!initialProfile || (!initialProfile.name && !initialProfile.picture)) {
				try {
					const profile = await fetchProfileMetadata(recipientHexPubkey);
					if (profile && (profile.name || profile.picture)) {
						recipientProfile = profile;
					}
				} catch (profileErr) {
					console.error('Failed to fetch recipient profile:', profileErr);
				}
			} else {
				recipientProfile = initialProfile;
			}
		} catch (err) {
			error = 'dashboard.bids.components.messages.chat_view.failed_load_messages';
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
					} else {
					}
					// If it's not temporary, it's a duplicate, so ignore it
				} else {
					// Insert new message in chronological order
					const newMessage = { plaintext, senderPubkey, event };
					messages = [...messages, newMessage].sort(
						(a, b) => a.event.created_at - b.event.created_at
					);
				}
			} else {
			}
		});
	}

	function setupProfileSubscription() {
		// Clean up existing subscription
		if (profileUnsubscribe) {
			profileUnsubscribe();
		}

		// First, try to fetch the profile immediately
		fetchProfileMetadata(recipientHex())
			.then((profile) => {
				if (profile && (profile.name || profile.picture)) {
					recipientProfile = { ...profile };
				}
			})
			.catch((err) => {
				console.error('Failed to fetch recipient profile:', err);
			});

		// Setup new subscription for profile updates using hex format
		profileUnsubscribe = subscribeToProfileUpdates(recipientHex(), (profile) => {
			// Only update if we get valid profile data, otherwise keep existing
			if (profile && (profile.name || profile.picture)) {
				// Create a new object reference to ensure Svelte reactivity
				recipientProfile = { ...profile };
			}
		});
	}

	function setupCurrentUserProfileSubscription() {
		// Clean up existing subscription
		if (currentUserProfileUnsubscribe) {
			currentUserProfileUnsubscribe();
		}

		// Fetch current user's initial profile
		fetchProfileMetadata(currentUserHex())
			.then((profile) => {
				currentUserProfile = {
					name: profile.name || $t('dashboard.bids.components.messages.chat_message.you'),
					picture: profile.picture
				};
			})
			.catch((err) => {
				console.error('Failed to fetch current user profile:', err);
			});

		// Setup new subscription for current user profile updates using hex format
		currentUserProfileUnsubscribe = subscribeToProfileUpdates(currentUserHex(), (profile) => {
			// Only update if we get valid profile data
			if (profile && (profile.name || profile.picture)) {
				currentUserProfile = {
					name: profile.name || $t('dashboard.bids.components.messages.chat_message.you'),
					picture: profile.picture
				};
			}
		});
	}

	async function sendMessage() {
		if (!newMessageText.trim() || isSendingMessage) return;

		let messageContent = newMessageText.trim();

		// Add reply context if replying to a message
		if (replyingToMessage) {
			const replyPrefix = `> ${replyingToMessage.plaintext}\n\n`;
			messageContent = replyPrefix + messageContent;
		}

		const tempId = `temp-${currentUserHex()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		isSendingMessage = true;

		try {
			// Clear the input, draft, and reply state immediately for better UX
			newMessageText = '';
			clearDraft();
			replyingToMessage = null;

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
			error = 'dashboard.bids.components.messages.chat_view.failed_send_message';
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
			// Use smooth scrolling for better UX
			messagesContainer.scrollTo({
				top: messagesContainer.scrollHeight,
				behavior: 'smooth'
			});
		}
	}

	// Force scroll to bottom (immediate, no animation)
	function scrollToBottomImmediate() {
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

	// Auto-resize textarea based on content
	function autoResizeTextarea() {
		if (messageInput) {
			// Reset height to auto to get the correct scrollHeight
			messageInput.style.height = 'auto';
			// Set height based on scroll height, with min and max bounds
			const newHeight = Math.min(Math.max(messageInput.scrollHeight, 24), 120);
			messageInput.style.height = newHeight + 'px';
		}
	}

	// Function to start replying to a message
	function startReply(message: { plaintext: string; senderPubkey: string; event: NostrEvent }) {
		replyingToMessage = message;
		messageInput?.focus();
	}

	// Function to cancel reply
	function cancelReply() {
		replyingToMessage = null;
	}

	// Function to handle emoji selection
	function handleEmojiSelect(emoji: string) {
		newMessageText += emoji;
		messageInput?.focus();
		showEmojiPicker = false;
	}

	// Function to handle reaction add
	function handleReactionAdd(messageId: string, emoji: string) {
		// TODO: Implement reaction storage and sync with Nostr
		console.log('Add reaction:', messageId, emoji);
	}

	// Function to handle reaction remove
	function handleReactionRemove(messageId: string, emoji: string) {
		// TODO: Implement reaction removal and sync with Nostr
		console.log('Remove reaction:', messageId, emoji);
	}

	function handleSubmit(event: Event) {
		event.preventDefault();
		sendMessage();
	}

	// Manual load more function for explicit "Load More" button
	function handleLoadMore() {
		loadMoreMessages();
	}

	// Handle input changes for draft saving and auto-resize
	function handleInputChange() {
		// The $effect will handle saving the draft automatically
		autoResizeTextarea();
	}
</script>

<div class="flex h-full flex-col">
	<!-- Messages Area - Scrollable -->
	<div
		bind:this={messagesContainer}
		class="relative min-h-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-6"
		role="log"
		aria-live="polite"
		aria-label={$t('dashboard.bids.components.messages.chat_view.chat_messages_aria')}
	>
		{#if isLoadingMessages}
			<!-- Loading State -->
			<div class="flex items-center justify-center py-6">
				<div class="loading loading-spinner loading-md"></div>
				<span class="ml-2"
					>{$t('dashboard.bids.components.messages.chat_view.loading_messages')}</span
				>
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
		{:else}
			<!-- Load More Section (shown at top when more messages available) -->
			{#if hasMoreMessages}
				<div class="flex justify-center py-2">
					{#if isLoadingMore}
						<div class="text-base-content/60 flex items-center gap-2 text-sm">
							<div class="loading loading-spinner loading-sm"></div>
							{$t('dashboard.bids.components.messages.chat_view.loading_older_messages')}
						</div>
					{:else}
						<button
							class="btn btn-ghost btn-sm"
							onclick={handleLoadMore}
							aria-label={$t('dashboard.bids.components.messages.chat_view.load_older_messages')}
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
							{$t('dashboard.bids.components.messages.chat_view.load_older_messages')}
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
					<p class="text-base-content/60">
						{$t('dashboard.bids.components.messages.chat_view.no_messages')}
						{$t('dashboard.bids.components.messages.chat_view.start_conversation')}
					</p>
				</div>
			{:else}
				<!-- Messages List -->
				{#each messages as message}
					{@const isCurrentUserSender = message.senderPubkey === currentUserHex()}
					{@const messageProfile = isCurrentUserSender ? currentUserProfile : recipientProfile}

					<!-- Debug logs removed for performance -->

					<ChatMessage
						{message}
						isSender={isCurrentUserSender}
						profile={messageProfile}
						{currentUserProfile}
						{recipientProfile}
						onReply={startReply}
						currentUserId={currentUserHex()}
						onReactionAdd={handleReactionAdd}
						onReactionRemove={handleReactionRemove}
					/>
				{/each}
			{/if}
		{/if}

		<!-- Scroll to Bottom Button -->
		{#if !isAtBottom && messages.length > 0}
			<button
				class="btn btn-primary btn-circle fixed right-4 bottom-16 sm:right-6 sm:bottom-20 z-10 shadow-lg"
				onclick={scrollToBottom}
				aria-label="Scroll to bottom"
				title="Scroll to latest message"
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
						d="M19 14l-7 7m0 0l-7-7m7 7V3"
					/>
				</svg>
			</button>
		{/if}
	</div>

	<!-- Message Input Area - Fixed at bottom -->
	<div class="border-base-300/20 bg-base-100 flex-shrink-0 border-t px-4 py-3 sm:px-6 sm:py-4">
		<!-- Reply Indicator -->
		{#if replyingToMessage}
			<div class="bg-base-200/50 border-base-300/30 mb-3 rounded-lg border p-3">
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0 flex-1">
						<div class="text-base-content/60 mb-1 text-xs">
							Replying to {replyingToMessage.senderPubkey === currentUserHex()
								? 'yourself'
								: 'message'}:
						</div>
						<div class="text-base-content/80 line-clamp-2 text-sm">
							{replyingToMessage.plaintext}
						</div>
					</div>
					<button
						type="button"
						class="btn btn-ghost btn-xs hover:bg-base-300 flex-shrink-0"
						onclick={cancelReply}
						title="Cancel reply"
						aria-label="Cancel reply"
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
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>
			</div>
		{/if}

		<form onsubmit={handleSubmit} class="relative w-full">
			<div
				class="bg-base-200/50 border-base-300/30 focus-within:border-primary/50 focus-within:bg-base-100 flex items-end gap-2 rounded-lg border p-2 transition-all duration-200 sm:p-3 w-full"
			>
				<!-- Emoji Button -->
				<button
					type="button"
					bind:this={emojiButtonRef}
					class="btn btn-ghost btn-sm hover:bg-base-300 h-8 min-h-0 w-8 flex-shrink-0 p-0 transition-colors sm:h-10 sm:w-10"
					onclick={() => (showEmojiPicker = !showEmojiPicker)}
					title="Add emoji"
					aria-label="Add emoji"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4 sm:h-5 sm:w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
				</button>

				<!-- Message Input -->
				<div class="min-w-0 flex-1">
					<!-- svelte-ignore a11y_autofocus -->
					<textarea
						bind:this={messageInput}
						bind:value={newMessageText}
						onkeydown={handleKeyPress}
						oninput={handleInputChange}
						class="textarea placeholder-base-content/50 min-h-0 w-full resize-none border-0 bg-transparent p-1 text-sm leading-5 focus:ring-0 focus:outline-none sm:p-2 sm:text-base"
						placeholder={$t(
							'dashboard.bids.components.messages.chat_view.type_message_placeholder'
						)}
						rows="1"
						disabled={isSendingMessage}
						autofocus
						style="max-height: 120px;"
					></textarea>
				</div>

				<!-- Send Button -->
				<button
					type="submit"
					class="btn btn-primary btn-sm h-10 w-10 flex-shrink-0 rounded-full shadow-md transition-all duration-200 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-10"
					disabled={!newMessageText.trim() || isSendingMessage}
					title={$t('dashboard.bids.components.messages.chat_view.send_message')}
				>
					{#if isSendingMessage}
						<span class="loading loading-spinner loading-sm"></span>
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 sm:h-5 sm:w-5"
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
			</div>

			<!-- Typing indicator or character count could go here -->
			{#if newMessageText.length > 1000}
				<div class="text-warning mt-2 text-right text-sm">
					{newMessageText.length}/2000 {$t(
						'dashboard.bids.components.messages.chat_view.characters'
					)}
				</div>
			{/if}
		</form>
	</div>

	<!-- Emoji Picker -->
	<EmojiPicker
		bind:isOpen={showEmojiPicker}
		onEmojiSelect={handleEmojiSelect}
		position="top"
		triggerElement={emojiButtonRef}
	/>
</div>
