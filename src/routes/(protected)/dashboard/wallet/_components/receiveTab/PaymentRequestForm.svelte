<script lang="ts">
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

<div class="card bg-base-200 rounded-xl shadow-md">
	<div class="card-body p-6">
		{#if invoice === null}
			<h4 class="card-title mb-4 text-lg font-bold">Request Specific Amount</h4>

			<div class="form-control mb-4">
				<label class="label pb-1">
					<span class="label-text text-sm font-medium"
						>Amount ({tokenType === 'BTC' ? 'BTC' : 'sats'})</span
					>
				</label>
				<div class="flex">
					<input
						type="number"
						placeholder="0.00000000"
						class="input input-bordered w-full rounded-r-none focus:border-amber-500 focus:outline-none"
						bind:value={amount}
					/>
					<select
						class="select select-bordered bg-base-300 rounded-l-none border-l-0 focus:outline-none"
						bind:value={tokenType}
					>
						<option value="BTC">BTC</option>
						<option value="sats">sats</option>
					</select>
				</div>
				{#if errorMessage}
					<label class="label pt-1">
						<span class="label-text-alt text-error">{errorMessage}</span>
					</label>
				{/if}
			</div>

			<div class="form-control mb-6">
				<label class="label pb-1">
					<span class="label-text text-sm font-medium">Description (optional)</span>
				</label>
				<input
					type="text"
					placeholder="What's this payment for?"
					class="input input-bordered w-full focus:border-amber-500 focus:outline-none"
					bind:value={description}
				/>
			</div>

			<div>
				<button
					class="btn btn-primary btn-block h-12 rounded-lg border-none bg-amber-500 font-medium text-black transition-all duration-200 hover:bg-amber-600"
					onclick={generatePaymentRequest}
					disabled={isLoading}
				>
					{#if isLoading}
						<span class="loading loading-spinner loading-sm mr-2"></span>
						Loading...
					{:else}
						Generate Payment Request
					{/if}
				</button>
			</div>
		{:else if isLoading}
			<div>
				<h4 class="card-title mb-4 text-lg">Loading...</h4>
				<div class="flex items-center gap-3 py-4">
					<span class="loading loading-spinner loading-md text-amber-500"></span>
					<span>Generating invoice... please wait</span>
				</div>
			</div>
		{:else}
			<div>
				<h4 class="card-title mb-1 text-lg font-bold">Your Invoice</h4>
				<p class="mb-6 text-sm text-gray-500">Share this invoice with the payer</p>
				<div class="flex flex-col gap-4">
					<div class="flex items-center gap-2">
						<span class="font-medium text-gray-400">Amount:</span>
						<span class="font-bold text-amber-500"
							>{amount} {tokenType === 'BTC' ? 'BTC' : 'sats'}</span
						>
					</div>

					{#if description}
						<div class="flex flex-col gap-1">
							<span class="font-medium text-gray-400">Description:</span>
							<span class="text-sm">{description}</span>
						</div>
					{/if}

					<div class="mt-2 flex flex-col gap-2">
						<span class="font-medium text-gray-400">Invoice:</span>
						<button
							class="bg-base-300 hover:bg-base-100 border-base-300 w-full cursor-pointer rounded-lg border px-4 py-3 text-left transition-colors duration-200"
							title="Copy to clipboard"
							onclick={copyToClipboard}
						>
							<pre class="truncate text-xs">{invoice}</pre>
						</button>
						<span class="mt-1 text-center text-xs text-gray-500">Click to copy</span>
					</div>

					<button
						class="btn btn-outline mt-4 border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-black"
						onclick={() => (invoice = null)}
					>
						Create New Request
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>
