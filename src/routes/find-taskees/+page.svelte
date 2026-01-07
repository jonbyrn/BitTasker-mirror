<script lang="ts">
	import type { TaskeeProfile } from '$lib/nostr/findTaskees';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { writable } from 'svelte/store';
	import { t, locale } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import Avatar from '$lib/components/Avatar.svelte';
	import TaskeeLocationMap from '$lib/components/maps/TaskeeLocationMap.svelte';
	import { getProfileUrl } from '$lib/utils/helpers/profile';
	import TaskeeFilterDrawer from '$lib/components/filters/TaskeeFilterDrawer.svelte';
	import type { SearchTaskeesParams } from '$lib/nostr/findTaskees';
	import mockTaskeesData from '$lib/utils/constants/mock-taskees-data.json?raw';
	import taskeeCategoriesData from '$lib/utils/constants/taskee-categories.json?raw';
	import { loadNamespace, type SupportedLanguage } from '$lib/i18n/i18n';
	import { loadPageTranslations } from '$lib/i18n/routeTranslations';
	import Modal from '$lib/components/Modal.svelte';
	
	// Parse JSON data
	const mockTaskees = JSON.parse(mockTaskeesData) as TaskeeProfile[];
	const taskeeCategories = JSON.parse(taskeeCategoriesData) as Array<{
		id: string;
		name: string;
		icon: string;
		services: string[];
	}>;

	// Mock store for taskees
	const taskeeStore = writable<{
		items: TaskeeProfile[];
		loading: boolean;
		error: string | null;
		currentPage: number;
		hasMore: boolean;
	}>({
		items: [],
		loading: false,
		error: null,
		currentPage: 1,
		hasMore: false
	});

	// Reactive state for search parameters and UI controls
	let searchQuery = $state('');
	let selectedSkills = $state<string[]>([]);
	let selectedCategory = $state<string | null>(null);
	let selectedService = $state<string | null>(null);
	let isFilterDrawerOpen = $state(false);

	// Store current filter params
	let currentFilters = $state<SearchTaskeesParams>({
		page: 1,
		limit: 20,
		search: undefined,
		skills: undefined
	});

	// Loading states
	let showSkeleton = $state(true);
	let dataLoaded = $state(false);

	// View mode state
	let viewMode = $state<'list' | 'map'>('list');

	// Selected taskee for map display
	let selectedTaskee = $state<TaskeeProfile | null>(null);
	
	// Selected taskee for detail modal
	let selectedTaskeeForModal = $state<TaskeeProfile | null>(null);
	let isDetailModalOpen = $state(false);
	let showFullDescription = $state(false);

	// Theme detection
	let isDarkMode = $state(false);
	let themeObserver: MutationObserver | null = null;

	// All taskees data (mock)
	let allTaskees = $state<TaskeeProfile[]>([]);

	// Filter taskees based on search params
	function filterTaskees(taskees: TaskeeProfile[], params: SearchTaskeesParams): TaskeeProfile[] {
		let filtered = [...taskees];

		// Filter by search query
		if (params.search && params.search.trim().length >= 3) {
			const searchLower = params.search.toLowerCase();
			filtered = filtered.filter((taskee) => {
			const nameMatch = taskee.name?.toLowerCase().includes(searchLower);
			const aboutMatch = taskee.about?.toLowerCase().includes(searchLower);
			const titleMatch = taskee.professionalTitle?.toLowerCase().includes(searchLower);
			const skillsMatch = taskee.skills?.some((skill) => skill.toLowerCase().includes(searchLower));
			return nameMatch || aboutMatch || titleMatch || skillsMatch;
			});
		}

		// Filter by skills
		if (params.skills && params.skills.length > 0) {
			filtered = filtered.filter((taskee) => {
				if (!taskee.skills || taskee.skills.length === 0) return false;
				return params.skills!.some((searchSkill) =>
					taskee.skills!.some((taskeeSkill) =>
						taskeeSkill.toLowerCase().includes(searchSkill.toLowerCase())
					)
				);
			});
		}

		// Filter by professional title
		if (params.professionalTitle) {
			const titleLower = params.professionalTitle.toLowerCase();
			filtered = filtered.filter((taskee) => {
				return taskee.professionalTitle?.toLowerCase().includes(titleLower);
			});
		}

		// Filter by min rating
		if (params.minRating) {
			filtered = filtered.filter((taskee) => {
				return (taskee.rating || 0) >= params.minRating!;
			});
		}

		return filtered;
	}

	// Load mock data
	function loadMockData() {
		if (dataLoaded) return;

		// Simulate API delay
		setTimeout(() => {
			allTaskees = mockTaskees;
			performSearch();
			dataLoaded = true;
			showSkeleton = false;
		}, 500);
	}

	// Perform search with current filters
	function performSearch() {
		taskeeStore.update((state) => ({ ...state, loading: true }));

		const filtered = filterTaskees(allTaskees, currentFilters);
		const limit = currentFilters.limit || 20;
		const page = currentFilters.page || 1;
		const startIndex = (page - 1) * limit;
		const endIndex = startIndex + limit;
		const paginated = filtered.slice(startIndex, endIndex);

		taskeeStore.update((state) => ({
			...state,
			items: page === 1 ? paginated : [...state.items, ...paginated],
			loading: false,
			currentPage: page,
			hasMore: endIndex < filtered.length,
			error: null
		}));
	}

	// Debounce function
	function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
		let timeoutId: ReturnType<typeof setTimeout>;
		return function (...args: Parameters<T>) {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(() => fn.apply(null, args), delay);
		};
	}

	// Debounced function to update search
	const debouncedSearch = debounce(() => {
		const newParams: SearchTaskeesParams = {
			...currentFilters,
			page: 1,
			limit: 20,
			search: searchQuery.trim().length >= 3 ? searchQuery.trim() : undefined,
			skills: selectedSkills.length > 0 ? selectedSkills : undefined
		};

		currentFilters = newParams;
		performSearch();
	}, 500);

	// Handle filter drawer apply
	function handleFilterApply(filters: SearchTaskeesParams) {
		isFilterDrawerOpen = false;
		currentFilters = { ...filters, page: 1, limit: 20 };
		searchQuery = filters.search || '';
		selectedSkills = filters.skills || [];
		performSearch();
	}

	// Clear filters
	function clearFilters() {
		searchQuery = '';
		selectedSkills = [];
		selectedCategory = null;
		selectedService = null;
		currentFilters = {
			page: 1,
			limit: 20,
			search: undefined,
			skills: undefined
		};
		performSearch();
	}

	// Handle category selection
	function selectCategory(categoryId: string) {
		if (selectedCategory === categoryId) {
			selectedCategory = null;
			selectedService = null;
			// Remove category-related skills from filters
			const category = taskeeCategories.find((c) => c.id === categoryId);
			if (category) {
				selectedSkills = selectedSkills.filter(
					(skill) => !category.services.includes(skill)
				);
			}
		} else {
			selectedCategory = categoryId;
			selectedService = null;
		}
		// Update filters and perform search
		currentFilters = {
			...currentFilters,
			skills: selectedSkills.length > 0 ? selectedSkills : undefined,
			page: 1
		};
		performSearch();
	}

	// Handle service selection
	function selectService(serviceName: string) {
		if (selectedService === serviceName) {
			selectedService = null;
		} else {
			selectedService = serviceName;
			// Add service as a skill filter
			if (!selectedSkills.includes(serviceName)) {
				selectedSkills = [...selectedSkills, serviceName];
				currentFilters = {
					...currentFilters,
					skills: selectedSkills,
					page: 1
				};
				performSearch();
			}
		}
	}

	// Load more taskees
	function loadMoreTaskees() {
		if ($taskeeStore.hasMore && !$taskeeStore.loading) {
			currentFilters = {
				...currentFilters,
				page: (currentFilters.page || 1) + 1
			};
			performSearch();
		}
	}

	// Setup infinite scroll
	let scrollTarget = $state<HTMLElement | null>(null);
	let infiniteScrollObserver: IntersectionObserver | null = null;

	function setupInfiniteScroll() {
		if (!browser) return;

		if (infiniteScrollObserver) {
			infiniteScrollObserver.disconnect();
		}

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

	function viewProfile(taskee: TaskeeProfile) {
		if (taskee.npub) {
			goto(getProfileUrl(taskee.npub));
		}
	}

	function selectTaskeeForMap(taskee: TaskeeProfile) {
		selectedTaskee = taskee;
	}
	
	function openTaskeeDetailModal(taskee: TaskeeProfile) {
		selectedTaskeeForModal = taskee;
		showFullDescription = false;
		isDetailModalOpen = true;
	}
	
	function closeTaskeeDetailModal() {
		isDetailModalOpen = false;
		selectedTaskeeForModal = null;
		showFullDescription = false;
	}

	function scrollToTaskeeCard(npub: string) {
		const cardElement = document.querySelector(`[data-taskee-npub="${npub}"]`) as HTMLElement;
		if (cardElement) {
			cardElement.scrollIntoView({
				behavior: 'smooth',
				block: 'center'
			});
		}
	}

	function toggleViewMode() {
		viewMode = viewMode === 'list' ? 'map' : 'list';
	}

	// Helper functions for translations
	function getCategoryTranslation(categoryId: string): string {
		const key = `find_taskees.categories.${categoryId}`;
		try {
			const translated = $t(key);
			// If translation returns the key itself or is empty, use fallback
			if (!translated || translated === key || translated.trim() === '') {
				// Try to get from category data
				const category = taskeeCategories.find((c) => c.id === categoryId);
				return category?.name || categoryId;
			}
			return translated;
		} catch {
			// Fallback to category name
			const category = taskeeCategories.find((c) => c.id === categoryId);
			return category?.name || categoryId;
		}
	}

	// Helper to safely get translations with fallback
	function safeTranslate(key: string, fallback: string): string {
		try {
			const translated = $t(key);
			// svelte-i18n returns the key itself if translation is missing
			// Also check if it's empty or just whitespace
			if (!translated || translated === key || translated.trim() === '' || translated.startsWith('find_taskees.')) {
				return fallback;
			}
			return translated;
		} catch (error) {
			console.warn(`Translation error for key "${key}":`, error);
			return fallback;
		}
	}

	function getSearchPlaceholder(): string {
		if (searchQuery.length > 0 && searchQuery.length < 3) {
			return safeTranslate('find_taskees.search.minimum_chars', 'Type at least 3 characters to search');
		}
		return safeTranslate('find_taskees.search.placeholder', 'Search by name, skills, or profession...');
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

	// Get category icon SVG path (using Heroicons-style paths)
	function getCategoryIcon(iconName: string) {
		const icons: Record<string, string> = {
			'wrench-screwdriver': 'M21.75 6.75a4.5 4.5 0 01-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.684a2.548 2.548 0 11-3.586-3.586l8.684-7.152c.833-.686.995-1.874.904-2.95a4.5 4.5 0 016.336-4.486l-3.776 3.776c.03.242.048.485.048.728zm-4.81 2.646a2.548 2.548 0 003.586 3.586l3.776-3.776a4.5 4.5 0 00-4.486-6.336l-3.776 3.776a2.548 2.548 0 003.586 3.586z',
			drill: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75',
			truck: 'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-9.75c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v9.75c0 .621.504 1.125 1.125 1.125h1.125m-9.75-18H4.875c-.621 0-1.125.504-1.125 1.125v12.75c0 .621.504 1.125 1.125 1.125h4.125m9.75-18v18m0 0v-18m0 18v-18m0 18H9m0 0v-18m0 18v-18',
			broom: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
			tree: 'M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.224 48.224 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.589-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.589-1.202L5.25 4.971z',
			hammer: 'M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655-5.653a2.548 2.548 0 010-3.586 2.548 2.548 0 013.586 0l5.653 4.655M11.42 15.17l-1.42-1.42',
			'paint-roller': 'M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.648 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42',
			flame: 'M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z'
		};
		return icons[iconName] || icons.flame;
	}


	onMount(async () => {
		if (browser) {
			// Load translations for this route
			await loadPageTranslations('/find-taskees');
			
			// Also ensure the namespace is loaded
			const currentLocale = ($locale || 'en') as SupportedLanguage;
			await loadNamespace(currentLocale, 'find_taskees');

			isDarkMode = document.documentElement.classList.contains('dark');
			themeObserver = new MutationObserver(() => {
				isDarkMode = document.documentElement.classList.contains('dark');
			});
			themeObserver.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ['class']
			});

			loadMockData();
			setTimeout(() => setupInfiniteScroll(), 1000);
		}
	});

	$effect(() => {
		if (scrollTarget && browser) {
			setupInfiniteScroll();
		}
		return () => {
			if (infiniteScrollObserver) {
				infiniteScrollObserver.disconnect();
			}
		};
	});
