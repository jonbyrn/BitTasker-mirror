<script lang="ts">
	import type { TaskeeProfile } from '$lib/nostr/findTaskees';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { taskeeStore, findTaskees, cleanup } from '$lib/nostr/findTaskees';
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import Avatar from '$lib/components/Avatar.svelte';
	import { formatStandardDateShort } from '$lib/utils/helpers/dateFormatter';
	import TaskeeLocationMap from '$lib/components/maps/TaskeeLocationMap.svelte';
	import { getProfileUrl } from '$lib/utils/helpers/profile';

	// Reactive state for search parameters and UI controls
	let searchQuery = $state('');
	let selectedSkills = $state<string[]>([]);

	// Loading states
	let loadingTimeout = $state(false);
	let isInitialLoad = $state(true);
	let dataLoaded = $state(false);
	let showSkeleton = $state(true);

	// Lazy loading state
	let taskeeListRef = $state<HTMLElement | null>(null);
	let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
	let intersectionObserver: IntersectionObserver | null = null;

	// Infinite scroll state
	let infiniteScrollObserver: IntersectionObserver | null = null;
	let scrollTarget = $state<HTMLElement | null>(null);

	// View mode state - Airbnb style toggle
	let viewMode = $state<'list' | 'map'>('list');

	// Selected taskee for map display
	let selectedTaskee = $state<TaskeeProfile | null>(null);

	// Debounce function
	function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
		let timeoutId: ReturnType<typeof setTimeout>;
		return function (...args: Parameters<T>) {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(() => fn.apply(null, args), delay);
		};
	}

	// Debounced function to update search
	const debouncedSearch = debounce(async () => {
		const newParams = {
			page: 1,
			limit: 20,
			search: searchQuery.trim() || undefined,
			skills: selectedSkills.length > 0 ? selectedSkills : undefined
		};

		// Clear existing taskees when starting a new search
		taskeeStore.update((state) => ({
			...state,
			items: [],
			currentPage: 1,
			hasMore: true,
			error: null
		}));

		try {
			await findTaskees(newParams);
		} catch (err) {
			console.error('[FindTaskees] Search fetch error:', err);
		}
	}, 1000);

	// Clear filters
	function clearFilters() {
		searchQuery = '';
		selectedSkills = [];

		taskeeStore.update((state) => ({
			...state,
			items: [],
			currentPage: 1,
			hasMore: true,
			error: null
		}));

		findTaskees({ page: 1, limit: 20 });
	}

	// Load more taskees (for infinite scroll)
	async function loadMoreTaskees() {
		if ($taskeeStore.hasMore && !$taskeeStore.loading) {
			const nextPage = $taskeeStore.currentPage + 1;
			await findTaskees({
				page: nextPage,
				limit: 20,
				search: searchQuery.trim() || undefined,
				skills: selectedSkills.length > 0 ? selectedSkills : undefined
			});
		}
	}

	// Setup intersection observer for infinite scroll
	function setupInfiniteScroll() {
		if (!browser) return;

		if ('IntersectionObserver' in window) {
			infiniteScrollObserver = new IntersectionObserver(
				(entries) => {
					if (entries[0].isIntersecting && $taskeeStore.hasMore && !$taskeeStore.loading) {
						loadMoreTaskees();
					}
				},
				{ rootMargin: '200px' }
			);

			if (scrollTarget) {
				infiniteScrollObserver.observe(scrollTarget);
			}
		}
	}

	// Cleanup observer
	function cleanupInfiniteScroll() {
		if (infiniteScrollObserver && scrollTarget) {
			infiniteScrollObserver.unobserve(scrollTarget);
		}
		if (infiniteScrollObserver) {
			infiniteScrollObserver.disconnect();
			infiniteScrollObserver = null;
		}
	}

	/**
	 * Load Nostr data with proper state management
	 */
	async function loadNostrData(): Promise<void> {
		if (dataLoaded) return; // Prevent multiple loads

		try {
			await findTaskees({ page: 1, limit: 20 });

			dataLoaded = true;
			showSkeleton = false;

			// Cleanup observers and timers
			if (intersectionObserver) {
				intersectionObserver.disconnect();
				intersectionObserver = null;
			}
			if (fallbackTimer) {
				clearTimeout(fallbackTimer);
				fallbackTimer = null;
			}
		} catch (error) {
			console.error('[FindTaskees] Error loading Nostr data:', error);
			// Keep skeleton visible on error
		}
	}

	/**
	 * Setup lazy loading with intersection observer and fallback
	 */
	function setupLazyLoading(): void {
		if (!browser || dataLoaded) return;

		// Setup intersection observer
		intersectionObserver = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && !dataLoaded) {
					loadNostrData();
				}
			},
			{
				threshold: 0.1,
				rootMargin: '200px' // Start loading 200px before visible
			}
		);

		// Observe the taskee list area
		if (taskeeListRef) {
			intersectionObserver.observe(taskeeListRef);
		}

		// Fallback: Load after 3 seconds if user doesn't scroll
		fallbackTimer = setTimeout(() => {
			if (!dataLoaded) {
				loadNostrData();
			}
		}, 3000);
	}

	// Initial data fetch and setup
	onMount(() => {
		if (browser) {
			// Set initial theme value
			isDarkMode = document.documentElement.classList.contains('dark');

			// Watch for theme changes
			themeObserver = new MutationObserver(() => {
				const newIsDarkMode = document.documentElement.classList.contains('dark');
				if (newIsDarkMode !== isDarkMode) {
					isDarkMode = newIsDarkMode;
				}
			});

			// Observe changes to the html element's class list
			themeObserver.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ['class']
			});

			// Setup lazy loading for Nostr data
			setupLazyLoading();

			// Setup infinite scroll - waiting for DOM to be ready
			setTimeout(() => {
				setupInfiniteScroll();
			}, 1000);
		}
	});

	// Cleanup on component destroy
	onDestroy(() => {
		if (browser) {
			// Cleanup theme observer
			if (themeObserver) {
				themeObserver.disconnect();
				themeObserver = null;
			}

			// Cleanup lazy loading
			if (intersectionObserver) {
				intersectionObserver.disconnect();
				intersectionObserver = null;
			}
			if (fallbackTimer) {
				clearTimeout(fallbackTimer);
				fallbackTimer = null;
			}

			// Cleanup infinite scroll
			cleanupInfiniteScroll();
			cleanup();
		}
	});

	// Loading state management effect
	$effect(() => {
		// Update initial load flag when data is loaded
		if (isInitialLoad && dataLoaded) {
			isInitialLoad = false;
		}

		// Handle loading timeout for Nostr data
		let timer: ReturnType<typeof setTimeout> | undefined;
		if ($taskeeStore.loading && !dataLoaded) {
			timer = setTimeout(() => {
				if ($taskeeStore.loading && !dataLoaded) {
					loadingTimeout = true;
					console.error('[FindTaskees] Query timeout - fetching took too long');
				}
			}, 10000); // 10 second timeout
		} else {
			loadingTimeout = false;
		}

		return () => {
			if (timer) clearTimeout(timer);
		};
	});

	function viewProfile(taskee: TaskeeProfile) {
		if (taskee.npub) {
			goto(getProfileUrl(taskee.npub));
		}
	}

	function selectTaskeeForMap(taskee: TaskeeProfile) {
		selectedTaskee = taskee;
	}

	// Function to scroll to a taskee card
	function scrollToTaskeeCard(npub: string) {
		const cardElement = document.querySelector(`[data-taskee-npub="${npub}"]`) as HTMLElement;
		if (cardElement) {
			cardElement.scrollIntoView({
				behavior: 'smooth',
				block: 'center'
			});
		}
	}

	// Toggle view mode function
	function toggleViewMode() {
		viewMode = viewMode === 'list' ? 'map' : 'list';
	}

	// Variable for detecting theme
	let isDarkMode = $state(false);
	let themeObserver: MutationObserver | null = null;

	function getSearchPlaceholder(): string {
		if (searchQuery.length > 0 && searchQuery.length < 3) {
			return $t('find_taskees.search_minimum_chars');
		}
		return $t('find_taskees.search_placeholder');
	}

	function getSearchInputClass(): string {
		let baseClass = 'input input-bordered w-full pl-10';

		if (searchQuery.length > 0 && searchQuery.length < 3) {
			baseClass += ' input-warning';
		} else if (searchQuery.length >= 3) {
			baseClass += ' input-success';
		}

		return baseClass;
	}
