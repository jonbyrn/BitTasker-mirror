<script lang="ts">
	import { formatDistanceToNow } from 'date-fns';
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

	// Task listing data
	const tasks = [
		{
			id: '1',
			title: 'WordPress Website Migration & Optimization',
			description:
				'Need help migrating my WordPress site to a new host and optimizing it for speed and SEO.',
			category: 'IT & Technology',
			budget: 150,
			currency: 'USD',
			location: 'Remote',
			postedDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
			deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
			bids: 3,
			status: 'open'
		},
		{
			id: '2',
			title: 'Logo Design for Eco-Friendly Startup',
			description:
				'Looking for a creative designer to create a modern, eco-friendly logo for my new sustainable products business.',
			category: 'Creative Services',
			budget: 200,
			currency: 'USD',
			location: 'Remote',
			postedDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
			deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
			bids: 8,
			status: 'open'
		},
		{
			id: '3',
			title: 'Bathroom Renovation Help',
			description:
				'Need an experienced handyman to help renovate my bathroom. Will require tile work, plumbing, and fixture installation.',
			category: 'Home Maintenance',
			budget: 1200,
			currency: 'USD',
			location: 'San Francisco, CA',
			postedDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
			deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
			bids: 5,
			status: 'open'
		},
		{
			id: '4',
			title: 'Smart Contract Audit for NFT Project',
			description:
				'Looking for a Solidity expert to audit my NFT smart contract before deployment. Security is a priority.',
			category: 'IT & Technology',
			budget: 500,
			currency: 'USD',
			location: 'Remote',
			postedDate: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
			deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
			bids: 2,
			status: 'open'
		},
		{
			id: '5',
			title: 'Mobile App Testing for iOS and Android',
			description:
				'Need thorough testing of my new fitness tracking app on multiple iOS and Android devices.',
			category: 'IT & Technology',
			budget: 300,
			currency: 'USD',
			location: 'Remote',
			postedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
			deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
			bids: 4,
			status: 'open'
		},
		{
			id: '6',
			title: 'Content Writing for Crypto Blog',
			description:
				'Seeking an experienced writer with knowledge of cryptocurrency and blockchain to create weekly blog posts.',
			category: 'Professional Services',
			budget: 80,
			currency: 'USD',
			location: 'Remote',
			postedDate: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
			deadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), // 21 days from now
			bids: 7,
			status: 'open'
		}
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
