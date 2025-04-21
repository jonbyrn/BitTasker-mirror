<script lang="ts">
	import type { EscrowTransaction } from '$lib/types/wallet';
	import { walletStore } from '$lib/stores/wallet';
	import { formatSats } from '$lib/utils/formatBTC';

	const props = $props<{
		amount: number;
		description: string;
		recipient: string;
		timeLockDuration: number; // in blocks
		requiredSignatures: number;
		onEscrowCreated: (tx: EscrowTransaction) => void;
		onEscrowReleased: (tx: EscrowTransaction) => void;
		onEscrowDisputed: (tx: EscrowTransaction) => void;
	}>();

	let loading = $state(false);
	let error = $state('');
	let escrowStatus = $state<'pending' | 'active' | 'completed' | 'disputed'>('pending');
	let timeRemaining = $state(0);
	let signatures = $state<string[]>([]);

	$effect(() => {
		if ($walletStore) {
			updateEscrowStatus();
		}
	});

	async function createEscrow() {
		if (!props.amount || props.amount <= 0) {
			error = 'Please enter a valid amount';
			return;
		}

		loading = true;
		error = '';

		try {
			// Create multi-signature address
			const multiSigAddress = await createMultiSigAddress({
				requiredSignatures: props.requiredSignatures,
				participants: [props.recipient, $walletStore.address]
			});

			// Create time-locked transaction
			const escrowTx = await createTimeLockedTransaction({
				amount: props.amount,
				multiSigAddress,
				timeLockDuration: props.timeLockDuration
			});

			props.onEscrowCreated({
				address: multiSigAddress,
				txId: escrowTx.id,
				amount: props.amount,
				timeLockDuration: props.timeLockDuration
			});

			escrowStatus = 'active';
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : 'Failed to create escrow';
		} finally {
			loading = false;
		}
	}

	async function releaseEscrow() {
		if (escrowStatus !== 'active') return;

		loading = true;
		error = '';

		try {
			const releaseTx = await releaseTimeLockedTransaction();
			props.onEscrowReleased(releaseTx);
			escrowStatus = 'completed';
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : 'Failed to release escrow';
		} finally {
			loading = false;
		}
	}

	async function disputeEscrow() {
		if (escrowStatus !== 'active') return;

		loading = true;
		error = '';

		try {
			const disputeTx = await initiateDispute();
			props.onEscrowDisputed(disputeTx);
			escrowStatus = 'disputed';
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : 'Failed to initiate dispute';
		} finally {
			loading = false;
		}
	}

	function updateEscrowStatus() {
		// Update escrow status based on blockchain state
		// This is a placeholder for actual blockchain interaction
	}

	// Placeholder functions for blockchain interaction
	async function createMultiSigAddress(params: {
		requiredSignatures: number;
		participants: string[];
	}): Promise<string> {
		// Implement actual multi-sig address creation
		return 'multi-sig-address';
	}

	async function createTimeLockedTransaction(params: {
		amount: number;
		multiSigAddress: string;
		timeLockDuration: number;
	}): Promise<EscrowTransaction> {
		// Implement actual time-locked transaction creation
		return {
			id: 'tx-id',
			amount: params.amount,
			timestamp: Date.now()
		};
	}

	async function releaseTimeLockedTransaction(): Promise<EscrowTransaction> {
		// Implement actual release transaction
		return {
			id: 'release-tx-id',
			amount: props.amount,
			timestamp: Date.now()
		};
	}

	async function initiateDispute(): Promise<EscrowTransaction> {
		// Implement actual dispute initiation
		return {
			id: 'dispute-tx-id',
			amount: props.amount,
			timestamp: Date.now()
		};
	}
</script>

<div class="escrow-container">
	<div class="escrow-header">
		<h2>Escrow Contract</h2>
		<div class="status-badge {escrowStatus}">{escrowStatus}</div>
	</div>

	<div class="escrow-details">
		<div class="detail-row">
			<span>Amount:</span>
			<span class="amount">{formatSats(props.amount)} sats</span>
		</div>
		<div class="detail-row">
			<span>Recipient:</span>
			<span class="address">{props.recipient}</span>
		</div>
		<div class="detail-row">
			<span>Time Lock:</span>
			<span>{props.timeLockDuration} blocks</span>
		</div>
		<div class="detail-row">
			<span>Required Signatures:</span>
			<span>{props.requiredSignatures}</span>
		</div>
	</div>

	{#if error}
		<div class="error-message">{error}</div>
	{/if}

	<div class="action-buttons">
		{#if escrowStatus === 'pending'}
			<button onclick={createEscrow} disabled={loading} class="action-button create">
				{loading ? 'Creating...' : 'Create Escrow'}
			</button>
		{:else if escrowStatus === 'active'}
			<button onclick={releaseEscrow} disabled={loading} class="action-button release">
				{loading ? 'Releasing...' : 'Release Escrow'}
			</button>
			<button onclick={disputeEscrow} disabled={loading} class="action-button dispute">
				{loading ? 'Disputing...' : 'Dispute Escrow'}
			</button>
		{/if}
	</div>
</div>

<style>
	.escrow-container {
		padding: 1.5rem;
		border-radius: 8px;
		background: var(--surface-2);
		max-width: 600px;
		margin: 0 auto;
	}

	.escrow-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.status-badge {
		padding: 0.5rem 1rem;
		border-radius: 20px;
		font-size: 0.875rem;
		font-weight: 600;
	}

	.status-badge.pending {
		background: var(--warning);
	}
	.status-badge.active {
		background: var(--success);
	}
	.status-badge.completed {
		background: var(--primary);
	}
	.status-badge.disputed {
		background: var(--error);
	}

	.escrow-details {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.amount {
		font-weight: 600;
		color: var(--primary);
	}

	.address {
		font-family: monospace;
		font-size: 0.875rem;
	}

	.error-message {
		color: var(--error);
		margin-bottom: 1rem;
	}

	.action-buttons {
		display: flex;
		gap: 1rem;
	}

	.action-button {
		flex: 1;
		padding: 0.75rem;
		border: none;
		border-radius: 4px;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s;
	}

	.action-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.action-button.create {
		background: var(--primary);
		color: white;
	}

	.action-button.release {
		background: var(--success);
		color: white;
	}

	.action-button.dispute {
		background: var(--error);
		color: white;
	}
</style>
