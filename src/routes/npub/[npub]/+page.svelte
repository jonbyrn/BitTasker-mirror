<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { nip19 } from 'nostr-tools';
	import { authState } from '$lib/stores/auth.store';
	import { fetchComprehensiveProfile } from '$lib/nostr/profile';
	import { truncateNpub } from '$lib/utils/nostr';
	import { getReviewsForUser, getReviewsByReviewer } from '$lib/utils/reviews/queries';
	import { calculateReviewStats } from '$lib/utils/reviews/aggregation';
	import type { ReviewStats } from '$lib/types/review';
	import type { ComprehensiveProfile } from '$lib/nostr/profile/comprehensive-profile';
	import { SvelteSet } from 'svelte/reactivity';

	// Profile component tree
	import ProfileHero from '$lib/components/profile/ProfileHero.svelte';
	import ProfileNav from '$lib/components/profile/ProfileNav.svelte';
	import ProfileServicesSection from '$lib/components/profile/ProfileServicesSection.svelte';
	import ProfileTasksSection from '$lib/components/profile/ProfileTasksSection.svelte';
	import ProfileReviewsSection from '$lib/components/profile/ProfileReviewsSection.svelte';
	import ProfilePortfolioSection from '$lib/components/profile/ProfilePortfolioSection.svelte';
	import ProfileAboutSection from '$lib/components/profile/ProfileAboutSection.svelte';
	import ProfileSidebar from '$lib/components/profile/ProfileSidebar.svelte';
	import ActionsMenu from '$lib/components/moderation/ActionsMenu.svelte';
	import StreamPlayer from '$lib/components/StreamPlayer.svelte';

	// ── State ──────────────────────────────────────────────────────
	let hexPubkey = $state<string | null>(null);
	let validationError = $state<string | null>(null);
	let userProfile = $state<ComprehensiveProfile | null>(null);
	let loadingProfile = $state(true);
	let profileError = $state<string | null>(null);
	let reviewStats = $state<ReviewStats | null>(null);
	let tasksCompleted = $state(0);
	let isLoadingReviews = $state(false);

	// ── Lazy section visibility (C1: only fetch when section enters viewport) ──
	let visibleSections: Set<string> = new SvelteSet();
	/**
	 * Svelte action: observes when a section enters the viewport and marks it visible.
	 * Disconnects after first intersection to prevent repeated triggers.
	 * @param node - The DOM element to observe
	 * @param sectionId - The section identifier used in visibleSections
	 */
	function observeSection(node: HTMLElement, sectionId: string) {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						visibleSections.add(sectionId);
						visibleSections = visibleSections; // trigger reactivity
						observer.disconnect();
					}
				}
			},
			{ rootMargin: '200px 0px' } // pre-fetch 200px before visible
		);
		observer.observe(node);
		return { destroy: () => observer.disconnect() };
	}

	// ── Derived (Svelte 5: $derived(expression) NOT $derived(() => expression)) ──
	let userPicture = $derived(
		userProfile?.pictures?.length > 0 ? userProfile.pictures[0].url : userProfile?.picture || ''
	);

	const averageRating = $derived(
		reviewStats && reviewStats.totalReviews > 0 ? reviewStats.averageRating : null
	);

	const reviewCount = $derived(reviewStats?.totalReviews ?? 0);

	const displayName = $derived(
		userProfile?.name || (page.params.npub ? truncateNpub(page.params.npub) : '')
	);

	// ── Validation ─────────────────────────────────────────────────
	function validateNpub(npub: string): { valid: boolean; hexPubkey?: string; error?: string } {
		if (!npub) {
			return { valid: false, error: $t('common.profile.invalid_npub') };
		}
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
		if (/^[a-fA-F0-9]{64}$/.test(npub)) {
			return { valid: true, hexPubkey: npub };
		}
		return { valid: false, error: $t('common.profile.invalid_npub_format') };
	}

	// ── Reviews: lightweight count for hero stats ──────────────────
	// Full review data fetched lazily by ProfileReviewsSection.
	// This only fetches a small sample for tasksCompleted + averageRating.
	async function loadUserReviews(pubkey: string) {
		try {
			isLoadingReviews = true;

			// Small sample: 10 received for rating, 10 given for unique contract count
			const [reviewsReceived, reviewsGiven] = await Promise.all([
				getReviewsForUser(pubkey, 10),
				getReviewsByReviewer(pubkey, 10)
			]);

			// Tasks completed = unique contracts where user participated
			const uniqueContractIds = new SvelteSet<string>();

			for (const review of reviewsReceived.reviews) {
				if (review.contractId) {
					uniqueContractIds.add(review.contractId);
				} else {
					uniqueContractIds.add(review.attestationEventId);
				}
			}

			for (const review of reviewsGiven.reviews) {
				if (review.contractId) {
					uniqueContractIds.add(review.contractId);
				} else {
					uniqueContractIds.add(review.attestationEventId);
				}
			}

			tasksCompleted = uniqueContractIds.size;

			// Rating from received reviews sample
			reviewStats =
				reviewsReceived.reviews.length > 0 ? calculateReviewStats(reviewsReceived.reviews) : null;
		} catch (error) {
			console.error('Failed to load user reviews:', error);
			reviewStats = null;
			tasksCompleted = 0;
		} finally {
			isLoadingReviews = false;
		}
	}

	// ── Profile loading with Promise.allSettled ────────────────────
	async function loadProfile() {
		if (!hexPubkey) {
			profileError = $t('common.profile.invalid_npub');
			loadingProfile = false;
			return;
		}

		try {
			loadingProfile = true;
			profileError = null;

			const results = await Promise.allSettled([
				fetchComprehensiveProfile(hexPubkey),
				loadUserReviews(hexPubkey)
			]);

			const profileResult = results[0];
			if (profileResult.status === 'fulfilled') {
				userProfile = profileResult.value;
				if (!userProfile || (!userProfile.name && !userProfile.about && !userProfile.picture)) {
					profileError = $t('common.profile.no_profile_data');
				}
			} else {
				profileError =
					profileResult.reason instanceof Error
						? profileResult.reason.message
						: $t('common.profile.failed_to_load');
			}
		} catch (error) {
			profileError = error instanceof Error ? error.message : $t('common.profile.failed_to_load');
		} finally {
			loadingProfile = false;
		}
	}

	// ── Mount ──────────────────────────────────────────────────────
	onMount(async () => {
		const validation = validateNpub(page.params.npub);
		if (!validation.valid) {
			validationError = validation.error || $t('common.profile.invalid_npub');
			loadingProfile = false;
			return;
		}
		hexPubkey = validation.hexPubkey || null;
		await loadProfile();
	});
