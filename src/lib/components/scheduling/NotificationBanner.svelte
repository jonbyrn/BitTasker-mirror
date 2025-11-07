<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { notificationBatchingService, type BatchedNotificationGroup } from '$lib/services/notification-batching.service';
	import { notificationStore } from '$lib/stores/notification.store';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';

	let batches = $state<BatchedNotificationGroup[]>([]);
	let visibleBatches = $state<BatchedNotificationGroup[]>([]);
	let updateInterval: number | null = null;

	onMount(() => {
		// Update batches periodically
		updateInterval = window.setInterval(() => {
			batches = notificationBatchingService.getBatches();
			// Show top 3 batches
			visibleBatches = batches.slice(0, 3);
		}, 1000);

		// Initial load
		batches = notificationBatchingService.getBatches();
		visibleBatches = batches.slice(0, 3);
	});

	onDestroy(() => {
		if (updateInterval !== null) {
			clearInterval(updateInterval);
		}
	});

	function handleBatchClick(batch: BatchedNotificationGroup) {
		// Navigate to appropriate page based on batch type
		const firstNotification = batch.notifications[0];
		if (firstNotification?.action?.payload) {
			goto(firstNotification.action.payload);
		} else {
			goto('/dashboard/scheduling/requests');
		}

		// Mark notifications as read
		batch.notifications.forEach((notification) => {
			notificationStore.markAsRead(notification.id);
		});

		// Flush the batch
		notificationBatchingService.flushBatch(batch.id);
	}

	function dismissBatch(batchId: string) {
		// Mark notifications as read
		const batch = batches.find((b) => b.id === batchId);
		if (batch) {
			batch.notifications.forEach((notification) => {
				notificationStore.markAsRead(notification.id);
			});
		}

		// Flush the batch
		notificationBatchingService.flushBatch(batchId);
	}

	function getBatchTitle(batch: BatchedNotificationGroup): string {
		const count = batch.notifications.length;
		switch (batch.type) {
			case 'scheduling_new_request':
				return count === 1 ? $t('scheduling.notifications.new_request') : $t('scheduling.notifications.new_requests', { count });
			case 'scheduling_conflict':
				return $t('scheduling.notifications.conflict', { count });
			case 'scheduling_best_offer':
				return $t('scheduling.notifications.better_offer');
			case 'scheduling_escrow_funded':
				return $t('scheduling.notifications.escrow_funded');
			default:
				return batch.notifications[0]?.title || $t('scheduling.notifications.update');
		}
	}

	function getBatchIcon(batch: BatchedNotificationGroup): string {
		switch (batch.type) {
			case 'scheduling_escrow_funded':
				return '💰';
			case 'scheduling_conflict':
				return '⚠️';
			case 'scheduling_best_offer':
				return '⭐';
			case 'scheduling_new_request':
				return '📅';
			default:
				return '🔔';
		}
	}

	function getBatchColor(batch: BatchedNotificationGroup): string {
		switch (batch.type) {
			case 'scheduling_escrow_funded':
				return 'bg-success text-success-content';
			case 'scheduling_conflict':
				return 'bg-warning text-warning-content';
			case 'scheduling_best_offer':
				return 'bg-info text-info-content';
			default:
				return 'bg-base-200 text-base-content';
		}
	}
</script>

<!-- Batched Notification Banner -->
<div class="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 space-y-2 max-w-md w-full px-4">
	{#each visibleBatches as batch (batch.id)}
		<div
			class="card shadow-lg border {getBatchColor(batch)} cursor-pointer hover:scale-105 transition-transform"
			onclick={() => handleBatchClick(batch)}
			role="button"
			tabindex="0"
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					handleBatchClick(batch);
				}
			}}
		>
			<div class="card-body p-4">
				<div class="flex items-start justify-between">
					<div class="flex items-start gap-3 flex-1">
						<!-- Icon -->
						<div class="text-2xl">{getBatchIcon(batch)}</div>

						<!-- Content -->
						<div class="flex-1">
							<h4 class="font-semibold text-sm">{getBatchTitle(batch)}</h4>
							{#if batch.notifications.length > 1}
								<p class="text-xs opacity-80 mt-1">
									{$t('scheduling.notifications.count_more', { count: batch.notifications.length - 1 })}
								</p>
							{:else if batch.notifications[0]?.body}
								<p class="text-xs opacity-80 mt-1">{batch.notifications[0].body}</p>
							{/if}
						</div>
					</div>

					<!-- Dismiss button -->
					<button
						class="btn btn-ghost btn-xs"
						onclick|stopPropagation={() => dismissBatch(batch.id)}
						aria-label={$t('common.dismiss')}
					>
						✕
					</button>
				</div>
			</div>
		</div>
	{/each}
</div>

<style>
	.card {
		animation: slideDown 0.3s ease-out;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>

