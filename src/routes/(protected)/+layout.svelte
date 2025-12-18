<script lang="ts">
	import { authState } from '$lib/stores/auth.store';
	import { onMount, onDestroy } from 'svelte';
	import { t } from 'svelte-i18n';
	import { user } from '$lib/stores/user.store';
	import { pushNotificationService } from '$lib/api/services/push-notification.service';
	import { listenForIncomingMessages } from '$lib/utils/nostr-message';
	import { getNostrKeyPair, getNpub } from '$lib/utils/nostrKeys';
	import { isUserToUserMessage } from '$lib/utils/helpers/messageParser';
	import { fetchProfileMetadata } from '$lib/utils/nostr-message';
	import { nip19 } from 'nostr-tools';

	const { children } = $props();

	let globalMessageUnsubscribe: (() => void) | null = null;

	onMount(async () => {
		await user.getUserData();
		await pushNotificationService.init();

		if ($authState.isAuthenticated) {
			const { nsec, npub } = await getNostrKeyPair();
			if (!nsec || !npub) return;

			const currentUserHex = npub.startsWith('npub') ? nip19.decode(npub).data as string : npub;

			globalMessageUnsubscribe = listenForIncomingMessages(npub, nsec, async (msg) => {
				const { plaintext, senderPubkey, event } = msg;

				// Only process INCOMING messages (not messages we sent)
				const senderHex = senderPubkey.startsWith('npub') ? nip19.decode(senderPubkey).data as string : senderPubkey;
				if (senderHex === currentUserHex) return;

				// Only user-to-user messages
				if (!isUserToUserMessage(plaintext)) return;

				// Get sender name
				let senderName = 'Someone';
				try {
					const profile = await fetchProfileMetadata(senderPubkey);
					if (profile?.name) {
						senderName = profile.name;
					}
				} catch {
					// Use default name
				}

				// Convert sender pubkey to npub for URL
				let senderNpub = senderPubkey;
				if (!senderPubkey.startsWith('npub')) {
					try {
						senderNpub = nip19.npubEncode(senderPubkey);
					} catch {
						senderNpub = senderPubkey;
					}
				}

				// Send notification
				const currentUserNpub = await getNpub();
				const title = $t('notifications.service_messages.new_message');
				const bodyTemplate = $t('notifications.service_messages.new_message_body');
				const body = bodyTemplate.replace('{senderName}', senderName);
				
				await pushNotificationService.sendNotificationToNpubs({
					npubs: [currentUserNpub],
					title,
					body,
					type: 'message',
					clickAction: `${import.meta.env.VITE_APP_URL}/dashboard/messages/to/${senderNpub}`,
					icon: 'https://bittasker.com/images/Logos/BitTasker-square-logo.svg'
				});
			});
		}
	});

	onDestroy(() => {
		if (globalMessageUnsubscribe) {
			globalMessageUnsubscribe();
			globalMessageUnsubscribe = null;
		}
	});
</script>

{#if $authState.isLoading}
	<div class="flex h-dvh w-full flex-col items-center justify-center">
		<span class="loading loading-spinner loading-xl"></span>
		<p>{$t('common.loading')}</p>
	</div>
{:else if $authState.isAuthenticated}
	{@render children()}
{:else}
	<!-- This shouldn't be seen since the +layout.ts should redirect -->
	<div class="flex h-full w-full flex-col items-center justify-center">
		<p>{$t('common.redirecting_to_login')}</p>
	</div>
{/if}
