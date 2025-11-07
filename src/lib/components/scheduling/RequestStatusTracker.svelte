<script lang="ts">
	import type { RequestQueueItem } from '$lib/stores/request-queue.store';
	import { getRemainingTime } from '$lib/utils/scheduling-utils';
	import { formatStandardDateTime } from '$lib/utils/helpers/dateFormatter';
	import { t } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';

	const props = $props<{
		request: RequestQueueItem;
		showDetails?: boolean;
	}>();

	let remainingTime = $state(getRemainingTime(props.request.expiresAt));
	let updateInterval: number | null = null;

	onMount(() => {
		if (props.request.status === 'pending') {
			updateInterval = window.setInterval(() => {
				remainingTime = getRemainingTime(props.request.expiresAt);
			}, 1000);
		}
	});

	onDestroy(() => {
		if (updateInterval !== null) {
			clearInterval(updateInterval);
		}
	});

	function getStatusIcon(status: string): string {
		switch (status) {
			case 'pending':
				return '⏳';
			case 'accepted':
				return '✅';
			case 'confirmed':
				return '✓';
			case 'rejected':
				return '❌';
			case 'expired':
				return '⏰';
			case 'cancelled':
				return '🚫';
			default:
				return '📋';
		}
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'pending':
				return 'text-warning';
			case 'accepted':
				return 'text-success';
			case 'confirmed':
				return 'text-success';
			case 'rejected':
				return 'text-error';
			case 'expired':
				return 'text-neutral';
			case 'cancelled':
				return 'text-neutral';
			default:
				return 'text-base-content';
		}
	}
</script>

<div class="card bg-base-100 shadow-md">
	<div class="card-body p-4">
		<!-- Status Header -->
		<div class="flex items-center justify-between mb-3">
			<div class="flex items-center gap-2">
				<span class="text-2xl">{getStatusIcon(props.request.status)}</span>
				<span class="font-semibold {getStatusColor(props.request.status)}">
					{$t(`scheduling.status.${props.request.status}`)}
				</span>
			</div>

			<!-- Expiry countdown (if pending) -->
			{#if props.request.status === 'pending'}
				<div class="text-xs {remainingTime.expiresSoon ? 'text-warning' : 'text-base-content/60'}">
					{#if remainingTime.isExpired}
						<span class="badge badge-error badge-xs">{$t('scheduling.expired')}</span>
					{:else if remainingTime.expiresSoon}
						<span class="badge badge-warning badge-xs">
							{$t('scheduling.expires_soon', {
								minutes: remainingTime.remainingMinutes,
								seconds: remainingTime.remainingSeconds
							})}
						</span>
					{:else}
						<span>
							{$t('scheduling.expires_in', {
								minutes: remainingTime.remainingMinutes,
								seconds: remainingTime.remainingSeconds
							})}
						</span>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Request Details -->
		{#if props.showDetails}
			<div class="space-y-2 text-sm">
				<div class="flex justify-between">
					<span class="text-base-content/70">{$t('scheduling.request_id')}:</span>
					<span class="font-mono text-xs">{props.request.id.substring(0, 8)}...</span>
				</div>
				<div class="flex justify-between">
					<span class="text-base-content/70">{$t('scheduling.task_id')}:</span>
					<span class="font-mono text-xs">{props.request.taskId.substring(0, 8)}...</span>
				</div>
				<div class="flex justify-between">
					<span class="text-base-content/70">{$t('scheduling.created')}:</span>
					<span>{formatStandardDateTime(new Date(props.request.createdAt))}</span>
				</div>

				{#if props.request.acceptedTime}
					<div class="flex justify-between">
						<span class="text-base-content/70">{$t('scheduling.accepted_time')}:</span>
						<span class="text-success">
							{formatStandardDateTime(new Date(props.request.acceptedTime.startTime))}
						</span>
					</div>
				{/if}

				{#if props.request.escrowId}
					<div class="flex justify-between">
						<span class="text-base-content/70">{$t('scheduling.escrow_id')}:</span>
						<span class="font-mono text-xs">{props.request.escrowId.substring(0, 8)}...</span>
					</div>
				{/if}

				{#if props.request.confirmationTime}
					<div class="flex justify-between">
						<span class="text-base-content/70">{$t('scheduling.confirmed_at')}:</span>
						<span>{formatStandardDateTime(new Date(props.request.confirmationTime))}</span>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

