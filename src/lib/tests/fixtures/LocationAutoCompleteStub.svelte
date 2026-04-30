<script lang="ts">
	const { location = { displayName: '' } } = $props<{
		location?: {
			displayName?: string;
			latitude?: number;
			longitude?: number;
			locationLoaded?: boolean;
		};
	}>();
</script>

<div data-testid="location-autocomplete">{location.displayName || ''}</div>
