<script lang="ts">
	import PublicListingLayoutShell from '$lib/components/listing/PublicListingLayoutShell.svelte';
	import NotificationPermissionBanner from '$lib/components/notifications/NotificationPermissionBanner.svelte';
	import WarningPopup from '$lib/components/WarningPopup.svelte';

	let { children } = $props();
</script>

<PublicListingLayoutShell
	layoutClassName="reviews-layout"
	activeSectionId="reviews"
	activeBasePath="/reviews"
>
	<div class="min-h-0 w-full flex-1 overflow-hidden">
		{@render children()}
		<NotificationPermissionBanner />
		<WarningPopup />
	</div>
</PublicListingLayoutShell>
