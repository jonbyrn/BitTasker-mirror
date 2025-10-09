<script lang="ts">
	import type { Payment } from '@breeztech/breez-sdk-liquid/web';
	import type { Transaction as RSKTransaction } from '$lib/types/wallet';
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { ethers } from 'ethers';
	import { combinedWalletState, walletManager } from '$lib/stores/wallet.store';

	// Transaction types
	interface Transaction {
		id: string;
		type: 'send' | 'receive';
		network: 'liquid' | 'rsk' | 'bsc';
		asset: string;
		amount: number;
		formattedAmount: string;
		address?: string;
		timestamp: number;
		status: 'confirmed' | 'pending' | 'failed';
		txHash?: string;
		description?: string;
		fee?: number;
	}

	// State
	let transactions = $state<Transaction[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedFilter = $state<'all' | 'liquid' | 'rsk' | 'bsc' | 'send' | 'receive'>('all');
	let currentPage = $state(0);
	let itemsPerPage = 20;

	// Filtered transactions
	let filteredTransactions = $derived(
		transactions
			.filter((tx) => {
				if (selectedFilter === 'all') return true;
				if (selectedFilter === 'liquid' || selectedFilter === 'rsk' || selectedFilter === 'bsc') {
					return tx.network === selectedFilter;
				}
				if (selectedFilter === 'send' || selectedFilter === 'receive') {
					return tx.type === selectedFilter;
				}
				return true;
			})
			.sort((a, b) => b.timestamp - a.timestamp)
	);

	// Paginated transactions
	let paginatedTransactions = $derived(
		filteredTransactions.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage)
	);

	let totalPages = $derived(Math.ceil(filteredTransactions.length / itemsPerPage));

	onMount(() => {
		loadTransactions();
	});

	async function loadTransactions() {
		isLoading = true;
		error = null;

		try {
			// Load transactions using the combined wallet manager
			await walletManager.loadTransactions();

			// Get transactions from the combined store and convert them to our interface
			const storeTransactions = $combinedWalletState.transactions;
			const convertedTransactions: Transaction[] = [];
			console.log({ storeTransactions });

			for (const tx of storeTransactions) {
				// Check if it's a Breez Payment (Liquid) or a blockchain Transaction (RSK/BSC)
				if ('paymentType' in tx) {
					// It's a Breez Payment (Liquid network)
					const payment = tx as Payment;
					const isReceive = payment.paymentType === 'receive';
					const timestamp = payment.timestamp * 1000; // Convert to milliseconds

					// Get asset info
					let asset = 'L-BTC';
					let formattedAmount = `${(payment.amountSat / 100_000_000).toFixed(8).replace(/\.?0+$/, '')} L-BTC`;

					// Check if it's a different asset
					if (
						payment.details.type === 'liquid' &&
						'assetId' in payment.details &&
						payment.details.assetId
					) {
						// Handle other Liquid assets (USDt, etc.)
						// Mainnet USDt asset ID
						if (
							payment.details.assetId ===
							'ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2'
						) {
							asset = 'USDt';
							formattedAmount = `${(payment.amountSat / 100_000_000).toFixed(2)} USDt`;
						}
						// Testnet USDt asset ID
						else if (
							payment.details.assetId ===
							'b612eb46313a2cd6ebabd8b7a8eed5696e29898b87a43bff41c94f51acef9d73'
						) {
							asset = 'USDt';
							formattedAmount = `${(payment.amountSat / 100_000_000).toFixed(2)} USDt`;
						}
						// Other assets - show first 6 chars of asset ID
						else {
							asset = payment.details.assetId.slice(0, 6) + '...';
							formattedAmount = `${(payment.amountSat / 100_000_000).toFixed(8).replace(/\.?0+$/, '')} ${asset}`;
						}
					}

					convertedTransactions.push({
						id: payment.txId || `liquid-${payment.timestamp}-${payment.amountSat}`,
						type: isReceive ? 'receive' : 'send',
						network: 'liquid' as const,
						asset,
						amount: payment.amountSat,
						formattedAmount,
						address: payment.destination,
						timestamp,
						status: getBreezTransactionStatus(payment),
						txHash: payment.txId,
						description: getBreezTransactionDescription(payment),
						fee: payment.feesSat
					});
				} else if ('network' in tx) {
					// It's a blockchain Transaction (RSK or BSC)
					const blockchainTx = tx as RSKTransaction;

					if (blockchainTx.network === 'bsc') {
						// BSC Transaction
						let asset = 'BNB';
						let amount = 0;
						let formattedAmount = '';

						if (blockchainTx.tokenSymbol) {
							// Token transaction (USDT)
							asset = blockchainTx.tokenSymbol;
							amount = parseFloat(ethers.formatUnits(blockchainTx.value, 18));
							formattedAmount = `${amount.toFixed(6)} ${blockchainTx.tokenSymbol}`;
						} else {
							// BNB transaction
							amount = parseFloat(ethers.formatEther(blockchainTx.value));
							formattedAmount = `${amount.toFixed(6)} BNB`;
						}

						// Calculate fee if available
						let fee: number | undefined;
						if (
							blockchainTx.gasUsed &&
							blockchainTx.gasUsed !== '0' &&
							blockchainTx.gasPrice &&
							blockchainTx.gasPrice !== '0'
						) {
							try {
								const feeWei = BigInt(blockchainTx.gasUsed) * BigInt(blockchainTx.gasPrice);
								fee = parseFloat(ethers.formatEther(feeWei));
							} catch (error) {
								console.warn('Failed to calculate BSC transaction fee:', error);
							}
						}

						convertedTransactions.push({
							id: blockchainTx.hash || `bsc-${blockchainTx.timestamp}-${blockchainTx.value}`,
							type: blockchainTx.type as 'send' | 'receive',
							network: 'bsc' as const,
							asset,
							amount,
							formattedAmount,
							address: blockchainTx.to,
							timestamp: blockchainTx.timestamp,
							status: blockchainTx.status as 'confirmed' | 'pending' | 'failed',
							txHash: blockchainTx.hash,
							description: getBSCTransactionDescription(blockchainTx),
							fee
						});
					} else {
						// RSK Transaction
						const rskTx = blockchainTx;
						const amount = parseFloat(ethers.formatEther(rskTx.value || '0'));
						const formattedAmount = `${amount.toFixed(6)} rBTC`;

						// Calculate fee if available
						let fee: number | undefined;
						if (
							rskTx.gasUsed &&
							rskTx.gasUsed !== '0' &&
							rskTx.gasPrice &&
							rskTx.gasPrice !== '0'
						) {
							try {
								const feeWei = BigInt(rskTx.gasUsed) * BigInt(rskTx.gasPrice);
								fee = parseFloat(ethers.formatEther(feeWei));
							} catch (error) {
								console.warn('Failed to calculate transaction fee:', error);
							}
						}

						convertedTransactions.push({
							id: rskTx.hash || `rsk-${rskTx.timestamp}-${rskTx.value}`,
							type: rskTx.type as 'send' | 'receive',
							network: 'rsk' as const,
							asset: 'rBTC',
							amount,
							formattedAmount,
							address: rskTx.to,
							timestamp: rskTx.timestamp,
							status: rskTx.status as 'confirmed' | 'pending' | 'failed',
							txHash: rskTx.hash,
							description: getTransactionDescription(rskTx),
							fee
						});
					}
				} else {
					// Fallback: Legacy transaction without network property
					console.warn('Transaction without network property:', tx);
				}
			}

			// Sort by timestamp (newest first)
			transactions = convertedTransactions.sort((a, b) => b.timestamp - a.timestamp);
		} catch (err) {
			console.error('Failed to load transactions:', err);
			error = err instanceof Error ? err.message : $t('wallet.failed_to_load_transactions');
		} finally {
			isLoading = false;
		}
	}

	async function refreshTransactions() {
		await loadTransactions();
	}

	function getBreezTransactionStatus(tx: Payment): 'confirmed' | 'pending' | 'failed' {
		if (tx.status === 'pending') return 'pending';
		if (tx.status === 'failed') return 'failed';
		return 'confirmed';
	}

	function getBreezTransactionDescription(tx: Payment): string {
		if (tx.paymentType === 'receive') {
			if (tx.details.type === 'lightning') {
				return 'Lightning payment received';
			} else if (tx.details.type === 'liquid') {
				return 'Liquid payment received';
			}
			return 'Payment received';
		} else {
			if (tx.details.type === 'lightning') {
				return 'Lightning payment sent';
			} else if (tx.details.type === 'liquid') {
				return 'Liquid payment sent';
			}
			return 'Payment sent';
		}
	}

	function getTransactionDescription(tx: RSKTransaction): string {
		if (tx.type === 'send') {
			return 'RSK transaction sent';
		} else if (tx.type === 'receive') {
			return 'RSK payment received';
		} else if (tx.type === 'contract') {
			return 'Smart contract interaction';
		}
		return 'RSK transaction';
	}

	function getBSCTransactionDescription(tx: any): string {
		if (tx.type === 'send') {
			return tx.tokenSymbol ? `BSC ${tx.tokenSymbol} sent` : 'BSC BNB sent';
		} else if (tx.type === 'receive') {
			return tx.tokenSymbol ? `BSC ${tx.tokenSymbol} received` : 'BSC BNB received';
		} else if (tx.type === 'contract') {
			return 'BSC smart contract interaction';
		}
		return 'BSC transaction';
	}

	function getTranslatedStatus(status: string): string {
		switch (status) {
			case 'confirmed':
				return 'Confirmed';
			case 'pending':
				return 'Pending';
			case 'failed':
				return 'Failed';
			default:
				return status;
		}
	}

	function getStatusBadgeClass(status: string): string {
		switch (status) {
			case 'confirmed':
				return 'badge-success';
			case 'pending':
				return 'badge-warning';
			case 'failed':
				return 'badge-error';
			default:
				return 'badge-ghost';
		}
	}

	function getNetworkIcon(network: string): string {
		switch (network) {
			case 'liquid':
				return '/images/chains/Liquid-Bitcoin.svg';
			case 'rsk':
				return '/images/chains/Bitcoin-Rootstock-logo.webp';
			case 'bsc':
				return '/images/chains/Binance-logo.svg';
			default:
				return '/images/chains/Bitcoin.svg';
		}
	}

	function getNetworkDisplayName(network: string): string {
		switch (network) {
			case 'liquid':
				return 'Liquid Bitcoin';
			case 'rsk':
				return 'Rootstock Bitcoin';
			case 'bsc':
				return 'Binance Smart Chain';
			default:
				return 'Unknown Network';
		}
	}

	function getTypeIcon(type: string): string {
		return type === 'receive' ? '↓' : '↑';
	}

	function formatTimestamp(timestamp: number): string {
		return (
			new Date(timestamp).toLocaleDateString() + ' ' + new Date(timestamp).toLocaleTimeString()
		);
	}

	function formatAddress(address?: string): string {
		if (!address) return '';
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}

	function openExplorer(txHash?: string, network?: string) {
		if (!txHash) return;

		let explorerUrl = '';
		if (network === 'liquid') {
			explorerUrl = `https://liquid.network/tx/${txHash}`;
		} else if (network === 'rsk') {
			// Use the correct RSK explorer based on network (default to testnet for now)
			const rskNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
			if (rskNetwork === 'mainnet') {
				explorerUrl = `https://rootstock.blockscout.com/tx/${txHash}`;
			} else {
				explorerUrl = `https://rootstock-testnet.blockscout.com/tx/${txHash}`;
			}
		} else if (network === 'bsc') {
			// Use BSC explorer based on network
			const bscNetwork = import.meta.env.VITE_BSC_NETWORK || 'testnet';
			if (bscNetwork === 'mainnet') {
				explorerUrl = `https://bscscan.com/tx/${txHash}`;
			} else {
				explorerUrl = `https://testnet.bscscan.com/tx/${txHash}`;
			}
		}

		if (explorerUrl) {
			window.open(explorerUrl, '_blank');
		}
	}

	function nextPage() {
		if (currentPage < totalPages - 1) {
			currentPage++;
		}
	}

	function prevPage() {
		if (currentPage > 0) {
			currentPage--;
		}
	}

	function goToPage(page: number) {
		if (page >= 0 && page < totalPages) {
			currentPage = page;
		}
	}
