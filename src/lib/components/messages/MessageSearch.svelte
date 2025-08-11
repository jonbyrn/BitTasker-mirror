<script lang="ts">
	import {
		searchMessages,
		getSearchSuggestions,
		type SearchOptions,
		type SearchResult,
		type DecryptedMessage
	} from '$lib/utils/message-search';
	import { formatTimeAgo } from '$lib/utils/helpers/date';
	import Avatar from '$lib/components/Avatar.svelte';
	import { fetchProfileMetadata } from '$lib/utils/nostr-message';
	import { t } from 'svelte-i18n';

	// Props
	let {
		pubkey = '',
		onMessageSelect = (message: DecryptedMessage) => {},
		placeholder = $t('messages.search_messages'),
		profile = null
	}: {
		pubkey?: string;
		onMessageSelect?: (message: DecryptedMessage) => void;
		placeholder?: string;
		profile?: { name?: string; picture?: string } | null;
	} = $props();

	// State
	let searchQuery = $state('');
	let searchResults = $state<SearchResult[]>([]);
	let suggestions = $state<string[]>([]);
	let isSearching = $state(false);
	let showResults = $state(false);
	let showAdvanced = $state(false);
	let selectedResultIndex = $state(-1);

	// Advanced search options
	let caseSensitive = $state(false);
	let wholeWords = $state(false);
	let dateRangeStart = $state('');
	let dateRangeEnd = $state('');

	// Refs
	let searchInput: HTMLInputElement;
	let resultsContainer: HTMLElement | null = $state(null);

	// Debounced search
	let searchTimeout: NodeJS.Timeout | undefined = undefined;

	function debounceSearch() {
		if (searchTimeout) clearTimeout(searchTimeout);

		searchTimeout = setTimeout(async () => {
			if (searchQuery.trim()) {
				await performSearch();
			} else {
				searchResults = [];
				showResults = false;
			}
		}, 300);
	}

	async function performSearch() {
		if (!searchQuery.trim()) return;

		isSearching = true;
		showResults = true;
		selectedResultIndex = -1;

		try {
			const options: SearchOptions = {
				query: searchQuery,
				pubkey: pubkey || undefined,
				limit: 50,
				caseSensitive,
				wholeWords
			};

			// Add date range if specified
			if (dateRangeStart || dateRangeEnd) {
				options.dateRange = {};
				if (dateRangeStart) options.dateRange.start = new Date(dateRangeStart);
				if (dateRangeEnd) options.dateRange.end = new Date(dateRangeEnd);
			}

			searchResults = await searchMessages(options);
		} catch (error) {
			console.error('Search failed:', error);
			searchResults = [];
		} finally {
			isSearching = false;
		}
	}

	function handleInputChange() {
		debounceSearch();

		// Update suggestions
		if (searchQuery.length > 1) {
			suggestions = getSearchSuggestions(searchQuery);
		} else {
			suggestions = [];
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (!showResults || searchResults.length === 0) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				selectedResultIndex = Math.min(selectedResultIndex + 1, searchResults.length - 1);
				scrollToSelectedResult();
				break;

			case 'ArrowUp':
				event.preventDefault();
				selectedResultIndex = Math.max(selectedResultIndex - 1, -1);
				scrollToSelectedResult();
				break;

			case 'Enter':
				event.preventDefault();
				if (selectedResultIndex >= 0 && selectedResultIndex < searchResults.length) {
					selectResult(searchResults[selectedResultIndex]);
				}
				break;

			case 'Escape':
				event.preventDefault();
				closeSearch();
				break;
		}
	}

	function scrollToSelectedResult() {
		if (selectedResultIndex < 0 || !resultsContainer) return;

		const resultElement = resultsContainer.children[selectedResultIndex] as HTMLElement;
		if (resultElement) {
			resultElement.scrollIntoView({ block: 'nearest' });
		}
	}

	function selectResult(result: SearchResult) {
		onMessageSelect(result.message);
		closeSearch();
	}

	function selectSuggestion(suggestion: string) {
		searchQuery = suggestion;
		suggestions = [];
		debounceSearch();
		searchInput.focus();
	}

	function closeSearch() {
		showResults = false;
		selectedResultIndex = -1;
		searchInput.blur();
	}

	function clearSearch() {
		searchQuery = '';
		searchResults = [];
		suggestions = [];
		showResults = false;
		selectedResultIndex = -1;
	}

	function toggleAdvanced() {
		showAdvanced = !showAdvanced;
	}

	function highlightText(text: string, query: string): string {
		if (!query.trim()) return text;

		const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
		return text.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800">$1</mark>');
	}

	// Close results when clicking outside
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as Element;
		if (!target.closest('.search-container')) {
			closeSearch();
		}
	}

	$effect(() => {
		document.addEventListener('click', handleClickOutside);
		return () => document.removeEventListener('click', handleClickOutside);
	});
