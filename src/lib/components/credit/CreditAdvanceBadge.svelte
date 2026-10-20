<script lang="ts">
	import { t } from 'svelte-i18n';
	import { isCreditEnabled } from '$lib/services/feature-flags';

	let { jobId }: { jobId: string } = $props();

	const href = $derived(jobId ? `/credit?job=${encodeURIComponent(jobId)}` : '/credit');
</script>

{#if isCreditEnabled() && jobId}
	<a class="badge badge-warning badge-outline max-w-full" {href} data-testid="credit-advance-badge">
		{$t('credit.badge')}
	</a>
{/if}
