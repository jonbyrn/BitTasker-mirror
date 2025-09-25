<script lang="ts">
	import type { Event as NostrEvent } from 'nostr-tools';
	import Avatar from '$lib/components/Avatar.svelte';
	import { formatTimeAgo } from '$lib/utils/helpers/date';
	import { t } from 'svelte-i18n';
	import MessageReactions from './MessageReactions.svelte';

	// Props
	let {
		message,
		isSender,
		profile,
		onReply,
		reactions = [],
		currentUserId,
		onReactionAdd,
		onReactionRemove
	}: {
		message: { plaintext: string; senderPubkey: string; event: NostrEvent };
		isSender: boolean;
		profile: { name?: string; picture?: string };
		onReply?: (message: { plaintext: string; senderPubkey: string; event: NostrEvent }) => void;
		reactions?: { emoji: string; count: number; users: string[] }[];
		currentUserId?: string;
		onReactionAdd?: (messageId: string, emoji: string) => void;
		onReactionRemove?: (messageId: string, emoji: string) => void;
	} = $props();

	// Derived timestamp
	const formattedTime = $derived(formatTimeAgo(new Date(message.event.created_at * 1000)));
</script>

<div class="group flex gap-2 mb-3" class:flex-row-reverse={isSender}>
	<!-- Avatar -->
	<div class="flex-shrink-0">
		<Avatar
			name={profile.name || (isSender ? $t('dashboard.bids.components.messages.chat_message.you') : $t('dashboard.bids.components.messages.chat_message.unknown'))}
			picture={profile.picture || undefined}
			size="xs"
		/>
	</div>

	<!-- Message bubble -->
	<div
		class="flex max-w-[80%] flex-col"
		class:items-end={isSender}
		class:items-start={!isSender}
	>
		<!-- Message content -->
		<div
			class="rounded-lg px-3 py-2 break-words"
			class:bg-primary={isSender}
			class:text-primary-content={isSender}
			class:bg-base-200={!isSender}
			class:text-base-content={!isSender}
		>
			<p class="text-sm leading-relaxed whitespace-pre-wrap">{message.plaintext}</p>
		</div>


		<!-- Timestamp, sender info, and reply button -->
		<div class="mt-1 flex items-center justify-between text-xs text-base-content/60" class:flex-row-reverse={isSender}>
			<div class="flex items-center gap-2" class:flex-row-reverse={isSender}>
				{#if !isSender && profile.name}
					<span class="font-medium">{profile.name}</span>
				{/if}
				<span>{formattedTime}</span>
			</div>
			
			<!-- Reply button -->
			{#if onReply}
				<button
					class="btn btn-ghost btn-xs hover:bg-base-300 opacity-0 group-hover:opacity-100 transition-opacity"
					onclick={() => onReply(message)}
					title="Reply to message"
					aria-label="Reply to message"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
					</svg>
				</button>
			{/if}
		</div>

		<!-- Message Reactions -->
		{#if currentUserId && (onReactionAdd || onReactionRemove)}
			<MessageReactions
				messageId={message.event.id}
				{reactions}
				{currentUserId}
				{onReactionAdd}
				{onReactionRemove}
			/>
		{/if}
	</div>
</div>
