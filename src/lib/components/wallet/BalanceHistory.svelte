<script lang="ts">
	/**
	 * BalanceHistory Accordion
	 *
	 * Closed: "Activity · Last 24h" with 24h change inline
	 * Expanded: 7d + 30d rows, plus "View Historical Chart" button
	 */
	import { t } from 'svelte-i18n';
	import { walletStore, totalBalances, allAssets, formatSats } from '$lib/stores/wallet.store';
	import balanceHistoryService from '$lib/api/services/balanceHistory.service';
	import BalanceChartModal from './BalanceChartModal.svelte';
	import IconChevronRight from '~icons/mdi/chevron-right';
	import IconChartLine from '~icons/mdi/chart-line';
	import IconFormatListBulleted from '~icons/mdi/format-list-bulleted';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';

	let {
		balancesHidden,
		overrideSats = 0,
		overrideUsd = 0,
		overrideProvider = null,
		overrideAddress = '',
		onOpenTransactions
	}: {
		balancesHidden: boolean;
		overrideSats?: number;
		overrideUsd?: number;
		overrideProvider?: Record<string, unknown> | null;
		overrideAddress?: string;
		onOpenTransactions?: () => void;
	} = $props();

	let showChartModal = $state(false);
	let expanded = $state(false);

	// Period labels for the 3 comparison rows
	const periodLabels = [
		{ key: 'wallet.balance_history.24h', index: 0 },
		{ key: 'wallet.balance_history.7d', index: 1 },
		{ key: 'wallet.balance_history.30d', index: 2 }
	];

	/**
	 * Compute the wallet's RBTC-denominated USD value — BTC value plus
	 * RSK-native stablecoins (USDT/DOC). This excludes BSC, Arbitrum,
	 * and other chain balances so the comparison against historical
	 * RSK-only snapshots is valid.
	 */
	let rskUsd = $derived.by(() => {
		const sats = $totalBalances.sats;
		const rskBtcUsd = (sats / 100_000_000) * btcPrice.price;

		// Sum RSK-native stablecoin balances (USDT on RSK, DOC)
		let stablecoinUsd = 0;
		for (const asset of $allAssets) {
			if (
				(asset.assetId === 'usdt0-rsk' || asset.assetId === 'doc-rsk') &&
				typeof asset.balance === 'number'
			) {
				stablecoinUsd += asset.balance;
			}
		}

		return rskBtcUsd + stablecoinUsd;
	});

	/**
	 * Fetch the current RBTC balance directly from the RPC, matching
	 * the data source used for historical balances. This avoids the
	 * Blockscout-vs-RPC discrepancy (~25 sats).
	 */
	let currentRpcSats = $state(0);
	$effect(() => {
		const provider = overrideProvider || $walletStore.rsk.provider;
		const address = overrideAddress || $walletStore.rsk.address;
		if (!address) return;

		// Use public RPC when provider is unavailable (e.g. connected wallet tab)
		// instanceof guard avoids `as` assertions
		let rpcUrl = 'https://public-node.rsk.co';
		if (provider && typeof provider === 'object' && 'connection' in provider) {
			const conn = (provider as Record<string, unknown>).connection;
			if (conn && typeof conn === 'object' && 'url' in conn) {
				rpcUrl = (conn as Record<string, string>).url;
			}
		}
		const controller = new AbortController();

		async function fetchBalance() {
			try {
				const res = await fetch(rpcUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						jsonrpc: '2.0',
						method: 'eth_getBalance',
						params: [address, 'latest'],
						id: 1
					}),
					signal: controller.signal
				});
				const d = await res.json();
				const wei = BigInt(d?.result || '0x0');
				currentRpcSats = Number(wei / BigInt(10_000_000_000n));
			} catch (e) {
				if (e instanceof DOMException && e.name === 'AbortError') return;
				currentRpcSats = overrideSats || $totalBalances.sats;
			}
		}

		fetchBalance();
		return () => controller.abort();
	});

	const hasOverride = $derived(overrideAddress !== '');

	let balanceChangesPromise = $derived.by(() => {
		const sats = currentRpcSats || overrideSats;
		if (!sats) return Promise.resolve([]);
		const usd = hasOverride ? overrideUsd : rskUsd;
		const provider = overrideProvider || $walletStore.rsk.provider;
		const address = overrideAddress || $walletStore.rsk.address;
		return balanceHistoryService.getBalanceChanges(
			sats,
			usd,
			provider as import('ethers').Provider | null,
			address
		);
	});

	const changeFmt = new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});

	function formatChange(satsChange: number | null, usdChange: number | null) {
		if (satsChange === null || usdChange === null) return null;
		const satsLabel = $t('wallet.sats');
		const satsNeutral = satsChange === 0;
		const usdNeutral = usdChange === 0 || Math.abs(usdChange) < 0.01;

		const absUsd = changeFmt.format(Math.abs(usdChange));

		return {
			sats: satsNeutral
				? `${formatSats(Math.abs(satsChange))} ${satsLabel}`
				: satsChange > 0
					? `+${formatSats(Math.abs(satsChange))} ${satsLabel}`
					: `-${formatSats(Math.abs(satsChange))} ${satsLabel}`,
			usd: usdNeutral ? `($0.00)` : usdChange > 0 ? `(+$${absUsd})` : `(-$${absUsd})`,
			satsColor: satsNeutral
				? 'text-base-content/70'
				: satsChange > 0
					? 'text-success'
					: 'text-error',
			usdColor: usdNeutral
				? 'text-base-content/70'
				: usdChange > 0
					? 'text-success/80'
					: 'text-error/80'
		};
	}
