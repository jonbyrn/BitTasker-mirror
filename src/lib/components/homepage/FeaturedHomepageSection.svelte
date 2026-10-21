<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		browseHref,
		browseLabel,
		items = [],
		loading = false,
		error = null,
		hideWhenEmpty = false,
		emptyMessage = 'Nothing to show right now.',
		skeletonCount = 8,
		sectionTestId,
		cardWidthClass = 'w-72 max-w-[85vw]',
		cardTestIdPrefix = 'homepage-featured-card',
		card
	} = $props<{
		title: string;
		browseHref: string;
		browseLabel: string;
		items?: unknown[];
		loading?: boolean;
		error?: string | null;
		hideWhenEmpty?: boolean;
		emptyMessage?: string;
		skeletonCount?: number;
		sectionTestId: string;
		cardWidthClass?: string;
		cardTestIdPrefix?: string;
		card?: Snippet<[unknown]>;
	}>();

	const shouldHideSection = $derived(
		!loading && hideWhenEmpty && (error !== null || items.length === 0)
	);
	const headingId = $derived(`${sectionTestId}-heading`);
</script>

{#if !shouldHideSection}
	<section
		class="bg-base-200 max-w-full min-w-0 overflow-x-clip py-16"
		data-testid={sectionTestId}
		data-homepage-featured-shell="true"
		aria-busy={loading}
		aria-labelledby={headingId}
	>
		<div class="container mx-auto max-w-full min-w-0 px-4">
			<div class="mb-8">
				<h2 id={headingId}>{title}</h2>
			</div>

			<div class="overflow-hidden">
				{#if loading}
					<p
						class="sr-only"
						role="status"
						aria-live="polite"
						data-testid={`${sectionTestId}-loading-status`}
					>
						Loading {title}.
					</p>
					<div
						class="scrollbar-hide flex max-w-full min-w-0 snap-x snap-mandatory gap-4 overflow-x-auto px-4 pt-4 pb-6"
						style="scrollbar-width:none;"
						data-testid={`${sectionTestId}-skeletons`}
						aria-hidden="true"
					>
						{#each Array.from({ length: skeletonCount }) as _, index (index)}
							<div
								class="{cardWidthClass} shrink-0 snap-start"
								data-testid={`${cardTestIdPrefix}-skeleton-${index + 1}`}
							>
								<div class="card bg-base-100 h-full overflow-hidden rounded-2xl shadow-lg">
									<div class="bg-base-300 h-48 animate-pulse"></div>
									<div class="space-y-3 p-5">
										<div class="bg-base-300 h-5 w-3/4 animate-pulse rounded"></div>
										<div class="bg-base-300 h-4 w-full animate-pulse rounded"></div>
										<div class="bg-base-300 h-4 w-2/3 animate-pulse rounded"></div>
										<div class="flex gap-2 pt-2">
											<div class="bg-base-300 h-7 w-24 animate-pulse rounded-full"></div>
											<div class="bg-base-300 h-7 w-28 animate-pulse rounded-full"></div>
										</div>
										<div class="flex justify-between pt-4">
											<div class="bg-base-300 h-4 w-24 animate-pulse rounded"></div>
											<div class="bg-base-300 h-8 w-28 animate-pulse rounded-lg"></div>
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{:else if error}
					<div class="flex items-center justify-center py-12">
						<div
							class="alert alert-warning max-w-md"
							role="alert"
							aria-live="assertive"
							data-testid={`${sectionTestId}-error`}
						>
							<span>{error}</span>
						</div>
					</div>
				{:else if items.length === 0}
					<div class="flex items-center justify-center py-12">
						<p
							class="text-base-content/70 text-center"
							role="status"
							aria-live="polite"
							data-testid={`${sectionTestId}-empty`}
						>
							{emptyMessage}
						</p>
					</div>
				{:else}
					<div
						class="scrollbar-hide flex max-w-full min-w-0 snap-x snap-mandatory gap-4 overflow-x-auto px-4 pt-4 pb-6"
						style="scrollbar-width:none;"
						data-testid={`${sectionTestId}-cards`}
						role="list"
						aria-label={title}
					>
						{#each items as item, index (index)}
							<div
								class="{cardWidthClass} shrink-0 snap-start"
								data-testid={`${cardTestIdPrefix}-${index + 1}`}
								role="listitem"
							>
								{@render card?.(item)}
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<div class="mt-12 text-center">
				<a href={browseHref} class="btn btn-primary" data-testid={`${sectionTestId}-browse-cta`}>
					{browseLabel}
				</a>
			</div>
		</div>
	</section>
{/if}