</script>

<div class="search-container relative">
	<!-- Search Input -->
	<div class="relative">
		<div class="absolute inset-y-0 left-0 flex items-center pl-3">
			<svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
				/>
			</svg>
		</div>

		<input
			bind:this={searchInput}
			bind:value={searchQuery}
			oninput={handleInputChange}
			onkeydown={handleKeyDown}
			onfocus={() => {
				if (searchQuery) showResults = true;
			}}
			type="text"
			class="input input-bordered w-full pr-20 pl-10"
			{placeholder}
		/>

		<div class="absolute inset-y-0 right-0 flex items-center space-x-2 pr-3">
			{#if searchQuery}
				<button onclick={clearSearch} class="btn btn-ghost btn-xs" aria-label={$t('messages.clear_search_aria')}>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			{/if}

			<button
				onclick={toggleAdvanced}
				class="btn btn-ghost btn-xs"
				class:btn-active={showAdvanced}
				aria-label={$t('messages.advanced_search_options_aria')}
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"
					/>
				</svg>
			</button>
		</div>
	</div>

	<!-- Advanced Options -->
	{#if showAdvanced}
		<div class="bg-base-200 mt-2 space-y-3 rounded-lg p-3">
			<div class="flex flex-wrap gap-4">
				<label class="label cursor-pointer">
					<input type="checkbox" bind:checked={caseSensitive} class="checkbox checkbox-sm" />
					<span class="label-text ml-2">{$t('messages.case_sensitive')}</span>
				</label>

				<label class="label cursor-pointer">
					<input type="checkbox" bind:checked={wholeWords} class="checkbox checkbox-sm" />
					<span class="label-text ml-2">{$t('messages.whole_words_only')}</span>
				</label>
			</div>

			<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
				<div class="form-control">
					<label class="label" for="dateRangeStart">
						<span class="label-text">{$t('messages.from_date')}</span>
					</label>
					<input type="date" bind:value={dateRangeStart} class="input input-bordered input-sm" />
				</div>

				<div class="form-control">
					<label class="label" for="dateRangeEnd">
						<span class="label-text">{$t('messages.to_date')}</span>
					</label>
					<input type="date" bind:value={dateRangeEnd} class="input input-bordered input-sm" />
				</div>
			</div>
		</div>
	{/if}

	<!-- Suggestions -->
	{#if suggestions.length > 0 && !showResults}
		<div class="bg-base-100 border-base-300 absolute z-10 mt-1 w-full rounded-lg border shadow-lg">
			{#each suggestions as suggestion}
				<button
					onclick={() => selectSuggestion(suggestion)}
					class="hover:bg-base-200 w-full px-4 py-2 text-left first:rounded-t-lg last:rounded-b-lg"
				>
					{suggestion}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Search Results -->
	{#if showResults}
		<div
			class="bg-base-100 border-base-300 absolute z-10 mt-1 max-h-96 w-full overflow-y-auto rounded-lg border shadow-lg"
		>
			{#if isSearching}
				<div class="p-4 text-center">
					<span class="loading loading-spinner loading-sm"></span>
					<span class="ml-2">{$t('messages.searching')}</span>
				</div>
			{:else if searchResults.length === 0}
				<div class="p-4 text-center text-gray-500">
					{$t('messages.no_messages_found', { query: searchQuery })}
				</div>
			{:else}
				<div bind:this={resultsContainer}>
					{#each searchResults as result, index}
						<button
							onclick={() => selectResult(result)}
							class="hover:bg-base-200 border-base-300 w-full border-b p-3 text-left first:rounded-t-lg last:rounded-b-lg last:border-b-0"
							class:bg-base-200={index === selectedResultIndex}
						>
							<div class="flex items-start gap-3">
								{#if profile}
									<Avatar
										user={{
											name: profile.name || $t('messages.unknown'),
											picture: profile.picture || null
										}}
										size="sm"
									/>
								{/if}

								<div class="min-w-0 flex-1">
									<div class="mb-1 flex items-center justify-between">
										<span class="truncate text-sm font-medium">
											{profile?.name || result.pubkey.slice(0, 8) + '...'}
										</span>
										<span class="text-xs text-gray-500">
											{formatTimeAgo(new Date(result.message.event.created_at * 1000))}
										</span>
									</div>

									{#each result.snippets as snippet}
										<p class="line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
											{@html highlightText(snippet, searchQuery)}
										</p>
									{/each}

									<div class="mt-2 flex items-center justify-between">
										<span class="text-xs text-gray-400">
											{$t('messages.score', { score: Math.round(result.score) })}
										</span>
									</div>
								</div>
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.search-container {
		/* Ensure proper stacking context */
		position: relative;
		z-index: 1;
	}

	:global(.search-container mark) {
		padding: 0.125rem 0.25rem;
		border-radius: 0.25rem;
	}
</style>
