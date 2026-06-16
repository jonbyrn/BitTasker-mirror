<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';
	import { createDebug } from '$lib/utils/debug';
	import {
		type PendingConnectedSwap,
		getActivePendingSwaps,
		claimPendingSwap,
		removePendingSwap,
		startPendingSwapPoller
	} from '$lib/services/connected-wallet-reverse-swap';
	import {
		getSwapChainState,
		getSwapChainStatus,
		type SwapChainState
	} from '$lib/services/swap-chain.service';
	import { getEvmSigner } from '$lib/stores/connected-wallets.store';

	const d = createDebug('pending-swaps');

	// ── State ───────────────────────────────────────────────────────────────
	let expanded = $state(false);
	let pendingSwaps = $state<PendingConnectedSwap[]>([]);
	let swapChainState = $state<SwapChainState | null>(null);
	let claimingId = $state<string | null>(null);
	let dismissConfirmId = $state<string | null>(null);

	// ── Derived ─────────────────────────────────────────────────────────────
	const swapChainActive = $derived(
		swapChainState !== null && getSwapChainStatus(swapChainState).isActive
	);
	const swapChainNeedsAction = $derived(
		swapChainState !== null &&
			(getSwapChainStatus(swapChainState).isFailed || getSwapChainStatus(swapChainState).isPartial)
	);
	const totalCount = $derived(
		pendingSwaps.length + (swapChainActive || swapChainNeedsAction ? 1 : 0)
	);

	// ── Asset metadata ──────────────────────────────────────────────────────
	interface AssetInfo {
		icon: string;
		name: string;
	}

	const ASSET_MAP: Record<string, AssetInfo> = {
		RBTC: { icon: '/images/chains/Bitcoin-Rootstock-logo.webp', name: 'Bitcoin (rBTC)' },
		BTC: { icon: '/images/chains/Bitcoin.svg', name: 'Bitcoin (BTC)' },
		TBTC: { icon: '/images/chains/arbitrum.png', name: 'Bitcoin (tBTC)' },
		USDT0: { icon: '/images/chains/Tether-USD.svg', name: 'Tether USD (USDT0)' },
		USDT: { icon: '/images/chains/Tether-USD.svg', name: 'Tether USD (USDT)' },
		WBTC: { icon: '/images/chains/arbitrum.png', name: 'Wrapped Bitcoin (wBTC)' },
		Lightning: { icon: '/images/chains/Bitcoin.svg', name: 'Lightning' }
	};

	function getAssetInfo(asset: string): AssetInfo {
		return ASSET_MAP[asset] ?? { icon: '/images/chains/Bitcoin.svg', name: asset };
	}

	// ── Lifecycle ───────────────────────────────────────────────────────────
	let stopPoller: (() => void) | null = null;

	onMount(async () => {
		await refresh();
		stopPoller = startPendingSwapPoller(async () => {
			await refresh();
		});
	});

	onDestroy(() => {
		stopPoller?.();
	});

	async function refresh() {
		try {
			pendingSwaps = await getActivePendingSwaps();
			const state = await getSwapChainState();
			swapChainState = state.phase === 'IDLE' ? null : state;
			d.log(
				'Refreshed: %d pending swaps, chain=%s',
				pendingSwaps.length,
				swapChainState?.phase ?? 'idle'
			);
		} catch (err) {
			d.error('Failed to load pending swaps: %s', (err as Error).message);
		}
	}

	// ── Actions ─────────────────────────────────────────────────────────────
	async function handleClaim(swap: PendingConnectedSwap) {
		const evmSigner = getEvmSigner(swap.connectedWalletId);
		if (!evmSigner) return;
		claimingId = swap.swapId;
		try {
			await claimPendingSwap(swap, evmSigner);
		} catch (err) {
			d.error('Claim failed: %s', (err as Error).message);
		} finally {
			claimingId = null;
			await refresh();
		}
	}

	async function handleDismiss(swapId: string) {
		await removePendingSwap(swapId);
		dismissConfirmId = null;
		await refresh();
	}

	function handleResumeChain() {
		d.log('Resume chain requested');
	}

	// ── Formatting ──────────────────────────────────────────────────────────
	function fmtSats(sats: number): string {
		return `${sats.toLocaleString()} sats`;
	}

	function fmtTime(ts: number): string {
		const diff = Date.now() - ts;
		const min = Math.floor(diff / 60_000);
		if (min < 1) return 'Just now';
		if (min < 60) return `${min}m ago`;
		const hr = Math.floor(min / 60);
		if (hr < 24) return `${hr}h ago`;
		const day = Math.floor(hr / 24);
		return `${day}d ago`;
	}

	// ── Reverse swap status messages ────────────────────────────────────────
	function reverseSwapStatusInfo(swap: PendingConnectedSwap): {
		label: string;
		badge: string;
		dot: string;
		message: string;
	} {
		switch (swap.status) {
			case 'pending':
				return {
					label: 'Waiting for payment',
					badge: 'badge-warning',
					dot: 'bg-warning',
					message: 'Waiting for Lightning payment'
				};
			case 'claimable':
				return {
					label: 'Ready to claim',
					badge: 'badge-success',
					dot: 'bg-success',
					message: 'Lightning received — ready to claim RBTC'
				};
			case 'claiming':
				return {
					label: 'Claiming',
					badge: 'badge-info',
					dot: 'bg-info',
					message: 'Claim transaction broadcasting...'
				};
			case 'claimed':
				return {
					label: 'Claimed',
					badge: 'badge-success',
					dot: 'bg-success',
					message: 'RBTC claimed successfully'
				};
			case 'expired':
				return {
					label: 'Expired',
					badge: 'badge-error',
					dot: 'bg-error',
					message: 'Swap expired — funds not locked'
				};
			case 'failed':
				return {
					label: 'Failed',
					badge: 'badge-error',
					dot: 'bg-error',
					message: swap.error ? `Claim failed — ${swap.error}` : 'Claim failed'
				};
			default:
				return {
					label: 'Unknown',
					badge: 'badge-ghost',
					dot: 'bg-base-content/30',
					message: 'Unknown status'
				};
		}
	}

	// ── Chain swap status messages ──────────────────────────────────────────
	function chainSwapStatusInfo(state: SwapChainState): {
		label: string;
		badge: string;
		dot: string;
		message: string;
	} {
		const info = getSwapChainStatus(state);
		if (info.isFailed) {
			return {
				label: 'Failed',
				badge: 'badge-error',
				dot: 'bg-error',
				message: state.error ? `Swap failed — ${state.error}` : 'Swap failed'
			};
		}
		if (info.isPartial) {
			return {
				label: 'Partial',
				badge: 'badge-warning',
				dot: 'bg-warning',
				message: 'Swap partially completed — manual action needed'
			};
		}
		switch (state.phase) {
			case 'SWAP_1_PENDING':
				return {
					label: 'Locking',
					badge: 'badge-warning',
					dot: 'bg-warning animate-pulse',
					message: 'Locking rBTC on Rootstock — waiting for network confirmation'
				};
			case 'SWAP_1_CONFIRMED':
				return {
					label: 'Processing',
					badge: 'badge-info',
					dot: 'bg-info animate-pulse',
					message: 'rBTC locked on Rootstock — Boltz is processing the swap'
				};
			case 'SWAP_2_PENDING':
				return {
					label: 'Claiming',
					badge: 'badge-warning',
					dot: 'bg-warning animate-pulse',
					message: 'Claiming tBTC on Arbitrum — transaction submitted'
				};
			case 'SWAP_2_CONFIRMED':
				return {
					label: 'Swapping',
					badge: 'badge-info',
					dot: 'bg-info animate-pulse',
					message: 'tBTC received — swapping to final asset'
				};
			default:
				return {
					label: 'In progress',
					badge: 'badge-info',
					dot: 'bg-info animate-pulse',
					message: 'Processing swap...'
				};
		}
	}

	// ── Route display helpers ───────────────────────────────────────────────
	function getChainSwapRoute(state: SwapChainState): { from: AssetInfo; to: AssetInfo } {
		const route = state.route;
		if (!route || !route.hops || route.hops.length === 0) {
			return { from: getAssetInfo('RBTC'), to: getAssetInfo('BTC') };
		}
		const firstHop = route.hops[0];
		const lastHop = route.hops[route.hops.length - 1];
		return {
			from: getAssetInfo(firstHop?.fromAsset ?? 'RBTC'),
			to: getAssetInfo(lastHop?.toAsset ?? 'BTC')
		};
	}
