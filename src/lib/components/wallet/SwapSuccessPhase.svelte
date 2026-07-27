<script lang="ts">
	import { t } from 'svelte-i18n';
	import { scale } from 'svelte/transition';
	import SwapPartyCard from '$lib/components/wallet/SwapPartyCard.svelte';
	import SwapEstimateCard from '$lib/components/wallet/SwapEstimateCard.svelte';
	import { ARROW_SVG_PATH } from '$lib/utils/swap-helpers';

	interface Props {
		isDirectTransfer: boolean;
		sourceAsset: string;
		sourceIcon: string;
		sourceType: string;
		destType: string;
		selectedDest: { asset: string; icon: string; id: string };
		sourceWalletInfo: string;
		destWalletInfo: string;
		sourceAmount: string;
		estimatedOutput: string;
		actualOutput?: string;
		btcUsdPrice: number;
		satsUsd: (sats: number, price: number) => string;
		usdFormatter: Intl.NumberFormat;
		isBitcoinAsset: (asset?: string, id?: string) => boolean;
		isBtcSource: boolean;
		swapResult: { txHash?: string; swapId?: string } | null;
		providerLabel: string;
		feePercent?: number;
		estimatedTime?: string;
		sourceWallet: string;
		destWallet: string;
		sourceWalletType?: string;
		sourceWalletAddress?: string;
		destWalletType?: string;
		destWalletAddress?: string;
		sourceAssetName: string;
		destAssetName: string;
		onReset: () => void;
		walletLabel: (id: string) => string;
	}

	let {
		isDirectTransfer,
		sourceAsset,
		sourceIcon,
		sourceType,
		destType,
		selectedDest,
		sourceWalletInfo,
		destWalletInfo,
		sourceAmount,
		estimatedOutput,
		actualOutput,
		btcUsdPrice,
		satsUsd,
		usdFormatter,
		isBitcoinAsset,
		isBtcSource,
		swapResult,
		providerLabel,
		feePercent = 0,
		estimatedTime = '—',
		sourceWallet,
		destWallet,
		sourceWalletType,
		sourceWalletAddress,
		destWalletType,
		destWalletAddress,
		sourceAssetName,
		destAssetName,
		onReset,
		walletLabel
	}: Props = $props();

	let explorerUrl = $derived.by(() => {
		// For gasless relay swaps, use the Arbitrum tx hash
		if (swapResult?.txHash && swapResult.txHash.startsWith('0x')) {
			return `https://arbiscan.io/tx/${swapResult.txHash}`;
		}
		if (!swapResult?.swapId) return '';
		const hash = swapResult.swapId;

		// Boltz swap IDs are alphanumeric (e.g., "x57324Iqo4HB"), not hex TX hashes.
		// Link to Boltz swap tracker instead of a blockchain explorer.
		const isBoltzId = !hash.startsWith('0x');
		if (isBoltzId) {
			return `https://boltz.exchange/swap/${hash}`;
		}

		// Real TX hash — link to the appropriate blockchain explorer
		if (sourceType === 'rbtc') return `https://explorer.rootstock.io/tx/${hash}`;
		if (
			sourceType === 'wbtc-arb' ||
			sourceType === 'tbtc-arb' ||
			destType === 'usdt0-arb' ||
			destType === 'wbtc-arb'
		) {
			return `https://arbiscan.io/tx/${hash}`;
		}
		// Cross-chain from Arbitrum: show Arbiscan for the source tx
		if (sourceType === 'usdt0-arb' && destType === 'rbtc-rsk') {
			return `https://arbiscan.io/tx/${hash}`;
		}
		// Unknown chain combination — don't show a misleading explorer link
		return '';
	});

	// Detect partial delivery (slippage)
	let hasSlippage = $derived.by(() => {
		if (!actualOutput || !estimatedOutput) return false;
		const est = parseFloat(estimatedOutput);
		const act = parseFloat(actualOutput);
		if (est <= 0 || act <= 0) return false;
		return Math.abs(act - est) / est > 0.01; // More than 1% difference
	});
</script>

