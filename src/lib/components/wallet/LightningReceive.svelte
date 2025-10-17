<script lang="ts">
	import { t } from 'svelte-i18n';
	import { appStore } from '$lib/stores/app.store';
	import { rskConnection } from '$lib/stores/wallet.store';
	import { reverseSwapService, type BoltzSwapData } from '$lib/integrations/boltz/reverseSwapService';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';
	import { getNostrKeyPair } from '$lib/utils/nostrKeys';
	import { bytesToHex } from '@noble/hashes/utils';

	// Props
	let { amount = $bindable(''), description = $bindable('') }: { amount?: string; description?: string } = $props();

	// State
	let isCreatingSwap = $state(false);
	let currentSwap = $state<BoltzSwapData | null>(null);
	let pendingSwaps = $state<BoltzSwapData[]>([]);
	let invoice = $state<string | null>(null);
	let qrCodeDataUrl = $state<string | null>(null);
	let error = $state<string | null>(null);
	let isClaiming = $state(false);
	let nsecHex = $state<string>('');

	/**
	 * Get user's nsec and setup wallet getter on component load
	 * Also recover any pending swaps from Nostr
	 */
	$effect(() => {
		(async () => {
			try {
				const { nsec } = await getNostrKeyPair();
				nsecHex = bytesToHex(nsec);

				// Set wallet getter for automatic claiming
				reverseSwapService.setWalletGetter(() => $rskConnection.wallet);

				// Recover pending swaps from Nostr storage
				const recovered = await reverseSwapService.recoverPendingSwaps(nsecHex);
				console.log('Recovered swaps:', recovered);
				
				if (recovered.length > 0) {
					pendingSwaps = recovered;
					
					// Monitor all recovered swaps
					for (const swap of recovered) {
						monitorSwapForClaiming(swap.id);
					}
				} else {
					console.log('ℹ️ No pending swaps found');
				}
			} catch (err) {
				console.error('Failed to initialize swap service:', err);
			}
		})();
	});

	/**
	 * Create reverse swap
	 */
	async function createSwap() {
		if (!$rskConnection.address) {
			error = 'RSK wallet not connected';
			return;
		}

		if (!nsecHex) {
			error = 'Authentication required. Please sign in again.';
			return;
		}

		if (!amount || parseFloat(amount) <= 0) {
			error = 'Please enter a valid amount';
			return;
		}

		const amountSats = Math.floor(parseFloat(amount) * 100_000_000);
		
		// Minimum amount varies by network
		const minAmount = import.meta.env.VITE_RSK_NETWORK === 'mainnet' ? 1000 : 10000;
		const minBTC = minAmount / 100_000_000;
		
		if (amountSats < minAmount) {
			error = `Minimum amount is ${minAmount} sats (${minBTC} BTC)`;
			return;
		}

		isCreatingSwap = true;
		error = null;

		try {
			const result = await reverseSwapService.createReverseSwap({
				amountSats,
				rbtcAddress: $rskConnection.address,
				description: description || undefined,
				nsec: nsecHex
			});

			// Add to pending swaps list
			pendingSwaps = [...pendingSwaps, result.swapData];

			appStore.showSuccessToast('Lightning invoice created!');

			// Monitor swap for automatic claiming
			monitorSwapForClaiming(result.swapId);
			
			// Clear form
			amount = '';
			description = '';
		} catch (err) {
			console.error('Failed to create swap:', err);
			error = err instanceof Error ? err.message : 'Failed to create swap';
			appStore.showErrorToast(error);
		} finally {
			isCreatingSwap = false;
		}
	}

	/**
	 * Monitor swap and auto-claim when ready
	 */
	function monitorSwapForClaiming(swapId: string) {
		// Poll for swap status every 5 seconds
		const interval = setInterval(async () => {
			const swap = reverseSwapService.getSwap(swapId);
			if (!swap) {
				clearInterval(interval);
				return;
			}

			// Update swap in the list
			const swapIndex = pendingSwaps.findIndex(s => s.id === swapId);
			if (swapIndex !== -1) {
				pendingSwaps[swapIndex] = swap;
				pendingSwaps = [...pendingSwaps]; // Trigger reactivity
			}

			// Check if ready to claim
			if (
				(swap.status === 'transaction.mempool' || swap.status === 'transaction.confirmed') &&
				!swap.claimTxHash
			) {
				clearInterval(interval);
				await claimRBTC(swap);
			}

			// Stop monitoring on final states
			if (['invoice.settled', 'swap.expired', 'transaction.failed'].includes(swap.status)) {
				clearInterval(interval);
			}
		}, 5000);
	}

	/**
	 * Manually claim rBTC from EtherSwap contract
	 * This is called when automatic claiming fails or user wants to claim manually
	 */
	async function claimRBTC(swap: BoltzSwapData) {
		if (!$rskConnection.wallet || !nsecHex) return;

		isClaiming = true;
		error = null;

		try {
			appStore.showInfoToast('Claiming rBTC...');

			const result = await reverseSwapService.claimRBTC(
				swap,
				nsecHex,
				$rskConnection.wallet
			);

			// Update swap in the list
			const swapIndex = pendingSwaps.findIndex(s => s.id === swap.id);
			if (swapIndex !== -1) {
				pendingSwaps[swapIndex].claimTxHash = result.txHash;
				pendingSwaps[swapIndex].status = 'claimed';
				pendingSwaps = [...pendingSwaps]; // Trigger reactivity
			}
			
			appStore.showSuccessToast('✅ rBTC claimed successfully!');
		} catch (err) {
			console.error('Failed to claim rBTC:', err);
			error = err instanceof Error ? err.message : 'Failed to claim rBTC';
			appStore.showErrorToast(error);
		} finally {
			isClaiming = false;
		}
	}

	/**
	 * Copy invoice to clipboard
	 */
	async function copyInvoice(invoiceStr: string) {
		await copyToClipboard(invoiceStr);
		appStore.showSuccessToast('Invoice copied!');
	}

	/**
	 * Remove a swap from the pending list
	 */
	function removeSwap(swapId: string) {
		pendingSwaps = pendingSwaps.filter(s => s.id !== swapId);
	}

	/**
	 * Get status display info
	 */
	function getStatusInfo(status: string): { label: string; color: string; icon: string } {
		switch (status) {
			case 'swap.created':
				return { label: 'Invoice ready - waiting for payment', color: 'text-warning', icon: '⏳' };
			case 'invoice.set':
				return { label: 'Invoice paid! Waiting for lockup...', color: 'text-info', icon: '⚡' };
			case 'transaction.mempool':
				return { label: 'Boltz locking funds...', color: 'text-info', icon: '🔒' };
			case 'transaction.confirmed':
				return { label: 'Ready to claim rBTC!', color: 'text-success', icon: '✅' };
			case 'transaction.claim.pending':
				return { label: 'Claiming rBTC...', color: 'text-info', icon: '⏳' };
			case 'transaction.claim.failed':
				return { label: 'Claim failed - retry', color: 'text-error', icon: '⚠️' };
			case 'invoice.settled':
				return { label: 'Swap completed!', color: 'text-success', icon: '✅' };
			case 'claimed':
				return { label: 'rBTC claimed successfully!', color: 'text-success', icon: '🎉' };
			case 'invoice.expired':
			case 'swap.expired':
				return { label: 'Expired', color: 'text-error', icon: '⏰' };
			case 'transaction.failed':
				return { label: 'Transaction failed', color: 'text-error', icon: '❌' };
			default:
				return { label: status, color: 'text-base-content', icon: 'ℹ️' };
		}
	}