</script>

{#if totalCount > 0}
	<div
		class="collapse-arrow border-warning/40 bg-base-100 collapse rounded-lg border"
		class:collapse-open={expanded}
	>
		<button
			type="button"
			class="collapse-title flex items-center justify-between px-3 py-2 pr-10 text-left text-sm font-medium sm:px-4 sm:py-3 sm:pr-12 sm:text-base"
			onclick={() => (expanded = !expanded)}
		>
			<div class="flex min-w-0 flex-1 items-center gap-2">
				<span class="badge badge-warning badge-xs font-bold text-black">{totalCount}</span>
				<span>{$t('wallet.pending_swaps.pending_swaps')}</span>
			</div>
		</button>

		<div class="collapse-content">
			<div class="space-y-1.5 px-2 sm:space-y-2 sm:px-3">
				<!-- Chain swap card -->
				{#if swapChainState && (swapChainActive || swapChainNeedsAction)}
					{@const cs = chainSwapStatusInfo(swapChainState)}
					{@const route = getChainSwapRoute(swapChainState)}
					<div class="bg-base-200 border-base-300 rounded-lg border p-3">
						<!-- Route with icons + status badge right-aligned -->
						<div class="mb-2 flex items-center gap-2">
							<img src={route.from.icon} alt={route.from.name} class="h-5 w-5 shrink-0" />
							<span class="text-sm font-medium">{route.from.name}</span>
							<span class="text-base-content/40">→</span>
							<img src={route.to.icon} alt={route.to.name} class="h-5 w-5 shrink-0" />
							<span class="text-sm font-medium">{route.to.name}</span>
							<span class="ml-auto shrink-0">
								<span class="badge badge-sm {cs.badge}">{cs.label}</span>
							</span>
						</div>

						<!-- Amount + timestamp on same line -->
						{#if swapChainState.amount}
							<div class="flex items-center justify-between text-xs">
								<span class="text-base-content/60">
									{fmtSats(Math.round(parseFloat(swapChainState.amount) * 100_000_000))}
								</span>
								<span class="text-base-content/40">
									{fmtTime(swapChainState.updatedAt)}
								</span>
							</div>
						{/if}

						<!-- Transaction ID -->
						{#if swapChainState.swap1Id}
							<div class="text-base-content/50 mt-1 font-mono text-xs break-all">
								Swap ID: {swapChainState.swap1Id}
							</div>
						{/if}

						<!-- Error message -->
						{#if swapChainState.error}
							<div class="text-error mt-1 text-xs font-medium">
								{swapChainState.error}
							</div>
						{/if}

						<!-- Action buttons -->
						<div class="border-base-300 mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
							{#if getSwapChainStatus(swapChainState).isActive}
								<span class="loading loading-spinner loading-xs text-info"></span>
								<span class="text-base-content/50 text-xs">
									{cs.message}
								</span>
							{:else if getSwapChainStatus(swapChainState).isFailed || getSwapChainStatus(swapChainState).isPartial}
								{#if dismissConfirmId === 'chain-swap'}
									<button
										class="btn btn-error btn-xs min-h-[36px]"
										onclick={() => {
											dismissConfirmId = null;
										}}
									>
										{$t('wallet.pending_swaps.dismiss_confirm')}
									</button>
									<button
										class="btn btn-ghost btn-xs min-h-[36px]"
										onclick={() => (dismissConfirmId = null)}
									>
										{$t('wallet.pending_swaps.cancel')}
									</button>
								{:else}
									<button class="btn btn-warning btn-xs min-h-[36px]" onclick={handleResumeChain}>
										{$t('wallet.pending_swaps.resume')}
									</button>
									<button
										class="btn btn-ghost btn-xs text-base-content/50 min-h-[36px]"
										onclick={() => (dismissConfirmId = 'chain-swap')}
									>
										{$t('wallet.pending_swaps.dismiss')}
									</button>
								{/if}
							{/if}
						</div>
					</div>
				{/if}

				<!-- Reverse swap cards -->
				{#each pendingSwaps as swap (swap.swapId)}
					{@const si = reverseSwapStatusInfo(swap)}
					<div class="bg-base-200 border-base-300 rounded-lg border p-3">
						<!-- Route + status badge right-aligned -->
						<div class="mb-2 flex items-center gap-2">
							<img src="/images/chains/Bitcoin.svg" alt="Lightning" class="h-5 w-5 shrink-0" />
							<span class="text-sm font-medium">Lightning</span>
							<span class="text-base-content/40">→</span>
							<img
								src="/images/chains/Bitcoin-Rootstock-logo.webp"
								alt="Bitcoin (rBTC)"
								class="h-5 w-5 shrink-0"
							/>
							<span class="text-sm font-medium">Bitcoin (rBTC)</span>
							<span class="ml-auto shrink-0">
								<span class="badge badge-sm {si.badge}">{si.label}</span>
							</span>
						</div>

						<!-- Amount + timestamp on same line -->
						<div class="flex items-center justify-between text-xs">
							<span class="text-base-content/60">
								{fmtSats(swap.expectedAmount)}
								{#if swap.connectedWalletName}
									· {swap.connectedWalletName}
								{/if}
							</span>
							<span class="text-base-content/40">
								{fmtTime(swap.createdAt)}
							</span>
						</div>

						<!-- Claim transaction ID (full) -->
						{#if swap.claimTxHash}
							<div class="text-base-content/50 mt-1 font-mono text-xs break-all">
								Swap ID: {swap.claimTxHash}
							</div>
						{/if}

						<!-- Error message -->
						{#if swap.error}
							<div class="text-error mt-1 text-xs font-medium">
								{swap.error}
							</div>
						{/if}

						<!-- Action buttons -->
						<div class="border-base-300 mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
							{#if swap.status === 'claimable'}
								<button
									class="btn btn-warning btn-xs min-h-[36px] gap-1"
									disabled={claimingId === swap.swapId}
									onclick={() => handleClaim(swap)}
								>
									{#if claimingId === swap.swapId}
										<span class="loading loading-spinner loading-xs"></span>
										{$t('wallet.pending_swaps.claiming')}
									{:else}
										⚡ {$t('wallet.pending_swaps.claim_rbtc')}
									{/if}
								</button>
							{:else if swap.status === 'pending'}
								<span class="loading loading-spinner loading-xs text-warning"></span>
								<span class="text-base-content/50 text-xs">
									{$t('wallet.pending_swaps.waiting_payment')}
								</span>
							{:else if swap.status === 'claiming'}
								<span class="loading loading-spinner loading-xs text-info"></span>
								<span class="text-base-content/50 text-xs">
									{$t('wallet.pending_swaps.broadcasting')}
								</span>
							{/if}

							{#if swap.status === 'expired' || swap.status === 'failed'}
								{#if dismissConfirmId === swap.swapId}
									<button
										class="btn btn-error btn-xs min-h-[36px]"
										onclick={() => handleDismiss(swap.swapId)}
									>
										{$t('wallet.pending_swaps.remove')}
									</button>
									<button
										class="btn btn-ghost btn-xs min-h-[36px]"
										onclick={() => (dismissConfirmId = null)}
									>
										{$t('wallet.pending_swaps.cancel')}
									</button>
								{:else}
									<button
										class="btn btn-ghost btn-xs text-base-content/50 min-h-[36px]"
										onclick={() => (dismissConfirmId = swap.swapId)}
									>
										{$t('wallet.pending_swaps.dismiss')}
									</button>
								{/if}
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}
