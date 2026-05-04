<script lang="ts">
	import IconClockOutline from '~icons/mdi/clock-outline';
	import { locale, t } from 'svelte-i18n';
	import {
		parseDateWithLocalTime,
		formatStandardDateShort,
		formatStandardDateTimeShort,
		formatDurationBetweenDates
	} from '$lib/utils/helpers/dateFormatter';

	const {
		deadline = null,
		dateRangeStart = null,
		dateRangeEnd = null,
		showTime = false,
		showDuration = false,
		estimatedDuration = null,
		label = null,
		labelPlacement = 'above',
		variant = 'default',
		align = 'left',
		showYear = true
	} = $props<{
		deadline?: Date | number | string | null;
		dateRangeStart?: Date | number | string | null;
		dateRangeEnd?: Date | number | string | null;
		/** Include time in output (e.g. "Feb 14, 2026 at 10:59 PM") */
		showTime?: boolean;
		/** Show computed or provided duration below the date range (e.g. "18 hours and 45 minutes") */
		showDuration?: boolean;
		/** Pre-formatted duration string (used when bid has estimatedDuration); overrides computed duration */
		estimatedDuration?: string | null;
		/** Optional label shown above or inline with the date */
		label?: string | null;
		/** Where to render `label` when provided */
		labelPlacement?: 'above' | 'inline';
		/** Layout variant for the block */
		variant?: 'default' | 'stacked';
		/** Text alignment when using stacked layout */
		align?: 'left' | 'right';
		/** Include the year in the date format (e.g. "Feb 14, 2026" vs "Feb 14") */
		showYear?: boolean;
	}>();

	function toDate(value: Date | number | string | null | undefined): Date | null {
		if (!value) return null;
		if (value instanceof Date) return value;
		if (typeof value === 'number') {
			return value > 1000000000000 ? new Date(value) : new Date(value * 1000);
		}
		if (typeof value === 'string') {
			return parseDateWithLocalTime(value) || new Date(value);
		}
		return null;
	}

	function formatSingleDate(value: Date | number | string | null | undefined): string {
		const date = toDate(value);
		if (!date || isNaN(date.getTime())) return '';
		const loc = $locale || 'en';
		if (!showYear) {
			const options: Intl.DateTimeFormatOptions = {
				month: 'short',
				day: 'numeric'
			};
			if (showTime) {
				options.hour = 'numeric';
				options.minute = '2-digit';
				options.hour12 = true;
			}
			return new Intl.DateTimeFormat(loc, options).format(date);
		}
		return showTime ? formatStandardDateTimeShort(date, loc) : formatStandardDateShort(date, loc);
	}

	const startDateObj = $derived(toDate(dateRangeStart));
	const endDateObj = $derived(toDate(dateRangeEnd));

	const formattedDeadline = $derived(formatSingleDate(deadline));
	const formattedDateRange = $derived.by(() => {
		if (!dateRangeStart || !dateRangeEnd) return '';
		const start = formatSingleDate(dateRangeStart);
		const end = formatSingleDate(dateRangeEnd);
		if (!start || !end) return '';

		// If both format to the same date, show only one
		if (start === end) return start;

		return `${start} - ${end}`;
	});

	const durationText = $derived.by(() => {
		if (!showDuration) return null;
		if (estimatedDuration && estimatedDuration.trim()) return estimatedDuration;
		if (startDateObj && endDateObj) {
			return formatDurationBetweenDates(startDateObj, endDateObj, (k) => $t(k));
		}
		return null;
	});

	const hasDate = $derived(formattedDeadline || formattedDateRange);
</script>

{#if hasDate}
	<div class="flex items-center gap-2">
		<IconClockOutline class="text-primary h-8 w-8 shrink-0" />
		{#if variant === 'stacked'}
			<div
				class="flex min-w-0 flex-1 flex-col gap-0.5 {align === 'right'
					? 'items-end text-right'
					: 'items-start'}"
			>
				{#if label}
					<span class="text-base-content/60 text-xs font-semibold tracking-wide uppercase">
						{label}
					</span>
				{/if}
				<span class="line-clamp-2 text-sm font-bold">
					{#if formattedDeadline}
						{formattedDeadline}
					{:else if formattedDateRange}
						{formattedDateRange}
					{/if}
				</span>
				{#if durationText}
					<span class="text-base-content/60 text-xs">({durationText})</span>
				{/if}
			</div>
		{:else}
			<div class="flex min-w-0 flex-1 flex-col gap-0.5">
				{#if label && labelPlacement === 'above'}
					<span class="text-base-content/60 text-xs font-medium">{label}</span>
				{/if}
				{#if label && labelPlacement === 'inline'}
					<div class="flex min-w-0 flex-wrap items-baseline gap-2">
						<span class="text-base-content/60 text-xs font-medium">{label}</span>
						<span class="line-clamp-2 text-sm font-medium">
							{#if formattedDeadline}
								{formattedDeadline}
							{:else if formattedDateRange}
								{formattedDateRange}
							{/if}
						</span>
					</div>
				{:else}
					<span class="line-clamp-2 text-sm font-medium">
						{#if formattedDeadline}
							{formattedDeadline}
						{:else if formattedDateRange}
							{formattedDateRange}
						{/if}
					</span>
				{/if}
				{#if durationText}
					<span class="text-base-content/60 text-xs">({durationText})</span>
				{/if}
			</div>
		{/if}
	</div>
{/if}
