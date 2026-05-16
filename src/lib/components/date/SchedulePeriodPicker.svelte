<script lang="ts">
	import ScheduleDateTimeField from '$lib/components/date/ScheduleDateTimeField.svelte';
	import { t } from 'svelte-i18n';

	interface Props {
		startValue: Date | null;
		endValue: Date | null;
		minStartDate?: Date;
		minEndDate?: Date;
		maxStartDate?: Date;
		maxEndDate?: Date;
		startHeadingKey?: string;
		endHeadingKey?: string;
		dateLabelKey?: string;
		timeLabelKey?: string;
		onStartChange: (date: Date | null) => void;
		onEndChange: (date: Date | null) => void;
	}

	let {
		startValue = $bindable(null),
		endValue = $bindable(null),
		minStartDate,
		minEndDate,
		maxStartDate,
		maxEndDate,
		startHeadingKey = 'bid_form.form.schedule_section_start',
		endHeadingKey = 'bid_form.form.schedule_section_end',
		dateLabelKey = 'common.components.schedule_picker.date',
		timeLabelKey = 'common.components.schedule_picker.time',
		onStartChange,
		onEndChange
	}: Props = $props();

	const endDisabled = $derived(startValue === null);

	const durationText = $derived.by(() => {
		if (!startValue || !endValue) return '';
		const diffMs = endValue.getTime() - startValue.getTime();
		if (diffMs < 0) return '';
		const totalMinutes = Math.round(diffMs / 60000);
		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;
		if (hours === 0)
			return $t('common.components.schedule_picker.duration_minutes', { values: { minutes } });
		if (minutes === 0)
			return $t('common.components.schedule_picker.duration_hours', { values: { hours } });
		return $t('common.components.schedule_picker.duration_hours_minutes', {
			values: { hours, minutes }
		});
	});

	$effect(() => {
		if (startValue !== null && endValue !== null && endValue.getTime() < startValue.getTime()) {
			endValue = null;
			onEndChange(null);
			return;
		}
		if (startValue !== null) {
			return;
		}
		if (endValue === null) {
			return;
		}
		endValue = null;
		onEndChange(null);
	});
</script>

<div class="grid min-w-0 gap-3 sm:grid-cols-2 sm:gap-12 md:gap-16">
	<ScheduleDateTimeField
		bind:value={startValue}
		period="start"
		minDate={minStartDate}
		maxDate={maxStartDate}
		headingKey={startHeadingKey}
		{dateLabelKey}
		{timeLabelKey}
		onChange={onStartChange}
	/>
	<ScheduleDateTimeField
		bind:value={endValue}
		period="end"
		minDate={minEndDate}
		maxDate={maxEndDate}
		headingKey={endHeadingKey}
		{dateLabelKey}
		{timeLabelKey}
		disabled={endDisabled}
		onChange={onEndChange}
	/>
</div>
{#if durationText}
	<div class="text-base-content/60 mt-1 text-center text-xs font-medium" aria-live="polite">
		{durationText}
	</div>
{/if}
