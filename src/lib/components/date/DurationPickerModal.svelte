<script lang="ts">
	import { untrack } from 'svelte';
	import { t } from 'svelte-i18n';

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

	let days = $state(untrack(() => value?.days ?? 0));
	let hours = $state(untrack(() => value?.hours ?? 1));
	let minutes = $state(untrack(() => value?.minutes ?? 0));

	// Re-sync when the caller opens the modal with a new value.
	let lastOpen = false;
	$effect(() => {
		if (open && !lastOpen) {
			days = value?.days ?? 0;
			hours = value?.hours ?? 1;
			minutes = value?.minutes ?? 0;
		}
		lastOpen = open;
	});

	const endDate = $derived.by(() => {
		if (!baseStartDate) return null;
		const end = new Date(baseStartDate.getTime());
		end.setDate(end.getDate() + days);
		end.setHours(end.getHours() + hours);
		end.setMinutes(end.getMinutes() + minutes);
		return end;
	});

	const endLabel = $derived.by(() => {
		if (!endDate) return '';
		return `${$t('common.at')} ${endDate.toLocaleDateString()} ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
	});

	function pad(value: number): string {
		return String(value).padStart(2, '0');
	}

	function submit(): void {
		onSelect({ days, hours, minutes });
		onClose();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') onClose();
	}
</script>

<svelte:document onkeydown={handleKeydown} />

{#if open}
	<div class="modal modal-open" role="dialog" aria-modal="true">
		<div class="modal-box space-y-4">
			<h3 class="font-semibold">{$t('common.components.duration_picker.title')}</h3>

			<div class="grid grid-cols-3 gap-2">
				<label class="form-control">
					<span class="label-text mb-1">{$t('common.components.duration_picker.days')}</span>
					<input
						class="input input-bordered"
						type="number"
						min="0"
						value={String(days)}
						oninput={(e) => (days = Number((e.target as HTMLInputElement).value) || 0)}
					/>
				</label>
				<label class="form-control">
					<span class="label-text mb-1">{$t('common.components.duration_picker.hours')}</span>
					<input
						class="input input-bordered"
						type="number"
						min="0"
						value={pad(hours)}
						oninput={(e) => (hours = Number((e.target as HTMLInputElement).value) || 0)}
					/>
				</label>
				<label class="form-control">
					<span class="label-text mb-1">{$t('common.components.duration_picker.minutes')}</span>
					<input
						class="input input-bordered"
						type="number"
						min="0"
						value={pad(minutes)}
						oninput={(e) => (minutes = Number((e.target as HTMLInputElement).value) || 0)}
					/>
				</label>
			</div>

			{#if endLabel}
				<p class="text-base-content/70 text-sm">{endLabel}</p>
			{/if}

			<div class="modal-action">
				<button type="button" class="btn" onclick={onClose}>{$t('common.cancel')}</button>
				<button type="button" class="btn btn-primary" onclick={submit}>
					{$t('common.components.schedule_picker.clock_ok')}
				</button>
			</div>
		</div>
	</div>
{/if}
