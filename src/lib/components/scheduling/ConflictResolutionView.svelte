<script lang="ts">
	import type { RequestQueueItem } from '$lib/stores/request-queue.store';
	import RequestCard from './RequestCard.svelte';
	import { sendRequestAcceptance, sendRequestCancellation } from '$lib/utils/nostr-scheduling';
	import { requestQueueStore } from '$lib/stores/request-queue.store';
	import { findBestOffer, findAlternativeSlots } from '$lib/utils/conflict-detection';
	import { t } from 'svelte-i18n';
	import { formatStandardDateTime } from '$lib/utils/helpers/dateFormatter';

	const props = $props<{
		conflictingRequests: RequestQueueItem[];
		timeSlot: string;
		availableSlots?: Array<{ startTime: number; endTime: number; duration: number }>;
		onResolved?: () => void;
	}>();

	let selectedRequestId = $state<string | null>(null);
	let isLoading = $state(false);
	let showAlternatives = $state(false);
	let alternativesForRequest = $state<Array<{ startTime: number; endTime: number; duration: number }>>([]);
	let selectedRequestForAlternatives = $state<string | null>(null);

	// Find best offer
	const bestOffer = $derived(findBestOffer(props.conflictingRequests));

	async function handleAccept(requestId: string) {
		if (isLoading) return;

		const request = props.conflictingRequests.find((r) => r.id === requestId);
		if (!request || request.status !== 'pending') return;

		isLoading = true;
		try {
			if (request.type === 'time-slot-request') {
				const timeSlotRequest = request.request as import('$lib/types/scheduling').TimeSlotRequest;
				await sendRequestAcceptance({
					requestId: request.id,
					bidId: request.bidId,
					taskId: request.taskId,
					taskerPubkey: request.taskerPubkey,
					taskeePubkey: request.taskeePubkey,
					acceptedStartTime: timeSlotRequest.requestedStartTime,
					acceptedEndTime: timeSlotRequest.requestedEndTime
				});

				// Update status
				requestQueueStore.updateRequestStatus(request.id, 'accepted', {
					acceptedTime: {
						startTime: timeSlotRequest.requestedStartTime,
						endTime: timeSlotRequest.requestedEndTime
					}
				});

				// Reject other conflicting requests
				for (const otherRequest of props.conflictingRequests) {
					if (otherRequest.id !== requestId && otherRequest.status === 'pending') {
						// Send cancellation notification to tasker
						try {
							await sendRequestCancellation({
								requestId: otherRequest.id,
								bidId: otherRequest.bidId,
								taskId: otherRequest.taskId,
								taskerPubkey: otherRequest.taskerPubkey,
								taskeePubkey: otherRequest.taskeePubkey,
								reason: $t('scheduling.conflict.rejected_due_to_conflict')
							});
						} catch (error) {
							console.warn('Failed to send cancellation notification:', error);
						}

						// Update status to rejected
						requestQueueStore.updateRequestStatus(otherRequest.id, 'rejected');
					}
				}

				if (props.onResolved) {
					props.onResolved();
				}
			}
		} catch (error) {
			console.error('Failed to resolve conflict:', error);
		} finally {
			isLoading = false;
		}
	}

	async function handleAcceptBestOffer() {
		if (bestOffer) {
			await handleAccept(bestOffer.id);
		}
	}

	function handleShowAlternatives(requestId: string) {
		const request = props.conflictingRequests.find((r) => r.id === requestId);
		if (!request || !props.availableSlots) return;

		const allRequests = requestQueueStore.getAllRequests();
		const alternatives = findAlternativeSlots(request, allRequests, props.availableSlots);
		alternativesForRequest = alternatives;
		selectedRequestForAlternatives = requestId;
		showAlternatives = true;
	}

	function parseTimeSlot(timeSlot: string): { start: number; end: number } | null {
		const [start, end] = timeSlot.split('-').map(Number);
		if (isNaN(start) || isNaN(end)) return null;
		return { start, end };
	}

	const timeSlotInfo = $derived(parseTimeSlot(props.timeSlot));
</script>

<div class="card bg-base-100 shadow-lg">
	<div class="card-body">
		<h3 class="card-title text-warning">
			⚠️ {$t('scheduling.conflict.title')}
		</h3>

		{#if timeSlotInfo}
			<div class="alert alert-info alert-outline mb-4">
				<p class="text-sm">
					{$t('scheduling.conflict.time_slot')}: {formatStandardDateTime(new Date(timeSlotInfo.start))} - {formatStandardDateTime(new Date(timeSlotInfo.end))}
				</p>
			</div>
		{/if}

		<p class="text-sm text-base-content/70 mb-4">
			{$t('scheduling.conflict.description', { count: props.conflictingRequests.length })}
		</p>

		<!-- Accept Best Offer Button -->
		{#if bestOffer}
			<div class="mb-4">
				<button
					class="btn btn-primary btn-sm w-full"
					onclick={handleAcceptBestOffer}
					disabled={isLoading}
				>
					⭐ {$t('scheduling.conflict.accept_best_offer')}
				</button>
			</div>
		{/if}

		<!-- Comparison View -->
		<div class="space-y-3">
			{#each props.conflictingRequests as request (request.id)}
				<div
					class="border rounded-lg p-3 transition-all {selectedRequestId === request.id
						? 'ring-2 ring-primary border-primary'
						: request.id === bestOffer?.id
							? 'border-warning bg-warning/10'
							: 'border-base-300'}"
				>
					{#if request.id === bestOffer?.id}
						<div class="badge badge-warning badge-sm mb-2">
							⭐ {$t('scheduling.conflict.best_offer')}
						</div>
					{/if}

					<RequestCard
						{request}
						showConflictIndicator={true}
						onAccept={() => {
							selectedRequestId = request.id;
							handleAccept(request.id);
						}}
					/>

					{#if props.availableSlots && props.availableSlots.length > 0}
						<div class="mt-2">
							<button
								class="btn btn-ghost btn-xs"
								onclick={() => handleShowAlternatives(request.id)}
							>
								{$t('scheduling.conflict.show_alternatives')}
							</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Alternatives Modal -->
		{#if showAlternatives && alternativesForRequest.length > 0}
			<div class="modal modal-open">
				<div class="modal-box">
					<h3 class="font-bold text-lg mb-4">{$t('scheduling.conflict.alternative_slots')}</h3>
					<div class="space-y-2 max-h-96 overflow-y-auto">
						{#each alternativesForRequest as slot (slot.startTime)}
							<div class="card bg-base-200 p-2">
								<p class="text-sm">
									{formatStandardDateTime(new Date(slot.startTime))} - {formatStandardDateTime(new Date(slot.startTime + slot.duration * 60 * 1000))}
								</p>
								<p class="text-xs text-base-content/70">
									{$t('scheduling.duration', { minutes: slot.duration })}
								</p>
							</div>
						{/each}
					</div>
					<div class="modal-action">
						<button class="btn btn-sm" onclick={() => (showAlternatives = false)}>
							{$t('common.buttons.close')}
						</button>
					</div>
				</div>
			</div>
		{/if}

		{#if isLoading}
			<div class="flex justify-center mt-4">
				<span class="loading loading-spinner loading-md"></span>
			</div>
		{/if}
	</div>
</div>

