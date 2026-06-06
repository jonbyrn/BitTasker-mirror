<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { tick, onMount } from 'svelte';
	import { t, locale } from 'svelte-i18n';
	import PhotoSwipeLightbox from 'photoswipe/lightbox';
	import 'photoswipe/style.css';
	import type { PortfolioItem, NostrProfileImage } from '$lib/types/profile.d';
	import { findProfilePortfolioByAuthor } from '$lib/nostr/findProfilePortfolio';
	import {
		getTranslatedPortfolioTitle,
		getTranslatedPortfolioDescription
	} from '$lib/utils/profileTranslation';

	const INITIAL_LIMIT = 6;

	let {
		pubkey,
		isActive = false,
		id = 'portfolio'
	}: {
		pubkey: string;
		isActive?: boolean;
		id?: string;
	} = $props();

	let portfolioItems = $state<PortfolioItem[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let hasLoaded = $state(false);
	let showAll = $state(false);
	let activeFilter = $state<string>('all');
	let lightboxInstance: PhotoSwipeLightbox | null = null;
	let galleryEl = $state<HTMLDivElement | null>(null);

	// Extract all unique skills from portfolio items
	const allSkills = $derived.by(() => {
		const skills = new SvelteSet<string>();
		for (const item of portfolioItems) {
			for (const skill of item.skills ?? []) {
				skills.add(skill);
			}
		}
		return Array.from(skills).sort();
	});

	// Filter items by selected skill
	const filteredItems = $derived.by(() => {
		if (activeFilter === 'all') return portfolioItems;
		return portfolioItems.filter((item) => item.skills?.includes(activeFilter));
	});

	// Apply show-more limit to filtered items
	const displayedItems = $derived.by(() => {
		return showAll ? filteredItems : filteredItems.slice(0, INITIAL_LIMIT);
	});

	const hasMore = $derived(filteredItems.length > INITIAL_LIMIT);

	async function fetchPortfolio() {
		if (!pubkey) return;
		isLoading = true;
		error = null;
		try {
			const result = await findProfilePortfolioByAuthor(pubkey, { limit: 50 });
			portfolioItems = result;
			hasLoaded = true;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			isLoading = false;
		}
	}

	$effect(() => {
		if (isActive && !hasLoaded && !isLoading && pubkey) {
			fetchPortfolio();
		}
	});

	function getItemTitle(item: PortfolioItem): string {
		try {
			return getTranslatedPortfolioTitle(item, $locale || 'en') || item.title || '';
		} catch {
			return item.title || '';
		}
	}

	function getItemDescription(item: PortfolioItem): string {
		try {
			return getTranslatedPortfolioDescription(item, $locale || 'en') || item.description || '';
		} catch {
			return item.description || '';
		}
	}

	function getPrimaryImage(item: PortfolioItem): NostrProfileImage | null {
		if (!item.images?.length) return null;
		return item.images.find((img) => img.isPrimary) || item.images[0];
	}

	function setFilter(skill: string) {
		activeFilter = skill;
		showAll = false;
	}

	function initLightbox() {
		if (!galleryEl) return;

		if (lightboxInstance) {
			try {
				lightboxInstance.destroy();
			} catch {
				// ignore
			}
			lightboxInstance = null;
		}

		const imageLinks = galleryEl.querySelectorAll('a[data-pswp-width]');
		if (imageLinks.length > 0) {
			try {
				const lightbox = new PhotoSwipeLightbox({
					gallery: '#' + id + '-gallery',
					children: 'a[data-pswp-width]',
					mouseMovePan: true,
					initialZoomLevel: 'fit',
					secondaryZoomLevel: 1.5,
					maxZoomLevel: 1,
					pswpModule: () => import('photoswipe')
				});
				lightbox.on('close', () => {
					const currentIndex =
						(lightbox as Record<string, unknown>).currIndex ??
						(lightbox as Record<string, unknown>).pswp?.currIndex ??
						0;
					const trigger = galleryEl?.querySelector(
						`[data-pswp-index="${currentIndex}"]`
					) as HTMLElement | null;
					trigger?.focus();
				});
				lightbox.init();
				lightboxInstance = lightbox;
			} catch (e) {
				console.error('Error initializing PhotoSwipe:', e);
			}
		}
	}

	$effect(() => {
		// Re-initialize lightbox when displayed items change
		const _items = displayedItems;
		if (_items.length > 0) {
			tick().then(() => initLightbox());
		}
	});

	onMount(() => {
		return () => {
			if (lightboxInstance) {
				try {
					lightboxInstance.destroy();
				} catch {
					// ignore
				}
				lightboxInstance = null;
			}
		};
	});
</script>

<section
	{id}
	class="mb-8 scroll-mt-20"
	data-testid="profile-portfolio-section"
	aria-labelledby="{id}-heading"
>
	<div class="mb-4">
		<h2 id="{id}-heading" class="text-xl font-bold">{$t('profile.portfolio.title')}</h2>
	</div>

	{#if isLoading}
		<!-- Loading skeleton -->
		<div
			class="columns-1 gap-4 sm:columns-2 lg:columns-3"
			role="status"
			aria-busy="true"
			aria-label={$t('common.loading')}
		>
			{#each Array.from({ length: 3 }) as _, skelIdx (skelIdx)}
				<div class="mb-4 break-inside-avoid">
					<div class="skeleton h-64 rounded-2xl"></div>
				</div>
			{/each}
		</div>
	{:else if error}
		<!-- Error state with retry -->
		<div class="alert alert-error" role="alert">
			<span>{error}</span>
			<button
				class="btn btn-ghost btn-sm"
				onclick={fetchPortfolio}
				aria-label={$t('common.buttons.retry')}
			>
				{$t('common.buttons.retry')}
			</button>
		</div>
	{:else if hasLoaded && portfolioItems.length === 0}
		<!-- Empty state -->
		<div class="text-base-content/60 py-8 text-center">
			<p>{$t('profile.portfolio.empty')}</p>
		</div>
	{:else if hasLoaded}
		<!-- Skill filter bar -->
		{#if allSkills.length > 1}
			<div class="mb-4 flex flex-wrap gap-2" role="group" aria-label={$t('common.filter')}>
				<button
					class="badge {activeFilter === 'all' ? 'badge-primary' : 'badge-outline'} cursor-pointer"
					onclick={() => setFilter('all')}
				>
					{$t('common.all')}
				</button>
				{#each allSkills as skill (skill)}
					<button
						class="badge {activeFilter === skill
							? 'badge-primary'
							: 'badge-outline'} cursor-pointer"
						onclick={() => setFilter(skill)}
					>
						{skill}
					</button>
				{/each}
			</div>
		{/if}

		{#if filteredItems.length === 0}
			<div class="text-base-content/60 py-8 text-center">
				<p>{$t('profile.portfolio.empty')}</p>
			</div>
		{:else}
			<!-- Masonry grid with PhotoSwipe gallery -->
			<div
				bind:this={galleryEl}
				id="{id}-gallery"
				class="pswp-gallery columns-1 gap-4 sm:columns-2 lg:columns-3"
				aria-live="polite"
			>
				{#each displayedItems as item, index (item.id || item.title)}
					<div class="mb-4 break-inside-avoid">
						<div class="card card-compact bg-base-100 overflow-hidden rounded-2xl shadow-sm">
							<!-- Hero image with PhotoSwipe link -->
							{#if getPrimaryImage(item)}
								{@const primaryImage = getPrimaryImage(item)}
								<a
									href={primaryImage?.url}
									data-pswp-width={1200}
									data-pswp-height={800}
									data-pswp-index={index}
									target="_blank"
									rel="noreferrer"
									class="block"
									aria-label={$t('profile.portfolio.view_images', {
										values: { title: getItemTitle(item) }
									})}
								>
									<img
										src={primaryImage?.url}
										alt={primaryImage?.alt || getItemTitle(item)}
										class="aspect-video w-full cursor-pointer object-cover transition-transform duration-200 hover:scale-105"
										loading="lazy"
									/>
								</a>
							{/if}

							<div class="card-body gap-2 p-4">
								<h3 class="text-base font-semibold">{getItemTitle(item)}</h3>
								{#if getItemDescription(item)}
									<p class="text-base-content/70 line-clamp-4 text-sm">
										{getItemDescription(item)}
									</p>
								{/if}

								<!-- Skills/tags -->
								{#if item.skills?.length}
									<div class="flex flex-wrap gap-1">
										{#each item.skills.slice(0, 3) as skill (skill)}
											<span class="badge badge-ghost badge-xs">{skill}</span>
										{/each}
									</div>
								{/if}

								{#if item.link && (item.link.startsWith('https://') || item.link.startsWith('http://'))}
									<a
										href={item.link}
										target="_blank"
										rel="noopener noreferrer"
										class="btn btn-outline btn-sm mt-2 self-start"
									>
										{$t('profile.portfolio.view_project')}
									</a>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>

			<!-- Show more button -->
			{#if hasMore}
				<div class="mt-4 flex justify-center">
					<button class="btn btn-ghost btn-sm" onclick={() => (showAll = true)}>
						{$t('common.show_more', {
							values: { count: filteredItems.length - INITIAL_LIMIT }
						})}
					</button>
				</div>
			{/if}
		{/if}
	{/if}
</section>
