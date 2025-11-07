<script lang="ts">
	import type { CalculatedAvailableSlot } from '$lib/types/scheduling';
	import { formatStandardDateTime } from '$lib/utils/helpers/dateFormatter';
	import { t } from 'svelte-i18n';

	const props = $props<{
		availableSlots: CalculatedAvailableSlot[];
		selectedSlot?: CalculatedAvailableSlot | null;
		onSlotSelect?: (slot: CalculatedAvailableSlot) => void;
		onSlotDeselect?: () => void;
		showCalendar?: boolean;
		maxVisibleSlots?: number;
	}>();

	let displayedSlots = $derived(() => {
		const max = props.maxVisibleSlots || 10;
		return props.availableSlots.slice(0, max);
	});

	let hasMoreSlots = $derived(() => props.availableSlots.length > (props.maxVisibleSlots || 10));

	function handleSlotClick(slot: CalculatedAvailableSlot) {
		if (props.selectedSlot?.startTime === slot.startTime) {
			// Deselect if clicking same slot
			if (props.onSlotDeselect) {
				props.onSlotDeselect();
			}
		} else {
			// Select new slot
			if (props.onSlotSelect) {
				props.onSlotSelect(slot);
			}
		}
	}
</script>

<div class="space-y-2">
	{#if props.availableSlots.length === 0}
		<div class="alert alert-info">
			<span>{$t('scheduling.no_available_slots')}</span>
		</div>
	{:else}
		<div class="space-y-2 max-h-96 overflow-y-auto">
			{#each displayedSlots as slot (slot.startTime)}
				<label
					class="card bg-base-200 cursor-pointer hover:bg-base-300 transition-colors {props.selectedSlot?.startTime === slot.startTime ? 'ring-2 ring-primary' : ''}"
					role="button"
					tabindex="0"
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							handleSlotClick(slot);
						}
					}}
				>
					<div class="card-body p-3">
						<div class="flex items-center gap-3">
							<input
								type="radio"
								name="available-slot"
								class="radio radio-primary"
								checked={props.selectedSlot?.startTime === slot.startTime}
								onchange={() => handleSlotClick(slot)}
							/>
							<div class="flex-1">
								<p class="font-semibold text-sm">
									{formatStandardDateTime(new Date(slot.startTime))}
								</p>
								<p class="text-xs text-base-content/70">
									{$t('scheduling.duration', { minutes: slot.duration })}
								</p>
							</div>
							{#if props.selectedSlot?.startTime === slot.startTime}
								<span class="badge badge-success badge-sm">{$t('common.selected')}</span>
							{/if}
						</div>
					</div>
				</label>
			{/each}
		</div>

		{#if hasMoreSlots}
			<div class="text-center text-sm text-base-content/70">
				{$t('scheduling.more_slots_available', {
					count: props.availableSlots.length - displayedSlots.length
				})}
			</div>
		{/if}
	{/if}
</div>

