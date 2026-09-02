<script lang="ts">
	import { t } from 'svelte-i18n';
	import { TOKENS } from '$lib/wallet/gasless.config';

	interface Transaction {
		txHash: string;
		tokenAddress: string;
		amount: bigint;
		recipient: string;
		feePaid: bigint;
		status: 'pending' | 'success' | 'failed';
		timestamp: number;
	}

	let {
		transactions = [],
		filterToken = null,
		onTransactionClick
	}: {
		transactions?: Transaction[];
		filterToken?: string | null;
		onTransactionClick?: (txHash: string) => void;
	} = $props();

	// Filtered transactions
	const filteredTransactions = $derived.by(() => {
		if (!filterToken) return transactions;
		return transactions.filter(tx => tx.tokenAddress.toLowerCase() === filterToken.toLowerCase());
	});

	// Get token symbol for display
	function getTokenSymbol(address: string): string {
		return TOKENS.find(t => t.address.toLowerCase() === address.toLowerCase())?.symbol || '???';
	}

	// Get token decimals for formatting
	function getTokenDecimals(address: string): number {
		return TOKENS.find(t => t.address.toLowerCase() === address.toLowerCase())?.decimals || 18;
	}

	// Format amount for display
	function formatAmount(amount: bigint, tokenAddress: string): string {
		const decimals = getTokenDecimals(tokenAddress);
		const divisor = BigInt(10 ** decimals);
		const wholePart = amount / divisor;
		const fractionalPart = amount % divisor;
		const fracStr = fractionalPart.toString().padStart(decimals, '0').replace(/\.?0+$/, '');
		return fracStr ? `${wholePart.toString()}.${fracStr}` : wholePart.toString();
	}

	// Truncate address for display
	function truncateAddress(addr: string): string {
		if (addr.length > 12) return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
		return addr;
	}

	// Status indicator color
	function statusColor(status: string): string {
		switch (status) {
			case 'pending': return 'text-warning';
			case 'success': return 'text-success';
			case 'failed': return 'text-error';
			default: return 'text-base-content/50';
		}
	}

	// Format timestamp
	function formatTime(ts: number): string {
		const d = new Date(ts);
		return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}
</script>

<div class="space-y-2">
	<div class="text-sm font-medium opacity-70">{$t('wallet.gasless_history.title')}</div>
	
	{#if filteredTransactions.length === 0}
		<div class="border-base-300 bg-base-200 rounded-box border p-4 text-center">
			<span class="text-base-content/50 text-sm">{$t('wallet.gasless_history.no_transactions')}</span>
		</div>
	{:else}
		<div class="space-y-2">
			{#each filteredTransactions as tx (tx.txHash)}
				<button
					class="border-base-300 bg-base-200 hover:bg-base-300 rounded-box border p-3 w-full text-left transition-colors"
					onclick={() => onTransactionClick?.(tx.txHash)}
				>
					<div class="flex items-center justify-between">
						<div class="space-y-1">
							<div class="flex items-center gap-2">
								<span class="text-sm font-semibold">
									{formatAmount(tx.amount, tx.tokenAddress)}
								</span>
								<span class="badge badge-xs badge-outline">
									{getTokenSymbol(tx.tokenAddress)}
								</span>
							</div>
							<div class="text-xs opacity-60">
								{$t('wallet.gasless_history.to')} {truncateAddress(tx.recipient)}
							</div>
						</div>
						<div class="text-right">
							<div class="{statusColor(tx.status)} text-xs font-medium">
								{$t(`wallet.gasless_history.status_${tx.status}`)}
							</div>
							<div class="text-base-content/50 text-xs">
								{formatTime(tx.timestamp)}
							</div>
							{#if tx.feePaid > 0n}
								<div class="text-xs opacity-60">
									{$t('wallet.gasless_history.fee')}: {formatAmount(tx.feePaid, tx.tokenAddress)} {getTokenSymbol(tx.tokenAddress)}
							</div>
							{/if}
						</div>
					</div>
			</button>
		{/each}
		</div>
	{/if}
</div>
