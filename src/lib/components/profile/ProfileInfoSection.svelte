<script lang="ts">
	import { profileStore } from '$lib/stores/profile.store';
	import { t, locale } from 'svelte-i18n';
	import { formatTime12Hour } from '$lib/utils/helpers/dateFormatter';
	import { onMount } from 'svelte';

	// Helper function to get translated profile content
	// Reactive to locale changes via $locale
	function getTranslatedProfileContent(field: 'professionalTitle' | 'about'): string {
		const currentLang = $locale || 'en';
		const originalText = $profileStore.data?.[field] || '';

		// If no translations, return original
		if (!$profileStore.data?.translations) {
			return originalText;
		}

		// If current language is source language, return original
		if ($profileStore.data.translations.sourceLanguage === currentLang) {
			return originalText;
		}

		// Get translation for current language
		const translation = $profileStore.data.translations.translations[currentLang];
		if (translation) {
			return translation[field] || originalText;
		}

		// Fallback to original
		return originalText;
	}

	// Helper function to get translated skill name
	function getTranslatedSkillName(
		skill:
			| string
			| {
					name: string;
					translations?: {
						sourceLanguage?: string;
						translations?: Record<string, { name?: string; title?: string; description?: string }>;
					};
			  }
	): string {
		const currentLang = $locale || 'en';

		// If skill is a string, return as is
		if (typeof skill === 'string') {
			return skill;
		}

		const originalName = skill.name || '';

		// If no translations, return original
		if (!skill.translations) {
			return originalName;
		}

		// If current language is source language, return original
		if (skill.translations.sourceLanguage === currentLang) {
			return originalName;
		}

		// Get translation for current language
		const translation = skill.translations.translations?.[currentLang];
		if (translation) {
			return translation.name || originalName;
		}

		// Fallback to original
		return originalName;
	}

	// Helper function to get translated portfolio title
	function getTranslatedPortfolioTitle(item: {
		title: string;
		translations?: {
			sourceLanguage?: string;
			translations?: Record<string, { name?: string; title?: string; description?: string }>;
		};
	}): string {
		const currentLang = $locale || 'en';
		const originalTitle = item.title || '';

		// If no translations, return original
		if (!item.translations) {
			return originalTitle;
		}

		// If current language is source language, return original
		if (item.translations.sourceLanguage === currentLang) {
			return originalTitle;
		}

		// Get translation for current language
		const translation = item.translations.translations?.[currentLang];
		if (translation) {
			return translation.title || originalTitle;
		}

		// Fallback to original
		return originalTitle;
	}

	// Helper function to get translated portfolio description
	function getTranslatedPortfolioDescription(item: {
		description: string;
		translations?: {
			sourceLanguage?: string;
			translations?: Record<string, { name?: string; title?: string; description?: string }>;
		};
	}): string {
		const currentLang = $locale || 'en';
		const originalDescription = item.description || '';

		// If no translations, return original
		if (!item.translations) {
			return originalDescription;
		}

		// If current language is source language, return original
		if (item.translations.sourceLanguage === currentLang) {
			return originalDescription;
		}

		// Get translation for current language
		const translation = item.translations.translations?.[currentLang];
		if (translation) {
			return translation.description || originalDescription;
		}

		// Fallback to original
		return originalDescription;
	}

	// Format time slot
	function formatTimeSlot(start: string, end: string): string {
		return `${formatTime12Hour(start)} - ${formatTime12Hour(end)}`;
	}

	function getDaySchedule(
		timeSlots: Array<{ day: number; start: string; end: string }>,
		dayNumber: number
	) {
		const slot = timeSlots.find((slot) => slot.day === dayNumber);
		return slot
			? { available: true, hours: formatTimeSlot(slot.start, slot.end) }
			: { available: false };
	}

	function getNextAvailable(
		timeSlots: Array<{ day: number; start: string; end: string }>,
		noticeHours: number
	): string | null {
		if (!timeSlots.length) return null;
		const now = new Date();
		const noticeMs = noticeHours * 60 * 60 * 1000;
		const earliestPossibleTime = new Date(now.getTime() + noticeMs);
		const sortedSlots = [...timeSlots].sort((a, b) => {
			if (a.day === b.day) return a.start.localeCompare(b.start);
			return a.day - b.day;
		});
		function getNextDay(targetDay: number): Date {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const result = new Date(now);
			result.setHours(0, 0, 0, 0);
			const currentDay = result.getDay();
			const daysToAdd = (targetDay - currentDay + 7) % 7;
			result.setDate(result.getDate() + daysToAdd);
			return result;
		}
		for (let i = 0; i < 14; i++) {
			for (const slot of sortedSlots) {
				const slotDate = getNextDay(slot.day);
				if (i > 0) slotDate.setDate(slotDate.getDate() + 7);
				const [hours, minutes] = slot.start.split(':').map(Number);
				slotDate.setHours(hours, minutes, 0, 0);
				if (slotDate > earliestPossibleTime) return slotDate.toISOString();
			}
		}
		return null;
	}

	let schedule = $derived(() => {
		if (!$profileStore.data?.availability?.timeSlots) return {};
		const weekSchedule: Record<string, { available: boolean; hours?: string; label: string }> = {};
		const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
		dayKeys.forEach((dayKey, index) => {
			const scheduleData = getDaySchedule($profileStore.data!.availability!.timeSlots, index);
			weekSchedule[dayKey] = { ...scheduleData, label: $t(`days.${dayKey}`) };
		});
		return weekSchedule;
	});

	let nextAvailable = $derived(() => {
		const availability = $profileStore.data?.availability;
		if (!availability?.timeSlots?.length) return null;
		return getNextAvailable(availability.timeSlots, availability.noticeHours);
	});

	let { formatDate } = $props<{
		formatDate: (date: string) => string;
	}>();

	// State for expandable description
	let descriptionElement: HTMLParagraphElement | null = $state(null);
	let isDescriptionTruncated = $state(false);
	let showFullDescription = $state(false);

	// Estado para el carrusel de imágenes de cada proyecto
	let projectImageSlides = $state<Record<string, number>>({});

	// Check if description is actually truncated
	function checkIfTruncated() {
		if (!descriptionElement) return;

		// Create a hidden clone to measure full height without affecting layout
		const clone = descriptionElement.cloneNode(true) as HTMLElement;
		clone.style.position = 'absolute';
		clone.style.visibility = 'hidden';
		clone.style.maxHeight = 'none';
		clone.style.height = 'auto';
		clone.style.width = descriptionElement.offsetWidth + 'px';
		clone.style.whiteSpace = 'pre-line';
		document.body.appendChild(clone);

		const fullHeight = clone.scrollHeight;
		// max-h-[6rem] = 96px (~4 lines)
		const maxHeight = 96;

		document.body.removeChild(clone);

		isDescriptionTruncated = fullHeight > maxHeight + 1;
	}

	// Initialize on mount
	onMount(() => {
		if (descriptionElement) {
			requestAnimationFrame(() => {
				checkIfTruncated();
			});
		}
	});

	// React to description and locale changes
	$effect(() => {
		const currentDescription = getTranslatedProfileContent('about');

		if (descriptionElement && currentDescription) {
			showFullDescription = false;
			isDescriptionTruncated = false;

			requestAnimationFrame(() => {
				checkIfTruncated();
			});
		}
	});

	function toggleDescription() {
		showFullDescription = !showFullDescription;
	}

	// Funciones para el carrusel de imágenes de cada proyecto
	function nextProjectImage(itemId: string, totalImages: number) {
		if (totalImages > 1) {
			const currentIndex = projectImageSlides[itemId] || 0;
			const nextIndex = (currentIndex + 1) % totalImages;
			projectImageSlides[itemId] = nextIndex;
			projectImageSlides = { ...projectImageSlides };
		}
	}

	function prevProjectImage(itemId: string, totalImages: number) {
		if (totalImages > 1) {
			const currentIndex = projectImageSlides[itemId] || 0;
			const prevIndex = (currentIndex - 1 + totalImages) % totalImages;
			projectImageSlides[itemId] = prevIndex;
			projectImageSlides = { ...projectImageSlides };
		}
	}

	function goToProjectImage(itemId: string, imageIndex: number) {
		projectImageSlides[itemId] = imageIndex;
		projectImageSlides = { ...projectImageSlides };
	}
