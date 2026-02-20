<script lang="ts">
	import type { Service, ServiceTier } from '$lib/types/service.d';
	import type { Attachment } from '$lib/types/task.d';
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { format } from 'date-fns';
	import { authState } from '$lib/stores/auth.store';
	import { user } from '$lib/stores/user.store';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
	import Gallery from '$lib/components/Gallery.svelte';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';

	let { service, serviceId } = $props<{
		service: Service | null;
		serviceId: string;
	}>();

	const isOwner = $derived(service?.npub === $user?.npub);
	const isLoggedIn = $derived($authState.isAuthenticated);

	let descriptionExpanded = $state(false);
	const DESCRIPTION_PREVIEW_LENGTH = 300;
	const descriptionNeedsExpand = $derived(
		!!service?.description && service.description.length > DESCRIPTION_PREVIEW_LENGTH
	);
	const descriptionPreview = $derived(
		service?.description?.slice(0, DESCRIPTION_PREVIEW_LENGTH).trim() ?? ''
	);
	const descriptionDisplay = $derived(
		descriptionExpanded || !descriptionNeedsExpand ? (service?.description ?? '') : descriptionPreview + '...'
	);

	const tiersWithPrice = $derived(
		(service?.pricing?.tiers ?? []).filter((t: ServiceTier) => (t.price ?? 0) > 0)
	);

	function translateCategory(category: { id: string; name: string } | string): string {
		const id = typeof category === 'string' ? category : category.id;
		const cat = TASK_CATEGORIES.find((c) => c.id === id);
		if (cat) {
			const translated = $t(`categories.${cat.slug}.name`);
			return translated.startsWith('categories.') ? cat.name : translated;
		}
		return typeof category === 'string' ? category : (category as { name: string }).name;
	}

	function isVideoFile(url: string): boolean {
		return /\.(mp4|webm|ogg|mov)$/i.test(url);
	}

	async function prepareGalleryImages(attachments: Attachment[]) {
		const imagePromises = attachments
			.filter((a) => a.url && !isVideoFile(a.url))
			.map(
				(attachment) =>
					new Promise<{ url: string; alt: string; width: number; height: number; size?: number }>((resolve) => {
						const img = new Image();
						img.onload = () =>
							resolve({
								url: attachment.url,
								alt: attachment.alt || ($t('dashboard.services.detail.attachment') as string),
								width: img.naturalWidth,
								height: img.naturalHeight,
								size: attachment.size
							});
						img.onerror = () =>
							resolve({
								url: attachment.url,
								alt: attachment.alt || ($t('dashboard.services.detail.attachment') as string),
								width: 0,
								height: 0,
								size: attachment.size
							});
						img.src = attachment.url;
					})
			);
		return Promise.all(imagePromises);
	}

	function formatDateString(date: string | number): string {
		const dateObj = typeof date === 'string' ? new Date(date) : new Date(date * 1000);
		return format(dateObj, 'MMM yyyy');
	}

	function handleContactTaskee() {
		if (!service?.npub) return;
		if (!isLoggedIn) {
			goto(`/auth/login?returnTo=${encodeURIComponent(window.location.pathname)}`);
			return;
		}
		goto(`/dashboard/messages/to/${service.npub}`);
	}
</script>

