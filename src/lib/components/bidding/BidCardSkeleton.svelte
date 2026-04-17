<div class="bg-base-100 border-base-200 rounded-2xl border shadow-sm">
	<div class="p-4 md:p-6">
		<!-- Header skeleton -->
		<div class="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
			<div class="flex items-center gap-4">
				<div class="bg-base-300 h-14 w-14 animate-pulse rounded-full"></div>
				<div class="flex-1 space-y-2">
					<div class="bg-base-300 h-5 w-32 animate-pulse rounded"></div>
					<div class="flex items-center gap-4">
						<div class="bg-base-300 h-4 w-24 animate-pulse rounded"></div>
						<div class="flex gap-1">
							{#each Array.from({ length: 5 }, (_, i) => i) as i (i)}
								<div class="bg-base-300 h-4 w-4 animate-pulse rounded"></div>
							{/each}
						</div>
					</div>
				</div>
			</div>
			<div class="text-right">
				<div class="bg-base-300 mb-1 h-8 w-20 animate-pulse rounded"></div>
				<div class="bg-base-300 mb-1 h-6 w-16 animate-pulse rounded"></div>
				<div class="bg-base-300 h-4 w-24 animate-pulse rounded"></div>
			</div>
		</div>

		<!-- Description skeleton -->
		<div class="mb-4">
			<div class="bg-base-300 mb-2 h-4 w-full animate-pulse rounded"></div>
			<div class="bg-base-300 h-4 w-3/4 animate-pulse rounded"></div>
		</div>

		<!-- Action buttons skeleton -->
		<div
			class="border-base-200 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
		>
			<div class="bg-base-300 h-8 w-24 animate-pulse rounded"></div>
			<div class="flex gap-2">
				<div class="bg-base-300 h-8 w-16 animate-pulse rounded"></div>
				<div class="bg-base-300 h-8 w-16 animate-pulse rounded"></div>
				<div class="bg-base-300 h-8 w-16 animate-pulse rounded"></div>
			</div>
		</div>
	</div>
</div>
