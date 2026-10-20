<script lang="ts">
	import { t } from 'svelte-i18n';
</script>

<div class="alert alert-warning items-start" data-testid="credit-beta-banner" role="status">
	<div class="min-w-0">
		<p class="font-semibold">{$t('credit.beta_title')}</p>
		<p class="text-sm">{$t('credit.beta_body')}</p>
		<p class="mt-1 text-sm">{$t('credit.non_custodial')}</p>
	</div>
</div>
