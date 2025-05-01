<script lang="ts">
	import { mockUser } from '$lib/utils/consts';

	// Define necessary types locally for now
	type ScheduleEntry = { available: boolean; hours: string };

	let { formatDate } = $props<{
		formatDate: (dateString: string) => string;
	}>();

	// Use mockUser directly
	const user = mockUser;
</script>

<div class="lg:w-1/3">
	<!-- Availability Card -->
	{#if user.availability}
		<div class="card bg-base-200 mb-6">
			<div class="card-body">
				<h3 class="card-title text-lg">Availability</h3>

				{#if user.availability.schedule}
					<div class="mt-2">
						<p class="font-medium">Weekly Schedule</p>
						<div class="mt-2 space-y-2">
							{#each Object.entries(user.availability.schedule) as [day, scheduleData]}
								{@const schedule = scheduleData as ScheduleEntry}
								<div class="border-base-300 flex items-center justify-between border-b py-1">
									<span class="capitalize">{day}</span>
									<span>
										{#if schedule.available}
											{schedule.hours}
										{:else}
											<span class="text-base-content/50">Unavailable</span>
										{/if}
									</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				{#if user.availability.nextAvailable}
					<div class="mt-4">
						<p class="font-medium">Next Available</p>
						<p class="text-primary">{formatDate(user.availability.nextAvailable)}</p>
					</div>
				{/if}

				<div class="card-actions mt-4">
					<button class="btn btn-primary btn-block">Contact</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Cryptocurrency Info Card -->
	{#if user.bitcoinAddress || user.lightningAddress || user.nostrPublicKey}
		<div class="card bg-base-200 mb-6">
			<div class="card-body">
				<h3 class="card-title text-lg">Payment Methods</h3>
				<div class="mt-2 space-y-3">
					{#if user.bitcoinAddress}
						<div>
							<p class="font-medium">Bitcoin</p>
							<div class="mt-1 flex items-center gap-2">
								<div class="badge badge-primary">
									<svg
										class="h-4 w-4"
										viewBox="0 0 24 24"
										fill="currentColor"
										xmlns="http://www.w3.org/2000/svg"
									>
										<path
											d="M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105 1.962 2.67 8.475-1.243 14.9.358c6.43 1.605 10.342 8.115 8.738 14.548v-.002zm-6.35-4.613c.24-1.59-.974-2.45-2.64-3.03l.54-2.153-1.315-.33-.525 2.107c-.345-.087-.705-.167-1.064-.25l.526-2.127-1.32-.33-.54 2.165c-.285-.067-.565-.132-.84-.2l-1.815-.45-.35 1.407s.975.225.955.236c.535.136.63.486.615.766l-1.477 5.92c-.075.166-.24.406-.614.314.015.02-.96-.24-.96-.24l-.66 1.51 1.71.426.93.242-.54 2.19 1.32.327.54-2.17c.36.1.705.19 1.05.273l-.51 2.154 1.32.33.545-2.19c2.24.427 3.93.257 4.64-1.774.57-1.637-.03-2.58-1.217-3.196.854-.193 1.5-.76 1.68-1.93h.01zm-3.01 4.22c-.404 1.64-3.157.75-4.05.53l.72-2.9c.896.23 3.757.67 3.33 2.37zm.41-4.24c-.37 1.49-2.662.735-3.405.55l.654-2.64c.744.18 3.137.524 2.75 2.084v.006z"
										/>
									</svg>
								</div>
								<p class="truncate font-mono text-sm">{user.bitcoinAddress}</p>
							</div>
						</div>
					{/if}

					{#if user.lightningAddress}
						<div>
							<p class="font-medium">Lightning Address</p>
							<div class="mt-1 flex items-center gap-2">
								<div class="badge badge-warning">
									<svg
										class="h-4 w-4"
										viewBox="0 0 24 24"
										fill="currentColor"
										xmlns="http://www.w3.org/2000/svg"
									>
										<path
											d="M19.1 2.9l-14 14.1L8.5 24l3.4-7 7.1-7.1c.4-.4.4-1 0-1.4l-3.6-3.6c-.4-.4-1-.4-1.4 0zm-4.8 7.7c-.4.4-1 .4-1.4 0-.4-.4-.4-1 0-1.4.4-.4 1-.4 1.4 0 .4.4.4 1 0 1.4z"
										/>
									</svg>
								</div>
								<p class="font-mono text-sm">{user.lightningAddress}</p>
							</div>
						</div>
					{/if}

					{#if user.nostrPublicKey}
						<div>
							<p class="font-medium">Nostr</p>
							<div class="mt-1 flex items-center gap-2">
								<div class="badge badge-secondary">
									<svg
										class="h-4 w-4"
										viewBox="0 0 24 24"
										fill="currentColor"
										xmlns="http://www.w3.org/2000/svg"
									>
										<path
											d="M21.89 6.55c-1.98-3.08-5.79-4.82-9.52-4.41C8.47 2.54 4.9 5.33 3.71 9.25c-.82 2.7-.48 5.75 1.06 8.19 2.18 3.4 6.31 5.18 10.32 4.51 3.09-.51 5.78-2.46 7.2-5.22 1.69-3.28 1.45-7.25-.4-10.18zm-1.34 4.54c-.11.83-.52 1.72-1.11 2.33-.69.71-1.56 1.12-2.49 1.25-.66.09-1.4.05-2-.16-.87-.31-1.59-.83-2.3-1.32-.18-.12-.35-.25-.53-.37-.21-.14-.43-.27-.66-.39-.44-.23-.9-.42-1.35-.59-.45-.16-.92-.28-1.39-.29-.66-.01-1.37.17-1.77.7-.39.52-.38 1.13-.2 1.71.2.64.64 1.22 1.15 1.68.3.27.71.61.86.64-.14.27-.7.28-.97.28-.95 0-1.83-.43-2.45-1.2-.65-.82-.94-1.82-.8-2.84.13-.93.64-1.8 1.47-2.33.83-.53 1.87-.72 2.82-.52 1.35.28 2.64 1.15 3.94 1.76 1.14.53 2.33.91 3.58.59.58-.15 1.04-.43 1.42-.89.38-.46.62-1.03.68-1.64.13-.95-.19-1.72-.55-2.57.56 1.12.99 2.48.3 3.97z"
										/>
									</svg>
								</div>
								<p class="truncate font-mono text-sm">{user.nostrPublicKey}</p>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- User Stats Card -->
	<div class="card bg-base-100 shadow-xl">
		<div class="card-body p-4">
			<h2 class="card-title text-lg">Your Stats</h2>
			<div class="divider my-2"></div>
			<div class="stats stats-vertical shadow">
				<div class="stat">
					<div class="stat-title">Tasks Completed</div>
					<div class="stat-value">12</div>
					<div class="stat-desc">↗︎ 4 (30%)</div>
				</div>

				<div class="stat">
					<div class="stat-title">Success Rate</div>
					<div class="stat-value">92%</div>
					<div class="stat-desc">↗︎ 6%</div>
				</div>

				<div class="stat">
					<div class="stat-title">Level</div>
					<div class="stat-value">3</div>
					<div class="stat-desc">Silver Member</div>
				</div>
			</div>
		</div>
	</div>
</div>
