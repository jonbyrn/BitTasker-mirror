<script lang="ts">
	import { locale, t } from 'svelte-i18n';
	import CalendarPickerModal from '$lib/components/date/CalendarPickerModal.svelte';
	import TimeSlotPickerModal from '$lib/components/date/TimeSlotPickerModal.svelte';
	import {
		defaultDateTimeOnCalendarDay,
		formatScheduleDateDisplay,
		formatScheduleTime12h,
		formatScheduleTime12hParts,
		mergeDateAndTime
	} from '$lib/utils/helpers/schedulePicker';

	interface Props {
		value: Date | null;
		minDate?: Date;
		maxDate?: Date;
		headingKey?: string;
		/** When set with a range picker, date/time placeholders and time label distinguish start vs end. */
		period?: 'start' | 'end';
		dateLabelKey?: string;
		timeLabelKey?: string;
		/** When true, date/time controls are inactive (e.g. end before start is chosen). */
		disabled?: boolean;
		onChange: (date: Date | null) => void;
	}

	let {
		value = $bindable(null),
		minDate,
		maxDate,
		headingKey,
		period,
		dateLabelKey = 'common.components.schedule_picker.date',
		timeLabelKey = 'common.components.schedule_picker.time',
		disabled = false,
		onChange
	}: Props = $props();

	const datePlaceholderKey = $derived(
		period === 'start'
			? 'common.components.schedule_picker.placeholder_date_start'
			: period === 'end'
				? 'common.components.schedule_picker.placeholder_date_end'
				: 'common.components.schedule_picker.select_date'
	);

	const timePlaceholderKey = $derived(
		period === 'start'
			? 'common.components.schedule_picker.placeholder_time_start'
			: period === 'end'
				? 'common.components.schedule_picker.placeholder_time_end'
				: 'common.components.schedule_picker.select_time'
	);

	const effectiveTimeLabelKey = $derived(
		period === 'start'
			? 'common.components.schedule_picker.time_label_start'
			: period === 'end'
				? 'common.components.schedule_picker.time_label_end'
				: timeLabelKey
	);

	const effectiveDateLabelKey = $derived(
		period === 'start'
			? 'common.components.schedule_picker.date_accessibility_start'
			: period === 'end'
				? 'common.components.schedule_picker.date_accessibility_end'
				: dateLabelKey
	);

	const sectionLabelId = $derived(
		period === 'start'
			? 'bittasker-schedule-section-start'
			: period === 'end'
				? 'bittasker-schedule-section-end'
				: undefined
	);

	let calendarOpen = $state(false);
	let timeOpen = $state(false);

	const dateDisplay = $derived.by(() => {
		if (!value) {
			return '';
		}
		return formatScheduleDateDisplay(value, $locale || 'en');
	});

	const timeDisplay = $derived.by(() => {
		if (!value) {
			return '';
		}
		return formatScheduleTime12h(value, $locale || 'en');
	});

	const timeDisplayParts = $derived.by(() => {
		if (!value) {
			return { main: '', suffix: '' };
		}
		return formatScheduleTime12hParts(value, $locale || 'en');
	});

	const baseDateForTime = $derived.by(() => {
		if (value) {
			return new Date(value.getFullYear(), value.getMonth(), value.getDate());
		}
		const m = minDate ?? new Date();
		return new Date(m.getFullYear(), m.getMonth(), m.getDate());
	});

	function emit(next: Date | null) {
		value = next;
		onChange(next);
	}

	function openCalendar() {
		if (disabled) return;
		timeOpen = false;
		calendarOpen = true;
	}

	function openTime() {
		if (disabled) return;
		calendarOpen = false;
		timeOpen = true;
	}

	$effect(() => {
		if (disabled) {
			calendarOpen = false;
			timeOpen = false;
		}
	});

	function onCalendarSelect(d: Date | null) {
		if (d === null) {
			emit(null);
			return;
		}
		if (value) {
			emit(mergeDateAndTime(d, value));
		} else {
			emit(defaultDateTimeOnCalendarDay(d, minDate));
		}
	}

	function onTimeSelect(d: Date) {
		emit(d);
	}

	const pickerActive = $derived(calendarOpen || timeOpen);
	const showTimeMicroLabel = $derived(!headingKey);
</script>

