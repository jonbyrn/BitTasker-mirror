<script lang="ts">
	import type { Event as NostrEvent } from 'nostr-tools';
	import type { Location } from '$lib/types/task';
	import { formatTimeAgo } from '$lib/utils/helpers/date';
	import { TranslationStore, messageTranslations } from '$lib/stores/translation.store';
	import {
		parseMessageContent,
		extractLocationData,
		extractLocationDataFromTags,
		extractLocationMessageText
	} from '$lib/utils/helpers/messageParser';
	import { parseLinks } from '$lib/utils/helpers/linkParser';
	import MessageReactions from './MessageReactions.svelte';
	import LocationDetailsCard from '$lib/components/location/LocationDetailsCard.svelte';
	import ActionsMenu from '$lib/components/moderation/ActionsMenu.svelte';
	import { t } from 'svelte-i18n';

	// Props
	let {
		message,
		isSender,
		profile,
		onReply,
		reactions = [],
		currentUserId,
		onReactionAdd,
		onReactionRemove,
		onScrollToMessage
	}: {
		message: { plaintext: string; senderPubkey: string; event: NostrEvent };
		isSender: boolean;
		profile: { name?: string };
		onReply?: (message: { plaintext: string; senderPubkey: string; event: NostrEvent }) => void;
		reactions?: { emoji: string; count: number; users: string[] }[];
		currentUserId?: string;
		onReactionAdd?: (messageId: string, emoji: string) => void;
		onReactionRemove?: (messageId: string, emoji: string) => void;
		onScrollToMessage?: (quotedText: string, quotedMessageId?: string | null) => void;
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

	// Get translated text or original - reactive to messageTranslations store
	const displayText = $derived.by(() => {
		if (showOriginal) {
			return locationMessageText;
		}
		// Access the store reactively
		const translations = $messageTranslations;
		const translation = translations.get(messageId);
		return translation ? translation.translatedText : locationMessageText;
	});

	// Check if message is a reply (visual detection only)
	const isReply = $derived(parsedPlaintext.startsWith('> ') && parsedPlaintext.includes('\n\n'));

	// Extract reply parts for display only
	const replyParts = $derived.by(() => {
		if (!isReply) return null;
		const parts = parsedPlaintext.split('\n\n');
		if (parts.length < 2) return null;

		// Extract quoted text and message ID if present
		// Format: > [messageId] quoted text
		const quotedLine = parts[0].replace(/^> /, '').trim();
		const messageIdMatch = quotedLine.match(/^\[([^\]]+)\]\s*(.+)$/);

		let quotedMessageId: string | null = null;
		let quotedText: string;

		if (messageIdMatch) {
			// New format with message ID
			quotedMessageId = messageIdMatch[1];
			quotedText = messageIdMatch[2].trim();
		} else {
			// Legacy format without message ID (backward compatibility)
			quotedText = quotedLine;
		}

		const actualMessage = parts.slice(1).join('\n\n').trim();
		return { quotedText, actualMessage, quotedMessageId };
	});

	// Get translated quoted text if available
	const quotedDisplayText = $derived.by(() => {
		if (!replyParts) return '';

		// If we have a message ID, try to find translation by ID first (most reliable)
		if (replyParts.quotedMessageId) {
			const translations = $messageTranslations;
			const translation = translations.get(replyParts.quotedMessageId);
			if (translation) {
				return translation.translatedText;
			}
		}

		// Fallback to text matching if no ID or translation not found by ID
		const translations = $messageTranslations;
		const quotedTextLower = replyParts.quotedText.toLowerCase().trim();

		// Try to find the original message and its translation
		for (const [, translation] of translations.entries()) {
			const originalText = translation.originalText.toLowerCase().trim();
			if (originalText.includes(quotedTextLower) || quotedTextLower.includes(originalText)) {
				// Found matching translation, use translated text
				return translation.translatedText;
			}
		}

		// No translation found, use original quoted text
		return replyParts.quotedText;
	});

	// Truncate quoted text (max 100 chars)
	const truncatedQuotedText = $derived(
		quotedDisplayText.length > 100 ? quotedDisplayText.substring(0, 100) + '...' : quotedDisplayText
	);

	// Get display text for reply (actual message) or regular message
	const replyDisplayText = $derived.by(() => {
		if (showOriginal) {
			return replyParts ? replyParts.actualMessage : locationMessageText;
		}
		const translations = $messageTranslations;
		const translation = translations.get(messageId);
		if (replyParts) {
			return translation ? translation.translatedText : replyParts.actualMessage;
		}
		return translation ? translation.translatedText : locationMessageText;
	});

	// Parse links in the display text
	const textSegments = $derived(parseLinks(replyDisplayText));

	// Check if message is translated - reactive to messageTranslations store
	const isTranslated = $derived.by(() => {
		const translations = $messageTranslations;
		return translations.has(messageId);
	});

	function toggleTranslation() {
		showOriginal = !showOriginal;
	}

	async function retryTranslation() {
		translationError = null;
		try {
			isTranslating = true;
			await TranslationStore.translateMessage(messageId, parsedPlaintext, true);
		} catch {
			translationError = 'Translation failed';
		} finally {
			isTranslating = false;
		}
	}
</script>

