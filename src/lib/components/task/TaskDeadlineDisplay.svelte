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
		estimatedDuration = null
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
		<div class="flex min-w-0 flex-1 flex-col gap-0.5">
			<span class="line-clamp-2 text-sm font-medium">
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
	</div>
{/if}
