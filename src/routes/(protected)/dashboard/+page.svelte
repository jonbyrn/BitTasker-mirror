<script lang="ts">
	import { formatDistanceToNow } from 'date-fns';
	import { tasks } from '$lib/utils/consts';
	let selectedCategory = $state('All Categories');
	let searchQuery = $state('');

	// Filter options
	const categories = [
		'All Categories',
		'Home Maintenance',
		'IT & Technology',
		'Creative Services',
		'Professional Services',
		'Delivery',
		'Tutoring & Education',
		'Events & Lifestyle'
	];

	// Filter tasks by category and search query
	let filteredTasks = $derived(
		tasks.filter((task) => {
			// Category filter
			const categoryMatch =
				selectedCategory === 'All Categories' || task.category === selectedCategory;

			// Search filter
			const searchLower = searchQuery.toLowerCase();
			const searchMatch =
				!searchQuery ||
				task.title.toLowerCase().includes(searchLower) ||
				task.description.toLowerCase().includes(searchLower);

			return categoryMatch && searchMatch;
		})
	);

	// Format dates
	function formatTimeAgo(date: Date): string {
		return formatDistanceToNow(date, { addSuffix: true });
	}

	// Format currency
	function formatCurrency(amount: number, currency: string): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency
		}).format(amount);
	}
</script>

<div class="card bg-base-100 mb-6 shadow-xl">
	<div class="card-body">
		<!-- Filters -->
		<div class="mb-6 flex flex-col gap-4 sm:flex-row">
			<div class="form-control w-full max-w-xs">
				<label for="category-select" class="label">
					<span class="label-text">Category</span>
				</label>
				<select id="category-select" class="select select-bordered" bind:value={selectedCategory}>
					{#each categories as category}
						<option value={category}>{category}</option>
					{/each}
				</select>
			</div>

			<div class="form-control w-full">
				<label for="search-input" class="label">
					<span class="label-text">Search</span>
				</label>
				<input
					id="search-input"
					type="text"
					placeholder="Search tasks..."
					class="input input-bordered w-full"
					bind:value={searchQuery}
				/>
			</div>
		</div>

		<!-- Task List -->
		{#if filteredTasks.length > 0}
			<div class="overflow-x-auto">
				<table class="table-zebra table w-full">
					<thead>
						<tr>
							<th>Task</th>
							<th>Budget</th>
							<th>Posted</th>
							<th>Bids</th>
							<th>Action</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredTasks as task}
							<tr class="hover">
								<td>
									<div>
										<div class="font-bold">{task.title}</div>
										<div class="max-w-xs truncate text-sm opacity-75">
											{task.description}
										</div>
										<div class="mt-1">
											<span class="badge badge-neutral badge-sm">{task.category}</span>
											<span class="badge badge-neutral badge-sm">{task.location}</span>
										</div>
									</div>
								</td>
								<td>
									<div class="text-primary font-semibold">
										{formatCurrency(task.budget, task.currency)}
									</div>
								</td>
								<td>
									<div class="text-sm">{formatTimeAgo(task.postedDate)}</div>
								</td>
								<td>
									<div class="badge">{task.bids}</div>
								</td>
								<td>
									<button class="btn btn-primary btn-sm">Bid Now</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="alert alert-info">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					class="h-6 w-6 shrink-0 stroke-current"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					></path>
				</svg>
				<span>No tasks match your search criteria. Try adjusting your filters.</span>
			</div>
		{/if}

		<!-- Pagination -->
		<div class="join mt-6 flex justify-center">
			<button class="join-item btn">«</button>
			<button class="join-item btn btn-active">1</button>
			<button class="join-item btn">2</button>
			<button class="join-item btn">3</button>
			<button class="join-item btn">»</button>
		</div>
	</div>
</div>
