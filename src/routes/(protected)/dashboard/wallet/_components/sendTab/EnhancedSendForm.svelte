<!--
	Enhanced Send Form Component
	Supports multi-asset transactions with passkey security
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import AssetSelector from '../AssetSelector.svelte';
	import PasskeyVerification from '../security/PasskeyVerification.svelte';
	import { 
		prepareSendPayment, 
		sendPayment,
		sendAssetPayment,
		parseInput,
		fetchLightningLimits,
		fetchOnchainLimits
	} from '$lib/wallet/breez/walletService';
	import { createBitcoinWallet } from '$lib/wallet/bitcoin/bitcoinWallet';
	import { swapManager } from '$lib/integrations/boltz/swapManager';
	import { BoltzClient } from '$lib/integrations/boltz/client';
	import { getCurrentNetwork, getAssetId } from '$lib/constants/assets';
	import type { PrepareSendResponse } from '@breeztech/breez-sdk-liquid/web';
	import { Buffer } from 'buffer';

	// State
	let selectedAsset = $state('L-BTC');
	let recipientAddress = $state('');
	let amount = $state('');
	let description = $state('');
	let feeRate = $state<'slow' | 'medium' | 'fast'>('medium');
	
	// UI State
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let showPasskeyVerification = $state(false);
	let passkeyContext = $state<any>({});
	let preparedTransaction = $state<PrepareSendResponse | null>(null);
	
	// Validation
	let addressType = $state<'lightning' | 'bitcoin' | 'liquid' | 'unknown'>('unknown');
	let limits = $state<any>({});
	
	// Bitcoin wallet for BTC transactions
	const bitcoinWallet = createBitcoinWallet();
	
	// Boltz client for swap operations  
	const currentNetwork = getCurrentNetwork();
	const boltzClient = new BoltzClient({
		apiUrl: 'https://api.boltz.exchange',
		network: currentNetwork
	});

	onMount(async () => {
		await loadLimits();
	});

	async function loadLimits() {
		try {
			const [lightningLimits, onchainLimits] = await Promise.all([
				fetchLightningLimits(),
				fetchOnchainLimits()
			]);
			
			limits = {
				lightning: lightningLimits,
				onchain: onchainLimits
			};
		} catch (err) {
			console.error('Failed to load limits:', err);
		}
	}

	async function handleAddressChange() {
		if (!recipientAddress.trim()) {
			addressType = 'unknown';
			return;
		}

		try {
			const parsed = await parseInput(recipientAddress);
			
			switch (parsed.type) {
				case 'bolt11':
				case 'lnUrlPay':
					addressType = 'lightning';
					break;
				case 'bitcoinAddress':
					addressType = 'bitcoin';
					break;
				case 'liquidAddress':
					addressType = 'liquid';
					break;
				default:
					addressType = 'unknown';
			}
		} catch {
			// Try to detect based on address format
			if (recipientAddress.startsWith('ln')) {
				addressType = 'lightning';
			} else if (recipientAddress.startsWith('bc1') || recipientAddress.startsWith('1') || recipientAddress.startsWith('3')) {
				addressType = 'bitcoin';
			} else if (recipientAddress.startsWith('ex1') || recipientAddress.startsWith('lq1')) {
				addressType = 'liquid';
			} else if (recipientAddress.includes('@')) {
				addressType = 'lightning';
			} else {
				addressType = 'unknown';
			}
		}
	}

	function validateForm(): boolean {
		error = null;

		if (!recipientAddress.trim()) {
			error = 'Please enter a recipient address';
			return false;
		}

		if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
			error = 'Please enter a valid amount';
			return false;
		}

		if (addressType === 'unknown') {
			error = 'Invalid or unsupported address format';
			return false;
		}

		// Check asset compatibility
		if (selectedAsset === 'BTC' && addressType === 'liquid') {
			error = 'Cannot send Bitcoin to Liquid address directly. Use swap functionality.';
			return false;
		}

		if ((selectedAsset === 'L-BTC' || selectedAsset === 'USDt') && addressType === 'bitcoin') {
			error = 'Cannot send Liquid assets to Bitcoin address directly. Use swap functionality.';
			return false;
		}

		return true;
	}

	async function prepareSend() {
		if (!validateForm()) return;

		try {
			isLoading = true;
			error = null;

			const amountSats = Math.floor(parseFloat(amount) * 100_000_000);

			if (selectedAsset === 'L-BTC' || selectedAsset === 'USDt') {
				// Use Breez SDK for Liquid assets
				const prepareParams = {
					destination: recipientAddress,
					amount: selectedAsset === 'USDt' ? {
						type: 'asset' as const,
						assetId: getAssetId('USDT'),
						receiverAmount: parseFloat(amount),
						estimateAssetFees: false
					} : {
						type: 'bitcoin' as const,
						receiverAmountSat: amountSats
					}
				};

				preparedTransaction = await prepareSendPayment(prepareParams);
			} else if (selectedAsset === 'BTC') {
				// Handle Bitcoin transactions
				if (addressType === 'lightning') {
					// Create Boltz swap (Bitcoin → Lightning)
					await handleBitcoinToLightningSwap(amountSats);
					return;
				} else {
					// Direct Bitcoin transaction
					await handleDirectBitcoinSend(amountSats);
					return;
				}
			}

			// Show passkey verification
			passkeyContext = {
				operation: 'send',
				amount: amountSats,
				destination: recipientAddress,
				asset: selectedAsset,
				reason: getTransactionReason()
			};
			showPasskeyVerification = true;

		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to prepare transaction';
		} finally {
			isLoading = false;
		}
	}

	async function handlePasskeySuccess() {
		if (!preparedTransaction) return;

		try {
			isLoading = true;

			if (selectedAsset === 'USDt') {
				await sendAssetPayment(
					recipientAddress,
					getAssetId('USDT'),
					parseFloat(amount),
					description
				);
			} else {
				await sendPayment({
					prepareResponse: preparedTransaction,
					payerNote: description
				});
			}

			// Reset form
			resetForm();
			
			// Show success message
			error = null;
			// You could emit an event or show a toast here
			
		} catch (err) {
			error = err instanceof Error ? err.message : 'Transaction failed';
		} finally {
			isLoading = false;
		}
	}

	async function handleBitcoinToLightningSwap(amountSats: number) {
		try {
			// Generate proper cryptographic keys using boltz-core
			const preimage = boltzClient.generatePreimage();
			const preimageHash = boltzClient.createPreimageHash(preimage);
			const claimKeys = boltzClient.generateKeyPair();
			
			// Create reverse submarine swap via Boltz
			const swapId = await swapManager.createReverseSubmarineSwap({
				invoiceAmount: amountSats,
				preimageHash,
				claimPublicKey: Buffer.from(claimKeys.publicKey).toString('hex'),
				lightningInvoice: recipientAddress
			});

			console.log('Created reverse swap:', swapId);
			
			// Store the preimage and keys for later claiming
			// TODO: In production, use secure storage instead of localStorage
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem(`swap_${swapId}_preimage`, preimage.toString('hex'));
				localStorage.setItem(`swap_${swapId}_claimKey`, claimKeys.privateKey ? Buffer.from(claimKeys.privateKey).toString('hex') : '');
			}
			
			resetForm();
		} catch (swapError) {
			console.error('Failed to create Bitcoin to Lightning swap:', swapError);
			error = swapError instanceof Error ? swapError.message : 'Failed to create swap';
		}
	}

	async function handleDirectBitcoinSend(amountSats: number) {
		const feeRates = await bitcoinWallet.getFeeEstimates();
		const selectedFeeRate = feeRates[feeRate];

		const txid = await bitcoinWallet.createTransaction({
			toAddress: recipientAddress,
			amount: amountSats,
			feeRate: selectedFeeRate,
			message: description
		});

		console.log('Bitcoin transaction sent:', txid);
		resetForm();
	}

	function resetForm() {
		recipientAddress = '';
		amount = '';
		description = '';
		preparedTransaction = null;
		addressType = 'unknown';
	}

	function getTransactionReason(): string {
		if (addressType === 'bitcoin' || addressType === 'liquid') {
			return 'This transaction will send funds off-platform to an external address.';
		}
		return 'Please verify this transaction with your passkey.';
	}

	function getAddressTypeIcon(): string {
		switch (addressType) {
			case 'lightning': return '⚡';
			case 'bitcoin': return '₿';
			case 'liquid': return '🌊';
			default: return '❓';
		}
	}

	function getAddressTypeLabel(): string {
		switch (addressType) {
			case 'lightning': return 'Lightning';
			case 'bitcoin': return 'Bitcoin';
			case 'liquid': return 'Liquid';
			default: return 'Unknown';
		}
	}