</script>

<!-- Skip to content (accessibility) -->
<a
	href="#services"
	class="focus:bg-base-100 sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded focus:p-3 focus:shadow-lg"
>
	{$t('common.skip_to_content')}
</a>

<div class="bg-base-200 min-h-screen">
	{#if validationError}
		<!-- Validation error -->
		<div class="mx-auto max-w-6xl px-4 py-8">
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
		<!-- Skeleton loading -->
		<div class="mx-auto max-w-6xl px-4 py-6">
			<div class="animate-pulse space-y-6">
				<div class="bg-base-300 h-48 rounded-2xl"></div>
				<div class="bg-base-300 h-12 rounded-lg"></div>
				<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
					<div class="bg-base-300 h-64 rounded-2xl lg:col-span-2"></div>
					<div class="bg-base-300 h-64 rounded-2xl"></div>
				</div>
			</div>
		</div>
	{:else if profileError}
		<!-- Profile error -->
		<div class="mx-auto max-w-6xl px-4 py-8">
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
		<!-- Top action row: back (mobile) + report/share (all) -->
		<div class="mx-auto max-w-6xl px-4 pt-4">
			<div class="flex items-center justify-between">
				<div class="md:hidden">
					<button
						class="btn btn-secondary btn-sm"
						onclick={() => {
							if (typeof window !== 'undefined') window.history.back();
						}}
					>
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M10 19l-7-7m0 0l7-7m-7 7h18"
							/></svg
						>
						{$t('common.back_2')}
					</button>
				</div>
				<div class="hidden md:block"></div>
				<div class="flex items-center gap-1">
					<button
						class="btn btn-ghost btn-xs btn-circle text-base-content/50 hover:text-base-content"
						aria-label={$t('common.share')}
						title={$t('common.share')}
						onclick={() => {
							if (navigator.share) {
								navigator.share({ title: displayName, url: window.location.href });
							} else {
								navigator.clipboard.writeText(window.location.href);
							}
						}}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle
								cx="18"
								cy="19"
								r="3"
							/>
							<line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line
								x1="15.41"
								y1="6.51"
								x2="8.59"
								y2="10.49"
							/>
						</svg>
					</button>
					<ActionsMenu
						contentType="user"
						reportedPubkey={hexPubkey || ''}
						username={displayName}
						profileMode={true}
					/>
				</div>
			</div>
		</div>

		<!-- Profile Hero -->
		<div class="mx-auto max-w-6xl" data-hero>
			<ProfileHero
				profile={userProfile}
				hexPubkey={hexPubkey || ''}
				{displayName}
				{userPicture}
				rating={averageRating}
				{reviewCount}
				{tasksCompleted}
				skillsCount={userProfile?.skills?.length || 0}
				portfolioCount={userProfile?.portfolio?.length || 0}
				location={userProfile?.location}
				website={userProfile?.website}
				isLoading={false}
				isLoggedIn={$authState.isAuthenticated}
			/>
		</div>

		<!-- Section Navigation -->
		<ProfileNav />

		<!-- Main content: single column mobile, two columns desktop -->
		<div class="page-content mx-auto max-w-6xl px-4 py-6">
			<div class="flex flex-col gap-6 lg:flex-row">
				<!-- Main content column -->
				<main class="min-w-0 flex-1 space-y-6">
					<!-- About Section -->
					<div use:observeSection={'about'} id="about" class="scroll-mt-20">
						<section aria-labelledby="about-heading">
							<ProfileAboutSection
								profile={userProfile}
								skills={userProfile?.skills || []}
								languages={userProfile?.languages || []}
								certifications={userProfile?.certifications || []}
								education={[]}
								availability={userProfile?.availability}
							/>
						</section>
					</div>

					<!-- Video Introduction -->
					{#if userProfile?.videoIntro?.uid}
						<div class="w-full overflow-hidden rounded-2xl shadow-lg">
							<StreamPlayer
								videoUid={userProfile.videoIntro.uid}
								poster={userProfile.videoIntro.thumbnailUrl || null}
								autoplay={true}
								muted={true}
								loop={true}
								aspectRatio="video"
								ariaLabel={$t('common.profile.video_introduction')}
							/>
						</div>
					{/if}

					<div use:observeSection={'services'}>
						<ProfileServicesSection
							pubkey={hexPubkey || ''}
							isActive={visibleSections.has('services')}
							id="services"
						/>
					</div>

					<div use:observeSection={'portfolio'}>
						<ProfilePortfolioSection
							pubkey={hexPubkey || ''}
							isActive={visibleSections.has('portfolio')}
							id="portfolio"
						/>
					</div>

					<div use:observeSection={'reviews'}>
						<ProfileReviewsSection
							pubkey={hexPubkey || ''}
							isActive={visibleSections.has('reviews')}
							id="reviews"
						/>
					</div>

					<div use:observeSection={'tasks'}>
						<ProfileTasksSection
							pubkey={hexPubkey || ''}
							isActive={visibleSections.has('tasks')}
							id="tasks"
						/>
					</div>
				</main>

				<!-- Sidebar - desktop only -->
				<aside class="hidden lg:block lg:w-80 xl:w-96">
					<div class="sticky top-32">
						<ProfileSidebar
							hexPubkey={hexPubkey || ''}
							username={userProfile?.name || ''}
							rating={averageRating}
							{reviewCount}
							{tasksCompleted}
							skillsCount={userProfile?.skills?.length || 0}
							portfolioCount={userProfile?.portfolio?.length || 0}
							availability={userProfile?.availability}
							isLoading={isLoadingReviews}
						/>
					</div>
				</aside>
			</div>
		</div>

		<!-- Mobile sticky CTA handled by ProfileHero component -->
	{/if}
</div>

<style>
	.sticky-cta-bar {
		position: sticky;
		bottom: 0;
		z-index: 20;
		background: var(--b1, oklch(var(--b1)));
		box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
		padding-bottom: env(safe-area-inset-bottom, 0px);
	}
	.page-content {
		padding-bottom: calc(4rem + env(safe-area-inset-bottom, 0px));
	}
</style>
