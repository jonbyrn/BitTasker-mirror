<script lang="ts">
	import * as breezSdk from '@breeztech/breez-sdk-liquid/web';
	import { onMount } from 'svelte';

	import { fetchLightningLimits, receivePayment } from '$lib/wallet/breez/walletService';
	import { initWasm } from '$lib/wallet/breez/wasmLoader';
	import { prepareReceivePayment } from '$lib/wallet/breez/walletService';
	let amount = $state(0);
	let description = $state('');
	let tokenType = $state('BTC');
	let limits = $state({ min: 1, max: 21000000 * 100_000_000 });
	let isLoading = $state(false);
	let errorMessage = $state<string | null>(null);
	let feeSats = $state(0);
	let invoice = $state<string | null>(null);

	onMount(async () => {
		try {
			isLoading = true;
			await initWasm();
			const response = await fetchLightningLimits();
			limits = {
				min: response.receive.minSat,
				max: response.receive.maxSat
			};
			console.log('limits', response);
		} catch (error) {
			console.error('Error fetching lightning limits', error);
		} finally {
			isLoading = false;
		}
	});

	function convertBtcToSats(amount: number) {
		return Math.floor(amount * 100_000_000);
	}

	function validateInputs() {
		let amountSats = 0;

		if (tokenType === 'BTC') {
			amountSats = convertBtcToSats(amount);
		} else {
			amountSats = amount;
		}

		switch (true) {
			case isNaN(amountSats):
				errorMessage = 'Amount must be a valid number';
				return null;
			case amountSats < limits.min:
				errorMessage = `Amount must be at least ${(limits.min / 100_000_000).toFixed(8)} BTC`;
				return null;
			case amountSats > limits.max:
				errorMessage = `Amount must be no more than ${(limits.max / 100_000_000).toFixed(8)} BTC`;
				return null;
			default:
				errorMessage = null;
				return amountSats;
		}
	}

	async function generatePaymentRequest() {
		const amountSats = validateInputs();
		if (amountSats === null) {
			return;
		}

		errorMessage = null;
		isLoading = true;
		invoice = '';
		feeSats = 0;

		try {
			const prepareResponse = await prepareReceivePayment({
				paymentMethod: 'lightning',
				amount: {
					type: 'bitcoin',
					payerAmountSat: amountSats
				}
			});

			const receiveResponse = await receivePayment({
				prepareResponse,
				description
			});

			invoice = receiveResponse.destination;
			feeSats = prepareResponse.feesSat || 0;
			console.log('prepareResponse', prepareResponse);
			console.log('receiveResponse', receiveResponse);
			console.log('invoice', invoice);
			console.log('feeSats', feeSats);
		} catch (error) {
			console.error('Error generating payment request', error);
		} finally {
			isLoading = false;
		}
	}

	function copyToClipboard() {
		if (invoice) {
			navigator.clipboard.writeText(invoice);
		}
	}
</script>

<div class="card bg-base-200">
	<div class="card-body">
		{#if invoice === null}
			<h4 class="card-title text-base">Request Specific Amount</h4>

			<div class="form-control">
				<div class="label">
					<span class="label-text">Amount ({tokenType === 'BTC' ? 'BTC' : 'sats'})</span>
				</div>
				<div class="input-group">
					<input
						type="number"
						placeholder="0.00000000"
						class="input input-bordered w-full"
						bind:value={amount}
					/>
					<select class="select select-bordered" bind:value={tokenType}>
						<option value="BTC">BTC</option>
						<option value="sats">sats</option>
					</select>
				</div>
			</div>

			<div class="form-control mt-4">
				<div class="label">
					<span class="label-text">Description (optional)</span>
				</div>
				<input
					type="text"
					placeholder="What's this payment for?"
					class="input input-bordered w-full"
					bind:value={description}
				/>
			</div>

			<div class="mt-4">
				<button
					class="btn btn-primary btn-block"
					onclick={generatePaymentRequest}
					disabled={isLoading}
				>
					{isLoading ? 'Loading...' : 'Generate Payment Request'}
				</button>
			</div>
		{:else if isLoading}
			<div class="card-body">
				<h4 class="card-title text-lg">Loading...</h4>
				<div class="flex items-center gap-2">
					<span class="loading loading-spinner loading-sm"></span>
					<span>Generating invoice... please wait</span>
				</div>
			</div>
		{:else}
			<div class="card-body">
				<h4 class="card-title text-lg">Your Invoice</h4>
				<p class="text-sm text-gray-500">Share this invoice with the payer</p>
				<div class="mt-4 flex flex-col gap-2">
					<div class="flex items-center gap-2">
						<span class="font-bold">Amount</span>
						<span class="text-amber-500">{amount} {tokenType === 'BTC' ? 'BTC' : 'sats'}</span>
					</div>
					<div class="flex flex-col items-start gap-2">
						<span class="font-bold">Invoice (click to copy)</span>
						<button
							class="bg-base-300 hover:bg-base-400 w-full cursor-pointer rounded-md px-2 py-4 text-left"
							title="Copy to clipboard"
							onclick={copyToClipboard}
						>
							<pre class="truncate text-xs">{invoice}</pre>
						</button>
					</div>
					<div class="flex flex-col items-start gap-2">
						<span class="font-bold">Description:</span>
						<span>{description}</span>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
