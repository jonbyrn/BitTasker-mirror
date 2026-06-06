<script lang="ts">
	import type { NostrProfile } from '$lib/types/profile.d';
	import type { Service, QuoteRequestPayload } from '$lib/types/service.d';
	import { t, locale } from 'svelte-i18n';
	import Avatar from '$lib/components/Avatar.svelte';
	import RequestQuoteModal from '$lib/components/service/RequestQuoteModal.svelte';
	import { getTranslatedProfileContent } from '$lib/utils/profileTranslation';
	import { publishServiceQuoteRequest } from '$lib/utils/service-quote/publish';
	import { appStore } from '$lib/stores/app.store';
	import { ServicePricingTypeEnum, ServiceLocationTypeEnum } from '$lib/utils/enums/service.enum';
	import KINDS from '$lib/utils/constants/kinds';
	import IconStar from '~icons/mdi/star';
	import IconGlobe from '~icons/mdi/earth';
	import IconLink from '~icons/mdi/link-variant';
	import { goto } from '$app/navigation';

	let {
		profile,
		hexPubkey,
		displayName,
		userPicture,
		rating,
		reviewCount = 0,
		tasksCompleted = 0,
		skillsCount = 0,
		portfolioCount = 0,
		location,
		website,
		isLoading = false,
		isLoggedIn = false
	}: {
		profile: NostrProfile | null;
		hexPubkey: string;
		displayName: string;
		userPicture: string;
		rating: number | null;
		reviewCount?: number;
		tasksCompleted?: number;
		skillsCount?: number;
		portfolioCount?: number;
		location?: string;
		website?: string;
		isLoading?: boolean;
		isLoggedIn?: boolean;
	} = $props();

	function scrollToReviews(e: MouseEvent) {
		e.preventDefault();
		const target = document.getElementById('reviews');
		if (target) {
			target.scrollIntoView({ behavior: 'smooth' });
			target.querySelector('h2, h3')?.setAttribute('tabindex', '-1');
			(target.querySelector('h2, h3') as HTMLElement | null)?.focus({ preventScroll: true });
		}
	}

	const currentLocale = $derived($locale || 'en');

	const translatedTitle = $derived(
		getTranslatedProfileContent(
			profile,
			'professionalTitle',
			currentLocale,
			profile?.professionalTitle || ''
		)
	);

	const formattedRating = $derived(rating !== null ? rating.toFixed(1) : null);

	const hasValidWebsite = $derived(
		!!website && (website.startsWith('http://') || website.startsWith('https://'))
	);

	const cleanWebsiteUrl = $derived(
		website ? website.replace(/^https?:\/\//, '').replace(/\/$/, '') : ''
	);

	// Virtual general-inquiry service for Hire Me flow
	const generalInquiryService = $derived({
		id: `general-${hexPubkey}`,
		uniqueId: `general-inquiry`,
		npub: hexPubkey,
		eventKind: KINDS.SERVICE_ACTIVE,
		createdAt: Math.floor(Date.now() / 1000),
		pricing: {
			type: ServicePricingTypeEnum.INQUIRY_REQUIRED,
			currency: 'USDt'
		},
		serviceLocationTypes: [ServiceLocationTypeEnum.REMOTE],
		creator: {
			username: displayName || '',
			avatar: userPicture || ''
		},
		skills: [],
		categories: [],
		serviceEventId: ''
	} as unknown as Service); // Intentional: virtual general-inquiry service. Only id, uniqueId, npub, pricing.type, and creator fields are consumed by RequestQuoteModal and publishServiceQuoteRequest.

	let isQuoteModalOpen = $state(false);

	function handleHireMe() {
		if (!isLoggedIn) {
			goto(`/auth/signup?return=${encodeURIComponent(window.location.pathname)}`);
			return;
		}
		isQuoteModalOpen = true;
	}

	async function handleQuoteConfirm(payload: QuoteRequestPayload) {
		try {
			await publishServiceQuoteRequest({
				service: generalInquiryService,
				payload,
				quoteRequestId: crypto.randomUUID(),
				serviceEventId: ''
			});
			isQuoteModalOpen = false;
			appStore.showSuccessToast(
				$t('dashboard.services.detail.request_quote_modal.sent_successfully')
			);
		} catch (err) {
			console.error('Failed to send general inquiry:', err);
			appStore.showErrorToast($t('dashboard.services.detail.request_quote_modal.send_failed'));
		}
	}
</script>

{#if isLoading}
	<div class="animate-pulse space-y-4 p-4">
		<div class="bg-base-300 mx-auto h-24 w-24 rounded-full md:mx-0"></div>
		<div class="bg-base-300 h-6 w-48 rounded"></div>
		<div class="bg-base-300 h-4 w-32 rounded"></div>
	</div>
{:else}
	<section class="relative">
		<!-- Desktop layout -->
		<div class="hidden flex-col gap-6 p-6 md:flex md:flex-row">
			<!-- Avatar -->
			<div class="shrink-0">
				<Avatar picture={userPicture} name={displayName} size="2xl" />
			</div>

			<!-- Info + CTA -->
			<div class="flex flex-1 flex-col justify-center gap-2">
				<div class="flex items-center gap-2">
					<h1 class="text-base-content text-2xl font-bold">{displayName}</h1>
					{#if profile?.nip05}
						<span class="text-info" aria-label={$t('common.profile.verified')}>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5"
								viewBox="0 0 24 24"
								fill="currentColor"
							>
								<path
									d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
								/>
							</svg>
						</span>
					{/if}
					{#if formattedRating}
						<a
							href="#reviews"
							onclick={scrollToReviews}
							class="text-base-content/70 hover:text-base-content flex items-center gap-1 text-sm transition-colors"
							aria-label="{formattedRating} {$t('common.profile.out_of')} 5, {reviewCount} {$t(
								'common.reviews'
							)}"
						>
							<IconStar class="text-primary h-4 w-4" aria-hidden="true" />
							<span>{formattedRating}/5 ({reviewCount})</span>
						</a>
					{/if}
				</div>

				{#if translatedTitle}
					<p class="text-base-content/60 text-sm font-medium">{translatedTitle}</p>
				{/if}

				{#if location}
					<div class="text-base-content/50 flex items-center gap-1 text-sm">
						<IconGlobe class="h-4 w-4 shrink-0" aria-hidden="true" />
						<span>{location}</span>
					</div>
				{/if}

				{#if hasValidWebsite}
					<div class="text-base-content/50 flex items-center gap-1 text-sm">
						<IconLink class="h-4 w-4 shrink-0" aria-hidden="true" />
						<a
							href={website}
							target="_blank"
							rel="noopener noreferrer"
							class="link link-primary truncate"
						>
							{cleanWebsiteUrl}
						</a>
					</div>
				{/if}

				<div class="mt-2">
					<button class="btn btn-primary" onclick={handleHireMe}>
						{$t('common.profile.hire_me')}
					</button>
				</div>
			</div>
		</div>

		<!-- Mobile layout (avatar shown in top action row, not here) -->
		<div class="flex flex-col items-center gap-3 p-4 pt-0 md:hidden">
			<div class="text-center">
				<div class="flex items-center justify-center gap-2">
					<h1 class="text-base-content text-xl font-bold">{displayName}</h1>
					{#if profile?.nip05}
						<span class="text-info" aria-label={$t('common.profile.verified')}>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								viewBox="0 0 24 24"
								fill="currentColor"
							>
								<path
									d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
								/>
							</svg>
						</span>
					{/if}
				</div>

				{#if translatedTitle}
					<p class="text-base-content/60 mt-1 text-sm">{translatedTitle}</p>
				{/if}

				{#if location}
					<div class="text-base-content/50 mt-1 flex items-center justify-center gap-1 text-xs">
						<IconGlobe class="h-3 w-3 shrink-0" aria-hidden="true" />
						<span>{location}</span>
					</div>
				{/if}

				{#if hasValidWebsite}
					<div class="text-base-content/50 mt-1 flex items-center justify-center gap-1 text-xs">
						<IconLink class="h-3 w-3 shrink-0" aria-hidden="true" />
						<a
							href={website}
							target="_blank"
							rel="noopener noreferrer"
							class="link link-primary truncate"
						>
							{cleanWebsiteUrl}
						</a>
					</div>
				{/if}
			</div>

			<!-- Mobile 2x2 stats grid -->
			<div class="grid w-full max-w-xs grid-cols-2 gap-3">
				<div class="bg-base-200 rounded-lg p-3 text-center">
					<p class="text-base-content text-lg font-bold">{tasksCompleted}</p>
					<p class="text-base-content/60 text-xs">{$t('common.profile.tasks_completed')}</p>
				</div>
				<div class="bg-base-200 rounded-lg p-3 text-center">
					<a
						href="#reviews"
						onclick={scrollToReviews}
						class="hover:bg-base-300 -m-1 block rounded-lg p-1 transition-colors"
						aria-label="{formattedRating || '—'} {$t('common.profile.out_of')} 5, {reviewCount} {$t(
							'common.reviews'
						)}"
					>
						<div class="flex items-center justify-center gap-1">
							{#if formattedRating}
								<IconStar class="text-primary h-4 w-4" aria-hidden="true" />
								<p class="text-base-content text-lg font-bold">
									{formattedRating}{#if reviewCount > 0}
										({reviewCount}){/if}
								</p>
							{:else}
								<p class="text-base-content text-lg font-bold">—</p>
							{/if}
						</div>
						<p class="text-base-content/60 text-xs">{$t('common.profile.rating')}</p>
					</a>
				</div>
				<div class="bg-base-200 rounded-lg p-3 text-center">
					<p class="text-base-content text-lg font-bold">{skillsCount}</p>
					<p class="text-base-content/60 text-xs">{$t('common.profile.skills')}</p>
				</div>
				<div class="bg-base-200 rounded-lg p-3 text-center">
					<p class="text-base-content text-lg font-bold">{portfolioCount}</p>
					<p class="text-base-content/60 text-xs">{$t('common.profile.portfolio')}</p>
				</div>
			</div>
		</div>
	</section>

	<!-- Mobile sticky CTA bar -->
	<div
		class="bg-base-100 sticky bottom-0 z-20 shadow-[0_-2px_10px_rgba(0,0,0,0.1)] md:hidden"
		style="padding-bottom: env(safe-area-inset-bottom, 0px);"
	>
		<div class="p-3">
			<button class="btn btn-primary w-full" onclick={handleHireMe}>
				{$t('common.profile.hire_me')}
			</button>
		</div>
	</div>
{/if}

{#if isQuoteModalOpen}
	<RequestQuoteModal
		bind:open={isQuoteModalOpen}
		service={generalInquiryService}
		onConfirm={handleQuoteConfirm}
		onClose={() => (isQuoteModalOpen = false)}
	/>
{/if}
