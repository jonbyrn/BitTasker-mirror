<script lang="ts">
	/**
	 * SwapPartyCard — Reusable source/dest summary card for swap confirm/success phases.
	 * Shows: asset icon, wallet icon, asset name, wallet info, amount.
	 * Label ("You send"/"You get") is rendered ABOVE the card by the parent.
	 */

	import WalletIcon from './WalletIcon.svelte';

	export type SwapPartyRole = 'source' | 'dest';
	export type SwapPartyVariant = 'confirm' | 'success' | 'compact';

	export interface SwapPartyCardProps {
		role: SwapPartyRole;
		walletInfo: string;
		asset: string;
		icon: string;
		amountDisplay: string;
		usdEquivalent?: string;
		chainBadgeIcon?: string;
		isDirectTransfer?: boolean;
		variant?: SwapPartyVariant;
		loading?: boolean;
		walletType?: string;
		walletAddress?: string;
		assetName?: string;
		/** When true, shows amountDisplay as primary (sats) and usdEquivalent as smaller dimmed text below. */
		showSatsAbove?: boolean;
	}

	let {
		role: _role,
		walletInfo,
		asset,
		icon,
		amountDisplay,
		usdEquivalent,
		chainBadgeIcon,
		isDirectTransfer: _isDirectTransfer = false,
		variant = 'confirm',
		loading = false,
		walletType,
		walletAddress,
		assetName,
		showSatsAbove = false
	}: SwapPartyCardProps = $props();

	const isConfirm = $derived(variant === 'confirm');
	const isSuccess = $derived(variant === 'success');

	const padding = $derived(isConfirm ? 'p-3 sm:p-4' : isSuccess ? 'p-4' : 'p-2');
	const iconSize = $derived(
		isConfirm ? 'h-10 w-10 sm:h-12 sm:w-12' : isSuccess ? 'h-7 w-7 sm:h-8 sm:w-8' : 'h-6 w-6'
	);
	const textSize = $derived(
		isConfirm ? 'text-sm sm:text-base' : isSuccess ? 'text-xs sm:text-sm' : 'text-xs'
	);

	function formatAddr(addr: string): string {
		if (!addr || addr.length < 10) return '';
		return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
	}
</script>

<div class="bg-base-200 flex items-center gap-3 rounded-xl {padding}" class:opacity-50={loading}>
	<!-- Asset icon with chain badge -->
	<div class="relative shrink-0">
		<img src={icon} alt={asset} class="{iconSize} rounded-full" />
		{#if chainBadgeIcon}
			<img
				src={chainBadgeIcon}
				alt="chain"
				class="border-base-200 absolute -right-0.5 -bottom-0.5 h-4 w-4 rounded-full border sm:h-5 sm:w-5"
			/>
		{/if}
	</div>

	<!-- Wallet icon + info -->
	<div class="flex min-w-0 flex-1 items-center gap-2">
		{#if walletType}
			<WalletIcon {walletType} className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" />
		{/if}
		<div class="min-w-0 flex-1">
			<div class="truncate {textSize} font-medium">
				{assetName || asset}
			</div>
			<div class="text-base-content/50 truncate text-xs">
				{walletInfo}{#if walletAddress}
					· {formatAddr(walletAddress)}{/if}
			</div>
		</div>
	</div>

	<!-- Amount -->
	<div class="shrink-0 text-right">
		{#if showSatsAbove && usdEquivalent}
			<!-- BTC variant: sats on top, USD smaller/dimmed below -->
			<div class="font-bold {textSize}">
				{amountDisplay}
			</div>
			<div class="text-base-content/40 text-xs">
				{usdEquivalent}
			</div>
		{:else}
			<div class="font-bold {textSize}">
				{amountDisplay}
			</div>
			{#if usdEquivalent}
				<div class="text-base-content/50 {textSize}">
					{usdEquivalent}
				</div>
			{/if}
		{/if}
	</div>
</div>
