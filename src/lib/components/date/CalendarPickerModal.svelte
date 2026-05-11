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

		// Focus the selected date or today's date if available, otherwise first focusable
		const selectedCell = modal.querySelector('[aria-selected="true"]') as HTMLElement | null;
		const todayCell = modal.querySelector('[aria-current="date"]') as HTMLElement | null;
		(selectedCell || todayCell || (modal.querySelector(focusableSelector) as HTMLElement))?.focus();

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

	const weeks = $derived.by(() => {
		const result: (number | null)[][] = [];
		for (let i = 0; i < cells.length; i += 7) {
			result.push(cells.slice(i, i + 7));
		}
		return result;
	});

	const fullWeekdayLabels = $derived.by(() => {
		const fmt = new Intl.DateTimeFormat($locale || 'en', { weekday: 'long' });
		return Array.from({ length: 7 }, (_, i) => {
			const day = new Date(2024, 6, 7 + i);
			return fmt.format(day);
		});
	});

	function isToday(day: number): boolean {
		const today = new Date();
		return (
			today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day
		);
	}

	function handleGridKeydown(e: KeyboardEvent) {
		const grid = e.currentTarget as HTMLElement;
		const currentButton = document.activeElement as HTMLButtonElement | null;
		if (!currentButton || !grid.contains(currentButton)) return;

		const currentIdx = parseInt(currentButton.dataset.idx ?? '-1', 10);
		if (currentIdx === -1 || isNaN(currentIdx)) return;

		const ARROW_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
		if (!ARROW_KEYS.includes(e.key)) return;
		e.preventDefault();

		let targetIdx = currentIdx;

		switch (e.key) {
			case 'ArrowLeft':
				targetIdx = currentIdx - 1;
				break;
			case 'ArrowRight':
				targetIdx = currentIdx + 1;
				break;
			case 'ArrowUp':
				targetIdx = currentIdx - 7;
				break;
			case 'ArrowDown':
				targetIdx = currentIdx + 7;
				break;
			case 'Home': {
				const first = cells.findIndex((c) => c !== null);
				targetIdx = first >= 0 ? first : 0;
				break;
			}
			case 'End': {
				let last = cells.length - 1;
				while (last >= 0 && cells[last] === null) last--;
				targetIdx = last >= 0 ? last : cells.length - 1;
				break;
			}
		}

		targetIdx = Math.max(0, Math.min(cells.length - 1, targetIdx));

		const tryFocus = (idx: number): boolean => {
			const btn = grid.querySelector(`button[data-idx="${idx}"]`) as HTMLButtonElement | null;
			if (btn && !btn.disabled) {
				btn.focus();
				return true;
			}
			return false;
		};

		if (tryFocus(targetIdx)) return;

		const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
		let searchIdx = targetIdx + step;
		while (searchIdx >= 0 && searchIdx < cells.length) {
			if (tryFocus(searchIdx)) return;
			searchIdx += step;
		}
	}

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
					class="btn btn-circle btn-ghost btn-sm min-h-11 min-w-11"
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
				<span class="text-base-content font-semibold" aria-live="polite">{monthTitle}</span>
				<button
					type="button"
					class="btn btn-circle btn-ghost btn-sm min-h-11 min-w-11"
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
				<div role="grid" tabindex="0" class="pb-2 outline-none" onkeydown={handleGridKeydown}>
					<div
						role="row"
						class="text-base-content/60 grid grid-cols-7 gap-1 text-center text-xs font-medium"
					>
						{#each weekdayLabels as wd, wi (wi)}
							<span role="columnheader" aria-label={fullWeekdayLabels[wi]}>{wd}</span>
						{/each}
					</div>
					{#each weeks as week, wi (wi)}
						<div role="row" class="grid grid-cols-7 gap-1 {wi === 0 ? 'mt-2' : 'mt-1'}">
							{#each week as cell, ci (wi * 7 + ci)}
								{#if cell === null}
									<div role="gridcell" class="aspect-square"></div>
								{:else}
									{@const disabled = isCalendarDayDisabled(
										cell,
										viewYear,
										viewMonth,
										minDate,
										maxDate
									)}
									{@const selected = isSelectedDay(cell)}
									<button
										type="button"
										role="gridcell"
										class="btn btn-sm aspect-square min-h-11 border-0 p-0 font-normal {selected
											? 'btn-primary text-primary-content'
											: ''} {disabled ? 'opacity-30' : 'hover:bg-base-200'}"
										{disabled}
										data-idx={wi * 7 + ci}
										aria-selected={selected || undefined}
										aria-current={isToday(cell) ? 'date' : undefined}
										onclick={() => selectDay(cell)}
									>
										{cell}
									</button>
								{/if}
							{/each}
						</div>
					{/each}
				</div>
			</div>

			<div class="border-base-200 flex items-center justify-end gap-2 border-t px-3 py-2">
				<button type="button" class="btn btn-sm min-h-11" onclick={handleClear}
					>{$t('common.clear')}</button
				>
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