</script>

<!-- Profile Info Section -->
<div class="mb-8 flex-1">
	{#if $profileStore.isLoading}
		<div class="space-y-6">
			<div class="animate-pulse space-y-4">
				<div class="bg-base-300 h-6 w-48 rounded"></div>
				<div class="bg-base-300 h-4 w-full rounded"></div>
				<div class="bg-base-300 h-4 w-3/4 rounded"></div>
			</div>
		</div>
	{:else if $profileStore.data}
		<!-- About -->
		<div class="mb-8">
			<h3 class="mb-4 text-xl font-semibold">{$t('profile.about')}</h3>
			{#if $profileStore.data.about}
				<div class="relative">
					<div
						class="relative overflow-hidden transition-[max-height] duration-300 ease-out {showFullDescription
							? 'max-h-[50rem]'
							: 'max-h-[6rem]'}"
					>
						<p
							bind:this={descriptionElement}
							class="text-base-content/70 whitespace-pre-line"
							style="word-break: break-word; overflow-wrap: anywhere;"
						>
							{getTranslatedProfileContent('about')}
						</p>
						{#if isDescriptionTruncated}
							<div
								class="from-base-100 pointer-events-none absolute right-0 bottom-0 left-0 h-8 bg-gradient-to-t to-transparent transition-opacity duration-300 {showFullDescription
									? 'opacity-0'
									: 'opacity-100'}"
							></div>
						{/if}
					</div>
					{#if isDescriptionTruncated}
						<button
							class="text-primary relative z-10 mt-2 text-[10px] font-black tracking-wider uppercase"
							onclick={toggleDescription}
						>
							{showFullDescription ? $t('common.show_less') : $t('common.show_more')}
						</button>
					{/if}
				</div>
			{:else}
				<p class="text-base-content/70 line-clamp-2">{$t('profile.noDescription')}</p>
			{/if}
		</div>

		<!-- Skills Section -->
		<div class="mb-8">
			<h3 class="mb-6 text-xl font-semibold">{$t('profile.skills.title')}</h3>
			{#if $profileStore.data.skills && $profileStore.data.skills.length > 0}
				<div class="flex flex-wrap gap-2">
					{#each $profileStore.data.skills as skill (typeof skill === 'string' ? skill : skill.name)}
						<div class="border-primary text-primary rounded-full border px-3 py-1 text-sm">
							{getTranslatedSkillName(skill)}
						</div>
					{/each}
				</div>
			{:else}
				<div class="alert alert-outline rounded-xl">
					<span>{$t('profile.noSkills')}</span>
				</div>
			{/if}
		</div>

		<!-- Certifications Section -->
		<div class="mb-8">
			<h3 class="mb-4 text-xl font-semibold">{$t('profile.certifications')}</h3>
			{#if $profileStore.data.certifications && $profileStore.data.certifications.length > 0}
				<div class="grid grid-cols-1 gap-3 md:grid-cols-3">
					{#each $profileStore.data.certifications as cert (cert.fileUrl || cert.name)}
						<div class="card bg-base-200 flex flex-row items-center justify-start rounded-xl">
							<img
								src={cert.fileUrl}
								alt={cert.name}
								class="h-full w-16 rounded-lg object-cover sm:w-20"
							/>
							<div class="card-body p-4">
								<div class="flex items-start justify-between">
									<h4 class="card-title text-base">{cert.name}</h4>
									<!-- {#if cert.verified}
										<div class="badge badge-success">{$t('profile.verified')}</div>
									{:else}
										<div class="badge badge-warning text-black">{$t('profile.unverified')}</div>
									{/if} -->
								</div>
								<p class="text-base-content/70 text-sm">{cert.issuer}</p>
								<p class="text-sm">
									<span class="text-base-content/70">{$t('profile.since')} </span>
									{formatDate(cert.date)}
									<!-- <span class="text-base-content/70"
										>({yearsFrom(cert.date)} {$t('profile.years')})</span
									> -->
								</p>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="alert alert-outline rounded-xl">
					<span>{$t('profile.noCertifications')}</span>
				</div>
			{/if}
		</div>

		<!-- Portfolio Section -->
		<div class="mb-8">
			<h3 class="mb-4 text-xl font-semibold">{$t('profile.portfolio.title')}</h3>
			{#if $profileStore.data.portfolio && $profileStore.data.portfolio.length > 0}
				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
					{#each $profileStore.data.portfolio as item (item.id || item.title)}
						<div class="card bg-base-200 rounded-xl">
							<div class="card-body p-4">
								<div class="mb-2 flex items-center justify-between gap-2">
									<h4 class="card-title text-md line-clamp-1 font-bold">
										{getTranslatedPortfolioTitle(item)}
									</h4>
									{#if item?.link}
										<a
											href={item.link}
											target="_blank"
											rel="noopener noreferrer"
											class="btn btn-xs btn-outline shrink-0"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="mr-1 h-4 w-4"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												stroke-width="2"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
												/>
											</svg>
											{$t('profile.portfolio.visit_project')}
										</a>
									{/if}
								</div>
								<p class="my-2 line-clamp-4">{getTranslatedPortfolioDescription(item)}</p>
								<!-- Skills badges -->
								{#if item.skills && item.skills.length > 0}
									<div class="mb-2 flex flex-wrap gap-1">
										{#each item.skills as skill (skill)}
											<span class="badge badge-info badge-outline badge-sm">
												{skill}
											</span>
										{/each}
									</div>
								{/if}
								{#if item.images && item.images.length > 0}
									{@const itemId = item.id || `portfolio-${item.title}`}
									{@const currentImageIndex = projectImageSlides[itemId] || 0}
									{@const totalImages = item.images.length}
									{@const hasMultipleImages = totalImages > 1}

									<!-- Carrusel de imágenes del proyecto -->
									<div class="relative overflow-hidden rounded-lg">
										<div
											class="flex transition-transform duration-500 ease-in-out"
											style="transform: translateX(-{currentImageIndex * 100}%)"
										>
											{#each item.images as image, imgIndex (image.url || imgIndex)}
												<div class="w-full shrink-0">
													<img
														src={image.url}
														alt={image.alt || `${item.title} - ${imgIndex + 1}`}
														class="h-48 w-full object-cover"
													/>
												</div>
											{/each}
										</div>

										<!-- Controles de navegación de imágenes (solo si hay más de una) -->
										{#if hasMultipleImages}
											<!-- Botón anterior -->
											<button
												onclick={() => prevProjectImage(itemId, totalImages)}
												class="btn btn-circle absolute top-1/2 left-4 z-20 min-h-[44px] min-w-[44px] -translate-y-1/2 border-2 border-white/50 bg-black/80 text-white shadow-xl backdrop-blur-sm hover:bg-black"
												aria-label="Previous image"
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-6 w-6"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
													stroke-width="3"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M15 19l-7-7 7-7"
													/>
												</svg>
											</button>

											<!-- Botón siguiente -->
											<button
												onclick={() => nextProjectImage(itemId, totalImages)}
												class="btn btn-circle absolute top-1/2 right-4 z-20 min-h-[44px] min-w-[44px] -translate-y-1/2 border-2 border-white/50 bg-black/80 text-white shadow-xl backdrop-blur-sm hover:bg-black"
												aria-label="Next image"
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-6 w-6"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
													stroke-width="3"
												>
													<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
												</svg>
											</button>

											<!-- Indicadores de imágenes -->
											<div class="absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 gap-1">
												{#each item.images as _, imgIndex (imgIndex)}
													<button
														onclick={() => goToProjectImage(itemId, imgIndex)}
														class="h-2 w-2 rounded-full transition-all duration-300 {currentImageIndex ===
														imgIndex
															? 'w-6 bg-white'
															: 'bg-white/50'}"
														aria-label="Go to image {imgIndex + 1}"
													></button>
												{/each}
											</div>
										{/if}
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="alert alert-outline rounded-xl">
					<span>{$t('profile.noPortfolio')}</span>
				</div>
			{/if}
		</div>

		<!-- Availability Card -->
		<div class="card bg-base-200 mb-6 rounded-xl">
			<div class="card-body px-4 py-2">
				<div class="collapse-arrow collapse rounded-none bg-transparent p-0">
					<input type="checkbox" />
					<h3 class="collapse-title card-title p-0 text-lg">
						{$t('profile_availability.availabilityTitle')}
					</h3>
					<div class="collapse-content p-0">
						{#if $profileStore.data.availability}
							<div class="mt-2">
								<p class="font-medium">{$t('profile_availability.weeklySchedule')}</p>
								<div class="mt-2 space-y-2">
									{#each Object.entries(schedule()) as [_day, scheduleData] (_day)}
										<div class="border-base-300 flex items-center justify-between border-b py-1">
											<span class="capitalize">{scheduleData.label}</span>
											<span>
												{#if scheduleData.available}
													{scheduleData.hours}
												{:else}
													<span class="text-base-content/50"
														>{$t('profile_availability.unavailable')}</span
													>
												{/if}
											</span>
										</div>
									{/each}
								</div>
							</div>
							<div class="divider"></div>
							<div class="flex items-center justify-between">
								{#if nextAvailable()}
									<div>
										<p class="font-medium">{$t('profile_availability.nextAvailable')}</p>
										<p class="text-primary">{formatDate(nextAvailable())}</p>
									</div>
								{/if}
								<div>
									<p class="font-medium">{$t('profile_availability.timezone')}</p>
									<p class="text-base-content/70">
										{$profileStore.data.availability?.timezone ||
											Intl.DateTimeFormat().resolvedOptions().timeZone}
									</p>
								</div>
							</div>
							<div class="divider"></div>
							<div class="space-y-2 text-sm">
								<div class="border-base-300 border-b pb-2">
									<p class="font-medium">{$t('profile_availability.noticeRequired')}</p>
									<p class="text-base-content/70">
										{$profileStore.data.availability.noticeHours}
										{$t('profile_availability.hours')}
									</p>
								</div>
								<div class="border-base-300 border-b pb-2">
									<p class="font-medium">{$t('profile_availability.maxBookingsPerDay')}</p>
									<p class="text-base-content/70">
										{$profileStore.data.availability.maxBookingsPerDay}
									</p>
								</div>
								<div class="border-base-300 border-b pb-2">
									<p class="font-medium">{$t('profile_availability.breakBetweenBookings')}</p>
									<p class="text-base-content/70">
										{$profileStore.data.availability.breakBetweenBookings}
										{$t('profile_availability.minutes')}
									</p>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{:else if $profileStore.error}
		<div class="alert alert-error alert-outline">
			<span>{$t('profile.loadError')}</span>
		</div>
	{/if}
</div>
