<script lang="ts">
	import type { RequestQueueItem } from '$lib/stores/request-queue.store';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import { formatStandardDateTime } from '$lib/utils/helpers/dateFormatter';

	const props = $props<{
		request: RequestQueueItem;
		escrowAmount?: string;
		onFundEscrow?: () => void;
		onCancel?: () => void;
	}>();

	function handleFundEscrow() {
		if (props.onFundEscrow) {
			props.onFundEscrow();
		} else {
			// Navigate to escrow funding page
			goto(`/dashboard/task/${props.request.taskId}/bids?bidId=${props.request.bidId}&fundEscrow=true`);
		}
	}
</script>

<div class="card bg-warning/10 border-warning">
	<div class="card-body p-4">
		<div class="flex items-start gap-3">
			<div class="text-2xl">💰</div>
			<div class="flex-1">
				<h3 class="font-semibold mb-2">{$t('scheduling.escrow_funding.title')}</h3>
				<p class="text-sm text-base-content/70 mb-3">
					{$t('scheduling.escrow_funding.description')}
				</p>

				{#if props.request.acceptedTime}
					<div class="bg-base-200 rounded p-2 mb-3">
						<p class="text-xs text-base-content/70 mb-1">{$t('scheduling.accepted_time')}:</p>
						<p class="font-semibold">
							{formatStandardDateTime(new Date(props.request.acceptedTime.startTime))} - {formatStandardDateTime(new Date(props.request.acceptedTime.endTime))}
						</p>
					</div>
				{/if}

				{#if props.escrowAmount}
					<div class="bg-base-200 rounded p-2 mb-3">
						<p class="text-xs text-base-content/70 mb-1">{$t('scheduling.escrow_amount')}:</p>
						<p class="font-semibold">{props.escrowAmount}</p>
					</div>
				{/if}

				<div class="flex gap-2">
					<button class="btn btn-primary btn-sm" onclick={handleFundEscrow}>
						{$t('scheduling.fund_escrow')}
					</button>
					{#if props.onCancel}
						<button class="btn btn-ghost btn-sm" onclick={props.onCancel}>
							{$t('common.buttons.cancel')}
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>

