<script lang="ts">
	import type { Event as NostrEvent } from 'nostr-tools';
	import { Preferences } from '@capacitor/preferences';
	import {
		getMessageHistory,
		sendDirectMessage,
		listenForIncomingMessages,
		assertDirectMessageAllowed,
		isContactBlockedError
	} from '$lib/nostr/direct-messages';
	import { fetchProfileMetadata, subscribeUserProfile } from '$lib/nostr/profile';
	import ChatMessage from './ChatMessage.svelte';
	import { nip19 } from 'nostr-tools';
	import { onDestroy, onMount, tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { t } from 'svelte-i18n';
	import EmojiPicker from '$lib/components/EmojiPicker.svelte';
	import {
		TranslationStore,
		translationSettings,
		messageTranslations
	} from '$lib/stores/translation.store';
	import { isUserToUserMessage, parseMessageContent } from '$lib/utils/helpers/messageParser';
	import { getNostrKeyPair } from '$lib/utils/nostrKeys';
	import { pushNotificationService } from '$lib/api/services/push-notification.service';
	import { notificationCenterService } from '$lib/api/services/notificationCenter.service';
	import type { NotificationPreferencesExtended } from '$lib/types/notification';
	import { getClientOrigin } from '$lib/utils/helpers/clientOrigin';
	import { appScrollContainer } from '$lib/stores/scrollContainer.store';
	import { user } from '$lib/stores/user.store';
	import { muteStore } from '$lib/stores/mute.store';

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

	// Message cache by recipient pubkey to avoid reloading
	const messageCache = new SvelteMap<
		string,
		{ plaintext: string; senderPubkey: string; event: NostrEvent }[]
	>();
	let lastLoadedRecipient = $state<string | null>(null);

	// State
	let messages = $state<{ plaintext: string; senderPubkey: string; event: NostrEvent }[]>([]);

	// Messages visible to the current user — filters out messages from muted senders.
	// Reactive: updates immediately when muteStore changes (e.g. user mutes someone mid-conversation).
	const visibleMessages = $derived.by(() => {
		if (!$muteStore.mutedPubkeys.size) return messages;
		return messages.filter((msg) => !$muteStore.mutedPubkeys.has(msg.senderPubkey));
	});

	let newMessageText = $state('');
	let isLoadingMessages = $state(true);
	let isSendingMessage = $state(false);
	let error = $state('');
	let contactWarning = $state(false);
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

	// Notification preferences (cached for message preview check)
	let notificationPrefs = $state<NotificationPreferencesExtended | null>(null);

	// Pagination state
	let isLoadingMore = $state(false);
	let hasMoreMessages = $state(true);
	let oldestMessageTimestamp = $state<number | null>(null);
	let isNearTop = $state(false);

	// Draft persistence state
	let draftSaveTimeout: ReturnType<typeof setTimeout> | null = null;
	let lastSavedDraft = $state('');

	// References
	let messagesContainer: HTMLDivElement;
	let messageInput: HTMLTextAreaElement;
	let sendButton: HTMLButtonElement | null = $state(null);
	let inputArea: HTMLDivElement | null = $state(null);
	let scrollButton: HTMLButtonElement | null = $state(null);

	// Real-time subscriptions
	let unsubscribe: (() => void) | null = null;
	let profileUnsubscribe: (() => void) | null = null;
	let currentUserProfileUnsubscribe: (() => void) | null = null;

	// App shell scroll container (middle scroll area)
	let appScrollEl = $state<HTMLElement | null>(null);
	let unsubscribeAppScroll: (() => void) | null = null;

	onMount(() => {
		unsubscribeAppScroll = appScrollContainer.subscribe((el) => {
			appScrollEl = el;
		});

		notificationCenterService
			.getPreferences()
			.then((prefs) => {
				notificationPrefs = prefs;
			})
			.catch(() => {
				// Preferences fetch is best-effort; defaults to sending preview
			});
	});

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

	// Track previous recipient to avoid unnecessary reloads
	let previousRecipient = $state<string | null>(null);

	// Load messages when recipient changes
	$effect(() => {
		const currentRecipient = recipientPubkey;
		if (!currentRecipient) {
			return;
		}

		const hex = recipientHex();

		// Only reload if recipient actually changed
		if (previousRecipient === hex) {
			return;
		}

		// Update previous recipient BEFORE doing anything else to prevent loops
		previousRecipient = hex;

		// Cleanup previous subscriptions first
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

		// Check if we already have cached messages for this recipient
		if (lastLoadedRecipient === hex && messageCache.has(hex)) {
			// Use cached messages - no need to reload
			const cachedMessages = messageCache.get(hex)!;
			// Update state without triggering effects
			messages = cachedMessages;
			isLoadingMessages = false;
			// Mark all cached messages as processed
			cachedMessages.forEach((message) => {
				processedMessageIds.add(message.event.id);
			});
			// Set initial load as complete since we're using cache
			isInitialLoadComplete = true;
		} else {
			// New recipient or no cache - load messages
			// Clear processed message IDs when switching conversations
			processedMessageIds.clear();
			// Reset initial load flag when switching conversations
			isInitialLoadComplete = false;
			// TranslationStore handles message ID tracking internally
			resetPagination();
			loadMessages();
		}

		// Always setup listeners and subscriptions
		setupRealtimeListener();
		setupProfileSubscription();
		setupCurrentUserProfileSubscription();
		void loadDraft();
	});

	// Track processed message IDs to avoid re-processing
	let processedMessageIds = $state(new Set<string>());
	// Track if initial load is complete to only translate NEW messages in real-time
	let isInitialLoadComplete = $state(false);

	// Mark initial load as complete after messages are loaded
	// Only run when messages change AND we haven't completed initial load
	let lastProcessedMessageCount = $state(0);
	$effect(() => {
		// Only process if messages changed and we haven't completed initial load
		if (
			messages.length > 0 &&
			!isInitialLoadComplete &&
			messages.length !== lastProcessedMessageCount
		) {
			lastProcessedMessageCount = messages.length;
			// Only mark messages as processed if translation is enabled
			// If translation is disabled, don't mark them so they can be batch translated later
			if ($translationSettings.enabled) {
				messages.forEach((message) => {
					const messageId = message.event.id;
					processedMessageIds.add(messageId);
					// If message is already translated, ensure it's marked as processed
					if (TranslationStore.isMessageTranslated(messageId)) {
						processedMessageIds.add(messageId);
					}
				});
			}
			// Set flag after a short delay to ensure all initial messages are processed
			setTimeout(() => {
				isInitialLoadComplete = true;
			}, 100);
		}
	});

	// Track if we need to batch translate untranslated messages when translation is enabled
	let pendingBatchTranslation = $state(false);
	let lastTranslationEnabledState = $state(false);

	// Helper function to batch translate untranslated messages
	async function batchTranslateUntranslatedMessages() {
		if (pendingBatchTranslation) {
			return;
		}

		if (!isInitialLoadComplete) {
			return;
		}

		const currentMessages = messages;
		if (currentMessages.length === 0) {
			return;
		}

		// Find all untranslated messages that need translation
		const untranslatedMessages = currentMessages
			.filter((message) => {
				const messageId = message.event.id;
				const isFromCurrentUser = message.senderPubkey === currentUserHex();
				const hasText = message.plaintext.trim();

				// Skip if already translated
				if (TranslationStore.isMessageTranslated(messageId)) {
					return false;
				}

				// Skip if already processed (to avoid conflicts with individual translation)
				if (processedMessageIds.has(messageId)) {
					return false;
				}

				// Only translate incoming user-to-user messages with text content
				return (
					!isFromCurrentUser &&
					hasText &&
					hasText.length > 3 &&
					isUserToUserMessage(message.plaintext)
				);
			})
			.map((message) => ({
				messageId: message.event.id,
				text: message.plaintext
			}));

		// If there are untranslated messages, translate them in batch
		if (untranslatedMessages.length > 0) {
			pendingBatchTranslation = true;

			// Mark all as processed IMMEDIATELY to prevent individual translation from processing them
			untranslatedMessages.forEach(({ messageId }) => {
				processedMessageIds.add(messageId);
			});

			// Translate all in batch immediately
			TranslationStore.translateMessagesBatch(untranslatedMessages)
				.then(() => {
					pendingBatchTranslation = false;
				})
				.catch((error) => {
					console.error('Batch translation error:', error);
					pendingBatchTranslation = false;
					// On error, unmark as processed so they can be retried
					untranslatedMessages.forEach(({ messageId }) => {
						processedMessageIds.delete(messageId);
					});
				});
		}
	}

	// When translation is enabled, find and translate all untranslated messages in batch
	$effect(() => {
		const isEnabled = $translationSettings.enabled;

		// Track state change
		const wasJustEnabled = !lastTranslationEnabledState && isEnabled;
		lastTranslationEnabledState = isEnabled;

		// Only process when translation is JUST enabled
		if (wasJustEnabled) {
			// Use setTimeout to ensure messages are loaded
			setTimeout(() => {
				batchTranslateUntranslatedMessages();
			}, 100);
		}
	});

	// Auto-translate only NEW messages that arrive AFTER initial load (real-time only)
	$effect(() => {
		// Only translate if translation is enabled
		if (!$translationSettings.enabled) {
			return;
		}

		// Only process if initial load is complete (to avoid translating on load)
		if (!isInitialLoadComplete) {
			return;
		}

		// Skip if batch translation is in progress (to avoid conflicts)
		if (pendingBatchTranslation) {
			return;
		}

		const currentMessages = messages;

		if (currentMessages.length > 0) {
			// Find only NEW messages that haven't been processed yet
			// Also exclude messages that are already translated
			const newMessages = currentMessages.filter((message) => {
				const messageId = message.event.id;
				// Skip if already processed
				if (processedMessageIds.has(messageId)) {
					return false;
				}
				// Skip if already translated - mark as processed and exclude
				if (TranslationStore.isMessageTranslated(messageId)) {
					processedMessageIds.add(messageId);
					return false;
				}
				return true;
			});

			// For new messages, translate individually (they arrive one by one)
			// Only mark as processed if translation is enabled, otherwise leave them for batch translation
			newMessages.forEach(async (message) => {
				const messageId = message.event.id;
				const isFromCurrentUser = message.senderPubkey === currentUserHex();
				const hasText = message.plaintext.trim();

				// Only translate incoming user-to-user messages with text content
				if (
					!isFromCurrentUser &&
					hasText &&
					hasText.length > 3 &&
					isUserToUserMessage(message.plaintext)
				) {
					// Mark as processed immediately to avoid duplicates (only if translation is enabled)
					if ($translationSettings.enabled) {
						processedMessageIds.add(messageId);
						try {
							// TranslationStore handles duplicate prevention internally
							await TranslationStore.translateMessage(messageId, message.plaintext);
						} catch (error) {
							console.error('Translation error for new message', messageId, ':', error);
						}
					}
					// If translation is disabled, don't mark as processed so they can be batch translated later
				}
			});
		}
	});

	// Auto-save draft and resize textarea when message text changes
	$effect(() => {
		if (newMessageText !== lastSavedDraft && recipientPubkey) {
			saveDraftDebounced();
		}
		if (newMessageText !== undefined) {
			autoResizeTextarea();
		}
	});

	// Auto-scroll to bottom when new messages arrive or translations complete
	$effect(() => {
		const currentMessageCount = messages.length;
		const hasNewMessages = currentMessageCount > previousMessageCount;
		previousMessageCount = currentMessageCount;

		if (hasNewMessages && messagesContainer && !isLoadingMore) {
			// Immediate scroll for new messages
			setTimeout(() => {
				scrollToBottomImmediate();
			}, 50);
		} else if (messages.length > 0 && messagesContainer && !isLoadingMore) {
			// Scroll after a short delay to allow translations to render
			setTimeout(() => {
				scrollToBottom();
			}, 100);
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

	// Position scroll button relative to send button
	$effect(() => {
		if (sendButton && scrollButton && inputArea && !isAtBottom && messages.length > 0) {
			const updatePosition = () => {
				if (sendButton && scrollButton && inputArea) {
					const sendButtonRect = sendButton.getBoundingClientRect();

					// Only update if we have valid coordinates
					if (sendButtonRect.width > 0 && sendButtonRect.height > 0) {
						// Position scroll button above send button, aligned to the right
						const topOffset = sendButtonRect.top - sendButtonRect.height - 36; // 36px gap above
						const rightOffset = window.innerWidth - sendButtonRect.right;

						// Set position immediately to avoid flash in wrong position
						scrollButton.style.position = 'fixed';
						scrollButton.style.top = `${topOffset}px`;
						scrollButton.style.right = `${rightOffset}px`;
						scrollButton.style.bottom = 'auto';
						scrollButton.style.left = 'auto';
					}
				}
			};

			// Hide button initially until position is calculated
			if (scrollButton) {
				scrollButton.style.opacity = '0';
				scrollButton.style.visibility = 'hidden';
			}

			// Update position immediately and after a short delay
			updatePosition();
			const timeoutId = setTimeout(() => {
				updatePosition();
				// Show button after position is set
				if (scrollButton) {
					scrollButton.style.opacity = '1';
					scrollButton.style.visibility = 'visible';
				}
			}, 50);

			// In app-shell mode, window doesn't scroll; the app scroll container does.
			const scrollTarget: HTMLElement | Window = appScrollEl ?? window;
			scrollTarget.addEventListener('scroll', updatePosition as EventListener, { passive: true });
			window.addEventListener('resize', updatePosition, { passive: true });

			// Virtual keyboard / visual viewport changes can move elements without scroll events.
			const vv = window.visualViewport;
			vv?.addEventListener('resize', updatePosition, { passive: true } as AddEventListenerOptions);
			vv?.addEventListener('scroll', updatePosition, { passive: true } as AddEventListenerOptions);

			return () => {
				clearTimeout(timeoutId);
				scrollTarget.removeEventListener('scroll', updatePosition as EventListener);
				window.removeEventListener('resize', updatePosition);
				vv?.removeEventListener('resize', updatePosition as EventListener);
				vv?.removeEventListener('scroll', updatePosition as EventListener);
			};
		} else if (scrollButton) {
			// Hide button if conditions aren't met
			scrollButton.style.opacity = '0';
			scrollButton.style.visibility = 'hidden';
		}
	});

	// Cleanup on component destroy
	onDestroy(() => {
		if (unsubscribeAppScroll) unsubscribeAppScroll();
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
		void saveDraft();
	});

	// Cleanup old temporary messages that might have failed to send
	// Use interval instead of effect to avoid running on every message change
	let cleanupInterval: ReturnType<typeof setInterval> | null = null;
	$effect(() => {
		// Only setup interval if we have messages
		if (messages.length > 0 && !cleanupInterval) {
			cleanupInterval = setInterval(() => {
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
			}, 5000); // Check every 5 seconds instead of on every change
		} else if (messages.length === 0 && cleanupInterval) {
			clearInterval(cleanupInterval);
			cleanupInterval = null;
		}

		return () => {
			if (cleanupInterval) {
				clearInterval(cleanupInterval);
				cleanupInterval = null;
			}
		};
	});

	// --- Draft persistence functions ---
	async function loadDraft() {
		try {
			const { value: saved } = await Preferences.get({ key: draftKey() });
			if (saved && saved.trim()) {
				newMessageText = saved;
				lastSavedDraft = saved;
			}
		} catch (error) {
			console.error('Failed to load draft:', error);
		}
	}

	async function saveDraft() {
		if (!recipientPubkey) return;

		try {
			if (newMessageText.trim()) {
				await Preferences.set({ key: draftKey(), value: newMessageText });
				lastSavedDraft = newMessageText;
			} else {
				await Preferences.remove({ key: draftKey() });
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
			void saveDraft();
		}, DRAFT_SAVE_DELAY);
	}

	async function clearDraft() {
		try {
			await Preferences.remove({ key: draftKey() });
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
			// Fetch initial message history
			const messageHistory = await getMessageHistory(recipientHex(), {
				limit: MESSAGES_PER_PAGE
			});

			// Filter out system messages (bids, contracts, etc.) - only show user-to-user messages
			const userMessages = messageHistory.filter((msg) => isUserToUserMessage(msg.plaintext));

			// Sort messages by timestamp (oldest first)
			const sortedMessages = userMessages.sort((a, b) => a.event.created_at - b.event.created_at);
			messages = sortedMessages;

			// Cache messages for this recipient
			const hex = recipientHex();
			messageCache.set(hex, sortedMessages);
			lastLoadedRecipient = hex;

			// Update pagination state
			if (sortedMessages.length > 0) {
				oldestMessageTimestamp = sortedMessages[0].event.created_at;
				hasMoreMessages = sortedMessages.length === MESSAGES_PER_PAGE;
			} else {
				hasMoreMessages = false;
			}

			// Fetch recipient profile if not provided or incomplete
			if (!initialProfile || (!initialProfile.name && !initialProfile.picture)) {
				try {
					const profile = await fetchProfileMetadata(recipientHex());
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
			error = 'messages.failed_load_messages';
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

			// Check if we received fewer messages than requested (means no more messages available)
			// This check must be done BEFORE filtering to correctly determine if there are more messages
			const hasMoreRawMessages = olderMessages.length === MESSAGES_PER_PAGE;

			if (olderMessages.length > 0) {
				// Filter out system messages (bids, contracts, etc.) - only show user-to-user messages
				const userOlderMessages = olderMessages.filter((msg) => isUserToUserMessage(msg.plaintext));

				// Only update messages and timestamp if we have user messages after filtering
				if (userOlderMessages.length > 0) {
					// Sort and prepend older messages
					const sortedOlderMessages = userOlderMessages.sort(
						(a, b) => a.event.created_at - b.event.created_at
					);
					messages = [...sortedOlderMessages, ...messages];
					// Update cache
					const hex = recipientHex();
					messageCache.set(hex, messages);

					// Update oldest timestamp only if we actually added user messages
					oldestMessageTimestamp = sortedOlderMessages[0].event.created_at;
				}
				// If all messages were system messages, we don't update the messages array or timestamp
				// but we still need to check if there are more messages to load

				// Set hasMoreMessages based on whether we received the full requested amount
				// If we got fewer than requested, there are no more messages
				// If we got exactly the requested amount, there might be more (even if they're system messages)
				hasMoreMessages = hasMoreRawMessages;
			} else {
				// No messages returned from API - definitely no more messages
				hasMoreMessages = false;
			}

			// Preserve scroll position (only if we actually added messages)
			if (olderMessages.length > 0) {
				const userOlderMessages = olderMessages.filter((msg) => isUserToUserMessage(msg.plaintext));
				if (userOlderMessages.length > 0) {
					setTimeout(() => {
						if (messagesContainer) {
							const newScrollHeight = messagesContainer.scrollHeight;
							const scrollDiff = newScrollHeight - previousScrollHeight;
							messagesContainer.scrollTop += scrollDiff;
						}
					}, 0);
				}
			}
		} catch (err) {
			console.error('Error loading more messages:', err);
			// Don't show error for pagination failures, just stop trying
			hasMoreMessages = false;
		} finally {
			isLoadingMore = false;
		}
	}

	async function setupRealtimeListener() {
		// Clean up existing subscription
		if (unsubscribe) {
			unsubscribe();
		}

		const { nsec, npub } = await getNostrKeyPair();
		// Setup new subscription for real-time messages
		unsubscribe = listenForIncomingMessages(npub, nsec, (msg) => {
			const { plaintext, senderPubkey, event } = msg;

			// Only add messages that are relevant to this conversation AND are user-to-user messages
			// Filter out system messages (bids, contracts, etc.)
			if (
				(senderPubkey === recipientHex() ||
					(senderPubkey === currentUserHex() &&
						event.tags.some((tag) => tag[0] === 'p' && tag[1] === recipientHex()))) &&
				isUserToUserMessage(plaintext)
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
						// If it's not temporary, it's a duplicate, so ignore it
					}
				} else {
					// Insert new message in chronological order
					const newMessage = { plaintext, senderPubkey, event };
					messages = [...messages, newMessage].sort(
						(a, b) => a.event.created_at - b.event.created_at
					);
					// Update cache
					const hex = recipientHex();
					messageCache.set(hex, messages);
				}
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
		profileUnsubscribe = subscribeUserProfile(recipientHex(), (profile) => {
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
		currentUserProfileUnsubscribe = subscribeUserProfile(currentUserHex(), (profile) => {
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
		// Include message ID in reply format: > [messageId] original text
		if (replyingToMessage) {
			const messageId = replyingToMessage.event.id;
			const replyPrefix = `> [${messageId}] ${replyingToMessage.plaintext}\n\n`;
			messageContent = replyPrefix + messageContent;
		}

		isSendingMessage = true;
		try {
			await assertDirectMessageAllowed(messageContent, recipientHex());
			contactWarning = false;
		} catch (err) {
			isSendingMessage = false;
			if (isContactBlockedError(err)) {
				contactWarning = true;
				return;
			}
			error = 'messages.failed_send_message';
			console.error('Error checking message:', err);
			return;
		}

		const tempId = `temp-${currentUserHex()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

		try {
			// Clear the input, draft, and reply state immediately for better UX
			newMessageText = '';
			void clearDraft();
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
			// Update cache
			const hex = recipientHex();
			messageCache.set(hex, messages);

			// Send the message
			await sendDirectMessage(messageContent, recipientHex());

			// Send notification to recipient (fire-and-forget — don't block on failure)
			const shouldShowPreview = notificationPrefs?.messagePreview !== false;
			pushNotificationService
				.sendNotificationToNpubs({
					npubs: [recipientPubkey],
					title: $user.name || $user.npub.slice(0, 6) + '...',
					body: shouldShowPreview
						? messageContent?.substring(0, 50) + (messageContent.length > 50 ? '...' : '')
						: $t('messages.new_message'),
					type: 'message',
					clickAction: `${getClientOrigin()}/messages/to/${recipientPubkey}`,
					icon: 'https://bittasker.com/images/logos/bittasker-logomark.svg'
				})
				.catch((err) => {
					console.warn('Message notification failed (non-blocking):', err);
				});
		} catch (err) {
			// On error, remove the temporary message and restore the input
			messages = messages.filter((msg) => msg.event.id !== tempId);
			newMessageText = messageContent;
			if (isContactBlockedError(err)) {
				contactWarning = true;
				return;
			}
			error = 'messages.failed_send_message';
			console.error('Error sending message:', err);

			// Clear error after 5 seconds
			setTimeout(() => {
				error = '';
			}, 5000);
		} finally {
			isSendingMessage = false;
			// Restore focus after sending completes - use setTimeout to ensure DOM is fully updated
			setTimeout(async () => {
				await tick();
				if (messageInput && document.activeElement !== messageInput) {
					messageInput.focus();
				}
			}, 0);
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

	function scrollToMessage(quotedText: string, quotedMessageId?: string | null) {
		if (!messagesContainer) return;

		// If we have a message ID, use it directly (most reliable)
		if (quotedMessageId) {
			const element = messagesContainer.querySelector(`[data-message-id="${quotedMessageId}"]`);
			if (element) {
				element.scrollIntoView({ behavior: 'smooth', block: 'center' });
				(element as HTMLElement).classList.add('highlight-message');
				setTimeout(() => {
					(element as HTMLElement).classList.remove('highlight-message');
				}, 2000);
				return;
			}
		}

		// Fallback to text matching if no ID or ID not found
		if (!quotedText) return;

		const quotedTextLower = quotedText.toLowerCase().trim();
		const messageElements = messagesContainer.querySelectorAll('[data-message-id]');

		for (const element of messageElements) {
			const messageId = element.getAttribute('data-message-id');
			if (!messageId) continue;

			const message = messages.find((m) => m.event.id === messageId);
			if (!message) continue;

			const messageText = parseMessageContent(message.plaintext).toLowerCase().trim();
			if (messageText.includes(quotedTextLower) || quotedTextLower.includes(messageText)) {
				element.scrollIntoView({ behavior: 'smooth', block: 'center' });
				(element as HTMLElement).classList.add('highlight-message');
				setTimeout(() => {
					(element as HTMLElement).classList.remove('highlight-message');
				}, 2000);
				break;
			}
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

	// Function to handle reaction add (placeholder - reactions not yet implemented)
	const handleReactionAdd: (messageId: string, emoji: string) => void = () => {};

	// Function to handle reaction remove (placeholder - reactions not yet implemented)
	const handleReactionRemove: (messageId: string, emoji: string) => void = () => {};

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
		contactWarning = false;
		// The $effect will handle saving the draft automatically
		autoResizeTextarea();
	}
</script>

<div class="flex h-full flex-col">
	<!-- Messages Area - Scrollable -->
	<div
		bind:this={messagesContainer}
		class="relative min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto px-4 py-6 sm:px-6 md:px-8 md:py-8"
		role="log"
		aria-live="polite"
		aria-label={$t('messages.chat_messages_aria')}
	>
		{#if isLoadingMessages}
			<!-- Loading State -->
			<div class="flex items-center justify-center py-6">
				<div class="loading loading-spinner loading-md"></div>
				<span class="ml-2">{$t('messages.loading_messages')}</span>
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
							{$t('messages.loading_older_messages')}
						</div>
					{:else}
						<button
							class="btn btn-ghost btn-sm"
							onclick={handleLoadMore}
							aria-label={$t('messages.load_older_messages')}
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
							{$t('messages.load_older_messages')}
						</button>
					{/if}
				</div>
			{/if}

			{#if visibleMessages.length === 0}
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
						{$t('messages.no_messages')}
						{$t('messages.start_conversation')}
					</p>
				</div>
			{:else}
				<!-- Messages List -->
				{#each visibleMessages as message (message.event.id)}
					{@const isCurrentUserSender = message.senderPubkey === currentUserHex()}
					{@const messageProfile = isCurrentUserSender ? currentUserProfile : recipientProfile}

					<ChatMessage
						{message}
						isSender={isCurrentUserSender}
						profile={messageProfile}
						onReply={startReply}
						currentUserId={currentUserHex()}
						onReactionAdd={handleReactionAdd}
						onReactionRemove={handleReactionRemove}
						onScrollToMessage={(quotedText: string, quotedMessageId?: string | null) =>
							scrollToMessage(quotedText, quotedMessageId)}
					/>
				{/each}
			{/if}
		{/if}
	</div>

	<!-- Scroll to Bottom Button - Floating above send button -->
	{#if !isAtBottom && messages.length > 0}
		<button
			bind:this={scrollButton}
			class="btn btn-info btn-circle fixed z-50 shadow-xl transition-all duration-200 hover:scale-110 hover:shadow-2xl"
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

	<!-- Message Input Area - Fixed at bottom, above navbar -->
	<div bind:this={inputArea} class="bg-base-100 border-base-300/20 relative shrink-0 px-4 sm:px-6">
		{#if contactWarning}
			<div class="alert alert-warning mt-3 text-sm" role="status">
				<span>{$t('messages.contact_filter_warning')}</span>
			</div>
		{/if}
		<!-- Reply Indicator -->
		{#if replyingToMessage}
			{@const replyMessageId = replyingToMessage.event.id}
			{@const replyTranslation = $messageTranslations.get(replyMessageId)}
			{@const replyDisplayText = replyTranslation
				? replyTranslation.translatedText
				: replyingToMessage.plaintext}
			<div class="bg-base-200 border-base-300 mb-3 rounded-lg border p-3">
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0 flex-1">
						<div class="text-base-content/60 mb-1.5 text-xs font-medium">
							Replying to {replyingToMessage.senderPubkey === currentUserHex()
								? 'yourself'
								: 'message'}:
						</div>
						<div class="text-base-content/80 line-clamp-2 text-sm leading-relaxed">
							{replyDisplayText}
						</div>
					</div>
					<button
						type="button"
						class="btn btn-ghost btn-xs hover:bg-base-300 shrink-0 transition-colors"
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

		<form onsubmit={handleSubmit} class="relative mb-6 w-full">
			<!-- Main Input Field with Buttons Inside -->
			<div
				class="bg-base-200 flex w-full items-end gap-2 rounded-2xl p-2 transition-all duration-200 sm:p-3"
			>
				<!-- Emoji Button - Left Side -->
				<button
					type="button"
					bind:this={emojiButtonRef}
					class="btn btn-ghost btn-sm hover:bg-base-300 h-8 min-h-0 w-8 shrink-0 p-0 transition-colors"
					onclick={() => (showEmojiPicker = !showEmojiPicker)}
					title="Add emoji"
					aria-label="Add emoji"
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
						class="textarea placeholder-base-content/50 min-h-0 w-full resize-none border-none bg-transparent p-1 text-sm leading-6 focus:ring-0 focus:outline-none sm:p-1.5 sm:text-base"
						placeholder={$t('messages.send_message')}
						rows="1"
						disabled={isSendingMessage}
						autofocus
						style="max-height: 120px;"
					></textarea>
				</div>

				<!-- Send Button (Paper Airplane) - Right Side -->
				<button
					bind:this={sendButton}
					type="submit"
					class="btn btn-info h-8 min-h-0 w-8 shrink-0 rounded-full p-0 transition-all duration-200 hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
					disabled={!newMessageText.trim() || isSendingMessage}
					title={$t('messages.send_message')}
				>
					{#if isSendingMessage}
						<span class="loading loading-spinner loading-xs"></span>
					{:else}
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
								d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
							/>
						</svg>
					{/if}
				</button>
			</div>

			<!-- Typing indicator or character count could go here -->
			{#if newMessageText.length > 1000}
				<div class="text-warning mt-2 text-right text-sm">
					{newMessageText.length}/2000 {$t('messages.characters')}
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
