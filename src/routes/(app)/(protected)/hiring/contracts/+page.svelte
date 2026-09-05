<script lang="ts">
	import { slide } from 'svelte/transition';
	import { t } from 'svelte-i18n';

</script>

<div class="py-8 text-center" transition:slide={{ duration: 300 }}>
	<p class="text-base-content/70 text-sm">
		{$t('dashboard.contracts.empty', { default: 'Native contract activity will appear here.' })}
	</p>
</div>