</script>

<div class="enhanced-send-form space-y-6">
	<h3 class="text-lg font-semibold">Send Payment</h3>

	<!-- Asset Selection -->
	<div class="form-control">
		<div class="label">
			<span class="label-text">Select Asset</span>
		</div>
		<AssetSelector 
			bind:selectedAsset 
			onAssetChange={(assetId: string) => selectedAsset = assetId}
			showBalance={true}
		/>
	</div>

	<!-- Recipient Address -->
	<div class="form-control">
		<div class="label">
			<span class="label-text">Recipient</span>
			{#if addressType !== 'unknown'}
				<span class="label-text-alt flex items-center gap-1">
					<span>{getAddressTypeIcon()}</span>
					<span>{getAddressTypeLabel()}</span>
				</span>
			{/if}
		</div>
		<div class="input-group">
			<input
				type="text"
				placeholder="Address, Lightning invoice, or Lightning address"
				class="input input-bordered flex-1"
				bind:value={recipientAddress}
				oninput={handleAddressChange}
			/>
			<button class="btn" aria-label="Scan QR">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
				</svg>
			</button>
		</div>
	</div>

	<!-- Amount -->
	<div class="form-control">
		<div class="label">
			<span class="label-text">Amount</span>
		</div>
		<div class="input-group">
			<input
				type="number"
				step="0.00000001"
				placeholder="0.00000000"
				class="input input-bordered flex-1"
				bind:value={amount}
			/>
			<span class="btn btn-disabled">{selectedAsset}</span>
		</div>
	</div>

	<!-- Fee Selection (for Bitcoin transactions) -->
	{#if selectedAsset === 'BTC'}
		<div class="form-control">
			<div class="label">
				<span class="label-text">Transaction Speed</span>
			</div>
			<div class="btn-group w-full">
				<button 
					class="btn flex-1 {feeRate === 'slow' ? 'btn-active' : ''}"
					onclick={() => feeRate = 'slow'}
				>
					Slow
				</button>
				<button 
					class="btn flex-1 {feeRate === 'medium' ? 'btn-active' : ''}"
					onclick={() => feeRate = 'medium'}
				>
					Medium
				</button>
				<button 
					class="btn flex-1 {feeRate === 'fast' ? 'btn-active' : ''}"
					onclick={() => feeRate = 'fast'}
				>
					Fast
				</button>
			</div>
		</div>
	{/if}

	<!-- Description -->
	<div class="form-control">
		<div class="label">
			<span class="label-text">Description (optional)</span>
		</div>
		<input
			type="text"
			placeholder="What's this payment for?"
			class="input input-bordered"
			bind:value={description}
		/>
	</div>

	<!-- Error Display -->
	{#if error}
		<div class="alert alert-error">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 flex-shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<span>{error}</span>
		</div>
	{/if}

	<!-- Send Button -->
	<button 
		class="btn btn-primary btn-block"
		onclick={prepareSend}
		disabled={isLoading || !recipientAddress || !amount}
	>
		{#if isLoading}
			<span class="loading loading-spinner loading-sm"></span>
			Processing...
		{:else}
			Send {selectedAsset}
		{/if}
	</button>

	<!-- Transaction Info -->
	{#if preparedTransaction}
		<div class="alert alert-info">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 flex-shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<div>
				<h3 class="font-bold">Transaction Prepared</h3>
				<p class="text-sm">Estimated fee: {((preparedTransaction.feesSat || 0) / 100_000_000).toFixed(8)} {selectedAsset}</p>
			</div>
		</div>
	{/if}
</div>

<!-- Passkey Verification Modal -->
<PasskeyVerification
	bind:show={showPasskeyVerification}
	context={passkeyContext}
	onSuccess={handlePasskeySuccess}
	onCancel={() => showPasskeyVerification = false}
	onError={(err) => error = err}
/>

<style>
	.enhanced-send-form {
		max-width: 28rem;
		margin-left: auto;
		margin-right: auto;
	}
</style>