</script>

<div class="space-y-6">
	<div class="flex flex-wrap gap-4">
		<h3 class="text-lg font-semibold">{$t('wallet.transaction_history')}</h3>
		<button
			class="btn btn-outline btn-sm self-start sm:self-auto"
			onclick={refreshTransactions}
			disabled={isLoading}
		>
			{#if isLoading}
				<span class="loading loading-spinner loading-xs"></span>
			{:else}
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
						d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
					/>
				</svg>
			{/if}
			{$t('wallet.refresh')}
		</button>
	</div>

	<!-- Filter Tabs -->
	<div class="overflow-x-auto">
		<div class="tabs tabs-boxed min-w-max">
			<button
				class="tab {selectedFilter === 'all' ? 'tab-active' : ''} whitespace-nowrap"
				onclick={() => {
					selectedFilter = 'all';
					currentPage = 0;
				}}
			>
				{$t('wallet.all')} ({transactions.length})
			</button>
			<button
				class="tab {selectedFilter === 'liquid' ? 'tab-active' : ''} whitespace-nowrap"
				onclick={() => {
					selectedFilter = 'liquid';
					currentPage = 0;
				}}
			>
				<img
					src="/images/chains/Liquid-Bitcoin.svg"
					alt="Liquid Bitcoin"
					class="mr-1 inline h-4 w-4"
				/>
				Liquid Bitcoin ({transactions.filter((tx) => tx.network === 'liquid').length})
			</button>
			<button
				class="tab {selectedFilter === 'rsk' ? 'tab-active' : ''} whitespace-nowrap"
				onclick={() => {
					selectedFilter = 'rsk';
					currentPage = 0;
				}}
			>
				<img
					src="/images/chains/Bitcoin-Rootstock-logo.webp"
					alt="Rootstock Bitcoin"
					class="mr-1 inline h-4 w-4"
				/>
				Rootstock Bitcoin ({transactions.filter((tx) => tx.network === 'rsk').length})
			</button>
			<button
				class="tab {selectedFilter === 'bsc' ? 'tab-active' : ''} whitespace-nowrap"
				onclick={() => {
					selectedFilter = 'bsc';
					currentPage = 0;
				}}
			>
				<img
					src="/images/chains/Binance-logo.svg"
					alt="Binance Smart Chain"
					class="mr-1 inline h-4 w-4"
				/>
				BSC ({transactions.filter((tx) => tx.network === 'bsc').length})
			</button>
			<button
				class="tab {selectedFilter === 'send' ? 'tab-active' : ''} whitespace-nowrap"
				onclick={() => {
					selectedFilter = 'send';
					currentPage = 0;
				}}
			>
				↑ {$t('wallet.sent')} ({transactions.filter((tx) => tx.type === 'send').length})
			</button>
			<button
				class="tab {selectedFilter === 'receive' ? 'tab-active' : ''} whitespace-nowrap"
				onclick={() => {
					selectedFilter = 'receive';
					currentPage = 0;
				}}
			>
				↓ {$t('wallet.received')} ({transactions.filter((tx) => tx.type === 'receive').length})
			</button>
		</div>
	</div>

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

	{#if isLoading}
		<div class="space-y-4">
			{#each Array(5) as _}
				<div class="card bg-base-200 animate-pulse">
					<div class="card-body">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<div class="bg-base-300 h-8 w-8 rounded-full"></div>
								<div class="space-y-2">
									<div class="bg-base-300 h-4 w-32 rounded"></div>
									<div class="bg-base-300 h-3 w-24 rounded"></div>
								</div>
							</div>
							<div class="space-y-2 text-right">
								<div class="bg-base-300 ml-auto h-4 w-20 rounded"></div>
								<div class="bg-base-300 ml-auto h-3 w-16 rounded"></div>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else if paginatedTransactions.length === 0}
		<div class="py-12 text-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-base-content/30 mx-auto mb-4 h-16 w-16"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1"
					d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
				/>
			</svg>
			<h3 class="mb-2 text-lg font-semibold">{$t('wallet.no_transactions')}</h3>
			<p class="text-base-content/70">
				{selectedFilter === 'all'
					? $t('wallet.no_transactions_yet')
					: $t('wallet.no_transactions_filter')}
			</p>
		</div>
	{:else}
		<!-- Transaction List -->
		<div class="space-y-3">
			{#each paginatedTransactions as tx}
				<div class="card bg-base-200 hover:bg-base-300 transition-colors">
					<div class="card-body p-4">
						<!-- Desktop Layout -->
						<div class="hidden items-center justify-between md:flex">
							<div class="flex items-center gap-3">
								<!-- Network and Type Icons -->
								<div class="flex flex-col items-center">
									{#if getNetworkIcon(tx.network).startsWith('/')}
										<img src={getNetworkIcon(tx.network)} alt="Network icon" class="h-6 w-6" />
									{:else}
										<span class="text-lg">{getNetworkIcon(tx.network)}</span>
									{/if}
									<span class="text-sm {tx.type === 'receive' ? 'text-success' : 'text-warning'}">
										{getTypeIcon(tx.type)}
									</span>
								</div>

								<div class="flex-1">
									<div class="mb-1 flex items-center gap-2">
										<span class="font-semibold capitalize">
											{tx.type === 'send' ? $t('wallet.sent') : $t('wallet.received')}
										</span>
										<div class="badge badge-outline badge-sm text-xs">
											{getNetworkDisplayName(tx.network)}
										</div>
										<div class="badge {getStatusBadgeClass(tx.status)} badge-sm text-xs">
											{getTranslatedStatus(tx.status)}
										</div>
									</div>

									<div class="space-y-1 text-sm opacity-70">
										<div>{formatTimestamp(tx.timestamp)}</div>
										{#if tx.address}
											<div>{$t('wallet.address')}: {formatAddress(tx.address)}</div>
										{/if}
										{#if tx.description}
											<div>{tx.description}</div>
										{/if}
									</div>
								</div>
							</div>

							<div class="text-right">
								<div
									class="font-semibold {tx.type === 'receive' ? 'text-success' : 'text-warning'}"
								>
									{tx.type === 'receive' ? '+' : '-'}{tx.formattedAmount}
								</div>
								{#if tx.fee}
									<div class="text-xs opacity-70">
										{$t('wallet.transaction_fee')}: {tx.fee}
										{tx.asset}
									</div>
								{/if}
								{#if tx.txHash}
									<button
										class="btn btn-ghost btn-xs mt-1"
										onclick={() => openExplorer(tx.txHash, tx.network)}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-3 w-3"
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
										{$t('wallet.view_explorer')}
									</button>
								{/if}
							</div>
						</div>

						<!-- Mobile Layout -->
						<div class="space-y-3 md:hidden">
							<!-- Header Row -->
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-3">
									<div class="flex items-center gap-1">
										{#if getNetworkIcon(tx.network).startsWith('/')}
											<img src={getNetworkIcon(tx.network)} alt="Network icon" class="h-6 w-6" />
										{:else}
											<span class="text-lg">{getNetworkIcon(tx.network)}</span>
										{/if}
										<span class="text-sm {tx.type === 'receive' ? 'text-success' : 'text-warning'}">
											{getTypeIcon(tx.type)}
										</span>
									</div>
									<span class="font-semibold capitalize">
										{tx.type === 'send' ? $t('wallet.sent') : $t('wallet.received')}
									</span>
								</div>
								<div
									class="font-semibold {tx.type === 'receive' ? 'text-success' : 'text-warning'}"
								>
									{tx.type === 'receive' ? '+' : '-'}{tx.formattedAmount}
								</div>
							</div>

							<!-- Badges Row -->
							<div class="flex items-center gap-2">
								<div class="badge badge-outline badge-sm text-xs">
									{getNetworkDisplayName(tx.network)}
								</div>
								<div class="badge {getStatusBadgeClass(tx.status)} badge-sm text-xs">
									{getTranslatedStatus(tx.status)}
								</div>
							</div>

							<!-- Details -->
							<div class="space-y-1 text-sm opacity-70">
								<div>{formatTimestamp(tx.timestamp)}</div>
								{#if tx.address}
									<div>{$t('wallet.address')}: {formatAddress(tx.address)}</div>
								{/if}
								{#if tx.description}
									<div>{tx.description}</div>
								{/if}
								{#if tx.fee}
									<div class="text-xs">
										{$t('wallet.transaction_fee')}: {tx.fee}
										{tx.asset}
									</div>
								{/if}
							</div>

							<!-- Action Button -->
							{#if tx.txHash}
								<div class="flex justify-end">
									<button
										class="btn btn-ghost btn-xs"
										onclick={() => openExplorer(tx.txHash, tx.network)}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-3 w-3"
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
										{$t('wallet.view_explorer')}
									</button>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>

		<!-- Pagination -->
		{#if totalPages > 1}
			<div class="flex justify-center">
				<div class="join">
					<button class="join-item btn btn-sm" onclick={prevPage} disabled={currentPage === 0}>
						«
					</button>

					{#each Array(Math.min(5, totalPages)) as _, i}
						{@const pageNum = Math.max(0, Math.min(totalPages - 5, currentPage - 2)) + i}
						{#if pageNum < totalPages}
							<button
								class="join-item btn btn-sm {currentPage === pageNum ? 'btn-active' : ''}"
								onclick={() => goToPage(pageNum)}
							>
								{pageNum + 1}
							</button>
						{/if}
					{/each}

					<button
						class="join-item btn btn-sm"
						onclick={nextPage}
						disabled={currentPage === totalPages - 1}
					>
						»
					</button>
				</div>
			</div>

			<div class="text-center text-sm opacity-70">
				{$t('wallet.showing_page')}
				{currentPage + 1}
				{$t('wallet.of')}
				{totalPages}
				({filteredTransactions.length}
				{$t('wallet.total_transactions')})
			</div>
		{/if}
	{/if}
</div>
