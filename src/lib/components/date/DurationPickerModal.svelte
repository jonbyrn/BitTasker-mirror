<script lang="ts">
	import { tick } from 'svelte';
	import { SvelteDate } from 'svelte/reactivity';
	import { t, locale } from 'svelte-i18n';
	import { teleport } from '$lib/utils/portal';
	import { acquireScheduleModalScrollLock } from '$lib/utils/helpers/modalScrollLock';
	import {
		formatScheduleDateDisplay,
		formatScheduleTime12h
	} from '$lib/utils/helpers/schedulePicker';
	import { SCHEDULE_TIME_STEP_MINUTES } from '$lib/utils/helpers/schedulePicker';

	interface Props {
		open: boolean;
		/** The start date/time used to compute the completion time */
		baseStartDate: Date;
		/** Current duration in { days, hours, minutes } or null to use default */
		value: { days: number; hours: number; minutes: number } | null;
		onClose: () => void;
		onSelect: (duration: { days: number; hours: number; minutes: number }) => void;
	}

	let { open, baseStartDate, value, onClose, onSelect }: Props = $props();

	let days = $state(0);
	let hours = $state(1);
	let minutes = $state(0);

	let daysStr = $state('0');
	let hoursStr = $state('01');
	let minsStr = $state('00');

	let daysInputEl: HTMLInputElement | null = $state(null);
	let hoursInputEl: HTMLInputElement | null = $state(null);
	let minsInputEl: HTMLInputElement | null = $state(null);

	const DEFAULT_STEP = SCHEDULE_TIME_STEP_MINUTES; // 15

	const computedEnd = $derived.by(() => {
		const end = new SvelteDate(baseStartDate.getTime());
		end.setDate(end.getDate() + days);
		end.setHours(end.getHours() + hours);
		end.setMinutes(end.getMinutes() + minutes);
		return end;
	});

	const endDateDisplay = $derived.by(() => formatScheduleDateDisplay(computedEnd, $locale || 'en'));
	const endTimeDisplay = $derived.by(() => formatScheduleTime12h(computedEnd, $locale || 'en'));

	function syncFromValue() {
		if (value) {
			days = value.days;
			hours = value.hours;
			minutes = value.minutes;
		} else {
			days = 0;
			hours = 1;
			minutes = 0;
		}
		daysStr = String(days);
		hoursStr = String(hours).padStart(2, '0');
		minsStr = String(minutes).padStart(2, '0');
	}

	let lastModalOpen = $state(false);
	$effect(() => {
		if (open) {
			if (!lastModalOpen) {
				syncFromValue();
				void tick().then(() => {
					daysInputEl?.focus();
					daysInputEl?.select();
				});
			}
			lastModalOpen = true;
		} else {
			lastModalOpen = false;
		}
	});

	$effect(() => {
		if (!open) return;
		return acquireScheduleModalScrollLock();
	});

	// ---- input handlers ----

	function onDaysInput(e: Event) {
		const el = e.target as HTMLInputElement;
		daysStr = el.value.replace(/\D/g, '').slice(0, 3);
	}

	function onHoursInput(e: Event) {
		const el = e.target as HTMLInputElement;
		hoursStr = el.value.replace(/\D/g, '').slice(0, 2);
	}

	function onMinsInput(e: Event) {
		const el = e.target as HTMLInputElement;
		minsStr = el.value.replace(/\D/g, '').slice(0, 2);
	}

	function commitDaysFromInput() {
		const v = parseInt(daysStr, 10);
		days = Number.isNaN(v) ? days : Math.max(0, v);
		daysStr = String(days);
	}

	function commitHoursFromInput() {
		const v = parseInt(hoursStr, 10);
		hours = Number.isNaN(v) ? hours : Math.min(23, Math.max(0, v));
		hoursStr = String(hours).padStart(2, '0');
	}

	function commitMinsFromInput() {
		const v = parseInt(minsStr, 10);
		const snapped = Math.round(v / DEFAULT_STEP) * DEFAULT_STEP;
		minutes = Math.min(59, Math.max(0, snapped));
		minsStr = String(minutes).padStart(2, '0');
	}

	// ---- keyboard + scroll ----

	function adjustDays(delta: number) {
		commitDaysFromInput();
		days = Math.max(0, days + delta);
		daysStr = String(days);
	}

	function adjustHours(delta: number) {
		commitHoursFromInput();
		hours += delta;
		if (hours > 23) hours = 0;
		else if (hours < 0) hours = 23;
		hoursStr = String(hours).padStart(2, '0');
	}

	function adjustMins(delta: number) {
		commitMinsFromInput();
		minutes += delta;
		if (minutes >= 60) minutes -= 60;
		else if (minutes < 0) minutes += 60;
		minsStr = String(minutes).padStart(2, '0');
	}

	function onDaysKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commitDaysFromInput();
			hoursInputEl?.focus();
			hoursInputEl?.select();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			adjustDays(1);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			adjustDays(-1);
		}
	}

	function onHoursKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commitHoursFromInput();
			minsInputEl?.focus();
			minsInputEl?.select();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			adjustHours(1);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			adjustHours(-1);
		}
	}

	function onMinsKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commitMinsFromInput();
			confirm();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			adjustMins(DEFAULT_STEP);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			adjustMins(-DEFAULT_STEP);
		}
	}

	function onDaysWheel(e: WheelEvent) {
		e.preventDefault();
		adjustDays(e.deltaY < 0 ? 1 : -1);
	}
	function onHoursWheel(e: WheelEvent) {
		e.preventDefault();
		adjustHours(e.deltaY < 0 ? 1 : -1);
	}
	function onMinsWheel(e: WheelEvent) {
		e.preventDefault();
		adjustMins(e.deltaY < 0 ? DEFAULT_STEP : -DEFAULT_STEP);
	}

	function confirm() {
		commitDaysFromInput();
		commitHoursFromInput();
		commitMinsFromInput();
		onSelect({ days, hours, minutes });
		onClose();
	}

	// ---- window Escape ----
	function handleWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.preventDefault();
			onClose();
		}
	}

	// ---- focus trap ----
	let modalEl: HTMLDivElement | null = $state(null);
	$effect(() => {
		if (!open) return;
		const modal = modalEl;
		if (!modal) return;

		const selector =
			'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key !== 'Tab') return;
			const focusable = modal.querySelectorAll(selector);
			if (focusable.length === 0) return;
			const first = focusable[0] as HTMLElement;
			const last = focusable[focusable.length - 1] as HTMLElement;
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		};
		modal.addEventListener('keydown', handleKeyDown);
		return () => modal.removeEventListener('keydown', handleKeyDown);
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if open}
	<div
		bind:this={modalEl}
		use:teleport
		class="modal modal-open modal-middle z-230 overscroll-contain"
	>
		<div
			class="modal-box max-h-[min(92dvh,92vh)] max-w-[min(100%,24rem)] p-0 shadow-xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="bittasker-duration-modal-heading"
		>
			<!-- header -->
			<div class="border-base-200 flex items-center justify-between border-b px-4 py-3">
				<div id="bittasker-duration-modal-heading" class="label min-h-0 py-0">
					<span class="label-text">{$t('common.components.duration_picker.title')}</span>
				</div>
				<button
					type="button"
					class="btn btn-circle btn-ghost btn-xs text-base-content/60 min-h-11 min-w-11 shrink-0"
					onclick={onClose}
					aria-label={$t('common.components.schedule_picker.close_picker')}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/></svg
					>
				</button>
			</div>

			<!-- inputs -->
			<div class="flex items-center justify-center gap-x-2 gap-y-3 px-4 pt-4 pb-2">
				<!-- Days -->
				<div class="flex flex-col items-center gap-1.5">
					<input
						id="bittasker-duration-days"
						bind:this={daysInputEl}
						type="text"
						inputmode="numeric"
						autocomplete="off"
						maxlength="3"
						bind:value={daysStr}
						class="input border-base-300 bg-base-200/90 focus:border-primary focus:bg-primary/10 focus:ring-primary/25 min-h-17 w-[5.25rem] rounded-2xl border-2 px-2 text-center font-mono text-4xl leading-none font-bold tabular-nums transition-[box-shadow,background-color,border-color] focus:ring-2 focus:outline-none"
						oninput={onDaysInput}
						onblur={commitDaysFromInput}
						onkeydown={onDaysKeydown}
						onwheel={onDaysWheel}
						onfocus={(e) => e.currentTarget.select()}
					/>
					<label for="bittasker-duration-days" class="text-base-content/50 text-xs font-medium"
						>{$t('common.components.duration_picker.days')}</label
					>
				</div>

				<!-- separator -->
				<span
					class="text-base-content/60 mt-4 self-start text-3xl leading-none font-light"
					aria-hidden="true">:</span
				>

				<!-- Hours -->
				<div class="flex flex-col items-center gap-1.5">
					<input
						id="bittasker-duration-hours"
						bind:this={hoursInputEl}
						type="text"
						inputmode="numeric"
						autocomplete="off"
						maxlength="2"
						bind:value={hoursStr}
						class="input border-base-300 bg-base-200/90 focus:border-primary focus:bg-primary/10 focus:ring-primary/25 min-h-17 w-[5.25rem] rounded-2xl border-2 px-2 text-center font-mono text-4xl leading-none font-bold tabular-nums transition-[box-shadow,background-color,border-color] focus:ring-2 focus:outline-none"
						oninput={onHoursInput}
						onblur={commitHoursFromInput}
						onkeydown={onHoursKeydown}
						onwheel={onHoursWheel}
						onfocus={(e) => e.currentTarget.select()}
					/>
					<label for="bittasker-duration-hours" class="text-base-content/50 text-xs font-medium"
						>{$t('common.components.duration_picker.hours')}</label
					>
				</div>

				<!-- separator -->
				<span
					class="text-base-content/60 mt-4 self-start text-3xl leading-none font-light"
					aria-hidden="true">:</span
				>

				<!-- Minutes -->
				<div class="flex flex-col items-center gap-1.5">
					<input
						id="bittasker-duration-minutes"
						bind:this={minsInputEl}
						type="text"
						inputmode="numeric"
						autocomplete="off"
						maxlength="2"
						bind:value={minsStr}
						class="input border-base-300 bg-base-200/90 focus:border-primary focus:bg-primary/10 focus:ring-primary/25 min-h-17 w-[5.25rem] rounded-2xl border-2 px-2 text-center font-mono text-4xl leading-none font-bold tabular-nums transition-[box-shadow,background-color,border-color] focus:ring-2 focus:outline-none"
						oninput={onMinsInput}
						onblur={commitMinsFromInput}
						onkeydown={onMinsKeydown}
						onwheel={onMinsWheel}
						onfocus={(e) => e.currentTarget.select()}
					/>
					<label for="bittasker-duration-minutes" class="text-base-content/50 text-xs font-medium"
						>{$t('common.components.duration_picker.minutes')}</label
					>
				</div>
			</div>

			<!-- computed end -->
			<div class="bg-base-200/50 mx-4 mt-2 mb-4 rounded-xl px-4 py-3 text-center">
				<span class="text-base-content/60 text-xs font-medium">
					{$t('common.components.duration_picker.completes_by')}
				</span>
				<div class="text-base-content mt-0.5 text-sm font-semibold">
					{endDateDisplay}
					{$t('common.at')}
					{endTimeDisplay}
				</div>
			</div>

			<!-- footer -->
			<div class="border-base-200 flex items-center justify-end gap-2 border-t px-3 py-2">
				<button
					type="button"
					class="btn btn-ghost btn-sm text-primary min-h-11 px-3 font-medium normal-case hover:bg-transparent"
					onclick={onClose}
				>
					{$t('common.cancel')}
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
		<button
			type="button"
			class="modal-backdrop bg-neutral/40"
			onclick={onClose}
			aria-label={$t('common.components.modal.close')}
		></button>
	</div>
{/if}
