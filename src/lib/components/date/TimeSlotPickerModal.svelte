<script lang="ts">
	import { tick } from 'svelte';
	import { t } from 'svelte-i18n';
	import { teleport } from '$lib/utils/portal';
	import { acquireScheduleModalScrollLock } from '$lib/utils/helpers/modalScrollLock';
	import {
		SCHEDULE_TIME_STEP_MINUTES,
		clampScheduleTimeNotBeforeNow,
		mergeClock12hToDate,
		mergeDateAndTime,
		snapLocalWallClockCeilToMinutesStep
	} from '$lib/utils/helpers/schedulePicker';

	interface Props {
		open: boolean;
		baseDate: Date;
		value: Date | null;
		/** When set from a range picker, shows a small "Start time" / "End time" title. */
		period?: 'start' | 'end';
		onClose: () => void;
		onSelect: (date: Date) => void;
	}

	let { open, baseDate, value, period, onClose, onSelect }: Props = $props();

	const timeModalTitleKey = $derived(
		period === 'start'
			? 'common.components.schedule_picker.time_label_start'
			: period === 'end'
				? 'common.components.schedule_picker.time_label_end'
				: 'common.components.schedule_picker.time'
	);

	let hour12 = $state(12);
	let minute = $state(0);
	let isPm = $state(false);

	let hourStr = $state('12');
	let minStr = $state('00');

	let hourInputEl: HTMLInputElement | null = $state(null);
	let minInputEl: HTMLInputElement | null = $state(null);

	let modalEl: HTMLDivElement | null = $state(null);

	const noonBase = $derived(
		new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 12, 0, 0, 0)
	);

	function syncFromValue() {
		const ref = value ?? mergeDateAndTime(baseDate, noonBase);
		const h24 = ref.getHours();
		isPm = h24 >= 12;
		const h12 = h24 % 12;
		hour12 = h12 === 0 ? 12 : h12;
		minute = ref.getMinutes();
		hourStr = String(hour12).padStart(2, '0');
		minStr = String(minute).padStart(2, '0');
	}

	/** Prefer DOM value so OK/blur always matches what the user sees (avoids stale bind state). */
	function commitHourFromInput() {
		const raw = (hourInputEl?.value ?? hourStr).replace(/\D/g, '').slice(0, 2);
		hourStr = raw;
		const v = parseInt(raw, 10);
		if (raw.trim() === '' || Number.isNaN(v)) {
			hourStr = String(hour12).padStart(2, '0');
			return;
		}
		hour12 = Math.min(12, Math.max(1, v));
		hourStr = String(hour12).padStart(2, '0');
	}

	function commitMinFromInput() {
		const raw = (minInputEl?.value ?? minStr).replace(/\D/g, '').slice(0, 2);
		minStr = raw;
		const v = parseInt(raw, 10);
		if (raw.trim() === '' || Number.isNaN(v)) {
			minStr = String(minute).padStart(2, '0');
			return;
		}
		minute = Math.min(59, Math.max(0, v));
		minStr = String(minute).padStart(2, '0');
	}

	function onHourInput(e: Event) {
		const el = e.target as HTMLInputElement;
		hourStr = el.value.replace(/\D/g, '').slice(0, 2);
	}

	function onMinInput(e: Event) {
		const el = e.target as HTMLInputElement;
		minStr = el.value.replace(/\D/g, '').slice(0, 2);
	}

	function adjustHour(delta: number) {
		commitHourFromInput();
		hour12 += delta;
		if (hour12 > 12) hour12 = 1;
		if (hour12 < 1) hour12 = 12;
		hourStr = String(hour12).padStart(2, '0');
	}

	function adjustMinute(delta: number) {
		commitMinFromInput();
		// Snap to nearest 15-min boundary, then step by delta
		const step = 15;
		const snapped = Math.round(minute / step) * step;
		minute = snapped + delta;
		if (minute >= 60) {
			minute -= 60;
			adjustHour(1);
		} else if (minute < 0) {
			minute += 60;
			adjustHour(-1);
		}
		minStr = String(minute).padStart(2, '0');
	}

	function onHourKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commitHourFromInput();
			minInputEl?.focus();
			minInputEl?.select();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			adjustHour(1);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			adjustHour(-1);
		}
	}

	function onMinKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commitMinFromInput();
			confirm();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			adjustMinute(15);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			adjustMinute(-15);
		}
	}

	function onHourWheel(e: WheelEvent) {
		e.preventDefault();
		adjustHour(e.deltaY < 0 ? 1 : -1);
	}

	function onMinWheel(e: WheelEvent) {
		e.preventDefault();
		adjustMinute(e.deltaY < 0 ? 15 : -15);
	}

	/** Only sync when the modal opens — not when `value`/`baseDate` change while open (that was resetting typed hours). */
	let lastModalOpen = $state(false);
	$effect(() => {
		if (open) {
			if (!lastModalOpen) {
				syncFromValue();
				void tick().then(() => {
					hourInputEl?.focus();
					hourInputEl?.select();
				});
			}
			lastModalOpen = true;
		} else {
			lastModalOpen = false;
		}
	});

	$effect(() => {
		if (!open) {
			return;
		}
		return acquireScheduleModalScrollLock();
	});

	$effect(() => {
		if (!open) return;
		const modal = modalEl;
		if (!modal) return;

		const focusableSelector =
			'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key !== 'Tab') return;
			const focusable = modal.querySelectorAll(focusableSelector);
			if (focusable.length === 0) return;
			const first = focusable[0] as HTMLElement;
			const last = focusable[focusable.length - 1] as HTMLElement;

			if (e.shiftKey) {
				if (document.activeElement === first) {
					e.preventDefault();
					last.focus();
				}
			} else {
				if (document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			}
		};

		modal.addEventListener('keydown', handleKeyDown);
		return () => modal.removeEventListener('keydown', handleKeyDown);
	});

	function confirm() {
		commitHourFromInput();
		commitMinFromInput();
		let merged = mergeClock12hToDate(baseDate, hour12, minute, isPm);
		merged = clampScheduleTimeNotBeforeNow(merged, new Date());
		merged = snapLocalWallClockCeilToMinutesStep(merged, SCHEDULE_TIME_STEP_MINUTES);
		onSelect(merged);
		onClose();
	}

	function handleWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.preventDefault();
			onClose();
		}
	}

	const inputClass =
		'input border-2 font-mono text-4xl font-bold tabular-nums transition-[box-shadow,background-color,border-color] ' +
		'min-h-17 w-[5.25rem] rounded-2xl border-base-300 bg-base-200/90 px-2 text-center text-base-content ' +
		'focus:border-primary focus:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/25';
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if open}
	<div
		bind:this={modalEl}
		use:teleport
		class="modal modal-open modal-middle z-230 overscroll-contain"
	>
		<div
			class="modal-box border-base-300 bg-base-100 flex max-h-[min(92dvh,92vh)] w-full max-w-[min(100%,20rem)] flex-col overflow-hidden rounded-3xl border p-0 shadow-xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="bittasker-time-modal-heading"
		>
			<div class="flex items-start justify-between gap-2 px-4 pt-3 pb-0">
				<p
					id="bittasker-time-modal-heading"
					class="text-base-content/60 max-w-48 pt-0.5 text-[0.65rem] leading-snug font-medium tracking-tight"
				>
					{$t(timeModalTitleKey)}
				</p>
				<button
					type="button"
					class="btn btn-circle btn-ghost btn-xs text-base-content/60 min-h-11 min-w-11 shrink-0"
					onclick={onClose}
					aria-label={$t('common.components.schedule_picker.close_picker')}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			<div class="flex flex-wrap items-start justify-center gap-x-2 gap-y-3 px-5 pt-2 pb-5">
				<div class="flex flex-col items-center gap-1.5">
					<input
						id="bittasker-time-hour"
						bind:this={hourInputEl}
						type="text"
						inputmode="numeric"
						autocomplete="off"
						maxlength="2"
						bind:value={hourStr}
						class={inputClass}
						oninput={onHourInput}
						onblur={commitHourFromInput}
						onkeydown={onHourKeydown}
						onwheel={onHourWheel}
						onfocus={(e) => e.currentTarget.select()}
					/>
					<label
						for="bittasker-time-hour"
						class="text-base-content/50 cursor-pointer text-xs font-medium"
					>
						{$t('common.components.schedule_picker.hour_short_label')}
					</label>
				</div>

				<span
					class="text-base-content/60 mt-4 self-start text-3xl leading-none font-light"
					aria-hidden="true">:</span
				>

				<div class="flex flex-col items-center gap-1.5">
					<input
						id="bittasker-time-minute"
						bind:this={minInputEl}
						type="text"
						inputmode="numeric"
						autocomplete="off"
						maxlength="2"
						bind:value={minStr}
						class={inputClass}
						oninput={onMinInput}
						onblur={commitMinFromInput}
						onkeydown={onMinKeydown}
						onwheel={onMinWheel}
						onfocus={(e) => e.currentTarget.select()}
					/>
					<label
						for="bittasker-time-minute"
						class="text-base-content/50 cursor-pointer text-xs font-medium"
					>
						{$t('common.components.schedule_picker.minute_short_label')}
					</label>
				</div>

				<div
					class="border-base-300 bg-base-200/90 ml-1 flex min-h-17 w-13 shrink-0 flex-col self-start overflow-hidden rounded-2xl border"
					role="group"
					aria-label={$t('common.components.schedule_picker.period_toggle_aria')}
				>
					<button
						type="button"
						class="btn btn-sm min-h-0 flex-1 rounded-none border-0 px-2 text-xs font-semibold {!isPm
							? 'btn-primary text-primary-content'
							: 'btn-ghost text-base-content/70 hover:bg-base-300/50'}"
						onclick={() => (isPm = false)}
						aria-pressed={!isPm}
					>
						{$t('common.components.schedule_picker.am')}
					</button>
					<button
						type="button"
						class="btn btn-sm border-base-300 min-h-0 flex-1 rounded-none border-0 border-t px-2 text-xs font-semibold {isPm
							? 'btn-primary text-primary-content'
							: 'btn-ghost text-base-content/70 hover:bg-base-300/50'}"
						onclick={() => (isPm = true)}
						aria-pressed={isPm}
					>
						{$t('common.components.schedule_picker.pm')}
					</button>
				</div>
			</div>

			<div class="border-base-200 flex items-center justify-end gap-1 border-t px-5 py-3">
				<div class="flex items-center gap-1">
					<button
						type="button"
						class="btn btn-ghost btn-sm text-primary min-h-11 px-3 font-medium normal-case hover:bg-transparent"
						onclick={onClose}
					>
						{$t('common.components.confirm_modal.cancel')}
					</button>
					<button
						type="button"
						class="btn btn-ghost btn-sm text-primary min-h-11 px-3 font-medium normal-case hover:bg-transparent"
						onclick={confirm}
					>
						{$t('common.components.schedule_picker.clock_ok')}
					</button>
				</div>
			</div>
		</div>
		<button
			type="button"
			class="modal-backdrop bg-neutral/40"
			onclick={onClose}
			aria-label={$t('common.components.modal.close')}
		></button>
	</div>
{/if}
