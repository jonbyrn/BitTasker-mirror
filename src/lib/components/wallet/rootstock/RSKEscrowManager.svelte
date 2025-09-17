<script lang="ts">
	import { appStore } from '$lib/stores/app.store';
	import { rskWalletStore, rskEscrows, rskWallet } from '$lib/stores/rskWallet.store';
	import { ethers } from 'ethers';

	// Placeholder contract ABI - in production, import from generated types
	const ESCROW_CONTRACT_ABI = [
		'function createEscrow(address freelancer, uint256 estimatedStartTime, uint256 estimatedCompletionTime, uint256 clientFeeTier, uint256 freelancerFeeTier) payable returns (uint256)',
		'function completeTask(uint256 escrowId)',
		'function acceptTask(uint256 escrowId)',
		'function cancelEscrow(uint256 escrowId)',
		'function disputeTask(uint256 escrowId)',
		'event EscrowCreated(uint256 indexed escrowId, address indexed client, address indexed freelancer, uint256 amount)',
		'event TaskCompleted(uint256 indexed escrowId)',
		'event TaskAccepted(uint256 indexed escrowId)',
		'event EscrowCancelled(uint256 indexed escrowId)'
	];

	// Form states
	let activeTab = $state('create');
	let isLoading = $state(false);

	// Create escrow form
	let freelancerAddress = $state('');
	let escrowAmount = $state('');
	let startTime = $state('');
	let completionTime = $state('');
	let clientFeeTier = $state(1);
	let freelancerFeeTier = $state(1);

	// Manage escrow
	let selectedEscrowId = '';

	function formatEscrowStatus(status: string): string {
		switch (status) {
			case 'Funded':
				return 'Awaiting Work';
			case 'Completed':
				return 'Work Completed';
			case 'InDispute':
				return 'In Dispute';
			case 'Resolved':
				return 'Resolved';
			case 'Cancelled':
				return 'Cancelled';
			default:
				return status;
		}
	}

	function getStatusBadgeClass(status: string): string {
		switch (status) {
			case 'Funded':
				return 'badge-info';
			case 'Completed':
				return 'badge-success';
			case 'InDispute':
				return 'badge-warning';
			case 'Resolved':
				return 'badge-success';
			case 'Cancelled':
				return 'badge-error';
			default:
				return 'badge-ghost';
		}
	}

	function getFeePercentage(tier: number): string {
		switch (tier) {
			case 1:
				return '2.5%';
			case 2:
				return '2.0%';
			case 3:
				return '1.5%';
			default:
				return '2.5%';
		}
	}

	function calculateTotalPayment(amount: string, feeTier: number): string {
		if (!amount) return '0';

		const baseAmount = parseFloat(amount);
		const feePercentage = feeTier === 1 ? 0.025 : feeTier === 2 ? 0.02 : 0.015;
		const fee = baseAmount * feePercentage;

		return (baseAmount + fee).toFixed(6);
	}

	async function createEscrow() {
		if (!freelancerAddress || !escrowAmount || !startTime || !completionTime) {
			appStore.showErrorToast('Please fill in all required fields');
			return;
		}

		if (!ethers.isAddress(freelancerAddress)) {
			appStore.showErrorToast('Invalid freelancer address');
			return;
		}

		try {
			isLoading = true;

			// Convert times to timestamps
			const startTimestamp = Math.floor(new Date(startTime).getTime() / 1000);
			const completionTimestamp = Math.floor(new Date(completionTime).getTime() / 1000);

			if (startTimestamp <= Math.floor(Date.now() / 1000)) {
				appStore.showErrorToast('Start time must be in the future');
				return;
			}

			if (completionTimestamp <= startTimestamp) {
				appStore.showErrorToast('Completion time must be after start time');
				return;
			}

			// Calculate total payment including client fee
			const totalPayment = calculateTotalPayment(escrowAmount, clientFeeTier);

			// This would call the actual contract - placeholder for now
			appStore.showInfoToast('Escrow creation functionality coming soon');

			// Reset form
			freelancerAddress = '';
			escrowAmount = '';
			startTime = '';
			completionTime = '';
			clientFeeTier = 1;
			freelancerFeeTier = 1;
		} catch (error) {
			console.error('Escrow creation failed:', error);
			appStore.showErrorToast(error instanceof Error ? error.message : 'Escrow creation failed');
		} finally {
			isLoading = false;
		}
	}

	function formatAddress(address: string): string {
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}

	function formatTimestamp(timestamp: number): string {
		return new Date(timestamp).toLocaleDateString();
	}

	// Set default times (1 hour from now for start, 1 day for completion)
	function setDefaultTimes() {
		const now = new Date();
		const start = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
		const completion = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day from now

		startTime = start.toISOString().slice(0, 16); // Format for datetime-local input
		completionTime = completion.toISOString().slice(0, 16);
	}

	// Set default times on component mount
	$effect(() => {
		if (!startTime && !completionTime) {
			setDefaultTimes();
		}
	});
