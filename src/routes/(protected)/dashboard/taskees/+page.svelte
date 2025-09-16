<script lang="ts">
	import { t } from 'svelte-i18n';
	import ComingSoon from '$lib/components/ComingSoon.svelte';
</script>

<div class="h-[80dvh] flex items-center justify-center">
	<ComingSoon
		title={$t('dashboard.taskees.title')}
		subtitle={$t('dashboard.taskees.coming_soon')}
		description={$t('dashboard.taskees.description')}
	/>
</div>
