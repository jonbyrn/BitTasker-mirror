<script lang="ts">
	import type { RequestQueueItem } from '$lib/stores/request-queue.store';
	import type { RequestScore } from '$lib/utils/request-scoring';
	import { formatStandardDateTime } from '$lib/utils/helpers/dateFormatter';
	import { getRemainingTime } from '$lib/utils/scheduling-utils';
	import { getRecommendationBadge } from '$lib/utils/request-scoring';
	import { createSwipeHandler, isMobileDevice } from '$lib/utils/mobile-gestures';
	import { checkRequestAvailabilityStaleness, getStalenessBadge } from '$lib/utils/staleness-handler';
	import { t } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';

	const props = $props<{
		request: RequestQueueItem;
		isSelected?: boolean;
		onSelect?: (requestId: string) => void;
		onAccept?: (requestId: string) => void;
		onReject?: (requestId: string) => void;
		onReschedule?: (requestId: string) => void;
		onViewDetails?: (requestId: string) => void;
		showConflictIndicator?: boolean;
		showAvailabilityUpdated?: boolean;
		requestScore?: RequestScore;
		isBestOffer?: boolean;
	}>();

	let remainingTime = $state(getRemainingTime(props.request.expiresAt));
	let updateInterval: number | null = null;
	let cardElement: HTMLDivElement | null = $state(null);
	let swipeCleanup: (() => void) | null = null;
	let isMobile = $state(false);

	onMount(() => {
		isMobile = isMobileDevice();

		// Update remaining time every second
		updateInterval = window.setInterval(() => {
			remainingTime = getRemainingTime(props.request.expiresAt);
		}, 1000);

		// Add swipe gestures for mobile
		if (isMobile && cardElement && props.request.status === 'pending') {
			swipeCleanup = createSwipeHandler(cardElement, {
				threshold: 50,
				velocityThreshold: 0.3,
				onSwipeLeft: () => {
					// Swipe left to reject
					if (props.onReject) {
						props.onReject(props.request.id);
					}
				},
				onSwipeRight: () => {
					// Swipe right to accept
					if (props.onAccept) {
						props.onAccept(props.request.id);
					}
				}
			});
		}
	});

	onDestroy(() => {
		if (updateInterval !== null) {
			clearInterval(updateInterval);
		}
		if (swipeCleanup) {
			swipeCleanup();
		}
	});

	function getStatusBadgeClass(status: string): string {
		switch (status) {
			case 'pending':
				return 'badge-warning';
			case 'accepted':
				return 'badge-success';
			case 'confirmed':
				return 'badge-success';
			case 'rejected':
				return 'badge-error';
			case 'expired':
				return 'badge-neutral';
			case 'cancelled':
				return 'badge-neutral';
			default:
				return 'badge-ghost';
		}
	}

	function formatTimeSlot(startTime: number, endTime: number): string {
		const start = formatStandardDateTime(new Date(startTime));
		const end = formatStandardDateTime(new Date(endTime));
		return `${start} - ${end}`;
	}

	function handleCardClick() {
		if (props.onViewDetails) {
			props.onViewDetails(props.request.id);
		}
	}
</script>

<div
	bind:this={cardElement}
	class="card bg-base-100 shadow-md border cursor-pointer hover:shadow-lg transition-shadow {props.isSelected ? 'ring-2 ring-primary' : ''} min-h-[44px] touch-manipulation"
	onclick={handleCardClick}
	role="button"
	tabindex="0"
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handleCardClick();
		}
	}}
	style="touch-action: pan-y;"
