<script lang="ts">
	import type { Event as NostrEvent } from 'nostr-tools';
	import Avatar from '$lib/components/Avatar.svelte';
	import { formatTimeAgo } from '$lib/utils/helpers/date';
	import { t } from 'svelte-i18n';
	import MessageReactions from './MessageReactions.svelte';
	import { TranslationStore } from '$lib/stores/translation.store';
	import { onMount } from 'svelte';
	import { parseMessageContent, extractLocationData, extractLocationDataFromTags, extractLocationMessageText } from '$lib/utils/helpers/messageParser';
	import LocationDetailsCard from '$lib/components/location/LocationDetailsCard.svelte';
	import type { Location } from '$lib/types/task';

	// Props
	let {
		message,
		isSender,
		profile,
		currentUserProfile,
		recipientProfile,
		onReply,
		reactions = [],
		currentUserId,
		onReactionAdd,
		onReactionRemove
	}: {
		message: { plaintext: string; senderPubkey: string; event: NostrEvent };
		isSender: boolean;
		profile: { name?: string; picture?: string };
		currentUserProfile: { name?: string; picture?: string };
		recipientProfile: { name?: string; picture?: string };
		onReply?: (message: { plaintext: string; senderPubkey: string; event: NostrEvent }) => void;
		reactions?: { emoji: string; count: number; users: string[] }[];
		currentUserId?: string;
		onReactionAdd?: (messageId: string, emoji: string) => void;
		onReactionRemove?: (messageId: string, emoji: string) => void;
	} = $props();

	// Derived timestamp
	const formattedTime = $derived(formatTimeAgo(new Date(message.event.created_at * 1000)));

	// Translation state
	let showOriginal = $state(false);
	let isTranslating = $state(false);
	let translationError = $state<string | null>(null);

	// Get message ID for translation lookup
	const messageId = $derived(message.event.id);

	// Parse message content to extract readable text (for JSON messages like bid-status)
	const parsedPlaintext = $derived(parseMessageContent(message.plaintext));
	
	// Extract location data from event tags (preferred) or from message text (legacy)
	const locationData = $derived(
		extractLocationDataFromTags(message.event) || extractLocationData(message.plaintext)
	);
	const locationMessageText = $derived(
		locationData ? extractLocationMessageText(message.plaintext) : parsedPlaintext
	);
	
	// Get translated text or original
	const displayText = $derived(
		showOriginal 
			? locationMessageText 
			: TranslationStore.getDisplayText(messageId, locationMessageText)
	);

	// Check if message is translated
	const isTranslated = $derived(TranslationStore.isMessageTranslated(messageId));

	// Auto-translate message on mount if it's not from sender
	onMount(async () => {
		if (!isSender && parsedPlaintext.trim()) {
			try {
				isTranslating = true;
				await TranslationStore.translateMessage(messageId, parsedPlaintext);
			} catch (error) {
				console.error('Failed to translate message:', error);
				translationError = 'Translation failed';
			} finally {
				isTranslating = false;
			}
		}
	});

	// Toggle between original and translated text
	function toggleTranslation() {
		showOriginal = !showOriginal;
	}

	// Retry translation
	async function retryTranslation() {
		translationError = null;
		try {
			isTranslating = true;
			await TranslationStore.translateMessage(messageId, parsedPlaintext, true);
		} catch (error) {
			console.error('Failed to retry translation:', error);
			translationError = 'Translation failed';
		} finally {
			isTranslating = false;
		}
	}
</script>

<div class="group mb-3 flex gap-2" class:flex-row-reverse={isSender}>
	<!-- Message bubble -->
	<div class="flex max-w-[80%] flex-col" class:items-end={isSender} class:items-start={!isSender}>
		<!-- Message content -->
		<div
			class="overflow-hidden rounded-lg px-3 py-2 break-words"
			class:bg-primary={isSender}
			class:text-primary-content={isSender}
			class:bg-base-200={!isSender}
			class:text-base-content={!isSender}
		>
			{#if locationData && (locationData.location || locationData.locations)}
				<!-- Location message with card(s) -->
				<div class="space-y-3">
					<p class="text-sm leading-relaxed break-all whitespace-pre-wrap mb-3">{displayText}</p>
					{#if locationData.locations && locationData.locations.length > 0}
						<!-- Multiple locations -->
						{#each locationData.locations as { location, label }}
							{#if location && (location.latitude !== null && location.longitude !== null)}
								<LocationDetailsCard
									location={location as Location}
									{label}
									showDirections={true}
									showAddress={true}
								/>
							{/if}
						{/each}
					{:else if locationData.location && locationData.location.latitude !== null && locationData.location.longitude !== null}
						<!-- Single location -->
						<LocationDetailsCard
							location={locationData.location as Location}
							label={locationData.label}
							showDirections={true}
							showAddress={true}
						/>
					{/if}
				</div>
			{:else}
				<!-- Regular text message -->
				<p class="text-sm leading-relaxed break-all whitespace-pre-wrap">{displayText}</p>
			{/if}
			
			<!-- Translation indicators and controls -->
			{#if !isSender && parsedPlaintext.trim()}
				<div class="mt-2 flex items-center gap-2 text-xs opacity-70">
					{#if isTranslating}
						<div class="flex items-center gap-1">
							<div class="loading loading-spinner loading-xs"></div>
							<span>Translating...</span>
						</div>
					{:else if translationError}
						<div class="flex items-center gap-2">
							<span class="text-error">Translation failed</span>
							<button
								class="btn btn-ghost btn-xs hover:bg-base-300"
								onclick={retryTranslation}
								title="Retry translation"
								aria-label="Retry translation"
							>
								<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
								</svg>
							</button>
						</div>
					{:else if isTranslated}
						<div class="flex items-center gap-2">
							<span class="text-info">Original</span>
							<button
								class="btn btn-ghost btn-xs hover:bg-base-300"
								onclick={toggleTranslation}
								title={showOriginal ? "Show translated" : "Show original"}
								aria-label={showOriginal ? "Show translated" : "Show original"}
							>
								<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
								</svg>
							</button>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Timestamp, sender info, and reply button -->
		<div
			class="text-base-content/60 mt-1 flex items-center justify-between text-xs"
			class:flex-row-reverse={isSender}
		>
			<div class="flex items-center gap-2" class:flex-row-reverse={isSender}>
				{#if !isSender && profile.name}
					<span class="font-medium">{profile.name}</span>
				{/if}
				<span>{formattedTime}</span>
			</div>

			<!-- Reply button -->
			{#if onReply}
				<button
					class="btn btn-ghost btn-xs hover:bg-base-300 opacity-0 transition-opacity group-hover:opacity-100"
					onclick={() => onReply(message)}
					title="Reply to message"
					aria-label="Reply to message"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-3 w-3"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
						/>
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
