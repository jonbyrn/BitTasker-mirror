<script lang="ts">
	import IconCalendarClock from '~icons/mdi/calendar-clock';
	import IconTruckDeliveryOutline from '~icons/mdi/truck-delivery-outline';
	import { locale, t } from 'svelte-i18n';
	import { formatDurationBetweenDates } from '$lib/utils/helpers/dateFormatter';

	const {
		startTime = null,
		endTime = null,
		startLabel = 'Start date',
		endLabel = 'Delivery date',
		showDurationIndicator = true
	} = $props<{
		startTime: number | null;
		endTime: number | null;
		startLabel?: string;
		endLabel?: string;
		showDurationIndicator?: boolean;
	}>();

	const currentLocale = $derived($locale || 'en');

	function toDate(timestamp: number | null): Date | null {
		if (timestamp == null || timestamp <= 0) return null;
		const ms = timestamp > 1000000000000 ? timestamp : timestamp * 1000;
		const date = new Date(ms);
		return Number.isFinite(date.getTime()) ? date : null;
	}

	function formatDateNoYear(date: Date, loc: string): string {
		return new Intl.DateTimeFormat(loc, {
			month: 'short',
			day: 'numeric'
		}).format(date);
	}

	function formatTime(date: Date, loc: string): string {
		return new Intl.DateTimeFormat(loc, {
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		}).format(date);
	}

	const startDateText = $derived.by(() => {
		const date = toDate(startTime);
		return date ? formatDateNoYear(date, currentLocale) : '';
	});

	const startTimeText = $derived.by(() => {
		const date = toDate(startTime);
		return date ? formatTime(date, currentLocale) : '';
	});

	const endDateText = $derived.by(() => {
		const date = toDate(endTime);
		return date ? formatDateNoYear(date, currentLocale) : '';
	});

	const endTimeText = $derived.by(() => {
		const date = toDate(endTime);
		return date ? formatTime(date, currentLocale) : '';
	});

	const durationLabel = $derived.by(() => {
		const start = toDate(startTime);
		const end = toDate(endTime);
		if (start && end) {
			return formatDurationBetweenDates(
				start,
				end,
				(k) => $t(k),
				'dashboard.services.detail.book_now_drawer'
			);
		}
		return '';
	});

	const hasValidDates = $derived(startTime && endTime);
</script>

{#if hasValidDates}
	<div class="flex items-center justify-between gap-2 px-1">
		<!-- Start Date -->
		<div class="flex min-w-0 flex-col" data-testid="service-agreement-start">
			<div
				class="text-primary flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase"
			>
				<IconCalendarClock class="h-3.5 w-3.5" />
				<span>{startLabel}</span>
			</div>
			<div class="mt-0.5 text-xs font-bold sm:text-sm">
				<span class="truncate">{startDateText}</span>
				<span class="text-base-content/60 block truncate">{startTimeText}</span>
			</div>
		</div>

		<!-- Duration Indicator -->
		{#if showDurationIndicator && durationLabel}
			<div class="flex min-w-[60px] flex-1 flex-col items-center justify-center px-2">
				<div class="relative flex w-full items-center py-2">
					<div class="bg-primary/20 h-0.5 flex-1 rounded-full"></div>
					<div class="absolute inset-0 flex items-center justify-center">
						<span
							class="badge badge-ghost badge-xs text-primary border-primary/20 h-5 px-2 text-[11px] font-bold whitespace-nowrap shadow-sm"
						>
							{durationLabel}
						</span>
					</div>
					<div class="bg-primary/20 h-0.5 flex-1 rounded-full"></div>
					<div class="absolute -right-0.5 flex items-center">
						<div
							class="border-l-primary/30 border-t-[4px] border-b-[4px] border-l-[6px] border-transparent"
						></div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Delivery Date -->
		<div
			class="flex min-w-0 flex-col items-end text-right"
			data-testid="service-agreement-delivery"
		>
			<div
				class="text-primary flex items-center justify-end gap-1.5 text-[10px] font-bold tracking-wider uppercase"
			>
				<span>{endLabel}</span>
				<IconTruckDeliveryOutline class="h-3.5 w-3.5" />
			</div>
			<div class="mt-0.5 text-xs font-bold sm:text-sm">
				<span class="truncate">{endDateText}</span>
				<span class="text-base-content/60 block truncate">{endTimeText}</span>
			</div>
		</div>
	</div>
{/if}
