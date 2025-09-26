<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { ContractWithEvents } from '$lib/types/contract';
	import { publishContractStatus } from '$lib/utils/nostr-bid';
	import { escrow } from '$lib/utils/wallet/escrow';
	import { appStore } from '$lib/stores/app.store';
	import { getErrorMessage } from '$lib/utils/wallet/contractErrorHandler';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';

	const {
		contract,
		onActionComplete,
		containerClass = 'space-y-3',
		openDrawer = () => {},
		isInline = false
	} = $props<{
		contract: ContractWithEvents;
		onActionComplete?: () => void;
		containerClass?: string;
		isInline?: boolean;
		openDrawer?: () => void;
	}>();

	// State for actions
	let isLoading = $state<Record<string, boolean>>({});
	let showResolutionForm = $state(false);
	let proposedClientAmountUSD = $state('');
	let proposedFreelancerAmountUSD = $state('');
	let currentProposal = $state<{
		clientAmount: string;
		freelancerAmount: string;
		proposer: string;
	} | null>(null);
	let btcPrice = $state<number>(63000); // Default fallback price

	// Helper to set loading state
	function setLoading(action: string, loading: boolean) {
		isLoading = { ...isLoading, [action]: loading };
	}

	// Helper to handle action completion
	function handleActionComplete() {
		onActionComplete?.();
	}

	// Complete task (freelancer only)
	async function completeTask() {
		if (!contract.canComplete) return;

		setLoading('complete', true);
		try {
			// Call RSK escrow completeTask
			const result = await escrow.completeTask(contract.contract.escrowId);

			// Publish status update to Nostr
			await publishContractStatus({
				contractEventId: contract.contractEvent.id,
				escrowId: contract.contract.escrowId,
				action: 'task-completed',
				message: $t('dashboard.contracts.actions.task_completed_message'),
				transactionHash: result.hash
			});

			appStore.showSuccessToast($t('dashboard.contracts.actions.task_completed_success'));
			handleActionComplete();
		} catch (error) {
			console.error('Error completing task:', error);
			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.task_completed_error');
			appStore.showErrorToast(errorMessage);
		} finally {
			setLoading('complete', false);
		}
	}

	// Accept task (client only)
	async function acceptTask() {
		if (!contract.canAccept) return;

		setLoading('accept', true);
		try {
			// Call RSK escrow acceptTask
			const result = await escrow.acceptTask(contract.contract.escrowId);

			// Publish status update to Nostr
			await publishContractStatus({
				contractEventId: contract.contractEvent.id,
				escrowId: contract.contract.escrowId,
				action: 'payment-released',
				message: $t('dashboard.contracts.actions.payment_released_message'),
				transactionHash: result.hash
			});

			appStore.showSuccessToast($t('dashboard.contracts.actions.payment_released_success'));
			handleActionComplete();
		} catch (error) {
			console.error('Error accepting task:', error);
			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.payment_released_error');
			appStore.showErrorToast(errorMessage);
		} finally {
			setLoading('accept', false);
		}
	}

	// Dispute task (client only)
	async function disputeTask() {
		if (!contract.canDispute) return;

		setLoading('dispute', true);
		try {
			// Call RSK escrow disputeTask
			const result = await escrow.disputeTask(contract.contract.escrowId);

			// Publish status update to Nostr
			await publishContractStatus({
				contractEventId: contract.contractEvent.id,
				escrowId: contract.contract.escrowId,
				action: 'dispute-raised',
				message: $t('dashboard.contracts.actions.dispute_raised_message'),
				transactionHash: result.hash
			});

			appStore.showSuccessToast($t('dashboard.contracts.actions.dispute_raised_success'));
			handleActionComplete();
		} catch (error) {
			console.error('Error disputing task:', error);
			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.dispute_raised_error');
			appStore.showErrorToast(errorMessage);
		} finally {
			setLoading('dispute', false);
		}
	}

	// Propose resolution
	async function proposeResolution() {
		if (!contract.canPropose) return;
		if (!proposedClientAmountUSD || !proposedFreelancerAmountUSD) {
			appStore.showErrorToast($t('dashboard.contracts.actions.resolution_amounts_required'));
			return;
		}

		// Convert USD amounts to RBTC for validation and contract call
		const clientAmountUSD = parseFloat(proposedClientAmountUSD);
		const freelancerAmountUSD = parseFloat(proposedFreelancerAmountUSD);
		const totalAmountRBTC = parseFloat(contract.contract.amount);
		const totalAmountUSD = totalAmountRBTC * btcPrice;

		// Validate that USD amounts add up to total
		if (Math.abs(clientAmountUSD + freelancerAmountUSD - totalAmountUSD) > 0.01) {
			appStore.showErrorToast($t('dashboard.contracts.actions.resolution_amounts_invalid'));
			return;
		}

		// Convert USD amounts to RBTC for contract call
		const freelancerAmountRBTC = (freelancerAmountUSD / btcPrice).toFixed(8);
		const clientAmountRBTC = (clientAmountUSD / btcPrice).toFixed(8);

		setLoading('propose', true);
		try {
			// Call RSK escrow proposeResolution with RBTC amount as string
			const result = await escrow.proposeResolution(
				contract.contract.escrowId,
				freelancerAmountRBTC
			);

			// Publish status update to Nostr
			await publishContractStatus({
				contractEventId: contract.contractEvent.id,
				escrowId: contract.contract.escrowId,
				action: 'resolution-proposed',
				message: $t('dashboard.contracts.actions.resolution_proposed_message'),
				transactionHash: result.hash,
				proposedClientAmount: clientAmountRBTC,
				proposedFreelancerAmount: freelancerAmountRBTC
			});

			appStore.showSuccessToast($t('dashboard.contracts.actions.resolution_proposed_success'));
			showResolutionForm = false;
			proposedClientAmountUSD = '';
			proposedFreelancerAmountUSD = '';
			handleActionComplete();
		} catch (error) {
			console.error('Error proposing resolution:', error);
			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.resolution_proposed_error');
			appStore.showErrorToast(errorMessage);
		} finally {
			setLoading('propose', false);
		}
	}

	// Accept proposal
	async function acceptProposal() {
		if (!contract.canAcceptProposal) return;

		setLoading('acceptProposal', true);
		try {
			// Call RSK escrow acceptProposal
			const result = await escrow.acceptProposal(contract.contract.escrowId);

			// Publish status update to Nostr
			await publishContractStatus({
				contractEventId: contract.contractEvent.id,
				escrowId: contract.contract.escrowId,
				action: 'proposal-accepted',
				message: $t('dashboard.contracts.actions.proposal_accepted_message'),
				transactionHash: result.hash
			});

			appStore.showSuccessToast($t('dashboard.contracts.actions.proposal_accepted_success'));
			handleActionComplete();
		} catch (error) {
			console.error('Error accepting proposal:', error);
			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.proposal_accepted_error');
			appStore.showErrorToast(errorMessage);
		} finally {
			setLoading('acceptProposal', false);
		}
	}

	// Cancel escrow
	async function cancelEscrow() {
		if (!contract.canCancel) return;

		setLoading('cancel', true);
		try {
			// Call RSK escrow cancelEscrow
			const result = await escrow.cancelEscrow(contract.contract.escrowId);

			// Publish status update to Nostr
			await publishContractStatus({
				contractEventId: contract.contractEvent.id,
				escrowId: contract.contract.escrowId,
				action: 'escrow-cancelled',
				message: $t('dashboard.contracts.actions.escrow_cancelled_message'),
				transactionHash: result.hash
			});

			appStore.showSuccessToast($t('dashboard.contracts.actions.escrow_cancelled_success'));
			handleActionComplete();
		} catch (error) {
			console.error('Error cancelling escrow:', error);
			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.escrow_cancelled_error');
			appStore.showErrorToast(errorMessage);
		} finally {
			setLoading('cancel', false);
		}
	}

	// Resolve after timelock
	async function resolveAfterTimelock() {
		if (!contract.canResolveTimelock) return;

		setLoading('resolveTimelock', true);
		try {
			// Call RSK escrow resolveAfterTimelock
			const result = await escrow.resolveAfterTimelock(contract.contract.escrowId);

			// Publish status update to Nostr
			await publishContractStatus({
				contractEventId: contract.contractEvent.id,
				escrowId: contract.contract.escrowId,
				action: 'timelock-resolved',
				message: $t('dashboard.contracts.actions.timelock_resolved_message'),
				transactionHash: result.hash
			});

			appStore.showSuccessToast($t('dashboard.contracts.actions.timelock_resolved_success'));
			handleActionComplete();
		} catch (error) {
			console.error('Error resolving timelock:', error);
			const errorMessage =
				error instanceof Error
					? getErrorMessage(error)
					: $t('dashboard.contracts.actions.timelock_resolved_error');
			appStore.showErrorToast(errorMessage);
		} finally {
			setLoading('resolveTimelock', false);
		}
	}

	// Fetch BTC price on mount using currency formatter utility
	$effect(() => {
		fetchBtcPrice();
	});

	async function fetchBtcPrice() {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Error fetching BTC price:', error);
		}
	}

	// Auto-calculate remaining amount in USD
	$effect(() => {
		if (proposedClientAmountUSD && contract.contract.amount && btcPrice > 0) {
			const clientAmountUSD = parseFloat(proposedClientAmountUSD) || 0;
			const totalAmountRBTC = parseFloat(contract.contract.amount);
			const totalAmountUSD = totalAmountRBTC * btcPrice;
			const remainingUSD = totalAmountUSD - clientAmountUSD;
			if (remainingUSD >= 0) {
				proposedFreelancerAmountUSD = remainingUSD.toFixed(2);
			}
		}
	});

	// Load current proposal when canAcceptProposal is true
	$effect(() => {
		if (contract.canAcceptProposal) {
			loadCurrentProposal();
		}
	});

	async function loadCurrentProposal() {
		try {
			const proposal = await escrow.getDisputeProposal(contract.contract.escrowId);
			if (proposal) {
				currentProposal = {
					clientAmount: proposal.clientAmount,
					freelancerAmount: proposal.freelancerAmount,
					proposer: proposal.proposer
				};
			}
		} catch (error) {
			console.error('Failed to load current proposal:', error);
		}
	}
