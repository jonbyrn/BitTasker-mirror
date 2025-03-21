<script lang="ts">
	import { tasks2 as tasks } from '$lib/utils/consts';

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
</script>

<div class="mx-auto max-w-5xl">
	<div class="bg-base-100 mb-6 rounded-lg p-2 shadow-lg md:p-6">
		<!-- Search and Filters -->
		<div class="mb-6">
			<div class="form-control mb-4">
				<div class="w-full">
					<input
						type="text"
						placeholder="Search tasks..."
						class="input input-bordered w-10/12"
						bind:value={searchQuery}
					/>
					<button aria-label="Search" class="btn btn-square">
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

			<div class="mb-4 flex flex-col gap-4 md:flex-row">
				<div>
					<label class="select">
						<span class="label">Category</span>
						<select bind:value={selectedCategory}>
							{#each categories as category}
								<option value={category}>{category}</option>
							{/each}
						</select>
					</label>
				</div>

				<div>
					<label class="select">
						<span class="label">Sort By</span>
						<select bind:value={sortBy} class="text-sm">
							<option value="newest">Newest First</option>
							<option value="oldest">Oldest First</option>
							<option value="budget_high">Highest Budget</option>
							<option value="budget_low">Lowest Budget</option>
						</select>
					</label>
				</div>
			</div>
			<div>
				<label>
					<span class="label hidden">Budget Range (BTC)</span>
					<div class="flex gap-2">
						<input
							type="number"
							placeholder="Min BTC"
							class="input input-bordered w-full"
							bind:value={minBudget}
							min="0"
							step="0.0001"
						/>
						<input
							type="number"
							placeholder="Max BTC"
							class="input input-bordered w-full"
							bind:value={maxBudget}
							min="0"
							step="0.0001"
						/>
					</div>
				</label>
			</div>
			<div class="mt-4 flex flex-col justify-between gap-4 md:flex-row">
				<label class="fieldset-label">
					<input type="checkbox" bind:checked={showRemoteOnly} class="checkbox" />
					Remote only
				</label>

				<button class="btn" onclick={clearFilters}> Clear Filters </button>
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

							<div class="card-actions flex items-center justify-between gap-6">
								<div class="flex items-center gap-2">
									<div class="avatar">
										<div class="border-base-100 w-8 rounded-full border">
											<span class="text-center">{task.postedBy.name.charAt(0)}</span>
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

								<button class="btn btn-primary w-full md:w-auto" onclick={() => bidOnTask(task.id)}>
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
				<button class="btn btn-primary mt-4" onclick={clearFilters}>Clear Filters</button>
			</div>
		{/if}
	</div>
</div>
