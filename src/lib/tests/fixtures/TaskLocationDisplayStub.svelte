<script lang="ts">
	const {
		locationText = '',
		pickupLocation = null,
		dropOffLocation = null
	} = $props<{
		locationText?: string;
		pickupLocation?: { displayName?: string } | null;
		dropOffLocation?: { displayName?: string } | null;
	}>();
</script>

<div data-testid="task-location-text">
	{locationText || dropOffLocation?.displayName || pickupLocation?.displayName || ''}
</div>
