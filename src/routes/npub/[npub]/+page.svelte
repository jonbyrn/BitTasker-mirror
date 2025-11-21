<script lang="ts">
	import { page } from '$app/stores';
	import Avatar from '$lib/components/Avatar.svelte';
	import { onMount, onDestroy } from 'svelte';
	import { fetchComprehensiveProfile } from '$lib/utils/nostr-message';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import { nip19 } from 'nostr-tools';
	import { authState } from '$lib/stores/auth.store';
	import { Preferences } from '@capacitor/preferences';
	import { StorageKeys } from '$lib/utils/constants/storage';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';
	import { formatStandardDateShort } from '$lib/utils/helpers/dateFormatter';
	import { locale } from 'svelte-i18n';
	import { browser } from '$app/environment';
	import { getProfileUrl } from '$lib/utils/helpers/profile';

	// Get npub from route params
	let routeNpub = $derived($page.params.npub);

	// State for validated hex pubkey
	let hexPubkey = $state<string | null>(null);
	let validationError = $state<string | null>(null);

	// Authentication and owner state
	let currentUserNpub = $state<string | null>(null);
	let isOwner = $derived(currentUserNpub !== null && currentUserNpub === routeNpub);
	let isAuthenticated = $derived($authState.isAuthenticated);

	// Profile data
	let userProfile = $state<{
		name?: string;
		about?: string;
		picture?: string;
		pictures?: Array<{ url: string; type: string; alt: string; key?: string; isPrimary?: boolean }>;
		website?: string;
		professionalTitle?: string;
		skills?: Array<
			| string
			| {
					name: string;
					level: number;
					verificationStatus?: string;
					endorsements?: number;
					certifications?: any[];
			  }
		>;
		portfolio?: Array<{
			id: string;
			title: string;
			description: string;
			images: any[];
			completionDate: string;
			skills: string[];
		}>;
		availability?: {
			timeSlots: any[];
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
		nip05?: string;
	} | null>(null);
	let loadingProfile = $state(true);
	let profileError = $state<string | null>(null);

	// Message modal state
	let showMessageModal = $state(false);
	let messageText = $state('');
	let sendingMessage = $state(false);
	let messageError = $state('');
	let messageSuccess = $state(false);

	// Share modal state
	let showShareModal = $state(false);
	let qrCodeDataUrl = $state<string | null>(null);
	let qrCodeLoading = $state(false);
	let qrCodeError = $state<string | null>(null);
	let copyLinkSuccess = $state(false);
	let copyNpubSuccess = $state(false);

	// Portfolio carousel state
	let currentSlide = $state(0);
	let intervalId: number;

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
			} catch (error) {
				return { valid: false, error: $t('common.profile.invalid_npub_format') };
			}
		}

		// Check if it's a hex pubkey (64 characters)
		if (/^[a-fA-F0-9]{64}$/.test(npub)) {
			return { valid: true, hexPubkey: npub };
		}

		return { valid: false, error: $t('common.profile.invalid_npub_format') };
	}

	// Load user profile
	async function loadUserProfile() {
		if (!hexPubkey) {
			profileError = $t('common.profile.invalid_npub');
			loadingProfile = false;
			return;
		}

		try {
			loadingProfile = true;
			profileError = null;

			const profile = await fetchComprehensiveProfile(hexPubkey);
			userProfile = profile;
		} catch (error) {
			profileError = error instanceof Error ? error.message : $t('common.profile.failed_to_load');
		} finally {
			loadingProfile = false;
		}
	}

	// Check if current user is owner (only if authenticated)
	async function checkOwnerStatus() {
		if (!isAuthenticated) {
			currentUserNpub = null;
			return;
		}

		try {
			// Use direct Preferences read pattern (no biometric prompts)
			const { value } = await Preferences.get({ key: StorageKeys.NPUB });
			currentUserNpub = value || null;
		} catch (error) {
			console.error('Failed to get current user npub:', error);
			currentUserNpub = null;
		}
	}

	// Portfolio carousel functions
	function nextSlide() {
		if (userProfile?.portfolio && userProfile.portfolio.length > 0) {
			currentSlide = (currentSlide + 1) % userProfile.portfolio.length;
		}
	}

	function goToSlide(index: number) {
		currentSlide = index;
	}

	// Message functions
	function openMessageModal() {
		if (!isAuthenticated) {
			// Redirect to login with return URL
			const returnUrl = encodeURIComponent(`/npub/${routeNpub}`);
			goto(`/auth/login?redirect=${returnUrl}`);
			return;
		}
		showMessageModal = true;
		messageText = '';
		messageError = '';
		messageSuccess = false;
	}

	function closeMessageModal() {
		showMessageModal = false;
		messageText = '';
		messageError = '';
		messageSuccess = false;
		sendingMessage = false;
	}

	async function sendMessage() {
		if (!messageText.trim() || !hexPubkey) {
			messageError = $t('common.profile.please_enter_message');
			return;
		}

		sendingMessage = true;
		messageError = '';

		try {
			const { sendDirectMessage } = await import('$lib/utils/nostr-message');
			await sendDirectMessage(messageText.trim(), hexPubkey);

			messageSuccess = true;
			messageText = '';

			setTimeout(() => {
				closeMessageModal();
			}, 2000);
		} catch (error) {
			console.error('Error sending message:', error);
			messageError = $t('common.profile.failed_to_send_message');
		} finally {
			sendingMessage = false;
		}
	}

	// Share functions
	function openShareModal() {
		showShareModal = true;
		generateQrCode();
	}

	function closeShareModal() {
		showShareModal = false;
		copyLinkSuccess = false;
		copyNpubSuccess = false;
	}

	async function generateQrCode() {
		if (!browser) return;

		try {
			qrCodeLoading = true;
			qrCodeError = null;

			const profileUrl = `${window.location.origin}/npub/${routeNpub}`;
			const qrUrl = await generateQrCodeUrl(profileUrl);
			qrCodeDataUrl = qrUrl;
		} catch (error) {
			console.error('Failed to generate QR code:', error);
			qrCodeError = $t('common.profile.qr_generation_failed');
		} finally {
			qrCodeLoading = false;
		}
	}

	async function copyProfileLink() {
		if (!browser) return;

		const profileUrl = `${window.location.origin}/npub/${routeNpub}`;
		const success = await copyToClipboard(profileUrl);
		if (success) {
			copyLinkSuccess = true;
			setTimeout(() => {
				copyLinkSuccess = false;
			}, 2000);
		}
	}

	async function copyNpub() {
		if (!routeNpub) return;

		const success = await copyToClipboard(routeNpub);
		if (success) {
			copyNpubSuccess = true;
			setTimeout(() => {
				copyNpubSuccess = false;
			}, 2000);
		}
	}

	// Format date helper - Month and Year format (e.g., "Sep, 2025")
	function formatDate(dateString: string | undefined): string {
		if (!dateString) return '';
		try {
			const date = new Date(dateString);
			if (isNaN(date.getTime())) return dateString;
			
			// Format as "Month, Year" (e.g., "Sep, 2025" or "Sep, 2025")
			return new Intl.DateTimeFormat($locale || 'en', {
				month: 'short',
				year: 'numeric'
			}).format(date);
		} catch {
			return dateString;
		}
	}

	// Watch for auth state changes and update owner status
	$effect(() => {
		// React to auth state changes
		if (browser && isAuthenticated !== undefined) {
			checkOwnerStatus();
		}
	});

	// Initialize on mount
	onMount(async () => {
		// Validate npub parameter
		const validation = validateNpub(routeNpub);
		if (!validation.valid) {
			validationError = validation.error || $t('common.profile.invalid_npub');
			loadingProfile = false;
			return;
		}

		hexPubkey = validation.hexPubkey || null;

		// Check owner status (only if authenticated)
		await checkOwnerStatus();

		// Load profile
		await loadUserProfile();

		// Auto-advance portfolio slides
		if (userProfile?.portfolio && userProfile.portfolio.length > 1) {
			intervalId = setInterval(() => {
				nextSlide();
			}, 3000) as unknown as number;
		}
	});

	onDestroy(() => {
		if (intervalId) {
			clearInterval(intervalId);
		}
	});
