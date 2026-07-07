<script lang="ts">
	import { t } from 'svelte-i18n';
	import { fly } from 'svelte/transition';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import WalletIcon from '$lib/components/wallet/WalletIcon.svelte';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { FULL_RANGE } from '$lib/services/defi/uniswap.service';
	import LPProvideAction from './LPProvideAction.svelte';
	import LPRemoveAction from './LPRemoveAction.svelte';
	import LPCollectAction from './LPCollectAction.svelte';
	import LPCloseAction from './LPCloseAction.svelte';
	import type { UniswapLPPosition } from '$lib/stores/defi-positions.store.svelte';

	type LPAction = 'provide' | 'remove' | 'collect' | 'close';

	interface ActionOption {
		id: LPAction;
		label: string;
		disabled: boolean;
		isError?: boolean;
	}

	interface Props {
		walletId: string;
		address: string;
		position: UniswapLPPosition;
		isExpanded: boolean;
		onToggle: () => void;
		onSuccess: (txHash?: string) => void;
	}

	let { walletId, address, position, isExpanded, onToggle, onSuccess }: Props = $props();

	let activeAction = $state<LPAction>('provide');
	let actionDropdownOpen = $state(false);

	// Wallet display
	let connectedWallet = $derived(
		walletId === 'builtin'
			? null
			: ($connectedWalletsStore.wallets.find((w) => w.id === walletId) ?? null)
	);

	let walletName = $derived(
		walletId === 'builtin' ? $t('wallet.builtin_wallet') : (connectedWallet?.walletName ?? walletId)
	);

	// BTC price
	let currentWbtcPrice = $derived(btcPrice.price);

	// Fee USD: WBTC fees (8 dec) + USDT0 fees (6 dec)
	let feeUsd = $derived.by(() => {
		const wbtcFee = Number(position.fees0) / 1e8;
		const usdt0Fee = Number(position.fees1) / 1e6;
		const wbtcUsd = isFinite(wbtcFee) ? wbtcFee * currentWbtcPrice : 0;
		return (isFinite(wbtcUsd) ? wbtcUsd : 0) + (isFinite(usdt0Fee) ? usdt0Fee : 0);
	});

	let hasFees = $derived(feeUsd > 0.005);

	// Days in position
	let days = $derived.by(() => {
		const ms = Date.now() - position.lastUpdated.getTime();
		return ms > 0 ? Math.floor(ms / 86400000) : 0;
	});

	// Range status (use FULL_RANGE defaults since store doesn't have tick bounds)
	let tickLower = FULL_RANGE.TICK_LOWER;
	let tickUpper = FULL_RANGE.TICK_UPPER;
	let inRange = $derived(position.currentTick >= tickLower && position.currentTick <= tickUpper);

	// Approximate token amounts from liquidity for display
	let wbtcAmount = $derived.by(() => {
		if (!currentWbtcPrice || currentWbtcPrice <= 0 || position.liquidity === 0n) return 0;
		const liqNum = Number(position.liquidity);
		if (!isFinite(liqNum) || liqNum <= 0) return 0;
		const sqrtPrice = Math.sqrt(currentWbtcPrice * 100);
		if (sqrtPrice <= 0) return 0;
		const amount = liqNum / sqrtPrice / 1e8;
		return isFinite(amount) && amount > 0 ? amount : 0;
	});

	let usdt0Amount = $derived.by(() => {
		if (!currentWbtcPrice || currentWbtcPrice <= 0 || position.liquidity === 0n) return 0;
		const liqNum = Number(position.liquidity);
		if (!isFinite(liqNum) || liqNum <= 0) return 0;
		const sqrtPrice = Math.sqrt(currentWbtcPrice * 100);
		const amount = (liqNum * sqrtPrice) / 1e6;
		return isFinite(amount) && amount > 0 ? amount : 0;
	});

	let totalValueUsd = $derived(wbtcAmount * currentWbtcPrice + usdt0Amount);

	// IL-adjusted hold value
	let ilPercent = $derived(position.ilEstimatePercent ?? 0);
	let holdValueUsd = $derived.by(() => {
		if (totalValueUsd <= 0) return 0;
		const adjusted = totalValueUsd / (1 + ilPercent / 100);
		return isFinite(adjusted) && adjusted > 0 ? adjusted : totalValueUsd;
	});

	// Formatted date
	let positionDate = $derived(
		position.lastUpdated.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		})
	);

	// Action options
	let actionOptions = $derived<ActionOption[]>([
		{ id: 'provide', label: $t('wallet.defi.earn.card_add_liquidity'), disabled: false },
		{
			id: 'remove',
			label: $t('wallet.defi.earn.card_remove_liquidity'),
			disabled: position.liquidity === 0n
		},
		{
			id: 'collect',
			label: hasFees
				? $t('wallet.defi.earn.card_claim_earned')
				: $t('wallet.defi.earn.card_claim_none'),
			disabled: !hasFees
		},
		{ id: 'close', label: $t('wallet.defi.earn.card_close_lp'), disabled: false, isError: true }
	]);

	let activeActionLabel = $derived(actionOptions.find((o) => o.id === activeAction)?.label ?? '');

	function selectAction(action: LPAction) {
		activeAction = action;
		actionDropdownOpen = false;
	}

	function handleActionSuccess(txHash?: string) {
		onSuccess(txHash);
		activeAction = 'provide';
	}