<div
	class="form-control min-w-0 gap-0.5 sm:gap-3"
	role={headingKey && sectionLabelId ? 'group' : undefined}
	aria-labelledby={headingKey && sectionLabelId ? sectionLabelId : undefined}
>
	{#if headingKey}
		<div id={sectionLabelId} class="label min-h-0 py-0">
			<span class="label-text" class:opacity-50={disabled}>{$t(headingKey)}</span>
		</div>
	{/if}
	<div
		class="flex min-w-0 gap-1 rounded-lg transition-shadow sm:gap-2 {pickerActive && !disabled
			? 'ring-primary/30 ring-offset-base-100 ring-2 ring-offset-0 sm:ring-offset-2'
			: ''}"
	>
		<button
			type="button"
			class="input input-bordered hover:bg-base-200/50 flex min-h-11 min-w-0 flex-1 items-center gap-1 px-1.5 py-0 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:gap-1.5 sm:px-2 {calendarOpen
				? 'border-primary'
				: ''}"
			{disabled}
			onclick={openCalendar}
			aria-haspopup="dialog"
			aria-expanded={calendarOpen}
			aria-label={$t(effectiveDateLabelKey) + ': ' + (dateDisplay || $t(datePlaceholderKey))}
		>
			<span class="text-base-content shrink-0" aria-hidden="true">
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
						stroke-width="1.75"
						d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
					/>
				</svg>
			</span>
			<span class="text-base-content min-w-0 flex-1 truncate text-sm leading-tight font-semibold">
				{dateDisplay || $t(datePlaceholderKey)}
			</span>
		</button>
		<button
			type="button"
			class="input input-bordered hover:bg-base-200/50 flex min-h-11 min-w-0 flex-1 items-center gap-1 px-1.5 py-0 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:gap-1.5 sm:px-2 {timeOpen
				? 'border-primary'
				: ''}"
			{disabled}
			onclick={openTime}
			aria-haspopup="dialog"
			aria-expanded={timeOpen}
			aria-label={$t(effectiveTimeLabelKey) + ': ' + (value ? timeDisplay : $t(timePlaceholderKey))}
		>
			<span class="text-base-content shrink-0" aria-hidden="true">
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
						stroke-width="1.75"
						d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			</span>
			{#if showTimeMicroLabel}
				<span class="flex min-w-0 flex-1 flex-col items-start justify-center gap-0.5 text-left">
					<span
						class="text-base-content/50 text-[0.65rem] leading-tight font-medium tracking-tight"
					>
						{$t(effectiveTimeLabelKey)}
					</span>
					{#if value && timeDisplayParts.suffix}
						<span class="flex max-w-full min-w-0 items-baseline gap-1">
							<span
								class="text-base-content max-w-[min(100%,8rem)] truncate text-sm leading-tight font-semibold tabular-nums"
								>{timeDisplayParts.main}</span
							>
							<span class="text-base-content/75 shrink-0 text-[0.7rem] leading-none font-medium"
								>{timeDisplayParts.suffix}</span
							>
						</span>
					{:else}
						<span class="text-base-content max-w-full truncate text-sm leading-tight font-semibold">
							{value ? timeDisplay : $t(timePlaceholderKey)}
						</span>
					{/if}
				</span>
			{:else if value && timeDisplayParts.suffix}
				<span class="flex min-w-0 flex-1 items-baseline gap-1">
					<span
						class="text-base-content max-w-[min(100%,8rem)] truncate text-sm leading-tight font-semibold tabular-nums"
						>{timeDisplayParts.main}</span
					>
					<span class="text-base-content/75 shrink-0 text-[0.7rem] leading-none font-medium"
						>{timeDisplayParts.suffix}</span
					>
				</span>
			{:else}
				<span class="text-base-content min-w-0 flex-1 truncate text-sm leading-tight font-semibold">
					{value ? timeDisplay : $t(timePlaceholderKey)}
				</span>
			{/if}
		</button>
	</div>
</div>

<CalendarPickerModal
	open={calendarOpen && !disabled}
	selectedDate={value}
	{minDate}
	{maxDate}
	onClose={() => (calendarOpen = false)}
	onSelect={onCalendarSelect}
/>

<TimeSlotPickerModal
	open={timeOpen && !disabled}
	baseDate={baseDateForTime}
	{value}
	{period}
	onClose={() => (timeOpen = false)}
	onSelect={onTimeSelect}
/>
