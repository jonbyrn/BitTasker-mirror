<script lang="ts">
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { onMount } from 'svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import { walletStore } from '$lib/stores/wallet.store';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { liquidationMonitor } from '$lib/stores/liquidation-monitor.store.svelte';
	import LoanOverview from '../LoanOverview.svelte';
	import PositionCard from '../PositionCard.svelte';

	onMount(() => {
		liquidationMonitor.start();
		return () => liquidationMonitor.stop();
	});

	interface Props {
		isOpen: boolean;
		onClose: () => void;
	}

	let { isOpen, onClose }: Props = $props();

	let expandedWalletId = $state<string | null>(null);
	let toastMessage = $state<string | null>(null);
	let toastVisible = $state(false);

	let allPositions = $derived(Array.from(defiPositions.aavePositions.entries()));
	let hasExistingPositions = $derived(allPositions.length > 0);

	let builtinAddress = $derived(get(walletStore).arb?.address ?? '');

	// Drawer open effect — auto-expand first position
	let wasOpen = $state(false);
	$effect(() => {
		if (isOpen && !wasOpen) {
			if (hasExistingPositions) {
				expandedWalletId = allPositions[0][0];
			} else {
				expandedWalletId = 'builtin';
			}
			toastMessage = null;
			toastVisible = false;
		}
		wasOpen = isOpen;
	});

	function handleToggleWallet(walletId: string) {
		expandedWalletId = expandedWalletId === walletId ? null : walletId;
	}

	function handleSuccess(txHashOrVoid?: string) {
		// BorrowAction already invalidated the cache; re-fetch fresh data from chain.
		// Do NOT call invalidate() again — that would keep aavePositions empty
		// and hide LoanOverview + break the accordion until the next manual refresh.
		const wid = expandedWalletId;
		if (wid) defiPositions.refreshAavePosition(wid, true);

		if (txHashOrVoid) {
			toastMessage = $t('wallet.defi.loan_wizard.transaction_confirmed', {
				values: { hash: txHashOrVoid.slice(0, 10) }
			});
			toastVisible = true;
			setTimeout(() => {
				toastVisible = false;
				setTimeout(() => {
					toastMessage = null;
				}, 300);
			}, 5000);
		}
	}

	function handleSwitchAction(_action: string) {
		// PositionCard handles this internally — this is a no-op passthrough
	}

	function handleClose() {
		expandedWalletId = null;
		toastMessage = null;
		toastVisible = false;
		onClose();
	}
</script>

<Drawer
	{isOpen}
	onClose={handleClose}
	title={$t('wallet.defi.tab_borrow')}
	position="right"
	isScrollable={true}
>
	<div class="flex flex-col gap-4">
		<!-- Loan overview (aggregated across all wallets) -->
		<LoanOverview />

		<!-- Position cards -->
		{#each allPositions as [walletId, pos] (walletId)}
			<PositionCard
				{walletId}
				address={pos.address}
				isExpanded={expandedWalletId === walletId}
				onToggle={() => handleToggleWallet(walletId)}
				onSuccess={handleSuccess}
				onSwitchAction={handleSwitchAction}
			/>
		{/each}

		<!-- No positions: show builtin card expanded for new loan -->
		{#if !hasExistingPositions}
			<PositionCard
				walletId="builtin"
				address={builtinAddress}
				isExpanded={true}
				onToggle={() => {}}
				onSuccess={handleSuccess}
				onSwitchAction={handleSwitchAction}
			/>
		{/if}
	</div>

	<!-- Floating success toast at bottom -->
	{#if toastMessage}
		<div
			class="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 transition-all duration-300"
			class:opacity-0={!toastVisible}
			class:translate-y-4={!toastVisible}
		>
			<div class="alert alert-success shadow-lg">
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M5 13l4 4L19 7"
					/>
				</svg>
				<span class="text-sm">{toastMessage}</span>
				<button
					type="button"
					class="btn btn-ghost btn-xs"
					onclick={() => {
						toastVisible = false;
						setTimeout(() => {
							toastMessage = null;
						}, 300);
					}}>✕</button
				>
			</div>
		</div>
	{/if}
</Drawer>
