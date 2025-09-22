<script lang="ts">
	import {
		rskWalletStore,
		rskWallet,
		rskBalance,
		getUnitLabel,
		parseRSKAmount,
		formatRSKAmount
	} from '$lib/stores/rskWallet.store';
	import { ethers } from 'ethers';
	import { appStore } from '$lib/stores/app.store';

	let recipientAddress = $state('');
	let amount = $state('');
	let isLoading = $state(false);
	let gasEstimate: { gasLimit: string; gasPrice: string; totalCost: string } | null = $state(null);
	let isEstimatingForMax = $state(false);

	// Calculate max sendable amount (balance - gas fees)
	let maxSendableAmount = $derived.by(() => {
		if (!gasEstimate || !$rskBalance) return $rskBalance;

		const balanceInRBTC =
			$rskWalletStore.unitPreference === 'wei' ? parseRSKAmount($rskBalance, 'wei') : $rskBalance;

		const balance = parseFloat(balanceInRBTC);
		const fees = parseFloat(gasEstimate.totalCost);
		const maxSendable = Math.max(0, balance - fees);

		if ($rskWalletStore.unitPreference === 'wei') {
			return formatRSKAmount(maxSendable.toString(), 'wei');
		} else {
			// Use higher precision for small differences
			const result = maxSendable.toFixed(8).replace(/\.?0+$/, '');
			return result;
		}
	});

	async function estimateGasForMax() {
		if (!recipientAddress) return;

		isEstimatingForMax = true;
		try {
			// Use a small test amount to estimate gas (gas doesn't vary much with amount for basic transfers)
			const testAmount = '0.0001';
			gasEstimate = await rskWallet.estimateGas(recipientAddress, testAmount);
		} catch (error) {
			console.error('Gas estimation for MAX failed:', error);
			appStore.showErrorToast('Failed to estimate gas fees');
		} finally {
			isEstimatingForMax = false;
		}
	}

	async function estimateGas() {
		if (!recipientAddress || !amount) return;

		try {
			// Validate address
			if (!ethers.isAddress(recipientAddress)) {
				appStore.showErrorToast('Invalid recipient address');
				return;
			}

			// Validate amount
			const amountNum = parseFloat(amount);
			if (isNaN(amountNum) || amountNum <= 0) {
				appStore.showErrorToast('Invalid amount');
				return;
			}

			// Convert amount to RBTC for validation and API calls
			const amountInRBTC =
				$rskWalletStore.unitPreference === 'wei' ? parseRSKAmount(String(amount), 'wei') : String(amount);

			// Check balance (convert displayed balance to RBTC for comparison)
			const balanceInRBTC =
				$rskWalletStore.unitPreference === 'wei' ? parseRSKAmount($rskBalance, 'wei') : $rskBalance;
			const balanceNum = parseFloat(balanceInRBTC);
			const amountInRBTCNum = parseFloat(amountInRBTC);

			if (amountInRBTCNum > balanceNum) {
				appStore.showErrorToast('Insufficient balance');
				return;
			}

			gasEstimate = await rskWallet.estimateGas(recipientAddress, amountInRBTC);
		} catch (error) {
			console.error('Gas estimation failed:', error);
			appStore.showErrorToast('Failed to estimate gas fees');
		}
	}

	async function sendTransaction() {
		if (!recipientAddress || !amount) {
			appStore.showErrorToast('Please fill in all required fields');
			return;
		}

		// Convert amount to RBTC for the transaction
		const amountInRBTC =
			$rskWalletStore.unitPreference === 'wei' ? parseRSKAmount(String(amount), 'wei') : String(amount);

		// Show immediate feedback and reset form
		isLoading = true;
		const txRecipient = recipientAddress;
		const txAmount = amount;
		const txUnit = getUnitLabel($rskWalletStore.unitPreference, $rskWalletStore.network);
		const txGasLimit = gasEstimate?.gasLimit;

		// Reset form immediately to allow new transactions
		recipientAddress = '';
		amount = '';
		gasEstimate = null;
		isLoading = false;

		// Show processing toast
		appStore.showInfoToast(
			`Transaction submitted for ${txAmount} ${txUnit} to ${txRecipient.slice(0, 6)}...${txRecipient.slice(-4)}`
		);

		// Process transaction in background
		try {
			const txHash = await rskWallet.sendRBTC(txRecipient, amountInRBTC, txGasLimit);

			// Success notification
			appStore.showSuccessToast(`Transaction confirmed! Hash: ${txHash.slice(0, 10)}...`);
		} catch (error) {
			console.error('Transaction failed:', error);
			const cleanError = extractErrorMessage(error);
			appStore.showErrorToast(cleanError);

			// Optionally restore form data on error
			if (confirm('Transaction failed. Would you like to restore the form data?')) {
				recipientAddress = txRecipient;
				amount = txAmount;
			}
		}
	}

	function formatSmallAmount(amount: number, unit: string): string {
		if (amount === 0) return `0 ${unit}`;

		// For very small amounts, show in satoshi-like units or with appropriate precision
		if (amount < 0.00000001) {
			// Convert to wei-like units for display
			const weiAmount = Math.round(amount * 1e18);
			if (weiAmount < 1000) {
				return `${weiAmount} wei`;
			} else if (weiAmount < 1000000) {
				return `${(weiAmount / 1000).toFixed(1)} K wei`;
			} else {
				return `${(weiAmount / 1000000).toFixed(1)} M wei`;
			}
		} else if (amount < 0.000001) {
			// Show with 8 decimal places for very small amounts
			return `${amount.toFixed(8)} ${unit}`;
		} else if (amount < 0.001) {
			// Show with 6 decimal places for small amounts
			return `${amount.toFixed(6)} ${unit}`;
		} else {
			// Normal amounts
			return `${amount.toFixed(4).replace(/\.?0+$/, '')} ${unit}`;
		}
	}

	function extractErrorMessage(error: any): string {
		if (!error) return 'Unknown error';

		// Extract the actual error message from ethers.js errors
		if (error.message) {
			const message = error.message;

			// Handle insufficient funds error
			if (message.includes('insufficient funds')) {
				if (message.includes('intrinsic transaction cost')) {
					return 'Insufficient funds to cover transaction cost and gas fees';
				}
				return 'Insufficient funds for this transaction';
			}

			// Handle other common errors
			if (message.includes('nonce too low')) {
				return 'Transaction nonce error - please try again';
			}

			if (message.includes('gas price too low')) {
				return 'Gas price too low - please try again';
			}

			if (message.includes('transaction underpriced')) {
				return 'Transaction fee too low - please try again';
			}

			// Extract the core message if it's a wrapped error
			const match = message.match(/message['"]\s*:\s*['"](.*?)['"]/);
			if (match && match[1]) {
				return match[1];
			}

			// Return the first line of the error message
			return message.split('\n')[0].replace(/^Error:\s*/, '');
		}

		return 'Transaction failed';
	}

	// Auto-estimate gas when inputs change
	$effect(() => {
		if (recipientAddress && amount) {
			estimateGas();
		}
	});

	// Auto-estimate gas for MAX button when recipient address changes
	$effect(() => {
		if (recipientAddress && ethers.isAddress(recipientAddress) && !amount) {
			estimateGasForMax();
		}
	});
