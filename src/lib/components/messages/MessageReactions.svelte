<script lang="ts">
	import { onMount } from 'svelte';
	import EmojiPicker from '$lib/components/EmojiPicker.svelte';

	// Props
	let { 
		messageId,
		reactions = [],
		currentUserId,
		onReactionAdd,
		onReactionRemove
	}: {
		messageId: string;
		reactions?: { emoji: string; count: number; users: string[] }[];
		currentUserId: string;
		onReactionAdd?: (messageId: string, emoji: string) => void;
		onReactionRemove?: (messageId: string, emoji: string) => void;
	} = $props();

	// State
	let showEmojiPicker = $state(false);
	let emojiButtonRef = $state<HTMLElement | null>(null);

	// Common quick reactions
	const quickReactions = ['👍', '❤️', '😂', '😮', '😢', '😡'];

	// Handle emoji selection
	function handleEmojiSelect(emoji: string) {
		onReactionAdd?.(messageId, emoji);
		showEmojiPicker = false;
	}

	// Handle quick reaction
	function handleQuickReaction(emoji: string) {
		const existingReaction = reactions.find(r => r.emoji === emoji);
		if (existingReaction) {
			// Toggle reaction
			if (existingReaction.users.includes(currentUserId)) {
				onReactionRemove?.(messageId, emoji);
			} else {
				onReactionAdd?.(messageId, emoji);
			}
		} else {
			onReactionAdd?.(messageId, emoji);
		}
	}

	// Check if user has reacted with specific emoji
	function hasUserReacted(emoji: string): boolean {
		const reaction = reactions.find(r => r.emoji === emoji);
		return reaction ? reaction.users.includes(currentUserId) : false;
	}
</script>

{#if reactions.length > 0 || showEmojiPicker}
	<div class="mt-2 flex flex-wrap items-center gap-1">
		<!-- Existing Reactions -->
		{#each reactions as reaction}
			<button
				class="btn btn-xs h-6 px-2 text-xs transition-all duration-200 hover:scale-105"
				class:bg-primary={hasUserReacted(reaction.emoji)}
				class:text-primary-content={hasUserReacted(reaction.emoji)}
				class:bg-base-200={!hasUserReacted(reaction.emoji)}
				class:text-base-content={!hasUserReacted(reaction.emoji)}
				onclick={() => handleQuickReaction(reaction.emoji)}
				title={`${reaction.emoji} ${reaction.count} reaction${reaction.count !== 1 ? 's' : ''}`}
			>
				<span class="mr-1">{reaction.emoji}</span>
				<span>{reaction.count}</span>
			</button>
		{/each}

		<!-- Quick Reaction Buttons -->
		{#if !showEmojiPicker}
			<div class="flex items-center gap-1">
				{#each quickReactions as emoji}
					<button
						class="btn btn-ghost btn-xs h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-base-200"
						onclick={() => handleQuickReaction(emoji)}
						title={`React with ${emoji}`}
					>
						{emoji}
					</button>
				{/each}
				
				<!-- More emojis button -->
				<button
					bind:this={emojiButtonRef}
					class="btn btn-ghost btn-xs h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-base-200"
					onclick={() => showEmojiPicker = true}
					title="More emojis"
					aria-label="More emojis"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
					</svg>
				</button>
			</div>
		{/if}
	</div>
{/if}

<!-- Emoji Picker -->
<EmojiPicker
	bind:isOpen={showEmojiPicker}
	onEmojiSelect={handleEmojiSelect}
	position="top"
	triggerElement={emojiButtonRef}
/>
