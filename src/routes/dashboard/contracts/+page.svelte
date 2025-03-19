<script lang="ts">
	// Mock data for contracts
	const contracts = [
		{
			id: 1,
			title: 'E-commerce Website Development',
			client: 'GlobalShop Inc.',
			startDate: '2023-12-10',
			dueDate: '2024-04-25',
			status: 'In Progress',
			payment: '$2,500',
			progress: 65,
			description:
				'Developing a full e-commerce platform with product catalog, user accounts, and payment processing.'
		},
		{
			id: 2,
			title: 'Logo Design for Tech Startup',
			client: 'NexaTech',
			startDate: '2024-02-15',
			dueDate: '2024-03-01',
			status: 'Completed',
			payment: '$350',
			progress: 100,
			description:
				'Created brand identity including logo design, color palette, and basic brand guidelines.'
		},
		{
			id: 3,
			title: 'Mobile App UI/UX Design',
			client: 'HealthTrack',
			startDate: '2024-03-01',
			dueDate: '2024-05-15',
			status: 'In Progress',
			payment: '$1,800',
			progress: 40,
			description:
				'Designing user interface and experience for a health tracking mobile application.'
		},
		{
			id: 4,
			title: 'Content Writing for Blog',
			client: 'CryptoNews',
			startDate: '2024-03-10',
			dueDate: '2024-04-10',
			status: 'In Progress',
			payment: '$500',
			progress: 30,
			description: 'Writing 10 blog articles about blockchain technology and cryptocurrency trends.'
		}
	];

	// Filter by status
	const statuses = ['All', 'In Progress', 'Completed', 'Cancelled'];
	let selectedStatus = 'All';

	// Search functionality
	let searchTerm = '';

	// Filtered contracts based on selected status and search term
	$: filteredContracts = contracts.filter((contract) => {
		// Status filter
		if (selectedStatus !== 'All' && contract.status !== selectedStatus) {
			return false;
		}

		// Search filter
		if (
			searchTerm &&
			!contract.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
			!contract.client.toLowerCase().includes(searchTerm.toLowerCase()) &&
			!contract.description.toLowerCase().includes(searchTerm.toLowerCase())
		) {
			return false;
		}

		return true;
	});

	// Format date in a user-friendly way
	function formatDate(dateString: string): string {
		const options: Intl.DateTimeFormatOptions = { 
			year: 'numeric', 
			month: 'short', 
			day: 'numeric' 
		};
		return new Date(dateString).toLocaleDateString(undefined, options);
	}

	// Calculate days remaining or overdue
	function getDaysRemaining(dueDate: string): string {
		const today = new Date();
		const due = new Date(dueDate);
		const diffTime = due.getTime() - today.getTime();
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
		
		if (diffDays < 0) {
			return `${Math.abs(diffDays)} days overdue`;
		} else if (diffDays === 0) {
			return 'Due today';
		} else {
			return `${diffDays} days remaining`;
		}
	}

	// Progress color based on completion percentage and due date
	function getProgressColor(progress: number, dueDate: string): string {
		const today = new Date();
		const due = new Date(dueDate);
		const diffTime = due.getTime() - today.getTime();
		const daysRemainingNumber = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
		
		if (progress >= 100) {
			return 'progress-success'; // Completed
		} else if (daysRemainingNumber < 0) {
			return 'progress-error'; // Overdue
		} else if (daysRemainingNumber < 7 && progress < 70) {
			return 'progress-warning'; // Less than a week left but progress below 70%
		} else {
			return 'progress-primary'; // Normal progress
		}
	}
</script>

