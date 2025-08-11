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
	// Defer importing wallet helper functions until needed to avoid heavy module side-effects on load

	import { t } from 'svelte-i18n';

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

	// Contract modal state
	let isCreateContractOpen = $state(false);
	let isIncomingContractOpen = $state(false);
	let pendingIncomingPayload: any = $state(null);

	// Fields for creating a contract offer
	let offerDerivationPath = $state('');
	let offerClientPubkey = $state('');
	let offerCsvBlocks = $state<number>(60); // default 60 minutes (~60 blocks on Liquid)
	let recipientProfile = $state<{ name?: string; picture?: string }>(initialProfile || {});
	let currentUserProfile = $state<{ name?: string; picture?: string }>({
		name: $t('messages.you')
	});

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
			scrollToBottom();
		}
	});

	// Monitor scroll position for infinite scroll
	$effect(() => {
		let cleanup = () => {};
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
			cleanup = () => messagesContainer.removeEventListener('scroll', handleScroll);
		}
		return cleanup;
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
			console.log('loading messages for', recipientHex());
			// Fetch initial message history
			const messageHistory = await getMessageHistory(recipientHex(), {
				limit: MESSAGES_PER_PAGE
			});

			// Sort messages by timestamp (oldest first)
			const sortedMessages = messageHistory.sort((a, b) => a.event.created_at - b.event.created_at);
			messages = sortedMessages;

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

		console.log('setting up real-time listener for', recipientHex());
		// Setup new subscription for real-time messages
		unsubscribe = listenForIncomingMessages((msg) => {
			console.log('received message', msg);
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

		// Setup new subscription for profile updates using hex format
		profileUnsubscribe = subscribeToProfileUpdates(recipientHex(), (profile) => {
			// Only update if we get valid profile data, otherwise keep existing
			if (profile && (profile.name || profile.picture)) {
				// Create a new object reference to ensure Svelte reactivity
				recipientProfile = { ...profile };
			} else {
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
				currentUserProfile = { name: profile.name || $t('messages.you'), picture: profile.picture };
			})
			.catch((err) => {
				console.error('Failed to fetch current user profile:', err);
			});

		// Setup new subscription for current user profile updates using hex format
		currentUserProfileUnsubscribe = subscribeToProfileUpdates(currentUserHex(), (profile) => {
			// Only update if we get valid profile data
			if (profile && (profile.name || profile.picture)) {
				currentUserProfile = { name: profile.name || $t('messages.you'), picture: profile.picture };
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
			error = 'messages.failed_send_message';
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

	// --- Local storage for initiator offer context ---
	type OfferContext = {
		derivationPath: string;
		clientPubkey: string;
		csvBlocks: number;
		timestamp: number;
	};
	type OfferContextStore = { latest?: OfferContext; byPath?: Record<string, OfferContext> };
	function offerStorageKey() {
		return `contract_offers_${currentUserHex()}_${recipientHex()}`;
	}
	function saveOfferContext(ctx: OfferContext) {
		try {
			const key = offerStorageKey();
			const existingRaw = localStorage.getItem(key);
			const existing: OfferContextStore = existingRaw ? JSON.parse(existingRaw) : {};
			const updated: OfferContextStore = {
				latest: ctx,
				byPath: { ...(existing.byPath || {}), [ctx.derivationPath]: ctx }
			};
			localStorage.setItem(key, JSON.stringify(updated));
		} catch (e) {
			console.warn('Failed to persist offer context', e);
		}
	}
	function loadOfferContext(derivationPath?: string): OfferContext | undefined {
		try {
			const key = offerStorageKey();
			const existingRaw = localStorage.getItem(key);
			if (!existingRaw) return undefined;
			const existing: OfferContextStore = JSON.parse(existingRaw);
			if (derivationPath && existing.byPath && existing.byPath[derivationPath])
				return existing.byPath[derivationPath];
			return existing.latest;
		} catch (e) {
			console.warn('Failed to load offer context', e);
			return undefined;
		}
	}

	// Create Contract flow
	async function openCreateContract() {
		try {
			const { buildClientSharePayload } = await import('$lib/wallet/helper');
			const payload = await buildClientSharePayload({});
			offerDerivationPath = payload.derivationPath;
			offerClientPubkey = payload.clientPubkey;
			isCreateContractOpen = true;
		} catch (e) {
			console.error(e);
			error = 'Failed to generate contract keys';
			setTimeout(() => (error = ''), 4000);
		}
	}

	async function confirmCreateContract() {
		try {
			const special = {
				type: 'contract_offer',
				version: 1,
				network: 'liquid',
				derivationPath: offerDerivationPath,
				clientPubkey: offerClientPubkey,
				csvBlocks: offerCsvBlocks,
				timestamp: Date.now()
			};
			const content = JSON.stringify(special);
			// send via nostr
			await sendDirectMessage(content, recipientHex());

			// persist initiator offer context locally for future vault creation
			saveOfferContext({
				derivationPath: offerDerivationPath,
				clientPubkey: offerClientPubkey,
				csvBlocks: offerCsvBlocks,
				timestamp: special.timestamp
			});
			isCreateContractOpen = false;
		} catch (e) {
			console.error(e);
			error = 'Failed to send contract offer';
			setTimeout(() => (error = ''), 4000);
		}
	}

	function closeCreateContract() {
		isCreateContractOpen = false;
	}

	async function handleViewContract(detail: {
		payload: any;
		event: NostrEvent;
		isSender: boolean;
	}) {
		const { payload, isSender } = detail;
		// If clicking on contract_accept from initiator’s side, proceed to Create Vault directly
		if (payload?.type === 'contract_accept' && isSender) {
			try {
				const { saveMultisigSetup, createMultisigVault, submitVaultToServer } = await import(
					'$lib/wallet/helper'
				);
				// Retrieve initiator's context from storage using derivationPath
				const ctx = loadOfferContext(payload.derivationPath);
				const clientPubkeyFromCtx = ctx?.clientPubkey || offerClientPubkey || '';
				if (!clientPubkeyFromCtx) throw new Error('Missing initiator client pubkey');

				const setup = await saveMultisigSetup({
					derivationPath: payload.derivationPath,
					clientPubkey: clientPubkeyFromCtx,
					freelancerPubkey: payload.freelancerPubkey
				});
				const vault = await createMultisigVault({
					setupId: setup.id,
					clientPubkey: clientPubkeyFromCtx,
					freelancerPubkey: payload.freelancerPubkey,
					csvBlocks: payload.csvBlocks,
					network: 'liquid'
				});
				// Send created announcement back
				const createdMsg = {
					type: 'contract_created',
					version: 1,
					setupId: setup.id,
					vaultId: vault.id,
					address: vault.address,
					descriptor: vault.descriptor,
					csvBlocks: vault.csvBlocks,
					derivationPath: payload.derivationPath,
					timestamp: Date.now()
				};
				await sendDirectMessage(JSON.stringify(createdMsg), recipientHex());

				// Submit to backend for tracking
				await submitVaultToServer();
			} catch (e) {
				console.error(e);
				error = 'Failed to create vault';
				setTimeout(() => (error = ''), 4000);
			}
			return;
		}
		// Otherwise open view modal for offers
		pendingIncomingPayload = payload;
		isIncomingContractOpen = true;
	}

	async function acceptIncomingContract() {
		try {
			if (!pendingIncomingPayload || pendingIncomingPayload.type !== 'contract_offer') return;
			// Build freelancer pubkey using the shared derivation path
			const { buildFreelancerSharePayload, saveMultisigSetup, createMultisigVault } = await import(
				'$lib/wallet/helper'
			);
			const { freelancerPubkey } = await buildFreelancerSharePayload({
				derivationPath: pendingIncomingPayload.derivationPath
			});
			// Send accept message first
			const acceptMsg = {
				type: 'contract_accept',
				version: 1,
				derivationPath: pendingIncomingPayload.derivationPath,
				freelancerPubkey,
				csvBlocks: pendingIncomingPayload.csvBlocks,
				timestamp: Date.now()
			};
			await sendDirectMessage(JSON.stringify(acceptMsg), recipientHex());

			// Create local vault record for UX (optional for other side). We'll also send a created notice
			const setup = await saveMultisigSetup({
				derivationPath: pendingIncomingPayload.derivationPath,
				clientPubkey: pendingIncomingPayload.clientPubkey,
				freelancerPubkey
			});
			const vault = await createMultisigVault({
				setupId: setup.id,
				clientPubkey: pendingIncomingPayload.clientPubkey,
				freelancerPubkey,
				csvBlocks: pendingIncomingPayload.csvBlocks,
				network: 'liquid'
			});

			const createdMsg = {
				type: 'contract_created',
				version: 1,
				setupId: setup.id,
				vaultId: vault.id,
				address: vault.address,
				descriptor: vault.descriptor,
				csvBlocks: vault.csvBlocks,
				derivationPath: pendingIncomingPayload.derivationPath,
				timestamp: Date.now()
			};
			await sendDirectMessage(JSON.stringify(createdMsg), recipientHex());

			isIncomingContractOpen = false;
			pendingIncomingPayload = null;
		} catch (e) {
			console.error(e);
			error = 'Failed to accept contract';
			setTimeout(() => (error = ''), 4000);
		}
	}

	async function rejectIncomingContract() {
		try {
			if (!pendingIncomingPayload || pendingIncomingPayload.type !== 'contract_offer') return;
			const rejectMsg = {
				type: 'contract_reject',
				version: 1,
				derivationPath: pendingIncomingPayload.derivationPath,
				reason: 'Declined',
				timestamp: Date.now()
			};
			await sendDirectMessage(JSON.stringify(rejectMsg), recipientHex());
			isIncomingContractOpen = false;
			pendingIncomingPayload = null;
		} catch (e) {
			console.error(e);
			error = 'Failed to reject contract';
			setTimeout(() => (error = ''), 4000);
		}
	}
</script>

<div class="flex flex-col">
	<!-- Messages Area -->
	<div
		bind:this={messagesContainer}
		class="max-h-[70dvh] min-h-0 flex-1 space-y-1 overflow-y-auto p-4"
		role="log"
		aria-live="polite"
		aria-label={$t('messages.chat_messages_aria')}
	>
		{#if isLoadingMessages}
			<!-- Loading State -->
			<div class="flex items-center justify-center py-8">
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
						{$t('messages.no_messages')}
						{$t('messages.start_conversation')}
					</p>
				</div>
			{:else}
				<!-- Messages List -->
				{#each messages as message}
					<ChatMessage
						onViewContract={handleViewContract}
						{message}
						isSender={message.senderPubkey === currentUserHex()}
						profile={message.senderPubkey === currentUserHex()
							? currentUserProfile
							: recipientProfile}
					/>
				{/each}
			{/if}
		{/if}
	</div>

	<!-- Message Input Area -->
	<div class="border-base-300 bg-base-100 flex-shrink-0 rounded-b-[2rem] border-t p-2">
		<form onsubmit={handleSubmit} class="relative">
			<div class="flex items-center gap-2 rounded-2xl p-1">
				<!-- Create Contract Button -->
				<button
					type="button"
					class="btn btn-ghost btn-sm h-10 min-h-0 rounded-full"
					onclick={openCreateContract}
					title="Create Contract"
				>
					Create Contract
				</button>

				<!-- Message Input -->
				<div class="flex-1">
					<!-- svelte-ignore a11y_autofocus -->
					<textarea
						bind:this={messageInput}
						bind:value={newMessageText}
						onkeydown={handleKeyPress}
						oninput={handleInputChange}
						class="textarea placeholder-base-content/50 bg-base-200 min-h-0 w-full resize-none border-0 p-2 text-base leading-6 focus:outline-none"
						placeholder={$t('messages.type_message_placeholder')}
						rows="1"
						disabled={isSendingMessage}
						autofocus
						style="max-height: 120px;"
					></textarea>
				</div>

				<!-- Attachment Button (Optional - can be expanded later) -->
				<!-- <button
					type="button"
					class="btn btn-ghost btn-sm h-8 min-h-0 w-8 p-0"
					title="Attach file"
					disabled={isSendingMessage}
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
							d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
						/>
					</svg>
				</button> -->

				<!-- Send Button -->
				<button
					type="submit"
					class="btn btn-primary btn-sm h-10 min-h-0 w-12 rounded-full"
					disabled={!newMessageText.trim() || isSendingMessage}
					title={$t('messages.send_message')}
				>
					{#if isSendingMessage}
						<span class="loading loading-spinner loading-sm"></span>
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

	<!-- Create Contract Modal -->
	{#if isCreateContractOpen}
		<div class="modal modal-open">
			<div class="modal-box">
				<h3 class="mb-4 text-lg font-bold">Create Contract</h3>
				<div class="space-y-3">
					<label class="form-control">
						<div class="label"><span class="label-text">CSV deadline (blocks)</span></div>
						<input type="number" min="1" class="input input-bordered" bind:value={offerCsvBlocks} />
					</label>
					<div class="bg-base-200 rounded-xl p-3">
						<div class="text-sm opacity-70">Derivation Path</div>
						<div class="font-mono text-sm break-all">{offerDerivationPath}</div>
					</div>
					<div class="bg-base-200 rounded-xl p-3">
						<div class="text-sm opacity-70">Your Pubkey</div>
						<div class="font-mono text-sm break-all">{offerClientPubkey}</div>
					</div>
				</div>
				<div class="modal-action">
					<button class="btn" onclick={closeCreateContract}>Cancel</button>
					<button class="btn btn-primary" onclick={confirmCreateContract}>Send Offer</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Incoming Contract Modal -->
	{#if isIncomingContractOpen && pendingIncomingPayload}
		<div class="modal modal-open">
			<div class="modal-box">
				<h3 class="mb-4 text-lg font-bold">Contract Offer</h3>
				<div class="space-y-3">
					<div class="bg-base-200 rounded-xl p-3">
						<div class="text-sm opacity-70">Deadline (blocks)</div>
						<div class="font-mono text-sm">{pendingIncomingPayload.csvBlocks}</div>
					</div>
					<div class="bg-base-200 rounded-xl p-3">
						<div class="text-sm opacity-70">Client Pubkey</div>
						<div class="font-mono text-sm break-all">{pendingIncomingPayload.clientPubkey}</div>
					</div>
					<div class="bg-base-200 rounded-xl p-3">
						<div class="text-sm opacity-70">Derivation Path</div>
						<div class="font-mono text-sm break-all">{pendingIncomingPayload.derivationPath}</div>
					</div>
				</div>
				<div class="modal-action">
					<button
						class="btn"
						onclick={() => {
							isIncomingContractOpen = false;
							pendingIncomingPayload = null;
						}}>Close</button
					>
					<button class="btn btn-error" onclick={rejectIncomingContract}>Reject</button>
					<button class="btn btn-primary" onclick={acceptIncomingContract}>Accept</button>
				</div>
			</div>
		</div>
	{/if}
</div>
