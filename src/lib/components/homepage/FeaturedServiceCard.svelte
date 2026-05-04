<script lang="ts">
	import type { FeaturedService } from '$lib/services/featuredServices.service';
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
	priceLabel="Price"
	location={service.location}
	meta={service.meta}
	image={service.image}
	imageAlt={service.imageAlt}
	ctaLabel={service.ctaLabel}
	testId="featured-service-card"
/>
