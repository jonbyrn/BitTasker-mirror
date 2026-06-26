<script lang="ts">
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { onMount } from 'svelte';
	import { ethers } from 'ethers';
	import { tryCatch } from '$lib/utils/tryCatch';
	import Drawer from '$lib/components/Drawer.svelte';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { walletStore } from '$lib/stores/wallet.store';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { AaveService, USDT0_ARBITRUM } from '$lib/services/defi/aave.service';
	import EarnOverview from './defi/earn/EarnOverview.svelte';
	import EarnLendingCard from './defi/earn/EarnLendingCard.svelte';
	import EarnLPPositionCard from './defi/earn/EarnLPPositionCard.svelte';
	import * as Sentry from '@sentry/sveltekit';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
		isSubmitting?: boolean;
		single?: 'lending' | 'lp' | null;
	}

	let { isOpen, onClose, isSubmitting = false, single = null }: Props = $props();

	let internalTab = $state<'lending' | 'lp'>('lending');
	let earnSubTab = $derived<'lending' | 'lp'>(single ?? internalTab);
	let expandedWalletId = $state<string | null>(null);
	let expandedPositionKey = $state<string | null>(null);
	let toastMessage = $state<string | null>(null);
	let toastVisible = $state(false);
	let supplyAPY = $state(4.22);
	async function fetchSupplyAPY() {
		const provider = new ethers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
		const aave = new AaveService(provider);
		const { data: apy, error } = await tryCatch(aave.getSupplyAPY(USDT0_ARBITRUM));
		if (!error && apy !== undefined && isFinite(apy)) supplyAPY = apy;
	}

	onMount(() => {
		void fetchSupplyAPY();
	});

	let allAavePositions = $derived(Array.from(defiPositions.aavePositions.entries()));
	let allLpPositions = $derived(Array.from(defiPositions.uniswapPositions.entries()));
	let idleBalance = $derived.by(() => {
		const builtin = parseFloat(get(walletStore).arb?.formattedUsdt0Balance ?? '0') || 0;
		let connected = 0;
		for (const w of get(connectedWalletsStore).wallets) {
			const usdt0 = w.balances?.['usdt0-arb'];
			if (usdt0?.formatted) connected += parseFloat(usdt0.formatted) || 0;
		}
		return builtin + connected;
	});
	let totalEarning = $derived.by(() => {
		let total = 0;
		for (const [, pos] of defiPositions.aavePositions) total += parseFloat(pos.suppliedUsdt0) || 0;
		if (btcPrice.price > 0) {
			for (const [, pos] of defiPositions.uniswapPositions) {
				const liq = Number(pos.liquidity);
				if (isFinite(liq) && liq > 0) total += (liq / 1e8) * btcPrice.price * 0.01;
			}
		}
		return total;
	});

	let wasOpen = $state(false);
	$effect(() => {
		if (isOpen && !wasOpen) {
			Sentry.addBreadcrumb({
				category: 'defi.earn',
				message: 'EarnFlowDrawer opened',
				data: { single, tab: earnSubTab }
			});
			if (earnSubTab === 'lending' && allAavePositions.length > 0)
				expandedWalletId = allAavePositions[0][0];
			else if (earnSubTab === 'lp' && allLpPositions.length > 0)
				expandedPositionKey = allLpPositions[0][0];
			toastMessage = null;
			toastVisible = false;
		}
		wasOpen = isOpen;
	});

	function handleToggleWallet(walletId: string) {
		expandedWalletId = expandedWalletId === walletId ? null : walletId;
	}
	function handleTogglePosition(key: string) {
		expandedPositionKey = expandedPositionKey === key ? null : key;
	}

	function handleSuccess(txHash?: string) {
		void defiPositions.refreshAllAave();
		if (expandedWalletId) defiPositions.refreshAavePosition(expandedWalletId, true);
		if (txHash) {
			toastMessage = `Transaction confirmed: ${txHash.slice(0, 10)}…`;
			toastVisible = true;
			setTimeout(() => {
				toastVisible = false;
				setTimeout(() => {
					toastMessage = null;
				}, 300);
			}, 5000);
		}
	}

	function dismissToast() {
		toastVisible = false;
		setTimeout(() => {
			toastMessage = null;
		}, 300);
	}
	function handleNewLending() {
		Sentry.addBreadcrumb({ category: 'defi.earn', message: 'new lending position' });
		expandedWalletId = 'builtin';
	}
	function handleNewLp() {
		Sentry.addBreadcrumb({ category: 'defi.earn', message: 'new lp position' });
		expandedPositionKey = null;
	}

	function handleClose() {
		expandedWalletId = null;
		expandedPositionKey = null;
		toastMessage = null;
		toastVisible = false;
		onClose();
	}
</script>

<Drawer
	{isOpen}
	onClose={handleClose}
	title={$t('wallet.defi.tab_earn')}
	position="right"
	isScrollable={true}
	{isSubmitting}