</script>

<div class="bg-base-200 mx-auto px-2 w-full">
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
		<!-- Skeleton Loading -->
		<div class="bg-base-200 mx-auto px-2 md:px-0">
			<div class="py-6">
				<div class="mx-auto">
					<div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-4">
						<div class="lg:col-span-3">
							<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
								<div class="card-body p-4">
									<div class="flex flex-col items-center gap-6 lg:flex-row lg:items-start">
										<div class="flex-shrink-0">
											<div class="bg-base-300 h-20 w-20 animate-pulse rounded-full"></div>
										</div>
										<div class="flex-1 text-center lg:text-left">
											<div
												class="mb-2 flex flex-col items-center gap-2 lg:flex-row lg:items-center lg:justify-between"
											>
												<div class="bg-base-300 h-6 w-32 animate-pulse rounded"></div>
											</div>
											<div class="bg-base-300 mb-4 h-6 w-24 animate-pulse rounded"></div>
											<div
												class="mb-4 flex flex-wrap items-center justify-center gap-2 lg:justify-start"
											>
												<div class="bg-base-300 h-4 w-24 animate-pulse rounded"></div>
												<div class="bg-base-300 h-4 w-20 animate-pulse rounded"></div>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>
						<div class="lg:col-span-1">
							<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
								<div class="card-body p-3">
									<div class="bg-base-300 mb-2 h-6 w-32 animate-pulse rounded"></div>
									<div class="space-y-1">
										{#each Array(4) as _}
											<div class="flex items-center justify-between">
												<div class="bg-base-300 h-4 w-20 animate-pulse rounded"></div>
												<div class="bg-base-300 h-4 w-8 animate-pulse rounded"></div>
											</div>
										{/each}
									</div>
								</div>
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
		<!-- Hero Section -->
		<div class="py-6">
			<div class="mx-auto w-full lg:max-w-7xl">
				<div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-4">
					<!-- Main Profile Info -->
					<div class="lg:col-span-3">
						<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
							<div class="card-body p-4">
								<div class="flex flex-col items-center gap-6 lg:flex-row lg:items-start">
									<!-- Avatar -->
									<div class="flex-shrink-0">
										<div class="h-32 w-32">
											<Avatar
												name={userProfile?.name}
												picture={userProfile?.picture}
												size="2xl"
											/>
										</div>
									</div>

									<!-- Profile Info -->
									<div class="flex-1 text-center lg:text-left">
										<div
											class="mb-2 flex flex-col items-center gap-2 lg:flex-row lg:items-center lg:justify-between"
										>
											<div class="flex flex-col items-center gap-2 lg:flex-row lg:items-start">
												<h3 class="text-base-content font-bold">
													{userProfile?.name || 'Unknown User'}
												</h3>
												<!-- NIP-05 Verification Badge (Mobile: shown here) -->
												{#if userProfile?.nip05}
													<div class="badge badge-success badge-sm lg:hidden">
														✓ {userProfile.nip05}
													</div>
												{/if}
											</div>
											<!-- Owner Edit Button -->
											{#if isOwner}
												<button
													class="btn btn-primary btn-sm"
													onclick={() => goto('/dashboard/profile/edit')}
												>
													{$t('common.profile.edit_profile')}
												</button>
											{/if}
										</div>
										{#if userProfile?.professionalTitle}
											<div class="badge badge-primary badge-lg mb-4 px-3 py-1 text-sm">
												{userProfile.professionalTitle}
											</div>
										{/if}

										<!-- Additional Info -->
										<div
											class="text-base-content/70 mb-4 flex flex-wrap items-center justify-center gap-2 lg:justify-start"
										>
											{#if userProfile?.createdAt}
												<div class="flex items-center gap-2">
													<svg
														class="h-4 w-4"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 01-2 2v12a2 2 0 002 2z"
														/>
													</svg>
													<span>{formatDate(userProfile.createdAt)}</span>
												</div>
											{/if}
											{#if userProfile?.website}
												<a
													href={userProfile.website}
													target="_blank"
													rel="noopener noreferrer"
													class="hover:text-primary flex items-center gap-2 transition-colors"
												>
													<svg
														class="h-4 w-4"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
													>
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

										<!-- Quick Actions (Mobile & Tablet) -->
										<div class="flex flex-wrap justify-center gap-3 lg:hidden">
											{#if isAuthenticated}
												<button class="btn btn-primary btn-sm" onclick={openMessageModal}>
													<svg
														class="h-4 w-4"
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
													{$t('common.profile.send_message')}
												</button>
											{:else}
												<button class="btn btn-primary btn-sm" onclick={openMessageModal}>
													{$t('common.profile.sign_in_to_message')}
												</button>
											{/if}
											<button class="btn btn-outline btn-sm" onclick={openShareModal}>
												<svg
													class="h-4 w-4"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M8.684 13.342c-.396 0-.72-.324-.72-.72 0-.396.324-.72.72-.72.396 0 .72.324.72.72 0 .396-.324.72-.72.72zm0-2.829c-.747 0-1.355.608-1.355 1.355 0 .747.608 1.355 1.355 1.355.747 0 1.355-.608 1.355-1.355 0-.747-.608-1.355-1.355-1.355zm6.564 0c-.396 0-.72-.324-.72-.72 0-.396.324-.72.72-.72.396 0 .72.324.72.72 0 .396-.324.72-.72.72zm0-2.829c-.747 0-1.355.608-1.355 1.355 0 .747.608 1.355 1.355 1.355.747 0 1.355-.608 1.355-1.355 0-.747-.608-1.355-1.355-1.355z"
													/>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
													/>
												</svg>
												{$t('common.profile.share')}
											</button>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>

					<!-- Sidebar: Performance Stats (Desktop) -->
					<div class="hidden lg:block lg:col-span-1">
						<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
							<div class="card-body p-3">
								<p class="mb-2 text-xl font-bold">{$t('common.profile.performance_stats')}</p>
								<div class="space-y-1">
									<div class="flex items-center justify-between">
										<span class="text-base-content/70 text-sm"
											>{$t('common.profile.tasks_completed')}</span
										>
										<span class="text-primary text-lg font-bold">
											{userProfile?.reviews?.length || 0}
										</span>
									</div>
									<div class="flex items-center justify-between">
										<span class="text-base-content/70 text-sm">{$t('common.profile.rating')}</span>
										<div class="flex items-center gap-1">
											{#if userProfile?.reviews && userProfile.reviews.length > 0}
												{@const avgRating =
													userProfile.reviews.reduce((sum, review) => sum + review.rating, 0) /
													userProfile.reviews.length}
												<span class="text-lg font-bold">{avgRating.toFixed(1)}</span>
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
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Main Content -->
		<div class="mx-auto w-full lg:max-w-7xl">
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-4">
				<!-- Main Content - 3 columns -->
				<div class="space-y-6 lg:col-span-3">
					<!-- About Section -->
					<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
						<div class="card-body p-4">
							<p class="mb-2 text-xl font-bold">{$t('common.profile.about')}</p>
							<p class="text-base-content/80 line-clamp-2 text-sm leading-relaxed">
								{userProfile?.about || $t('common.profile.no_description')}
							</p>
						</div>

						<!-- Skills Section -->
						<div class="card-body p-4">
							<p class="mb-2 text-xl font-bold">{$t('common.profile.skills_expertise')}</p>
							<div class="flex flex-wrap gap-2">
								{#if userProfile?.skills && userProfile.skills.length > 0}
									{#each userProfile.skills as skill}
										<div
											class="border-primary text-primary rounded-full border px-3 py-1 text-sm"
										>
											{typeof skill === 'string' ? skill : skill.name}
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
								<div class="relative overflow-hidden rounded-2xl">
									<div
										class="flex transition-transform duration-500 ease-in-out"
										style="transform: translateX(-{currentSlide * 100}%)"
									>
										{#each userProfile.portfolio as project}
											<div class="w-full flex-shrink-0">
												<div class="relative">
													{#if project.images && project.images.length > 0}
														{#if typeof project.images[0] === 'string'}
															<img
																src={project.images[0]}
																alt={project.title}
																class="h-64 w-full object-cover"
																loading="lazy"
															/>
														{:else if project.images[0]?.url}
															<img
																src={project.images[0].url}
																alt={project.title}
																class="h-64 w-full object-cover"
																loading="lazy"
															/>
														{:else}
															<div
																class="bg-base-300 flex h-64 w-full items-center justify-center"
															>
																<span class="text-base-content/60"
																	>{$t('common.profile.no_image_available')}</span
																>
															</div>
														{/if}
													{:else}
														<div class="bg-base-300 flex h-64 w-full items-center justify-center">
															<span class="text-base-content/60"
																>{$t('common.profile.no_image_available')}</span
															>
														</div>
													{/if}
													<div
														class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"
													></div>
													<div class="absolute right-4 bottom-4 left-4 text-white">
														<h3 class="mb-2 text-xl font-bold">{project.title}</h3>
														<p class="mb-3 line-clamp-2 text-sm opacity-90">
															{project.description}
														</p>
														<div class="flex flex-wrap gap-1">
															{#if project.skills && project.skills.length > 0}
																{#each project.skills as skill}
																	<span
																		class="rounded-full bg-white/20 px-2 py-1 text-xs text-white"
																	>
																		{skill}
																	</span>
																{/each}
															{/if}
														</div>
													</div>
												</div>
											</div>
										{/each}
									</div>

									<!-- Slide Indicators -->
									<div class="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
										{#each userProfile.portfolio as _, index}
											<button
												onclick={() => goToSlide(index)}
												class="h-4 w-4 cursor-pointer rounded-full transition-all duration-300 {currentSlide ===
												index
													? 'bg-white'
													: 'bg-white/50'}"
											>
												{' '}
											</button>
										{/each}
									</div>
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
				</div>

				<!-- Sidebar - 1 column -->
				<div class="space-y-6 lg:col-span-1">
					<!-- Availability Card (Mobile: shown above, Desktop: in sidebar) -->
					<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
						<div class="card-body p-3">
							<p class="mb-2 text-xl font-bold">{$t('common.profile.availability')}</p>
							<div class="space-y-2">
								<div class="flex items-center gap-2">
									{#if userProfile?.availability?.timeSlots &&
									userProfile.availability.timeSlots.length > 0}
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

					<!-- Quick Actions (Desktop) -->
					<div class="hidden lg:block">
						<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
							<div class="card-body p-3">
								<p class="mb-2 text-xl font-bold">{$t('common.profile.quick_actions')}</p>
								<div class="space-y-3">
									{#if isAuthenticated}
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
									{:else}
										<button class="btn btn-primary btn-sm w-full" onclick={openMessageModal}>
											{$t('common.profile.sign_in_to_message')}
										</button>
									{/if}
									<button class="btn btn-outline btn-sm w-full" onclick={openShareModal}>
										<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M8.684 13.342c-.396 0-.72-.324-.72-.72 0-.396.324-.72.72-.72.396 0 .72.324.72.72 0 .396-.324.72-.72.72zm0-2.829c-.747 0-1.355.608-1.355 1.355 0 .747.608 1.355 1.355 1.355.747 0 1.355-.608 1.355-1.355 0-.747-.608-1.355-1.355-1.355zm6.564 0c-.396 0-.72-.324-.72-.72 0-.396.324-.72.72-.72.396 0 .72.324.72.72 0 .396-.324.72-.72.72zm0-2.829c-.747 0-1.355.608-1.355 1.355 0 .747.608 1.355 1.355 1.355.747 0 1.355-.608 1.355-1.355 0-.747-.608-1.355-1.355-1.355z"
											/>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
											/>
										</svg>
										{$t('common.profile.share')}
									</button>
								</div>
							</div>
						</div>
					</div>

					<!-- Performance Stats (Mobile: shown above) -->
					<div class="block lg:hidden">
						<div class="card bg-base-100 w-full rounded-2xl shadow-lg">
							<div class="card-body p-3">
								<p class="mb-2 text-xl font-bold">{$t('common.profile.performance_stats')}</p>
								<div class="space-y-1">
									<div class="flex items-center justify-between">
										<span class="text-base-content/70 text-sm"
											>{$t('common.profile.tasks_completed')}</span
										>
										<span class="text-primary text-lg font-bold">
											{userProfile?.reviews?.length || 0}
										</span>
									</div>
									<div class="flex items-center justify-between">
										<span class="text-base-content/70 text-sm">{$t('common.profile.rating')}</span>
										<div class="flex items-center gap-1">
											{#if userProfile?.reviews && userProfile.reviews.length > 0}
												{@const avgRating =
													userProfile.reviews.reduce((sum, review) => sum + review.rating, 0) /
													userProfile.reviews.length}
												<span class="text-lg font-bold">{avgRating.toFixed(1)}</span>
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
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- Message Modal -->
{#if showMessageModal}
	<div class="modal modal-open">
		<div class="modal-box max-w-md">
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
							To: {userProfile?.name || 'Unknown User'}
						</p>
					</div>
				</div>
			</div>

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
						placeholder={$t('common.profile.type_message_placeholder')}
						bind:value={messageText}
						rows="4"
						disabled={sendingMessage}
					></textarea>
				</div>

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

<!-- Share Modal -->
{#if showShareModal}
	<div class="modal modal-open">
		<div class="modal-box max-w-md">
			<div class="mb-6">
				<h3 class="text-lg font-bold">{$t('common.profile.share_profile')}</h3>
			</div>

			<div class="space-y-4">
				<!-- QR Code -->
				<div class="flex flex-col items-center">
					{#if qrCodeLoading}
						<div class="flex h-64 w-64 items-center justify-center">
							<span class="loading loading-spinner loading-lg"></span>
						</div>
					{:else if qrCodeError}
						<div class="alert alert-error alert-outline">
							<span>{qrCodeError}</span>
						</div>
					{:else if qrCodeDataUrl}
						<img src={qrCodeDataUrl} alt="Profile QR Code" class="h-64 w-64" />
					{/if}
				</div>

				<!-- Copy Link Button -->
				<button class="btn btn-primary btn-block" onclick={copyProfileLink}>
					{#if copyLinkSuccess}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 13l4 4L19 7"
							/>
						</svg>
						{$t('common.profile.copied')}
					{:else}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
							/>
						</svg>
						{$t('common.profile.copy_link')}
					{/if}
				</button>

				<!-- Copy npub Button -->
				<button class="btn btn-outline btn-block" onclick={copyNpub}>
					{#if copyNpubSuccess}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 13l4 4L19 7"
							/>
						</svg>
						{$t('common.profile.copied')}
					{:else}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
							/>
						</svg>
						{$t('common.profile.copy_npub')}
					{/if}
				</button>
			</div>

			<div class="modal-action">
				<button class="btn btn-ghost" onclick={closeShareModal}>
					{$t('common.close')}
				</button>
			</div>
		</div>
		<button class="modal-backdrop" onclick={closeShareModal}>X</button>
	</div>
{/if}