</script>

<div class="card bg-base-100 shadow-xl">
	<div class="card-body">
		<h3 class="card-title">Escrow Manager</h3>

		<!-- Tab Navigation -->
		<div class="tabs tabs-bordered mb-6">
			<button
				class="tab {activeTab === 'create' ? 'tab-active' : ''}"
				onclick={() => (activeTab = 'create')}
			>
				Create Escrow
			</button>
			<button
				class="tab {activeTab === 'manage' ? 'tab-active' : ''}"
				onclick={() => (activeTab = 'manage')}
			>
				My Escrows ({$rskEscrows.length})
			</button>
		</div>

		{#if activeTab === 'create'}
			<!-- Create Escrow Form -->
			<div class="space-y-4">
				<div class="alert alert-info">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6 shrink-0 stroke-current"
						fill="none"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<div>
						<div class="font-bold">Smart Contract Integration</div>
						<div class="text-sm">
							This feature requires your SimplifiedEscrowContract to be deployed and configured.
						</div>
					</div>
				</div>

				<div class="form-control">
					<label class="label" for="freelancer-address">
						<span class="label-text">Freelancer Address</span>
					</label>
					<input
						id="freelancer-address"
						type="text"
						placeholder="0x..."
						class="input input-bordered"
						bind:value={freelancerAddress}
						disabled={isLoading}
					/>
					{#if freelancerAddress && !ethers.isAddress(freelancerAddress)}
						<label class="label" for="freelancer-address">
							<span class="label-text-alt text-error">Invalid address format</span>
						</label>
					{/if}
				</div>

				<div class="form-control">
					<label class="label" for="escrow-amount">
						<span class="label-text">Escrow Amount (RBTC)</span>
					</label>
					<input
						id="escrow-amount"
						type="number"
						step="0.000001"
						placeholder="0.0"
						class="input input-bordered"
						bind:value={escrowAmount}
						disabled={isLoading}
					/>
				</div>

				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div class="form-control">
						<label class="label" for="start-time">
							<span class="label-text">Estimated Start Time</span>
						</label>
						<input
							id="start-time"
							type="datetime-local"
							class="input input-bordered"
							bind:value={startTime}
							disabled={isLoading}
						/>
					</div>

					<div class="form-control">
						<label class="label" for="completion-time">
							<span class="label-text">Estimated Completion Time</span>
						</label>
						<input
							id="completion-time"
							type="datetime-local"
							class="input input-bordered"
							bind:value={completionTime}
							disabled={isLoading}
						/>
					</div>
				</div>

				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div class="form-control">
						<label class="label" for="client-fee-tier">
							<span class="label-text">Client Fee Tier</span>
						</label>
						<select
							id="client-fee-tier"
							class="select select-bordered"
							bind:value={clientFeeTier}
							disabled={isLoading}
						>
							<option value={1}>Tier 1 - {getFeePercentage(1)}</option>
							<option value={2}>Tier 2 - {getFeePercentage(2)}</option>
							<option value={3}>Tier 3 - {getFeePercentage(3)}</option>
						</select>
					</div>

					<div class="form-control">
						<label class="label" for="freelancer-fee-tier">
							<span class="label-text">Freelancer Fee Tier</span>
						</label>
						<select
							id="freelancer-fee-tier"
							class="select select-bordered"
							bind:value={freelancerFeeTier}
							disabled={isLoading}
						>
							<option value={1}>Tier 1 - {getFeePercentage(1)}</option>
							<option value={2}>Tier 2 - {getFeePercentage(2)}</option>
							<option value={3}>Tier 3 - {getFeePercentage(3)}</option>
						</select>
					</div>
				</div>

				{#if escrowAmount}
					<div class="bg-base-200 rounded-lg p-4">
						<div class="mb-2 text-sm font-semibold">Escrow Summary</div>
						<div class="space-y-1 text-sm">
							<div class="flex justify-between">
								<span>Base Amount:</span>
								<span>{escrowAmount} RBTC</span>
							</div>
							<div class="flex justify-between">
								<span>Client Fee ({getFeePercentage(clientFeeTier)}):</span>
								<span
									>{(
										parseFloat(escrowAmount || '0') *
										(clientFeeTier === 1 ? 0.025 : clientFeeTier === 2 ? 0.02 : 0.015)
									).toFixed(6)} RBTC</span
								>
							</div>
							<div class="divider my-1"></div>
							<div class="flex justify-between font-semibold">
								<span>Total Payment:</span>
								<span>{calculateTotalPayment(escrowAmount, clientFeeTier)} RBTC</span>
							</div>
						</div>
					</div>
				{/if}

				<div class="card-actions justify-end">
					<button
						class="btn btn-primary"
						onclick={createEscrow}
						disabled={isLoading ||
							!freelancerAddress ||
							!escrowAmount ||
							!startTime ||
							!completionTime ||
							!ethers.isAddress(freelancerAddress)}
					>
						{#if isLoading}
							<span class="loading loading-spinner loading-sm"></span>
							Creating...
						{:else}
							Create Escrow
						{/if}
					</button>
				</div>
			</div>
		{:else if activeTab === 'manage'}
			<!-- Manage Escrows -->
			{#if $rskEscrows.length === 0}
				<div class="py-12 text-center">
					<div class="mb-4 text-6xl opacity-20">🤝</div>
					<div class="text-lg font-semibold opacity-60">No escrows found</div>
					<div class="mt-2 text-sm opacity-40">
						Create your first escrow to get started with secure task payments.
					</div>
				</div>
			{:else}
				<div class="space-y-4">
					{#each $rskEscrows as escrow}
						<div class="card bg-base-200 shadow-sm">
							<div class="card-body">
								<div class="flex items-start justify-between">
									<div class="flex-1">
										<div class="mb-2 flex items-center gap-2">
											<span class="font-semibold">Escrow #{escrow.id}</span>
											<div class="badge {getStatusBadgeClass(escrow.status)}">
												{formatEscrowStatus(escrow.status)}
											</div>
										</div>

										<div class="space-y-1 text-sm opacity-70">
											<div>Client: {formatAddress(escrow.client)}</div>
											<div>Freelancer: {formatAddress(escrow.freelancer)}</div>
											<div>Created: {formatTimestamp(escrow.createdAt)}</div>
											{#if escrow.startTime > 0}
												<div>Start: {formatTimestamp(escrow.startTime * 1000)}</div>
											{/if}
											{#if escrow.completionTime > 0}
												<div>Completion: {formatTimestamp(escrow.completionTime * 1000)}</div>
											{/if}
										</div>
									</div>

									<div class="text-right">
										<div class="text-lg font-bold">{escrow.amount} RBTC</div>

										<!-- Action buttons based on status and user role -->
										<div class="mt-2 flex gap-1">
											{#if escrow.status === 'Funded'}
												<button class="btn btn-sm btn-outline" disabled> Complete Task </button>
											{:else if escrow.status === 'Completed'}
												<button class="btn btn-sm btn-success" disabled> Accept Work </button>
												<button class="btn btn-sm btn-warning" disabled> Dispute </button>
											{/if}
										</div>
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/if}

		{#if !$rskWalletStore.isConnected}
			<div class="alert alert-warning mt-6">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z"
					/>
				</svg>
				<span>RSK wallet not connected. Please refresh the page to reconnect.</span>
			</div>
		{/if}
	</div>
</div>
