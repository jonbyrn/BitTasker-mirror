<script lang="ts">
	// Using Svelte 5 runes
	let searchQuery = $state('');
	let selectedCategory = $state('All');
	let selectedStatus = $state('All');

	// Sample categories and statuses for filters
	const categories = ['All', 'Design', 'Development', 'Marketing', 'Writing', 'Admin'];
	const statuses = ['All', 'Open', 'In Progress', 'Urgent', 'Completed'];

	// Sample tasks data
	const tasks = $state([
		{
			id: 1,
			title: 'Website Redesign Project',
			description: 'Complete overhaul of company website with modern UI/UX principles',
			category: 'Design',
			status: 'Open',
			budget: '$1,500-$3,000',
			dueDate: '2023-12-15',
			skills: ['UI/UX', 'Figma', 'HTML/CSS']
		},
		{
			id: 2,
			title: 'Mobile App Development',
			description: 'Create a cross-platform mobile application for inventory management',
			category: 'Development',
			status: 'Urgent',
			budget: '$4,000-$6,000',
			dueDate: '2023-11-30',
			skills: ['React Native', 'Firebase', 'API Integration']
		},
		{
			id: 3,
			title: 'Content Writing for Blog',
			description: 'Create 10 SEO-optimized blog articles on digital marketing topics',
			category: 'Writing',
			status: 'Open',
			budget: '$500-$1,000',
			dueDate: '2023-12-05',
			skills: ['SEO', 'Copywriting', 'Marketing']
		},
		{
			id: 4,
			title: 'Social Media Campaign',
			description: 'Design and implement a 3-month social media marketing campaign',
			category: 'Marketing',
			status: 'In Progress',
			budget: '$2,000-$3,500',
			dueDate: '2024-01-20',
			skills: ['Social Media', 'Content Creation', 'Analytics']
		},
		{
			id: 5,
			title: 'Database Optimization',
			description: 'Improve performance of existing PostgreSQL database system',
			category: 'Development',
			status: 'Open',
			budget: '$1,000-$2,000',
			dueDate: '2023-12-10',
			skills: ['SQL', 'Database Design', 'Performance Tuning']
		},
		{
			id: 6,
			title: 'Administrative Support',
			description: 'Provide virtual assistant services for a small business owner',
			category: 'Admin',
			status: 'Open',
			budget: '$20-$25/hr',
			dueDate: 'Ongoing',
			skills: ['Organization', 'Communication', 'Microsoft Office']
		}
	]);

	// Filtered tasks based on search and filters
	let filteredTasks = $derived(
		tasks.filter((task) => {
			const matchesSearch =
				searchQuery === '' ||
				task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
				task.description.toLowerCase().includes(searchQuery.toLowerCase());

			const matchesCategory = selectedCategory === 'All' || task.category === selectedCategory;
			const matchesStatus = selectedStatus === 'All' || task.status === selectedStatus;

			return matchesSearch && matchesCategory && matchesStatus;
		})
	);

	// Function to handle applying for a task
	function applyForTask(taskId: number) {
		alert(`Applied for task #${taskId}`);
		// Implementation would connect to your backend
	}
</script>

<div class="flex gap-4">
	<!-- Side Filters Panel -->
	<div class="bg-base-100 hidden w-64 shrink-0 space-y-4 p-4 shadow-lg md:block">
		<div class="space-y-2">
			<h3 class="font-semibold">Search</h3>
			<div class="form-control">
				<div class="input-group">
					<input
						type="text"
						placeholder="Search tasks..."
						class="input input-bordered w-full"
						bind:value={searchQuery}
					/>
				</div>
			</div>
		</div>

		<div class="divider"></div>

		<div class="space-y-2">
			<h3 class="font-semibold">Category</h3>
			<div class="space-y-1">
				{#each categories as category}
					<label class="label cursor-pointer justify-start gap-2">
						<input
							type="radio"
							name="category"
							class="radio radio-sm radio-primary"
							checked={selectedCategory === category}
							onchange={() => (selectedCategory = category)}
						/>
						<span class="label-text">{category}</span>
					</label>
				{/each}
			</div>
		</div>

		<div class="divider"></div>

		<div class="space-y-2">
			<h3 class="font-semibold">Status</h3>
			<div class="space-y-1">
				{#each statuses as status}
					<label class="label cursor-pointer justify-start gap-2">
						<input
							type="radio"
							name="status"
							class="radio radio-sm radio-primary"
							checked={selectedStatus === status}
							onchange={() => (selectedStatus = status)}
						/>
						<span class="label-text">{status}</span>
					</label>
				{/each}
			</div>
		</div>
	</div>

	<!-- Main Content -->
	<div class="flex-1">
		<!-- Page Header -->
		<div class="mb-4">
			<h1 class="text-2xl font-bold">Explore Tasks</h1>
			<p class="text-base-content/70">
				Find and apply for tasks that match your skills and interests
			</p>
		</div>

		<!-- Task List -->
		<div class="space-y-3">
			{#each filteredTasks as task}
				<div class="card bg-base-100 shadow-sm">
					<div class="card-body p-4">
						<div class="flex items-start justify-between gap-4">
							<div class="flex-1">
								<div class="flex items-center gap-2">
									<h2 class="text-lg font-semibold">{task.title}</h2>
									<div
										class="badge badge-sm badge-{task.status === 'Urgent'
											? 'error'
											: task.status === 'In Progress'
												? 'warning'
												: 'primary'}"
									>
										{task.status}
									</div>
								</div>

								<p class="text-base-content/70 mt-1 text-sm">{task.description}</p>

								<div class="mt-2 flex flex-wrap gap-1">
									{#each task.skills as skill}
										<div class="badge badge-sm badge-outline">{skill}</div>
									{/each}
								</div>
							</div>

							<div class="flex flex-col items-end gap-2">
								<div class="text-right">
									<div class="font-medium">{task.budget}</div>
									<div class="text-base-content/70 text-sm">Due: {task.dueDate}</div>
								</div>
								<button class="btn btn-primary btn-sm" onclick={() => applyForTask(task.id)}>
									Apply Now
								</button>
							</div>
						</div>
					</div>
				</div>
			{/each}

			{#if filteredTasks.length === 0}
				<div class="alert alert-info shadow-sm">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						class="h-5 w-5 flex-shrink-0 stroke-current"
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
		</div>

		<!-- Pagination -->
		{#if filteredTasks.length > 0}
			<div class="mt-4 flex justify-center">
				<div class="join">
					<button class="join-item btn btn-sm">«</button>
					<button class="join-item btn btn-sm btn-active">1</button>
					<button class="join-item btn btn-sm">2</button>
					<button class="join-item btn btn-sm">3</button>
					<button class="join-item btn btn-sm">»</button>
				</div>
			</div>
		{/if}
	</div>
</div>
