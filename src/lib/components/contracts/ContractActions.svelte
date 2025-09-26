<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { ContractWithEvents } from '$lib/types/contract';
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
	let btcPrice = $state<number>(63000); // Default fallback price

	// Helper to set loading state
	function setLoading(action: string, loading: boolean) {
		isLoading = { ...isLoading, [action]: loading };
	}

	// Complete task (freelancer only)
	async function completeTask() {
		if (!contract.canComplete) return;

		setLoading('complete', true);
		try {
			// Call RSK escrow completeTask with contract event ID for proper nostr event publishing
			await escrow.completeTask(contract.contract.escrowId, contract.contractEvent.id);
			onActionComplete?.();
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
			// Call RSK escrow acceptTask with contract event ID for proper nostr event publishing
			await escrow.acceptTask(contract.contract.escrowId, contract.contractEvent.id);
			onActionComplete?.();
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
			// Call RSK escrow disputeTask with contract event ID for proper nostr event publishing
			await escrow.disputeTask(contract.contract.escrowId, contract.contractEvent.id);
			onActionComplete?.();
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
		if (!proposedFreelancerAmountUSD) {
			appStore.showErrorToast($t('dashboard.contracts.actions.resolution_amounts_required'));
			return;
		}

		// Convert USD amounts to RBTC for validation and contract call
		const freelancerAmountUSD = parseFloat(proposedFreelancerAmountUSD);
		const totalAmountRBTC = parseFloat(contract.contract.amount);
		const totalAmountUSD = totalAmountRBTC * btcPrice;

		// Validate that freelancer amount is not greater than total
		if (freelancerAmountUSD > totalAmountUSD) {
			appStore.showErrorToast($t('dashboard.contracts.actions.resolution_amounts_invalid'));
			return;
		}

		// Convert USD amounts to RBTC for contract call
		const freelancerAmountRBTC = (freelancerAmountUSD / btcPrice).toFixed(8);
		const clientAmountUSD = totalAmountUSD - freelancerAmountUSD;
		const clientAmountRBTC = (clientAmountUSD / btcPrice).toFixed(8);

		setLoading('propose', true);
		try {
			// Call RSK escrow proposeResolution with contract event ID and amounts for proper nostr event publishing
			await escrow.proposeResolution(
				contract.contract.escrowId,
				freelancerAmountRBTC,
				contract.contractEvent.id,
				clientAmountRBTC,
				freelancerAmountRBTC
			);

			showResolutionForm = false;
			proposedClientAmountUSD = '';
			proposedFreelancerAmountUSD = '';
			onActionComplete?.();
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
			// Call RSK escrow acceptProposal with contract event ID for proper nostr event publishing
			await escrow.acceptProposal(contract.contract.escrowId, contract.contractEvent.id);
			onActionComplete?.();
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
			// Call RSK escrow cancelEscrow with contract event ID for proper nostr event publishing
			await escrow.cancelEscrow(contract.contract.escrowId, contract.contractEvent.id);
			onActionComplete?.();
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
			// Call RSK escrow resolveAfterTimelock with contract event ID for proper nostr event publishing
			await escrow.resolveAfterTimelock(contract.contract.escrowId, contract.contractEvent.id);
			onActionComplete?.();
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

	// Auto-calculate client amount from freelancer amount in USD
	$effect(() => {
		if (proposedFreelancerAmountUSD && contract.contract.amount && btcPrice > 0) {
			const freelancerAmountUSD = parseFloat(proposedFreelancerAmountUSD) || 0;
			const totalAmountRBTC = parseFloat(contract.contract.amount);
			const totalAmountUSD = totalAmountRBTC * btcPrice;
			const clientAmountUSD = totalAmountUSD - freelancerAmountUSD;
			if (clientAmountUSD >= 0) {
				proposedClientAmountUSD = clientAmountUSD.toFixed(2);
			}
		}
	});
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
			<div class="bg-base-300 col-span-2 w-full space-y-3 rounded-lg p-3">
				<h5 class="text-sm font-medium">
					{$t('dashboard.contracts.actions.resolution_form_title')}
				</h5>

				<div class="flex w-full flex-col gap-2 space-y-3 sm:flex-row">
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

					<div class="w-full">
						<label for="client amount" class="label label-text text-xs">
							{contract.isClient
								? $t('dashboard.contracts.actions.your_amount')
								: $t('dashboard.contracts.actions.client_amount')} (Auto-calculated)
						</label>
						<div class="flex gap-2">
							<div class="relative flex-1">
								<span class="text-base-content/70 absolute top-1/2 left-3 z-9 -translate-y-1/2"
									>$</span
								>
								<input
									type="text"
									value={proposedClientAmountUSD}
									class="input input-bordered bg-base-200 w-full pl-7"
									placeholder="0.00"
									readonly
								/>
							</div>
							<div class="text-base-content/60 flex items-center text-xs">
								({Math.round(
									((parseFloat(proposedClientAmountUSD) || 0) / btcPrice) * 100_000_000
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

				<div class="flex flex-row-reverse gap-2 place-self-end">
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
					<button
						class="btn btn-ghost btn-outline btn-sm"
						onclick={() => (showResolutionForm = false)}
					>
						{$t('dashboard.contracts.actions.cancel')}
					</button>
				</div>
			</div>
		{/if}
	{/if}

	<!-- Accept Proposal -->
	{#if !isInline && contract.canAcceptProposal}
		<div class="bg-base-300 w-full space-y-3 rounded-lg p-3">
			<h5 class="text-sm font-medium">
				{$t('dashboard.contracts.actions.current_proposal')}
			</h5>

			{#if contract.contract.disputeProposal}
				<div class="flex flex-col gap-2 space-y-2 text-xs sm:flex-row">
					<div class="w-full">
						<span class="text-base-content/70">
							{contract.isClient
								? $t('dashboard.contracts.actions.your_amount')
								: $t('dashboard.contracts.actions.client_amount')}:
						</span>
						<div class="font-semibold">
							${(parseFloat(contract.contract.disputeProposal.clientAmount) * btcPrice).toFixed(2)}
							({Math.round(
								parseFloat(contract.contract.disputeProposal.clientAmount) * 100_000_000
							).toLocaleString()}
							Sats)
						</div>
					</div>
					<div class="w-full">
						<span class="text-base-content/70">
							{contract.isClient
								? $t('dashboard.contracts.actions.freelancer_amount')
								: $t('dashboard.contracts.actions.your_amount')}:
						</span>
						<div class="font-semibold">
							${(parseFloat(contract.contract.disputeProposal.freelancerAmount) * btcPrice).toFixed(
								2
							)}
							({Math.round(
								parseFloat(contract.contract.disputeProposal.freelancerAmount) * 100_000_000
							).toLocaleString()} Sats)
						</div>
					</div>
				</div>

				<div class="text-base-content/60 text-xs">
					{$t('dashboard.contracts.actions.proposed_by')}:
					{contract.contract.disputeProposal.proposer.slice(0, 8)}
					...
					{contract.contract.disputeProposal.proposer.slice(-6)}
				</div>
			{:else}
				<div class="text-base-content/60 text-xs">
					{$t('dashboard.contracts.actions.loading_proposal')}
				</div>
			{/if}

			<button
				class="btn btn-success btn-sm w-full"
				onclick={acceptProposal}
				disabled={isLoading.acceptProposal || !contract.contract.disputeProposal}
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
