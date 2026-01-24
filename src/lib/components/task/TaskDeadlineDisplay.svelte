<script lang="ts">
	import IconClockOutline from '~icons/mdi/clock-outline';

	const {
		deadline = null,
		dateRangeStart = null,
		dateRangeEnd = null,
		formattedDeadline = '',
		formattedDateRange = ''
	} = $props<{
		deadline?: Date | number | string | null;
		dateRangeStart?: Date | number | string | null;
		dateRangeEnd?: Date | number | string | null;
		formattedDeadline?: string;
		formattedDateRange?: string;
	}>();

	// Determine if we have any date to display
	const hasDate = $derived(deadline || (dateRangeStart && dateRangeEnd) || formattedDeadline || formattedDateRange);
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