<div class="group mb-4 flex gap-3" class:flex-row-reverse={isSender} data-message-id={messageId}>
	<!-- Message bubble -->
	<div
		class="flex max-w-[75%] flex-col md:max-w-[65%]"
		class:items-end={isSender}
		class:items-start={!isSender}
	>
		<!-- Message content -->
		<div
			class="text-base-content overflow-hidden rounded-2xl px-4 py-3 wrap-anywhere shadow-sm transition-all duration-200"
			class:bg-base-200={!isSender}
			class:bg-base-300={isSender}
			class:hover:shadow-md={isSender}
			class:hover:shadow={!isSender}
		>
			{#if isReply && replyParts}
				<!-- Reply message design -->
				<div class="space-y-2">
					<!-- Quoted message with vertical line -->
					<div
						class="flex cursor-pointer gap-2 transition-opacity hover:opacity-80"
						onclick={() => onScrollToMessage?.(replyParts.quotedText, replyParts.quotedMessageId)}
						role="button"
						tabindex="0"
						onkeydown={(e) =>
							e.key === 'Enter' &&
							onScrollToMessage?.(replyParts.quotedText, replyParts.quotedMessageId)}
					>
						<div class="bg-info w-1 shrink-0 rounded-full"></div>
						<div class="min-w-0 flex-1">
							<div class="text-base-content/70 line-clamp-2 text-sm break-words">
								{truncatedQuotedText}
							</div>
						</div>
					</div>
					<!-- Actual message content -->
					<div class="border-base-content/10 border-t pt-2">
						{#if locationData && (locationData.location || locationData.locations)}
							<div class="space-y-3">
								<p
									class="mb-3 text-sm leading-relaxed break-words whitespace-pre-wrap md:text-base"
								>
									{replyDisplayText}
								</p>
								{#if locationData.locations && locationData.locations.length > 0}
									{#each locationData.locations as { location, label }, locIdx (locIdx)}
										{#if location && location.latitude !== null && location.longitude !== null}
											<LocationDetailsCard
												location={location as Location}
												{label}
												showDirections={true}
												showAddress={true}
											/>
										{/if}
									{/each}
								{:else if locationData.location && locationData.location.latitude !== null && locationData.location.longitude !== null}
									<LocationDetailsCard
										location={locationData.location as Location}
										label={locationData.label}
										showDirections={true}
										showAddress={true}
									/>
								{/if}
							</div>
						{:else}
							<p class="text-sm leading-relaxed break-words whitespace-pre-wrap md:text-base">
								{#each textSegments as segment, segIdx (segIdx)}
									{#if segment.type === 'link' && segment.url}
										<a
											href={segment.url}
											target="_blank"
											rel="noopener noreferrer"
											class="text-info hover:text-info/80 break-words underline"
										>
											{segment.content}
										</a>
									{:else}
										{segment.content}
									{/if}
								{/each}
							</p>
						{/if}
					</div>
				</div>
			{:else if locationData && (locationData.location || locationData.locations)}
				<div class="space-y-3">
					<p class="mb-3 text-sm leading-relaxed break-words whitespace-pre-wrap md:text-base">
						{displayText}
					</p>
					{#if locationData.locations && locationData.locations.length > 0}
						{#each locationData.locations as { location, label }, locIdx (locIdx)}
							{#if location && location.latitude !== null && location.longitude !== null}
								<LocationDetailsCard
									location={location as Location}
									{label}
									showDirections={true}
									showAddress={true}
								/>
							{/if}
						{/each}
					{:else if locationData.location && locationData.location.latitude !== null && locationData.location.longitude !== null}
						<LocationDetailsCard
							location={locationData.location as Location}
							label={locationData.label}
							showDirections={true}
							showAddress={true}
						/>
					{/if}
				</div>
			{:else}
				<p class="text-sm leading-relaxed break-words whitespace-pre-wrap md:text-base">
					{#each textSegments as segment, segIdx (segIdx)}
						{#if segment.type === 'link' && segment.url}
							<a
								href={segment.url}
								target="_blank"
								rel="noopener noreferrer"
								class="text-info hover:text-info/80 break-words underline"
							>
								{segment.content}
							</a>
						{:else}
							{segment.content}
						{/if}
					{/each}
				</p>
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
										d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
									/>
								</svg>
							</button>
						</div>
					{:else if isTranslated}
						<div class="flex items-center gap-2">
							<span class="text-info">Original</span>
							<button
								class="btn btn-ghost btn-xs hover:bg-base-300"
								onclick={toggleTranslation}
								title={showOriginal ? 'Show translated' : 'Show original'}
								aria-label={showOriginal ? 'Show translated' : 'Show original'}
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
										d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
									/>
								</svg>
							</button>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Timestamp, sender info, and reply button -->
		<div
			class="text-base-content/50 mt-2 flex items-center justify-between gap-2 text-xs font-medium"
			class:flex-row-reverse={isSender}
		>
			<div class="flex items-center gap-2" class:flex-row-reverse={isSender}>
				{#if !isSender && profile.name}
					<span class="font-semibold">{profile.name}</span>
				{/if}
				<span>{formattedTime}</span>
				{#if isSender}
					<span data-testid="dm-delivery">{$t('messages.delivered')}</span>
				{/if}
			</div>

			<!-- Reply button -->
			{#if onReply}
				<button
					class="btn btn-ghost btn-xs hover:bg-base-300 opacity-0 transition-all duration-200 group-hover:opacity-100"
					onclick={() => onReply(message)}
					title="Reply to message"
					aria-label="Reply to message"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-3.5 w-3.5"
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

			<!-- Moderation menu — only for messages from others -->
			{#if !isSender}
				<span class="opacity-0 transition-all duration-200 group-hover:opacity-100">
					<ActionsMenu
						contentType="message"
						reportedPubkey={message.senderPubkey}
						reportedEventId={message.event.id}
						username={profile?.name}
					/>
				</span>
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
