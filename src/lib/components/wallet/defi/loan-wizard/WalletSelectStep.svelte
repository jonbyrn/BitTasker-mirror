<script lang="ts">
	import { t } from 'svelte-i18n';
	import SwapPartySelector from '$lib/components/wallet/SwapPartySelector.svelte';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import { walletStore, formatSats } from '$lib/stores/wallet.store';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import type { AssetOption } from '$lib/components/wallet/AssetSelector.svelte';

	interface Props {
		selectedWalletId: string;
		selectedAddress: string;
		onSelectWallet: (walletId: string, address: string) => void;
	}

	let { selectedWalletId, selectedAddress, onSelectWallet }: Props = $props();

	let wbtcBalance = $derived($walletStore.arb?.formattedWbtcBalance ?? '0');
	let wbtcBalanceNum = $derived(parseFloat(wbtcBalance) || 0);
	let wbtcBalanceSats = $derived(Math.round(wbtcBalanceNum * 100_000_000));

	let builtinPosition = $derived.by(() => {
		if (!selectedAddress) return null;
		return defiPositions.aavePositions.get('builtin') ?? null;
	});

	let wbtcAssets = $derived<AssetOption[]>([
		{
			id: 'wbtc-arb',
			label: 'Bitcoin (wBTC)',
			icon: '/images/chains/arbitrum.png',
			subLabel: 'Wrapped BTC on Arbitrum',
			balance: formatSats(wbtcBalanceSats) + ' Sats',
			balanceSub: `≈ $${((wbtcBalanceSats / 100_000_000) * btcPrice.price).toFixed(2)}`
		}
	]);

	function walletBtcSatsFor(walletId: string): number {
		if (walletId === 'builtin') return wbtcBalanceSats;
		const w = $connectedWalletsStore.wallets.find((w) => w.id === walletId);
		if (!w?.balances) return 0;
		return Number(w.balances['wbtc-arb']?.raw ?? 0) / 10_000_000_000;
	}

	function walletUsdt0For(walletId: string): number {
		if (walletId === 'builtin') {
			const usdt = $walletStore.arb?.formattedUsdt0Balance ?? '0';
			return parseFloat(usdt) || 0;
		}
		const w = $connectedWalletsStore.wallets.find((w) => w.id === walletId);
		if (!w?.balances) return 0;
		return Number(w.balances['usdt0-arb']?.raw ?? 0) / 1_000_000;
	}

	function handleWalletSelect(walletId: string) {
		const addr =
			walletId === 'builtin'
				? ($walletStore.arb?.address ?? '')
				: ($connectedWalletsStore.wallets.find((w) => w.id === walletId)?.address ?? '');
		if (addr) onSelectWallet(walletId, addr);
	}
</script>

<div class="flex flex-col gap-4">
	<div>
		<h3 class="text-base font-semibold">{$t('wallet.defi.wizard.select_wallet')}</h3>
		<p class="text-base-content/60 text-xs">{$t('wallet.defi.wizard.positions_per_address')}</p>
	</div>

	<div class="border-primary/20 bg-base-100 rounded-lg border p-3.5">
		<div class="flex items-center gap-2">
			<svg
				class="text-base-content/40 h-4 w-4 shrink-0"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<p class="text-sm font-medium">{$t('wallet.defi.wizard.how_it_works_title')}</p>
		</div>
		<ul class="mt-2.5 space-y-2 text-xs leading-relaxed">
			<li class="flex items-start gap-2">
				<span
					class="bg-primary/10 text-primary mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
					>1</span
				>
				<span>{$t('wallet.defi.wizard.how_bullet_1')}</span>
			</li>
			<li class="flex items-start gap-2">
				<span
					class="bg-primary/10 text-primary mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
					>2</span
				>
				<span>{$t('wallet.defi.wizard.how_bullet_2')}</span>
			</li>
			<li class="flex items-start gap-2">
				<span
					class="bg-primary/10 text-primary mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
					>3</span
				>
				<span>{$t('wallet.defi.wizard.how_bullet_3')}</span>
			</li>
		</ul>
	</div>

	<SwapPartySelector
		label={$t('wallet.from')}
		{selectedWalletId}
		onWalletSelect={handleWalletSelect}
		connectedWallets={$connectedWalletsStore.wallets}
		{walletBtcSatsFor}
		{walletUsdt0For}
		btcPrice={btcPrice.price}
		selectedAssetId="wbtc-arb"
		onAssetSelect={() => {}}
		assets={wbtcAssets}
	/>

	{#if builtinPosition && selectedWalletId === 'builtin'}
		<div class="bg-base-200 rounded-box space-y-2 p-3 text-sm">
			<p class="text-base-content/60 text-xs font-medium tracking-wider uppercase">
				{$t('wallet.defi.wizard.existing_position')}
			</p>
			<div class="flex items-center justify-between">
				<span class="text-base-content/60">Health Factor</span>
				<span class="font-medium tabular-nums">{builtinPosition.healthFactor.toFixed(2)}x</span>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-base-content/60">Collateral</span>
				<span class="font-medium tabular-nums"
					>${builtinPosition.totalCollateralUsd.toLocaleString()}</span
				>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-base-content/60">Debt</span>
				<span class="font-medium tabular-nums"
					>${builtinPosition.totalDebtUsd.toLocaleString()}</span
				>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-base-content/60">Available Borrow</span>
				<span class="font-medium tabular-nums"
					>${builtinPosition.availableBorrowsUsd.toLocaleString()}</span
				>
			</div>
		</div>
	{/if}
</div>