</script>

<div class="card bg-base-100 shadow-xl">
	<div class="card-body">
		<h3 class="card-title">Send RBTC</h3>

		<div class="form-control flex flex-col">
			<label class="label" for="recipient">
				<span class="label-text">Recipient Address</span>
			</label>
			<input
				id="recipient"
				type="text"
				placeholder="0x..."
				class="input input-bordered w-full"
				bind:value={recipientAddress}
				disabled={isLoading}
			/>
			{#if recipientAddress && !ethers.isAddress(recipientAddress)}
				<label class="label" for="recipient">
					<span class="label-text-alt text-error">Invalid address format</span>
				</label>
			{/if}
		</div>

		<div class="form-control flex flex-col">
			<label class="label" for="amount">
				<span class="label-text"
					>Amount ({getUnitLabel($rskWalletStore.unitPreference, $rskWalletStore.network)})</span
				>
				<span class="label-text-alt"
					>Balance: {$rskBalance} {getUnitLabel($rskWalletStore.unitPreference, $rskWalletStore.network)}</span
				>
			</label>
			<div class="input-group flex gap-2">
				<input
					id="amount"
					type="number"
					step="0.000001"
					placeholder="0.0"
					class="input input-bordered flex-1"
					bind:value={amount}
					disabled={isLoading}
				/>
				<button
					class="btn btn-outline"
					onclick={async () => {
						console.log('MAX button clicked');
						if (!gasEstimate && recipientAddress) {
							console.log('Estimating gas for MAX...');
							await estimateGasForMax();
						}
						console.log('Setting amount to maxSendableAmount:', maxSendableAmount);
						amount = maxSendableAmount;
						console.log('Amount after setting:', amount);
					}}
					disabled={isLoading ||
						isEstimatingForMax ||
						!recipientAddress ||
						!$rskBalance ||
						parseFloat($rskBalance) === 0}
					title={!recipientAddress
						? 'Enter recipient address first to calculate max amount'
						: gasEstimate
							? `Max after fees: ${maxSendableAmount}`
							: `Balance: ${$rskBalance} (fees will be calculated)`}
				>
					{#if isEstimatingForMax}
						<span class="loading loading-spinner loading-xs"></span>
					{:else}
						MAX
					{/if}
				</button>
			</div>
			{#if amount && parseFloat(amount) > parseFloat($rskBalance)}
				<label class="label" for="amount">
					<span class="label-text-alt text-error">Insufficient balance</span>
				</label>
			{/if}
		</div>

		<!-- Network Fees -->
		{#if gasEstimate}
			<div class="card bg-base-200 shadow-sm">
				<div class="card-body p-4">
					<h4 class="card-title text-sm">Network Fees</h4>
					<div class="space-y-2 text-sm">
						<div class="flex justify-between">
							<span class="opacity-70">Gas Limit:</span>
							<span>{parseInt(gasEstimate.gasLimit).toLocaleString()}</span>
						</div>
						<div class="flex justify-between">
							<span class="opacity-70">Gas Price:</span>
							<span>{ethers.formatUnits(gasEstimate.gasPrice, 'gwei')} Gwei</span>
						</div>
						<div class="divider my-1"></div>
						<div class="flex justify-between font-semibold">
							<span>Network Fee:</span>
							<span>
								{formatSmallAmount(
									parseFloat(gasEstimate.totalCost),
									getUnitLabel('rbtc', $rskWalletStore.network)
								)}
							</span>
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Transaction Summary -->
		{#if amount && gasEstimate}
			<div class="bg-base-200 space-y-2 rounded-lg p-4">
				<div class="text-sm font-semibold">Transaction Summary</div>
				<div class="flex justify-between text-sm">
					<span>Amount:</span>
					<span>{amount} {getUnitLabel($rskWalletStore.unitPreference, $rskWalletStore.network)}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span>Network Fee:</span>
					<span>
						~{formatSmallAmount(
							parseFloat(gasEstimate.totalCost),
							getUnitLabel('rbtc', $rskWalletStore.network)
						)}
					</span>
				</div>
				<div class="divider my-1"></div>
				<div class="flex justify-between font-semibold">
					<span>Total Cost:</span>
					<span>
						{(() => {
							const amountInRBTC =
								$rskWalletStore.unitPreference === 'wei'
									? parseFloat(parseRSKAmount(String(amount), 'wei'))
									: parseFloat(amount);
							const total = amountInRBTC + parseFloat(gasEstimate.totalCost);
							return formatSmallAmount(total, getUnitLabel('rbtc', $rskWalletStore.network));
						})()}
					</span>
				</div>
			</div>
		{/if}

		<div class="card-actions mt-6 justify-end">
			<button
				class="btn btn-primary flex-1"
				onclick={sendTransaction}
				disabled={isLoading ||
					!recipientAddress ||
					!amount ||
					!ethers.isAddress(recipientAddress) ||
					parseFloat(amount) <= 0 ||
					parseFloat(amount) > parseFloat($rskBalance) ||
					!$rskWalletStore.isConnected}
			>
				{#if isLoading}
					<span class="loading loading-spinner loading-sm"></span>
					Sending...
				{:else}
					Send Transaction
				{/if}
			</button>
		</div>

		{#if !$rskWalletStore.isConnected}
			<div class="alert alert-warning">
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
				<span>Wallet not connected. Please refresh the page.</span>
			</div>
		{/if}
	</div>
</div>