<div class="mx-auto max-w-6xl px-2 pb-24 md:px-0 md:pb-0">
	<div class="rounded-xl pt-4 md:pt-0">
		{#if !service}
			<div class="py-12 text-center">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-base-content/30 mx-auto h-12 w-12"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<h3 class="mt-4 text-lg font-semibold">
					{$t('dashboard.services.detail.not_found')}
				</h3>
				<p class="text-base-content/60 mt-1">
					{$t('dashboard.services.detail.not_found_message')}
				</p>
				<a href="/services" class="btn btn-primary mt-6">{$t('dashboard.services.detail.browse_services')}</a>
			</div>
		{:else}
			<div class="mb-6 flex items-center gap-3">
				<div class="flex-1 text-left">
					<h3 class="">{$t('dashboard.services.detail.title')}</h3>
					<p class="text-base-content/70">{$t('dashboard.services.detail.description')}</p>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
				<div class="space-y-4 lg:col-span-2">
					<div class="bg-base-100 border-base-300 rounded-2xl border p-6 shadow-sm">
						<span class="line-clamp-2 text-xl font-semibold">{service.title}</span>
						<div class="text-base-content/70 mt-2 whitespace-pre-line text-sm">
							{descriptionDisplay}
						</div>
						{#if descriptionNeedsExpand}
							<button
								type="button"
								class="btn btn-ghost btn-sm mt-2 text-primary"
								onclick={() => (descriptionExpanded = !descriptionExpanded)}
							>
								{descriptionExpanded ? $t('dashboard.services.detail.see_less') : $t('dashboard.services.detail.see_more')}
							</button>
						{/if}

						{#if service.categories?.length > 0}
							<div class="border-base-300 mt-6 border-t pt-4">
								<h4 class="mb-2 font-semibold">{$t('dashboard.services.create.review.categories_label')}</h4>
								<div class="flex flex-wrap gap-2">
									{#each service.categories as category}
										<span class="badge badge-primary badge-outline badge-sm">
											{translateCategory(category)}
										</span>
									{/each}
								</div>
							</div>
						{/if}

						{#if service.skills?.length > 0}
							<div class="border-base-300 mt-4 border-t pt-4">
								<h4 class="mb-2 font-semibold">{$t('dashboard.services.create.review.skills_label')}</h4>
								<div class="flex flex-wrap gap-2">
									{#each service.skills as skill}
										<span class="badge badge-secondary badge-sm">{skill}</span>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Location types -->
						{#if service.serviceLocationTypes?.length > 0}
							<div class="border-base-300 mt-4 border-t pt-4">
								<h4 class="mb-2 font-semibold">{$t('dashboard.services.create.review.location_types_label')}</h4>
								<div class="flex flex-wrap gap-2">
									{#each service.serviceLocationTypes as locationType}
										<span class="badge badge-accent badge-sm">
											{#if locationType === ServiceLocationTypeEnum.REMOTE}
												{$t('dashboard.services.create.location.remote_title')}
											{:else if locationType === ServiceLocationTypeEnum.TASKER_LOCATION}
												{$t('dashboard.services.create.location.tasker_title')}
											{:else if locationType === ServiceLocationTypeEnum.TASKEE_LOCATION}
												{$t('dashboard.services.create.location.taskee_title')}
											{:else}
												{locationType}
											{/if}
										</span>
									{/each}
								</div>
								{#if service.locationDetails?.taskerLocation?.serviceLocation?.formattedAddress}
									<p class="text-base-content/70 mt-2 text-sm">
										{service.locationDetails.taskerLocation.serviceLocation.formattedAddress}
									</p>
								{/if}
							</div>
						{/if}

						<!-- Pricing -->
						{#if service.pricing}
							<div class="border-base-300 mt-4 border-t pt-4">
								<h4 class="mb-2 font-semibold">{$t('dashboard.services.create.review.pricing_title')}</h4>
								<p class="text-base-content/70 text-sm">
									{#if service.pricing.type === ServicePricingTypeEnum.FIXED}
										{$t('dashboard.services.create.pricing.fixed_title')}: ${formatNumberWithTwoDecimals(service.pricing.amount ?? 0)} {service.pricing.currency}
										{#if service.pricing.deliveryTime?.display}
											 · {service.pricing.deliveryTime.display}
										{/if}
									{:else if service.pricing.type === ServicePricingTypeEnum.HOURLY}
										{$t('dashboard.services.create.pricing.hourly_title')}: ${formatNumberWithTwoDecimals(service.pricing.hourlyRate ?? 0)}/{$t('dashboard.services.create.pricing.hour')} {service.pricing.currency}
									{:else if service.pricing.type === ServicePricingTypeEnum.TIERED}
										{$t('dashboard.services.create.pricing.tiered_title')} · {$t('dashboard.services.browse.pricing.from_price')}
										{#if service.pricing.tiers?.length}
											${formatNumberWithTwoDecimals(Math.min(...service.pricing.tiers.map((t: ServiceTier) => t.price).filter((p: number) => p > 0)) || 0)}
										{/if}
									{:else}
										{$t('dashboard.services.browse.pricing.request_quote')}
									{/if}
								</p>
							</div>
						{/if}

						<!-- Add-ons -->
						{#if service.pricing?.addOns && service.pricing.addOns.length > 0}
							<div class="border-base-300 mt-4 border-t pt-4">
								<h4 class="mb-3 font-semibold">{$t('dashboard.services.create.review.addons_title')}</h4>
								<div class="flex flex-wrap gap-2">
									{#each service.pricing.addOns as addOn}
										<div class="badge badge-outline gap-1">
											{addOn.name} · ${formatNumberWithTwoDecimals(addOn.price)}
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Portfolio -->
						{#if service.portfolio && service.portfolio.length > 0}
							<div class="border-base-300 mt-4 border-t pt-4">
								<h4 class="mb-3 font-semibold">{$t('dashboard.services.detail.portfolio')}</h4>
								{#if service.portfolio.filter((a: Attachment) => a.url && !isVideoFile(a.url)).length > 0}
									{#await prepareGalleryImages(service.portfolio) then galleryImages}
										<Gallery
											galleryID="service-portfolio-gallery"
											images={galleryImages}
											thumbnailSize="h-40 w-40"
										/>
									{/await}
								{/if}
							</div>
						{/if}
					</div>
				</div>

				<!-- Sidebar -->
				<div class="lg:col-span-1">
					<div class="bg-base-100 sticky top-6 rounded-2xl p-6 shadow-sm">
						{#if isOwner}
							<div class="alert alert-info alert-outline">
								<span>{$t('dashboard.services.detail.you_are_provider')}</span>
							</div>
							<a
								href="/dashboard/list-service?edit=true&serviceId={service.uniqueId || service.id}"
								class="btn btn-primary btn-sm mt-4 w-full"
							>
								{$t('dashboard.services.detail.edit_service')}
							</a>
						{:else if service.status === 'active'}
							<div class="mb-6">
								<h4 class="mb-4">{$t('dashboard.services.detail.interested')}</h4>
								{#if service.pricing?.type === ServicePricingTypeEnum.INQUIRY_REQUIRED}
									<button
										class="btn btn-primary btn-sm w-full"
										onclick={handleContactTaskee}
									>
										{$t('dashboard.services.detail.request_quote')}
									</button>
								{:else}
									<button
										class="btn btn-primary btn-sm w-full"
										onclick={handleContactTaskee}
									>
										{$t('dashboard.services.detail.contact_taskee')}
									</button>
								{/if}
							</div>
						{:else}
							<div class="alert alert-warning alert-outline">
								<span>{$t('dashboard.services.detail.service_not_available')}</span>
							</div>
						{/if}

						{#if service.creator}
							<div class="border-base-300 mt-4 border-t pt-4">
								<h4 class="mb-3 font-semibold">{$t('dashboard.services.detail.taskee')}</h4>
								<div class="flex items-center gap-3">
									<div class="avatar">
										<div class="bg-base-300 flex h-12 w-12 items-center justify-center rounded-full">
											{#if service.creator.avatar}
												<img
													src={service.creator.avatar}
													alt={$t('dashboard.services.detail.avatar_alt')}
													class="h-12 w-12 rounded-full object-cover"
												/>
											{:else}
												<div class="avatar placeholder text-neutral-content bg-primary flex h-12 w-12 items-center justify-center rounded-full text-xl font-semibold">
													{service.creator.username?.charAt(0).toUpperCase() || '?'}
												</div>
											{/if}
										</div>
									</div>
									<div class="flex flex-col">
										<span class="font-medium">{service.creator.username || $t('dashboard.services.detail.anonymous')}</span>
										<p class="text-base-content/60 text-sm">
											{$t('dashboard.services.detail.member_since')} {formatDateString(service.createdAt)}
										</p>
									</div>
								</div>
							</div>
						{/if}

						<!-- Price levels (tiers) in sidebar - only when at least one tier has price > 0 -->
						{#if tiersWithPrice.length > 0}
							<div class="border-base-300 mt-4 border-t pt-4">
								<h4 class="mb-3 font-semibold">{$t('dashboard.services.detail.price_levels')}</h4>
								<div class="space-y-3">
									{#each tiersWithPrice as tier}
										<div class="bg-base-200 rounded-lg p-3">
											<div class="flex items-start justify-between gap-2">
												<div class="min-w-0 flex-1">
													<span class="font-medium">{tier.name}</span>
													{#if tier.isPopular}
														<span class="badge badge-primary badge-sm ml-1">{$t('dashboard.services.create.tiers.popular')}</span>
													{/if}
												</div>
												<span class="font-bold shrink-0">${formatNumberWithTwoDecimals(tier.price)}</span>
											</div>
											{#if tier.description}
												<p class="text-base-content/70 mt-1.5 line-clamp-3 text-xs">{tier.description}</p>
											{/if}
											{#if tier.deliveryTime?.display}
												<p class="text-base-content/60 mt-1 text-xs">{$t('dashboard.services.create.tiers.delivery_time_label')}: {tier.deliveryTime.display}</p>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<!-- FAQs (right sidebar) -->
						{#if service.faqs && service.faqs.length > 0}
							<div class="border-base-300 mt-4 border-t pt-4">
								<h4 class="mb-3 font-semibold">{$t('dashboard.services.detail.faqs')}</h4>
								<div class="space-y-3">
									{#each service.faqs as faq}
										<div class="collapse collapse-arrow bg-base-200">
											<input type="checkbox" />
											<div class="collapse-title font-medium text-sm">{faq.question}</div>
											<div class="collapse-content text-base-content/70 text-xs">{faq.answer}</div>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
