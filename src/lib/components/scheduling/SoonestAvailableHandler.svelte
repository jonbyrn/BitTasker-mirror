<script lang="ts">
	import type { RequestQueueItem } from '$lib/stores/request-queue.store';
	import type { SoonestAvailableRequest } from '$lib/types/scheduling';
	import { calculateAvailableSlots } from '$lib/utils/availability-calculator';
	import { sendRequestAcceptance } from '$lib/utils/nostr-scheduling';
	import { requestQueueStore } from '$lib/stores/request-queue.store';
	import { formatStandardDateTime } from '$lib/utils/helpers/dateFormatter';
	import { t } from 'svelte-i18n';
	import type { Availability, TimeSlot } from '$lib/types/profile';
	import type { TaskeeAvailabilityData } from '$lib/types/scheduling';

	const props = $props<{
		request: RequestQueueItem;
		availabilityData?: TaskeeAvailabilityData;
		onClose?: () => void;
	}>();

	let selectedSlot = $state<{ startTime: number; endTime: number } | null>(null);
	let availableSlots = $state<Array<{ startTime: number; endTime: number; duration: number }>>([]);
	let isLoading = $state(false);

	$effect(() => {
		if (props.availabilityData && props.request.type === 'soonest-available-request') {
			// Calculate available slots
			const slots = calculateAvailableSlots(
				props.availabilityData.profileAvailability,
				props.availabilityData.blockedTimes,
				props.availabilityData.taskWindow,
				60 // Default 1 hour duration - TODO: get from bid
			);

			availableSlots = slots;
			// Auto-select soonest slot
			if (slots.length > 0) {
				selectedSlot = {
					startTime: slots[0].startTime,
					endTime: slots[0].endTime
				};
			}
		}
	});

	async function handleAccept() {
		if (!selectedSlot) return;

		isLoading = true;
		try {
			await sendRequestAcceptance({
				requestId: props.request.id,
				bidId: props.request.bidId,
				taskId: props.request.taskId,
				taskerPubkey: props.request.taskerPubkey,
				taskeePubkey: props.request.taskeePubkey,
				acceptedStartTime: selectedSlot.startTime,
				acceptedEndTime: selectedSlot.endTime
			});

			// Update status
			requestQueueStore.updateRequestStatus(props.request.id, 'accepted', {
				acceptedTime: {
					startTime: selectedSlot.startTime,
					endTime: selectedSlot.endTime
				}
			});

			if (props.onClose) {
				props.onClose();
			}
		} catch (error) {
			console.error('Failed to accept soonest available request:', error);
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="modal modal-open">
	<div class="modal-box">
		<h3 class="font-bold text-lg mb-4">{$t('scheduling.soonest_available.title')}</h3>

		{#if availableSlots.length === 0}
			<div class="alert alert-warning">
				<span>{$t('scheduling.soonest_available.no_slots')}</span>
			</div>
		{:else}
			<div class="space-y-2 max-h-96 overflow-y-auto">
				{#each availableSlots.slice(0, 10) as slot (slot.startTime)}
					<label
						class="card bg-base-200 cursor-pointer hover:bg-base-300 transition-colors {selectedSlot?.startTime === slot.startTime ? 'ring-2 ring-primary' : ''}"
					>
						<div class="card-body p-3">
							<div class="flex items-center gap-3">
								<input
									type="radio"
									name="slot"
									class="radio radio-primary"
									checked={selectedSlot?.startTime === slot.startTime}
									onchange={() => {
										selectedSlot = { startTime: slot.startTime, endTime: slot.endTime };
									}}
								/>
								<div class="flex-1">
									<p class="font-semibold">
										{formatStandardDateTime(new Date(slot.startTime))}
									</p>
									<p class="text-xs text-base-content/70">
										{$t('scheduling.duration', { minutes: slot.duration })}
									</p>
								</div>
							</div>
						</div>
					</label>
				{/each}
			</div>
		{/if}

		<div class="modal-action">
			{#if props.onClose}
				<button class="btn btn-ghost" onclick={props.onClose} disabled={isLoading}>
					{$t('common.buttons.cancel')}
				</button>
			{/if}
			<button
				class="btn btn-primary"
				onclick={handleAccept}
				disabled={!selectedSlot || isLoading}
			>
				{#if isLoading}
					<span class="loading loading-spinner loading-sm"></span>
				{:else}
					{$t('common.buttons.accept')}
				{/if}
			</button>
		</div>
	</div>
</div>

