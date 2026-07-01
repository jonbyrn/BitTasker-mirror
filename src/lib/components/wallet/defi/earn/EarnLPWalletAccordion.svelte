<script lang="ts">
	import { t } from 'svelte-i18n';
	import { fly } from 'svelte/transition';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { FULL_RANGE } from '$lib/services/defi/uniswap.service';
	import WalletIcon from '$lib/components/wallet/WalletIcon.svelte';
	import EarnDeployBar from './EarnDeployBar.svelte';
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
		positions: UniswapLPPosition[];
		isExpanded: boolean;
		onToggle: () => void;
		onSuccess: (txHash?: string) => void;
	}

	let { walletId, positions, isExpanded, onToggle, onSuccess }: Props = $props();

	let activeAction = $state<LPAction>('provide');
	let actionDropdownOpen = $state(false);

	// Position data — derive from store if props empty, fallback to store
	let storePositions = $derived.by((): UniswapLPPosition[] => {
		const pos = defiPositions.uniswapPositions.get(walletId);
		return pos !== undefined ? [pos] : [];
	});
	let effectivePositions = $derived(positions.length > 0 ? positions : storePositions);

	// Wallet display
	let connectedWallet = $derived(
		walletId === 'builtin'
			? null
			: ($connectedWalletsStore.wallets.find((w) => w.id === walletId) ?? null)
	);

	let walletName = $derived(
		walletId === 'builtin' ? $t('wallet.builtin_wallet') : (connectedWallet?.walletName ?? walletId)
	);

	// Derive address from first position
	let address = $derived(effectivePositions[0]?.address ?? '');

	// BTC price
	let currentWbtcPrice = $derived(btcPrice.price);

	// ── Per-position calculations ──────────────────────────────────────────
	interface PositionCalc {
		position: UniswapLPPosition;
		wbtcAmount: number;
		usdt0Amount: number;
		totalValueUsd: number;
		feeUsd: number;
		feesWbtc: number;
		feesUsdt0: number;
		ilPercent: number;
		inRange: boolean;
		days: number;
	}

	function calcPosition(pos: UniswapLPPosition, btcPx: number): PositionCalc {
		const liqNum = Number(pos.liquidity);
		const hasLiq = liqNum > 0 && isFinite(liqNum);
		const sqrtPrice = btcPx > 0 ? Math.sqrt(btcPx * 100) : 0;

		const wbtcAmt = hasLiq && sqrtPrice > 0 ? liqNum / sqrtPrice / 1e8 : 0;
		const usdt0Amt = hasLiq && sqrtPrice > 0 ? (liqNum * sqrtPrice) / 1e6 : 0;
		const safeWbtc = isFinite(wbtcAmt) && wbtcAmt > 0 ? wbtcAmt : 0;
		const safeUsdt0 = isFinite(usdt0Amt) && usdt0Amt > 0 ? usdt0Amt : 0;

		const wbtcFee = Number(pos.fees0) / 1e8;
		const usdt0Fee = Number(pos.fees1) / 1e6;
		const wbtcFeeUsd = isFinite(wbtcFee) ? wbtcFee * btcPx : 0;
		const feeUsd = (isFinite(wbtcFeeUsd) ? wbtcFeeUsd : 0) + (isFinite(usdt0Fee) ? usdt0Fee : 0);

		const totalVal = safeWbtc * btcPx + safeUsdt0;
		const il = pos.ilEstimatePercent ?? 0;
		const inRng =
			pos.currentTick >= FULL_RANGE.TICK_LOWER && pos.currentTick <= FULL_RANGE.TICK_UPPER;
		const ms = Date.now() - pos.lastUpdated.getTime();
		const days = ms > 0 ? Math.floor(ms / 86400000) : 0;

		return {
			position: pos,
			wbtcAmount: safeWbtc,
			usdt0Amount: safeUsdt0,
			totalValueUsd: totalVal,
			feeUsd,
			feesWbtc: isFinite(wbtcFee) ? wbtcFee : 0,
			feesUsdt0: isFinite(usdt0Fee) ? usdt0Fee : 0,
			ilPercent: il,
			inRange: inRng,
			days
		};
	}

	let calcs = $derived(effectivePositions.map((p) => calcPosition(p, currentWbtcPrice)));
	let hasPositions = $derived(calcs.length > 0);

	// ── Aggregates ─────────────────────────────────────────────────────────
	let totalLpValueUsd = $derived(calcs.reduce((sum, c) => sum + c.totalValueUsd, 0));
	let totalFeesUsd = $derived(calcs.reduce((sum, c) => sum + c.feeUsd, 0));
	let allInRange = $derived(calcs.length > 0 && calcs.every((c) => c.inRange));
	let hasAnyLiquidity = $derived(effectivePositions.some((p) => p.liquidity > 0n));
	let hasAnyFees = $derived(effectivePositions.some((p) => p.fees0 > 0n || p.fees1 > 0n));

	// Average IL across positions
	let avgIl = $derived.by(() => {
		if (calcs.length === 0) return 0;
		return calcs.reduce((sum, c) => sum + c.ilPercent, 0) / calcs.length;
	});

	// Positions to use for action forms (first matching condition)
	let removeTarget = $derived(effectivePositions.find((p) => p.liquidity > 0n) ?? null);
	let collectTarget = $derived(
		effectivePositions.find((p) => p.fees0 > 0n || p.fees1 > 0n) ?? null
	);
	let closeTarget = $derived(effectivePositions[0] ?? null);
	let provideTarget = $derived(effectivePositions[0] ?? null);

	// ── Action dropdown ────────────────────────────────────────────────────
	let actionOptions = $derived<ActionOption[]>([
		{ id: 'provide', label: $t('wallet.defi.earn.card_add_liquidity'), disabled: false },
		{
			id: 'remove',
			label: $t('wallet.defi.earn.card_remove_liquidity'),
			disabled: !hasAnyLiquidity
		},
		{
			id: 'collect',
			label: hasAnyFees
				? $t('wallet.defi.earn.card_claim_earned')
				: $t('wallet.defi.earn.card_claim_none'),
			disabled: !hasAnyFees
		},
		{ id: 'close', label: $t('wallet.defi.earn.card_close_lp'), disabled: false, isError: true }
	]);

	let activeActionLabel = $derived(actionOptions.find((o) => o.id === activeAction)?.label ?? '');

	function selectAction(action: LPAction) {
		activeAction = action;
		actionDropdownOpen = false;
	}

	function toggleActionDropdown() {
		actionDropdownOpen = !actionDropdownOpen;
	}

	function closeActionDropdown() {
		actionDropdownOpen = false;
	}

	function handleActionSuccess(txHash?: string) {
		onSuccess(txHash);
		activeAction = 'provide';
	}

	function formatUsd(val: number): string {
		return val > 0 ? `$${val.toFixed(2)}` : '$0.00';
	}
