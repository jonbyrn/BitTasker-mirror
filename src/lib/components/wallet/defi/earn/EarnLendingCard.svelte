<script lang="ts">
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { fly } from 'svelte/transition';
	import { walletStore } from '$lib/stores/wallet.store';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import WalletIcon from '$lib/components/wallet/WalletIcon.svelte';
	import EarnDeployBar from './EarnDeployBar.svelte';
	import EarnSupplyAction from './EarnSupplyAction.svelte';
	import EarnWithdrawAction from './EarnWithdrawAction.svelte';
	import EarnCloseAction from './EarnCloseAction.svelte';

	interface ActionOption {
		id: 'supply' | 'withdraw' | 'close';
		label: string;
		isError?: boolean;
	}

	interface Props {
		walletId: string;
		address: string;
		isExpanded: boolean;
		onToggle: () => void;
		onSuccess: (txHash?: string) => void;
		supplyAPY?: number | null;
	}

	let { walletId, address, isExpanded, onToggle, onSuccess, supplyAPY = null }: Props = $props();

	let activeAction = $state<'supply' | 'withdraw' | 'close'>('supply');
	let actionDropdownOpen = $state(false);

	// Position data
	let pos = $derived(defiPositions.aavePositions.get(walletId) ?? null);

	// Wallet display
	let connectedWallet = $derived(
		walletId === 'builtin'
			? null
			: ($connectedWalletsStore.wallets.find((w) => w.id === walletId) ?? null)
	);

	let walletName = $derived(
		walletId === 'builtin' ? $t('wallet.builtin_wallet') : (connectedWallet?.walletName ?? walletId)
	);

	// Supplied amount
	let suppliedAmount = $derived(pos ? parseFloat(pos.suppliedUsdt0) : 0);

	// Available USDT0 balance for this wallet
	let availableBalance = $derived.by(() => {
		if (walletId === 'builtin')
			return parseFloat(get(walletStore).arb?.formattedUsdt0Balance ?? '0') || 0;
		const w = get(connectedWalletsStore).wallets.find((ww) => ww.id === walletId);
		const u = w?.balances?.['usdt0-arb'] || w?.balances?.['usdt-arb'] || w?.balances?.['usdt0'];
		return parseFloat(u?.formatted ?? '0') || 0;
	});

	// Time in position
	let daysInPosition = $derived.by(() => {
		if (!pos?.lastUpdated) return 0;
		return Math.floor((Date.now() - pos.lastUpdated.getTime()) / 86400000);
	});

	// Earned amount (accrued interest)
	let earnedUsd = $derived(pos?.accruedUsd ?? 0);

	// Action options
	let actionOptions = $derived<ActionOption[]>([
		{ id: 'supply', label: $t('wallet.defi.earn.card_supply_more') },
		{ id: 'withdraw', label: $t('wallet.defi.earn.card_withdraw') },
		{ id: 'close', label: $t('wallet.defi.earn.card_close'), isError: true }
	]);

	let activeActionLabel = $derived(actionOptions.find((o) => o.id === activeAction)?.label ?? '');

	function selectAction(action: 'supply' | 'withdraw' | 'close') {
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
		onclick={() => {
			onToggle();
		}}
		aria-expanded={isExpanded}
		aria-label={`${walletName} — ${$t('wallet.defi.earn_lending')}`}
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
							${suppliedAmount.toFixed(2)} / ${availableBalance.toFixed(2)}
						</span>
					{/if}
				</div>
				{#if daysInPosition > 0}
					<div class="flex items-center gap-1.5">
						<span class="text-base-content/50 text-xs">
							{$t('wallet.defi.earn.card_since', { values: { days: daysInPosition } })}
						</span>
					</div>
				{/if}
			</div>
		</div>
	</button>
	{#if pos}
		<div class="collapse-content">
			<div class="space-y-3 px-3 sm:px-4">
				<!-- Deploy bar -->
				<EarnDeployBar deployedUsd={suppliedAmount} availableUsd={availableBalance} />

				<!-- Earned amount -->
				{#if earnedUsd > 0}
					<div class="flex items-center justify-between text-xs">
						<span class="text-base-content/50">{$t('wallet.defi.earn.overview_earned')}</span>
						<span class="text-success font-medium tabular-nums">+${earnedUsd.toFixed(4)}</span>
					</div>
				{/if}

				<!-- APY -->
				<div class="flex items-center justify-between text-xs">
					<span class="text-base-content/50">{$t('wallet.defi.lend.apy_label')}</span>
					<span class="font-medium">
						{supplyAPY !== null ? `${supplyAPY.toFixed(2)}%` : '…'}
					</span>
				</div>

				<!-- Time in position -->
				{#if pos.lastUpdated}
					<div class="text-base-content/50 text-xs">
						{$t('wallet.defi.earn.time_in_position', {
							values: {
								date: pos.lastUpdated.toLocaleDateString(undefined, {
									month: 'short',
									day: 'numeric',
									year: 'numeric'
								})
							}
						})}
						({$t('wallet.defi.earn.time_days', { values: { days: daysInPosition } })})
					</div>
				{/if}

				<!-- Action dropdown -->
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
										: 'text-base-content'}"
									role="option"
									aria-selected={activeAction === option.id}
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

				<!-- Action form -->
				{#if activeAction === 'supply'}
					<EarnSupplyAction {walletId} {address} onSuccess={handleActionSuccess} />
				{:else if activeAction === 'withdraw'}
					<EarnWithdrawAction {walletId} {address} onSuccess={handleActionSuccess} />
				{:else if activeAction === 'close'}
					<EarnCloseAction {walletId} {address} onSuccess={handleActionSuccess} />
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