>
	<div class="flex flex-col gap-4">
		<!-- Total earning line -->
		<div class="flex items-center justify-between px-1">
			<div>
				<span class="text-base-content/60 text-xs"
					>{$t('wallet.defi.earn.overview_total_earning')}:</span
				>
				<span class="font-bold tabular-nums">${totalEarning.toFixed(2)}</span>
			</div>
		</div>

		<!-- Tab selector -->
		{#if !single}
			<div
				role="tablist"
				class="tabs tabs-boxed border-base-300 mb-1 shrink-0 overflow-hidden rounded-lg border sm:mb-2"
			>
				<button
					role="tab"
					class="tab min-h-[44px] flex-1"
					class:bg-primary={earnSubTab === 'lending'}
					class:text-primary-content={earnSubTab === 'lending'}
					class:tab-active={earnSubTab === 'lending'}
					aria-selected={earnSubTab === 'lending'}
					onclick={() => {
						Sentry.addBreadcrumb({ category: 'defi.earn', message: 'tab switch to lending' });
						internalTab = 'lending';
					}}
				>
					<svg
						class="mr-1 h-4 w-4"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9"
						/>
					</svg>
					{$t('wallet.defi.earn_lending')}
				</button>
				<button
					role="tab"
					class="tab min-h-[44px] flex-1"
					class:bg-primary={earnSubTab === 'lp'}
					class:text-primary-content={earnSubTab === 'lp'}
					class:tab-active={earnSubTab === 'lp'}
					aria-selected={earnSubTab === 'lp'}
					onclick={() => {
						Sentry.addBreadcrumb({ category: 'defi.earn', message: 'tab switch to lp' });
						internalTab = 'lp';
					}}
				>
					<svg
						class="mr-1 h-4 w-4"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2"
						/>
					</svg>
					{$t('wallet.defi.earn_lp')}
				</button>
			</div>
		{/if}

		<!-- Lending tab -->
		{#if earnSubTab === 'lending'}
			<EarnOverview mode="lending" />
			{#each allAavePositions as [walletId, pos] (walletId)}
				<EarnLendingCard
					{walletId}
					address={pos.address}
					isExpanded={expandedWalletId === walletId}
					onToggle={() => handleToggleWallet(walletId)}
					onSuccess={handleSuccess}
					{supplyAPY}
				/>
			{/each}
			{#if allAavePositions.length === 0}
				<div class="flex flex-col items-center gap-3 py-8 text-center">
					<div class="bg-primary/10 flex h-16 w-16 items-center justify-center rounded-full">
						<svg class="text-primary h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9"
							/></svg
						>
					</div>
					<h3 class="text-base font-semibold">{$t('wallet.defi.earn.empty_title')}</h3>
					<p class="text-base-content/60 text-sm">
						{$t('wallet.defi.earn.empty_desc_lending', { values: { apy: supplyAPY.toFixed(2) } })}
					</p>
					{#if idleBalance > 0}
						<div class="bg-base-200 rounded-box p-3 text-sm">
							<p>
								{$t('wallet.defi.earn.empty_nudge', {
									values: { balance: `$${idleBalance.toFixed(2)}` }
								})}
							</p>
							<p class="text-base-content/60 text-xs">
								{$t('wallet.defi.earn.empty_nudge_earning', {
									values: {
										apy: supplyAPY.toFixed(2),
										amount: `$${((idleBalance * supplyAPY) / 100).toFixed(2)}`
									}
								})}
							</p>
						</div>
					{/if}
					<button
						type="button"
						class="btn btn-primary min-h-[48px] w-full"
						onclick={handleNewLending}>{$t('wallet.defi.earn.empty_cta')}</button
					>
				</div>
			{/if}
			<button type="button" class="btn btn-outline btn-sm w-full" onclick={handleNewLending}
				>+ {$t('wallet.defi.earn.new_lending_position')}</button
			>
		{/if}

		<!-- LP tab -->
		{#if earnSubTab === 'lp'}
			<EarnOverview mode="lp" />
			{#each allLpPositions as [key, pos] (key)}
				<EarnLPPositionCard
					walletId={pos.walletId}
					address={pos.address}
					position={pos}
					isExpanded={expandedPositionKey === key}
					onToggle={() => handleTogglePosition(key)}
					onSuccess={handleSuccess}
				/>
			{/each}
			{#if allLpPositions.length === 0}
				<div class="flex flex-col items-center gap-3 py-8 text-center">
					<div class="bg-primary/10 flex h-16 w-16 items-center justify-center rounded-full">
						<svg class="text-primary h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2"
							/></svg
						>
					</div>
					<h3 class="text-base font-semibold">{$t('wallet.defi.earn.empty_title')}</h3>
					<p class="text-base-content/60 text-sm">{$t('wallet.defi.earn.empty_desc_lp')}</p>
					<button type="button" class="btn btn-primary min-h-[48px] w-full" onclick={handleNewLp}
						>{$t('wallet.defi.earn.empty_cta')}</button
					>
				</div>
			{/if}
			<button type="button" class="btn btn-outline btn-sm w-full" onclick={handleNewLp}
				>+ {$t('wallet.defi.earn.new_lp_position')}</button
			>
		{/if}
	</div>

	<!-- Toast -->
	{#if toastMessage}
		<div
			class="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 transition-all duration-300"
			class:opacity-0={!toastVisible}
			class:translate-y-4={!toastVisible}
			role="alert"
			aria-live="polite"
		>
			<div class="alert alert-success shadow-lg">
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M5 13l4 4L19 7"
					/></svg
				>
				<span class="text-sm">{toastMessage}</span>
				<button type="button" class="btn btn-ghost btn-xs" aria-label="Close" onclick={dismissToast}
					>✕</button
				>
			</div>
		</div>
	{/if}
</Drawer>
