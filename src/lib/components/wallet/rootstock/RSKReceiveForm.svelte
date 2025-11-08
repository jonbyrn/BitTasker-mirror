<script lang="ts">
	import { rskAddress, rskWalletStore } from '$lib/stores/rskWallet.store';
	import { RSK_NETWORKS } from '$lib/utils/wallet/networkConfig';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { onMount } from 'svelte';
	import { appStore } from '$lib/stores/app.store';
	import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';

	const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';
	
	let qrCodeDataUrl = $state('');
	let amount = $state('');
	let label = $state('');
	let message = $state('');
	let qrCodeError = $state('');


	async function generateQRCode() {
		if (!$rskAddress) {
			qrCodeDataUrl = '';
			qrCodeError = 'No RSK address available';
			return;
		}

		try {
			qrCodeError = '';
			
			// Create EIP-681 URI format for RSK
			let uri = `ethereum:${$rskAddress}`;
			const params = new URLSearchParams();

			if (amount) {
				params.append('value', (parseFloat(amount) * 1e18).toString()); // Convert to wei
			}
			if (label) {
				params.append('label', label);
			}
			if (message) {
				params.append('message', message);
			}

			// Add chain ID for RSK
			params.append('chainId', RSK_NETWORKS[$rskWalletStore.network].chainId.toString());

			if (params.toString()) {
				uri += `?${params.toString()}`;
			}

			qrCodeDataUrl = await generateQrCodeUrl(uri);
		} catch (error) {
			console.error('Failed to generate QR code:', error);
			qrCodeError = 'Failed to generate QR code';
			qrCodeDataUrl = '';
			appStore.showErrorToast('Failed to generate QR code');
		}
	}

	async function copyAddress() {
		if ($rskAddress) {
			await copyToClipboard($rskAddress);
			appStore.showSuccessToast('Address copied to clipboard');
		}
	}

	async function copyPaymentURI() {
		if (!$rskAddress) return;

		let uri = `ethereum:${$rskAddress}`;
		const params = new URLSearchParams();

		if (amount) {
			params.append('value', (parseFloat(amount) * 1e18).toString());
		}
		if (label) {
			params.append('label', label);
		}
		if (message) {
			params.append('message', message);
		}

		params.append('chainId', RSK_NETWORKS[$rskWalletStore.network].chainId.toString());

		if (params.toString()) {
			uri += `?${params.toString()}`;
		}

		await copyToClipboard(uri);
		appStore.showSuccessToast('Payment URI copied to clipboard');
	}

	function getExplorerUrl(address: string): string {
		const network = RSK_NETWORKS[$rskWalletStore.network];
		return `${network.explorerUrl}/address/${address}`;
	}

	// Generate QR code when component mounts or parameters change
	onMount(() => {
		generateQRCode();
	});

	$effect(() => {
		if ($rskAddress || amount || label || message) {
			generateQRCode();
		}
	});
</script>

