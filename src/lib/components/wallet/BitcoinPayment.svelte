<script lang="ts">
	import type { PaymentResult } from '$lib/types/wallet';
	import { walletStore } from '$lib/stores/wallet';
	import { formatSats } from '$lib/utils/formatBTC';

	const props = $props<{
		amount: number;
		description: string;
		recipient: string;
		onPaymentComplete: (tx: PaymentResult) => void;
	}>();

	let balance = $state(0);
	let loading = $state(false);
	let error = $state('');

	$effect(() => {
		if ($walletStore) {
			balance = $walletStore.balance;
		}
	});

	async function handlePayment() {
		if (!props.amount || props.amount <= 0) {
			error = 'Please enter a valid amount';
			return;
		}

		if (props.amount > balance) {
			error = 'Insufficient balance';
			return;
		}

		loading = true;
		error = '';

		try {
			// Here we'll integrate with the actual payment processing
			const paymentResult = await processPayment({
				amount: props.amount,
				description: props.description,
				recipient: props.recipient
			});

			props.onPaymentComplete(paymentResult);
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : 'Payment failed';
		} finally {
			loading = false;
		}
	}

	async function processPayment(params: {
		amount: number;
		description: string;
		recipient: string;
	}): Promise<PaymentResult> {
		// This is a placeholder for the actual payment processing logic
		// You'll need to implement the actual payment processing here
		return {
			success: true,
			txId: 'sample-tx-id',
			amount: params.amount,
			timestamp: Date.now()
		};
	}
</script>

<div class="bitcoin-payment-container">
	<div class="balance-display">
		<h3>Available Balance</h3>
		<p class="balance">{formatSats(balance)} sats</p>
	</div>

	<div class="payment-form">
		<div class="form-group">
			<label for="amount">Amount (sats)</label>
			<input
				type="number"
				id="amount"
				bind:value={props.amount}
				placeholder="Enter amount in sats"
				min="1"
			/>
		</div>

		<div class="form-group">
			<label for="description">Description (optional)</label>
			<input
				type="text"
				id="description"
				bind:value={props.description}
				placeholder="Payment description"
			/>
		</div>

		{#if error}
			<div class="error-message">{error}</div>
		{/if}

		<button
			onclick={handlePayment}
			disabled={loading || props.amount <= 0 || props.amount > balance}
			class="payment-button"
		>
			{loading ? 'Processing...' : 'Pay with Bitcoin'}
		</button>
	</div>
</div>

<style>
	.bitcoin-payment-container {
		padding: 1.5rem;
		border-radius: 8px;
		background: var(--surface-2);
		max-width: 500px;
		margin: 0 auto;
	}

	.balance-display {
		text-align: center;
		margin-bottom: 2rem;
	}

	.balance {
		font-size: 2rem;
		font-weight: bold;
		color: var(--primary);
	}

	.payment-form {
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

	.payment-button {
		padding: 0.75rem;
		background: var(--primary);
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-weight: 600;
		transition: opacity 0.2s;
	}

	.payment-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.payment-button:hover:not(:disabled) {
		opacity: 0.9;
	}
</style>