<div class="flex flex-col gap-6">
	<!-- Page header -->
	<div class="flex flex-col gap-2">
		<h1 class="text-3xl font-bold">Current Contracts</h1>
		<p class="text-base-content/70">Manage your ongoing and completed contracts</p>
	</div>

	<!-- Search and filters section -->
	<div class="rounded-box bg-base-200 p-4">
		<div class="grid gap-4 md:grid-cols-3">
			<!-- Search input -->
			<div class="form-control md:col-span-2">
				<div class="input-group">
					<input
						type="text"
						placeholder="Search contracts..."
						class="input input-bordered w-full"
						bind:value={searchTerm}
					/>
					<button class="btn btn-square bg-primary text-primary-content">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6"
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

			<!-- Status filter -->
			<div class="form-control">
				<select class="select select-bordered w-full" bind:value={selectedStatus}>
					{#each statuses as status}
						<option value={status}>{status}</option>
					{/each}
				</select>
			</div>
		</div>
	</div>

	<!-- Contracts stats cards -->
	<div class="stats stats-vertical md:stats-horizontal shadow-lg">
		<div class="stat">
			<div class="stat-title">Active Contracts</div>
			<div class="stat-value text-primary">
				{contracts.filter((c) => c.status === 'In Progress').length}
			</div>
			<div class="stat-desc">Current ongoing work</div>
		</div>

		<div class="stat">
			<div class="stat-title">Completed</div>
			<div class="stat-value text-success">
				{contracts.filter((c) => c.status === 'Completed').length}
			</div>
			<div class="stat-desc">Successfully delivered</div>
		</div>

		<div class="stat">
			<div class="stat-title">Total Earnings</div>
			<div class="stat-value">
				${contracts
					.reduce((sum, contract) => {
						if (contract.status === 'Completed') {
							return sum + parseInt(contract.payment.replace(/[$,]/g, ''));
						}
						return sum;
					}, 0)
					.toLocaleString()}
			</div>
			<div class="stat-desc">From completed contracts</div>
		</div>
	</div>

	<!-- Contracts list -->
	<div class="flex flex-col gap-4">
		{#if filteredContracts.length === 0}
			<div
				class="rounded-box bg-base-200 flex flex-col items-center justify-center p-8 text-center"
			>
				<div class="mb-4 text-5xl">📄</div>
				<h3 class="text-lg font-bold">No Contracts Found</h3>
				<p class="text-base-content/70 mt-2">Try adjusting your filters or search term</p>
			</div>
		{:else}
			{#each filteredContracts as contract}
				<div class="card bg-base-200 shadow-xl">
					<div class="card-body">
						<div class="flex flex-col justify-between gap-4 md:flex-row md:items-center">
							<div>
								<h2 class="card-title">
									{contract.title}
									{#if contract.status === 'In Progress'}
										<div class="badge badge-primary">{contract.status}</div>
									{:else if contract.status === 'Completed'}
										<div class="badge badge-success">{contract.status}</div>
									{:else}
										<div class="badge badge-secondary">{contract.status}</div>
									{/if}
								</h2>
								<p class="mt-1 text-sm font-medium">Client: {contract.client}</p>
							</div>
							<div class="flex flex-wrap gap-2">
								<button class="btn btn-sm btn-outline">View Details</button>
								{#if contract.status === 'In Progress'}
									<button class="btn btn-sm btn-primary">Update Progress</button>
								{/if}
							</div>
						</div>

						<p class="text-base-content/80 mt-2">{contract.description}</p>

						<div class="mt-4 flex flex-col gap-2">
							<div class="flex flex-col gap-1 text-sm sm:flex-row sm:justify-between">
								<div>Payment: <span class="font-semibold">{contract.payment}</span></div>
								<div>
									<span class="font-semibold">Period:</span>
									{formatDate(contract.startDate)} - {formatDate(contract.dueDate)}
									{#if contract.status === 'In Progress'}
										<span class="text-base-content/70 ml-2 italic"
											>({getDaysRemaining(contract.dueDate)})</span
										>
									{/if}
								</div>
							</div>

							{#if contract.status === 'In Progress'}
								<div class="w-full">
									<div class="flex justify-between text-xs">
										<span>Progress</span>
										<span>{contract.progress}%</span>
									</div>
									<progress
										class="progress {getProgressColor(contract.progress, contract.dueDate)} w-full"
										value={contract.progress}
										max="100"
									></progress>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>