</script>

<div class={containerClass}>
	<!-- Complete Task (Freelancer) -->
	{#if contract.canComplete}
		<button
			class="btn btn-success btn-sm {isInline ? 'w-full sm:w-fit' : 'w-full'}"
			onclick={completeTask}
			disabled={isLoading.complete}
		>
			{#if isLoading.complete}
				<span class="loading loading-spinner loading-xs"></span>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			{/if}
			{$t('dashboard.contracts.actions.complete_task')}
		</button>
	{/if}

	<!-- Accept Task (Client) -->
	{#if contract.canAccept}
		<button
			class="btn btn-success btn-sm {isInline ? 'w-full sm:w-fit' : 'w-full'}"
			onclick={acceptTask}
			disabled={isLoading.accept}
		>
			{#if isLoading.accept}
				<span class="loading loading-spinner loading-xs"></span>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			{/if}
			{$t('dashboard.contracts.actions.accept_work')}
		</button>
	{/if}

	<!-- Dispute Task (Client) -->
	{#if contract.canDispute}
		<button
			class="btn btn-error btn-sm {isInline ? 'w-full sm:w-fit' : 'w-full'}"
			onclick={disputeTask}
			disabled={isLoading.dispute}
		>
			{#if isLoading.dispute}
				<span class="loading loading-spinner loading-xs"></span>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z"
					/>
				</svg>
			{/if}
			{$t('dashboard.contracts.actions.dispute_work')}
		</button>
	{/if}

	<!-- Propose Resolution -->
	{#if contract.canPropose}
		{#if !showResolutionForm}
			<button
				class="btn btn-warning btn-sm text-black {isInline ? 'w-full sm:w-fit' : 'w-full'}"
				onclick={() => {
					showResolutionForm = true;
					openDrawer();
				}}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 5H7a2 2 0 00-2 2v6a2 2 0 002 2h2m0 0h2m-2 0v4l3-3-3-3m2-5a2 2 0 012-2h2a2 2 0 012 2v6a2 2 0 01-2 2h-2m0 0v4l-3-3 3-3"
					/>
				</svg>
				{$t('dashboard.contracts.actions.propose_resolution')}
			</button>
		{:else if !isInline}
			<div class="bg-base-300 space-y-3 rounded-lg p-3 col-span-2 w-full">
				<h5 class="text-sm font-medium">
					{$t('dashboard.contracts.actions.resolution_form_title')}
				</h5>

				<div class="flex flex-col gap-2 space-y-3 sm:flex-row w-full">
					<div class="w-full">
						<label for="client amount" class="label label-text text-xs">
							{contract.isClient
								? $t('dashboard.contracts.actions.your_amount')
								: $t('dashboard.contracts.actions.client_amount')}
						</label>
						<div class="flex gap-2">
							<div class="relative flex-1">
								<span class="text-base-content/70 absolute top-1/2 left-3 z-9 -translate-y-1/2"
									>$</span
								>
								<input
									type="number"
									step="0.01"
									bind:value={proposedClientAmountUSD}
									class="input input-bordered w-full pl-7"
									placeholder="0.00"
								/>
							</div>
							<div class="text-base-content/60 flex items-center text-xs">
								({Math.round(
									((parseFloat(proposedClientAmountUSD) || 0) / btcPrice) * 100_000_000
								).toLocaleString()} Sats)
							</div>
						</div>
					</div>

					<div class="w-full">
						<label for="freelancer amount" class="label label-text text-xs">
							{contract.isClient
								? $t('dashboard.contracts.actions.freelancer_amount')
								: $t('dashboard.contracts.actions.your_amount')}
						</label>
						<div class="flex gap-2">
							<div class="relative flex-1">
								<span class="text-base-content/70 absolute top-1/2 left-3 z-9 -translate-y-1/2"
									>$</span
								>
								<input
									type="number"
									step="0.01"
									bind:value={proposedFreelancerAmountUSD}
									class="input input-bordered w-full pl-7"
									placeholder="0.00"
								/>
							</div>
							<div class="text-base-content/60 flex items-center text-xs">
								({Math.round(
									((parseFloat(proposedFreelancerAmountUSD) || 0) / btcPrice) * 100_000_000
								).toLocaleString()} Sats)
							</div>
						</div>
					</div>
				</div>

				<div class="text-base-content/60 text-xs">
					{$t('dashboard.contracts.actions.total_amount')}: ${(
						parseFloat(contract.contract.amount) * btcPrice
					).toFixed(2)} ({Math.round(
						parseFloat(contract.contract.amount) * 100_000_000
					).toLocaleString()} Sats)
				</div>

				<div class="flex flex-row-reverse place-self-end gap-2">
					<button
						class="btn btn-warning btn-sm text-black"
						onclick={proposeResolution}
						disabled={isLoading.propose}
					>
						{#if isLoading.propose}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
							{$t('dashboard.contracts.actions.propose')}
						{/if}
					</button>
					<button class="btn btn-ghost btn-outline btn-sm" onclick={() => (showResolutionForm = false)}>
						{$t('dashboard.contracts.actions.cancel')}
					</button>
				</div>
			</div>
		{/if}
	{/if}

	<!-- Accept Proposal -->
	{#if !isInline && contract.canAcceptProposal}
		<div class="bg-base-300 space-y-3 rounded-lg p-3">
			<h5 class="text-sm font-medium">
				{$t('dashboard.contracts.actions.current_proposal')}
			</h5>

			{#if currentProposal}
				<div class="flex flex-col gap-2 space-y-2 text-xs sm:flex-row">
					<div>
						<span class="text-base-content/70">
							{contract.isClient
								? $t('dashboard.contracts.actions.your_amount')
								: $t('dashboard.contracts.actions.client_amount')}:
						</span>
						<div class="font-semibold">
							${(parseFloat(currentProposal.clientAmount) * btcPrice).toFixed(2)}
							({Math.round(parseFloat(currentProposal.clientAmount) * 100_000_000).toLocaleString()}
							Sats)
						</div>
					</div>
					<div>
						<span class="text-base-content/70">
							{contract.isClient
								? $t('dashboard.contracts.actions.freelancer_amount')
								: $t('dashboard.contracts.actions.your_amount')}:
						</span>
						<div class="font-semibold">
							${(parseFloat(currentProposal.freelancerAmount) * btcPrice).toFixed(2)}
							({Math.round(
								parseFloat(currentProposal.freelancerAmount) * 100_000_000
							).toLocaleString()} Sats)
						</div>
					</div>
				</div>

				<div class="text-base-content/60 text-xs">
					{$t('dashboard.contracts.actions.proposed_by')}: {currentProposal.proposer.slice(
						0,
						8
					)}...{currentProposal.proposer.slice(-6)}
				</div>
			{:else}
				<div class="text-base-content/60 text-xs">
					{$t('dashboard.contracts.actions.loading_proposal')}
				</div>
			{/if}

			<button
				class="btn btn-success btn-sm w-full"
				onclick={acceptProposal}
				disabled={isLoading.acceptProposal || !currentProposal}
			>
				{#if isLoading.acceptProposal}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M5 13l4 4L19 7"
						/>
					</svg>
				{/if}
				{$t('dashboard.contracts.actions.accept_proposal')}
			</button>
		</div>
	{/if}

	<!-- Cancel Escrow -->
	{#if contract.canCancel}
		<button
			class="btn btn-error btn-sm {isInline ? 'w-full sm:w-fit' : 'w-full'}"
			onclick={cancelEscrow}
			disabled={isLoading.cancel}
		>
			{#if isLoading.cancel}
				<span class="loading loading-spinner loading-xs"></span>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			{/if}
			{$t('dashboard.contracts.actions.cancel_contract')}
		</button>
	{/if}

	<!-- Resolve After Timelock -->
	{#if contract.canResolveTimelock}
		<div class="bg-base-300 space-y-3 rounded-lg p-3">
			{#if !isInline}
				<h5 class="text-sm font-medium">
					{$t('dashboard.contracts.actions.timelock_resolution')}
				</h5>

				<div class="text-base-content/60 text-xs">
					{$t('dashboard.contracts.actions.timelock_expired_message')}
				</div>
			{/if}

			<button
				class="btn btn-info btn-sm {isInline ? 'w-full sm:w-fit' : 'w-full'}"
				onclick={resolveAfterTimelock}
				disabled={isLoading.resolveTimelock}
			>
				{#if isLoading.resolveTimelock}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
				{/if}
				{$t('dashboard.contracts.actions.resolve_timelock')}
			</button>
		</div>
	{/if}
</div>
