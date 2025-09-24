<script lang="ts">
	import { t } from 'svelte-i18n';
	import type { ContractWithEvents } from '$lib/types/contract';
	import { publishContractStatus, updateContractStatus } from '$lib/utils/nostr-bid';
	import { escrow } from '$lib/utils/wallet/escrow';
	import { appStore } from '$lib/stores/app.store';

	const { contract, onActionComplete } = $props<{
		contract: ContractWithEvents;
		onActionComplete?: () => void;
	}>();

	// State for actions
	let isLoading = $state<Record<string, boolean>>({});
	let showResolutionForm = $state(false);
	let proposedClientAmount = $state('');
	let proposedFreelancerAmount = $state('');

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

			// Update contract status
			await updateContractStatus(contract.contract.escrowId, 'completed');

			appStore.showSuccessToast($t('dashboard.contracts.actions.task_completed_success'));
			handleActionComplete();
		} catch (error) {
			console.error('Error completing task:', error);
			appStore.showErrorToast(
				error instanceof Error
					? error.message
					: $t('dashboard.contracts.actions.task_completed_error')
			);
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

			// Update contract status
			await updateContractStatus(contract.contract.escrowId, 'resolved');

			appStore.showSuccessToast($t('dashboard.contracts.actions.payment_released_success'));
			handleActionComplete();
		} catch (error) {
			console.error('Error accepting task:', error);
			appStore.showErrorToast(
				error instanceof Error
					? error.message
					: $t('dashboard.contracts.actions.payment_released_error')
			);
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

			// Update contract status
			await updateContractStatus(contract.contract.escrowId, 'disputed');

			appStore.showSuccessToast($t('dashboard.contracts.actions.dispute_raised_success'));
			handleActionComplete();
		} catch (error) {
			console.error('Error disputing task:', error);
			appStore.showErrorToast(
				error instanceof Error
					? error.message
					: $t('dashboard.contracts.actions.dispute_raised_error')
			);
		} finally {
			setLoading('dispute', false);
		}
	}

	// Propose resolution
	async function proposeResolution() {
		if (!contract.canPropose) return;
		if (!proposedClientAmount || !proposedFreelancerAmount) {
			appStore.showErrorToast($t('dashboard.contracts.actions.resolution_amounts_required'));
			return;
		}

		// Validate amounts
		const clientAmount = parseFloat(proposedClientAmount);
		const freelancerAmount = parseFloat(proposedFreelancerAmount);
		const totalAmount = parseFloat(contract.contract.amount);

		if (Math.abs(clientAmount + freelancerAmount - totalAmount) > 0.0001) {
			appStore.showErrorToast($t('dashboard.contracts.actions.resolution_amounts_invalid'));
			return;
		}

		setLoading('propose', true);
		try {
			// Call RSK escrow proposeResolution
			const result = await escrow.proposeResolution(
				contract.contract.escrowId,
				proposedFreelancerAmount
			);

			// Publish status update to Nostr
			await publishContractStatus({
				contractEventId: contract.contractEvent.id,
				escrowId: contract.contract.escrowId,
				action: 'resolution-proposed',
				message: $t('dashboard.contracts.actions.resolution_proposed_message'),
				transactionHash: result.hash,
				proposedClientAmount,
				proposedFreelancerAmount
			});

			appStore.showSuccessToast($t('dashboard.contracts.actions.resolution_proposed_success'));
			showResolutionForm = false;
			proposedClientAmount = '';
			proposedFreelancerAmount = '';
			handleActionComplete();
		} catch (error) {
			console.error('Error proposing resolution:', error);
			appStore.showErrorToast(
				error instanceof Error
					? error.message
					: $t('dashboard.contracts.actions.resolution_proposed_error')
			);
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

			// Update contract status
			await updateContractStatus(contract.contract.escrowId, 'resolved');

			appStore.showSuccessToast($t('dashboard.contracts.actions.proposal_accepted_success'));
			handleActionComplete();
		} catch (error) {
			console.error('Error accepting proposal:', error);
			appStore.showErrorToast(
				error instanceof Error
					? error.message
					: $t('dashboard.contracts.actions.proposal_accepted_error')
			);
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

			// Update contract status
			await updateContractStatus(contract.contract.escrowId, 'cancelled');

			appStore.showSuccessToast($t('dashboard.contracts.actions.escrow_cancelled_success'));
			handleActionComplete();
		} catch (error) {
			console.error('Error cancelling escrow:', error);
			appStore.showErrorToast(
				error instanceof Error
					? error.message
					: $t('dashboard.contracts.actions.escrow_cancelled_error')
			);
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

			// Update contract status
			await updateContractStatus(contract.contract.escrowId, 'resolved');

			appStore.showSuccessToast($t('dashboard.contracts.actions.timelock_resolved_success'));
			handleActionComplete();
		} catch (error) {
			console.error('Error resolving timelock:', error);
			appStore.showErrorToast(
				error instanceof Error
					? error.message
					: $t('dashboard.contracts.actions.timelock_resolved_error')
			);
		} finally {
			setLoading('resolveTimelock', false);
		}
	}

	// Auto-calculate remaining amount
	$effect(() => {
		if (proposedClientAmount && contract.contract.amount) {
			const clientAmount = parseFloat(proposedClientAmount) || 0;
			const totalAmount = parseFloat(contract.contract.amount);
			const remaining = totalAmount - clientAmount;
			if (remaining >= 0) {
				proposedFreelancerAmount = remaining.toFixed(4);
			}
		}
	});