<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
	<!-- Payment Request Form -->
	<div class="card bg-base-100">
		<div class="card-body">
			<h3 class="card-title">Payment Request</h3>

			<div class="form-control">
				<label class="label" for="request-amount">
					<span class="label-text">Amount (RBTC)</span>
					<span class="label-text-alt">Optional</span>
				</label>
				<input
					id="request-amount"
					type="number"
					step="0.000001"
					placeholder="0.0"
					class="input input-bordered w-full"
					bind:value={amount}
				/>
			</div>

			<div class="form-control">
				<label class="label" for="request-label">
					<span class="label-text">Label</span>
					<span class="label-text-alt">Optional</span>
				</label>
				<input
					id="request-label"
					type="text"
					placeholder="Payment for..."
					class="input input-bordered w-full"
					bind:value={label}
				/>
			</div>

			<div class="form-control">
				<label class="label" for="request-message">
					<span class="label-text">Message</span>
					<span class="label-text-alt">Optional</span>
				</label>
				<textarea
					id="request-message"
					placeholder="Additional details..."
					class="textarea textarea-bordered w-full"
					rows="3"
					bind:value={message}
				></textarea>
			</div>

			{#if amount || label || message}
				<div class="bg-base-200 mt-4 rounded-lg p-4">
					<div class="mb-2 text-sm font-semibold">Payment Request Details</div>
					{#if amount}
						<div class="flex justify-between text-sm">
							<span>Amount:</span>
							<span>{amount} RBTC</span>
						</div>
					{/if}
					{#if label}
						<div class="flex justify-between text-sm">
							<span>Label:</span>
							<span>{label}</span>
						</div>
					{/if}
					{#if message}
						<div class="mt-2 text-sm">
							<span class="font-medium">Message:</span>
							<div class="mt-1 opacity-80">{message}</div>
						</div>
					{/if}
				</div>
			{/if}

			<div class="card-actions mt-6 justify-end">
				<button class="btn btn-primary" onclick={copyPaymentURI} disabled={!$rskAddress}>
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
							d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
						/>
					</svg>
					Copy Payment Link
				</button>
			</div>
		</div>
	</div>

	<!-- QR Code Display or Testnet Alert -->
	<div class="card bg-base-100">
		<div class="card-body items-center text-center">
			<h3 class="card-title">Receive RBTC</h3>

			{#if network === 'testnet'}
				<!-- Testnet Alert -->
				<div class="alert alert-warning w-full max-w-lg">
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
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
						/>
					</svg>
					<div>
						<div class="font-bold">⚠️ TESTNET MODE ACTIVE</div>
						<div class="text-sm">
							<strong>DO NOT send real assets!</strong> This app is currently running on Rootstock Testnet. Any funds sent to this wallet will be lost permanently as they are test tokens only.
						</div>
						<div class="mt-2 text-sm">
							To get testnet rBTC for testing, visit the 
							<a 
								href="https://faucet.rootstock.io/" 
								target="_blank" 
								rel="noopener noreferrer"
								class="link link-primary font-semibold"
							>
								Rootstock Testnet Faucet
							</a>
							and request testnet rBTC tokens.
						</div>
					</div>
				</div>
			{:else if qrCodeDataUrl}
				<div class="rounded-lg bg-white p-4 shadow-inner">
					<img src={qrCodeDataUrl} alt="Payment QR Code" class="h-64 w-64" />
				</div>
			{:else if qrCodeError}
				<div class="bg-base-200 flex h-64 w-64 items-center justify-center rounded-lg flex-col gap-2">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z" />
					</svg>
					<span class="text-xs text-center text-error">{qrCodeError}</span>
					<button class="btn btn-xs btn-outline" onclick={generateQRCode}>
						Retry
					</button>
				</div>
			{:else}
				<div class="bg-base-200 flex h-64 w-64 items-center justify-center rounded-lg">
					<span class="loading loading-spinner loading-lg"></span>
				</div>
			{/if}

			{#if $rskAddress}
				<div class="mt-4 w-full">
					<div class="mb-2 text-sm opacity-70">Your RSK Address</div>
					<div class="bg-base-200 rounded-lg p-3 font-mono text-sm break-all">
						{$rskAddress}
					</div>

					<div class="mt-3 flex justify-center gap-2">
						<button class="btn btn-sm btn-outline" onclick={copyAddress}>
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
									d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
								/>
							</svg>
							Copy Address
						</button>

						<a
							href={getExplorerUrl($rskAddress)}
							target="_blank"
							rel="noopener noreferrer"
							class="btn btn-sm btn-outline"
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
									d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
								/>
							</svg>
							Explorer
						</a>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Network Info -->
<div class="alert alert-info mt-6">
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
			d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
		/>
	</svg>
	<div>
		<div class="font-bold">Network: {RSK_NETWORKS[$rskWalletStore.network].name}</div>
		<div class="text-sm">
			Only send {RSK_NETWORKS[$rskWalletStore.network].currency.symbol} and RSK-compatible tokens to
			this address. Sending other cryptocurrencies may result in permanent loss.
		</div>
	</div>
</div>
