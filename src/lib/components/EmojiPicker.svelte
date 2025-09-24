<script lang="ts">
	import { onMount } from 'svelte';

	// Props
	let { 
		isOpen = $bindable(false), 
		onEmojiSelect,
		position = 'bottom',
		triggerElement
	}: {
		isOpen?: boolean;
		onEmojiSelect?: (emoji: string) => void;
		position?: 'top' | 'bottom';
		triggerElement?: HTMLElement | null;
	} = $props();

	// State
	let pickerRef = $state<HTMLElement | null>(null);

	// Common emojis for quick access
	const commonEmojis = [
		'😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
		'🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
		'😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩',
		'🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣',
		'😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬',
		'🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗',
		'🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯',
		'😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐',
		'🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈',
		'👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾',
		'🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿',
		'😾', '👶', '🧒', '👦', '👧', '🧑', '👨', '👩', '🧓', '👴',
		'👵', '👤', '👥', '🫂', '👪', '👨‍👩‍👧‍👦', '👨‍👨‍👧', '👩‍👩‍👧', '👨‍👧', '👩‍👧',
		'👨‍👧‍👦', '👩‍👧‍👦', '👨‍👨‍👧‍👦', '👩‍👩‍👧‍👦', '👨‍👨‍👦', '👩‍👩‍👦', '👨‍👦', '👩‍👦',
		'👨‍👦‍👦', '👩‍👦‍👦', '👨‍👨‍👦‍👦', '👩‍👩‍👦‍👦', '👨‍👧‍👧', '👩‍👧‍👧', '👨‍👨‍👧‍👧', '👩‍👩‍👧‍👧',
		'👨‍👧‍👦', '👩‍👧‍👦', '👨‍👨‍👧‍👦', '👩‍👩‍👧‍👦', '👨‍👧‍👧', '👩‍👧‍👧', '👨‍👨‍👧‍👧', '👩‍👩‍👧‍👧'
	];

	// Emoji categories
	const emojiCategories = [
		{ name: 'Faces', emojis: commonEmojis.slice(0, 40) },
		{ name: 'People', emojis: commonEmojis.slice(40, 80) },
		{ name: 'Animals', emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟'] },
		{ name: 'Food', emojis: ['🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠', '🥐', '🥖', '🍞', '🥨', '🥯', '🧀', '🥚', '🍳', '🧈', '🥞'] },
		{ name: 'Activities', emojis: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🎣', '🤿', '🎽', '🎿', '🛷', '🥌', '🎯', '🪁', '🎪', '🤹', '🎭', '🩰', '🎨', '🎬', '🎤', '🎧', '🎼', '🎵', '🎶', '🪘', '🥁', '🎹', '🎸'] },
		{ name: 'Objects', emojis: ['⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '🕹️', '🗜️', '💽', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '🧭', '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋', '🔌'] }
	];

	// Position the picker
	function positionPicker() {
		if (!pickerRef || !triggerElement) return;

		const triggerRect = triggerElement.getBoundingClientRect();
		const pickerRect = pickerRef.getBoundingClientRect();
		const viewportHeight = window.innerHeight;
		const viewportWidth = window.innerWidth;

		let top = 0;
		let left = 0;

		// Calculate horizontal position (center on trigger)
		left = triggerRect.left + (triggerRect.width / 2) - (pickerRect.width / 2);
		
		// Ensure picker stays within viewport horizontally
		if (left < 8) left = 8;
		if (left + pickerRect.width > viewportWidth - 8) {
			left = viewportWidth - pickerRect.width - 8;
		}

		// Calculate vertical position - prioritize above
		const spaceAbove = triggerRect.top - 8;
		const spaceBelow = viewportHeight - triggerRect.bottom - 8;
		const pickerHeight = pickerRect.height;

		// Always try to position above first
		if (spaceAbove >= pickerHeight) {
			top = triggerRect.top - pickerHeight - 8;
		} else if (spaceBelow >= pickerHeight) {
			top = triggerRect.bottom + 8;
		} else {
			// If neither fits, position where there's more space
			if (spaceAbove > spaceBelow) {
				top = Math.max(8, triggerRect.top - pickerHeight - 8);
			} else {
				top = Math.min(viewportHeight - pickerHeight - 8, triggerRect.bottom + 8);
			}
		}

		// Set position without causing page scroll
		pickerRef.style.position = 'fixed';
		pickerRef.style.top = `${top}px`;
		pickerRef.style.left = `${left}px`;
		pickerRef.style.zIndex = '9999';
		pickerRef.style.maxHeight = '320px'; // Limit height to prevent overflow
		pickerRef.style.overflowY = 'auto';
		pickerRef.style.overflowX = 'hidden';
	}

	// Handle emoji selection
	function selectEmoji(emoji: string) {
		onEmojiSelect?.(emoji);
		isOpen = false;
	}

	// Close picker when clicking outside
	function handleClickOutside(event: MouseEvent) {
		if (pickerRef && !pickerRef.contains(event.target as Node) && 
			triggerElement && !triggerElement.contains(event.target as Node)) {
			isOpen = false;
		}
	}

	// Effects
	$effect(() => {
		if (isOpen && pickerRef && triggerElement) {
			// Use requestAnimationFrame to ensure DOM is ready
			requestAnimationFrame(() => {
				positionPicker();
			});
		}
	});

	onMount(() => {
		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});
</script>

{#if isOpen}
	<div
		bind:this={pickerRef}
		class="bg-base-100 border-base-300 rounded-xl border shadow-lg py-4 px-2 w-80"
		style="position: fixed; z-index: 9999; max-height: 320px; overflow-y: auto; overflow-x: hidden;"
	>
		<!-- Header -->
		<div class="mb-3 flex items-center justify-between">
			<h4 class="text-sm font-medium">Choose Emoji</h4>
			<button
				class="btn btn-ghost btn-xs"
				onclick={() => isOpen = false}
				aria-label="Close emoji picker"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Emoji Grid -->
		<div class="max-h-60 overflow-y-auto">
			{#each emojiCategories as category}
				<div class="mb-4">
					<h5 class="text-xs font-medium text-base-content/60 mb-2">{category.name}</h5>
					<div class="grid grid-cols-7 gap-1">
						{#each category.emojis as emoji}
							<button
								class="btn btn-ghost btn-sm h-8 w-8 p-0 text-lg hover:bg-base-200 transition-colors"
								onclick={() => selectEmoji(emoji)}
								title={emoji}
							>
								{emoji}
							</button>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</div>
{/if}
