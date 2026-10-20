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
		imageLoading = 'lazy',
		fallbackImage = '/images/placeholders/were-hiring-task-image-placeholder.jpg'
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
		fallbackImage?: string;
	}>();
</script>

<div
	class="card card-compact bt-card bg-base-100 overflow-hidden rounded-2xl shadow-lg"
	data-testid={testId}
	data-homepage-card-shell="true"
>
	<a {href} class="bg-base-200 block h-48 overflow-hidden">
		<img
			src={image || fallbackImage}
			alt={imageAlt || title}
			class="h-full w-full object-cover transition-transform duration-200 hover:scale-105"
			loading={imageLoading}
		/>
	</a>

	<div class="card-body flex flex-col gap-2 p-4">
		<h3 class="line-clamp-2 text-lg leading-snug font-semibold" style="min-height:2lh">{title}</h3>
		<div class="text-base-content/75 line-clamp-4 text-sm leading-snug" style="min-height:4lh">
			{description || ''}
		</div>

		<!-- Location row -->
		<div class="flex items-center gap-2" style="min-height:2rem">
			{#if location}
				<IconMapMarker class="text-primary h-4 w-4 shrink-0" />
				<span class="line-clamp-1 text-sm">{location}</span>
			{/if}
		</div>

		<!-- Price and badges row -->
		<div class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
			<div class="min-w-0 flex-1">
				{#if priceLabel}
					<span class="text-base-content/60 text-xs font-medium tracking-wide uppercase"
						>{priceLabel}</span
					>
				{/if}
				{#if meta.length > 0}
					<div class="mt-1 flex flex-wrap gap-1.5">
						{#each meta as metaItem (metaItem)}
							<span
								class="bg-base-200 text-base-content/80 rounded-full px-2.5 py-0.5 text-xs font-medium"
							>
								{metaItem}
							</span>
						{/each}
					</div>
				{/if}
			</div>
			{#if price}
				<div class="min-w-0 break-words sm:shrink-0 sm:text-right">
					<span class="text-primary text-xl font-bold">{price}</span>
				</div>
			{/if}
		</div>

		<a {href} class="btn btn-primary btn-sm w-full">{ctaLabel}</a>
	</div>
</div>
