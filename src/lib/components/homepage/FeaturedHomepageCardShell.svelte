<script lang="ts">
	let {
		href,
		title,
		description = '',
		meta = [],
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
		image?: string;
		imageAlt?: string;
		ctaLabel: string;
		testId?: string;
		imageLoading?: 'lazy' | 'eager';
		fallbackImage?: string;
	}>();
</script>

<a
	{href}
	class="card card-compact bg-base-100 focus-visible:ring-primary h-full overflow-hidden rounded-2xl shadow-lg transition-transform duration-200 hover:-translate-y-1 hover:shadow-xl focus:outline-none focus-visible:ring-2"
	data-testid={testId}
	data-homepage-card-shell="true"
>
	<figure class="bg-base-200 h-48 overflow-hidden">
		<img
			src={image || fallbackImage}
			alt={imageAlt || title}
			class="h-full w-full object-cover"
			loading={imageLoading}
		/>
	</figure>

	<div class="card-body flex h-full flex-col gap-3 p-5">
		<div class="space-y-2">
			<h3 class="line-clamp-2 min-h-[3.5rem] text-lg font-semibold">{title}</h3>
			{#if description}
				<p class="text-base-content/75 line-clamp-2 text-sm">{description}</p>
			{/if}
		</div>

		{#if meta.length > 0}
			<div class="flex flex-wrap gap-2">
				{#each meta as metaItem}
					<span class="bg-base-200 text-base-content/80 rounded-full px-3 py-1 text-xs font-medium">
						{metaItem}
					</span>
				{/each}
			</div>
		{/if}

		<div class="mt-auto flex items-center justify-between gap-3 pt-1">
			<span class="text-primary text-sm font-semibold">{ctaLabel}</span>
			<span class="btn btn-primary btn-sm pointer-events-none">{ctaLabel}</span>
		</div>
	</div>
</a>
