<script lang="ts">
	let {
		open = false,
		value = null,
		baseStartDate = undefined,
		onClose = () => {},
		onSelect = (_value: { days: number; hours: number; minutes: number }) => {}
	}: {
		open?: boolean;
		baseStartDate?: Date;
		value?: { days: number; hours: number; minutes: number } | null;
		onClose?: () => void;
		onSelect?: (value: { days: number; hours: number; minutes: number }) => void;
	} = $props();

	let days = $state(value?.days ?? 0);
	let hours = $state(value?.hours ?? 1);
	let minutes = $state(value?.minutes ?? 0);
	void baseStartDate;

	function submit(): void {
		onSelect({ days, hours, minutes });
	}
</script>

{#if open}
	<div class="modal modal-open">
		<div class="modal-box space-y-4">
			<h3 class="font-semibold">Duration</h3>
			<div class="grid grid-cols-3 gap-2">
				<input
					class="input input-bordered"
					type="number"
					min="0"
					bind:value={days}
					aria-label="Days"
				/>
				<input
					class="input input-bordered"
					type="number"
					min="0"
					bind:value={hours}
					aria-label="Hours"
				/>
				<input
					class="input input-bordered"
					type="number"
					min="0"
					bind:value={minutes}
					aria-label="Minutes"
				/>
			</div>
			<div class="modal-action">
				<button type="button" class="btn" onclick={onClose}>Cancel</button>
				<button type="button" class="btn btn-primary" onclick={submit}>Apply</button>
			</div>
		</div>
	</div>
{/if}