</script>

<div
	class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
	class:collapse-open={expanded}
	aria-label={$t('wallet.balance_chart.open_chart')}
>
	<input type="checkbox" bind:checked={expanded} />

	<!-- Title row (always visible) — 24h inline -->
	<div
		class="collapse-title flex min-h-0 items-center justify-between px-3 py-2 pr-10 text-left text-sm font-medium sm:px-4 sm:py-3 sm:pr-12 sm:text-base"
	>
		<span class="text-sm font-medium sm:text-base">
			{$t('wallet.balance_history.label')} ·
			<span class="text-base-content/70">{$t('wallet.balance_history.24h')}</span>
		</span>

		<div class="ml-auto flex items-center gap-3 text-sm sm:text-base">
			{#await balanceChangesPromise}
				<span class="loading loading-spinner loading-xs text-primary"></span>
			{:then changes}
				{#if changes.length > 0}
					{@const f24 = formatChange(changes[0]?.satsChange ?? null, changes[0]?.usdChange ?? null)}
					{#if f24}
						{#if balancesHidden}
							<span class="text-base-content/50">•••• {$t('wallet.sats')}</span>
							<span class="text-base-content/50">••••</span>
						{:else}
							<span class="font-semibold {f24.satsColor}">{f24.sats}</span>
							<span class={f24.usdColor}>{f24.usd}</span>
						{/if}
					{/if}
				{/if}
			{:catch}
				<span class="text-base-content/50 text-xs">—</span>
			{/await}
		</div>
	</div>

	<!-- Expanded body — 7d + 30d rows + chart button -->
	<div class="collapse-content px-3 sm:px-4">
		{#await balanceChangesPromise}
			<div class="flex justify-center py-2">
				<span class="loading loading-spinner loading-sm text-primary"></span>
			</div>
		{:then changes}
			<div class="space-y-2 pt-1">
				<!-- 7d + 30d rows -->
				{#each periodLabels.slice(1) as period (period.key)}
					{#if changes.length > period.index}
						{@const f = formatChange(
							changes[period.index]?.satsChange ?? null,
							changes[period.index]?.usdChange ?? null
						)}
						<div class="flex items-center justify-between gap-3 px-2 py-1.5">
							<span class="text-base-content/70 text-sm">{$t(period.key)}</span>
							<div class="flex items-center gap-3 text-sm sm:text-base">
								{#if f}
									{#if balancesHidden}
										<span class="text-base-content/50">•••• {$t('wallet.sats')}</span>
										<span class="text-base-content/50">••••</span>
									{:else}
										<span class="font-semibold {f.satsColor}">{f.sats}</span>
										<span class={f.usdColor}>{f.usd}</span>
									{/if}
								{:else}
									<span class="loading loading-spinner loading-xs text-primary"></span>
								{/if}
							</div>
						</div>
					{/if}
				{/each}

				<!-- Divider + Chart button + Transactions button -->
				<div class="border-base-300 border-t pt-2">
					<button
						class="hover:bg-primary/10 text-base-content/80 inline-flex min-h-[44px] w-full cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-sm font-medium transition-colors"
						onclick={(e) => {
							e.stopPropagation();
							showChartModal = true;
						}}
					>
						<div class="flex items-center gap-2">
							<IconChartLine class="text-base-content/50 h-4 w-4 shrink-0" />
							<span>{$t('wallet.balance_history.historical_chart')}</span>
						</div>
						<IconChevronRight class="text-base-content/30 h-5 w-5 shrink-0 sm:h-6 sm:w-6" />
					</button>
					{#if onOpenTransactions}
						<button
							class="hover:bg-primary/10 text-base-content/80 inline-flex min-h-[44px] w-full cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-sm font-medium transition-colors"
							onclick={(e) => {
								e.stopPropagation();
								onOpenTransactions();
							}}
						>
							<div class="flex items-center gap-2">
								<IconFormatListBulleted class="text-base-content/50 h-4 w-4 shrink-0" />
								<span>{$t('wallet.tab_transactions')}</span>
							</div>
							<IconChevronRight class="text-base-content/30 h-5 w-5 shrink-0 sm:h-6 sm:w-6" />
						</button>
					{/if}
				</div>
			</div>
		{:catch}
			<div class="py-2 text-center">
				<span class="text-error text-xs">{$t('wallet.balance_history.error')}</span>
			</div>
		{/await}
	</div>
</div>

<BalanceChartModal
	isOpen={showChartModal}
	onClose={() => (showChartModal = false)}
	{overrideAddress}
	{overrideSats}
	{overrideUsd}
/>
