<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';
	import { formatSats, formatUsd } from '$lib/stores/wallet.store';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { getBlockscoutApiUrl, fetchTransactionStatus as fetchTxStatus, calculateEstimatedTime } from '$lib/utils/wallet/blockscoutTransactionStatus';
	import { walletManager } from '$lib/stores/wallet.store';
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconCheckCircle from '~icons/mdi/check-circle';
	import IconLoading from '~icons/mdi/loading';
	import IconClose from '~icons/mdi/close';
	import IconAlertCircle from '~icons/mdi/alert-circle';
	import IconOpenInNew from '~icons/mdi/open-in-new';
	import { fade, scale } from 'svelte/transition';

	interface Props {
		amountSats: number;
		amountUSD: number;
		address: string;
		network: string;
		txHash: string | null;
		swapId: string | null; // For lightning swaps
		networkOptions: Record<string, { icon: string; name: string; confirmationTime: number }>;
		onClose: () => void;
	}

	let { amountSats, amountUSD, address, network, txHash, swapId, networkOptions, onClose }: Props = $props();

	// Transaction status
	type TransactionStatus = 'sending' | 'confirming' | 'success' | 'error';
	let status = $state<TransactionStatus>('sending');
	let confirmations = $state(0);
	let estimatedTimeRemaining = $state<number | null>(null);
	let pollingInterval: ReturnType<typeof setInterval> | null = null;
	let isPolling = $state(false);
	let errorMessage = $state<string | null>(null);

	// Debug: Log props to verify they're being passed
	$effect(() => {
		console.log('[PendingTransactionScreen] Props updated', {
			amountSats,
			amountUSD,
			address,
			network,
			txHash,
			swapId,
			hasNetworkOptions: !!networkOptions,
			networkOptionsKeys: Object.keys(networkOptions),
			timestamp: new Date().toISOString()
		});
	});

	// Get network info
	const networkInfo = $derived.by(() => {
		return networkOptions[network as keyof typeof networkOptions];
	});

	// Get explorer URL for address based on network
	function getAddressExplorerUrl(address: string, network: string | null): string | null {
		if (!address || !network) return null;

		const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
		const bscNetwork = import.meta.env.VITE_BSC_NETWORK || 'testnet';
		const isMainnet = rskNetwork === 'mainnet';

		if (network === 'rootstock-bitcoin' || network === 'rsk') {
			return isMainnet
				? `https://rootstock.blockscout.com/address/${address}`
				: `https://rootstock-testnet.blockscout.com/address/${address}`;
		} else if (network === 'usdt-bsc' || network === 'bsc') {
			return bscNetwork === 'mainnet'
				? `https://bscscan.com/address/${address}`
				: `https://testnet.bscscan.com/address/${address}`;
		} else if (network === 'bitcoin') {
			return isMainnet
				? `https://blockstream.info/address/${address}`
				: `https://blockstream.info/testnet/address/${address}`;
		} else if (network === 'liquid-bitcoin') {
			return isMainnet
				? `https://blockstream.info/liquid/address/${address}`
				: `https://blockstream.info/liquidtestnet/address/${address}`;
		}

		return null;
	}

	const explorerUrl = $derived.by(() => getAddressExplorerUrl(address, network));
	const apiUrl = $derived.by(() => getBlockscoutApiUrl(network));

	// Format address (truncate)
	function formatAddress(address: string): string {
		if (address.length <= 20) return address;
		return `${address.slice(0, 10)}...${address.slice(-8)}`;
	}


	// Update swap status for lightning transactions
	async function updateSwapStatus() {
		if (!swapId || network !== 'lightning-bitcoin') return;

		const currentStatusValue: TransactionStatus = status;

		console.log('[PendingTransactionScreen] updateSwapStatus called', {
			swapId,
			network,
			currentStatus: currentStatusValue,
			timestamp: new Date().toISOString()
		});

		// Don't poll if already confirmed or error
		if (currentStatusValue === 'success' || currentStatusValue === 'error') {
			console.log('[PendingTransactionScreen] Swap already in final state, skipping update');
			return;
		}

		if (isPolling) {
			console.warn('[PendingTransactionScreen] Already polling, skipping update');
			return;
		}

		isPolling = true;
		console.log('[PendingTransactionScreen] Fetching swap status...');

		try {
			const swap = walletManager.submarineSwapService.getSwap(swapId);
			
			if (!swap) {
				console.warn('[PendingTransactionScreen] Swap not found');
				isPolling = false;
				return;
			}

			console.log('[PendingTransactionScreen] Swap status received', {
				swapId: swap.id,
				status: swap.status,
				lockupTxHash: swap.lockupTxHash,
				claimTxHash: (swap as any).claimTxHash
			});

			// Determine status based on swap status
			let newStatus: TransactionStatus = status;
			let newEstimatedTime = estimatedTimeRemaining;
			let newErrorMessage: string | null = null;

			// Success states
			if (swap.status === 'invoice.paid' || swap.status === 'transaction.claimed') {
				newStatus = 'success';
				newEstimatedTime = 0;
				console.log('[PendingTransactionScreen] Swap completed successfully', {
					status: swap.status
				});
				// Stop polling and countdown
				if (pollingInterval) {
					clearInterval(pollingInterval);
					pollingInterval = null;
				}
				if (countdownInterval) {
					clearInterval(countdownInterval);
					countdownInterval = null;
				}
			}
			// Error states
			else if (swap.status === 'transaction.failed' || swap.status === 'swap.expired' || swap.status === 'swap.refunded') {
				newStatus = 'error';
				newEstimatedTime = 0;
				if (swap.status === 'transaction.failed') {
					newErrorMessage = $t('wallet.swap.lightning.status.failed');
				} else if (swap.status === 'swap.expired') {
					newErrorMessage = $t('wallet.swap.lightning.status.expired');
				} else if (swap.status === 'swap.refunded') {
					newErrorMessage = $t('wallet.swap.submarine.status.refunded');
				}
				console.log('[PendingTransactionScreen] Swap failed', {
					status: swap.status,
					errorMessage: newErrorMessage
				});
				// Stop polling and countdown
				if (pollingInterval) {
					clearInterval(pollingInterval);
					pollingInterval = null;
				}
				if (countdownInterval) {
					clearInterval(countdownInterval);
					countdownInterval = null;
				}
			}
			// Pending states - estimate time based on status
			else {
				newStatus = 'confirming';
				// Estimate time based on swap status
				// swap.created -> invoice.set: ~instant (user pays invoice)
				// invoice.set -> transaction.mempool: ~30s (waiting for lockup tx)
				// transaction.mempool -> transaction.confirmed: ~30s (waiting for confirmation)
				// transaction.confirmed -> invoice.paid: ~variable (Boltz pays invoice)
				const swapStatus = swap.status as string; // Type assertion for status checking
				if (swapStatus === 'swap.created' || swapStatus === 'invoice.set') {
					newEstimatedTime = 30; // Waiting for lockup transaction
				} else if (swapStatus === 'transaction.mempool') {
					newEstimatedTime = 30; // Waiting for confirmation
				} else if (swapStatus === 'transaction.confirmed' || swapStatus === 'invoice.pending') {
					newEstimatedTime = 60; // Waiting for Boltz to pay invoice
				} else {
					newEstimatedTime = 60; // Default estimate
				}
				console.log('[PendingTransactionScreen] Swap in progress', {
					status: swapStatus,
					estimatedTime: newEstimatedTime
				});
			}

			// Update state
			const statusChanged = status !== newStatus;
			const timeChanged = estimatedTimeRemaining !== newEstimatedTime;
			const errorChanged = errorMessage !== newErrorMessage;

			if (statusChanged || timeChanged || errorChanged) {
				console.log('[PendingTransactionScreen] Updating swap state', {
					statusChanged,
					oldStatus: status,
					newStatus,
					timeChanged,
					oldTime: estimatedTimeRemaining,
					newTime: newEstimatedTime,
					errorChanged,
					oldError: errorMessage,
					newError: newErrorMessage
				});

				status = newStatus;
				estimatedTimeRemaining = newEstimatedTime;
				errorMessage = newErrorMessage;
			}
		} catch (error) {
			console.error('[PendingTransactionScreen] Error fetching swap status:', error);
		} finally {
			isPolling = false;
		}
	}

	// Update transaction status
	async function updateTransactionStatus() {
		// For lightning, use swap status monitoring instead
		if (network === 'lightning-bitcoin' && swapId) {
			await updateSwapStatus();
			return;
		}

		// Capture current status at the start to avoid type narrowing issues
		const currentStatusValue: TransactionStatus = status;
		
		console.log('[PendingTransactionScreen] updateTransactionStatus called', {
			txHash,
			apiUrl,
			network,
			isPolling,
			currentStatus: currentStatusValue,
			currentConfirmations: confirmations,
			currentEstimatedTime: estimatedTimeRemaining,
			timestamp: new Date().toISOString()
		});

		// Don't poll if transaction is already confirmed or errored
		if (currentStatusValue === 'success' || currentStatusValue === 'error') {
			console.log('[PendingTransactionScreen] Transaction already in final state, skipping update', {
				status: currentStatusValue
			});
			// Stop polling if still running
			if (pollingInterval) {
				clearInterval(pollingInterval);
				pollingInterval = null;
				console.log('[PendingTransactionScreen] Polling stopped - transaction in final state');
			}
			return;
		}

		if (!txHash) {
			console.warn('[PendingTransactionScreen] No txHash provided, skipping update');
			return;
		}

		if (!apiUrl) {
			console.warn('[PendingTransactionScreen] No API URL available, skipping update', {
				network,
				hasNetworkInfo: !!networkInfo
			});
			return;
		}

		if (isPolling) {
			console.warn('[PendingTransactionScreen] Already polling, skipping update');
			return;
		}

		isPolling = true;
		console.log('[PendingTransactionScreen] Starting API fetch...');
		
		const fetchStartTime = Date.now();
		const txData = await fetchTxStatus(txHash, network);
		const fetchDuration = Date.now() - fetchStartTime;
		isPolling = false;

		console.log('[PendingTransactionScreen] API fetch completed', {
			duration: `${fetchDuration}ms`,
			hasData: !!txData,
			txData: txData ? {
				hash: txData.hash,
				blockNumber: txData.blockNumber,
				confirmations: txData.confirmations,
				status: txData.status,
				timeStamp: txData.timeStamp
			} : null
		});

		if (!txData) {
			console.warn('[PendingTransactionScreen] No transaction data received', {
				currentStatus: status,
				willKeepStatus: status === 'sending'
			});
			// Transaction not found or API error - keep as "sending"
			if (status === 'sending') {
				const fallbackTime = networkInfo?.confirmationTime || 60;
				console.log('[PendingTransactionScreen] Setting fallback time:', fallbackTime);
				estimatedTimeRemaining = fallbackTime;
			}
			return;
		}

		// Update confirmations
		const oldConfirmations = confirmations;
		confirmations = txData.confirmations;

		console.log('[PendingTransactionScreen] Processing transaction data', {
			oldConfirmations,
			newConfirmations: txData.confirmations,
			blockNumber: txData.blockNumber,
			status: txData.status,
			oldStatus: status,
			oldEstimatedTime: estimatedTimeRemaining
		});

		// Determine status based on transaction data
		let newStatus: TransactionStatus = status as TransactionStatus; // Explicit type to allow all statuses
		let newEstimatedTime = estimatedTimeRemaining;

		// For Rootstock, 1 confirmation means success
		const isRootstock = network === 'rootstock-bitcoin' || network === 'rsk';
		const targetConfirmations = isRootstock ? 1 : 1; // RSK needs 1 confirmation

		if (txData.blockNumber === null) {
			// Transaction is still in mempool
			// Estimate time: ~30 seconds to get into a block, then ~30 seconds for first confirmation
			newStatus = 'sending';
			const blockTime = networkInfo?.confirmationTime || 30;
			// Estimate: time to get into block + time for first confirmation
			newEstimatedTime = blockTime + blockTime; // ~60 seconds total
			console.log('[PendingTransactionScreen] Transaction in mempool', {
				status: newStatus,
				estimatedTime: newEstimatedTime,
				blockTime,
				calculation: `blockTime (${blockTime}s) + confirmation (${blockTime}s) = ${newEstimatedTime}s`
			});
		} else if (txData.status === 0) {
			// Transaction failed - stop polling and show error
			newStatus = 'sending'; // Keep as sending for now, could add 'failed' state later
			newEstimatedTime = 0;
			console.log('[PendingTransactionScreen] Transaction failed - stopping polling', {
				status: newStatus,
				estimatedTime: newEstimatedTime
			});
			// Stop polling on error
			if (pollingInterval) {
				clearInterval(pollingInterval);
				pollingInterval = null;
				console.log('[PendingTransactionScreen] Polling stopped due to transaction error');
			}
		} else if (confirmations >= targetConfirmations) {
			// Transaction has enough confirmations - consider it successful IMMEDIATELY
			// For Rootstock, 1 confirmation is sufficient
			newStatus = 'success';
			newEstimatedTime = 0;
			console.log('[PendingTransactionScreen] Transaction confirmed - showing success immediately', {
				status: newStatus,
				confirmations,
				targetConfirmations,
				estimatedTime: newEstimatedTime,
				isRootstock
			});
			// Stop polling once confirmed
			if (pollingInterval) {
				clearInterval(pollingInterval);
				pollingInterval = null;
				console.log('[PendingTransactionScreen] Polling stopped - transaction confirmed');
			}
			// Stop countdown timer as well
			if (countdownInterval) {
				clearInterval(countdownInterval);
				countdownInterval = null;
				console.log('[PendingTransactionScreen] Countdown stopped - transaction confirmed');
			}
		} else {
			// Transaction in block but not yet confirmed (0 confirmations or status unknown)
			// Estimate time until we get 1 confirmation
			newStatus = 'confirming';
			const blockTime = networkInfo?.confirmationTime || 30;
			// Calculate time needed: (target - current) * blockTime
			// If we have 0 confirmations and need 1, that's 1 * 30 = 30 seconds
			newEstimatedTime = calculateEstimatedTime(confirmations, targetConfirmations, blockTime);
			console.log('[PendingTransactionScreen] Transaction confirming', {
				status: newStatus,
				confirmations,
				targetConfirmations,
				blockTime,
				estimatedTime: newEstimatedTime,
				calculation: `(${targetConfirmations} - ${confirmations}) * ${blockTime}s = ${newEstimatedTime}s`,
				txStatus: txData.status,
				isRootstock
			});
		}

		// Update state
		// Note: We already checked for success at the start of the function and returned early
		// But error can be set here, so we need to handle it

		const statusChanged = status !== newStatus;
		const timeChanged = estimatedTimeRemaining !== newEstimatedTime;
		const confirmationsChanged = oldConfirmations !== confirmations;
		const isErrorStatus = (newStatus as TransactionStatus) === 'error';
		const newErrorValue = isErrorStatus ? $t('wallet.send.transaction_failed') : null;
		const errorChanged = errorMessage !== newErrorValue;

		if (statusChanged || timeChanged || confirmationsChanged || errorChanged) {
			console.log('[PendingTransactionScreen] Updating state', {
				statusChanged,
				oldStatus: status,
				newStatus,
				timeChanged,
				oldTime: estimatedTimeRemaining,
				newTime: newEstimatedTime,
				confirmationsChanged,
				oldConfirmations,
				newConfirmations: confirmations,
				errorChanged,
				isErrorStatus
			});

			status = newStatus;
			estimatedTimeRemaining = newEstimatedTime;
			if (isErrorStatus) {
				errorMessage = newErrorValue;
			}
		} else {
			console.log('[PendingTransactionScreen] No state changes needed');
		}
	}

	// Derived values for UI
	const statusConfig = $derived.by(() => {
		switch (status) {
			case 'sending':
				return {
					color: 'primary',
					bgColor: 'bg-primary/20',
					textColor: 'text-primary',
					title: $t('wallet.send.status.sending')
				};
			case 'confirming':
				return {
					color: 'warning',
					bgColor: 'bg-warning/20',
					textColor: 'text-warning',
					title: $t('wallet.send.status.confirming')
				};
			case 'success':
				return {
					color: 'success',
					bgColor: 'bg-success/20',
					textColor: 'text-success',
					title: $t('wallet.send.status.success')
				};
			case 'error':
				return {
					color: 'error',
					bgColor: 'bg-error/20',
					textColor: 'text-error',
					title: errorMessage || $t('wallet.send.transaction_failed')
				};
		}
	});

	const displayTimeRemaining = $derived.by(() => {
		if (estimatedTimeRemaining === null) return null;
		if (estimatedTimeRemaining <= 0) return 0;
		return Math.ceil(estimatedTimeRemaining);
	});

	let countdownInterval: ReturnType<typeof setInterval> | null = null;

	// Start/restart polling when txHash or swapId becomes valid
	$effect(() => {
		// For lightning, check swapId; for others, check txHash and apiUrl
		const isLightning = network === 'lightning-bitcoin';
		const isValidForLightning = isLightning && swapId && txHash && txHash !== 'pending';
		const isValidForOthers = !isLightning && txHash && txHash !== 'pending' && apiUrl;
		const shouldPoll = (isValidForLightning || isValidForOthers) && status !== 'success' && status !== 'error';
		
		console.log('[PendingTransactionScreen] txHash/swapId effect triggered', {
			txHash,
			swapId,
			network,
			apiUrl,
			isLightning,
			isValidForLightning,
			isValidForOthers,
			shouldPoll,
			hasPollingInterval: !!pollingInterval,
			hasCountdownInterval: !!countdownInterval,
			currentStatus: status,
			timestamp: new Date().toISOString()
		});

		// Clear existing polling if txHash/swapId changes
		if (pollingInterval) {
			console.log('[PendingTransactionScreen] Clearing existing polling interval');
			clearInterval(pollingInterval);
			pollingInterval = null;
		}

		// Keep countdown timer running - it will decrement the estimatedTimeRemaining
		// which is updated by API polling based on actual confirmations

		// Start polling if we have valid data and status is not already success/error
		if (shouldPoll) {
			console.log('[PendingTransactionScreen] Starting polling', {
				txHash,
				swapId,
				apiUrl,
				network,
				pollInterval: '3000ms',
				currentStatus: status
			});

			// Initial fetch immediately
			console.log('[PendingTransactionScreen] Performing initial fetch...');
			updateTransactionStatus();

			// Poll every 3 seconds, but only if status is not success/error
			pollingInterval = setInterval(() => {
				// Stop polling if transaction is already confirmed or errored
				const currentStatus: TransactionStatus = status; // Capture to avoid type narrowing
				if (currentStatus === 'success' || currentStatus === 'error') {
					console.log('[PendingTransactionScreen] Polling stopped - transaction in final state', {
						status: currentStatus
					});
					if (pollingInterval) {
						clearInterval(pollingInterval);
						pollingInterval = null;
					}
					return;
				}
				
				console.log('[PendingTransactionScreen] Polling interval triggered', {
					timestamp: new Date().toISOString(),
					currentStatus: status
				});
				updateTransactionStatus();
			}, 3000);

			console.log('[PendingTransactionScreen] Polling interval set', {
				intervalId: pollingInterval
			});
		} else {
			console.warn('[PendingTransactionScreen] Polling not started', {
				reason: isLightning 
					? (!swapId ? 'No swapId' : !txHash || txHash === 'pending' ? 'txHash is pending' : 'Status is final')
					: (!txHash ? 'No txHash' : txHash === 'pending' ? 'txHash is pending placeholder' : !apiUrl ? 'No API URL' : 'Status is final'),
				txHash,
				swapId,
				apiUrl,
				network,
				status
			});
		}

		// Cleanup function
		return () => {
			if (pollingInterval) {
				console.log('[PendingTransactionScreen] Cleaning up polling interval from effect');
				clearInterval(pollingInterval);
				pollingInterval = null;
			}
			if (countdownInterval) {
				console.log('[PendingTransactionScreen] Cleaning up countdown interval from effect');
				clearInterval(countdownInterval);
				countdownInterval = null;
			}
		};
	});

	// Initialize component state
	onMount(() => {
		console.log('[PendingTransactionScreen] Component mounted', {
			txHash,
			network,
			apiUrl,
			hasNetworkInfo: !!networkInfo,
			networkInfo: networkInfo ? {
				name: networkInfo.name,
				confirmationTime: networkInfo.confirmationTime
			} : null,
			timestamp: new Date().toISOString()
		});

		// Initial status
		status = 'sending';
		estimatedTimeRemaining = networkInfo?.confirmationTime || 60;

		console.log('[PendingTransactionScreen] Initial state set', {
			status,
			estimatedTimeRemaining,
			txHash,
			swapId,
			txHashValid: !!(txHash && txHash !== 'pending'),
			hasApiUrl: !!apiUrl
		});

		// Start countdown timer - always runs to show estimated time
		// The API polling will update estimatedTimeRemaining, and countdown will decrement it
		console.log('[PendingTransactionScreen] Starting countdown timer');
		
		countdownInterval = setInterval(() => {
			// Don't countdown if already successful or errored
			const currentStatus = status; // Capture to avoid type narrowing
			if (currentStatus === 'success' || currentStatus === 'error') {
				return;
			}
			
			if (estimatedTimeRemaining !== null && estimatedTimeRemaining > 0) {
				const oldTime = estimatedTimeRemaining;
				estimatedTimeRemaining = Math.max(0, estimatedTimeRemaining - 1);
				if (oldTime !== estimatedTimeRemaining && estimatedTimeRemaining % 5 === 0) {
					// Log every 5 seconds to avoid spam
					console.log('[PendingTransactionScreen] Countdown updated', {
						estimatedTimeRemaining,
						status,
						confirmations
					});
				}
			}
		}, 1000);

		console.log('[PendingTransactionScreen] Countdown interval set', {
			intervalId: countdownInterval
		});
	});

	onDestroy(() => {
		console.log('[PendingTransactionScreen] Component destroyed', {
			hasPollingInterval: !!pollingInterval,
			hasCountdownInterval: !!countdownInterval,
			finalStatus: status,
			finalConfirmations: confirmations,
			finalEstimatedTime: estimatedTimeRemaining
		});

		if (pollingInterval) {
			clearInterval(pollingInterval);
			pollingInterval = null;
			console.log('[PendingTransactionScreen] Polling interval cleared');
		}
		if (countdownInterval) {
			clearInterval(countdownInterval);
			countdownInterval = null;
			console.log('[PendingTransactionScreen] Countdown interval cleared');
		}
	});
