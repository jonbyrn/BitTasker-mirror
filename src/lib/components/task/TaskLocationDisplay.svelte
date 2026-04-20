<script lang="ts">
	import { t } from 'svelte-i18n';
	import IconMapMarker from '~icons/mdi/map-marker';
	import { isApproximatePublicLocation } from '$lib/utils/location/public-location';

	const {
		dropOffLocation = null,
		pickupLocation = null,
		locationText = '',
		directionsLink = null
	} = $props<{
		dropOffLocation?: { displayName?: string } | null;
		pickupLocation?: { displayName?: string } | null;
		locationText?: string;
		/** When provided, the location text and icon become a link to Get Directions */
		directionsLink?: string | null;
	}>();

	// Determine display text
	const isRemote = $derived(
		!dropOffLocation?.displayName && !pickupLocation?.displayName && !locationText
	);
	const displayText = $derived(
		locationText || dropOffLocation?.displayName || pickupLocation?.displayName || ''
	);
	const displayLocation = $derived(dropOffLocation || pickupLocation);
	const showApproximateNote = $derived(!isRemote && isApproximatePublicLocation(displayLocation));
</script>

{#if directionsLink}
	<a
		href={directionsLink}
		target="_blank"
		rel="external noopener noreferrer"
		class="flex items-center gap-2 transition-opacity hover:opacity-80"
	>
		<IconMapMarker class="text-primary h-8 w-8 shrink-0" />
		<div class="flex min-w-0 flex-1">
			<span class="line-clamp-2 text-sm font-medium">
				{#if isRemote}
					{$t('dashboard.task_details_by_task.remote')}
				{:else}
					{displayText}
				{/if}
			</span>
			{#if showApproximateNote}
				<span class="text-base-content/60 ml-1 shrink-0 text-xs">
					({$t('common.location.approximate_short')})
				</span>
			{/if}
		</div>
	</a>
{:else}
	<div class="flex items-center gap-2">
		<IconMapMarker class="text-primary h-8 w-8 shrink-0" />
		<div class="flex min-w-0 flex-1">
			<span class="line-clamp-2 text-sm font-medium">
				{#if isRemote}
					{$t('dashboard.task_details_by_task.remote')}
				{:else}
					{displayText}
				{/if}
			</span>
			{#if showApproximateNote}
				<span class="text-base-content/60 ml-1 shrink-0 text-xs">
					({$t('common.location.approximate_short')})
				</span>
			{/if}
		</div>
	</div>
{/if}
