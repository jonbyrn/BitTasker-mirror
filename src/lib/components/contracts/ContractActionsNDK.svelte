<script lang="ts">
	import { get } from 'svelte/store';
	import { t } from 'svelte-i18n';
	import { PaymentContractRune } from '$lib/runes/contractRune.svelte';
	import { appStore } from '$lib/stores/app.store';

	let { contractRune }: { contractRune: PaymentContractRune } = $props();

	let busy = $state(false);

	async function onMarkComplete() {
		if (busy) return;
		busy = true;
		try {
			const res = await contractRune.markTaskComplete();
			if (!res.ok) {
				appStore.showErrorToast(get(t)(res.errorKey));
				return;
			}
			appStore.showSuccessToast(get(t)('dashboard.contracts.actions.task_completed_success'));
		} finally {
			busy = false;
		}
	}
</script>

{#if contractRune.permittedActions.canCompleteTask}
	<button
		type="button"
		class="btn btn-primary btn-sm w-full sm:w-auto"
		disabled={contractRune.isPending || busy}
		onclick={onMarkComplete}
	>
		{#if busy || contractRune.isPending}
			<span class="loading loading-spinner loading-xs"></span>
		{/if}
		{$t('dashboard.contracts.actions.complete_task')}
	</button>
{/if}
