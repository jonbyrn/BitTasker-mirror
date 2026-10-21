<script lang="ts">
	import type { FeaturedService } from '$lib/services/featuredServices.service';
	import { t } from 'svelte-i18n';
	import FeaturedHomepageCardShell from '$lib/components/homepage/FeaturedHomepageCardShell.svelte';

	let { service } = $props<{
		service: FeaturedService;
	}>();
</script>

<FeaturedHomepageCardShell
	href={service.href}
	title={service.title}
	description={service.description}
	price={service.priceLabel}
	priceLabel={$t('common.homepage.featured.services.price')}
	location={service.location}
	meta={service.meta}
	image={service.image}
	imageAlt={service.imageAlt}
	ctaLabel={$t('common.homepage.featured.services.view')}
	testId="featured-service-card"
/>
