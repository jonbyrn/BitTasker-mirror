<script lang="ts">
	let {
		healthFactor = 5,
		status = 'safe'
	}: { healthFactor?: number; status?: 'safe' | 'monitor' | 'risk' } = $props();

	let color = $derived(status === 'safe' ? 'success' : status === 'monitor' ? 'warning' : 'error');
	let label = $derived(status === 'safe' ? 'Safe' : status === 'monitor' ? 'Monitor' : 'At Risk');
</script>

<div
	role="meter"
	aria-valuenow={healthFactor}
	aria-valuemin="0"
	aria-valuemax="5"
	aria-label="Health factor: {healthFactor.toFixed(1)} out of 5. {label}"
>
	<div class="flex items-center gap-2">
		<progress class="progress progress-{color}" value={Math.min(healthFactor, 5)} max="5"
		></progress>
		<span class="badge badge-{color} font-medium">Health: {healthFactor.toFixed(1)}x</span>
		<span class="text-base-content/50 text-xs">{label}</span>
	</div>
</div>
