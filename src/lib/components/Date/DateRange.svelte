<script lang="ts">
	import { DateRangePicker } from 'bits-ui';
</script>

<DateRangePicker.Root
	weekdayFormat="short"
	fixedWeeks={true}
	class="flex w-full max-w-[340px] flex-col gap-1.5"
>
	<DateRangePicker.Label class="block text-sm font-medium select-none">
		Rental Days
	</DateRangePicker.Label>
	<div
		class="h-input rounded-lg border-border-input bg-background text-foreground focus-within:border-border-input-hover focus-within:shadow-date-field-focus hover:border-border-input-hover flex w-full items-center border px-2 py-3 text-sm tracking-[0.01em] select-none"
	>
		{#each ['start', 'end'] as const as type}
			<DateRangePicker.Input {type}>
				{#snippet children({ segments })}
					{#each segments as { part, value }}
						<div class="inline-block select-none">
							{#if part === 'literal'}
								<DateRangePicker.Segment {part} class="text-muted-foreground p-1">
									{value}
								</DateRangePicker.Segment>
							{:else}
								<DateRangePicker.Segment
									{part}
									class="rounded-5px hover:bg-muted focus:bg-muted focus:text-foreground aria-[valuetext=Empty]:text-muted-foreground px-1 py-1 focus-visible:ring-0! focus-visible:ring-offset-0!"
								>
									{value}
								</DateRangePicker.Segment>
							{/if}
						</div>
					{/each}
				{/snippet}
			</DateRangePicker.Input>
			{#if type === 'start'}
				<div aria-hidden="true" class="text-muted-foreground px-1">–⁠⁠⁠⁠⁠</div>
			{/if}
		{/each}

		<DateRangePicker.Trigger
			class="text-foreground/60 hover:bg-white/10 active:bg-white/10 ml-auto inline-flex items-center justify-center rounded-[5px] transition-all cursor-pointer"
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
		</DateRangePicker.Trigger>
	</div>
	<DateRangePicker.Content sideOffset={6} align="end" class="z-50">
		<DateRangePicker.Calendar
			class="rounded-xl border-dark-10 bg-black shadow-popover mt-4 border p-5"
		>
			{#snippet children({ months, weekdays })}
				<DateRangePicker.Header class="flex items-center justify-between">
					<DateRangePicker.PrevButton
						class="rounded-9px bg-white/10 hover:bg-white/10 inline-flex size-7 items-center justify-center transition-all active:scale-[0.98] cursor-pointer rounded-2xl p-1"
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
					</DateRangePicker.PrevButton>
					<DateRangePicker.Heading class="text-[15px] font-medium" />
					<DateRangePicker.NextButton
						class="rounded-9px bg-white/10 hover:bg-white/10 inline-flex size-7 items-center justify-center transition-all active:scale-[0.98] cursor-pointer rounded-2xl p-1"
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
					</DateRangePicker.NextButton>
				</DateRangePicker.Header>
				<div class="flex flex-col space-y-4 pt-4 sm:flex-row sm:space-y-0 sm:space-x-4">
					{#each months as month}
						<DateRangePicker.Grid class="w-full border-collapse space-y-1 select-none">
							<DateRangePicker.GridHead>
								<DateRangePicker.GridRow class="mb-1 flex w-full justify-between">
									{#each weekdays as day}
										<DateRangePicker.HeadCell
											class="text-muted-foreground w-10 rounded-md text-xs font-normal!"
										>
											<div>{day.slice(0, 2)}</div>
										</DateRangePicker.HeadCell>
									{/each}
								</DateRangePicker.GridRow>
							</DateRangePicker.GridHead>
							<DateRangePicker.GridBody>
								{#each month.weeks as weekDates}
									<DateRangePicker.GridRow class="flex w-full">
										{#each weekDates as date}
											<DateRangePicker.Cell
												{date}
												month={month.value}
												class="relative m-0 size-10 overflow-visible p-0! text-center text-sm focus-within:relative focus-within:z-20"
											>
												<DateRangePicker.Day
													class={'rounded-9px text-foreground hover:border-white focus-visible:ring-foreground! data-selection-end:rounded-9px data-selection-start:rounded-9px data-highlighted:bg-white/10 data-selected:bg-white/10 data-selection-end:bg-foreground data-selection-start:bg-foreground data-disabled:text-foreground/30 data-selected:text-foreground data-selection-end:text-background data-selection-start:text-background data-unavailable:text-muted-foreground data-selected:[&:not([data-selection-start])]:[&:not([data-selection-end])]:focus-visible:border-foreground group relative  inline-flex size-10 items-center justify-center overflow-visible border border-transparent bg-transparent p-0 text-sm font-normal whitespace-nowrap transition-all data-disabled:pointer-events-none data-highlighted:rounded-none data-outside-month:pointer-events-none data-selected:font-medium data-selection-end:font-medium data-selection-start:font-medium data-selection-start:focus-visible:ring-2 data-selection-start:focus-visible:ring-offset-2! data-unavailable:line-through data-selected:[&:not([data-selection-start])]:[&:not([data-selection-end])]:rounded-none data-selected:[&:not([data-selection-start])]:[&:not([data-selection-end])]:focus-visible:ring-0! data-selected:[&:not([data-selection-start])]:[&:not([data-selection-end])]:focus-visible:ring-offset-0!'}
												>
													<div
														class="bg-foreground group-data-selected:bg-background absolute top-[5px] hidden size-1 rounded-full transition-all group-data-today:block"
													></div>
													{date.day}
												</DateRangePicker.Day>
											</DateRangePicker.Cell>
										{/each}
									</DateRangePicker.GridRow>
								{/each}
							</DateRangePicker.GridBody>
						</DateRangePicker.Grid>
					{/each}
				</div>
			{/snippet}
		</DateRangePicker.Calendar>
	</DateRangePicker.Content>
</DateRangePicker.Root>