</script>

<div
	class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border"
	class:collapse-open={isExpanded}
	class:collapse-close={!isExpanded}
	class:dd-open={actionDropdownOpen}
>
	<button
		type="button"
		class="collapse-title flex items-center justify-between px-3 py-2 pr-10 text-left text-sm font-medium sm:px-4 sm:py-3 sm:pr-12"
		onclick={(e) => {
			onToggle();
			setTimeout(() => (e.currentTarget as HTMLElement)?.blur(), 50);
		}}
		aria-expanded={isExpanded}
	>
		<div class="flex min-w-0 flex-1 items-center gap-2">
			{#if walletId === 'builtin'}
				<img
					src="/images/logos/bittasker-logomark.svg"
					alt="BitTasker Wallet"
					class="h-5 w-5 shrink-0 self-center sm:h-6 sm:w-6"
				/>
			{:else if connectedWallet}
				<WalletIcon
					walletType={connectedWallet.walletType}
					className="h-5 w-5 shrink-0 self-center sm:h-6 sm:w-6"
				/>
			{:else}
				<div
					class="bg-base-300 text-base-content/50 flex h-5 w-5 shrink-0 items-center justify-center self-center rounded-full text-xs font-medium sm:h-6 sm:w-6"
				>
					?
				</div>
			{/if}
			<div class="min-w-0 flex-1">
				<div class="flex items-center justify-between gap-2">
					<span class="text-sm font-medium">{walletName}</span>
					<span class="font-mono text-xs">LP #{position.tokenId.toString()}</span>
				</div>
				<div class="flex items-center justify-between gap-2">
					<div class="flex items-center gap-1.5">
						<span class="text-base-content/60 text-xs">{$t('wallet.defi.earn.card_fee_tier')}</span>
					</div>
					<div class="flex items-center gap-1.5">
						<span
							class="badge badge-xs shrink-0 px-1.5 py-0.5 text-[10px] leading-none font-medium {inRange
								? 'badge-success'
								: 'badge-error'}"
						>
							{inRange ? '●' : '○'}
							{inRange ? $t('wallet.defi.earn.range_in') : $t('wallet.defi.earn.range_out')}
						</span>
						<span class="text-base-content/50 text-[10px]">
							{$t('wallet.defi.earn.card_since', { values: { days } })}
						</span>
					</div>
				</div>
			</div>
		</div>
	</button>

	<div class="collapse-content">
		<div class="space-y-3 px-3 sm:px-4">
			<!-- Position Value -->
			<div class="bg-base-200 rounded-box p-3">
				<div class="text-base-content/60 mb-1 text-xs font-medium">
					{$t('wallet.defi.earn.lp_position_value')}
				</div>
				<div class="flex items-baseline justify-between">
					<div class="space-y-0.5">
						<div class="text-sm font-medium tabular-nums">
							{wbtcAmount.toFixed(6)} WBTC
						</div>
						<div class="text-sm font-medium tabular-nums">
							${usdt0Amount.toFixed(2)} USDT0
						</div>
					</div>
					<div class="text-right">
						<div class="text-lg font-bold tabular-nums">
							{totalValueUsd > 0 ? `$${totalValueUsd.toFixed(2)}` : '—'}
						</div>
						<div class="text-base-content/50 text-[10px]">
							{$t('wallet.defi.earn.time_in_position', { values: { date: positionDate } })}
							({$t('wallet.defi.earn.time_days', { values: { days } })})
						</div>
					</div>
				</div>
			</div>

			<!-- Range Indicator (inline) -->
			<div class="bg-base-200 rounded-box p-3">
				<div class="mb-2 flex items-center justify-between">
					<span class="text-base-content/60 text-xs font-medium"
						>{$t('wallet.defi.earn.range_title')}</span
					>
					<span class="badge badge-xs {inRange ? 'badge-success' : 'badge-error'}">
						{inRange ? $t('wallet.defi.earn.range_in') : $t('wallet.defi.earn.range_out')}
					</span>
				</div>
				<div class="bg-base-300 relative h-2 w-full overflow-hidden rounded-full">
					<div
						class="absolute inset-y-0 left-1/4 w-1/2 rounded-full {inRange
							? 'bg-success'
							: 'bg-error'}"
					></div>
				</div>
				<div class="mt-1 flex justify-between text-[10px]">
					<span class="text-base-content/40">{tickLower.toLocaleString()}</span>
					<span class="text-base-content/60 font-medium">
						{$t('wallet.defi.earn.range_you_are_here', {
							values: {
								price: `$${currentWbtcPrice > 0 ? currentWbtcPrice.toLocaleString() : '—'}`
							}
						})}
					</span>
					<span class="text-base-content/40">{tickUpper.toLocaleString()}</span>
				</div>
				<p class="text-base-content/50 mt-1 text-[10px]">
					{inRange
						? $t('wallet.defi.earn.range_earning')
						: $t('wallet.defi.earn.range_not_earning')}
				</p>
			</div>

			<!-- Earned + IL -->
			<div class="flex gap-2">
				<div class="bg-base-200 rounded-box flex-1 p-3">
					<div class="text-base-content/60 text-[10px]">
						{$t('wallet.defi.earn.overview_earned_unclaimed')}
					</div>
					<div class="text-sm font-bold tabular-nums">
						{feeUsd > 0 ? `$${feeUsd.toFixed(4)}` : '$0.00'}
					</div>
					<div class="text-base-content/50 text-[10px]">
						{Number(position.fees0) > 0
							? `${(Number(position.fees0) / 1e8).toFixed(8)} BTC`
							: '0 BTC'}
						+ {Number(position.fees1) > 0 ? `$${(Number(position.fees1) / 1e6).toFixed(2)}` : '$0'}
					</div>
				</div>
				<div class="bg-base-200 rounded-box flex-1 p-3">
					<div class="text-base-content/60 text-[10px]">{$t('wallet.defi.earn.il_estimate')}</div>
					<div
						class="text-sm font-bold tabular-nums {ilPercent < 0 ? 'text-error' : 'text-success'}"
					>
						{ilPercent.toFixed(2)}%
					</div>
					<div class="text-base-content/50 text-[10px]">
						{$t('wallet.defi.earn.il_vs_hold', {
							values: {
								amount:
									holdValueUsd > 0 ? `$${Math.abs(totalValueUsd - holdValueUsd).toFixed(2)}` : '$0'
							}
						})}
					</div>
				</div>
			</div>

			<!-- IL warning when loss exceeds 5% -->
			{#if ilPercent < -5}
				<div class="alert alert-warning text-xs">
					{$t('wallet.defi.impermanent_loss_warning', {
						values: { percent: Math.abs(ilPercent).toFixed(1) }
					})}
				</div>
			{/if}

			<!-- Held vs Earned (inline) -->
			{#if totalValueUsd > 0}
				<div class="bg-base-200 rounded-box p-3">
					<div class="text-base-content/60 mb-2 text-xs font-medium">
						{$t('wallet.defi.earn.held_vs_earned')}
					</div>
					<div class="flex items-center justify-between text-sm">
						<div>
							<div class="text-base-content/50 text-[10px]">
								{$t('wallet.defi.earn.lp_position_value')}
							</div>
							<div class="font-medium tabular-nums">${totalValueUsd.toFixed(2)}</div>
						</div>
						<div class="text-base-content/30 text-xs">vs</div>
						<div class="text-right">
							<div class="text-base-content/50 text-[10px]">
								{$t('wallet.defi.earn.if_you_held')}
							</div>
							<div class="font-medium tabular-nums">${holdValueUsd.toFixed(2)}</div>
						</div>
					</div>
					{#if totalValueUsd >= holdValueUsd}
						<div class="text-success mt-1 text-center text-[10px]">
							{$t('wallet.defi.earn.lp_wins_by')}: ${(totalValueUsd - holdValueUsd).toFixed(2)}
						</div>
					{:else}
						<div class="text-error mt-1 text-center text-[10px]">
							{$t('wallet.defi.earn.lp_trails_by')}: ${(holdValueUsd - totalValueUsd).toFixed(2)}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Action dropdown -->
			<div class="relative">
				<button
					type="button"
					class="border-primary bg-primary/10 text-primary hover:bg-primary/20 flex w-full items-center justify-between rounded-3xl border px-4 py-2 transition-all duration-200"
					onclick={() => (actionDropdownOpen = !actionDropdownOpen)}
					aria-expanded={actionDropdownOpen}
				>
					<span class="font-medium">{activeActionLabel}</span>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5 transition-transform duration-200 {actionDropdownOpen
							? 'rotate-180'
							: ''}"
						viewBox="0 0 20 20"
						fill="currentColor"
						aria-hidden="true"
					>
						<path
							fill-rule="evenodd"
							d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
							clip-rule="evenodd"
						/>
					</svg>
				</button>

				{#if actionDropdownOpen}
					<div
						transition:fly={{ y: -8, duration: 150 }}
						class="border-base-300 bg-base-100 absolute right-0 left-0 z-50 mt-2 rounded-xl border shadow-lg"
					>
						{#each actionOptions as option (option.id)}
							<button
								type="button"
								class="hover:bg-base-200 flex w-full items-center gap-2 px-4 py-2 text-left transition-colors duration-200 first:rounded-t-xl last:rounded-b-xl {option.isError
									? 'text-error'
									: ''} {activeAction === option.id
									? 'bg-primary/10 text-primary'
									: option.disabled
										? 'text-base-content/30 pointer-events-none'
										: 'text-base-content'}"
								disabled={option.disabled}
								onclick={() => selectAction(option.id)}
								onblur={() => setTimeout(() => (actionDropdownOpen = false), 150)}
							>
								<span class="font-medium">{option.label}</span>
								{#if activeAction === option.id}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="text-primary ml-auto h-5 w-5"
										viewBox="0 0 20 20"
										fill="currentColor"
										aria-hidden="true"
									>
										<path
											fill-rule="evenodd"
											d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
											clip-rule="evenodd"
										/>
									</svg>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Active action form -->
			{#if activeAction === 'provide'}
				<LPProvideAction
					{walletId}
					{address}
					onSuccess={handleActionSuccess}
					existingPosition={position}
				/>
			{:else if activeAction === 'remove'}
				<LPRemoveAction {walletId} {address} {position} onSuccess={handleActionSuccess} />
			{:else if activeAction === 'collect'}
				<LPCollectAction {walletId} {address} {position} onSuccess={handleActionSuccess} />
			{:else if activeAction === 'close'}
				<LPCloseAction {walletId} {address} {position} onSuccess={handleActionSuccess} />
			{/if}
		</div>
	</div>
</div>

<style>
	:global(.collapse.dd-open) {
		overflow: visible !important;
	}
	:global(.collapse.dd-open > .collapse-content) {
		overflow: visible !important;
	}
</style>
