<script lang="ts">
	import { t } from 'svelte-i18n';
	import { appStore } from '$lib/stores/app.store';
	import { rskConnection } from '$lib/stores/wallet.store';
	import {
		reverseSwapService,
		type BoltzSwapData
	} from '$lib/integrations/boltz/reverseSwapService';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';
	import { getNostrKeyPair } from '$lib/utils/nostrKeys';
	import { bytesToHex } from '@noble/hashes/utils';

	// Props
	let {
		amount = $bindable(''),
		description = $bindable('')
	}: { amount?: string; description?: string } = $props();

	// State
	let isCreatingSwap = $state(false);
	let pendingSwaps = $state<BoltzSwapData[]>([]);
	let error = $state<string | null>(null);
	let isClaiming = $state(false);
	let nsecHex = $state<string>('');
	let isDeletingSwaps = $state(false);
	let showHelpModal = $state(false);
	let expandedSwaps = $state<Set<string>>(new Set());

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
				nsec: nsecHex,
				walletSigner: $rskConnection.wallet // Pass wallet for Smart Wallet address computation
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
	 * Monitor swap status and update UI
	 */
	function monitorSwapForClaiming(swapId: string) {
		// Poll for swap status every 5 seconds
		const interval = setInterval(async () => {
			const swap = reverseSwapService.getSwap(swapId);
			if (!swap) {
				clearInterval(interval);
				return;
			}

			// Update swap in the list without reinitializing the array
			const swapIndex = pendingSwaps.findIndex((s) => s.id === swapId);
			if (swapIndex !== -1) {
				// Only update if there's an actual change to prevent unnecessary re-renders
				const currentSwap = pendingSwaps[swapIndex];
				if (
					currentSwap.status !== swap.status ||
					currentSwap.lockupTxHash !== swap.lockupTxHash ||
					currentSwap.claimTxHash !== swap.claimTxHash
				) {
					pendingSwaps[swapIndex] = swap;
					pendingSwaps = [...pendingSwaps]; // Trigger reactivity
				}
			}

			// Stop monitoring on final states
			if (
				['invoice.settled', 'swap.expired', 'transaction.failed', 'claimed'].includes(swap.status)
			) {
				clearInterval(interval);

				// Show success message when settled
				if (swap.status === 'invoice.settled') {
					appStore.showSuccessToast('✅ RBTC received!');
				}
			}
		}, 5000);
	}

	/**
	 * Manually claim rBTC
	 * Attempts gasless claim via RIF Relay first, falls back to direct claim if user has gas
	 */
	async function claimRBTC(swap: BoltzSwapData) {
		if (!nsecHex || !$rskConnection.wallet) {
			appStore.showErrorToast('Wallet not connected');
			return;
		}

		isClaiming = true;
		error = null;

		try {
			appStore.showInfoToast('Claiming RBTC (no gas fees required)...');

			// Attempt gasless claim via RIF Relay
			const result = await reverseSwapService.claimRBTCViaRifRelay(
				swap,
				nsecHex,
				$rskConnection.wallet
			);

			// Update swap in the list
			const swapIndex = pendingSwaps.findIndex((s) => s.id === swap.id);
			if (swapIndex !== -1) {
				pendingSwaps[swapIndex].claimTxHash = result.txHash;
				pendingSwaps[swapIndex].status = 'claimed';
				pendingSwaps[swapIndex].rifRelayUsed = true;
				pendingSwaps = [...pendingSwaps]; // Trigger reactivity
			}

			appStore.showSuccessToast('✅ RBTC claimed successfully (gasless)!');
		} catch (err) {
			console.error('Failed to claim RBTC:', err);
			error = err instanceof Error ? err.message : 'Failed to claim RBTC';
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
	 * Delete a single swap event from Nostr
	 */
	async function deleteSwap(swapId: string) {
		if (!nsecHex) {
			appStore.showErrorToast('Authentication required');
			return;
		}

		if (!confirm('⚠️ Delete this swap from storage? This cannot be undone.')) {
			return;
		}

		try {
			const success = await reverseSwapService.deleteSwapEvent(nsecHex, swapId);
			if (success) {
				// Remove from UI
				pendingSwaps = pendingSwaps.filter((s) => s.id !== swapId);
				appStore.showSuccessToast('✅ Swap deleted');
			} else {
				appStore.showErrorToast('❌ Failed to delete swap');
			}
		} catch (err) {
			console.error('Failed to delete swap:', err);
			appStore.showErrorToast('❌ Failed to delete swap');
		}
	}

	/**
	 * Delete all swap events from Nostr (for testing)
	 */
	async function deleteAllSwaps() {
		if (!nsecHex) {
			appStore.showErrorToast('Authentication required');
			return;
		}

		if (!confirm('⚠️ This will delete ALL swap events from Nostr. Continue?')) {
			return;
		}

		isDeletingSwaps = true;
		error = null;

		try {
			const result = await reverseSwapService.deleteAllSwapEvents(nsecHex);
			pendingSwaps = [];
			appStore.showSuccessToast(`✅ Deleted ${result.count} swap events`);
		} catch (err) {
			console.error('Failed to delete swaps:', err);
			error = err instanceof Error ? err.message : 'Failed to delete swaps';
			appStore.showErrorToast(error);
		} finally {
			isDeletingSwaps = false;
		}
	}

	/**
	 * Toggle invoice expansion
	 */
	function toggleInvoice(swapId: string) {
		const newExpanded = new Set(expandedSwaps);
		if (newExpanded.has(swapId)) {
			newExpanded.delete(swapId);
		} else {
			newExpanded.add(swapId);
		}
		expandedSwaps = newExpanded;
	}

	/**
	 * Close invoice (only when clicking arrow)
	 */
	function closeInvoice(swapId: string, event: MouseEvent) {
		event.stopPropagation();
		const newExpanded = new Set(expandedSwaps);
		newExpanded.delete(swapId);
		expandedSwaps = newExpanded;
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
				return { label: 'Swap completed! ✓', color: 'text-success', icon: '✅' };
			case 'claimed':
				return { label: 'rBTC claimed successfully! ✓', color: 'text-success', icon: '🎉' };
			case 'invoice.expired':
			case 'swap.expired':
				return { label: 'Swap expired - Delete to remove', color: 'text-error', icon: '⏰' };
			case 'transaction.failed':
				return { label: 'Swap failed - Delete to remove', color: 'text-error', icon: '❌' };
			default:
				return { label: status, color: 'text-base-content', icon: 'ℹ️' };
		}
	}
</script>

<div class="space-y-6">
	<!-- Developer Tool: Delete All Swaps -->
	{#if import.meta.env.DEV || import.meta.env.VITE_BOLTZ_NETWORK === 'regtest'}
		<div class="alert alert-horizontal">
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
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/>
			</svg>
			<div class="flex w-full flex-col items-center justify-between space-y-2 sm:flex-row">
				<div class="flex-1">
					<h4 class="font-bold">🧪 Developer Tools</h4>
					<div class="text-sm">Clear test data from Nostr storage</div>
				</div>
				<button
					class="btn btn-error btn-sm mx-auto block"
					onclick={deleteAllSwaps}
					disabled={isDeletingSwaps}
				>
					{#if isDeletingSwaps}
						<span class="loading loading-spinner loading-xs"></span>
						Deleting...
					{:else}
						🗑️ Delete All Swaps
					{/if}
				</button>
			</div>
		</div>
	{/if}

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
				<h4 class="font-bold">Lightning → rBTC Swap</h4>
				<div class="text-sm">
					Receive Lightning payments and automatically convert them to rBTC. Fees: ~0.4-0.5%
				</div>
			</div>
		</div>

		<div class="form-control">
			<label class="label" for="amount">
				<span class="label-text">Amount (BTC)</span>
				<span class="label-text-alt"
					>Min: {import.meta.env.VITE_RSK_NETWORK === 'mainnet' ? '0.00001' : '0.0001'} BTC</span
				>
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

		<button
			class="btn btn-primary w-full"
			onclick={createSwap}
			disabled={isCreatingSwap || !$rskConnection.connected}
		>
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
						<div class="mb-4 flex items-center justify-between">
							<div class="flex items-center gap-2">
								<span class="text-xl">{statusInfo.icon}</span>
								<span class="text-sm font-semibold {statusInfo.color}">{statusInfo.label}</span>
							</div>
							<span class="text-sm opacity-70">{swap.amount} sats</span>
						</div>

						<!-- Main Invoice with QR (Collapsible) -->
						<div class="bg-base-100 rounded-lg">
							<div class="flex w-full cursor-pointer items-center justify-between">
								<button
									class="flex flex-1 items-center justify-between p-4 text-left transition-colors hover:opacity-80"
									onclick={() => toggleInvoice(swap.id)}
									type="button"
								>
									<span class="block font-medium">View Invoice</span>
								</button>
								<button
									class="ml-2 p-4 transition-transform duration-200 hover:opacity-80 {expandedSwaps.has(
										swap.id
									)
										? 'rotate-180'
										: ''}"
									onclick={(e) => {
										e.stopPropagation();
										if (expandedSwaps.has(swap.id)) {
											closeInvoice(swap.id, e);
										} else {
											toggleInvoice(swap.id);
										}
									}}
									type="button"
									aria-label={expandedSwaps.has(swap.id) ? 'Collapse invoice' : 'Expand invoice'}
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
											d="M19 9l-7 7-7-7"
										/>
									</svg>
								</button>
							</div>

							<!-- Collapsible Content -->
							{#if expandedSwaps.has(swap.id)}
								<div class="border-base-300 border-t p-4">
									<div class="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
										<!-- QR Code -->
										<div class="shrink-0">
											{#await generateQrCodeUrl(swap.invoice)}
												<div
													class="flex h-32 w-32 items-center justify-center rounded-lg bg-white p-3"
												>
													<span class="loading loading-spinner loading-md"></span>
												</div>
											{:then qrUrl}
												<div class="rounded-lg bg-white p-1">
													<img src={qrUrl} alt="QR Code" class="h-32 w-32" />
												</div>
											{/await}
										</div>

										<!-- Invoice String -->
										<div class="w-full sm:flex-1">
											<button
												class="btn btn-outline btn-sm h-auto min-h-12 w-full justify-start p-3 text-left break-all"
												onclick={(e) => {
													e.stopPropagation();
													copyInvoice(swap.invoice);
												}}
												type="button"
											>
												<code class="text-xs leading-relaxed">
													{swap.invoice}
												</code>
											</button>
										</div>
									</div>
								</div>
							{/if}
						</div>

						<!-- Swap Details -->
						<div class="space-y-1 text-xs">
							<div class="flex justify-between">
								<span class="opacity-70">Destination:</span>
								<code class="truncate"
									>{swap.rbtcAddress.slice(0, 8)}...{swap.rbtcAddress.slice(-6)}</code
								>
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
						<div class="mt-2 flex flex-wrap gap-2">
							{#if !swap.claimTxHash && swap.status === 'transaction.confirmed'}
								<!-- Can claim now - gasless via RIF Relay -->
								<button
									class="btn btn-success btn-sm block w-fit justify-self-end"
									onclick={() => claimRBTC(swap)}
									disabled={isClaiming}
								>
									{#if isClaiming}
										<span class="loading loading-spinner loading-xs"></span>
										Claiming...
									{:else}
										⚡ Claim Now (No Gas Fees)
									{/if}
								</button>
							{/if}

							<!-- Always show delete button -->
							<button
								class="btn btn-ghost btn-sm btn-outline"
								onclick={() => deleteSwap(swap.id)}
								title="Delete this swap from storage"
							>
								🗑️ Delete Swap
							</button>

							{#if swap.status === 'swap.created' || swap.status === 'invoice.set' || swap.status === 'transaction.mempool'}
								<div class="text-base-content/70 w-full py-2 text-center text-xs">
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

	<!-- Help Modal -->
	{#if showHelpModal}
		<dialog class="modal modal-open">
			<div class="modal-box max-w-2xl">
				<h3 class="mb-4 text-xl font-bold">How Gasless RBTC Swaps Work</h3>

				<div class="space-y-4">
					<div>
						<h4 class="mb-2 font-semibold">What is RIF Relay?</h4>
						<p class="text-sm">
							RIF Relay technology enables gasless transactions on Rootstock. BitTasker uses RIF
							Relay to claim your RBTC without you needing any RBTC for gas fees.
						</p>
					</div>

					<div class="divider"></div>

					<div>
						<h4 class="mb-2 font-semibold">How it works:</h4>
						<ol class="ml-2 list-inside list-decimal space-y-2 text-sm">
							<li>You pay the Lightning invoice with your Lightning wallet</li>
							<li>Boltz locks RBTC in a smart contract on Rootstock</li>
							<li>BitTasker claims the RBTC via RIF Relay (no gas fees for you!)</li>
							<li>RBTC arrives in your wallet! ✅</li>
						</ol>
					</div>

					<div class="divider"></div>

					<div>
						<h4 class="mb-2 font-semibold">Key benefits:</h4>
						<ul class="ml-2 list-inside list-disc space-y-1 text-sm">
							<li><strong>No gas fees</strong> - RIF Relay pays the transaction fees</li>
							<li><strong>Automatic claiming</strong> - No manual steps required</li>
							<li><strong>First RBTC</strong> - Perfect for receiving your first RBTC</li>
							<li><strong>Fast & reliable</strong> - Claims complete in seconds</li>
						</ul>
					</div>
				</div>

				<div class="modal-action">
					<button class="btn" onclick={() => (showHelpModal = false)}> Got it! </button>
				</div>
			</div>
		</dialog>
	{/if}
</div>