</script>

<div
	class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border"
	class:collapse-open={isExpanded}
	class:collapse-close={!isExpanded}
	class:dd-open={actionDropdownOpen}
>
	<!-- Title bar — always renders -->
	<button
		type="button"
		class="collapse-title flex items-center justify-between px-3 py-2 pr-10 text-left text-sm font-medium sm:px-4 sm:py-3 sm:pr-12"
		onclick={() => {
			onToggle();
		}}
		aria-expanded={isExpanded}
		aria-label={`${walletName} — ${$t('wallet.defi.earn.lp_positions')}`}
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
					{#if hasPositions}
						<span class="shrink-0 text-xs tabular-nums">
							{formatUsd(totalLpValueUsd)} / {formatUsd(totalFeesUsd)}
						</span>
					{/if}
				</div>
				{#if hasPositions}
					<div class="flex items-center gap-1.5">
						<span class="text-base-content/50 text-xs">
							{$t('wallet.defi.earn.overview_earned_unclaimed')}
						</span>
						<span
							class="badge badge-xs shrink-0 px-1.5 py-0.5 text-[10px] leading-none font-medium {allInRange
								? 'badge-success'
								: 'badge-error'}"
						>
							{allInRange ? '●' : '○'}
							{allInRange ? $t('wallet.defi.earn.range_in') : $t('wallet.defi.earn.range_out')}
						</span>
					</div>
				{/if}
			</div>
		</div>
	</button>

	<!-- Collapse content — always renders, position-specific sections guarded by hasPositions -->
	<div class="collapse-content">
		<div class="space-y-3 px-3 sm:px-4">
			{#if hasPositions}
				<!-- Per-position sections -->
				{#each calcs as calc (calc.position.tokenId.toString())}
					<div class="bg-base-200 rounded-lg p-2.5 text-xs">
						<!-- Token ID header -->
						<div class="text-base-content/40 mb-1.5 font-mono text-[10px]">
							LP #{calc.position.tokenId.toString()}
						</div>

						<!-- Position value -->
						<div class="mb-1.5">
							<div class="text-base-content/60 mb-0.5 text-[10px] font-medium">
								{$t('wallet.defi.earn.lp_position_value')}
							</div>
							<div class="flex items-baseline justify-between">
								<div class="space-y-0.5">
									<div class="font-medium tabular-nums">
										{(calc.wbtcAmount * 1e8).toFixed(0)}
										{$t('wallet.sats')}
									</div>
									<div class="font-medium tabular-nums">
										${calc.usdt0Amount.toFixed(2)} USDT0
									</div>
								</div>
								<div class="text-right font-bold tabular-nums">
									{calc.totalValueUsd > 0 ? `$${calc.totalValueUsd.toFixed(2)}` : '—'}
								</div>
							</div>
						</div>

						<!-- Earned (unclaimed) + IL + Range -->
						<div class="flex gap-2">
							<div class="flex-1">
								<div class="text-base-content/60 text-[10px]">
									{$t('wallet.defi.earn.overview_earned_unclaimed')}
								</div>
								<div class="font-bold tabular-nums">
									{calc.feeUsd > 0 ? `$${calc.feeUsd.toFixed(4)}` : '$0.00'}
								</div>
								<div class="text-base-content/50 text-[10px]">
									{calc.feesWbtc > 0 ? `${calc.feesWbtc.toFixed(8)} BTC` : '0 BTC'}
									+ {calc.feesUsdt0 > 0 ? `$${calc.feesUsdt0.toFixed(2)}` : '$0'}
								</div>
							</div>
							<div class="flex-1">
								<div class="text-base-content/60 text-[10px]">
									{$t('wallet.defi.earn.il_estimate')}
								</div>
								<div
									class="font-bold tabular-nums {calc.ilPercent < 0
										? 'text-error'
										: 'text-success'}"
								>
									{calc.ilPercent.toFixed(2)}%
								</div>
							</div>
						</div>

						<!-- Range + Days -->
						<div class="mt-1.5 flex items-center justify-between">
							<span
								class="badge badge-xs shrink-0 px-1.5 py-0.5 text-[10px] leading-none font-medium {calc.inRange
									? 'badge-success'
									: 'badge-error'}"
							>
								{calc.inRange ? '●' : '○'}
								{calc.inRange ? $t('wallet.defi.earn.range_in') : $t('wallet.defi.earn.range_out')}
							</span>
							<span class="text-base-content/50 text-[10px]">
								{$t('wallet.defi.earn.card_since', { values: { days: calc.days } })}
							</span>
						</div>
					</div>
				{/each}

				<!-- Aggregate section (multiple positions) -->
				{#if calcs.length > 1}
					<div class="bg-base-200 rounded-lg p-2.5 text-xs">
						<div class="text-base-content/60 mb-1.5 text-[10px] font-medium">
							{$t('wallet.defi.earn.lp_aggregate')}
						</div>
						<div class="flex items-center justify-between">
							<span class="text-base-content/50">{$t('wallet.defi.earn.lp_position_value')}</span>
							<span class="font-bold tabular-nums">{formatUsd(totalLpValueUsd)}</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-base-content/50"
								>{$t('wallet.defi.earn.overview_earned_unclaimed')}</span
							>
							<span class="text-success font-bold tabular-nums">{formatUsd(totalFeesUsd)}</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-base-content/50">{$t('wallet.defi.earn.il_estimate')}</span>
							<span class="font-bold tabular-nums {avgIl < 0 ? 'text-error' : 'text-success'}">
								{avgIl.toFixed(2)}%
							</span>
						</div>
					</div>
				{/if}
			{/if}

			<!-- Deploy bar — always visible -->
			<EarnDeployBar deployedUsd={totalLpValueUsd} availableUsd={0} />

			<!-- Action dropdown — always renders -->
			<div class="relative">
				<button
					type="button"
					class="border-primary bg-primary/10 text-primary hover:bg-primary/20 flex w-full items-center justify-between rounded-3xl border px-4 py-2 transition-all duration-200"
					onclick={toggleActionDropdown}
					aria-haspopup="listbox"
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
						role="listbox"
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
								role="option"
								aria-selected={activeAction === option.id}
								disabled={option.disabled}
								onclick={() => selectAction(option.id)}
								onblur={() => setTimeout(closeActionDropdown, 150)}
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

			<!-- Active action form — always renders -->
			{#if activeAction === 'provide'}
				<LPProvideAction
					{walletId}
					{address}
					onSuccess={handleActionSuccess}
					existingPosition={provideTarget}
				/>
			{:else if activeAction === 'remove' && removeTarget}
				<LPRemoveAction
					{walletId}
					{address}
					position={removeTarget}
					onSuccess={handleActionSuccess}
				/>
			{:else if activeAction === 'collect' && collectTarget}
				<LPCollectAction
					{walletId}
					{address}
					position={collectTarget}
					onSuccess={handleActionSuccess}
				/>
			{:else if activeAction === 'close' && closeTarget}
				<LPCloseAction
					{walletId}
					{address}
					position={closeTarget}
					onSuccess={handleActionSuccess}
				/>
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