</script>

<div class="mx-auto max-w-6xl p-4 md:p-0">
	<div id="panel-find-taskees" role="tabpanel" aria-labelledby="tab-find-taskees">
		<!-- Search and Filter Controls -->
		<div class="mb-4">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
				<!-- Search Input -->
				<div class="relative flex-1">
					<input
						type="text"
						class={getSearchInputClass()}
						placeholder={getSearchPlaceholder()}
						bind:value={searchQuery}
						oninput={debouncedSearch}
						aria-label={safeTranslate('find_taskees.search.input_label', 'Search taskees')}
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

				<!-- Filter Buttons -->
				<div class="flex items-center gap-2">
					<button class="btn btn-sm btn-primary" onclick={() => (isFilterDrawerOpen = true)}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mr-1 h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
							/>
						</svg>
						{safeTranslate('find_taskees.filters.title', 'Filters')}
					</button>
					{#if searchQuery || selectedSkills.length > 0 || selectedCategory}
						<button class="btn btn-sm btn-ghost" onclick={clearFilters}>
							{safeTranslate('find_taskees.filters.clear', 'Clear Filters')}
						</button>
					{/if}
				</div>
			</div>
		</div>

		<!-- Service Categories -->
		<div class="mb-4">
			<div class="flex flex-wrap gap-2 pb-2">
				{#each taskeeCategories as category}
					{@const isSelected = selectedCategory === category.id}
					<button
						class="btn btn-sm gap-2 rounded-full border-2 transition-all"
						class:btn-primary={isSelected}
						class:border-primary={isSelected}
						class:btn-ghost={!isSelected}
						class:border-base-300={!isSelected}
						onclick={() => selectCategory(category.id)}
						aria-label={getCategoryTranslation(category.id)}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 shrink-0"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d={getCategoryIcon(category.icon)}
							/>
						</svg>
						<span class="whitespace-nowrap text-xs font-medium">
							{getCategoryTranslation(category.id)}
						</span>
					</button>
				{/each}
			</div>

			<!-- Service Options for Selected Category -->
			{#if selectedCategory}
				{@const category = taskeeCategories.find((c) => c.id === selectedCategory)}
				{#if category && category.services}
					<div class="mt-3">
						<p class="mb-2 text-xs font-semibold text-base-content/70">
							{safeTranslate('find_taskees.categories.services_title', 'Available Services')}
						</p>
						<div class="flex flex-wrap gap-1.5">
							{#each category.services as service}
								<button
									class="btn btn-xs gap-1 rounded-full whitespace-nowrap"
									class:btn-primary={selectedService === service}
									class:btn-outline={selectedService !== service}
									onclick={() => selectService(service)}
								>
									{service}
								</button>
							{/each}
						</div>
					</div>
				{/if}
			{/if}
		</div>

		<!-- Main Content -->
		{#if viewMode === 'list'}
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
						<span>{safeTranslate('find_taskees.results.error_loading', 'Error loading taskees: {error}. Please try again.').replace('{error}', $taskeeStore.error)}</span>
					</div>
				{/if}

				<!-- Taskee Count -->
				{#if $taskeeStore.items && $taskeeStore.items.length > 0}
					<div class="text-base-content/70 mb-4 text-sm">
						{safeTranslate('find_taskees.results.showing_count', 'Showing {count} taskee{plural}')
							.replace('{count}', String($taskeeStore.items.length))
							.replace('{plural}', $taskeeStore.items.length !== 1 ? 's' : '')}
					</div>
				{/if}

				<div class="lg:flex lg:gap-6">
					<!-- Taskees List -->
					<div class="w-full lg:w-1/2">
						<div class="max-h-[calc(65vh)] overflow-y-auto">
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
							{:else if $taskeeStore.items && $taskeeStore.items.length > 0}
								<div class="space-y-4">
									{#each $taskeeStore.items as taskee}
										<div
											class="card bg-base-100 cursor-pointer rounded-xl shadow-md transition-shadow hover:shadow-lg"
											class:bg-base-300={selectedTaskee?.npub === taskee.npub}
											onclick={() => openTaskeeDetailModal(taskee)}
											onkeydown={(e) => {
												if (e.key === 'Enter' || e.key === ' ') {
													e.preventDefault();
													openTaskeeDetailModal(taskee);
												}
											}}
											tabindex="0"
											role="button"
											aria-label={safeTranslate('find_taskees.card.view_profile', 'View Profile')}
											data-taskee-npub={taskee.npub}
										>
											<div class="card-body p-4">
												<!-- Top Row: Avatar + Name + Username + Hourly Rate -->
												<div class="mb-3 flex items-start gap-2 sm:gap-3">
													<div class="hidden sm:block">
														<Avatar name={taskee.name} picture={taskee.picture} size="lg" />
													</div>
													<div class="block sm:hidden">
														<Avatar name={taskee.name} picture={taskee.picture} size="md" />
													</div>
													<div class="flex-1 min-w-0 flex items-start justify-between gap-2">
														<div class="flex-1 min-w-0">
															<div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
																<h3 class="card-title line-clamp-1 text-base font-semibold sm:text-lg">
																	{taskee.name || safeTranslate('find_taskees.card.anonymous', 'Anonymous User')}
																</h3>
															</div>
															{#if taskee.professionalTitle}
																<p class="text-base-content/70 text-xs sm:text-sm">{taskee.professionalTitle}</p>
															{/if}
														</div>
														<!-- Hourly Rate - Right aligned -->
														{#if taskee.hourlyRate !== undefined}
															<div class="flex shrink-0 flex-col items-end gap-0.5">
																<span class="text-base font-bold text-primary sm:text-lg">
																	${taskee.hourlyRate}
																</span>
																<span class="text-base-content/60 text-xs">
																	{safeTranslate('find_taskees.card.per_hour', 'per hour')}
																</span>
															</div>
														{/if}
													</div>
												</div>

												<!-- Stats Row: Rating, Reviews, Skill Score, Completion Rate -->
												<div class="mb-3 flex flex-wrap items-center gap-3 text-xs sm:gap-4 sm:text-sm">
													<!-- Rating -->
													{#if taskee.rating !== undefined}
														<div class="flex items-center gap-1">
															<div class="flex">
																{#each Array(5) as _, i}
																	<svg
																		xmlns="http://www.w3.org/2000/svg"
																		class="h-4 w-4 {i < Math.floor(taskee.rating || 0)
																			? 'text-yellow-400'
																			: 'text-base-content/30'}"
																		fill="currentColor"
																		viewBox="0 0 24 24"
																	>
																		<path
																			d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
																		/>
																	</svg>
																{/each}
															</div>
															<span class="font-semibold">{taskee.rating.toFixed(1)}</span>
														</div>
													{/if}

													<!-- Reviews -->
													{#if taskee.reviews !== undefined}
														<div class="text-base-content/70">
															{taskee.reviews} {safeTranslate('find_taskees.card.reviews', 'Reviews')}
														</div>
													{/if}

													<!-- Completion Rate -->
													{#if taskee.completionRate !== undefined}
														<div class="flex items-center gap-1">
															<svg
																xmlns="http://www.w3.org/2000/svg"
																class="h-4 w-4 text-success"
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
															<span class="font-semibold">{taskee.completionRate}%</span>
														</div>
													{/if}
												</div>

												<!-- Location -->
												{#if taskee.location}
													<div class="mb-3 flex items-center gap-2 text-xs sm:text-sm">
														<span class="text-base-content/70">
															{taskee.location.city}
															{#if taskee.location.country}, {taskee.location.country}{/if}
														</span>
													</div>
												{/if}

												<!-- About Section -->
												{#if taskee.about}
													<p class="text-base-content/80 mb-3 line-clamp-2 text-xs sm:text-sm">
														{taskee.about}
													</p>
												{/if}

												<!-- Skills Section -->
												{#if taskee.skills && taskee.skills.length > 0}
													<div class="mb-3">
														<div class="mb-1.5 text-xs font-semibold text-base-content/70">
															{safeTranslate('find_taskees.card.skills_label', 'Skills')}
														</div>
														<div class="flex flex-wrap gap-1.5">
															{#each taskee.skills.slice(0, 2) as skill}
																<span class="inline-flex max-w-[30%] items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary truncate">
																	{skill}
																</span>
															{/each}
															{#if taskee.skills.length > 2}
																<span class="inline-flex items-center rounded-md bg-base-300 px-2 py-0.5 text-xs font-medium text-base-content/60">
																	+{taskee.skills.length - 2}
																</span>
															{/if}
														</div>
													</div>
												{/if}

												<!-- Bottom Row: Action Buttons -->
												<div class="mt-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
													<button
														class="btn btn-primary btn-sm flex-1 sm:flex-none"
														onclick={(e) => {
															e.stopPropagation();
															viewProfile(taskee);
														}}
														aria-label={safeTranslate('find_taskees.card.view_profile', 'View Profile')}
													>
														{safeTranslate('find_taskees.card.view_profile', 'View Profile')}
													</button>
												</div>
											</div>
										</div>
									{/each}
								</div>

								<!-- Infinite Scroll Target -->
								<div bind:this={scrollTarget} class="h-4"></div>
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
									<h3 class="mb-2 text-lg font-semibold">{safeTranslate('find_taskees.results.no_results_title', 'No taskees found')}</h3>
									<p class="text-base-content/70 mb-3">{safeTranslate('find_taskees.results.no_results_message', 'Try adjusting your search criteria or filters')}</p>
									<button class="btn btn-primary" onclick={clearFilters}>
										{safeTranslate('find_taskees.filters.clear', 'Clear Filters')}
									</button>
								</div>
							{/if}
						</div>
					</div>

					<!-- Desktop Map Sidebar -->
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

				<!-- Mobile Floating Button - Show Map -->
				<button
					class="inverted-colors fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 transform items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg transition-all duration-200 hover:shadow-xl lg:hidden"
					onclick={toggleViewMode}
					title={safeTranslate('find_taskees.view.map', 'View Map')}
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
					{safeTranslate('find_taskees.view.map', 'View Map')}
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
					aria-label={safeTranslate('find_taskees.view.list', 'View List')}
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
					<span class="text-xs">{safeTranslate('find_taskees.view.list', 'View List')}</span>
				</button>
			</div>
		{/if}
	</div>
</div>

<!-- Filter Drawer Component -->
<TaskeeFilterDrawer
	isOpen={isFilterDrawerOpen}
	onClose={() => (isFilterDrawerOpen = false)}
	onApply={handleFilterApply}
	initialFilters={currentFilters}
/>

<!-- Taskee Detail Modal -->
{#if selectedTaskeeForModal}
	{@const taskee = selectedTaskeeForModal}
	<Modal
		isOpen={isDetailModalOpen}
		onClose={closeTaskeeDetailModal}
		title={safeTranslate('find_taskees.modal.title', 'Taskee Details')}
		size="lg"
		isScrollable={true}
	>
		{#snippet children()}
			<div class="space-y-4">
				<!-- Header Section -->
				<div class="flex items-start gap-3">
					<Avatar name={taskee.name} picture={taskee.picture} size="lg" />
					<div class="flex-1 min-w-0 flex items-start justify-between gap-2">
						<div class="flex-1 min-w-0">
							<div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
								<h3 class="text-lg font-bold">
									{taskee.name || safeTranslate('find_taskees.card.anonymous', 'Anonymous User')}
								</h3>
							</div>
							{#if taskee.professionalTitle}
								<p class="text-base-content/70 text-xs mt-1">{taskee.professionalTitle}</p>
							{/if}
						</div>
						<!-- Hourly Rate - Right aligned -->
						{#if taskee.hourlyRate !== undefined}
							<div class="flex shrink-0 flex-col items-end gap-0.5">
								<span class="text-base font-bold text-primary sm:text-lg">
									${taskee.hourlyRate}
								</span>
								<span class="text-base-content/60 text-xs">
									{safeTranslate('find_taskees.card.per_hour', 'per hour')}
								</span>
							</div>
						{/if}
					</div>
				</div>

				<!-- Location with Stats -->
				<div class="flex flex-wrap items-center gap-3 text-xs">
					<!-- Location -->
					{#if taskee.location}
						<div class="flex items-center gap-2">
							<span class="text-base-content/70">
								{taskee.location.city}
								{#if taskee.location.country}, {taskee.location.country}{/if}
							</span>
						</div>
					{/if}

					<!-- Rating -->
					{#if taskee.rating !== undefined}
						<div class="flex items-center gap-1">
							<div class="flex">
								{#each Array(5) as _, i}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5 {i < Math.floor(taskee.rating || 0)
											? 'text-yellow-400'
											: 'text-base-content/30'}"
										fill="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
										/>
									</svg>
								{/each}
							</div>
							<span class="font-semibold">{taskee.rating.toFixed(1)}</span>
						</div>
					{/if}

					<!-- Reviews -->
					{#if taskee.reviews !== undefined}
						<div class="text-base-content/70">
							{taskee.reviews} {safeTranslate('find_taskees.card.reviews', 'Reviews')}
						</div>
					{/if}

					<!-- Completion Rate -->
					{#if taskee.completionRate !== undefined}
						<div class="flex items-center gap-1">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5 text-success"
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
							<span class="font-semibold">{taskee.completionRate}%</span>
						</div>
					{/if}
				</div>

				<!-- About Section with Show More/Less -->
				{#if taskee.about}
					<div>
						<h4 class="mb-2 text-xs font-semibold text-base-content/70">
							{safeTranslate('find_taskees.card.about', 'About')}
						</h4>
						<div class="text-base-content/80 text-xs">
							{#if showFullDescription || taskee.about.length <= 200}
								<p>{taskee.about}</p>
							{:else}
								<p>{taskee.about.slice(0, 200)}...</p>
							{/if}
							{#if taskee.about.length > 200}
								<button
									class="btn btn-ghost btn-xs mt-2 text-primary"
									onclick={() => (showFullDescription = !showFullDescription)}
								>
									{showFullDescription
										? safeTranslate('find_taskees.card.show_less', 'Show Less')
										: safeTranslate('find_taskees.card.show_more', 'Show More')}
								</button>
							{/if}
						</div>
					</div>
				{/if}

				<!-- All Skills Section -->
				{#if taskee.skills && taskee.skills.length > 0}
					{@const maxSkillsToShow = 3}
					{@const skillsToShow = taskee.skills.slice(0, maxSkillsToShow)}
					{@const remainingSkills = taskee.skills.length - maxSkillsToShow}
					<div>
						<h4 class="mb-2 text-xs font-semibold text-base-content/70">
							{safeTranslate('find_taskees.card.skills_label', 'Skills')}
						</h4>
						<div class="flex flex-wrap gap-1.5">
							{#each skillsToShow as skill}
								<span class="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
									{skill}
								</span>
							{/each}
							{#if remainingSkills > 0}
								<span class="inline-flex items-center rounded-md bg-base-300 px-2 py-1 text-xs font-medium text-base-content/60">
									+{remainingSkills}
								</span>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Action Buttons -->
				<div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
					<button
						class="btn btn-primary flex-1 sm:flex-none"
						onclick={() => {
							closeTaskeeDetailModal();
							viewProfile(taskee);
						}}
					>
						{safeTranslate('find_taskees.card.view_profile', 'View Profile')}
					</button>
				</div>
			</div>
		{/snippet}
	</Modal>
{/if}

<style>
	:global([name='gmp-internal-google-attribution']),
	:global([name='gmp-internal-dialog']) {
		display: none !important;
	}
</style>
