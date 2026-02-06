<script lang="ts">
	import { goto } from '$app/navigation';
	import { profileStore } from '$lib/stores/profile.store';
	import { t, locale } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { getUserDisplayName } from '$lib/utils/helpers/userDisplayName';
	import { ensureAbsoluteVerificationUrl } from '$lib/utils/helpers/verificationUrl';

	function goToEditProfile() {
		goto('/dashboard/profile/edit');
	}

	// Helper function to get translated profile content
	// Reactive to locale changes via $locale
	function getTranslatedProfileContent(
		field: 'professionalTitle' | 'about'
	): string {
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
	function getTranslatedSkillName(skill: string | { name: string; translations?: any }): string {
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
		const translation = skill.translations.translations[currentLang];
		if (translation) {
			return translation.name || originalName;
		}

		// Fallback to original
		return originalName;
	}

	// Helper function to get translated portfolio title
	function getTranslatedPortfolioTitle(item: { title: string; translations?: any }): string {
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
		const translation = item.translations.translations[currentLang];
		if (translation) {
			return translation.title || originalTitle;
		}

		// Fallback to original
		return originalTitle;
	}

	// Helper function to get translated portfolio description
	function getTranslatedPortfolioDescription(item: { description: string; translations?: any }): string {
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
		const translation = item.translations.translations[currentLang];
		if (translation) {
			return translation.description || originalDescription;
		}

		// Fallback to original
		return originalDescription;
	}

	let { formatDate, yearsFrom } = $props<{
		formatDate: (date: string) => string;
		yearsFrom: (date: string) => number;
	}>();

	// State for expandable description
	let descriptionElement: HTMLParagraphElement | null = $state(null);
	let isDescriptionTruncated = $state(false);
	let showFullDescription = $state(false);
	
	// Estado para el carrusel de imágenes de cada proyecto
	let projectImageSlides = $state<Record<string, number>>({});

	// Check if description is actually truncated (same logic as TranslatableTask)
	function checkIfTruncated() {
		if (!descriptionElement) return;
		
		// Create a hidden clone to measure full height without affecting layout
		const clone = descriptionElement.cloneNode(true) as HTMLElement;
		clone.className = descriptionElement.className.replace(/line-clamp-\d+/g, '');
		clone.style.position = 'absolute';
		clone.style.visibility = 'hidden';
		clone.style.height = 'auto';
		clone.style.width = descriptionElement.offsetWidth + 'px';
		clone.style.whiteSpace = 'pre-line'; // Preserve line breaks
		document.body.appendChild(clone);
		
		const fullHeight = clone.scrollHeight;
		const lineHeight = parseFloat(getComputedStyle(descriptionElement).lineHeight) || 20;
		const maxHeight = lineHeight * 2; // 2 lines
		
		// Clean up
		document.body.removeChild(clone);
		
		// Only show ellipsis if content is actually taller than 2 lines
		isDescriptionTruncated = fullHeight > maxHeight + 1; // +1 for small margin
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
			<h3 class="mb-4 text-md line-clamp-1 font-semibold">{$t('profile.about')}</h3>
			{#if $profileStore.data.about}
				<p 
					bind:this={descriptionElement}
					class="text-base-content/70 whitespace-pre-line {showFullDescription ? '' : 'line-clamp-2'}"
					style="word-break: break-word; overflow-wrap: anywhere;"
				>
					{getTranslatedProfileContent('about')}
				</p>
				{#if isDescriptionTruncated}
					<button 
						class="btn btn-xs btn-ghost mt-1" 
						onclick={toggleDescription}
					>
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
					{#each $profileStore.data.skills as skill}
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
					{#each $profileStore.data.certifications as cert}
						<div class="card bg-base-200 flex flex-row items-center justify-start rounded-xl">
							<img src={cert.fileUrl} alt={cert.name} class="h-full w-20 rounded-lg object-cover" />
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
								{#if cert.verificationUrl}
									<a
										href={ensureAbsoluteVerificationUrl(cert.verificationUrl)}
										target="_blank"
										rel="noopener noreferrer"
										class="link link-primary link-hover text-sm"
									>
										{$t('profile.skills.verify_certification')}
									</a>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="alert alert-outline rounded-xl flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<span>{$t('profile.noCertifications')}</span>
					<button
						type="button"
						class="btn btn-primary btn-sm"
						onclick={goToEditProfile}
					>
						{$t('common.add_certifications')}
					</button>
				</div>
			{/if}
		</div>

		<!-- Portfolio Section -->
		<div class="mb-8">
			<h3 class="mb-4 text-xl font-semibold">{$t('profile.portfolio.title')}</h3>
			{#if $profileStore.data.portfolio && $profileStore.data.portfolio.length > 0}
				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
					{#each $profileStore.data.portfolio as item}
						<div class="card bg-base-200 rounded-xl">
							<div class="card-body p-4">
								<div class="flex items-center justify-between gap-2 mb-2">
									<h4 class="card-title text-md line-clamp-1 font-bold">{getTranslatedPortfolioTitle(item)}</h4>
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
									<div class="flex flex-wrap gap-1 mb-2">
										{#each item.skills as skill}
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
											{#each item.images as image, imgIndex}
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
												class="absolute left-4 top-1/2 -translate-y-1/2 btn btn-circle bg-black/80 hover:bg-black border-2 border-white/50 text-white shadow-xl z-20 backdrop-blur-sm"
												aria-label="Previous image"
											>
												<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
													<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
												</svg>
											</button>
											
											<!-- Botón siguiente -->
											<button
												onclick={() => nextProjectImage(itemId, totalImages)}
												class="absolute right-4 top-1/2 -translate-y-1/2 btn btn-circle bg-black/80 hover:bg-black border-2 border-white/50 text-white shadow-xl z-20 backdrop-blur-sm"
												aria-label="Next image"
											>
												<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
													<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
												</svg>
											</button>
											
											<!-- Indicadores de imágenes -->
											<div class="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1 z-20">
												{#each item.images as _, imgIndex}
													<button
														onclick={() => goToProjectImage(itemId, imgIndex)}
														class="h-2 w-2 rounded-full transition-all duration-300 {currentImageIndex === imgIndex
															? 'bg-white w-6'
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

		<!-- Standard Services Section -->
		<div class="mb-8">
			<h3 class="mb-4 text-xl font-semibold">{$t('profile.page.sections.services')}</h3>
			{#if $profileStore.data.standardServices?.services && $profileStore.data.standardServices.services.length > 0}
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					{#each $profileStore.data.standardServices.services as service}
						<div class="card bg-base-200 rounded-xl">
							<div class="card-body p-4">
								<h4 class="card-title text-base">{service.name}</h4>
								{#if service.description}
									<p class="text-base-content/70 text-sm line-clamp-3">{service.description}</p>
								{/if}
								<div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
									<span class="badge badge-outline">
										{service.duration} {$t('profile.services.minutes')}
									</span>
									<span class="font-medium">
										{service.currency === 'Sats'
											? `${service.price} sats`
											: new Intl.NumberFormat(undefined, {
													style: 'currency',
													currency: service.currency || 'USD'
												}).format(service.price)}
									</span>
									{#if service.isCustomizable}
										<span class="badge badge-ghost badge-sm">{$t('profile.services.customizable')}</span>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
				{#if $profileStore.data.standardServices.customQuoteAvailable}
					<p class="text-base-content/70 mt-2 text-sm">{$t('profile.services.custom_quote')}</p>
				{/if}
			{:else}
				<div class="alert alert-outline rounded-xl">
					<span>{$t('profile.services.no_services')}</span>
				</div>
			{/if}
		</div>

		<!-- Reviews Section -->
		<div class="mb-8">
			<h3 class="mb-4 text-xl font-semibold">{$t('profile.reviews')}</h3>
			{#if $profileStore.data.reviews && $profileStore.data.reviews.length > 0}
				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
					{#each $profileStore.data.reviews as review}
						<div class="card bg-base-200">
							<div class="card-body p-4">
								<div class="flex items-start justify-between">
									<div class="flex items-center gap-2">
										<div class="avatar placeholder">
											<div class="bg-neutral text-neutral-content w-8 rounded-full">
												{#if review.from?.name}
													<span>{review.from.name.charAt(0)}</span>
												{:else}
													<span>?</span>
												{/if}
											</div>
										</div>
										<div>
											<p class="font-medium">{getUserDisplayName(review.from, '')}</p>
											<p class="text-base-content/70 text-xs">{formatDate(review.date)}</p>
										</div>
									</div>
									<div class="rating rating-sm">
										{#each Array(5) as _, i}
											<input
												type="radio"
												class="mask mask-star-2 bg-orange-400"
												checked={i + 1 === review.rating}
												disabled
											/>
										{/each}
									</div>
								</div>
								<p class="mt-2">{review.text}</p>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="card bg-base-200 rounded-lg p-6 text-center">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-base-content/30 mx-auto h-12 w-12"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
						/>
					</svg>
					<p class="text-base-content/70 mt-4">{$t('profile.noReviews')}</p>
				</div>
			{/if}
		</div>
	{:else if $profileStore.error}
		<div class="alert alert-error alert-outline">
			<span>{$t('profile.loadError')}</span>
		</div>
	{/if}
</div>
