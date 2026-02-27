<script lang="ts">
	import type { Location } from '$lib/types/task';

	let {
		location = {
			displayName: '',
			latitude: null,
			longitude: null,
			zipCode: '',
			locationLoaded: false
		}
	}: { location?: Location } = $props();
</script>

<span data-testid="location-display">{location?.displayName ?? ''}</span>
