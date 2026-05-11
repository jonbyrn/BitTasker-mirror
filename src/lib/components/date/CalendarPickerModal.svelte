<script lang="ts">
	import { t, locale } from 'svelte-i18n';
	import { teleport } from '$lib/utils/portal';
	import { acquireScheduleModalScrollLock } from '$lib/utils/helpers/modalScrollLock';
	import {
		getMonthGridCells,
		isCalendarDayDisabled,
		sameCalendarDay
	} from '$lib/utils/helpers/schedulePicker';

	interface Props {
		open: boolean;
		selectedDate: Date | null;
		minDate?: Date;
		maxDate?: Date;
		onClose: () => void;
		onSelect: (date: Date | null) => void;
	}

	let { open, selectedDate, minDate, maxDate, onClose, onSelect }: Props = $props();

	let viewYear = $state(new Date().getFullYear());
	let viewMonth = $state(new Date().getMonth());

	let modalEl: HTMLDivElement | null = $state(null);

	$effect(() => {
		if (open) {
			const ref = selectedDate ?? minDate ?? new Date();
			viewYear = ref.getFullYear();
			viewMonth = ref.getMonth();
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

		const firstFocusable = modal.querySelector(focusableSelector) as HTMLElement | null;
		firstFocusable?.focus();

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

	const monthTitle = $derived.by(() => {
		const d = new Date(viewYear, viewMonth, 1);
		return new Intl.DateTimeFormat($locale || 'en', { month: 'long', year: 'numeric' }).format(d);
	});

	const weekdayLabels = $derived.by(() => {
		const fmt = new Intl.DateTimeFormat($locale || 'en', { weekday: 'short' });
		return Array.from({ length: 7 }, (_, i) => {
			const day = new Date(2024, 6, 7 + i);
			return fmt.format(day);
		});
	});

	const cells = $derived(getMonthGridCells(viewYear, viewMonth));

	function prevMonth() {
		if (viewMonth === 0) {
			viewMonth = 11;
			viewYear -= 1;
		} else {
			viewMonth -= 1;
		}
	}

	function nextMonth() {
		if (viewMonth === 11) {
			viewMonth = 0;
			viewYear += 1;
		} else {
			viewMonth += 1;
		}
	}

	function selectDay(day: number) {
		const next = new Date(viewYear, viewMonth, day, 12, 0, 0, 0);
		onSelect(next);
		onClose();
	}

	function handleClear() {
		onSelect(null);
		onClose();
	}

	function isSelectedDay(day: number): boolean {
		if (!selectedDate) return false;
		const cell = new Date(viewYear, viewMonth, day, 12, 0, 0, 0);
		return sameCalendarDay(cell, selectedDate);
	}

	function handleWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.preventDefault();
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if open}
	<!-- Teleport: Drawer uses transform on the panel; fixed modals would size to the drawer, not the viewport. -->
	<div
		bind:this={modalEl}
		use:teleport
		class="modal modal-open modal-middle z-220 overscroll-contain"
	>
		<div
			class="modal-box max-h-[min(90dvh,90vh)] max-w-sm overflow-y-auto p-0 shadow-xl"
			role="dialog"
			aria-modal="true"
		>
			<div class="border-base-200 flex items-center justify-between border-b px-3 py-3">
				<button
					type="button"
					class="btn btn-circle btn-ghost btn-sm"
					onclick={prevMonth}
					aria-label={$t('common.components.schedule_picker.previous_month')}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15 19l-7-7 7-7"
						/>
					</svg>
				</button>
				<span class="text-base-content font-semibold">{monthTitle}</span>
				<button
					type="button"
					class="btn btn-circle btn-ghost btn-sm"
					onclick={nextMonth}
					aria-label={$t('common.components.schedule_picker.next_month')}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 5l7 7-7 7"
						/>
					</svg>
				</button>
			</div>

			<div class="px-3 pt-3">
				<div class="text-base-content/60 grid grid-cols-7 gap-1 text-center text-xs font-medium">
					{#each weekdayLabels as wd, wi (wi)}
						<span>{wd}</span>
					{/each}
				</div>
				<div class="mt-2 grid grid-cols-7 gap-1 pb-2">
					{#each cells as cell, ci (ci)}
						{#if cell === null}
							<div class="aspect-square"></div>
						{:else}
							{@const disabled = isCalendarDayDisabled(cell, viewYear, viewMonth, minDate, maxDate)}
							{@const selected = isSelectedDay(cell)}
							<button
								type="button"
								class="btn btn-sm aspect-square min-h-9 border-0 p-0 font-normal {selected
									? 'btn-primary text-primary-content'
									: ''} {disabled ? 'opacity-30' : 'hover:bg-base-200'}"
								{disabled}
								onclick={() => selectDay(cell)}
							>
								{cell}
							</button>
						{/if}
					{/each}
				</div>
			</div>

			<div class="border-base-200 flex items-center justify-end gap-2 border-t px-3 py-2">
				<button type="button" class="btn btn-sm" onclick={handleClear}>{$t('common.clear')}</button>
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