</script>

<div class="space-y-6">
	{#if error}
		<div class="alert alert-error">
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
					d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span>{error}</span>
		</div>
	{/if}

	<!-- Create Swap Form -->
	<div class="space-y-4">
		<div class="alert alert-info">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				class="h-6 w-6 shrink-0 stroke-current"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<div>
				<h3 class="font-bold">Lightning → rBTC Swap</h3>
				<div class="text-sm">
					Receive Lightning payments and automatically convert them to rBTC. Fees: ~0.4-0.5%
				</div>
			</div>
		</div>

		<div class="form-control">
			<label class="label" for="amount">
				<span class="label-text">Amount (BTC)</span>
				<span class="label-text-alt">Min: {import.meta.env.VITE_RSK_NETWORK === 'mainnet' ? '0.00001' : '0.0001'} BTC</span>
			</label>
			<input
				id="amount"
				type="number"
				step="0.00000001"
				placeholder="0.001"
				class="input input-bordered w-full"
				bind:value={amount}
				disabled={isCreatingSwap}
			/>
		</div>

		<div class="form-control">
			<label class="label" for="description">
				<span class="label-text">Description</span>
				<span class="label-text-alt">Optional</span>
			</label>
			<textarea
				id="description"
				placeholder="Payment for..."
				class="textarea textarea-bordered w-full"
				rows="2"
				bind:value={description}
				disabled={isCreatingSwap}
			></textarea>
		</div>

		<button class="btn btn-primary w-full" onclick={createSwap} disabled={isCreatingSwap || !$rskConnection.connected}>
			{#if isCreatingSwap}
				<span class="loading loading-spinner loading-sm"></span>
				Creating swap...
			{:else}
				Generate Lightning Invoice
			{/if}
		</button>
	</div>

	<!-- Pending Swaps List -->
	{#if pendingSwaps.length > 0}
		<div class="space-y-4">
			<div class="divider">Pending Swaps</div>
			
			{#each pendingSwaps as swap (swap.id)}
				{@const statusInfo = getStatusInfo(swap.status)}
				<div class="card bg-base-200 shadow-lg">
					<div class="card-body p-4">
						<!-- Status Header -->
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<span class="text-xl">{statusInfo.icon}</span>
								<span class="text-sm font-semibold {statusInfo.color}">{statusInfo.label}</span>
							</div>
							<span class="text-sm opacity-70">{swap.amount} sats</span>
						</div>

						<!-- Invoice with QR -->
						<details class="collapse collapse-arrow bg-base-100">
							<summary class="collapse-title text-sm font-medium">View Invoice</summary>
							<div class="collapse-content space-y-3">
								<!-- QR Code -->
								{#await generateQrCodeUrl(swap.invoice) then qrUrl}
									<div class="flex justify-center">
										<div class="rounded-lg bg-white p-3">
											<img src={qrUrl} alt="QR Code" class="h-32 w-32" />
										</div>
									</div>
								{/await}

								<!-- Invoice String -->
								<button
									class="btn btn-outline btn-sm w-full justify-start overflow-hidden text-ellipsis"
									onclick={() => copyInvoice(swap.invoice)}
								>
									<code class="overflow-hidden text-ellipsis text-xs">
										{swap.invoice}
									</code>
								</button>
							</div>
						</details>

						<!-- Swap Details -->
						<div class="space-y-1 text-xs">
							<div class="flex justify-between">
								<span class="opacity-70">Destination:</span>
								<code class="truncate">{swap.rbtcAddress.slice(0, 8)}...{swap.rbtcAddress.slice(-6)}</code>
							</div>
							{#if swap.lockupTxHash}
								<div class="flex justify-between">
									<span class="opacity-70">Lockup TX:</span>
									<a
										href={`https://explorer${import.meta.env.VITE_RSK_NETWORK === 'testnet' ? '.testnet' : ''}.rsk.co/tx/${swap.lockupTxHash}`}
										target="_blank"
										rel="noopener noreferrer"
										class="link link-primary"
									>
										View
									</a>
								</div>
							{/if}
							{#if swap.claimTxHash}
								<div class="flex justify-between">
									<span class="opacity-70">Claim TX:</span>
									<a
										href={`https://explorer${import.meta.env.VITE_RSK_NETWORK === 'testnet' ? '.testnet' : ''}.rsk.co/tx/${swap.claimTxHash}`}
										target="_blank"
										rel="noopener noreferrer"
										class="link link-primary"
									>
										View
									</a>
								</div>
							{/if}
						</div>

						<!-- Action Buttons -->
						<div class="flex gap-2 mt-2">
							{#if !swap.claimTxHash && (swap.status === 'transaction.confirmed' || swap.status === 'transaction.claim.failed')}
								<button 
									class="btn btn-sm flex-1"
									class:btn-success={swap.status === 'transaction.confirmed'}
									class:btn-error={swap.status === 'transaction.claim.failed'}
									onclick={() => claimRBTC(swap)} 
									disabled={isClaiming}
								>
									{#if isClaiming}
										<span class="loading loading-spinner loading-xs"></span>
										Claiming...
									{:else if swap.status === 'transaction.claim.failed'}
										🔄 Retry Claim
									{:else}
										✅ Claim rBTC
									{/if}
								</button>
							{/if}
							
							{#if swap.status === 'invoice.settled' || swap.status === 'claimed'}
								<button 
									class="btn btn-ghost btn-sm flex-1"
									onclick={() => removeSwap(swap.id)}
								>
									✓ Remove
								</button>
							{/if}
							
							{#if swap.status === 'swap.created' || swap.status === 'invoice.set' || swap.status === 'transaction.mempool'}
								<div class="text-xs text-base-content/70 text-center w-full py-2">
									{#if swap.status === 'swap.created'}
										Pay the Lightning invoice to continue
									{:else if swap.status === 'invoice.set'}
										Payment received! Waiting for Boltz to lock funds...
									{:else if swap.status === 'transaction.mempool'}
										Lockup in progress... Will be ready to claim soon
									{/if}
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

