<script lang="ts">
	import { t } from 'svelte-i18n';
	import { fly } from 'svelte/transition';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import LoanHealthBar from './LoanHealthBar.svelte';
	import WalletIcon from '$lib/components/wallet/WalletIcon.svelte';
	import SupplyAction from './actions/SupplyAction.svelte';
	import BorrowAction from './actions/BorrowAction.svelte';
	import RepayAction from './actions/RepayAction.svelte';
	import WithdrawAction from './actions/WithdrawAction.svelte';
	import CloseAction from './actions/CloseAction.svelte';
	import type { BorrowAction as BorrowActionType } from '$lib/types/defi';

	interface ActionOption {
		id: BorrowActionType;
		label: string;
		disabled: boolean;
		disabledReason?: string;
		isError?: boolean;
	}

	interface Props {
		walletId: string;
		address: string;
		isExpanded: boolean;
		onToggle: () => void;
		onSuccess: (txHash?: string) => void;
		onSwitchAction: (action: string) => void;
	}

	let {
		walletId,
		address,
		isExpanded,
		onToggle,
		onSuccess,
		onSwitchAction: _onSwitchAction
	}: Props = $props();

	let activeAction = $state<BorrowActionType>('supply');

	// Look up Aave position for this wallet
	let pos = $derived(defiPositions.aavePositions.get(walletId) ?? null);

	// Wallet display info
	let connectedWallet = $derived(
		walletId === 'builtin'
			? null
			: ($connectedWalletsStore.wallets.find((w) => w.id === walletId) ?? null)
	);

	let walletName = $derived(
		walletId === 'builtin' ? $t('wallet.builtin_wallet') : (connectedWallet?.walletName ?? walletId)
	);

	// LTV and risk computation
	function calcLtv(debt: number, collateral: number): number {
		return collateral > 0 ? (debt / collateral) * 100 : 0;
	}

	function riskLevel(ltvPct: number): 'safe' | 'warning' | 'critical' {
		return ltvPct >= 65 ? 'critical' : ltvPct >= 50 ? 'warning' : 'safe';
	}

	const RISK_BADGE: Record<string, { cls: string; label: string }> = {
		safe: { cls: 'badge-success', label: 'Safe' },
		warning: { cls: 'badge-warning', label: 'Caution' },
		critical: { cls: 'badge-error', label: 'At Risk' }
	};

	let ltvPct = $derived(pos ? calcLtv(pos.totalDebtUsd, pos.totalCollateralUsd) : 0);
	let risk = $derived(riskLevel(ltvPct));
	let badge = $derived(RISK_BADGE[risk]);

	// Short address for display
	let shortAddress = $derived(`${address.slice(0, 6)}...${address.slice(-4)}`);

	// Projected values from action forms
	let projectedDebt = $state<number | null>(null);
	let projectedCollateral = $state<number | null>(null);
	let projectedAvailable = $state<number | null>(null);
	let projectedLiqPrice = $state<number | null>(null);

	// Formatted liq price (projected when action form is active)
	let displayLiqPrice = $derived(projectedLiqPrice ?? pos?.liquidationPriceBtc ?? 0);
	let formattedLiqPrice = $derived(
		displayLiqPrice > 0 ? `$${Math.round(displayLiqPrice).toLocaleString()}` : null
	);

	// Action tab derived state
	let hasDebt = $derived((pos?.totalDebtUsd ?? 0) > 0);
	let hasCollateral = $derived((pos?.totalCollateralUsd ?? 0) > 0);
	let availableBorrowsUsd = $derived(pos?.availableBorrowsUsd ?? 0);

	// Action dropdown
	let actionDropdownOpen = $state(false);

	let actionOptions = $derived<ActionOption[]>([
		{ id: 'supply', label: $t('wallet.defi.wizard.supply_collateral'), disabled: false },
		{
			id: 'borrow',
			label: $t('wallet.defi.wizard.borrow_usdt0'),
			disabled: availableBorrowsUsd <= 0
		},
		{ id: 'repay', label: $t('wallet.defi.borrow.button_repay'), disabled: !hasDebt },
		{ id: 'withdraw', label: $t('wallet.defi.borrow.button_withdraw'), disabled: !hasCollateral },
		{
			id: 'close',
			label: $t('wallet.defi.position.close_position'),
			disabled: false,
			isError: true
		}
	]);

	let activeActionLabel = $derived(
		actionOptions.find((o) => o.id === activeAction)?.label ?? 'Select Action'
	);

	function selectAction(action: BorrowActionType) {
		projectedDebt = null;
		projectedCollateral = null;
		projectedAvailable = null;
		projectedLiqPrice = null;
		activeAction = action;
		actionDropdownOpen = false;
	}

	function toggleActionDropdown() {
		actionDropdownOpen = !actionDropdownOpen;
	}

	function closeActionDropdown() {
		actionDropdownOpen = false;
	}

	function handleProjectedValues(vals: {
		debt?: number;
		collateral?: number;
		available?: number;
		liqPrice?: number;
	}) {
		if (vals.debt !== undefined) projectedDebt = vals.debt;
		if (vals.collateral !== undefined) projectedCollateral = vals.collateral;
		if (vals.available !== undefined) projectedAvailable = vals.available;
		if (vals.liqPrice !== undefined) projectedLiqPrice = vals.liqPrice;
	}

	function handleActionSuccess(txHashOrVoid?: string) {
		onSuccess(txHashOrVoid);
		projectedDebt = null;
		projectedCollateral = null;
		projectedAvailable = null;
		projectedLiqPrice = null;
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
					{#if pos}
						<span class="shrink-0 text-xs tabular-nums">
							${pos.totalDebtUsd.toFixed(2)} / ${pos.totalCollateralUsd.toFixed(2)}
						</span>
					{/if}
				</div>
				<div class="flex items-center justify-between gap-2">
					<span class="text-base-content/50 font-mono text-xs">{shortAddress}</span>
					<div class="flex items-center gap-1.5">
						<span class="text-base-content/60 text-xs tabular-nums">
							{$t('wallet.defi.ltv_display', { values: { ltv: ltvPct.toFixed(1) } })}
						</span>
						<span
							class="badge {badge.cls} badge-xs shrink-0 px-1.5 py-0.5 text-[10px] leading-none font-medium"
						>
							{badge.label}
						</span>
					</div>
				</div>
			</div>
		</div>
	</button>
	{#if pos}
		<div class="collapse-content">
			<div class="space-y-3 px-3 sm:px-4">
				<!-- Loan health bar (current or projected) -->
				<LoanHealthBar
					totalCollateralUsd={projectedCollateral ?? pos.totalCollateralUsd}
					totalDebtUsd={projectedDebt ?? pos.totalDebtUsd}
					availableBorrowsUsd={projectedAvailable ?? pos.availableBorrowsUsd}
				/>

				<!-- Liquidation price -->
				{#if formattedLiqPrice}
					<div class="flex items-center justify-between text-xs">
						<span class="text-base-content/50">{$t('wallet.defi.wizard.new_liq_price')}</span>
						<span class="font-medium tabular-nums">{formattedLiqPrice}</span>
					</div>
				{/if}

				<!-- Action dropdown -->
				<div class="relative">
					<button
						type="button"
						class="border-primary bg-primary/10 text-primary hover:bg-primary/20 flex w-full items-center justify-between rounded-3xl border px-4 py-2 transition-all duration-200"
						onclick={toggleActionDropdown}
					>
						<span class="font-medium">{activeActionLabel}</span>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5 transition-transform duration-200 {actionDropdownOpen
								? 'rotate-180'
								: ''}"
							viewBox="0 0 20 20"
							fill="currentColor"
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
									onblur={() => setTimeout(closeActionDropdown, 150)}
								>
									<span class="font-medium">{option.label}</span>
									{#if activeAction === option.id}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="text-primary ml-auto h-5 w-5"
											viewBox="0 0 20 20"
											fill="currentColor"
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

				<!-- Action form content -->
				{#if activeAction === 'supply'}
					<SupplyAction
						{walletId}
						{address}
						onSuccess={handleActionSuccess}
						minimal={true}
						onProjectedValues={handleProjectedValues}
					/>
				{:else if activeAction === 'borrow'}
					<BorrowAction
						{walletId}
						{address}
						onSuccess={handleActionSuccess}
						minimal={true}
						onProjectedValues={handleProjectedValues}
					/>
				{:else if activeAction === 'repay'}
					<RepayAction
						{walletId}
						{address}
						onSuccess={handleActionSuccess}
						minimal={true}
						onProjectedValues={handleProjectedValues}
					/>
				{:else if activeAction === 'withdraw'}
					<WithdrawAction
						{walletId}
						{address}
						onSuccess={handleActionSuccess}
						minimal={true}
						onProjectedValues={handleProjectedValues}
					/>
				{:else if activeAction === 'close'}
					<CloseAction
						{walletId}
						{address}
						onSuccess={handleActionSuccess}
						onSwitchAction={(action) => {
							activeAction = action as BorrowActionType;
						}}
					/>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	:global(.collapse.dd-open) {
		overflow: visible !important;
	}
	:global(.collapse.dd-open > .collapse-content) {
		overflow: visible !important;
	}
</style>
