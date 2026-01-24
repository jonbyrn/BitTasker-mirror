<script lang="ts">
	import { t } from 'svelte-i18n';
	import IconMapMarker from '~icons/mdi/map-marker';

	const {
		dropOffLocation = null,
		pickupLocation = null,
		locationText = ''
	} = $props<{
		dropOffLocation?: { displayName?: string } | null;
		pickupLocation?: { displayName?: string } | null;
		locationText?: string;
	}>();

	// Determine display text
	const displayText = $derived(
		locationText ||
		dropOffLocation?.displayName ||
		pickupLocation?.displayName ||
		''
	);
</script>

<div class="flex items-center gap-2">
	<IconMapMarker class="text-primary h-8 w-8 shrink-0" />
	<div class="flex min-w-0 flex-1">
		<span class="line-clamp-2 text-sm font-medium">
			{#if displayText}
				{displayText}
			{:else}
				{$t('dashboard.task_details_by_task.remote')}
			{/if}
		</span>
	</div>
</div>