</script>

<div class="flex flex-1 flex-col min-h-0 bg-base-100 w-full h-full">
	<!-- Pending Transaction Content -->
	<div class="flex flex-1 flex-col items-center justify-center gap-6 py-8 px-4 overflow-y-auto min-h-0 w-full">
		<!-- Transaction Status -->
		<div class="flex flex-col items-center gap-4" transition:fade={{ duration: 300 }}>
			<div
				class="flex h-24 w-24 items-center justify-center rounded-full sm:h-32 sm:w-32 transition-all duration-500 {statusConfig.bgColor} {statusConfig.textColor}"
				transition:scale={{ duration: 300 }}
			>
				{#if status === 'confirming'}
					<IconLoading class="h-[77px] w-[77px] sm:h-[102px] sm:w-[102px] animate-spin" />
				{:else if status === 'sending'}
					<IconClockOutline class="h-[77px] w-[77px] sm:h-[102px] sm:w-[102px]" />
				{:else if status === 'success'}
					<IconCheckCircle class="h-[77px] w-[77px] sm:h-[102px] sm:w-[102px]" />
				{:else if status === 'error'}
					<IconAlertCircle class="h-[77px] w-[77px] sm:h-[102px] sm:w-[102px]" />
				{/if}
			</div>
			<div class="text-center space-y-2">
				<h3 class="text-xl font-bold sm:text-2xl transition-colors duration-500 {statusConfig.textColor}">
					{statusConfig.title}
				</h3>
				{#if displayTimeRemaining !== null && displayTimeRemaining > 0}
					<p class="text-base-content/70 text-xs sm:text-sm">{$t('wallet.debug_wallet.send_form.estimated_time_remaining')}</p>
					<p class="text-base-content/70 text-sm sm:text-base">
						<span class="font-semibold {statusConfig.textColor} text-2xl sm:text-3xl">{displayTimeRemaining}s</span>
					</p>
				{:else if status === 'success'}
					<p class="text-base-content/70 text-xs sm:text-sm">{$t('wallet.send.status.confirmed')}</p>
				{:else if status === 'error'}
					<p class="text-base-content/70 text-xs sm:text-sm text-error">
						{errorMessage || $t('wallet.send.transaction_failed')}
					</p>
				{/if}
				{#if confirmations > 0 && network !== 'lightning-bitcoin'}
					<p class="text-base-content/70 text-xs sm:text-sm">
						{$t('wallet.send.status.confirmations')}: <span class="font-semibold">{confirmations}</span>
					</p>
				{/if}
			</div>
		</div>

		<!-- Safe to Close Note -->
		{#if status === 'sending' || status === 'confirming'}
			<p class="text-base-content/70 text-center text-sm max-w-md">
				{$t('wallet.send.can_close_safely')}
			</p>
		{/if}

		<!-- Transaction Details Card -->
		<div class="card bg-base-200 w-full max-w-md p-4 space-y-4">
			<!-- Amount Display -->
			<div class="space-y-2">
				<div class="text-sm font-medium opacity-70">{$t('wallet.send.amount')}</div>
				<div class="space-y-1">
					<div class="font-semibold text-lg">
						{formatSats(amountSats)} {$t('wallet.sats')}
					</div>
					<div class="text-sm opacity-70">
						≈ {formatUsd(amountUSD)}
					</div>
				</div>
			</div>

			<!-- Network Display -->
			{#if networkInfo}
				<div class="space-y-2">
					<div class="text-sm font-medium opacity-70">{$t('wallet.network')}</div>
					<div class="border-base-300 bg-primary/10 rounded-lg border p-1.5 sm:p-2">
						<div class="flex items-center justify-between gap-1.5 pl-1.5 sm:gap-2 sm:pl-2">
							<div class="flex items-center gap-1.5 sm:gap-2">
								{#if networkInfo.icon}
									<img src={networkInfo.icon} alt={networkInfo.name} class="h-4 w-4 sm:h-5 sm:w-5" />
								{/if}
								<span class="text-sm font-medium sm:text-base">{networkInfo.name}</span>
							</div>
							{#if explorerUrl}
								<a
									href={explorerUrl}
									target="_blank"
									rel="noopener noreferrer"
									class="btn btn-ghost btn-sm btn-circle shrink-0 touch-manipulation transition-transform duration-100 select-none active:scale-95"
									style="-webkit-tap-highlight-color: transparent;"
									aria-label={$t('wallet.view_explorer')}
									onclick={() => triggerHaptic(ImpactStyle.Light)}
								>
									<IconOpenInNew class="h-4 w-4 sm:h-5 sm:w-5" />
								</a>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- Address Display -->
			<div class="space-y-2">
				<div class="text-sm font-medium opacity-70">{$t('wallet.send.address_or_invoice')}</div>
				<div class="font-mono text-sm break-all">{formatAddress(address)}</div>
			</div>
		</div>
	</div>

	<!-- Close Button -->
	<div class="shrink-0 p-4 pt-0">
		<button
			class="btn btn-error w-full min-h-[48px] touch-manipulation transition-transform duration-100 select-none active:scale-95 md:min-h-[56px]"
			style="-webkit-tap-highlight-color: transparent;"
			onclick={() => {
				triggerHaptic(ImpactStyle.Light);
				onClose();
			}}
		>
			<IconClose class="mr-2 h-5 w-5" />
			{$t('common.buttons.close')}
		</button>
	</div>
</div>
