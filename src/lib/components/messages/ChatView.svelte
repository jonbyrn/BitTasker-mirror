<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { locale, t } from 'svelte-i18n';
	import { page } from '$app/state';
	import { getNostrKeyPair, prepareSigner, signerReady } from '$lib/utils/nostrKeys';
	import { getBiometricData, prefetchPasskeyChallenge } from '$lib/utils/helpers/biometrics';
	import { getMnemonic } from '$lib/utils/helpers/mnemonic';
	import { walletUnlockRoute } from '$lib/utils/helpers/login-method';
	import { isNsecUnlockRequired } from '$lib/utils/helpers/nsec-unlock';
	import KeyUnlock from '$lib/components/wallet/KeyUnlock.svelte';
	import {
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
	import type { NostrEvent } from '@nostr-dev-kit/ndk';
	import { toHexPubkey } from '$lib/nostr/messaging-policy';
	import { appStore } from '$lib/stores/app.store';
	import { isQvacEnabled } from '$lib/services/feature-flags';
	import { maybeReply } from '$lib/qvac/assistant-client';
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
	let sealed = $state<NostrEvent[]>([]);
	let locked = $state(false);
	let draft = $state('');
	let isSending = $state(false);
	let contactWarning = $state(false);
	let errorMessage = $state('');
	let notice = $state('');
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

	async function reveal(keys?: { nsec: Uint8Array; npub: string }): Promise<void> {
		const { nsec, npub } = keys ?? (await getNostrKeyPair());
		locked = false;
		stopListener?.();
		const ourHex = toHexPubkey(npub) || npub;
		stopListener = listenForIncomingMessages(ourHex, nsec, pushMessage, (message) => {
			errorMessage = message;
		});
		for (const event of sealed) {
			try {
				pushMessage(await parseDMEvent(event, nsec));
			} catch {
				// Leave a message this key cannot open out of the thread.
			}
		}
	}

	const keyLogin = walletUnlockRoute() === 'nsec';

	function unlockThread(nsec = ''): void {
		errorMessage = '';
		if (keyLogin) {
			void getMnemonic({ nsec })
				.then(() => prepareSigner())
				.then((keys) => reveal(keys))
				.catch((error: unknown) => {
					errorMessage = isNsecUnlockRequired(error)
						? $t('wallet.nsec_unlock_hint')
						: error instanceof Error
							? error.message
							: $t('messages.failed_load_messages');
				});
			return;
		}
		const unlock = prepareSigner();
		void unlock
			.then((keys) => reveal(keys))
			.catch((error: unknown) => {
				errorMessage = isPasskeyPromptError(error)
					? passkeyErrorText(error)
					: error instanceof Error
						? error.message
						: $t('messages.failed_load_messages');
				if (isPasskeyPromptError(error)) prefetchPasskeyChallenge();
			});
	}

	async function handleSend(): Promise<void> {
		const text = draft.trim();
		if (!text || isSending) return;
		errorMessage = '';
		notice = '';
		const prompted =
			keyLogin || signerReady() || passkeyPromptSuppressed() ? null : getBiometricData(true, []);
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
		let sent: NostrEvent | null = null;
		try {
			if (prompted) await getNostrKeyPair({ prompt: true, prompted });
			else await getNostrKeyPair();
			const event = await sendDirectMessage(text, recipientHex);
			pushMessage({ plaintext: text, senderPubkey: event.pubkey, event });
			draft = '';
			contactWarning = false;
			sent = event;
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
		if (!sent || !isQvacEnabled()) return;
		const language = String($locale || 'en').startsWith('es') ? 'es' : 'en';
		const route = page.url.pathname;
		const fallback = $t('common.qvac.assistant_fallback');
		void maybeReply(recipientHex, sent, route, language).then((result) => {
			if (result === 'unavailable') notice = fallback;
		});
	}

	onMount(async () => {
		try {
			sealed = await getMessageHistory(recipientHex);
			if (signerReady() || passkeyPromptSuppressed()) {
				await reveal();
			} else {
				locked = true;
				if (!keyLogin) prefetchPasskeyChallenge();
			}
		} catch (error) {
			if (error instanceof SignerLockedError) {
				locked = true;
				prefetchPasskeyChallenge();
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
		{#if locked && sealed.length > 0}
			<div
				class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm"
				data-testid="chat-locked"
			>
				<p>{keyLogin ? $t('wallet.nsec_unlock_hint') : $t('messages.locked_preview')}</p>
				{#if keyLogin}
					<KeyUnlock
						compact
						testId="chat-unlock-key"
						passkeyLabel={$t('messages.unlock_to_read')}
						onunlock={(nsec) => unlockThread(nsec)}
					/>
				{:else}
					<button class="btn btn-outline btn-sm" onclick={() => unlockThread()}>
						{$t('messages.unlock_to_read')}
					</button>
				{/if}
			</div>
		{:else if messages.length === 0}
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

	{#if notice}
		<div
			class="alert alert-info mx-4 mb-2 text-sm"
			role="status"
			data-testid="chat-assistant-fallback"
		>
			{notice}
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
			placeholder={$t('messages.type_message_placeholder')}
			bind:value={draft}
			disabled={isSending}
			oninput={() => (contactWarning = false)}
			data-testid="chat-input"
		/>
		<button
			type="submit"
			class="btn btn-primary shrink-0"
			disabled={isSending || !draft.trim()}
			aria-label={$t('messages.send_message')}
			data-testid="chat-send"
		>
			{#if isSending}
				<span class="loading loading-spinner loading-sm"></span>
			{:else}
				<IconSend class="h-5 w-5" />
			{/if}
			<span>{$t('messages.send_message')}</span>
		</button>
	</form>
</div>