</script>

<div class="mx-auto max-w-7xl p-4 md:p-0">
	<div id="panel-find-taskees" role="tabpanel" aria-labelledby="tab-find-taskees" class="">
		<!-- Search and Filter Controls - Full Width at Top -->
		<div class="mb-4">
			<div class="flex flex-wrap items-center gap-3">
				<!-- Search Input -->
				<div class="relative mt-2 min-w-[200px] flex-1">
					<input
						type="text"
						class={getSearchInputClass()}
						placeholder={getSearchPlaceholder()}
						bind:value={searchQuery}
						oninput={debouncedSearch}
					/>
					<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5 text-gray-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
							/>
						</svg>
					</div>
				</div>

				<!-- Clear Filters Button -->
				{#if searchQuery || selectedSkills.length > 0}
					<button class="btn btn-sm btn-ghost" onclick={clearFilters}>
						{$t('find_taskees.clear_filters')}
					</button>
				{/if}
			</div>
		</div>

		<!-- Main Content - Dynamic Layout based on view mode -->
		{#if viewMode === 'list'}
			<!-- List View - Responsive Layout -->
			<div class="relative w-full">
				<!-- Error Message -->
				{#if $taskeeStore.error}
					<div class="alert alert-error alert-outline mb-3">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5 shrink-0 stroke-current"
							fill="none"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M10 14l2-2m0 0l2-2m-2 2l-2 2m2-2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span>{$t('find_taskees.error_loading').replace('{error}', $taskeeStore.error)}</span>
					</div>
				{/if}

				<!-- Mobile: Full width list, Desktop: Split with map -->
				<div class="lg:flex lg:gap-6">
					<!-- Taskees List -->
					<div class="lg:w-1/2">
						<div class="max-h-[calc(65vh)] overflow-y-auto" bind:this={taskeeListRef}>
							<!-- Skeleton Loading -->
							{#if showSkeleton && !dataLoaded}
								<div class="space-y-3">
									{#each Array(4) as _}
										<div class="card bg-base-100 animate-pulse rounded-xl p-4 shadow-md">
											<div class="flex flex-col gap-3 md:flex-row md:items-center">
												<div class="bg-base-300 h-12 w-12 rounded-full"></div>
												<div class="flex-1">
													<div class="bg-base-300 mb-2 h-6 w-3/4 rounded"></div>
													<div class="bg-base-300 h-4 w-1/2 rounded"></div>
												</div>
											</div>
										</div>
									{/each}
								</div>
							{:else if loadingTimeout}
								<!-- Loading Timeout Warning -->
								<div class="alert alert-warning alert-outline mb-3 rounded-xl">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5 shrink-0 stroke-current"
										fill="none"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
										/>
									</svg>
									<div>
										<h3 class="font-bold">{$t('find_taskees.loading_timeout_title')}</h3>
										<div class="text-xs">{$t('find_taskees.loading_timeout_message')}</div>
									</div>
									<button class="btn btn-sm" onclick={() => window.location.reload()}>
										{$t('find_taskees.refresh')}
									</button>
								</div>
							{:else if $taskeeStore.items && $taskeeStore.items.length > 0}
								<div class="space-y-4">
									{#each $taskeeStore.items as taskee}
										<div
											class="card bg-base-100 cursor-pointer rounded-xl shadow-md transition-shadow hover:shadow-lg"
											class:bg-base-300={selectedTaskee?.npub === taskee.npub}
											onclick={() => selectTaskeeForMap(taskee)}
											tabindex="0"
											role="button"
											aria-label={$t('find_taskees.view_profile')}
											data-taskee-npub={taskee.npub}
										>
											<div class="card-body rounded-xl border-2 border-[#f7931a] p-4">
												<!-- Top Row: Avatar + Name -->
												<div class="mb-3 flex items-center gap-3">
													<Avatar name={taskee.name} picture={taskee.picture} size="md" />
													<div class="flex-1 min-w-0">
														<h3 class="card-title line-clamp-1 text-lg font-semibold">
															{taskee.name || $t('find_taskees.anonymous')}
														</h3>
														{#if taskee.professionalTitle}
															<p class="text-base-content/70 text-sm">{taskee.professionalTitle}</p>
														{/if}
													</div>
												</div>

												<!-- About Section -->
												{#if taskee.about}
													<p class="text-base-content/80 mb-3 line-clamp-2 text-sm">
														{taskee.about}
													</p>
												{/if}

												<!-- Skills Section -->
												{#if taskee.skills && taskee.skills.length > 0}
													<div class="mb-3">
														<div class="mb-2 text-xs font-semibold text-base-content/70">
															{$t('find_taskees.skills')}
														</div>
														<div class="flex flex-wrap gap-1">
															{#each taskee.skills.slice(0, 5) as skill}
																<span class="badge badge-primary badge-sm">{skill}</span>
															{/each}
															{#if taskee.skills.length > 5}
																<span class="badge badge-ghost badge-sm">
																	+{taskee.skills.length - 5}
																</span>
															{/if}
														</div>
													</div>
												{/if}

												<!-- Bottom Row: Member Since + View Profile Button -->
												<div class="mt-auto flex items-center justify-between">
													{#if taskee.createdAt}
														<span class="text-base-content/60 text-xs">
															{$t('find_taskees.member_since')} {formatStandardDateShort(new Date(taskee.createdAt))}
														</span>
													{/if}
													<button
														class="btn btn-primary btn-sm"
														onclick={(e) => {
															e.stopPropagation();
															viewProfile(taskee);
														}}
														aria-label={$t('find_taskees.view_profile')}
													>
														{$t('find_taskees.view_profile')}
													</button>
												</div>
											</div>
										</div>
									{/each}
								</div>

								<!-- Infinite Scroll Target -->
								<!-- svelte-ignore element_invalid_self_closing_tag -->
								<div bind:this={scrollTarget} class="h-4" />
							{:else if !$taskeeStore.loading}
								<!-- No Results -->
								<div class="py-8 text-center">
									<div class="text-base-content/60 mb-3">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="mx-auto h-12 w-12"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
											/>
										</svg>
									</div>
									<h3 class="mb-2 text-lg font-semibold">{$t('find_taskees.no_results_title')}</h3>
									<p class="text-base-content/70 mb-3">{$t('find_taskees.no_results_message')}</p>
									<button class="btn btn-primary" onclick={clearFilters}>
										{$t('find_taskees.clear_filters')}
									</button>
								</div>
							{/if}
						</div>
					</div>

					<!-- Desktop Map Sidebar (hidden on mobile) -->
					<div class="hidden lg:block lg:w-1/2">
						<TaskeeLocationMap
							taskees={$taskeeStore.items}
							height="65vh"
							selectedTaskee={selectedTaskee}
							onTaskeeSelected={(event) => {
								selectedTaskee = event.taskee;
								if (event.taskee.npub) {
									scrollToTaskeeCard(event.taskee.npub);
								}
							}}
						/>
					</div>
				</div>

				<!-- Mobile Floating Button - Show Map (only visible on mobile) -->
				<button
					class="inverted-colors fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 transform items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg transition-all duration-200 hover:shadow-xl lg:hidden"
					onclick={toggleViewMode}
					title={$t('find_taskees.view_map')}
				>
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
							d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
						/>
					</svg>
					{$t('find_taskees.view_map')}
				</button>
			</div>
		{:else}
			<!-- Map View - Full Width (Mobile only) -->
			<div class="relative w-full lg:hidden">
				<TaskeeLocationMap
					taskees={$taskeeStore.items}
					height="65vh"
					selectedTaskee={selectedTaskee}
					onTaskeeSelected={(event) => {
						selectedTaskee = event.taskee;
						// When a taskee is selected on the map, switch to list view to show the taskee
						viewMode = 'list';
						if (event.taskee.npub) {
							scrollToTaskeeCard(event.taskee.npub);
						}
					}}
				/>

				<!-- Mobile Floating Button - Show List -->
				<button
					class="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 transform items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg transition-all duration-200 hover:shadow-xl"
					class:bg-black={!isDarkMode}
					class:bg-white={isDarkMode}
					class:text-white={!isDarkMode}
					class:text-black={isDarkMode}
					onclick={toggleViewMode}
					aria-label={$t('find_taskees.view_list')}
				>
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
							d="M4 6h16M4 10h16M4 14h16M4 18h16"
						/>
					</svg>
					<span class="text-xs">{$t('find_taskees.view_list')}</span>
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	:global([name='gmp-internal-google-attribution']),
	:global([name='gmp-internal-dialog']) {
		display: none !important;
	}
</style>

