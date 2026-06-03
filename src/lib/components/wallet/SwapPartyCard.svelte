<script lang="ts">
	/**
	 * SwapPartyCard — Reusable source/dest summary card for swap confirm/success phases.
	 * Extracts the duplicated card markup from SwapForm.svelte (confirm source/dest ~1492-1610, success ~1682-1766).
	 *
	 * Props per Phase 2 design in swapform-phase1-logic-extraction-design.md
	 */

	export type SwapPartyRole = 'source' | 'dest';
	export type SwapPartyVariant = 'confirm' | 'success' | 'compact';

	export interface SwapPartyCardProps {
		role: SwapPartyRole;
		walletInfo: string; // "BitTasker (0x1234...abcd)" or label only
		asset: string; // 'rBTC' | 'USDT' | 'wBTC' | 'BTC'
		icon: string; // asset icon url
		amountDisplay: string; // pre-formatted primary e.g. "1,234 sats" or "$12.34"
		usdEquivalent?: string; // optional "≈ $12.34" sub-line (for rbtc/wbtc)
		chainBadgeIcon?: string; // e.g. "/images/chains/arbitrum.png" for USDT0/wbtc-arb
		isDirectTransfer?: boolean;
		variant?: SwapPartyVariant;
		loading?: boolean;
		labelOverride?: string; // e.g. $t('wallet.swap.send_from')
	}

	let {
		role,
		walletInfo,
		asset,
		icon,
		amountDisplay,
		usdEquivalent,
		chainBadgeIcon,
		isDirectTransfer = false,
		variant = 'confirm',
		loading = false,
		labelOverride
	}: SwapPartyCardProps = $props();

	const isConfirm = variant === 'confirm';
	const isSuccess = variant === 'success';
	const _isCompact = variant === 'compact';

	const padding = isConfirm ? 'p-3 sm:p-4' : isSuccess ? 'p-4' : 'p-2';
	const iconSize = isConfirm
		? 'h-10 w-10 sm:h-12 sm:w-12'
		: isSuccess
			? 'h-7 w-7 sm:h-8 sm:w-8'
			: 'h-6 w-6';
	const textSize = isConfirm
		? 'text-sm sm:text-base'
		: isSuccess
			? 'text-xs sm:text-sm'
			: 'text-xs';
	const labelText =
		labelOverride ||
		(role === 'source'
			? isDirectTransfer
				? 'Send from'
				: 'You send'
			: isDirectTransfer
				? 'Send to'
				: 'You get');
</script>

<div class="bg-base-200 flex items-center gap-3 rounded-xl {padding}" class:opacity-50={loading}>
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
	<div class="min-w-0 flex-1">
		<div class="text-base-content/60 {textSize}">
			{labelText}
		</div>
		<div class="text-base-content/70 truncate {textSize} font-medium">{walletInfo}</div>
	</div>
	<div class="shrink-0 text-right">
		<div class="font-bold {textSize}">
			{amountDisplay}
		</div>
		{#if usdEquivalent}
			<div class="text-base-content/50 {textSize}">
				{usdEquivalent}
			</div>
		{/if}
	</div>
</div>
