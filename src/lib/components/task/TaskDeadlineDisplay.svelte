<script lang="ts">
	import IconClockOutline from '~icons/mdi/clock-outline';
	import { locale } from 'svelte-i18n';

	const {
		deadline = null,
		dateRangeStart = null,
		dateRangeEnd = null
	} = $props<{
		deadline?: Date | number | string | null;
		dateRangeStart?: Date | number | string | null;
		dateRangeEnd?: Date | number | string | null;
	}>();

	// Format a date to "Jan 21, 2026" format (no time)
	function formatDate(value: Date | number | string | null | undefined): string {
		if (!value) return '';
		
		let date: Date;
		if (value instanceof Date) {
			date = value;
		} else if (typeof value === 'number') {
			// Handle Unix timestamps (seconds vs milliseconds)
			date = value > 1000000000000 ? new Date(value) : new Date(value * 1000);
		} else {
			date = new Date(value);
		}
		
		if (isNaN(date.getTime())) return '';
		
		return date.toLocaleDateString($locale || 'en', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	// Formatted display values
	const formattedDeadline = $derived(formatDate(deadline));
	const formattedDateRange = $derived(
		dateRangeStart && dateRangeEnd
			? `${formatDate(dateRangeStart)} - ${formatDate(dateRangeEnd)}`
			: ''
	);

	// Determine if we have any date to display
	const hasDate = $derived(formattedDeadline || formattedDateRange);
</script>

{#if hasDate}
	<div class="flex items-center gap-2">
		<IconClockOutline class="text-primary h-8 w-8 shrink-0" />
		<div class="flex min-w-0 flex-1">
			<span class="line-clamp-2 text-sm font-medium">
				{#if formattedDeadline}
					{formattedDeadline}
				{:else if formattedDateRange}
					{formattedDateRange}
				{/if}
			</span>
		</div>
	</div>
{/if}
