<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { t } from 'svelte-i18n';
	import { getNostrKeyPair, signerReady } from '$lib/utils/nostrKeys';
	import { getBiometricData, prefetchPasskeyChallenge } from '$lib/utils/helpers/biometrics';
	import {
		PASSKEY_APPROVE_MESSAGE,
		SignerLockedError,
		isPasskeyPromptError,
		passkeyErrorText,
		passkeyPromptSuppressed
	} from '$lib/utils/helpers/passkey-prompt';
	import {
		assertDirectMessageAllowed,
		getMessageHistory,
		isContactBlockedError,
		sendDirectMessage,
		listenForIncomingMessages,
		parseDMEvent,
		type ParsedDirectMessage
	} from '$lib/nostr/direct-messages';
	import { toHexPubkey } from '$lib/nostr/messaging-policy';
	import { appStore } from '$lib/stores/app.store';
	import ChatMessage from './ChatMessage.svelte';
	import IconSend from '~icons/mdi/send';

	let {
		recipientPubkey,
		currentUserPubkey: _currentUserPubkey = '',
		initialProfile = null
	}: {
		recipientPubkey: string;
		currentUserPubkey?: string;
		initialProfile?: { name?: string; picture?: string } | null;
	} = $props();

	const recipientHex = $derived(toHexPubkey(recipientPubkey) || recipientPubkey);

	let messages = $state<ParsedDirectMessage[]>([]);
	let draft = $state('');
	let isSending = $state(false);
	let contactWarning = $state(false);
	let errorMessage = $state('');
	let scrollContainer = $state<HTMLElement | null>(null);
	let stopListener: (() => void) | null = null;

	const profile = $derived(initialProfile ?? {});

	function isOwnMessage(message: ParsedDirectMessage): boolean {
		// A message is ours when the sender is not the recipient we're chatting with.
		return message.senderPubkey.toLowerCase() !== recipientHex;
	}

	async function scrollToBottom(): Promise<void> {
		await tick();
		scrollContainer?.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
	}

	function pushMessage(message: ParsedDirectMessage): void {
		// Only surface messages on this conversation thread (from or to the recipient).
		const sender = message.senderPubkey.toLowerCase();
		const involvesRecipient =
			sender === recipientHex ||
			message.event.tags.some(
				(tag) => tag[0] === 'p' && toHexPubkey(tag[1] ?? '') === recipientHex
			);
		if (!involvesRecipient) return;
		if (messages.some((m) => m.event.id === message.event.id)) return;
		messages = [...messages, message].sort((a, b) => a.event.created_at - b.event.created_at);
		void scrollToBottom();
	}

	async function handleSend(): Promise<void> {
		const text = draft.trim();
		if (!text || isSending) return;
		errorMessage = '';
		const prompted = signerReady() || passkeyPromptSuppressed() ? null : getBiometricData(true, []);
		try {
			await assertDirectMessageAllowed(text, recipientHex);
			contactWarning = false;
		} catch (error) {
			if (isContactBlockedError(error)) {
				contactWarning = true;
				return;
			}
			errorMessage = error instanceof Error ? error.message : $t('messages.send_failed');
			appStore.showErrorToast(errorMessage);
			return;
		}

		isSending = true;
		try {
			if (prompted) await getNostrKeyPair({ prompt: true, prompted });
			else await getNostrKeyPair();
			const event = await sendDirectMessage(text, recipientHex);
			pushMessage({ plaintext: text, senderPubkey: event.pubkey, event });
			draft = '';
			contactWarning = false;
		} catch (error) {
			if (isContactBlockedError(error)) {
				contactWarning = true;
				return;
			}
			errorMessage = isPasskeyPromptError(error)
				? passkeyErrorText(error)
				: error instanceof Error
					? error.message
					: $t('messages.send_failed');
			if (isPasskeyPromptError(error)) prefetchPasskeyChallenge();
			appStore.showErrorToast(errorMessage);
		} finally {
			isSending = false;
		}
	}

	onMount(async () => {
		try {
			// Resolve our own keypair to decrypt incoming DMs for this thread.
			const { nsec, npub } = await getNostrKeyPair();
			const ourHex = toHexPubkey(npub) || npub;
			stopListener = listenForIncomingMessages(ourHex, nsec, pushMessage, (message) => {
				errorMessage = message;
			});
			const history = await getMessageHistory(recipientHex);
			for (const event of history) {
				try {
					pushMessage(await parseDMEvent(event, nsec));
				} catch {
					// Leave a message this key cannot open out of the thread.
				}
			}
		} catch (error) {
			if (error instanceof SignerLockedError) {
				if (!signerReady()) {
					errorMessage = PASSKEY_APPROVE_MESSAGE;
					prefetchPasskeyChallenge();
				} else {
					errorMessage = $t('messages.failed_load_messages');
				}
			} else {
				errorMessage = error instanceof Error ? error.message : $t('messages.send_failed');
			}
		}
	});

	onDestroy(() => {
		stopListener?.();
		stopListener = null;
	});
</script>

<div class="flex h-full min-h-0 flex-col" data-testid="chat-view">
	<!-- Message list -->
	<div
		bind:this={scrollContainer}
		class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
		data-testid="chat-messages"
	>
		{#if messages.length === 0}
			<div class="text-base-content/50 flex h-full items-center justify-center text-sm">
				{$t('messages.no_messages', { default: 'No messages yet. Say hello!' })}
			</div>
		{:else}
			{#each messages as message (message.event.id)}
				<ChatMessage {message} isSender={isOwnMessage(message)} {profile} />
			{/each}
		{/if}
	</div>

	{#if contactWarning}
		<div
			class="alert alert-warning mx-4 mb-2 text-sm"
			role="status"
			data-testid="contact-filter-warning"
		>
			{$t('messages.contact_filter_warning')}
		</div>
	{/if}

	{#if errorMessage}
		<div class="alert alert-error mx-4 mb-2 text-sm" role="alert" data-testid="chat-error">
			{errorMessage}
		</div>
	{/if}

	<!-- Composer -->
	<form
		class="border-base-300 flex items-center gap-2 border-t p-3"
		onsubmit={(e) => {
			e.preventDefault();
			void handleSend();
		}}
		data-testid="chat-composer"
	>
		<input
			class="input input-bordered flex-1"
			placeholder={$t('messages.type_message', { default: 'Type a message…' })}
			bind:value={draft}
			disabled={isSending}
			oninput={() => (contactWarning = false)}
			data-testid="chat-input"
		/>
		<button
			type="submit"
			class="btn btn-primary btn-square"
			disabled={isSending || !draft.trim()}
			aria-label={$t('messages.send', { default: 'Send' })}
			data-testid="chat-send"
		>
			{#if isSending}
				<span class="loading loading-spinner loading-sm"></span>
			{:else}
				<IconSend class="h-5 w-5" />
			{/if}
		</button>
	</form>
</div>
