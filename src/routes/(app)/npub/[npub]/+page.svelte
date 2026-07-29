<script lang="ts">
	import type {
		ProfileTranslations,
		SkillTranslations,
		PortfolioTranslations,
		NostrProfileImage,
		SkillCertification,
		TimeSlot
	} from '$lib/types/profile.d';
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import { fade } from 'svelte/transition';
	import { fetchComprehensiveProfile } from '$lib/nostr/profile';
	import { truncateNpub } from '$lib/utils/nostr';
	import { goto } from '$app/navigation';
	import { t, locale } from 'svelte-i18n';
	import { nip19 } from 'nostr-tools';
	import { authState } from '$lib/stores/auth.store';
	import Avatar from '$lib/components/Avatar.svelte';
	import ActionsMenu from '$lib/components/moderation/ActionsMenu.svelte';
	import { getReviewsForUser, getReviewsByReviewer } from '$lib/utils/reviews/queries';
	import {
		calculateReviewStats,
		sortReviews as sortReviewList,
		getRatingPercentage
	} from '$lib/utils/reviews/aggregation';
	import { calculateUserRanking } from '$lib/utils/reviews/ranking';
	import type { ReviewStats, AttestedReview } from '$lib/types/review';
	import { SvelteSet } from 'svelte/reactivity';
	import StreamPlayer from '$lib/components/StreamPlayer.svelte';
	import VerifiedReviewCard from '$lib/components/reviews/VerifiedReviewCard.svelte';
	import {
		animateProfileCards,
		animateAvatarEntry,
		animateRatingPop,
		animateSkillsStagger
	} from '$lib/utils/animations';

	// Helper function to get translated profile content
	// Reactive to locale changes via $locale
	function getTranslatedProfileContent(field: 'professionalTitle' | 'about'): string {
		const currentLang = $locale || 'en';
		const originalText = userProfile?.[field] || '';

		// If no translations, return original
		if (!userProfile?.translations) {
			return originalText;
		}

		// If current language is source language, return original
		if (userProfile.translations.sourceLanguage === currentLang) {
			return originalText;
		}

		// Get translation for current language
		const translation = userProfile.translations.translations[currentLang];
		if (translation) {
			return translation[field] || originalText;
		}

		// Fallback to original
		return originalText;
	}

	// Helper function to get translated skill name
	function getTranslatedSkillName(
		skill: string | { name: string; translations?: SkillTranslations }
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
		const translation = skill.translations.translations[currentLang];
		if (translation) {
			return translation.name || originalName;
		}

		// Fallback to original
		return originalName;
	}

	// Helper function to get translated portfolio title
	function getTranslatedPortfolioTitle(item: {
		title: string;
		translations?: PortfolioTranslations;
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
		const translation = item.translations.translations[currentLang];
		if (translation) {
			return translation.title || originalTitle;
		}

		// Fallback to original
		return originalTitle;
	}

	// Helper function to get translated portfolio description
	function getTranslatedPortfolioDescription(item: {
		description: string;
		translations?: PortfolioTranslations;
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
		const translation = item.translations.translations[currentLang];
		if (translation) {
			return translation.description || originalDescription;
		}

		// Fallback to original
		return originalDescription;
	}

	// State for validated hex pubkey
	let hexPubkey = $state<string | null>(null);
	let validationError = $state<string | null>(null);

	// Estado para los datos del perfil real
	let userProfile = $state<{
		name?: string;
		about?: string;
		picture?: string;
		pictures?: Array<{ url: string; type: string; alt: string; key?: string; isPrimary?: boolean }>;
		website?: string;
		professionalTitle?: string;
		location?: string; // General location (city, country or city, state)
		translations?: ProfileTranslations;
		skills?: Array<
			| string
			| {
					name: string;
					level: number;
					verificationStatus?: string;
					endorsements?: number;
					certifications?: SkillCertification[];
					translations?: SkillTranslations;
			  }
		>;
		portfolio?: Array<{
			link?: string;
			id: string;
			title: string;
			description: string;
			images: NostrProfileImage[];
			completionDate: string;
			skills: string[];
			translations?: PortfolioTranslations;
		}>;
		availability?: {
			timeSlots: TimeSlot[];
			timezone: string;
			noticeHours: number;
			maxBookingsPerDay: number;
			breakBetweenBookings: number;
		};
		reviews?: Array<{ id: string; from: string; rating: number; text: string; date: string }>;
		certifications?: Array<{
			name: string;
			issuer: string;
			date: string;
			verified: boolean;
			fileUrl: string;
		}>;
		createdAt?: string;
		videoIntro?: {
			uid: string;
			url: string;
			thumbnailUrl: string;
			duration: number;
			size: number;
		};
	} | null>(null);
	let loadingProfile = $state(true);
	let profileError = $state<string | null>(null);

	// Estado para el modal de mensaje
	let showMessageModal = $state(false);
	let messageText = $state('');
	let sendingMessage = $state(false);
	let messageError = $state('');
	let messageSuccess = $state(false);

	// Estado para el carrusel de imágenes de cada proyecto
	let projectImageSlides = $state<Record<number, number>>({});

	// State for attestation-based review stats
	let reviewStats = $state<ReviewStats | null>(null);
	let tasksCompleted = $state(0); // Unique contracts where user participated
	let isLoadingReviews = $state(false);
	let allReviews = $state<AttestedReview[]>([]);
	let reviewSort = $state<'newest' | 'highest_rating' | 'lowest_rating'>('newest');
	let showAllReviews = $state(false);
	const INITIAL_REVIEWS_SHOWN = 3;

	// Estado para el botón "ver más/ver menos" en la sección "Acerca de"
	let aboutElement: HTMLParagraphElement | null = $state(null);
	let isAboutTruncated = $state(false);
	let showFullAbout = $state(false);

	// Container refs for animations
	let profileContentEl: HTMLDivElement | null = $state(null);
	let sidebarContentEl: HTMLDivElement | null = $state(null);
	let avatarEl: HTMLDivElement | null = $state(null);
	let ratingBadgeEl: HTMLDivElement | null = $state(null);
	let skillsContainerEl: HTMLDivElement | null = $state(null);

	// Get user picture with priority: pictures array > picture field
	let userPicture = $derived(() => {
		if (userProfile?.pictures && userProfile.pictures.length > 0) {
			return userProfile.pictures[0].url;
		}
		return userProfile?.picture || '';
	});

	// Validate npub parameter
	function validateNpub(npub: string): { valid: boolean; hexPubkey?: string; error?: string } {
		if (!npub) {
			return { valid: false, error: $t('common.profile.invalid_npub') };
		}

		// Check if it's an npub format (starts with npub1)
		if (npub.startsWith('npub1')) {
			try {
				const decoded = nip19.decode(npub);
				if (decoded.type === 'npub') {
					return { valid: true, hexPubkey: decoded.data as string };
				}
				return { valid: false, error: $t('common.profile.invalid_npub_format') };
			} catch {
				return { valid: false, error: $t('common.profile.invalid_npub_format') };
			}
		}

		// Check if it's a hex pubkey (64 characters)
		if (/^[a-fA-F0-9]{64}$/.test(npub)) {
			return { valid: true, hexPubkey: npub };
		}

		return { valid: false, error: $t('common.profile.invalid_npub_format') };
	}

	// Funciones para el carrusel de imágenes de cada proyecto
	function nextProjectImage(projectIndex: number, totalImages: number) {
		if (totalImages > 1) {
			projectImageSlides[projectIndex] =
				((projectImageSlides[projectIndex] || 0) + 1) % totalImages;
			projectImageSlides = { ...projectImageSlides };
		}
	}

	function prevProjectImage(projectIndex: number, totalImages: number) {
		if (totalImages > 1) {
			projectImageSlides[projectIndex] =
				((projectImageSlides[projectIndex] || 0) - 1 + totalImages) % totalImages;
			projectImageSlides = { ...projectImageSlides };
		}
	}

	function goToProjectImage(projectIndex: number, imageIndex: number) {
		projectImageSlides[projectIndex] = imageIndex;
		projectImageSlides = { ...projectImageSlides };
	}

	// Check if about text is actually truncated (same logic as TranslatableTask)
	function checkIfAboutTruncated() {
		if (!aboutElement) return;

		// Create a hidden clone to measure full height without affecting layout
		const clone = aboutElement.cloneNode(true) as HTMLElement;
		clone.className = aboutElement.className.replace(/line-clamp-\d+/g, '');
		clone.style.position = 'absolute';
		clone.style.visibility = 'hidden';
		clone.style.height = 'auto';
		clone.style.width = aboutElement.offsetWidth + 'px';
		clone.style.whiteSpace = 'pre-line'; // Preserve line breaks
		document.body.appendChild(clone);

		const fullHeight = clone.scrollHeight;
		const lineHeight = parseFloat(getComputedStyle(aboutElement).lineHeight) || 20;
		const maxHeight = lineHeight * 2; // 2 lines

		// Clean up
		document.body.removeChild(clone);

		// Only show ellipsis if content is actually taller than 2 lines
		isAboutTruncated = fullHeight > maxHeight + 1; // +1 for small margin
	}

	function toggleAbout() {
		showFullAbout = !showFullAbout;
	}

	// Function to load attestation-based review stats
	// Tasks completed = unique contracts where user participated (as reviewer OR reviewee)
	// Rating = calculated from reviews RECEIVED (where user is reviewee)
	async function loadUserReviews(pubkey: string) {
		try {
			isLoadingReviews = true;

			// Fetch both reviews received and reviews given in parallel
			const [reviewsReceived, reviewsGiven] = await Promise.all([
				getReviewsForUser(pubkey, 100), // User was reviewee
				getReviewsByReviewer(pubkey, 100) // User was reviewer
			]);

			// Calculate tasks completed from unique contract IDs
			// A contract is "completed" when either party has reviewed
			const uniqueContractIds = new SvelteSet<string>();

			// Add contracts from reviews received (user completed work as taskee OR got reviewed as tasker)
			for (const review of reviewsReceived) {
				if (review.contractId) {
					uniqueContractIds.add(review.contractId);
				} else {
					// If no contractId, use attestation event ID as unique identifier
					uniqueContractIds.add(review.attestationEventId);
				}
			}

			// Add contracts from reviews given (user completed a contract and reviewed the other party)
			for (const review of reviewsGiven) {
				if (review.contractId) {
					uniqueContractIds.add(review.contractId);
				} else {
					// If no contractId, use attestation event ID as unique identifier
					uniqueContractIds.add(review.attestationEventId);
				}
			}

			tasksCompleted = uniqueContractIds.size;

			// Rating stats are calculated ONLY from reviews received (where user is reviewee)
			// This represents their reputation based on how others rated them
			if (reviewsReceived.length > 0) {
				reviewStats = calculateReviewStats(reviewsReceived);
				allReviews = reviewsReceived;
			} else {
				reviewStats = null;
				allReviews = [];
			}
		} catch (error) {
			console.error('Failed to load user reviews:', error);
			reviewStats = null;
			tasksCompleted = 0;
		} finally {
			isLoadingReviews = false;
		}
	}

	// Función para cargar el perfil del usuario
	async function loadUserProfile() {
		if (!hexPubkey) {
			profileError = $t('common.profile.invalid_npub');
			loadingProfile = false;
			return;
		}

		try {
			loadingProfile = true;
			profileError = null;

			// Fetch profile and reviews in parallel
			const [profile] = await Promise.all([
				fetchComprehensiveProfile(hexPubkey),
				loadUserReviews(hexPubkey)
			]);

			// Check if profile is empty (no name and no data)
			if (!profile || (!profile.name && !profile.about && !profile.picture)) {
				profileError = $t('common.profile.no_profile_data');
			}

			userProfile = profile as unknown as typeof userProfile;
		} catch (error) {
			profileError = error instanceof Error ? error.message : $t('common.profile.failed_to_load');
			userProfile = null;
		} finally {
			loadingProfile = false;

			// Trigger entrance animations after profile loads (replaces $effect)
			if (!profileError && userProfile) {
				await tick();
				requestAnimationFrame(() => {
					if (profileContentEl) animateProfileCards(profileContentEl);
					if (sidebarContentEl) animateProfileCards(sidebarContentEl);
					if (avatarEl) animateAvatarEntry(avatarEl);
					if (ratingBadgeEl) animateRatingPop(ratingBadgeEl);
					if (skillsContainerEl) animateSkillsStagger(skillsContainerEl);
				});
			}
		}
	}

	// Función para abrir el modal de mensaje
	function openMessageModal() {
		showMessageModal = true;
		messageText = '';
		messageError = '';
		messageSuccess = false;
	}

	// Función para cerrar el modal de mensaje
	function closeMessageModal() {
		showMessageModal = false;
		messageText = '';
		messageError = '';
		messageSuccess = false;
		sendingMessage = false;
	}

	// Función para enviar mensaje
	async function sendMessage() {
		if (!messageText.trim() || !hexPubkey) {
			messageError = $t('common.profile.message_required');
			return;
		}

		sendingMessage = true;
		messageError = '';

		try {
			// Importar la función de envío de mensajes
			const { sendDirectMessage } = await import('$lib/nostr/direct-messages');

			// Enviar el mensaje
			await sendDirectMessage(messageText.trim(), hexPubkey);

			messageSuccess = true;
			messageText = '';

			// Cerrar el modal después de 2 segundos
			setTimeout(() => {
				closeMessageModal();
			}, 2000);
		} catch (error) {
			console.error('Error sending message:', error);
			messageError = $t('common.profile.message_send_error');
		} finally {
			sendingMessage = false;
		}
	}

	// Función para navegar directamente al chat
	function goToChat() {
		if (hexPubkey) {
			goto(`/messages/to/${hexPubkey}`);
		}
	}

	// Calcular rating promedio from attestation-based reviews
	const averageRating = $derived(
		reviewStats && reviewStats.totalReviews > 0 ? reviewStats.averageRating.toFixed(1) : null
	);

	// User ranking based on review stats
	const userRanking = $derived(
		reviewStats ? calculateUserRanking({ reviewStats, contractsCompleted: tasksCompleted }) : null
	);

	// Sorted and displayed reviews
	const sortedReviews = $derived(sortReviewList(allReviews, reviewSort));
	const displayedReviews = $derived(
		showAllReviews ? sortedReviews : sortedReviews.slice(0, INITIAL_REVIEWS_SHOWN)
	);
	const hasMoreReviews = $derived(sortedReviews.length > INITIAL_REVIEWS_SHOWN);

	// Generar nombre de usuario para email (user.name@bittasker.com)
	const userNameForEmail = $derived(
		userProfile?.name
			? userProfile.name
					.toLowerCase()
					.replace(/[^a-z0-9\s]/g, '') // Remover caracteres especiales
					.replace(/\s+/g, '.') // Reemplazar espacios con puntos
			: ''
	);

	onMount(async () => {
		// Validate npub parameter
		const validation = validateNpub(page.params.npub);
		if (!validation.valid) {
			validationError = validation.error || $t('common.profile.invalid_npub');
			loadingProfile = false;
			return;
		}

		hexPubkey = validation.hexPubkey || null;

		// Cargar el perfil del usuario
		await loadUserProfile();

		// Initialize truncation check after profile loads
		if (aboutElement) {
			requestAnimationFrame(() => {
				checkIfAboutTruncated();
			});
		}
	});
</script>

<!-- Skeleton Loading -->
<div
	class="bg-base-200 mx-auto w-full max-w-6xl px-2 pt-6 md:px-0 {$authState.isAuthenticated
		? 'pb-24'
		: 'pb-8'}"
>
	{#if validationError}
		<div class="mx-auto py-8">
			<div class="alert alert-error alert-outline">
				<svg class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span>{validationError}</span>
			</div>
		</div>
	{:else if loadingProfile}
		<!-- Grid único de 4 columnas -->
		<div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-4">
			<!-- Columna 1-3: Contenido principal -->
			<div class="space-y-6 lg:col-span-3">
				<!-- Información del perfil Skeleton -->
				<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
					<div class="card-body p-4">
						<div class="flex flex-col items-center gap-6 lg:flex-row lg:items-start">
							<div class="shrink-0">
								<div class="bg-base-300 h-20 w-20 animate-pulse rounded-full"></div>
							</div>
							<div class="flex-1 text-center lg:text-left">
								<div
									class="mb-2 flex flex-col items-center gap-2 lg:flex-row lg:items-center lg:justify-between"
								>
									<div class="bg-base-300 h-6 w-32 animate-pulse rounded"></div>
								</div>
								<div class="bg-base-300 mb-4 h-6 w-24 animate-pulse rounded"></div>
								<div class="mb-4 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
									<div class="bg-base-300 h-4 w-24 animate-pulse rounded"></div>
									<div class="bg-base-300 h-4 w-20 animate-pulse rounded"></div>
								</div>
								<div class="flex flex-wrap justify-center gap-3 md:hidden lg:justify-start">
									<div class="bg-base-300 h-8 w-24 animate-pulse rounded"></div>
									<div class="bg-base-300 h-8 w-24 animate-pulse rounded"></div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- About and Skills Section Skeleton -->
				<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
					<div class="card-body p-4">
						<div class="bg-base-300 mb-2 h-6 w-16 animate-pulse rounded"></div>
						<div class="mb-4 space-y-2">
							<div class="bg-base-300 h-4 w-full animate-pulse rounded"></div>
							<div class="bg-base-300 h-4 w-3/4 animate-pulse rounded"></div>
						</div>
						<div class="bg-base-300 mb-2 h-6 w-32 animate-pulse rounded"></div>
						<div class="flex flex-wrap gap-2">
							{#each [0, 1, 2, 3, 4] as i (i)}
								<div class="bg-base-300 h-6 w-16 animate-pulse rounded-full"></div>
							{/each}
						</div>
					</div>
				</div>

				<!-- Portfolio Section Skeleton -->
				<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
					<div class="card-body p-4">
						<div class="bg-base-300 mb-4 h-6 w-20 animate-pulse rounded"></div>
						<div class="relative overflow-hidden rounded-2xl">
							<div class="bg-base-300 h-64 w-full animate-pulse"></div>
							<div class="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
								<div class="h-4 w-4 animate-pulse rounded-full bg-white/50"></div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Columna 4: Sidebar -->
			<div class="space-y-6 lg:col-span-1">
				<!-- Performance Stats Skeleton -->
				<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
					<div class="card-body p-3">
						<div class="bg-base-300 mb-2 h-6 w-32 animate-pulse rounded"></div>
						<div class="space-y-1">
							{#each [0, 1, 2, 3] as i (i)}
								<div class="flex items-center justify-between">
									<div class="bg-base-300 h-4 w-20 animate-pulse rounded"></div>
									<div class="bg-base-300 h-4 w-8 animate-pulse rounded"></div>
								</div>
							{/each}
						</div>
					</div>
				</div>

				<!-- Availability Skeleton -->
				<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
					<div class="card-body p-3">
						<div class="bg-base-300 mb-2 h-6 w-24 animate-pulse rounded"></div>
						<div class="space-y-2">
							{#each [0, 1, 2] as i (i)}
								<div class="flex items-center gap-2">
									<div class="bg-base-300 h-2 w-2 animate-pulse rounded-full"></div>
									<div class="bg-base-300 h-3 w-20 animate-pulse rounded"></div>
								</div>
							{/each}
						</div>
					</div>
				</div>

				<!-- Quick Actions Skeleton -->
				<div class="hidden md:block">
					<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
						<div class="card-body p-3">
							<div class="bg-base-300 mb-2 h-6 w-28 animate-pulse rounded"></div>
							<div class="space-y-3">
								<div class="bg-base-300 h-8 w-full animate-pulse rounded"></div>
								<div class="bg-base-300 h-8 w-full animate-pulse rounded"></div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	{:else if profileError}
		<div class="mx-auto py-8">
			<div class="alert alert-error alert-outline">
				<svg class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span>{profileError}</span>
			</div>
		</div>
	{:else}
		<div in:fade={{ duration: 150 }}>
			<!-- Botón de regresar -->
			<div class="mb-4">
				<button
					class="btn btn-secondary btn-sm"
					onclick={() => {
						if (typeof window !== 'undefined') {
							window.history.back();
						}
					}}
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M10 19l-7-7m0 0l7-7m-7 7h18"
						/>
					</svg>
					{$t('common.back_2')}
				</button>
			</div>
			<!-- Grid único de 4 columnas -->
			<div bind:this={profileContentEl} class="grid grid-cols-1 items-start gap-6 lg:grid-cols-4">
				<!-- Columna 1-3: Contenido principal -->
				<div class="space-y-6 lg:col-span-3">
					<!-- Información del perfil -->
					<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
						<div class="card-body p-4">
							<div class="relative flex flex-col items-center gap-6 lg:flex-row lg:items-center">
								<!-- Avatar -->
								<div bind:this={avatarEl} class="shrink-0">
									<!-- Mobile: tamaño xl (w-24 h-24) -->
									<div class="block md:hidden">
										<Avatar name={userProfile?.name} picture={userPicture()} size="xl" />
									</div>
									<!-- Desktop: tamaño 2xl (w-40 h-40) -->
									<div class="hidden md:block">
										<Avatar name={userProfile?.name} picture={userPicture()} size="2xl" />
									</div>
								</div>

								<!-- Content menu -->
								<div class="absolute top-0 right-0">
									{#if $authState.isAuthenticated && hexPubkey}
										<ActionsMenu
											contentType="user"
											reportedPubkey={hexPubkey}
											username={userProfile?.name}
											profileMode={true}
										/>
									{/if}
								</div>

								<!-- Profile information -->
								<div class="flex-1 text-center lg:text-left">
									<div
										class="mb-2 flex flex-col items-center gap-2 lg:flex-row lg:items-center lg:justify-between"
									>
										<div class="flex flex-col items-center gap-1 lg:items-start">
											<div class="flex items-center gap-2">
												<h3 class="text-base-content font-bold">
													{userProfile?.name ||
														(page.params.npub ? truncateNpub(page.params.npub) : '')}
												</h3>
												{#if averageRating}
													<div bind:this={ratingBadgeEl} class="flex items-center gap-1">
														<span class="text-lg font-bold">{averageRating}</span>
														<svg
															class="h-4 w-4 text-yellow-500"
															fill="currentColor"
															viewBox="0 0 20 20"
														>
															<path
																fill-rule="evenodd"
																d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z"
																clip-rule="evenodd"
															/>
														</svg>
													</div>
												{/if}
												{#if userRanking && userRanking.tier !== 'newcomer'}
													<div class="badge {userRanking.tierConfig.badgeClass} badge-sm">
														{userRanking.tierConfig.label}
													</div>
												{/if}
											</div>
											{#if userNameForEmail}
												<p class="text-base-content/60 text-sm">
													{userNameForEmail}@bittasker.com
												</p>
											{/if}
										</div>
									</div>
									{#if userProfile?.professionalTitle}
										<div class="badge badge-primary badge-lg mb-4 px-3 py-1 text-sm">
											{getTranslatedProfileContent('professionalTitle')}
										</div>
									{/if}

									<!-- Información adicional -->
									<div
										class="text-base-content/70 mb-4 flex flex-wrap items-center justify-center gap-2 lg:justify-start"
									>
										{#if profileError}
											<div class="text-error text-sm">⚠️ {profileError}</div>
										{/if}
										{#if userProfile?.location}
											<div class="flex items-center gap-2">
												<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
													/>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
													/>
												</svg>
												<span>{userProfile.location}</span>
											</div>
										{/if}
										{#if userProfile?.website}
											<a
												href={userProfile.website}
												target="_blank"
												rel="noopener noreferrer"
												class="hover:text-primary flex items-center gap-2 transition-colors"
											>
												<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
													/>
												</svg>
												{$t('common.profile.website')}
											</a>
										{/if}
									</div>

									<!-- Quick-action buttons -->
									<div class="flex flex-wrap justify-center gap-3 md:hidden lg:justify-start">
										{#if $authState.isAuthenticated}
											<button class="btn btn-primary btn-sm" onclick={openMessageModal}>
												<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
													/>
												</svg>
												{$t('common.profile.send_message')}
											</button>
											<button class="btn btn-outline btn-sm" onclick={goToChat}>
												<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
													/>
												</svg>
												{$t('common.profile.go_to_chat')}
											</button>
										{:else}
											<button class="btn btn-primary btn-sm" onclick={() => goto('/auth/signup')}>
												{$t('common.profile.signup_to_hire')}
											</button>
										{/if}
									</div>
								</div>
							</div>
						</div>
					</div>

					<!-- Video Introduction -->
					{#if userProfile?.videoIntro?.uid}
						<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
							<div class="card-body py-4">
								<p class="mb-3 text-xl font-bold">
									{$t('common.components.media_uploader.video_introduction')}
								</p>
								<div class="aspect-video w-full rounded-lg sm:min-h-64">
									<StreamPlayer
										videoUid={userProfile.videoIntro.uid}
										poster={userProfile.videoIntro.thumbnailUrl}
										controls={true}
										private={false}
									/>
								</div>
							</div>
						</div>
					{/if}

					<!-- About and Skills Section -->
					<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
						<div class="card-body p-4">
							<p class=" text-xl font-bold">{$t('common.profile.about')}</p>
							<p
								bind:this={aboutElement}
								class="text-base-content/80 text-sm leading-relaxed {showFullAbout
									? ''
									: 'line-clamp-2'}"
							>
								{getTranslatedProfileContent('about') || $t('common.profile.no_description')}
							</p>
							{#if isAboutTruncated && userProfile?.about}
								<div class="mb-2 text-left">
									<button class="btn btn-sm btn-secondary p-2" onclick={toggleAbout}>
										{showFullAbout ? $t('common.show_less') : $t('common.show_more')}
									</button>
								</div>
							{/if}

							<p class="mb-2 text-xl font-bold">{$t('common.profile.skills_expertise')}</p>
							<div bind:this={skillsContainerEl} class="flex flex-wrap gap-2">
								{#if userProfile?.skills && userProfile.skills.length > 0}
									{#each userProfile.skills as skill (typeof skill === 'string' ? skill : skill.name)}
										<div class="badge badge-outline badge-primary px-3 py-1 text-sm">
											{getTranslatedSkillName(skill)}
										</div>
									{/each}
								{:else}
									<p class="text-base-content/60 text-sm">{$t('common.profile.no_skills')}</p>
								{/if}
							</div>
						</div>
					</div>

					<!-- Portfolio Section -->
					{#if userProfile?.portfolio && userProfile.portfolio.length > 0}
						<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
							<div class="card-body p-4">
								<p class="mb-4 text-xl font-bold">{$t('common.profile.portfolio')}</p>
								<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
									{#each userProfile.portfolio as project, projectIndex (project.id)}
										<div class="card bg-base-200 overflow-hidden rounded-xl">
											<!-- Título, badges y descripción arriba de la imagen -->
											<div class="card-body p-4 pb-2">
												<div class="mb-2 flex items-center justify-between gap-2">
													<span class="card-title text-md line-clamp-1 font-bold"
														>{getTranslatedPortfolioTitle(project)}</span
													>
													{#if project?.link}
														<a
															href={project.link}
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
															{$t('common.profile.visit_project')}
														</a>
													{/if}
												</div>
												<!-- Skills badges arriba de la descripción -->
												{#if project.skills && project.skills.length > 0}
													<div class="mb-2 flex flex-wrap gap-1">
														{#each project.skills as skill (skill)}
															<span class="badge badge-info badge-outline badge-sm">
																{skill}
															</span>
														{/each}
													</div>
												{/if}
												<p class="text-base-content/70 mb-3 line-clamp-2 text-sm">
													{getTranslatedPortfolioDescription(project)}
												</p>
											</div>

											<!-- Imagen del proyecto -->
											<div class="relative">
												{#if project.images && project.images.length > 0}
													{@const currentImageIndex = projectImageSlides[projectIndex] || 0}
													{@const totalImages = project.images.length}
													{@const hasMultipleImages = totalImages > 1}

													<!-- Carrusel de imágenes del proyecto -->
													<div class="relative overflow-hidden">
														<div
															class="flex transition-transform duration-500 ease-in-out"
															style="transform: translateX(-{currentImageIndex * 100}%)"
														>
															{#each project.images as image, imgIndex (image.url)}
																<div class="w-full shrink-0">
																	{#if typeof image === 'string'}
																		<img
																			src={image}
																			alt="{project.title} - {imgIndex + 1}"
																			class="h-48 w-full object-cover"
																		/>
																	{:else if image?.url}
																		<img
																			src={image.url}
																			alt={image.alt || `${project.title} - ${imgIndex + 1}`}
																			class="h-48 w-full object-cover"
																		/>
																	{/if}
																</div>
															{/each}
														</div>

														<!-- Controles de navegación de imágenes (solo si hay más de una) -->
														{#if hasMultipleImages}
															<!-- Botón anterior -->
															<button
																onclick={() => prevProjectImage(projectIndex, totalImages)}
																class="btn btn-circle btn-sm absolute top-1/2 left-2 z-10 -translate-y-1/2 border-2 border-white/50 bg-black/80 text-white shadow-xl backdrop-blur-sm hover:bg-black"
																aria-label="Previous image"
															>
																<svg
																	xmlns="http://www.w3.org/2000/svg"
																	class="h-4 w-4"
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
																onclick={() => nextProjectImage(projectIndex, totalImages)}
																class="btn btn-circle btn-sm absolute top-1/2 right-2 z-10 -translate-y-1/2 border-2 border-white/50 bg-black/80 text-white shadow-xl backdrop-blur-sm hover:bg-black"
																aria-label="Next image"
															>
																<svg
																	xmlns="http://www.w3.org/2000/svg"
																	class="h-4 w-4"
																	fill="none"
																	viewBox="0 0 24 24"
																	stroke="currentColor"
																	stroke-width="3"
																>
																	<path
																		stroke-linecap="round"
																		stroke-linejoin="round"
																		d="M9 5l7 7-7 7"
																	/>
																</svg>
															</button>

															<!-- Indicadores de imágenes -->
															<div class="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
																{#each project.images as image, imgIndex (imgIndex)}
																	<button
																		onclick={() => goToProjectImage(projectIndex, imgIndex)}
																		class="h-1.5 w-1.5 rounded-full transition-all duration-300 {currentImageIndex ===
																		imgIndex
																			? 'w-4 bg-white'
																			: 'bg-white/50'}"
																		aria-label="Go to image {image.alt || imgIndex + 1}"
																	></button>
																{/each}
															</div>
														{/if}
													</div>
												{:else}
													<div class="bg-base-300 flex h-48 w-full items-center justify-center">
														<span class="text-base-content/60 text-sm"
															>{$t('common.profile.no_image_available')}</span
														>
													</div>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							</div>
						</div>
					{:else}
						<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
							<div class="card-body p-4">
								<p class="mb-4 text-xl font-bold">{$t('common.profile.portfolio')}</p>
								<p class="text-base-content/60 text-sm">{$t('common.profile.no_portfolio')}</p>
							</div>
						</div>
					{/if}

					<!-- Reviews Section -->
					<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
						<div class="card-body p-4">
							<div class="mb-4 flex items-center justify-between">
								<p class="text-xl font-bold">
									{$t('common.profile.reviews')}
									{#if sortedReviews.length > 0}
										<span class="text-base-content/60 text-sm font-normal">
											({sortedReviews.length})
										</span>
									{/if}
								</p>
								{#if sortedReviews.length > 1}
									<select class="select select-bordered select-sm" bind:value={reviewSort}>
										<option value="newest">{$t('common.profile.sort_newest')}</option>
										<option value="highest_rating">{$t('common.profile.sort_highest')}</option>
										<option value="lowest_rating">{$t('common.profile.sort_lowest')}</option>
									</select>
								{/if}
							</div>

							{#if isLoadingReviews}
								<div class="flex items-center justify-center py-8">
									<span class="loading loading-spinner loading-lg text-primary"></span>
								</div>
							{:else if displayedReviews.length > 0}
								<div class="space-y-4">
									{#each displayedReviews as review (review.attestationEventId)}
										<VerifiedReviewCard {review} />
									{/each}
								</div>
								{#if hasMoreReviews}
									<div class="mt-4 text-center">
										<button
											class="btn btn-outline btn-sm"
											onclick={() => (showAllReviews = !showAllReviews)}
										>
											{showAllReviews
												? $t('common.profile.show_less_reviews')
												: $t('common.profile.show_more_reviews')}
										</button>
									</div>
								{/if}
							{:else}
								<div class="flex flex-col items-center justify-center py-8 text-center">
									<svg
										class="text-base-content/30 mb-3 h-12 w-12"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="1.5"
											d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
										/>
									</svg>
									<p class="text-base-content/60 text-sm font-medium">
										{$t('common.profile.no_reviews_yet')}
									</p>
									<p class="text-base-content/40 mt-1 text-xs">
										{$t('common.profile.no_reviews_description')}
									</p>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<!-- Columna 4: Sidebar -->
				<div bind:this={sidebarContentEl} class="space-y-6 lg:col-span-1">
					<!-- Performance Stats -->
					<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
						<div class="card-body p-3">
							<p class="mb-2 text-xl font-bold">{$t('common.profile.performance_stats')}</p>
							<div class="space-y-1">
								<div class="flex items-center justify-between">
									<span class="text-base-content/70 text-sm"
										>{$t('common.profile.tasks_completed')}</span
									>
									<span class="text-primary text-lg font-bold">
										{#if isLoadingReviews}
											<span class="loading loading-spinner loading-xs"></span>
										{:else}
											{tasksCompleted}
										{/if}
									</span>
								</div>
								<div class="flex items-center justify-between">
									<span class="text-base-content/70 text-sm">{$t('common.profile.rating')}</span>
									<div class="flex items-center gap-1">
										{#if isLoadingReviews}
											<span class="loading loading-spinner loading-xs"></span>
										{:else if reviewStats && reviewStats.totalReviews > 0}
											<span class="text-lg font-bold">{reviewStats.averageRating.toFixed(1)}</span>
											<svg class="h-4 w-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
												<path
													fill-rule="evenodd"
													d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z"
													clip-rule="evenodd"
												/>
											</svg>
										{:else}
											<span class="text-base-content/60 text-sm"
												>{$t('common.profile.no_ratings')}</span
											>
										{/if}
									</div>
								</div>
								<div class="flex items-center justify-between">
									<span class="text-base-content/70 text-sm">{$t('common.profile.skills')}</span>
									<span class="text-success text-lg font-bold">
										{userProfile?.skills?.length || 0}
									</span>
								</div>
								<div class="flex items-center justify-between">
									<span class="text-base-content/70 text-sm"
										>{$t('common.profile.portfolio_items')}</span
									>
									<span class="text-info text-lg font-bold">
										{userProfile?.portfolio?.length || 0}
									</span>
								</div>
							</div>

							<!-- Reputation Tier -->
							{#if userRanking}
								<div class="border-base-300 mt-3 border-t pt-3">
									<div class="mb-2 flex items-center justify-between">
										<span class="text-base-content/70 text-xs font-medium tracking-wide uppercase">
											{$t('common.profile.reputation_tier')}
										</span>
										<span class="badge {userRanking.tierConfig.badgeClass} badge-sm">
											{userRanking.tierConfig.label}
										</span>
									</div>
									<div class="bg-base-300 h-1.5 w-full overflow-hidden rounded-full">
										<div
											class="bg-primary h-full rounded-full transition-all duration-700"
											style="width: {userRanking.score}%"
										></div>
									</div>
									{#if userRanking.nextTier}
										<p class="text-base-content/50 mt-1 text-xs">
											{userRanking.progressToNextTier}% to {userRanking.nextTier.label}
										</p>
									{/if}
								</div>
							{/if}

							<!-- Rating Distribution -->
							{#if reviewStats && reviewStats.totalReviews > 0}
								<div class="border-base-300 mt-3 border-t pt-3">
									<p class="text-base-content/70 mb-2 text-xs font-medium tracking-wide uppercase">
										{$t('common.profile.rating_breakdown')}
									</p>
									<div class="space-y-1">
										{#each [5, 4, 3, 2, 1] as star (star)}
											<div class="flex items-center gap-2">
												<span class="w-3 text-xs">{star}★</span>
												<div class="bg-base-300 h-1.5 flex-1 overflow-hidden rounded-full">
													<div
														class="bg-primary h-full rounded-full transition-all duration-500"
														style="width: {getRatingPercentage(
															reviewStats,
															star as 1 | 2 | 3 | 4 | 5
														)}%"
													></div>
												</div>
												<span class="text-base-content/50 w-4 text-right text-xs">
													{reviewStats.ratingDistribution[
														star as keyof typeof reviewStats.ratingDistribution
													]}
												</span>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Verified Badge -->
							{#if reviewStats && reviewStats.totalReviews > 0}
								<div class="mt-3 flex items-center gap-2">
									<svg
										class="text-success h-4 w-4"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
										/>
									</svg>
									<span class="text-base-content/60 text-xs">
										{$t('common.profile.verified_reviews')}
									</span>
								</div>
							{/if}
						</div>
					</div>

					<!-- Availability -->
					<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
						<div class="card-body p-3">
							<p class="mb-2 text-xl font-bold">{$t('common.profile.availability')}</p>
							<div class="space-y-2">
								<div class="flex items-center gap-2">
									{#if userProfile?.availability?.timeSlots && userProfile.availability.timeSlots.length > 0}
										<div class="bg-success h-2 w-2 rounded-full"></div>
										<span class="text-xs">{$t('common.profile.available_projects')}</span>
									{:else}
										<div class="bg-warning h-2 w-2 rounded-full"></div>
										<span class="text-xs">{$t('common.profile.availability_not_set')}</span>
									{/if}
								</div>
								<div class="flex items-center gap-2">
									<svg
										class="text-base-content/60 h-3 w-3"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
									<span class="text-xs">
										{#if userProfile?.availability?.noticeHours}
											{$t('common.profile.responds_within', {
												values: { hours: userProfile.availability.noticeHours }
											})}
										{:else}
											{$t('common.profile.response_time_not_specified')}
										{/if}
									</span>
								</div>
							</div>
						</div>
					</div>

					<!-- Quick Actions -->
					<div class="hidden md:block">
						<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
							<div class="card-body p-3">
								<div class="flex items-start justify-between">
									<p class="mb-2 text-xl font-bold">{$t('common.profile.quick_actions')}</p>
									{#if $authState.isAuthenticated && hexPubkey}
										<div class="flex justify-start">
											<ActionsMenu
												contentType="user"
												reportedPubkey={hexPubkey}
												username={userProfile?.name}
												profileMode={true}
											/>
										</div>
									{/if}
								</div>
								<div class="space-y-3">
									{#if $authState.isAuthenticated}
										<button class="btn btn-primary btn-sm w-full" onclick={openMessageModal}>
											<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
												/>
											</svg>
											{$t('common.profile.send_message')}
										</button>
										<button class="btn btn-outline btn-sm w-full" onclick={goToChat}>
											<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
												/>
											</svg>
											{$t('common.profile.go_to_chat')}
										</button>
									{:else}
										<button
											class="btn btn-primary btn-sm w-full"
											onclick={() => goto('/auth/signup')}
										>
											{$t('common.profile.signup_to_hire')}
										</button>
									{/if}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- Modal de mensaje -->
{#if showMessageModal}
	<div class="modal modal-open">
		<div class="modal-box max-w-md">
			<!-- Header del modal -->
			<div class="mb-6">
				<div class="mb-2 flex items-center gap-3">
					<div class="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full">
						<svg class="text-primary h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
							/>
						</svg>
					</div>
					<div>
						<h4 class="text-sm font-semibold">{$t('common.profile.send_message')}</h4>
						<p class="text-base-content/60 text-xs">
							To: {userProfile?.name || (page.params.npub ? truncateNpub(page.params.npub) : '')}
						</p>
					</div>
				</div>
			</div>

			<!-- Formulario de mensaje -->
			<form
				onsubmit={(e) => {
					e.preventDefault();
					sendMessage();
				}}
				class="space-y-4"
			>
				<div>
					<label for="message-text" class="text-base-content mb-2 block text-sm font-medium">
						{$t('common.profile.send_message')}
					</label>
					<textarea
						id="message-text"
						class="textarea textarea-bordered w-full"
						placeholder={$t('common.profile.message_placeholder')}
						bind:value={messageText}
						rows="4"
						disabled={sendingMessage}
					></textarea>
				</div>

				<!-- Mensaje de éxito -->
				{#if messageSuccess}
					<div class="alert alert-success alert-outline py-2">
						<svg class="h-4 w-4 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 13l4 4L19 7"
							/>
						</svg>
						<span class="text-sm">{$t('common.profile.message_sent_successfully')}</span>
					</div>
				{/if}

				<!-- Mensaje de error -->
				{#if messageError}
					<div class="alert alert-error alert-outline py-2">
						<svg class="h-4 w-4 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span class="text-sm">{messageError}</span>
					</div>
				{/if}

				<!-- Botones de acción -->
				<div class="border-base-300 flex gap-3 border-t pt-6">
					<button
						type="button"
						class="btn btn-ghost flex-1"
						onclick={closeMessageModal}
						disabled={sendingMessage}
					>
						<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
						{$t('common.cancel')}
					</button>
					<button
						type="submit"
						class="btn btn-primary flex-1"
						disabled={!messageText.trim() || sendingMessage || messageSuccess}
					>
						{#if sendingMessage}
							<span class="loading loading-spinner loading-sm mr-2"></span>
							{$t('common.processing')}
						{:else if messageSuccess}
							<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M5 13l4 4L19 7"
								/>
							</svg>
							{$t('common.profile.message_sent_successfully')}
						{:else}
							<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
								/>
							</svg>
							{$t('common.profile.send_message')}
						{/if}
					</button>
				</div>
			</form>
		</div>
		<button class="modal-backdrop" onclick={closeMessageModal}>X</button>
	</div>
{/if}
