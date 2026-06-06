<script lang="ts">
	import type { Service } from '$lib/types/service.d';
	import { t, locale } from 'svelte-i18n';
	import { findProfileServicesByAuthor } from '$lib/nostr/findProfileServices';
	import {
		getServiceDisplayTitle,
		getServiceDisplayDescription
	} from '$lib/utils/serviceDisplayTranslation';
	import FeaturedHomepageCardShell from '$lib/components/homepage/FeaturedHomepageCardShell.svelte';

	const INITIAL_LIMIT = 6;

	let {
		pubkey,
		isActive = false,
		id = 'services'
	}: {
		pubkey: string;
		isActive?: boolean;
		id?: string;
	} = $props();

	let services = $state<Service[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let hasLoaded = $state(false);
	let showAll = $state(false);

	const displayedServices = $derived(showAll ? services : services.slice(0, INITIAL_LIMIT));
	const hasMore = $derived(services.length > INITIAL_LIMIT);

	async function fetchServices() {
		if (!pubkey) return;
		isLoading = true;
		error = null;
		try {
			const result = await findProfileServicesByAuthor(pubkey, { limit: 50 });
			services = result;
			hasLoaded = true;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			isLoading = false;
		}
	}

	$effect(() => {
		if (isActive && !hasLoaded && !isLoading && pubkey) {
			fetchServices();
		}
	});

	function getServiceHref(service: Service): string {
		return `/services/${service.uniqueId || service.id}`;
	}

	function getServiceMeta(service: Service): string[] {
		const meta: string[] = [];
		if (service.skills?.length) meta.push(...service.skills.slice(0, 3));
		return meta;
	}

	function getServicePrice(service: Service): string {
		const tiers = service.pricing?.tiers;
		if (!tiers?.length) return '';
		const first = tiers[0];
		const price = first?.price;
		if (typeof price === 'number' && price > 0) {
			const currency = service.pricing?.currency || 'USD';
			return new Intl.NumberFormat($locale || 'en', { style: 'currency', currency }).format(price);
		}
		return '';
	}
</script>

<section
	{id}
	class="mb-8 scroll-mt-20"
	data-testid="profile-services-section"
	aria-labelledby="{id}-heading"
>
	<div class="mb-4">
		<h2 id="{id}-heading" class="text-xl font-bold">{$t('profile.services.title')}</h2>
	</div>

	{#if isLoading}
		<div
			class="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2"
			role="status"
			aria-busy="true"
			aria-label={$t('common.loading')}
			data-testid="profile-services-loading"
		>
			{#each Array.from({ length: 3 }) as _, idx (idx)}
				<div
					class="skeleton h-72 w-[280px] flex-shrink-0 snap-start rounded-2xl"
					data-testid="profile-services-loading-row"
				></div>
			{/each}
		</div>
	{:else if error}
		<div class="alert alert-error" role="alert" data-testid="profile-services-error">
			<span>{error}</span>
			<button
				class="btn btn-ghost btn-sm"
				onclick={fetchServices}
				aria-label={$t('common.buttons.retry')}
			>
				{$t('common.buttons.retry')}
			</button>
		</div>
	{:else if hasLoaded && services.length === 0}
		<div class="text-base-content/60 py-8 text-center" data-testid="profile-services-empty">
			<p>{$t('profile.services.empty')}</p>
		</div>
	{:else if hasLoaded}
		<div
			class="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2"
			aria-live="polite"
			data-testid="profile-services-list"
		>
			{#each displayedServices as service (service.id)}
				<div class="max-w-[320px] min-w-[280px] flex-shrink-0 snap-start">
					<FeaturedHomepageCardShell
						href={getServiceHref(service)}
						title={getServiceDisplayTitle(service, $locale || 'en')}
						description={getServiceDisplayDescription(service, $locale || 'en')}
						price={getServicePrice(service)}
						priceLabel={$t('profile.services.price_from')}
						meta={getServiceMeta(service)}
						ctaLabel={$t('profile.services.view_service')}
						testId="profile-service-card"
						showLocationIcon={false}
					/>
				</div>
			{/each}
		</div>

		{#if hasMore}
			<div class="mt-4 flex flex-col items-center gap-2">
				{#if !showAll}
					<button class="btn btn-ghost btn-sm" onclick={() => (showAll = true)}>
						{$t('common.show_more', { values: { count: services.length - INITIAL_LIMIT } })}
					</button>
				{/if}
				<a href="/services" class="btn btn-outline btn-sm">
					{$t('profile.services.browse_all')}
				</a>
			</div>
		{/if}
	{/if}
</section>
