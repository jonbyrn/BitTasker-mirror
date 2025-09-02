<script lang="ts">
	import type { Event as NostrEvent } from 'nostr-tools';
	import Avatar from '$lib/components/Avatar.svelte';
	import { formatTimeAgo } from '$lib/utils/helpers/date';
	import { t } from 'svelte-i18n';

	// Props
	let {
		message,
		isSender,
		profile
	}: {
		message: { plaintext: string; senderPubkey: string; event: NostrEvent };
		isSender: boolean;
		profile: { name?: string; picture?: string };
	} = $props();

	// Derived timestamp
	const formattedTime = $derived(formatTimeAgo(new Date(message.event.created_at * 1000)));
</script>

<div class="mb-4 flex gap-3" class:flex-row-reverse={isSender}>
	<!-- Avatar -->
	<div class="flex-shrink-0">
		<Avatar
			user={{
				name: profile.name || (isSender ? $t('messages.you') : $t('messages.unknown')),
				picture: profile.picture || null
			}}
			size="sm"
		/>
	</div>

	<!-- Message bubble -->
	<div
		class="flex max-w-xs flex-col lg:max-w-md"
		class:items-end={isSender}
		class:items-start={!isSender}
	>
		<!-- Message content -->
		<div
			class="rounded-2xl px-4 py-2 break-words"
			class:bg-primary={isSender}
			class:text-primary-content={isSender}
			class:bg-base-200={!isSender}
			class:text-base-content={!isSender}
		>
			<p class="text-sm whitespace-pre-wrap">{message.plaintext}</p>
		</div>

		<!-- Timestamp and sender info -->
		<div class="mt-1 flex items-center gap-2 text-xs opacity-70" class:flex-row-reverse={isSender}>
			{#if !isSender && profile.name}
				<span class="font-medium">{profile.name}</span>
			{/if}
			<span>{formattedTime}</span>
		</div>
	</div>
</div>