>
	<div class="card-body p-4">
		<div class="flex items-start justify-between gap-2">
			<!-- Left: Main content -->
			<div class="flex-1 min-w-0">
				<!-- Header: Status and indicators -->
				<div class="flex items-center gap-2 mb-2 flex-wrap">
					<span class="badge {getStatusBadgeClass(props.request.status)} badge-sm">
						{$t(`scheduling.status.${props.request.status}`)}
					</span>
					{#if props.isBestOffer}
						<span class="badge badge-success badge-sm">⭐ {$t('scheduling.best_offer')}</span>
					{/if}
					{#if props.requestScore}
						{@const badge = getRecommendationBadge(props.requestScore)}
						<span class="badge badge-{badge.color} badge-sm">
							{badge.icon} {badge.label}
						</span>
					{/if}
					{@const stalenessCheck = checkRequestAvailabilityStaleness(props.request)}
					{#if stalenessCheck}
						{@const stalenessBadge = getStalenessBadge(stalenessCheck)}
						{#if stalenessBadge}
							<span class="badge badge-{stalenessBadge.color} badge-sm">
								{stalenessBadge.icon} {stalenessBadge.label}
							</span>
						{/if}
					{/if}
					{#if props.showConflictIndicator}
						<span class="badge badge-warning badge-sm">⚠️ {$t('scheduling.conflict')}</span>
					{/if}
					{#if props.showAvailabilityUpdated}
						<span class="badge badge-info badge-sm">🔄 {$t('scheduling.availability_updated')}</span>
					{/if}
				</div>

				<!-- Request type -->
				<h3 class="font-semibold text-sm mb-1">
					{props.request.type === 'time-slot-request'
						? $t('scheduling.request_types.time_slot')
						: $t('scheduling.request_types.soonest_available')}
				</h3>

				<!-- Time slot (if available) -->
				{#if props.request.type === 'time-slot-request' && props.request.request.messageType === 'time-slot-request'}
					{@const timeSlotRequest = props.request.request as import('$lib/types/scheduling').TimeSlotRequest}
					<p class="text-xs text-base-content/70 mb-2">
						{formatTimeSlot(timeSlotRequest.requestedStartTime, timeSlotRequest.requestedEndTime)}
					</p>
				{/if}

				<!-- Accepted time (if accepted) -->
				{#if props.request.acceptedTime}
					<p class="text-xs text-success mb-2">
						✓ {$t('scheduling.accepted_time')}: {formatTimeSlot(
							props.request.acceptedTime.startTime,
							props.request.acceptedTime.endTime
						)}
					</p>
				{/if}

				<!-- Task and bid info -->
				<div class="text-xs text-base-content/60 space-y-1">
					<p>{$t('scheduling.task_id')}: {props.request.taskId.substring(0, 8)}...</p>
					<p>{$t('scheduling.bid_id')}: {props.request.bidId.substring(0, 8)}...</p>
				</div>
			</div>

			<!-- Right: Actions and expiry -->
			<div class="flex flex-col items-end gap-2">
				<!-- Expiry timer -->
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

				<!-- Selection checkbox -->
				{#if props.onSelect}
					<input
						type="checkbox"
						class="checkbox checkbox-primary checkbox-sm"
						checked={props.isSelected}
						onclick|stopPropagation={(e) => {
							e.stopPropagation();
							if (props.onSelect) {
								props.onSelect(props.request.id);
							}
						}}
					/>
				{/if}
			</div>
		</div>

		<!-- Action buttons (if pending) -->
		{#if props.request.status === 'pending' && (props.onAccept || props.onReject || props.onReschedule)}
			<div class="card-actions justify-end mt-2 pt-2 border-t border-base-300">
				{#if props.onAccept}
					<button
						class="btn btn-success {isMobile ? 'btn-sm min-h-[44px] min-w-[44px]' : 'btn-xs'}"
						onclick|stopPropagation={() => {
							if (props.onAccept) {
								props.onAccept(props.request.id);
							}
						}}
						aria-label={$t('common.buttons.accept')}
					>
						{$t('common.buttons.accept')}
					</button>
				{/if}
				{#if props.onReschedule}
					<button
						class="btn btn-info {isMobile ? 'btn-sm min-h-[44px] min-w-[44px]' : 'btn-xs'}"
						onclick|stopPropagation={() => {
							if (props.onReschedule) {
								props.onReschedule(props.request.id);
							}
						}}
						aria-label={$t('scheduling.reschedule')}
					>
						{$t('scheduling.reschedule')}
					</button>
				{/if}
				{#if props.onReject}
					<button
						class="btn btn-error {isMobile ? 'btn-sm min-h-[44px] min-w-[44px]' : 'btn-xs'}"
						onclick|stopPropagation={() => {
							if (props.onReject) {
								props.onReject(props.request.id);
							}
						}}
						aria-label={$t('common.buttons.reject')}
					>
						{$t('common.buttons.reject')}
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>

