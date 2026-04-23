<script lang="ts">
	import { t, locale } from 'svelte-i18n';
	import { profileStore } from '$lib/stores/profile.store';
	import { formatDate } from '$lib/utils/helpers/dateFormatter';

	let descriptionElement = $state<HTMLElement | null>(null);
	let isDescriptionTruncated = $state(false);
	let showFullDescription = $state(false);

	// Carousel state for portfolio items
	let projectImageSlides = $state<Record<string, number>>({});

	function toggleDescription() {
		showFullDescription = !showFullDescription;
	}

	function checkTruncation() {
		if (descriptionElement) {
			isDescriptionTruncated = descriptionElement.scrollHeight > descriptionElement.clientHeight;
		}
	}

	$effect(() => {
		if ($profileStore.data) {
			checkTruncation();
		}
	});

	// Helper function to get translated profile content
	function getTranslatedProfileContent(field: 'about' | 'name' | 'headline'): string {
		const data = $profileStore.data;
		if (!data) return '';

		const currentLang = $locale || 'en';
		const originalText = data[field] || '';

		// If no translations, return original
		if (!data.translations) {
			return originalText;
		}

		// If current language is source language, return original
		if (data.translations.sourceLanguage === currentLang) {
			return originalText;
		}

		// Get translation for current language
		const translation = data.translations.translations[currentLang];
		if (translation) {
			return translation[field] || originalText;
		}

		// Fallback to original
		return originalText;
	}

	// Helper function to get translated skill name
	function getTranslatedSkillName(
		skill: string | { name: string; translations?: Record<string, unknown> }
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
		const translations = skill.translations.translations as Record<string, { name?: string }>;
		const translation = translations[currentLang];
		if (translation) {
			return translation.name || originalName;
		}

		// Fallback to original
		return originalName;
	}

	// Helper function to get translated portfolio title
	function getTranslatedPortfolioTitle(item: {
		title: string;
		translations?: Record<string, unknown>;
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
		const translations = item.translations.translations as Record<string, { title?: string }>;
		const translation = translations[currentLang];
		if (translation) {
			return translation.title || originalTitle;
		}

		// Fallback to original
		return originalTitle;
	}

	// Helper function to get translated portfolio description
	function getTranslatedPortfolioDescription(item: {
		description: string;
		translations?: Record<string, unknown>;
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
		const translations = item.translations.translations as Record<string, { description?: string }>;
		const translation = translations[currentLang];
		if (translation) {
			return translation.description || originalDescription;
		}

		// Fallback to original
		return originalDescription;
	}

	function nextProjectImage(itemId: string, totalImages: number) {
		const currentIndex = projectImageSlides[itemId] || 0;
		projectImageSlides[itemId] = (currentIndex + 1) % totalImages;
		projectImageSlides = { ...projectImageSlides };
	}

	function prevProjectImage(itemId: string, totalImages: number) {
		const currentIndex = projectImageSlides[itemId] || 0;
		projectImageSlides[itemId] = (currentIndex - 1 + totalImages) % totalImages;
		projectImageSlides = { ...projectImageSlides };
	}

	function goToProjectImage(itemId: string, index: number) {
		projectImageSlides[itemId] = index;
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
			<h3 class="text-md mb-4 line-clamp-1 font-semibold">{$t('profile.about')}</h3>
			{#if $profileStore.data.about}
				<p
					bind:this={descriptionElement}
					class="text-base-content/70 whitespace-pre-line {showFullDescription
						? ''
						: 'line-clamp-2'}"
					style="word-break: break-word; overflow-wrap: anywhere;"
				>
					{getTranslatedProfileContent('about')}
				</p>
				{#if isDescriptionTruncated}
					<button class="btn btn-xs btn-ghost mt-1" onclick={toggleDescription}>
						{showFullDescription ? $t('common.show_less') : $t('common.show_more')}
					</button>
				{/if}
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
					{#each $profileStore.data.certifications as cert (cert.name)}
						<div class="card bg-base-200 flex flex-row items-center justify-start rounded-xl">
							<img src={cert.fileUrl} alt={cert.name} class="h-full w-20 rounded-lg object-cover" />
							<div class="card-body p-4">
								<div class="flex items-start justify-between">
									<h4 class="card-title text-base">{cert.name}</h4>
								</div>
								<p class="text-base-content/70 text-sm">{cert.issuer}</p>
								<p class="text-sm">
									<span class="text-base-content/70">{$t('profile.since')} </span>
									{formatDate(cert.date)}
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
					{#each $profileStore.data.portfolio as item (item.title)}
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
											{#each item.images as image, imgIndex (image.url)}
												<div class="w-full shrink-0">
													<img
														src={image.url}
														alt={image.alt || `${item.title} - ${imgIndex + 1}`}
														class="h-48 w-full object-cover"
													/>
												</div>
											{/each}
										</div>

										<!-- Controles de navigation de imágenes (solo si hay más de una) -->
										{#if hasMultipleImages}
											<!-- Botón anterior -->
											<button
												onclick={() => prevProjectImage(itemId, totalImages)}
												class="btn btn-circle absolute top-1/2 left-4 z-20 -translate-y-1/2 border-2 border-white/50 bg-black/80 text-white shadow-xl backdrop-blur-sm hover:bg-black"
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
												class="btn btn-circle absolute top-1/2 right-4 z-20 -translate-y-1/2 border-2 border-white/50 bg-black/80 text-white shadow-xl backdrop-blur-sm hover:bg-black"
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
												{#each item.images as image, imgIndex (image.url)}
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
	{:else if $profileStore.error}
		<div class="alert alert-error alert-outline">
			<span>{$t('profile.loadError')}</span>
		</div>
	{/if}
</div>
