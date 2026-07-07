<script lang="ts">
	import { t, locale } from 'svelte-i18n';
	import { onDestroy } from 'svelte';
	import {
		allAssets,
		totalBalances,
		walletManager,
		formatSats,
		walletStore
	} from '$lib/stores/wallet.store';
	import { appStore } from '$lib/stores/app.store';
	import IconHelpCircle from '~icons/mdi/help-circle';
	import IconRefresh from '~icons/mdi/refresh';
	import IconEye from '~icons/mdi/eye';
	import IconEyeOff from '~icons/mdi/eye-off';
	import IconFileDocument from '~icons/mdi/file-document';
	import IconCash from '~icons/mdi/cash';
	import balanceHistoryService from '$lib/api/services/balanceHistory.service';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { openHelpModal } from '$lib/runes/helpModal.svelte';
	import DefiPositionCard from './defi/DefiPositionCard.svelte';

	// Chain ID → logo path for tier 2 tokens
	const CHAIN_LOGOS: Record<number, string> = {
		56: '/images/chains/Binance-logo.svg',
		10: '/images/chains/optimism.png',
		250: '/images/chains/fantom.png',
		100: '/images/chains/ethereum.png', // Gnosis
		42220: '/images/chains/celo.png',
		42161: '/images/chains/arbitrum.png',
		43114: '/images/chains/avalanche.png',
		137: '/images/chains/polygon.png',
		8453: '/images/chains/base.png',
		1: '/images/chains/ethereum.png'
	};

	let {
		isLoading = false,
		hideDetails = false,
		overrideTotalUsd,
		overrideSats,
		overrideUsdt,
		balancesHidden: propBalancesHidden,
		onToggleBalances,
		onManageLoans
	} = $props<{
		isLoading?: boolean;
		hideDetails?: boolean;
		overrideTotalUsd?: number | null;
		overrideSats?: number | null;
		overrideUsdt?: number | null;
		balancesHidden?: boolean;
		onToggleBalances?: (hidden: boolean) => void;
		onManageLoans?: () => void;
	}>();

	// Refresh state
	let isRefreshing = $state(false);

	// Balance visibility state — uses external prop if provided, else internal state
	let _internalHidden = $state(process.env.NODE_ENV !== 'development');
	let balancesHidden = $derived(propBalancesHidden ?? _internalHidden);
	let countdownSeconds = $state(0);
	let countdownInterval: ReturnType<typeof setInterval> | null = null;

	// Accordion expansion state
	let bitcoinExpanded = $state(false);
	let usdExpanded = $state(false);

	// Cached currency formatter — avoids re-creating Intl.NumberFormat on every derive
	let currencyFmt = $derived(
		new Intl.NumberFormat($locale ?? 'en-US', { style: 'currency', currency: 'USD' })
	);

	// Get Bitcoin asset (RBTC)
	let bitcoinAsset = $derived($allAssets.find((a) => a.assetId === 'rbtc'));

	// USD-based assets
	let usdt0ArbAsset = $derived($allAssets.find((a) => a.assetId === 'usdt0-arb'));
	let usdt0RskAsset = $derived($allAssets.find((a) => a.assetId === 'usdt0-rsk'));
	let docBalance = $derived($allAssets.find((a) => a.assetId === 'doc-rsk')?.balance ?? 0);
	let usdt0RskBalance = $derived(usdt0RskAsset?.balance ?? 0);

	// All tier 2 assets (USDT/USDC on BSC, Polygon, Arbitrum USDC, etc.)
	let tier2UsdAssets = $derived($allAssets.filter((a) => /^\d+-[A-Z]+$/.test(a.assetId)));

	// wBTC (Arbitrum wrapped BTC) — always shown under Bitcoin accordion
	let wbtcAsset = $derived($allAssets.find((a) => a.assetId === 'wbtc-arb'));

	// tBTC (Arbitrum bridged BTC) — shown under Bitcoin accordion if balance > 0
	let tbtcAsset = $derived($allAssets.find((a) => a.assetId === 'tbtc-arb'));

	function showBalances() {
		_internalHidden = false;
		onToggleBalances?.(false);
		countdownSeconds = 45;

		if (countdownInterval) {
			clearInterval(countdownInterval);
		}

		countdownInterval = setInterval(() => {
			countdownSeconds--;
			if (countdownSeconds <= 0) {
				hideBalances();
			}
		}, 1000);
	}

	function hideBalances() {
		_internalHidden = true;
		onToggleBalances?.(true);
		countdownSeconds = 0;
		if (countdownInterval) {
			clearInterval(countdownInterval);
			countdownInterval = null;
		}
	}

	function toggleBalances() {
		if (balancesHidden) {
			showBalances();
		} else {
			hideBalances();
		}
	}

	async function handleRefresh() {
		if (isRefreshing) return;

		isRefreshing = true;
		try {
			balanceHistoryService.clearCaches();
			await walletManager.loadAssets(true);
			appStore.showSuccessToast($t('wallet.balance_refreshed'));
		} catch (error) {
			console.error('Failed to refresh balances:', error);
			appStore.showErrorToast($t('wallet.refresh_failed'));
		} finally {
			isRefreshing = false;
		}
	}

	onDestroy(() => {
		if (countdownInterval) {
			clearInterval(countdownInterval);
		}
	});

	function handleHelpClick(e: MouseEvent | KeyboardEvent) {
		e.stopPropagation();
		openHelpModal();
	}

	// Compute balance display values
	let combinedTotal = $derived.by(() => {
		if (isLoading) return null;
		if (balancesHidden) return '••••';
		if (overrideTotalUsd !== undefined) return overrideTotalUsd.toFixed(2);
		return ($totalBalances?.usd ?? 0).toFixed(2);
	});

	let satsDisplay = $derived.by(() => {
		if (balancesHidden) return '••••';
		if (hideDetails) {
			if (overrideSats != null) return overrideSats > 0 ? formatSats(overrideSats) : '0';
			return '0';
		}
		const rbtcSats = $totalBalances?.sats ?? 0;
		const wbtcSats = wbtcAsset ? Math.floor((wbtcAsset.balance ?? 0) * 100_000_000) : 0;
		const total = rbtcSats + wbtcSats;
		return total > 0 ? formatSats(total) : '0';
	});

	let usdtDisplay = $derived.by(() => {
		if (balancesHidden) return '$••••';
		let usdVal: number;
		if (hideDetails) {
			usdVal = overrideUsdt ?? 0;
		} else {
			usdVal = usdt0ArbAsset?.usdValue ?? usdt0ArbAsset?.balance ?? 0;
		}
		return currencyFmt.format(usdVal);
	});

	let satsUsdInline = $derived.by(() => {
		if (balancesHidden) return '($••••)';
		const rbtcSats = overrideSats ?? $totalBalances?.sats ?? 0;
		const wbtcSats = wbtcAsset ? Math.floor((wbtcAsset.balance ?? 0) * 100_000_000) : 0;
		const totalSats = rbtcSats + wbtcSats;
		const usdValue = (totalSats / 100_000_000) * btcPrice.price;
		return `(${currencyFmt.format(usdValue)})`;
	});

	// Balance staleness indicator
	const lastRefresh = $derived($walletStore.lastBalanceRefresh ?? 0);
	const staleness = $derived.by(() => {
		const age = Date.now() - lastRefresh;
		if (age < 60_000) return null; // < 1 min: fresh
		if (age < 300_000) return 'recent'; // < 5 min: slightly stale
		return 'stale'; // > 5 min: stale
	});

	function formatAge(ms: number): string {
		const mins = Math.floor(ms / 60_000);
		if (mins < 1) return $t('wallet.toast.just_now');
		if (mins < 60) return $t('wallet.toast.minutes_ago', { values: { n: mins } });
		const hours = Math.floor(mins / 60);
		return $t('wallet.toast.hours_ago', { values: { n: hours } });
	}
