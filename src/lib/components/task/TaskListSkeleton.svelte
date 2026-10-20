<script lang="ts">
	let { count = 4 } = $props<{ count?: number }>();
</script>

<div class="space-y-4">
	{#each Array(count) as _, index (index)}
		<div class="card bg-base-100 animate-pulse rounded-xl shadow-md transition-shadow">
			<div class="card-body rounded-xl p-4 md:p-4">
				<!-- Top Row: Title + Status Badge + Price -->
				<div
					class="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch sm:justify-between"
				>
					<!-- Left: Title (flexible, takes available space) -->
					<div class="min-w-0 flex-1 pr-2 md:pr-4">
						<div class="bg-base-300 mb-2 h-6 w-3/4 rounded"></div>
						<div class="bg-base-300 h-4 w-full rounded"></div>
					</div>
					<!-- Right: Status Badge + Price (fixed width, aligned right) -->
					<div
						class="flex w-full min-w-0 flex-col items-start justify-between gap-2 sm:w-auto sm:max-w-[40%] sm:items-end"
					>
						<div class="bg-base-300 h-5 w-16 rounded-full"></div>
						<div class="mt-2 text-right">
							<div class="bg-base-300 mb-1 h-6 w-20 rounded"></div>
							<div class="bg-base-300 h-4 w-16 rounded"></div>
						</div>
					</div>
				</div>

				<!-- Second Row: Deadline + Location -->
				<div class="mb-3 flex flex-col gap-3">
					<!-- Deadline -->
					<div class="bg-base-300 h-4 w-32 rounded"></div>
					<!-- Location -->
					<div class="bg-base-300 h-4 w-40 rounded"></div>
				</div>

				<!-- Bottom Row: Avatar + Action Buttons -->
				<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<!-- Left: Avatar, Username, Review Stars -->
					<div class="flex min-w-0 flex-1 items-center gap-3">
						<!-- Avatar -->
						<div class="avatar">
							<div class="bg-base-300 h-8 w-8 rounded-full"></div>
						</div>
						<!-- Username and Review Stars -->
						<div class="flex min-w-0 flex-1 flex-col">
							<div class="bg-base-300 mb-1 h-4 w-24 rounded"></div>
							<div class="flex items-center gap-1">
								<div class="bg-base-300 h-3 w-12 rounded"></div>
							</div>
						</div>
					</div>

					<!-- Right: Action Buttons -->
					<div class="flex w-full shrink-0 items-center gap-2 md:w-auto">
						<div class="bg-base-300 h-8 flex-1 rounded md:w-20 md:flex-none"></div>
						<div class="bg-base-300 h-8 flex-1 rounded md:w-24 md:flex-none"></div>
					</div>
				</div>
			</div>
		</div>
	{/each}
</div>
