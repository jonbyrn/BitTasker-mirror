<script lang="ts">
	import IconMapMarker from '~icons/mdi/map-marker';

	let {
		href,
		title,
		description = '',
		meta = [],
		price = '',
		priceLabel = '',
		location = '',
		image = '',
		imageAlt,
		ctaLabel,
		testId,
		imageLoading = 'lazy'
	} = $props<{
		href: string;
		title: string;
		description?: string;
		meta?: string[];
		price?: string;
		priceLabel?: string;
		location?: string;
		image?: string;
		imageAlt?: string;
		ctaLabel: string;
		testId?: string;
		imageLoading?: 'lazy' | 'eager';
	}>();

	const photo = $derived(/^https?:\/\//i.test(String(image || '')) ? String(image) : '');
	let pressed = $state(false);
</script>

<a
	{href}
	class="card card-compact bt-card bg-base-100 block overflow-hidden rounded-2xl shadow-lg"
	class:opacity-70={pressed}
	class:ring-primary={pressed}
	class:ring-2={pressed}
	aria-busy={pressed}
	data-opening={pressed ? 'true' : undefined}
	data-testid={testId}
	data-homepage-card-shell="true"
	onpointerdown={() => (pressed = true)}
>
	{#if photo}
		<div class="bg-base-200 block h-48 overflow-hidden">
			<img
				src={photo}
				alt={imageAlt || title}
				class="h-full w-full object-cover transition-transform duration-200 hover:scale-105"
				loading={imageLoading}
				data-testid="listing-thumbnail"
			/>
		</div>
	{/if}

	<div class="card-body flex flex-col gap-2 p-4">
		<h3 class="line-clamp-2 text-lg leading-snug font-semibold" style="min-height:2lh">{title}</h3>
		<div class="text-base-content line-clamp-4 text-base leading-snug" style="min-height:4lh">
			{description || ''}
		</div>

		{#if location}
			<span class="flex items-center gap-2">
				<IconMapMarker class="text-primary h-4 w-4 shrink-0" />
				<span class="line-clamp-1 text-base">{location}</span>
			</span>
		{/if}

		<!-- Price and badges row -->
		<div class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
			<div class="min-w-0 flex-1">
				{#if priceLabel}
					<span class="text-base font-medium">{priceLabel}</span>
				{/if}
				{#if meta.length > 0}
					<span class="mt-1 flex flex-wrap gap-1.5">
						{#each meta.filter((item) => item.trim()) as metaItem (metaItem)}
							<span
								class="bg-base-200 text-base-content rounded-full px-2.5 py-0.5 text-base font-medium"
							>
								{metaItem}
							</span>
						{/each}
					</span>
				{/if}
			</div>
			{#if price}
				<div class="min-w-0 break-words sm:shrink-0 sm:text-right">
					<span class="text-primary text-xl font-bold">{price}</span>
				</div>
			{/if}
		</div>

		<span class="btn btn-primary btn-sm w-full">{ctaLabel}</span>
	</div>
</a>
