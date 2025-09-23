<script lang="ts">
	import { appStore } from '$lib/stores/app.store';
	import { rskWalletStore, rskEscrows } from '$lib/stores/rskWallet.store';
	import { EscrowStatus } from '$lib/utils/enums/wallet.enum';
	import { escrow } from '$lib/utils/wallet/escrow';
	import { ethers } from 'ethers';
	import DateInput from '$lib/components/date/DateInput.svelte';

	// Form states
	let activeTab = $state('create');
	let isLoading = $state(false);
	let contractValidationError = $state('');

	// Create escrow form
	let freelancerAddress = $state('');
	let escrowAmount = $state('');
	let startTime = $state<Date | null>(null);
	let completionTime = $state<Date | null>(null);
	let clientFeeTier = $state(1);
	let freelancerFeeTier = $state(1);

	// Loading state for escrows
	let isLoadingEscrows = $state(false);

	function formatEscrowStatus(status: EscrowStatus): string {
		switch (status) {
			case EscrowStatus.Funded:
				return 'Awaiting Work';
			case EscrowStatus.Completed:
				return 'Work Completed';
			case EscrowStatus.InDispute:
				return 'In Dispute';
			case EscrowStatus.Resolved:
				return 'Resolved';
			case EscrowStatus.Cancelled:
				return 'Cancelled';
			default:
				return status;
		}
	}

	function getStatusBadgeClass(status: EscrowStatus): string {
		switch (status) {
			case EscrowStatus.Funded:
				return 'badge-info';
			case EscrowStatus.Completed:
				return 'badge-success';
			case EscrowStatus.InDispute:
				return 'badge-warning';
			case EscrowStatus.Resolved:
				return 'badge-success';
			case EscrowStatus.Cancelled:
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

		// Validate escrow amount
		const amountNum = parseFloat(escrowAmount);
		if (isNaN(amountNum) || amountNum <= 0) {
			appStore.showErrorToast('Invalid escrow amount');
			return;
		}

		try {
			isLoading = true;

			// Convert times to timestamps
			const startTimestamp = Math.floor(startTime!.getTime() / 1000);
			const completionTimestamp = Math.floor(completionTime!.getTime() / 1000);

			if (startTimestamp <= Math.floor(Date.now() / 1000)) {
				appStore.showErrorToast('Start time must be in the future');
				return;
			}

			if (completionTimestamp <= startTimestamp) {
				appStore.showErrorToast('Completion time must be after start time');
				return;
			}

			// First connect to escrow contract if not connected
			if (!$rskWalletStore.contractConnected) {
				try {
					await escrow.connectToEscrowContract();
					contractValidationError = ''; // Clear any previous errors
				} catch (error) {
					if (error instanceof Error && error.message.includes('No contract deployed')) {
						contractValidationError =
							'Smart contract not deployed at the configured address. Please check your contract deployment.';
						appStore.showErrorToast(contractValidationError);
						return;
					} else if (
						error instanceof Error &&
						error.message.includes('could not decode result data')
					) {
						contractValidationError =
							'Contract interface mismatch. The deployed contract may not have the expected functions.';
						appStore.showErrorToast(contractValidationError);
						return;
					}
					throw error; // Re-throw if it's a different error
				}
			}

			// Create the escrow
			const result = await escrow.createEscrow(
				freelancerAddress,
				escrowAmount.toString(), // Ensure it's a string
				startTimestamp,
				completionTimestamp,
				clientFeeTier as 1 | 2 | 3,
				freelancerFeeTier as 1 | 2 | 3
			);

			if (result.status === 'pending') {
				appStore.showSuccessToast(`Escrow created! Transaction hash: ${result.hash}`);

				// Reset form
				freelancerAddress = '';
				escrowAmount = '';
				startTime = '';
				completionTime = '';
				clientFeeTier = 1;
				freelancerFeeTier = 1;
			} else {
				appStore.showErrorToast('Escrow creation failed');
			}
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

	// Escrow loading function
	async function loadEscrows() {
		if (isLoadingEscrows) return; // Prevent multiple simultaneous loads

		try {
			isLoadingEscrows = true;
			console.log('Loading user escrows...');

			// First ensure contract is connected
			if (!$rskWalletStore.contractConnected) {
				console.log('Contract not connected, connecting...');
				await escrow.connectToEscrowContract();
			}

			// Load escrows using the existing function
			await escrow.loadUserEscrows();
			console.log('Escrows loaded successfully');
		} catch (error) {
			console.error('Failed to load escrows:', error);
			appStore.showErrorToast('Failed to load escrows. Please try again.');
		} finally {
			isLoadingEscrows = false;
		}
	}

	// Auto-load escrows when switching to manage tab
	$effect(() => {
		if (
			activeTab === 'manage' &&
			$rskWalletStore.isConnected &&
			$rskWalletStore.escrows.length === 0
		) {
			console.log('Auto-loading escrows for manage tab...');
			loadEscrows();
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
				{#if isLoadingEscrows}
					<span class="loading loading-spinner loading-xs ml-2"></span>
				{/if}
			</button>
		</div>

		{#if activeTab === 'create'}
			<!-- Create Escrow Form -->
			<div class="space-y-4">
				{#if contractValidationError}
					<div class="alert alert-error">
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
								d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<div>
							<div class="font-bold">Contract Validation Error</div>
							<div class="text-sm">{contractValidationError}</div>
						</div>
					</div>
				{:else}
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
				{/if}

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

				<div class="flex flex-col gap-4">
					<div class="form-control">
						<DateInput
							bind:value={startTime}
							type="datetime"
							labelKey="airdatepicker.select_start_datetime"
							placeholderKey="airdatepicker.select_start_datetime"
							minDate={new Date()}
							timeStep={15}
							onChange={(date) => startTime = date}
							disabled={isLoading}
						/>
					</div>

					<div class="form-control">
						<DateInput
							bind:value={completionTime}
							type="datetime"
							labelKey="airdatepicker.select_end_datetime"
							placeholderKey="airdatepicker.select_end_datetime"
							minDate={startTime || new Date()}
							timeStep={15}
							onChange={(date) => completionTime = date}
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
							!ethers.isAddress(freelancerAddress) ||
							!!contractValidationError}
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
			<div class="mb-4 flex items-center justify-between">
				<div class="text-sm opacity-70">
					{#if isLoadingEscrows}
						Loading your escrows...
					{:else if $rskEscrows.length === 0}
						No escrows found. Try refreshing or create your first escrow.
					{:else}
						Showing {$rskEscrows.length} escrow{$rskEscrows.length !== 1 ? 's' : ''}
					{/if}
				</div>
				<button class="btn btn-sm btn-outline" onclick={loadEscrows} disabled={isLoadingEscrows}>
					{#if isLoadingEscrows}
						<span class="loading loading-spinner loading-xs"></span>
					{:else}
						🔄 Refresh
					{/if}
				</button>
			</div>

			{#if $rskEscrows.length === 0 && !isLoadingEscrows}
				<div class="py-12 text-center">
					<div class="mb-4 text-6xl opacity-20">🤝</div>
					<div class="text-lg font-semibold opacity-60">No escrows found</div>
					<div class="mt-2 text-sm opacity-40">
						Create your first escrow to get started with secure task payments.
					</div>
					<button
						class="btn btn-primary btn-sm mt-4"
						onclick={loadEscrows}
						disabled={isLoadingEscrows}
					>
						🔄 Check for Escrows
					</button>
				</div>
			{:else if $rskEscrows.length > 0}
				<div class="space-y-4">
					{#each $rskEscrows as escrow}
						<div class="card bg-base-200 shadow-sm">
							<div class="card-body">
								<div class="flex items-start justify-between">
									<div class="flex-1">
										<div class="mb-2 flex items-center gap-2">
											<span class="text-primary font-semibold">Escrow #{escrow.id}</span>
											<div class="badge {getStatusBadgeClass(escrow.status)}">
												{formatEscrowStatus(escrow.status)}
											</div>
											<div class="badge badge-outline badge-xs">
												ID: {escrow.id}
											</div>
										</div>

										<div class="space-y-1 text-sm opacity-70">
											<div>Client: {formatAddress(escrow.client)}</div>
											<div>Freelancer: {formatAddress(escrow.freelancer)}</div>
											<div>Created: {formatTimestamp(escrow.createdAt)}</div>
											{#if escrow.estimatedStartTime > 0}
												<div>Start: {formatTimestamp(escrow.estimatedStartTime * 1000)}</div>
											{/if}
											{#if escrow.estimatedCompletionTime > 0}
												<div>
													Completion: {formatTimestamp(escrow.estimatedCompletionTime * 1000)}
												</div>
											{/if}
										</div>
									</div>

									<div class="text-right">
										<div class="text-lg font-bold">{escrow.totalAmount} RBTC</div>

										<!-- Action buttons based on status and user role -->
										<div class="mt-2 flex gap-1">
											{#if escrow.status === EscrowStatus.Funded}
												<button class="btn btn-sm btn-outline" disabled> Complete Task </button>
											{:else if escrow.status === EscrowStatus.Completed}
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