</script>

{#snippet satsBalanceRow(
	logoSrc: string,
	logoAlt: string,
	name: string,
	satsValue: number,
	usdValue: number
)}
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-1.5 sm:gap-2">
			<img src={logoSrc} alt={logoAlt} class="h-4 w-4 sm:h-5 sm:w-5" />
			<span class="text-sm font-medium sm:text-base">{name}</span>
		</div>
		<div class="text-right">
			{#if balancesHidden}
				<div class="text-sm font-semibold sm:text-base">
					•••• {$t('wallet.sats')}
				</div>
				<div class="text-xs opacity-70">$••••</div>
			{:else}
				<div class="text-sm font-semibold sm:text-base">
					{formatSats(satsValue)}
					{$t('wallet.sats')}
				</div>
				{#if usdValue > 0}
					<div class="text-xs opacity-70">${usdValue.toFixed(2)}</div>
				{/if}
			{/if}
		</div>
	</div>
{/snippet}

{#snippet usdBalanceRow(
	logoSrc: string,
	logoAlt: string,
	name: string,
	usdValue: number,
	icon?: 'document' | 'cash'
)}
	<div class="flex items-center gap-1.5 sm:gap-2">
		{#if icon === 'document'}
			<IconFileDocument class="text-base-content/60 h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
		{:else if icon === 'cash'}
			<IconCash class="text-base-content/60 h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
		{:else}
			<img src={logoSrc} alt={logoAlt} class="h-4 w-4 sm:h-5 sm:w-5" />
		{/if}
		<span class="text-sm font-medium sm:text-base">{name}</span>
		<div class="ml-auto text-sm font-semibold sm:text-base">
			{#if balancesHidden}
				••••
			{:else}
				${usdValue.toFixed(2)}
			{/if}
		</div>
	</div>
{/snippet}

{#snippet helpButton()}
	<button
		type="button"
		class="shrink-0 cursor-pointer p-0.5 text-white opacity-80 hover:bg-transparent hover:text-white hover:opacity-100 sm:ml-1 sm:p-1"
		onclick={handleHelpClick}
		aria-label={$t('wallet.learn_more')}
	>
		<IconHelpCircle class="h-6 w-6" />
	</button>
{/snippet}

{#snippet toggleButton()}
	<button
		type="button"
		class="bg-base-100 text-base-content border-base-content/20 hover:bg-base-200 hover:shadow-3xl flex shrink-0 items-center gap-1 rounded-full border-2 p-1.5 shadow-2xl transition-all duration-200 hover:scale-110 active:scale-95 sm:p-2"
		onclick={toggleBalances}
		aria-label={balancesHidden ? $t('wallet.show_balances') : $t('wallet.hide_balances')}
	>
		{#if balancesHidden}
			<IconEyeOff class="h-6 w-6" />
			<span class="text-xs font-semibold sm:text-sm">{$t('wallet.show')}</span>
		{:else}
			<IconEye class="h-6 w-6" />
			{#if countdownSeconds > 0}
				<span class="text-xs font-semibold sm:text-sm">{countdownSeconds}s</span>
			{/if}
		{/if}
	</button>
{/snippet}

{#snippet refreshButton()}
	<button
		type="button"
		class="bg-base-100 text-base-content border-base-content/20 hover:bg-base-200 hover:shadow-3xl shrink-0 rounded-full border-2 p-1.5 shadow-2xl transition-all duration-200 hover:scale-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-2xl sm:p-2"
		onclick={handleRefresh}
		disabled={isRefreshing}
		aria-label={$t('wallet.refresh_balance')}
	>
		<IconRefresh class={isRefreshing ? 'h-6 w-6 animate-spin' : 'h-6 w-6'} />
	</button>
{/snippet}

<div class="flex flex-col space-y-3 sm:space-y-4" data-hide-details={hideDetails || undefined}>
	<!-- Total Portfolio Value Card -->
	<div class="card bg-primary relative rounded-lg bg-linear-to-br text-white shadow-xl">
		<div class="card-body p-3 sm:p-4">
			<div class="flex flex-col gap-1 sm:gap-0.5">
				<!-- Grand total + toggle -->
				<div class="flex items-center gap-2">
					{#if isLoading || combinedTotal === null}
						<p
							class="inline-flex flex-1 items-center gap-2 text-2xl font-bold text-white sm:text-3xl"
						>
							<span class="inline-flex items-center gap-2">
								<span class="loading loading-spinner loading-sm sm:loading-md"></span>
								{$t('wallet.usd')}
							</span>
							{@render helpButton()}
						</p>
					{:else}
						<p
							class="inline-flex flex-1 items-center gap-2 text-2xl font-bold text-white sm:text-3xl"
						>
							≈ ${combinedTotal}
							{@render helpButton()}
						</p>
					{/if}
					{@render toggleButton()}
				</div>
				<!-- Breakdown + refresh -->
				<div class="flex items-center gap-2">
					{#if isLoading}
						<p class="flex-1 text-base font-bold text-white opacity-70 sm:text-lg">
							<span class="loading loading-spinner loading-xs"></span>
						</p>
					{:else}
						<div class="flex-1 text-base font-bold text-white opacity-70 sm:text-lg">
							<div>{satsDisplay} {$t('wallet.sats')} {satsUsdInline}</div>
							<div>
								{usdtDisplay}
								{$t('wallet.usd')}
							</div>
						</div>
					{/if}
					{#if staleness === 'stale'}
						<button
							type="button"
							class="cursor-pointer text-xs text-white/40 hover:text-white/70"
							onclick={handleRefresh}
						>
							{$t('wallet.balance.updated_ago', {
								values: { time: formatAge(Date.now() - lastRefresh) }
							})}
						</button>
					{/if}
					{@render refreshButton()}
				</div>
			</div>
		</div>
	</div>

	{#if !hideDetails}
		<!-- Network Breakdown -->
		<div class="space-y-2 sm:space-y-4">
			<!-- Bitcoin Accordion -->
			<div
				class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
				class:collapse-open={bitcoinExpanded}
			>
				<button
					type="button"
					class="collapse-title flex items-center justify-between px-3 py-2 pr-10 text-left text-sm font-medium sm:px-4 sm:py-3 sm:pr-12 sm:text-base"
					onclick={() => (bitcoinExpanded = !bitcoinExpanded)}
				>
					<div class="flex min-w-0 flex-1 items-center gap-2">
						<img
							src="/images/chains/Bitcoin.svg"
							alt="Bitcoin"
							class="h-5 w-5 shrink-0 sm:h-6 sm:w-6"
						/>
						<span>{$t('wallet.bitcoin')}</span>
						<div
							class="btn btn-ghost btn-xs shrink-0 cursor-pointer p-0.5 sm:p-1"
							aria-hidden="true"
							onclick={handleHelpClick}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									handleHelpClick(e);
								}
							}}
						>
							<IconHelpCircle class="text-base-content/70 hover:text-base-content h-5 w-5" />
						</div>
					</div>
					<div class="ml-2 shrink-0 text-right">
						{#if isLoading}
							<div class="flex h-9 w-9 flex-col items-end justify-center gap-0.5">
								<span class="loading loading-spinner loading-md"></span>
							</div>
						{:else if balancesHidden}
							<div class="text-sm font-semibold sm:text-base">
								•••• {$t('wallet.sats')}
							</div>
							<div class="text-xs opacity-70 sm:text-sm">≈ $••••</div>
						{:else}
							{@const totalBtcSats =
								($totalBalances?.sats ?? 0) + Math.floor((wbtcAsset?.balance ?? 0) * 100_000_000)}
							{@const totalBtcUsd =
								(bitcoinAsset?.usdValue ?? 0) +
								(wbtcAsset?.usdValue ?? 0) +
								(tbtcAsset?.usdValue ?? 0)}
							<div class="text-sm font-semibold sm:text-base">
								{formatSats(totalBtcSats)}
								{$t('wallet.sats')}
							</div>
							{#if totalBtcUsd > 0}
								<div class="text-xs opacity-70 sm:text-sm">
									≈ ${totalBtcUsd.toFixed(2)}
								</div>
							{/if}
						{/if}
					</div>
				</button>
				<div class="collapse-content">
					<div class="space-y-1.5 px-3 sm:space-y-2 sm:px-4">
						{@render satsBalanceRow(
							'/images/chains/Bitcoin-Rootstock-logo.webp',
							'Rootstock',
							$t('wallet.l2_btc'),
							Math.floor((bitcoinAsset?.balance ?? 0) * 100_000_000),
							bitcoinAsset?.usdValue ?? 0
						)}

						{@render satsBalanceRow(
							'/images/chains/arbitrum.png',
							'Arbitrum',
							$t('wallet.wbtc_arbitrum'),
							Math.floor((wbtcAsset?.balance ?? 0) * 100_000_000),
							wbtcAsset?.usdValue ?? 0
						)}

						{#if tbtcAsset && tbtcAsset.balance > 0}
							{@render satsBalanceRow(
								'/images/tokens/tbtc.png',
								'tBTC',
								$t('wallet.tbtc_arbitrum'),
								Math.floor(tbtcAsset.balance * 100_000_000),
								tbtcAsset.usdValue ?? 0
							)}
						{/if}
					</div>
				</div>
			</div>

			<!-- USD Accordion -->
			<div
				class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
				class:collapse-open={usdExpanded}
			>
				<button
					type="button"
					class="collapse-title flex min-h-0 items-center justify-between px-3 py-2 pr-10 text-left text-sm font-medium sm:px-4 sm:py-3 sm:pr-12 sm:text-base"
					onclick={() => (usdExpanded = !usdExpanded)}
				>
					<div class="flex min-w-0 flex-1 items-center gap-2">
						<img
							src="/images/chains/Tether-USD.svg"
							alt="USD"
							class="h-5 w-5 shrink-0 sm:h-6 sm:w-6"
						/>
						<span>{$t('wallet.usd')}</span>
					</div>
					<div class="ml-2 shrink-0 text-right">
						{#if isLoading}
							<div class="text-sm font-semibold sm:text-base">
								<span class="loading loading-spinner loading-sm"></span>
							</div>
						{:else if balancesHidden}
							<div class="text-sm font-semibold sm:text-base">$••••</div>
						{:else if usdt0ArbAsset}
							<div class="text-sm font-semibold sm:text-base">
								${usdt0ArbAsset.usdValue.toFixed(2)}
							</div>
						{:else}
							<div class="text-sm font-semibold sm:text-base">$0.00</div>
						{/if}
					</div>
				</button>
				<div class="collapse-content">
					<div class="space-y-1.5 px-2 sm:space-y-2">
						{@render usdBalanceRow(
							'/images/chains/arbitrum.png',
							$t('wallet.usdt0_arbitrum'),
							$t('wallet.usdt0_arbitrum'),
							usdt0ArbAsset?.usdValue ?? 0
						)}

						{#if docBalance > 0}
							{@render usdBalanceRow('', '', 'DOC (RSK)', docBalance, 'document')}
						{/if}

						{#if usdt0RskBalance > 0}
							{@render usdBalanceRow('', '', 'USDT0 (RSK)', usdt0RskBalance, 'cash')}
						{/if}

						{#each tier2UsdAssets as asset (asset.assetId)}
							{@const chainId = parseInt(asset.assetId.split('-')[0])}
							{@render usdBalanceRow(CHAIN_LOGOS[chainId] ?? '', '', asset.name, asset.usdValue)}
						{/each}
					</div>
				</div>
			</div>

			<!-- Loan Accordion -->
			<DefiPositionCard onManage={onManageLoans} />
		</div>
	{/if}
</div>

<style>
	div[data-hide-details] > :nth-child(2),
	div[data-hide-details] > :global(.balancehistory-wrapper),
	div[data-hide-details] > :nth-child(3) {
		display: none;
	}
</style>
