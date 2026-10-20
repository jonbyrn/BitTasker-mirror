<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from 'svelte-i18n';
	import IconClose from '~icons/mdi/close';

	interface Props {
		/** Total count of filtered transactions (0 hides the counter) */
		totalCount: number;
		/** Whether data is currently loading */
		isLoading: boolean;
		/** Error message to display, if any */
		error?: string | null;
		/** Current page index (0-based) */
		currentPage: number;
		/** Total number of pages */
		totalPages: number;
		/** Whether items exist on the current page */
		hasPageItems: boolean;
		/** Close handler — omit to hide close button */
		onClose?: () => void;
		/** Refresh handler */
		onRefresh: () => void;
		/** Page change handler */
		onPageChange: (page: number) => void;
		/** Filter controls (type buttons + dropdowns) */
		filters: Snippet;
		/** Transaction list content (populated or empty state) */
		content: Snippet;
	}

	let {
		totalCount,
		isLoading,
		error = null,
		currentPage,
		totalPages,
		hasPageItems,
		onClose,
		onRefresh,
		onPageChange,
		filters,
		content
	}: Props = $props();

	function prevPage() {
		if (currentPage > 0) onPageChange(currentPage - 1);
	}

	function nextPage() {
		if (currentPage < totalPages - 1) onPageChange(currentPage + 1);
	}
</script>

<div class="-m-3 flex min-h-0 flex-1 flex-col sm:-m-4 lg:-m-6">
	<!-- Filters -->
	<div
		class="border-base-300/60 bg-base-100/40 mx-3 mt-3 shrink-0 rounded-3xl border p-2 shadow-sm sm:mx-4 sm:mt-4 lg:mx-6 lg:mt-6"
	>
		{@render filters?.()}
	</div>

	<!-- Total transactions count -->
	{#if !isLoading && totalCount > 0}
		<div class="mx-3 shrink-0 p-2 text-center text-lg font-bold sm:mx-4 lg:mx-6">
			{totalCount}
			{$t('wallet.total_transactions')}
		</div>
	{/if}

	<!-- Scrollable transactions area -->
	<div class="mx-3 min-h-0 flex-1 overflow-y-auto sm:mx-4 lg:mx-6">
		<div class="space-y-3">
			{#if error}
				<div class="alert alert-error alert-outline" role="alert">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6 shrink-0 stroke-current"
						fill="none"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<span>{error} Tap Refresh to try again.</span>
				</div>
			{/if}

			{#if isLoading}
				<div class="space-y-3">
					{#each Array.from({ length: 10 }, (_, i) => i) as skeletonIndex (skeletonIndex)}
						<div class="card bg-base-200 animate-pulse rounded-lg">
							<div class="card-body p-2">
								<div class="flex flex-col gap-1">
									<div class="flex items-center justify-between gap-2 sm:gap-4">
										<div class="flex min-w-0 flex-1 items-center gap-3">
											<div class="bg-base-300 h-10 w-10 rounded-full"></div>
											<div class="flex flex-col gap-1">
												<div class="bg-base-300 h-5 w-24 rounded"></div>
												<div class="bg-base-300 h-3 w-16 rounded"></div>
											</div>
										</div>
										<div class="flex flex-col items-end">
											<div class="bg-base-300 h-5 w-20 rounded"></div>
											<div class="bg-base-300 mt-1 h-3 w-16 rounded"></div>
										</div>
									</div>
									<div class="flex items-center justify-between gap-2 sm:gap-4">
										<div class="flex min-w-0 flex-1 items-center gap-3">
											<div class="bg-base-300 h-10 w-10 rounded-full"></div>
											<div class="space-y-1">
												<div class="bg-base-300 h-4 w-24 rounded"></div>
												<div class="bg-base-300 h-3 w-20 rounded"></div>
											</div>
										</div>
										<div class="bg-base-300 h-4 w-32 rounded"></div>
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				{@render content?.()}
			{/if}
		</div>
	</div>

	<!-- Bottom section: pagination + buttons -->
	<div
		class="border-base-300 mx-3 mt-auto mb-3 shrink-0 space-y-4 border-t pt-4 sm:mx-4 sm:mb-4 lg:mx-6 lg:mb-6 lg:pt-6"
	>
		{#if totalPages > 1 && !isLoading && hasPageItems}
			<div class="flex justify-center">
				<div class="join">
					<button
						class="join-item btn btn-sm"
						onclick={prevPage}
						disabled={currentPage === 0}
						aria-label="Previous page"
					>
						«
					</button>

					{#each Array.from({ length: Math.min(5, totalPages) }, (_, i) => i) as i (i)}
						{@const pageNum = Math.max(0, Math.min(totalPages - 5, currentPage - 2)) + i}
						{#if pageNum < totalPages}
							<button
								class="join-item btn btn-sm {currentPage === pageNum ? 'btn-active' : ''}"
								onclick={() => onPageChange(pageNum)}
								aria-label="Page {pageNum + 1}"
								aria-current={currentPage === pageNum ? 'page' : undefined}
							>
								{pageNum + 1}
							</button>
						{/if}
					{/each}

					<button
						class="join-item btn btn-sm"
						onclick={nextPage}
						disabled={currentPage === totalPages - 1}
						aria-label="Next page"
					>
						»
					</button>
				</div>
			</div>
		{/if}

		<div class="flex gap-2">
			{#if onClose}
				<button
					class="btn btn-error min-h-[44px] flex-1 touch-manipulation transition-transform duration-100 select-none active:scale-95 sm:min-h-[48px]"
					onclick={onClose}
					aria-label={$t('common.close')}
				>
					<IconClose class="h-4 w-4 sm:h-5 sm:w-5" />
					<span class="text-sm sm:text-base">{$t('common.close')}</span>
				</button>
			{/if}
			<button
				class="btn btn-primary flex min-h-[44px] flex-1 items-center justify-center gap-2"
				onclick={onRefresh}
				disabled={isLoading}
				aria-label={$t('wallet.refresh')}
			>
				{#if isLoading}
					<span class="loading loading-spinner loading-sm"></span>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
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
				{/if}
				<span>{$t('wallet.refresh')}</span>
			</button>
		</div>
	</div>
</div>