</script>

<div class="card bg-base-200">
	<div class="card-body p-4">
		<h4 class="mb-3 font-semibold">{$t('dashboard.contracts.available_actions')}</h4>

		<!-- No actions available -->
		{#if !contract.canComplete && !contract.canAccept && !contract.canDispute && !contract.canPropose && !contract.canAcceptProposal && !contract.canCancel && !contract.canResolveTimelock}
			<div class="text-base-content/60 py-4 text-center">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="mx-auto mb-2 h-8 w-8 opacity-50"
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
				<p class="text-sm">{$t('dashboard.contracts.no_actions_available')}</p>
			</div>
		{/if}

		<div class="space-y-3">
			<!-- Complete Task (Freelancer) -->
			{#if contract.canComplete}
				<button
					class="btn btn-success btn-sm w-full"
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
					class="btn btn-success btn-sm w-full"
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
					class="btn btn-error btn-sm w-full"
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
					<button class="btn btn-warning btn-sm w-full" onclick={() => (showResolutionForm = true)}>
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
				{:else}
					<div class="bg-base-300 space-y-3 rounded-lg p-3">
						<h5 class="text-sm font-medium">
							{$t('dashboard.contracts.actions.resolution_form_title')}
						</h5>

						<div class="grid grid-cols-2 gap-2">
							<div>
								<label for="client amount" class="label label-text text-xs"
									>{$t('dashboard.contracts.actions.client_amount')}</label
								>
								<input
									type="number"
									step="0.0001"
									max={contract.contract.amount}
									bind:value={proposedClientAmount}
									class="input input-bordered input-xs w-full"
									placeholder="0.0000"
								/>
							</div>
							<div>
								<label for="freelancer amount" class="label label-text text-xs"
									>{$t('dashboard.contracts.actions.freelancer_amount')}</label
								>
								<input
									type="number"
									step="0.0001"
									max={contract.contract.amount}
									bind:value={proposedFreelancerAmount}
									class="input input-bordered input-xs w-full"
									placeholder="0.0000"
								/>
							</div>
						</div>

						<div class="text-base-content/60 text-xs">
							{$t('dashboard.contracts.actions.total_amount')}: {contract.contract.amount} RBTC
						</div>

						<div class="flex gap-2">
							<button
								class="btn btn-warning btn-xs flex-1"
								onclick={proposeResolution}
								disabled={isLoading.propose}
							>
								{#if isLoading.propose}
									<span class="loading loading-spinner loading-xs"></span>
								{:else}
									{$t('dashboard.contracts.actions.propose')}
								{/if}
							</button>
							<button class="btn btn-ghost btn-xs" onclick={() => (showResolutionForm = false)}>
								{$t('dashboard.contracts.actions.cancel')}
							</button>
						</div>
					</div>
				{/if}
			{/if}

			<!-- Accept Proposal -->
			{#if contract.canAcceptProposal}
				<button
					class="btn btn-success btn-sm w-full"
					onclick={acceptProposal}
					disabled={isLoading.acceptProposal}
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
			{/if}

			<!-- Cancel Escrow -->
			{#if contract.canCancel}
				<button
					class="btn btn-error btn-sm w-full"
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
				<button
					class="btn btn-info btn-sm w-full"
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
			{/if}
		</div>
	</div>
</div>
