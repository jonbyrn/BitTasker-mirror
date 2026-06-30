<script lang="ts">
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { SvelteMap } from 'svelte/reactivity';
	import Drawer from '$lib/components/Drawer.svelte';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { walletStore } from '$lib/stores/wallet.store';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { supplyApy } from '$lib/runes/supplyApy.svelte';
	import EarnOverview from './defi/earn/EarnOverview.svelte';
	import EarnLendingCard from './defi/earn/EarnLendingCard.svelte';
	import EarnLPWalletAccordion from './defi/earn/EarnLPWalletAccordion.svelte';
	import type { UniswapLPPosition } from '$lib/stores/defi-positions.store.svelte';
	import * as Sentry from '@sentry/sveltekit';
	import IconHandCoin from '~icons/mdi/hand-coin';
	import IconLayersOutline from '~icons/mdi/layers-outline';
	import IconCheck from '~icons/mdi/check';

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
	let expandedLpWalletId = $state<string | null>(null);
	let toastMessage = $state<string | null>(null);
	let toastVisible = $state(false);

	let allAavePositions = $derived(Array.from(defiPositions.aavePositions.entries()));
	let lpPositionsByWallet = $derived.by(() => {
		const grouped = new SvelteMap<string, UniswapLPPosition[]>();
		for (const [, pos] of defiPositions.uniswapPositions) {
			const existing = grouped.get(pos.walletId) ?? [];
			existing.push(pos);
			grouped.set(pos.walletId, existing);
		}
		return Array.from(grouped.entries());
	});
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
			else if (earnSubTab === 'lp' && lpPositionsByWallet.length > 0)
				expandedLpWalletId = lpPositionsByWallet[0][0];
			toastMessage = null;
			toastVisible = false;
		}
		wasOpen = isOpen;
	});

	function handleToggleWallet(walletId: string) {
		expandedWalletId = expandedWalletId === walletId ? null : walletId;
	}
	function handleToggleLpWallet(walletId: string) {
		expandedLpWalletId = expandedLpWalletId === walletId ? null : walletId;
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
	function handleClose() {
		expandedWalletId = null;
		expandedLpWalletId = null;
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
					<IconHandCoin class="mr-1 h-4 w-4" />
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
					<IconLayersOutline class="mr-1 h-4 w-4" />
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
					supplyAPY={supplyApy.apy}
				/>
			{/each}
			{#if allAavePositions.length === 0}
				<div class="flex flex-col items-center gap-3 py-8 text-center">
					<div class="bg-primary/10 flex h-16 w-16 items-center justify-center rounded-full">
						<IconHandCoin class="text-primary h-8 w-8" />
					</div>
					<h3 class="text-base font-semibold">{$t('wallet.defi.earn.empty_title')}</h3>
					<p class="text-base-content/60 text-sm">
						{$t('wallet.defi.earn.empty_desc_lending', {
							values: { apy: supplyApy.apy?.toFixed(2) ?? '…' }
						})}
					</p>
					{#if idleBalance > 0 && supplyApy.apy !== null}
						<div class="bg-base-200 rounded-box p-3 text-sm">
							<p>
								{$t('wallet.defi.earn.empty_nudge', {
									values: { balance: `$${idleBalance.toFixed(2)}` }
								})}
							</p>
							<p class="text-base-content/60 text-xs">
								{$t('wallet.defi.earn.empty_nudge_earning', {
									values: {
										apy: supplyApy.apy.toFixed(2),
										amount: `$${((idleBalance * supplyApy.apy) / 100).toFixed(2)}`
									}
								})}
							</p>
						</div>
					{/if}
				</div>
			{/if}
		{/if}

		<!-- LP tab -->
		{#if earnSubTab === 'lp'}
			<EarnOverview mode="lp" />
			{#each lpPositionsByWallet as [walletId, positions] (walletId)}
				<EarnLPWalletAccordion
					{walletId}
					{positions}
					isExpanded={expandedLpWalletId === walletId}
					onToggle={() => handleToggleLpWallet(walletId)}
					onSuccess={handleSuccess}
				/>
			{/each}
			<!-- Builtin wallet accordion always shows (even with no positions) -->
			{#if !lpPositionsByWallet.some(([id]) => id === 'builtin')}
				<EarnLPWalletAccordion
					walletId="builtin"
					positions={[]}
					isExpanded={expandedLpWalletId === 'builtin'}
					onToggle={() => handleToggleLpWallet('builtin')}
					onSuccess={handleSuccess}
				/>
			{/if}
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
				<IconCheck class="h-4 w-4" />
				<span class="text-sm">{toastMessage}</span>
				<button type="button" class="btn btn-ghost btn-xs" aria-label="Close" onclick={dismissToast}
					>✕</button
				>
			</div>
		</div>
	{/if}
</Drawer>
