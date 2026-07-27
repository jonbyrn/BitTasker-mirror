<script lang="ts">
	import { t, locale } from 'svelte-i18n';
	import { fly } from 'svelte/transition';
	import SwapPartyCard from '$lib/components/wallet/SwapPartyCard.svelte';
	import { formatSats } from '$lib/stores/wallet.store';
	import { ARROW_SVG_PATH } from '$lib/utils/swap-helpers';

	interface Props {
		isDirectTransfer: boolean;
		sourceWalletInfo: string;
		destWalletInfo: string;
		sourceAsset: string;
		sourceIcon: string;
		sourceType: string;
		selectedDest: { asset: string; icon: string };
		amountDisplay: string;
		sourceUsdEquivalent?: string;
		destAmountDisplay: string;
		destUsdEquivalent?: string;
		providerLabel: string;
		estimatedTime?: string;
		totalFeeSats: number;
		btcUsdPrice: number;
		feeDisplay: string;
		sourceWalletType?: string;
		sourceWalletAddress?: string;
		destWalletType?: string;
		destWalletAddress?: string;
		sourceAssetName: string;
		destAssetName: string;
		showSatsSource: boolean;
		showSatsDest: boolean;
		route?: { hops: Array<{ service: string; fromAsset?: string; toAsset?: string; fromChain?: string; toChain?: string }> } | null;
	}

	let {
		isDirectTransfer,
		sourceWalletInfo,
		destWalletInfo,
		sourceAsset,
		sourceIcon,
		sourceType,
		selectedDest,
		amountDisplay,
		sourceUsdEquivalent,
		destAmountDisplay,
		destUsdEquivalent,
		providerLabel,
		estimatedTime,
		totalFeeSats,
		btcUsdPrice,
		feeDisplay,
		sourceWalletType,
		sourceWalletAddress,
		destWalletType,
		destWalletAddress,
		sourceAssetName,
		destAssetName,
		showSatsSource,
		showSatsDest,
		route = null
	}: Props = $props();

	const usdFormatter = $derived(
		new Intl.NumberFormat($locale ?? 'en', {
			style: 'currency',
			currency: 'USD'
		})
	);
</script>

<div transition:fly={{ y: 10, duration: 200 }} class="flex flex-col gap-4">
	<!-- Context-aware header -->
	<div class="flex items-center gap-2">
		{#if isDirectTransfer}
			<svg class="text-info h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
				><path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
				/></svg
			>
		{/if}
		<h4 class="text-base font-semibold sm:text-lg">
			{isDirectTransfer ? $t('wallet.swap.confirm_send') : $t('wallet.swap.confirm_swap')}
		</h4>
	</div>
	{#if isDirectTransfer}
		<p class="text-base-content/60 text-xs sm:text-sm">
			{$t('wallet.swap.direct_transfer_note')}
		</p>
	{/if}

	<!-- Source Card -->
	<div>
		<span class="text-base-content/60 mb-1 block text-xs font-medium">
			{isDirectTransfer ? $t('wallet.swap.send_from') : $t('wallet.swap.you_send')}
		</span>
		<SwapPartyCard
			role="source"
			walletInfo={sourceWalletInfo}
			asset={sourceAsset}
			icon={sourceIcon}
			{amountDisplay}
			usdEquivalent={sourceUsdEquivalent}
			showSatsAbove={showSatsSource}
			chainBadgeIcon={sourceType === 'usdt0-arb' ? '/images/chains/arbitrum.png' : undefined}
			variant="confirm"
			walletType={sourceWalletType}
			walletAddress={sourceWalletAddress}
			assetName={sourceAssetName}
		/>
	</div>

	<!-- Provider / Route / Fee -->
	<div class="flex flex-col items-center gap-1 py-1">
		<div class="bg-base-200 flex items-center gap-2 rounded-full px-4 py-2">
			{#if isDirectTransfer}
				<svg
					class="text-success h-5 w-5 shrink-0"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d={ARROW_SVG_PATH}
					/>
				</svg>
				<span class="text-success text-sm font-semibold">{$t('wallet.swap.direct_send')}</span>
			{:else}
				<svg
					class="text-primary h-4 w-4 shrink-0 sm:h-5 sm:w-5"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d={ARROW_SVG_PATH}
					/>
				</svg>
				<span class="text-sm font-semibold">{providerLabel}</span>
			{/if}
			{#if estimatedTime}
				<span class="text-base-content/50 text-xs">· {estimatedTime}</span>
			{/if}
		</div>
		{#if !isDirectTransfer && totalFeeSats > 0}
			<span class="text-base-content/50 text-xs">
				{feeDisplay}: −{formatSats(totalFeeSats)}
				{$t('wallet.sats')}
				{#if btcUsdPrice > 0 && (totalFeeSats / 100_000_000) * btcUsdPrice >= 0.001}
					≈ {usdFormatter.format((totalFeeSats / 100_000_000) * btcUsdPrice)}
				{/if}
			</span>
		{/if}
	</div>

	<!-- Destination Card -->
	<div>
		<span class="text-base-content/60 mb-1 block text-xs font-medium">
			{isDirectTransfer ? $t('wallet.swap.send_to') : $t('wallet.swap.you_get')}
		</span>
		<SwapPartyCard
			role="dest"
			walletInfo={destWalletInfo}
			asset={selectedDest.asset}
			icon={selectedDest.icon}
			amountDisplay={destAmountDisplay}
			usdEquivalent={destUsdEquivalent}
			showSatsAbove={showSatsDest}
			chainBadgeIcon={selectedDest.asset === 'USDT0' ? '/images/chains/arbitrum.png' : undefined}
			variant="confirm"
			walletType={destWalletType}
			walletAddress={destWalletAddress}
			assetName={destAssetName}
		/>
	</div>

	<!-- Multi-hop route steps disclosure -->
	{#if route && route.hops.length > 1 && !isDirectTransfer}
		<div class="bg-base-200 rounded-lg p-3 text-xs">
			<p class="text-base-content/50 mb-2 font-medium">{$t('wallet.swap.route_steps') || 'Route steps'}</p>
			<div class="space-y-1.5">
				{#each route.hops as hop, i}
					<div class="flex items-center gap-2">
						<span class="text-base-content/40 font-mono">{i + 1}.</span>
						<span class="font-medium">{hop.fromAsset || '...'}</span>
						<svg class="text-base-content/30 h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
						</svg>
						<span class="font-medium">{hop.toAsset || '...'}</span>
						<span class="text-base-content/40 ml-auto">via {hop.service}</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Cross-chain warning removed per user request -->
</div>