<div class="flex flex-col gap-4" transition:scale={{ duration: 300, start: 0.95 }}>
	<!-- Success Header -->
	<div class="flex flex-col items-center gap-2 py-2">
		<div class="bg-success/10 rounded-full p-3">
			<svg
				class="text-success h-10 w-10 sm:h-12 sm:w-12"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
		</div>
		<h4 class="text-lg font-bold sm:text-xl">
			{isDirectTransfer ? $t('wallet.swap.send_complete') : $t('wallet.swap.swap_complete')}
		</h4>
		{#if isDirectTransfer}
			<p class="text-base-content/60 text-xs sm:text-sm">
				{sourceAsset}
				{$t('wallet.swap.sent_from')}
				{walletLabel(sourceWallet)}
				{$t('wallet.swap.sent_to')}
				{walletLabel(destWallet)}
			</p>
		{/if}
	</div>

	<!-- Transaction Summary Cards -->
	<div class="bg-base-200 space-y-3 rounded-xl p-4">
		<SwapPartyCard
			role="source"
			walletInfo={sourceWalletInfo}
			asset={sourceAsset}
			icon={sourceIcon}
			amountDisplay={isBtcSource
				? satsUsd(Math.round(parseFloat(sourceAmount || '0')), btcUsdPrice)
				: `${usdFormatter.format(parseFloat(sourceAmount || '0'))} ${sourceAsset}`}
			variant="success"
			{isDirectTransfer}
			walletType={sourceWalletType}
			walletAddress={sourceWalletAddress}
			assetName={sourceAssetName}
		/>

		<!-- Provider bridge kept (small) -->
		<div class="flex items-center justify-center">
			<div class="bg-base-100 flex items-center gap-2 rounded-full px-3 py-1 text-xs">
				{#if isDirectTransfer}
					<svg
						class="text-success h-3 w-3 shrink-0"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d={ARROW_SVG_PATH}
						/></svg
					>
					<span class="text-success font-medium">{$t('wallet.swap.direct_send')}</span>
				{:else}
					<span>{providerLabel}</span>
					<svg
						class="text-primary h-3 w-3 shrink-0"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d={ARROW_SVG_PATH}
						/></svg
					>
				{/if}
			</div>
		</div>

		<SwapPartyCard
			role="dest"
			walletInfo={destWalletInfo}
			asset={selectedDest.asset}
			icon={selectedDest.icon}
			amountDisplay={isBitcoinAsset(selectedDest.asset, selectedDest.id)
				? satsUsd(Math.round(parseFloat(estimatedOutput) * 100_000_000), btcUsdPrice)
				: `${usdFormatter.format(parseFloat(estimatedOutput))} ${selectedDest.asset}`}
			variant="success"
			{isDirectTransfer}
			walletType={destWalletType}
			walletAddress={destWalletAddress}
			assetName={destAssetName}
		/>
	</div>

	<!-- Fee + Time row — only for swaps (uses SwapEstimateCard for DRY, success-fee variant) -->
	{#if !isDirectTransfer}
		<SwapEstimateCard variant="success-fee" {feePercent} {estimatedTime} {isDirectTransfer} />
	{/if}

	<!-- Partial delivery / slippage notice -->
	{#if hasSlippage}
		<div class="bg-warning/10 border-warning/20 rounded-lg border p-3 text-xs">
			<p class="text-warning font-medium">{$t('wallet.swap.partial_delivery') || 'Partial delivery'}</p>
			<p class="text-base-content/60 mt-1">
				{$t('wallet.swap.partial_delivery_desc', {
					values: {
						actual: isBitcoinAsset(selectedDest.asset, selectedDest.id)
							? satsUsd(Math.round(parseFloat(actualOutput!) * 100_000_000), btcUsdPrice)
							: `${usdFormatter.format(parseFloat(actualOutput!))} ${selectedDest.asset}`,
						expected: isBitcoinAsset(selectedDest.asset, selectedDest.id)
							? satsUsd(Math.round(parseFloat(estimatedOutput) * 100_000_000), btcUsdPrice)
							: `${usdFormatter.format(parseFloat(estimatedOutput))} ${selectedDest.asset}`
					}
				}) || `Received ${actualOutput} (expected ${estimatedOutput}). The difference is due to bridge fees and slippage.`}
			</p>
		</div>
	{/if}

	<!-- TX link — only shown when we have a valid explorer URL -->
	{#if swapResult?.swapId && explorerUrl}
		{@const hash = swapResult.txHash || swapResult.swapId}
		{@const truncated = `${hash.slice(0, 6)}...${hash.slice(-4)}`}
		<a
			href={explorerUrl}
			target="_blank"
			rel="noopener noreferrer"
			class="bg-base-200 hover:bg-base-300 flex items-center gap-2 rounded-xl p-3 text-xs transition-colors sm:text-sm"
		>
			<span class="text-base-content/60">TX:</span>
			<span class="font-mono">{truncated}</span>
			<svg
				class="text-base-content/40 ml-auto h-4 w-4 shrink-0"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				><path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
				/></svg
			>
		</a>
	{/if}

	<!-- Cross-chain delivery note -->
	{#if sourceType !== destType && !isDirectTransfer}
		<div class="bg-info/10 border-info/20 rounded-lg border p-3 text-xs">
			<p class="text-info font-medium">{$t('wallet.swap.cross_chain_delivery_note') || 'Cross-chain delivery'}</p>
			<p class="text-base-content/60 mt-1">
				{$t('wallet.swap.cross_chain_delivery_desc') || 'Your funds are being bridged to the destination chain. This may take a few minutes to complete. Your balance will update automatically.'}
			</p>
		</div>
	{/if}

	<!-- Navigate away note -->
	<p class="text-base-content/50 px-1 text-center text-xs italic">
		{$t('wallet.swap.navigate_away_note')}
	</p>

	<button
		class="btn btn-primary min-h-[44px] touch-manipulation active:scale-95 sm:min-h-[48px]"
		onclick={onReset}
	>
		{$t('wallet.swap.swap_another')}
	</button>
</div>
