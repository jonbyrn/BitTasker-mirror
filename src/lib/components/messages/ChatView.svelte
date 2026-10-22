<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { locale, t } from 'svelte-i18n';
	import { page } from '$app/state';
	import { nip19 } from 'nostr-tools';
	import { getNostrKeyPair } from '$lib/utils/nostrKeys';
	import {
		sendDirectMessage,
		listenForIncomingMessages,
		type ParsedDirectMessage
	} from '$lib/nostr/direct-messages';
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

	// Normalize the recipient to hex for comparisons; the caller passes hex after the route converts npub.
	const recipientHex = $derived(
		recipientPubkey.startsWith('npub1')
			? (() => {
					try {
						return nip19.decode(recipientPubkey).data as string;
					} catch {
						return recipientPubkey;
					}
				})()
			: recipientPubkey
	);

	let messages = $state<ParsedDirectMessage[]>([]);
	let draft = $state('');
	let isSending = $state(false);
	let errorMessage = $state('');
	let notice = $state('');
	let scrollContainer = $state<HTMLElement | null>(null);
	let stopListener: (() => void) | null = null;

	const profile = $derived(initialProfile ?? {});

	function isOwnMessage(message: ParsedDirectMessage): boolean {
		// A message is ours when the sender is not the recipient we're chatting with.
		return message.senderPubkey !== recipientHex;
	}

	async function scrollToBottom(): Promise<void> {
		await tick();
		scrollContainer?.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
	}

	function pushMessage(message: ParsedDirectMessage): void {
		// Only surface messages on this conversation thread (from or to the recipient).
		const involvesRecipient =
			message.senderPubkey === recipientHex ||
			message.event.tags.some((tag) => tag[0] === 'p' && tag[1] === recipientHex);
		if (!involvesRecipient) return;
		if (messages.some((m) => m.event.id === message.event.id)) return;
		messages = [...messages, message].sort((a, b) => a.event.created_at - b.event.created_at);
		void scrollToBottom();
	}

	async function handleSend(): Promise<void> {
		const text = draft.trim();
		if (!text || isSending) return;
		isSending = true;
		errorMessage = '';
		notice = '';
		let sent: Awaited<ReturnType<typeof sendDirectMessage>> | null = null;
		try {
			const event = await sendDirectMessage(text, recipientHex);
			pushMessage({ plaintext: text, senderPubkey: event.pubkey, event });
			draft = '';
			sent = event;
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : $t('messages.send_failed');
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
			// Resolve our own keypair to decrypt incoming DMs for this thread.
			const { nsec, npub } = await getNostrKeyPair();
			const decoded = nip19.decode(npub);
			const ourHex = typeof decoded.data === 'string' ? decoded.data : npub;
			stopListener = listenForIncomingMessages(ourHex, nsec, pushMessage);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : $t('messages.send_failed');
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
			placeholder={$t('messages.type_message', { default: 'Type a message…' })}
			bind:value={draft}
			disabled={isSending}
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
