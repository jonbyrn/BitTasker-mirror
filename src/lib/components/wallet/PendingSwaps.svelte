<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';
	import { createDebug } from '$lib/utils/debug';
	import IconArrowRight from '~icons/mdi/arrow-right';
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
		resumeSwapChain,
		refundSwapChain,
		getRefundInfo,
		recoverRefundDataFromChain,
		scanUnclaimedLockups,
		refundLockupDirect,
		type SwapChainState,
		type UnclaimedLockup
	} from '$lib/services/swap-chain.service';
	import { getEvmSigner } from '$lib/stores/connected-wallets.store';

	const d = createDebug('pending-swaps');

	// ── State ───────────────────────────────────────────────────────────────
	let expanded = $state(false);
	let pendingSwaps = $state<PendingConnectedSwap[]>([]);
	let swapChainState = $state<SwapChainState | null>(null);
	let claimingId = $state<string | null>(null);
	let dismissConfirmId = $state<string | null>(null);
	let resuming = $state(false);
	let checkingStatus = $state(false);
	let checkStatusMessage = $state('');
	let refundInfo = $state<Awaited<ReturnType<typeof getRefundInfo>>>(null);
	let recovering = $state(false);
	let unclaimedLockups = $state<UnclaimedLockup[]>([]);
	let scanningLockups = $state(false);

	// Per-card recovery state: 'idle' | 'loading' | 'success' | 'error'
	type CardRecovery = {
		status: 'idle' | 'loading' | 'success' | 'error';
		txHash?: string;
		error?: string;
	};
	let chainSwapRecovery = $state<CardRecovery>({ status: 'idle' });
	let lockupRecoveries = $state<Record<string, CardRecovery>>({});

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
		TBTC: { icon: '/images/tokens/tbtc.png', name: 'Bitcoin (tBTC)' },
		USDT0: { icon: '/images/chains/Tether-USD.svg', name: 'Tether USD (USDT0)' },
		USDT: { icon: '/images/chains/Tether-USD.svg', name: 'Tether USD (USDT)' },
		WBTC: { icon: '/images/tokens/wbtc.png', name: 'Bitcoin (wBTC)' },
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

			// Auto-validate: if the swap chain has a swap1Id and Boltz says it's
			// claimed, reset the state. This handles stuck swaps from previous
			// sessions where the state machine transition failed but the swap
			// completed on-chain.
			if (
				swapChainState?.swap1Id &&
				swapChainState.phase !== 'IDLE' &&
				swapChainState.phase !== 'COMPLETE'
			) {
				try {
					const { BoltzProvider } = await import('$lib/services/BoltzProvider');
					const boltz = new BoltzProvider();
					const boltzStatus = await boltz.getSwapStatus(swapChainState.swap1Id);
					if (
						boltzStatus.status === 'transaction.claimed' ||
						boltzStatus.status === 'transaction.refunded'
					) {
						d.log(
							'Swap %s already %s on-chain — auto-resetting',
							swapChainState.swap1Id,
							boltzStatus.status
						);
						const { resetSwapChainState } = await import('$lib/services/swap-chain.service');
						await resetSwapChainState();
						swapChainState = null;
					}
				} catch (validateErr) {
					d.warn('Auto-validation failed: %s', (validateErr as Error).message);
				}
			}

			// Scan for on-chain lockups in background
			void scanLockups();
		} catch (err) {
			d.error('Failed to load pending swaps: %s', (err as Error).message);
		}
	}

	async function scanLockups() {
		if (scanningLockups) return;
		scanningLockups = true;
		try {
			const { data, error: scanError } = await scanUnclaimedLockups();
			if (scanError) {
				d.error('Lockup scan failed: %s', scanError.message);
			} else {
				unclaimedLockups = data;
				d.log('Found %d unclaimed lockups', data.length);
			}
		} catch (err) {
			d.error('Lockup scan threw: %s', (err as Error).message);
		} finally {
			scanningLockups = false;
		}
	}

	async function handleRefundLockup(lockup: UnclaimedLockup) {
		const key = lockup.txHash;
		lockupRecoveries[key] = { status: 'loading' };
		try {
			const { txHash, error: refundError } = await refundLockupDirect(lockup);
			if (refundError) {
				lockupRecoveries[key] = { status: 'error', error: refundError.message };
				d.error('Lockup refund failed: %s', refundError.message);
			} else {
				lockupRecoveries[key] = { status: 'success', txHash: txHash ?? undefined };
				d.log('Lockup refund succeeded: %s', txHash);
			}
		} catch (err) {
			lockupRecoveries[key] = { status: 'error', error: (err as Error).message };
			d.error('Lockup refund threw: %s', (err as Error).message);
		}
	}

	function dismissLockup(txHash: string) {
		unclaimedLockups = unclaimedLockups.filter((l) => l.txHash !== txHash);
		delete lockupRecoveries[txHash];
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

	async function handleResumeChain() {
		d.log('Resume chain requested');
		resuming = true;
		try {
			const result = await resumeSwapChain();
			if (result.error) {
				d.error('Resume failed: %s', result.error.message);
			} else {
				d.log('Resume succeeded, phase=%s', result.data?.phase);
			}
			await refresh();
		} catch (err) {
			d.error('Resume threw: %s', (err as Error).message);
		} finally {
			resuming = false;
		}
	}

	async function handleRefund() {
		d.log('Refund requested');
		chainSwapRecovery = { status: 'loading' };
		try {
			const { txHash, error: refundError } = await refundSwapChain();
			if (refundError) {
				chainSwapRecovery = { status: 'error', error: refundError.message };
				d.error('Refund failed: %s', refundError.message);
			} else {
				chainSwapRecovery = { status: 'success', txHash: txHash ?? undefined };
				d.log('Refund succeeded, tx=%s', txHash);
			}
			await refresh();
		} catch (err) {
			chainSwapRecovery = { status: 'error', error: (err as Error).message };
			d.error('Refund threw: %s', (err as Error).message);
		}
	}

	async function handleRecover() {
		d.log('On-chain recovery requested');
		recovering = true;
		try {
			const { data, error: recoverError } = await recoverRefundDataFromChain();
			if (recoverError) {
				d.error('Recovery failed: %s', recoverError.message);
			} else {
				d.log('Recovery succeeded, timelock=%s', data?.timeoutBlockHeight);
				refundInfo = await getRefundInfo();
			}
		} catch (err) {
			d.error('Recovery threw: %s', (err as Error).message);
		} finally {
			recovering = false;
		}
	}

	// Load refund info when swap is in PARTIAL/FAILED state
	$effect(() => {
		if (
			swapChainState &&
			(getSwapChainStatus(swapChainState).isFailed || getSwapChainStatus(swapChainState).isPartial)
		) {
			getRefundInfo().then((info) => {
				refundInfo = info;
			});
		} else {
			refundInfo = null;
		}
	});

	async function handleCheckBoltzStatus() {
		if (!swapChainState?.swap1Id) return;
		checkingStatus = true;
		checkStatusMessage = '';
		try {
			const { BoltzProvider } = await import('$lib/services/BoltzProvider');
			const boltz = new BoltzProvider();
			const status = await boltz.getSwapStatus(swapChainState.swap1Id);
			checkStatusMessage = formatBoltzStatus(status.status);
			d.log('Boltz status check: %s', status.status);

			if (status.status === 'transaction.claimed') {
				// Swap completed on-chain — reset state so the card disappears.
				// Don't try to resume (state machine may be stuck in a non-terminal phase).
				d.log('Boltz swap claimed — resetting swap chain state');
				checkStatusMessage = 'Swap complete — cleaning up';
				const { resetSwapChainState } = await import('$lib/services/swap-chain.service');
				await resetSwapChainState();
				await refresh();
			} else if (
				status.status === 'transaction.server.confirmed' ||
				status.status === 'transaction.confirmed'
			) {
				d.log('Boltz swap ready (status=%s) — resuming chain', status.status);
				await handleResumeChain();
			} else if (
				status.status === 'swap.expired' ||
				status.status === 'transaction.failed' ||
				status.status === 'swap.failed'
			) {
				checkStatusMessage = `${formatBoltzStatus(status.status)} — dismiss to clean up`;
			}
			await refresh();
		} catch (err) {
			checkStatusMessage = `Check failed: ${(err as Error).message}`;
			d.error('Boltz status check failed: %s', (err as Error).message);
		} finally {
			checkingStatus = false;
		}
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

	// ── Boltz status translation ─────────────────────────────────────────────
	function formatBoltzStatus(status: string): string {
		const key = `wallet.pending_swaps.boltz_status_${status.replace(/\./g, '_')}`;
		const translated = $t(key);
		// svelte-i18n returns the key itself when not found — fall back to a readable version
		if (translated && translated !== key) return translated;
		return status.replace(/\./g, ' ');
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
						<!-- Route: source left, destination right -->
						<div class="mb-2 flex items-center gap-2">
							<div class="flex items-center gap-1.5">
								<img src={route.from.icon} alt={route.from.name} class="h-5 w-5 shrink-0" />
								<span class="text-sm font-medium">{route.from.name}</span>
							</div>
							<span class="text-primary flex flex-1 items-center justify-center"
								><IconArrowRight class="h-6 w-6" /></span
							>
							<div class="flex items-center gap-1.5">
								<img src={route.to.icon} alt={route.to.name} class="h-5 w-5 shrink-0" />
								<span class="text-sm font-medium">{route.to.name}</span>
							</div>
						</div>

						<!-- Amount + badge | Swap ID + timestamp -->
						{#if swapChainState.amount}
							<div class="flex items-center justify-between text-xs">
								<span class="text-base-content/60">
									{fmtSats(Math.round(parseFloat(swapChainState.amount) * 100_000_000))}
								</span>
								<span class="badge badge-sm {cs.badge}">{cs.label}</span>
							</div>
						{/if}

						{#if swapChainState.swap1Id}
							<div class="mt-0.5 flex items-center justify-between text-xs">
								<span class="text-base-content/50 font-mono break-all">
									Swap ID: {swapChainState.swap1Id}
								</span>
								<span class="text-base-content/40 ml-2 shrink-0">
									{fmtTime(swapChainState.updatedAt)}
								</span>
							</div>
						{/if}

						<!-- Error message -->
						{#if swapChainState.error}
							<div class="text-error mt-1 text-xs font-medium">
								{swapChainState.error}
							</div>
						{/if}

						<!-- Check status result (shown in status row, not next to buttons) -->
						{#if checkStatusMessage}
							<div class="text-base-content/60 mt-1 text-xs">
								{checkStatusMessage}
							</div>
						{/if}

						<!-- Action buttons -->
						<div class="border-base-300 mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
							{#if getSwapChainStatus(swapChainState).isActive}
								<span class="loading loading-spinner loading-xs text-info"></span>
								<span class="text-base-content/50 text-xs">
									{cs.message}
								</span>
								<!-- View on Boltz link -->
								{#if swapChainState.swap1Id}
									<a
										href="https://boltz.exchange/swap/{swapChainState.swap1Id}"
										target="_blank"
										rel="noopener noreferrer"
										class="link link-primary text-xs"
									>
										{$t('wallet.pending_swaps.view_on_boltz') || 'View on Boltz'}
									</a>
								{/if}
								<!-- Check Status button -->
								<button
									class="btn btn-ghost btn-xs min-h-[36px]"
									disabled={checkingStatus}
									onclick={handleCheckBoltzStatus}
								>
									{#if checkingStatus}
										<span class="loading loading-spinner loading-xs"></span>
									{:else}
										🔄
									{/if}
									{$t('wallet.pending_swaps.check_status') || 'Check Status'}
								</button>
								<!-- Resume button -->
								<button
									class="btn btn-primary btn-xs ml-auto min-h-[36px]"
									disabled={resuming}
									onclick={handleResumeChain}
								>
									{#if resuming}
										<span class="loading loading-spinner loading-xs"></span>
									{/if}
									{$t('wallet.pending_swaps.resume') || 'Resume'}
								</button>
							{:else if getSwapChainStatus(swapChainState).isFailed || getSwapChainStatus(swapChainState).isPartial}
								<!-- Refund / timelock info -->
								<div class="bg-base-300 mb-2 rounded-md p-2 text-xs">
									{#if refundInfo}
										{#if refundInfo.canRefund}
											<span class="text-success font-medium">
												{$t('wallet.pending_swaps.timelock_expired') || 'Timelock expired'} —
												{$t('wallet.pending_swaps.refund_available') || 'refund available'}
											</span>
										{:else}
											<span class="text-base-content/60">{refundInfo.message}</span>
										{/if}
									{:else}
										<div class="flex items-center justify-between gap-2">
											<span class="text-base-content/60">
												{$t('wallet.pending_swaps.recover_description') ||
													'Scan the RSK blockchain to recover refund data for this swap.'}
											</span>
											<button
												class="btn btn-outline btn-xs shrink-0"
												disabled={recovering}
												onclick={handleRecover}
											>
												{#if recovering}
													<span class="loading loading-spinner loading-xs"></span>
												{/if}
												{$t('wallet.pending_swaps.recover') || 'Recover from chain'}
											</button>
										</div>
									{/if}
								</div>

								<!-- Recovery state -->
								{#if chainSwapRecovery.status === 'success'}
									<div class="border-success/30 bg-success/5 mt-2 rounded-md border p-2 text-xs">
										<p class="text-success font-medium">✓ Refund successful</p>
										{#if chainSwapRecovery.txHash}
											<a
												href="https://rootstock.blockscout.com/tx/{chainSwapRecovery.txHash}"
												target="_blank"
												rel="noopener noreferrer"
												class="text-success/70 mt-0.5 block truncate font-mono text-[11px] underline"
											>
												{chainSwapRecovery.txHash}
											</a>
										{/if}
									</div>
								{:else if chainSwapRecovery.status === 'error'}
									<div class="border-error/30 bg-error/5 mt-2 rounded-md border p-2 text-xs">
										<p class="text-error font-medium">Refund failed</p>
										<p class="text-error/70 mt-0.5">{chainSwapRecovery.error}</p>
									</div>
								{/if}

								<div class="flex items-center justify-end gap-2">
									{#if refundInfo && chainSwapRecovery.status !== 'success'}
										<button
											class="btn btn-primary btn-xs min-h-[36px]"
											disabled={chainSwapRecovery.status === 'loading' || !refundInfo.canRefund}
											onclick={handleRefund}
										>
											{#if chainSwapRecovery.status === 'loading'}
												<span class="loading loading-spinner loading-xs"></span>
											{/if}
											{$t('wallet.pending_swaps.refund') || 'Recover funds'}
										</button>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Unclaimed on-chain lockup cards -->
				{#each unclaimedLockups as lockup (lockup.txHash)}
					{@const expired = lockup.expired}
					{@const recovery = lockupRecoveries[lockup.txHash]}
					<div
						class="bg-base-200 border-base-300 rounded-lg border p-3 {recovery?.status === 'success'
							? 'border-success/30 bg-success/5'
							: lockup.resolved
								? 'opacity-60'
								: ''}"
					>
						<!-- Header: source → destination -->
						<div class="mb-1.5 flex items-center gap-2">
							<div class="flex items-center gap-1.5">
								<img
									src="/images/chains/Bitcoin-Rootstock-logo.webp"
									alt="Bitcoin (rBTC)"
									class="h-5 w-5 shrink-0"
								/>
								<span class="text-sm font-medium">Bitcoin (rBTC)</span>
							</div>
							<span class="text-primary flex flex-1 items-center justify-center"
								><IconArrowRight class="h-6 w-6" /></span
							>
							<div class="flex items-center gap-1.5">
								<img
									src="/images/chains/Bitcoin-Rootstock-logo.webp"
									alt="Bitcoin (rBTC)"
									class="h-5 w-5 shrink-0"
								/>
								<span class="text-sm font-medium">Bitcoin (rBTC)</span>
							</div>
						</div>

						<!-- Amount + badge -->
						<div class="flex items-center justify-between text-xs">
							<span class="text-base-content/60">
								{lockup.amountSats.toLocaleString()} sats
							</span>
							{#if recovery?.status === 'success'}
								<span class="badge badge-success badge-xs">✓ Recovered</span>
							{:else if lockup.resolved}
								<span class="badge badge-ghost badge-xs">Already resolved</span>
							{:else}
								<span class="badge {expired ? 'badge-success' : 'badge-warning'} badge-xs">
									{expired
										? $t('wallet.pending_swaps.refund_available') || 'Refund available'
										: $t('wallet.pending_swaps.timelock_remaining') || 'Timelock remaining'}
								</span>
							{/if}
						</div>

						<!-- Status message (idle) or recovery result -->
						{#if recovery?.status === 'success'}
							<div class="mt-1 text-xs">
								<p class="text-success font-medium">✓ Refund successful</p>
								{#if recovery.txHash}
									<a
										href="https://rootstock.blockscout.com/tx/{recovery.txHash}"
										target="_blank"
										rel="noopener noreferrer"
										class="text-success/70 mt-0.5 block truncate font-mono text-[11px] underline"
									>
										{recovery.txHash}
									</a>
								{/if}
							</div>
						{:else if recovery?.status === 'error'}
							<div class="mt-1 text-xs">
								<p class="text-error font-medium">Refund failed</p>
								<p class="text-error/70 mt-0.5">{recovery.error}</p>
							</div>
						{:else if lockup.resolved}
							<p class="text-base-content/40 mt-1 text-xs">
								This lockup has already been claimed or refunded on-chain.
							</p>
						{:else}
							<p class="text-base-content/50 mt-1 text-xs">
								{expired
									? $t('wallet.pending_swaps.lockup_expired_msg') ||
										'Swap timed out — funds locked in contract. Refund now available.'
									: $t('wallet.pending_swaps.lockup_pending_msg') ||
										'Swap timed out — funds locked in contract. Refund available after timelock.'}
							</p>
						{/if}

						<!-- Actions -->
						<div class="border-base-300 mt-2 flex items-center justify-end gap-2 border-t pt-2">
							{#if recovery?.status === 'success' || lockup.resolved}
								<button
									class="btn btn-ghost btn-xs min-h-[36px]"
									onclick={() => dismissLockup(lockup.txHash)}
								>
									Dismiss
								</button>
							{:else}
								<button
									class="btn btn-primary btn-xs min-h-[36px]"
									disabled={!expired || recovery?.status === 'loading'}
									onclick={() => handleRefundLockup(lockup)}
								>
									{#if recovery?.status === 'loading'}
										<span class="loading loading-spinner loading-xs"></span>
									{/if}
									{$t('wallet.pending_swaps.refund') || 'Recover funds'}
								</button>
							{/if}
						</div>
					</div>
				{/each}

				<!-- Scanning indicator -->
				{#if scanningLockups && unclaimedLockups.length === 0}
					<div class="text-base-content/40 flex items-center justify-center gap-2 py-2 text-xs">
						<span class="loading loading-spinner loading-xs"></span>
						{$t('wallet.pending_swaps.scanning') || 'Scanning blockchain for recoverable funds...'}
					</div>
				{/if}

				<!-- Reverse swap cards -->
				{#each pendingSwaps as swap (swap.swapId)}
					{@const si = reverseSwapStatusInfo(swap)}
					<div class="bg-base-200 border-base-300 rounded-lg border p-3">
						<!-- Route: source left, destination right -->
						<div class="mb-2 flex items-center gap-2">
							<div class="flex items-center gap-1.5">
								<img src="/images/chains/Bitcoin.svg" alt="Lightning" class="h-5 w-5 shrink-0" />
								<span class="text-sm font-medium">Lightning</span>
							</div>
							<span class="text-primary flex flex-1 items-center justify-center"
								><IconArrowRight class="h-6 w-6" /></span
							>
							<div class="flex items-center gap-1.5">
								<img
									src="/images/chains/Bitcoin-Rootstock-logo.webp"
									alt="Bitcoin (rBTC)"
									class="h-5 w-5 shrink-0"
								/>
								<span class="text-sm font-medium">Bitcoin (rBTC)</span>
							</div>
						</div>

						<!-- Amount + badge -->
						<div class="flex items-center justify-between text-xs">
							<span class="text-base-content/60">
								{fmtSats(swap.expectedAmount)}
								{#if swap.connectedWalletName}
									· {swap.connectedWalletName}
								{/if}
							</span>
							<span class="badge badge-sm {si.badge}">{si.label}</span>
						</div>

						<!-- Swap ID + timestamp -->
						{#if swap.claimTxHash}
							<div class="mt-0.5 flex items-center justify-between text-xs">
								<span class="text-base-content/50 font-mono break-all">
									Swap ID: {swap.claimTxHash}
								</span>
								<span class="text-base-content/40 ml-2 shrink-0">
									{fmtTime(swap.createdAt)}
								</span>
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
