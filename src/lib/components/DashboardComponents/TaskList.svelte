<script lang="ts">
	import { onMount } from 'svelte';

	// Mock data for tasks - in a real implementation, this would come from an API
	let tasks = [
		{
			id: '1',
			title: 'Fix leaking roof',
			description: 'My roof is leaking and needs to be fixed ASAP.',
			category: 'Home Maintenance',
			location: 'San Francisco, CA',
			isRemote: false,
			budget: '0.0015',
			currencyType: 'BTC',
			deadline: '2023-12-25',
			skills: ['Roofing', 'Carpentry'],
			postedBy: {
				id: 'user1',
				name: 'Alex Smith',
				rating: 4.8,
				completedTasks: 15
			},
			createdAt: '2023-12-01'
		},
		{
			id: '2',
			title: 'Website design for small business',
			description: 'Need a professional to design a modern website for my bakery.',
			category: 'IT & Technology',
			location: '',
			isRemote: true,
			budget: '0.005',
			currencyType: 'BTC',
			deadline: '2024-01-15',
			skills: ['Web Design', 'UI/UX', 'JavaScript'],
			postedBy: {
				id: 'user2',
				name: 'Maria Garcia',
				rating: 4.6,
				completedTasks: 8
			},
			createdAt: '2023-12-05'
		},
		{
			id: '3',
			title: 'Personal Shopping Assistant',
			description: 'Looking for someone to help me pick out a new wardrobe.',
			category: 'Personal Assistant',
			location: 'New York, NY',
			isRemote: false,
			budget: '0.00075',
			currencyType: 'BTC',
			deadline: '2023-12-20',
			skills: ['Fashion', 'Shopping', 'Styling'],
			postedBy: {
				id: 'user3',
				name: 'John Doe',
				rating: 4.2,
				completedTasks: 3
			},
			createdAt: '2023-12-07'
		},
		{
			id: '4',
			title: 'Move furniture to new apartment',
			description: 'Need help moving furniture from my old apartment to the new one nearby.',
			category: 'Delivery',
			location: 'Austin, TX',
			isRemote: false,
			budget: '0.002',
			currencyType: 'BTC',
			deadline: '2023-12-18',
			skills: ['Heavy Lifting', 'Moving', 'Driving'],
			postedBy: {
				id: 'user4',
				name: 'Sarah Johnson',
				rating: 4.9,
				completedTasks: 22
			},
			createdAt: '2023-12-03'
		},
		{
			id: '5',
			title: 'Translate business documents',
			description: 'Need a professional translator for business documents from English to Spanish.',
			category: 'Professional Services',
			location: '',
			isRemote: true,
			budget: '0.0025',
			currencyType: 'LBTC',
			deadline: '2024-01-05',
			skills: ['Translation', 'Spanish', 'Business'],
			postedBy: {
				id: 'user5',
				name: 'Robert Wilson',
				rating: 4.7,
				completedTasks: 17
			},
			createdAt: '2023-12-08'
		}
	];

	// Filter states
	let searchQuery = '';
	let selectedCategory = '';
	let showRemoteOnly = false;
	let minBudget = '';
	let maxBudget = '';
	let sortBy = 'newest'; // newest, oldest, budget_high, budget_low

	// Categories - This would typically come from an API
	const categories = [
		'All Categories',
		'Home Maintenance',
		'Delivery',
		'Professional Services',
		'IT & Technology',
		'Personal Assistant',
		'Creative Services',
		'Education & Training',
		'Events & Photography',
		'Other'
	];

	// Filtered tasks
	$: filteredTasks = tasks
		.filter((task) => {
			// Search query filter
			if (
				searchQuery &&
				!task.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
				!task.description.toLowerCase().includes(searchQuery.toLowerCase())
			) {
				return false;
			}

			// Category filter
			if (
				selectedCategory &&
				selectedCategory !== 'All Categories' &&
				task.category !== selectedCategory
			) {
				return false;
			}

			// Remote filter
			if (showRemoteOnly && !task.isRemote) {
				return false;
			}

			// Budget filter
			if (minBudget && parseFloat(task.budget) < parseFloat(minBudget)) {
				return false;
			}

			if (maxBudget && parseFloat(task.budget) > parseFloat(maxBudget)) {
				return false;
			}

			return true;
		})
		.sort((a, b) => {
			switch (sortBy) {
				case 'newest':
					return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
				case 'oldest':
					return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
				case 'budget_high':
					return parseFloat(b.budget) - parseFloat(a.budget);
				case 'budget_low':
					return parseFloat(a.budget) - parseFloat(b.budget);
				default:
					return 0;
			}
		});

	// Clear all filters
	function clearFilters() {
		searchQuery = '';
		selectedCategory = '';
		showRemoteOnly = false;
		minBudget = '';
		maxBudget = '';
		sortBy = 'newest';
	}

	// Format date
	function formatDate(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
	}

	// Bid on task
	function bidOnTask(taskId: string) {
		// In a real implementation, this would navigate to a bid creation page
		console.log(`Bidding on task: ${taskId}`);
	}

	onMount(() => {
		// In a real implementation, this would fetch tasks from an API
		console.log('TaskList component mounted');
	});
</script>

