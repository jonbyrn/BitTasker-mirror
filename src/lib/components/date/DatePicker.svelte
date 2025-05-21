<script lang="ts">
	import { CalendarDate, type DateValue } from '@internationalized/date';
	import { DatePicker } from 'bits-ui';

	function convertDate(date: Date | string): CalendarDate | undefined {
		try {
			if (!date) return undefined;
			const dateObj = typeof date === 'string' ? new Date(date) : date;
			const [year, month, day] = dateObj.toISOString().split('T')[0].split('-').map(Number);
			return new CalendarDate(year, month, day);
		} catch (error) {
			return undefined;
		}
	}

	let { label = '', value = '', minDate = '', maxDate = '', onChange } = $props();

	let _value = $state(convertDate(value));
	let _minDate = $state(convertDate(minDate));
	let _maxDate = $state(convertDate(maxDate));

	function onValueChange(value: DateValue | undefined) {
		if (!value) return;
		onChange?.(new Date(value.toString()).toISOString());
	}

	function isDateUnavailable(date: DateValue) {
		if (_minDate && date.compare(_minDate) < 0) return true;
		if (_maxDate && date.compare(_maxDate) > 0) return true;
		return false;
	}
</script>

<DatePicker.Root
	weekdayFormat="short"
	fixedWeeks={true}
	value={_value}
	{onValueChange}
	minValue={_minDate}
	maxValue={_maxDate}
	{isDateUnavailable}
>
	<div class="flex w-full flex-col gap-1.5">
		<DatePicker.Label class="label label-text block text-sm select-none">{label}</DatePicker.Label>
		<DatePicker.Input
			class="h-input input input-bordered bg-base-100 flex w-full items-center rounded-lg px-2 py-3 text-sm ring-0 outline-none select-none"
		>
			{#snippet children({ segments })}
				{#each segments as { part, value }}
					<div class="inline-block select-none">
						{#if part === 'literal'}
							<DatePicker.Segment {part} class="text-muted-foreground p-1">
								{value}
							</DatePicker.Segment>
						{:else}
							<DatePicker.Segment
								{part}
								class="rounded-5px hover:bg-muted focus:bg-muted focus:text-foreground aria-[valuetext=Empty]:text-muted-foreground px-1 py-1 focus-visible:ring-0! focus-visible:ring-offset-0!"
							>
								{value}
							</DatePicker.Segment>
						{/if}
					</div>
				{/each}
				<DatePicker.Trigger
					class="text-foreground/60 ml-auto inline-flex cursor-pointer items-center justify-center rounded-[5px] transition-all hover:bg-white/10 active:bg-white/10"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						fill="#fff"
						viewBox="0 0 256 256"
						><path
							d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Z"
						></path>
					</svg>
				</DatePicker.Trigger>
			{/snippet}
		</DatePicker.Input>
		<DatePicker.Content sideOffset={6} align="end" class="z-50">
			<DatePicker.Calendar
				class="border-dark-10 shadow-popover mt-4 rounded-xl border bg-black p-5"
			>
				{#snippet children({ months, weekdays })}
					<DatePicker.Header class="flex items-center justify-between">
						<DatePicker.PrevButton
							class="inline-flex size-7 cursor-pointer items-center justify-center rounded-lg bg-white/10 p-1 transition-all hover:bg-white/10 active:scale-[0.98]"
						>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
								<rect width="256" height="256" fill="none" /><polyline
									points="160 208 80 128 160 48"
									fill="none"
									stroke="currentColor"
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="16"
								/>
							</svg>
						</DatePicker.PrevButton>
						<DatePicker.Heading class="text-[15px] font-medium" />
						<DatePicker.NextButton
							class="inline-flex size-7 cursor-pointer items-center justify-center rounded-lg bg-white/10 p-1 transition-all hover:bg-white/10 active:scale-[0.98]"
						>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
								<rect width="256" height="256" fill="none" /><polyline
									points="96 48 176 128 96 208"
									fill="none"
									stroke="currentColor"
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="16"
								/>
							</svg>
						</DatePicker.NextButton>
					</DatePicker.Header>
					<div class="flex flex-col space-y-4 pt-4 sm:flex-row sm:space-y-0 sm:space-x-4">
						{#each months as month}
							<DatePicker.Grid class="w-full border-collapse space-y-1 select-none">
								<DatePicker.GridHead>
									<DatePicker.GridRow class="mb-1 flex w-full justify-between">
										{#each weekdays as day}
											<DatePicker.HeadCell
												class="text-muted-foreground w-10 rounded-md text-xs font-normal!"
											>
												<div>{day.slice(0, 2)}</div>
											</DatePicker.HeadCell>
										{/each}
									</DatePicker.GridRow>
								</DatePicker.GridHead>
								<DatePicker.GridBody>
									{#each month.weeks as weekDates}
										<DatePicker.GridRow class="flex w-full">
											{#each weekDates as date}
												<DatePicker.Cell
													{date}
													month={month.value}
													class="relative size-10 p-0! text-center text-sm"
												>
													<DatePicker.Day
														class="text-foreground data-disabled:text-foreground/30 data-selected:text-background data-unavailable:text-muted-foreground group relative inline-flex size-10 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-transparent p-0 text-sm font-normal whitespace-nowrap transition-all hover:bg-white/10 data-disabled:pointer-events-none data-outside-month:pointer-events-none data-outside-month:text-gray-600 data-selected:bg-white/20 data-selected:font-medium data-unavailable:line-through"
													>
														<div
															class="bg-foreground group-data-selected:bg-background absolute top-[5px] hidden size-1 rounded-full transition-all group-data-today:block"
														></div>
														{date.day}
													</DatePicker.Day>
												</DatePicker.Cell>
											{/each}
										</DatePicker.GridRow>
									{/each}
								</DatePicker.GridBody>
							</DatePicker.Grid>
						{/each}
					</div>
				{/snippet}
			</DatePicker.Calendar>
		</DatePicker.Content>
	</div>
</DatePicker.Root>
