<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { formatStandardDateTime } from '$lib/utils/helpers/dateFormatter';

	let { unlockAt }: { unlockAt: number } = $props();

	let nowMs = $state(Date.now());

	onMount(() => {
		const id = setInterval(() => {
			nowMs = Date.now();
		}, 1000);
		return () => clearInterval(id);
	});

	const remainingMs = $derived(Math.max(0, unlockAt * 1000 - nowMs));
	const opensAtLabel = $derived(formatStandardDateTime(new Date(unlockAt * 1000)));

	const countdown = $derived.by(() => {
		const totalSeconds = Math.ceil(remainingMs / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
		if (minutes > 0) return `${minutes}m ${seconds}s`;
		return `${seconds}s`;
	});
</script>

<div class="alert alert-info w-full text-sm" data-testid="submit-work-lock">
	<div class="flex flex-col gap-2">
		<p>
			{$t('dashboard.contracts.actions.submit_work_from', { values: { time: opensAtLabel } })}
		</p>
		<p class="font-semibold" aria-live="polite">
			{$t('dashboard.contracts.actions.submit_work_countdown', { values: { countdown } })}
		</p>
		<button type="button" class="btn btn-success btn-sm w-fit" disabled>
			{$t('dashboard.contracts.actions.complete')}
		</button>
	</div>
</div>