<div class="mx-auto max-w-5xl">
	<div class="bg-base-100 mb-6 rounded-lg p-6 shadow-lg">
		<h2 class="mb-4 text-2xl font-bold">Find Tasks</h2>

		<!-- Search and Filters -->
		<div class="mb-6">
			<div class="form-control mb-4">
				<div class="input-group w-full">
					<input
						type="text"
						placeholder="Search tasks..."
						class="input input-bordered flex-grow"
						bind:value={searchQuery}
					/>
					<button class="btn btn-primary">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
							/>
						</svg>
					</button>
				</div>
			</div>

			<div class="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
				<div class="form-control">
					<label class="label">
						<span class="label-text">Category</span>
					</label>
					<select class="select select-bordered w-full" bind:value={selectedCategory}>
						{#each categories as category}
							<option value={category}>{category}</option>
						{/each}
					</select>
				</div>

				<div class="form-control">
					<label class="label">
						<span class="label-text">Remote Only</span>
					</label>
					<label class="label cursor-pointer justify-start gap-2">
						<input
							type="checkbox"
							bind:checked={showRemoteOnly}
							class="checkbox checkbox-primary"
						/>
						<span class="label-text">Show remote tasks only</span>
					</label>
				</div>

				<div class="form-control">
					<label class="label">
						<span class="label-text">Budget Range (BTC)</span>
					</label>
					<div class="flex gap-2">
						<input
							type="number"
							placeholder="Min"
							class="input input-bordered w-full"
							bind:value={minBudget}
							min="0"
							step="0.0001"
						/>
						<input
							type="number"
							placeholder="Max"
							class="input input-bordered w-full"
							bind:value={maxBudget}
							min="0"
							step="0.0001"
						/>
					</div>
				</div>

				<div class="form-control">
					<label class="label">
						<span class="label-text">Sort By</span>
					</label>
					<select class="select select-bordered w-full" bind:value={sortBy}>
						<option value="newest">Newest First</option>
						<option value="oldest">Oldest First</option>
						<option value="budget_high">Highest Budget</option>
						<option value="budget_low">Lowest Budget</option>
					</select>
				</div>
			</div>

			<div class="flex justify-end">
				<button class="btn btn-outline" on:click={clearFilters}> Clear Filters </button>
			</div>
		</div>

		<!-- Results count -->
		<div class="mb-4">
			<p class="text-base-content/70">
				Showing {filteredTasks.length}
				{filteredTasks.length === 1 ? 'task' : 'tasks'}
			</p>
		</div>

		<!-- Task List -->
		{#if filteredTasks.length > 0}
			<div class="space-y-4">
				{#each filteredTasks as task}
					<div class="card bg-base-200 shadow-md transition-shadow hover:shadow-lg">
						<div class="card-body">
							<div class="flex flex-col justify-between gap-4 md:flex-row md:items-center">
								<h3 class="card-title text-lg md:text-xl">{task.title}</h3>
								<div class="flex items-center gap-2 text-sm">
									<span class="font-semibold">{task.budget} {task.currencyType}</span>
									<span class="badge">{task.isRemote ? 'Remote' : 'On-site'}</span>
								</div>
							</div>

							<p class="text-base-content/80 my-2 line-clamp-2">{task.description}</p>

							<div class="mt-2 mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
								<div>
									<p class="text-base-content/60 text-sm">Category</p>
									<p class="font-medium">{task.category}</p>
								</div>

								<div>
									<p class="text-base-content/60 text-sm">Location</p>
									<p class="font-medium">{task.isRemote ? 'Remote' : task.location}</p>
								</div>

								<div>
									<p class="text-base-content/60 text-sm">Deadline</p>
									<p class="font-medium">{formatDate(task.deadline)}</p>
								</div>
							</div>

							<div class="mb-4 flex flex-wrap gap-2">
								{#each task.skills as skill}
									<span class="badge badge-primary badge-outline">{skill}</span>
								{/each}
							</div>

							<div class="card-actions flex items-center justify-between">
								<div class="flex items-center gap-2">
									<div class="avatar placeholder">
										<div class="bg-neutral text-neutral-content w-8 rounded-full">
											<span>{task.postedBy.name.charAt(0)}</span>
										</div>
									</div>
									<div>
										<p class="font-medium">{task.postedBy.name}</p>
										<div class="text-base-content/70 flex items-center gap-1 text-xs">
											<span class="flex items-center">
												<svg
													xmlns="http://www.w3.org/2000/svg"
													viewBox="0 0 24 24"
													fill="currentColor"
													class="h-4 w-4 text-yellow-500"
												>
													<path
														fill-rule="evenodd"
														d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z"
														clip-rule="evenodd"
													/>
												</svg>
												{task.postedBy.rating}
											</span>
											<span>•</span>
											<span>{task.postedBy.completedTasks} tasks completed</span>
										</div>
									</div>
								</div>

								<button class="btn btn-primary" on:click={() => bidOnTask(task.id)}>
									Bid on Task
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="py-12 text-center">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-base-content/30 mx-auto h-12 w-12"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<h3 class="mt-4 text-lg font-semibold">No tasks found</h3>
				<p class="text-base-content/60 mt-1">Try adjusting your filters or search criteria</p>
				<button class="btn btn-primary mt-4" on:click={clearFilters}>Clear Filters</button>
			</div>
		{/if}
	</div>
</div>
