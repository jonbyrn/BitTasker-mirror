<script lang="ts">
	import type { AssetDetails } from '$lib/types/wallet';
	import { walletStore } from '$lib/stores/wallet';
	import { formatSats } from '$lib/utils/formatBTC';

	const props = $props<{
		assetId: string;
		amount: number;
		description: string;
		onLiquidEscrowCreated: (tx: AssetDetails) => void;
	}>();

	let loading = $state(false);
	let error = $state('');
	let assetBalance = $state(0);
	let assetDetails = $state<AssetDetails | null>(null);

	$effect(() => {
		if ($walletStore) {
			updateAssetInfo();
		}
	});

	async function updateAssetInfo() {
		try {
			// Fetch asset details from Liquid network
			assetDetails = await fetchAssetDetails(props.assetId);
			assetBalance = await fetchAssetBalance(props.assetId);
		} catch (e) {
			error = 'Failed to fetch asset information';
		}
	}

	async function createLiquidEscrow() {
		if (!props.amount || props.amount <= 0) {
			error = 'Please enter a valid amount';
			return;
		}

		if (props.amount > assetBalance) {
			error = 'Insufficient asset balance';
			return;
		}

		loading = true;
		error = '';

		try {
			// Create Liquid asset escrow
			const escrowTx = await createLiquidAssetEscrow({
				assetId: props.assetId,
				amount: props.amount,
				description: props.description
			});

			props.onLiquidEscrowCreated({
				txId: escrowTx.id,
				assetId: props.assetId,
				amount: props.amount
			});
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : 'Failed to create Liquid asset escrow';
		} finally {
			loading = false;
		}
	}

	// Placeholder functions for Liquid network interaction
	async function fetchAssetDetails(assetId: string): Promise<AssetDetails> {
		// Implement actual asset details fetching
		return {
			name: 'Sample Asset',
			ticker: 'SMPL',
			precision: 8,
			domain: 'liquid.network'
		};
	}

	async function fetchAssetBalance(assetId: string): Promise<number> {
		// Implement actual balance fetching
		return 1000000;
	}

	async function createLiquidAssetEscrow(params: {
		assetId: string;
		amount: number;
		description: string;
	}): Promise<{ id: string }> {
		// Implement actual Liquid escrow creation
		return { id: 'liquid-tx-id' };
	}
</script>

<div class="liquid-asset-container">
	<div class="asset-header">
		<h2>Liquid Asset Management</h2>
		{#if assetDetails}
			<div class="asset-info">
				<span class="asset-name">{assetDetails.name}</span>
				<span class="asset-ticker">({assetDetails.ticker})</span>
			</div>
		{/if}
	</div>

	<div class="asset-balance">
		<h3>Available Balance</h3>
		<p class="balance">{formatSats(assetBalance)} {assetDetails?.ticker || 'units'}</p>
	</div>

	<div class="escrow-form">
		<div class="form-group">
			<label for="amount">Amount</label>
			<input
				type="number"
				id="amount"
				bind:value={props.amount}
				placeholder="Enter amount"
				min="1"
			/>
		</div>

		<div class="form-group">
			<label for="description">Description</label>
			<input
				type="text"
				id="description"
				bind:value={props.description}
				placeholder="Escrow description"
			/>
		</div>

		{#if error}
			<div class="error-message">{error}</div>
		{/if}

		<button
			onclick={createLiquidEscrow}
			disabled={loading || !props.amount || props.amount <= 0 || props.amount > assetBalance}
			class="create-button"
		>
			{loading ? 'Creating...' : 'Create Liquid Escrow'}
		</button>
	</div>
</div>

<style>
	.liquid-asset-container {
		padding: 1.5rem;
		border-radius: 8px;
		background: var(--surface-2);
		max-width: 500px;
		margin: 0 auto;
	}

	.asset-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.asset-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.asset-name {
		font-weight: 600;
	}

	.asset-ticker {
		color: var(--text-2);
		font-size: 0.875rem;
	}

	.asset-balance {
		text-align: center;
		margin-bottom: 2rem;
	}

	.balance {
		font-size: 2rem;
		font-weight: bold;
		color: var(--primary);
	}

	.escrow-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	input {
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 4px;
		background: var(--surface-1);
		color: var(--text);
	}

	.error-message {
		color: var(--error);
		font-size: 0.875rem;
	}

	.create-button {
		padding: 0.75rem;
		background: var(--primary);
		color: white;
		border: none;
		border-radius: 4px;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s;
	}

	.create-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.create-button:hover:not(:disabled) {
		opacity: 0.9;
	}
</style>
