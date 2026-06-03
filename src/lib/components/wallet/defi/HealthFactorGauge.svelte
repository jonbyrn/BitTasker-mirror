<script lang="ts">
	import { t } from 'svelte-i18n';

	let {
		healthFactor = 5,
		status = 'safe'
	}: { healthFactor?: number; status?: 'safe' | 'monitor' | 'risk' } = $props();

	let color = $derived(status === 'safe' ? 'success' : status === 'monitor' ? 'warning' : 'error');
	let statusLabel = $derived(
		status === 'safe'
			? $t('wallet.defi.borrow.health_safe')
			: status === 'monitor'
				? $t('wallet.defi.borrow.health_monitor')
				: $t('wallet.defi.borrow.health_risk')
	);
</script>

<div
	role="meter"
	aria-valuenow={healthFactor}
	aria-valuemin="0"
	aria-valuemax="5"
	aria-label={$t('wallet.defi.borrow.health_factor_aria', {
		values: { factor: healthFactor.toFixed(1), status: statusLabel }
	})}
>
	<div class="flex items-center gap-2">
		<progress class="progress progress-{color}" value={Math.min(healthFactor, 5)} max="5"
		></progress>
		<span class="badge badge-{color} font-medium">{statusLabel} {healthFactor.toFixed(1)}x</span>
	</div>
</div>
