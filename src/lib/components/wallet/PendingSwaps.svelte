<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount, onDestroy } from 'svelte';
	import { createDebug } from '$lib/utils/debug';
	import {
		getReverseSwapStatusInfo,
		getChainSwapStatusInfo,
		fmtSats,
		fmtTime,
		type ChainSwapStatusInput
	} from '$lib/utils/swap-status-format';
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
	import { Capacitor } from '@capacitor/core';

	const d = createDebug('pending-swaps');

	// ── Clipboard helper ──────────────────────────────────────────────────
	let copiedId = $state<string | null>(null);
	let _copyTimer: ReturnType<typeof setTimeout> | null = null;

	async function copySwapId(id: string) {
		try {
			if (Capacitor.isNativePlatform()) {
				const { Clipboard } = await import('@capacitor/clipboard');
				await Clipboard.write({ string: id });
			} else {
				await navigator.clipboard.writeText(id);
			}
			copiedId = id;
			if (_copyTimer) clearTimeout(_copyTimer);
			_copyTimer = setTimeout(() => {
				copiedId = null;
				_copyTimer = null;
			}, 2000);
		} catch {
			d.warn('Failed to copy swap ID');
		}
	}

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

	/** Whether any swap needs user action (claimable, refundable, partial, failed) */
	const needsUserAction = $derived.by(() => {
		// Reverse swaps needing claim
		if (pendingSwaps.some((s) => s.status === 'claimable')) return true;
		// Chain swap in PARTIAL or FAILED state (user can resume/refund)
		if (swapChainNeedsAction) return true;
		return false;
	});

	// ── Asset metadata ──────────────────────────────────────────────────────
	interface AssetInfo {
		icon: string;
		name: string;
	}

	const ASSET_ICONS: Record<string, string> = {
		RBTC: '/images/chains/Bitcoin-Rootstock-logo.webp',
		BTC: '/images/chains/Bitcoin.svg',
		TBTC: '/images/tokens/tbtc.png',
		USDT0: '/images/chains/Tether-USD.svg',
		USDT: '/images/chains/Tether-USD.svg',
		WBTC: '/images/tokens/wbtc.png',
		Lightning: '/images/chains/Bitcoin.svg'
	};

	const ASSET_I18N: Record<string, string> = {
		RBTC: 'wallet.pending_swaps.bitcoin_rbtc',
		BTC: 'wallet.pending_swaps.bitcoin_btc',
		TBTC: 'wallet.pending_swaps.bitcoin_tbtc',
		USDT0: 'wallet.pending_swaps.tether_usdt0',
		USDT: 'wallet.pending_swaps.tether_usdt',
		WBTC: 'wallet.pending_swaps.bitcoin_wbtc',
		Lightning: 'wallet.pending_swaps.lightning'
	};

	function getAssetInfo(asset: string): AssetInfo {
		const icon = ASSET_ICONS[asset] ?? '/images/chains/Bitcoin.svg';
		const i18nKey = ASSET_I18N[asset];
		return { icon, name: i18nKey ? $t(i18nKey) : asset };
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
			// Also check COMPLETE swaps that are actually still in-progress on Boltz
			// (e.g., single-hop Boltz chain swaps that were marked COMPLETE before
			// the rBTC claim was processed).
			if (swapChainState?.swap1Id && swapChainState.phase !== 'IDLE') {
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
					} else if (
						swapChainState.phase === 'COMPLETE' &&
						(boltzStatus.status === 'transaction.server.confirmed' ||
							boltzStatus.status === 'transaction.claim.pending')
					) {
						// Swap marked COMPLETE but Boltz hasn't released funds yet —
						// transition back to PARTIAL so it shows in pending swaps
						// and the claim can be retried.
						d.log(
							'Swap %s marked COMPLETE but Boltz status=%s — reverting to PARTIAL',
							swapChainState.swap1Id,
							boltzStatus.status
						);
						const { transitionTo } = await import('$lib/services/swap-chain/state');
						const revertedState = await transitionTo(swapChainState, 'PARTIAL', {
							error: `Swap not yet complete on Boltz: ${boltzStatus.status}`
						});
						if (revertedState.data) {
							swapChainState = revertedState.data;
						}
					}
				} catch (validateErr) {
					d.warn('Auto-validation failed: %s', (validateErr as Error).message);
				}
			}

			// Auto-reset: if swap failed/partial but never started on-chain (no swap1Id),
			// clear the stale state so the pending badge disappears.
			if (
				swapChainState &&
				(swapChainState.phase === 'FAILED' || swapChainState.phase === 'PARTIAL') &&
				!swapChainState.swap1Id
			) {
				d.log('Swap %s failed before on-chain execution — auto-resetting', swapChainState.phase);
				const { resetSwapChainState } = await import('$lib/services/swap-chain.service');
				await resetSwapChainState();
				swapChainState = null;
			}

			// Scan for on-chain lockups in background
			void scanLockups();

			// Auto-expand when swaps need user action (H7)
			if (needsUserAction) {
				expanded = true;
			}

			// Load refund info when swap is in PARTIAL/FAILED state
			if (
				swapChainState &&
				(getSwapChainStatus(swapChainState).isFailed ||
					getSwapChainStatus(swapChainState).isPartial)
			) {
				refundInfo = await getRefundInfo();
			} else {
				refundInfo = null;
			}
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
				checkStatusMessage = $t('wallet.pending_swaps.swap_complete_cleaning');
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
				checkStatusMessage = `${formatBoltzStatus(status.status)} — ${$t('wallet.pending_swaps.dismiss_to_cleanup')}`;
			}
			await refresh();
		} catch (err) {
			checkStatusMessage = $t('wallet.pending_swaps.check_failed', {
				values: { error: (err as Error).message }
			});
			d.error('Boltz status check failed: %s', (err as Error).message);
		} finally {
			checkingStatus = false;
		}
	}

	// ── Boltz status translation ─────────────────────────────────────────────
	function formatBoltzStatus(status: string): string {
		const key = `wallet.pending_swaps.boltz_status_${status.replace(/\./g, '_')}`;
		const translated = $t(key);
		// svelte-i18n returns the key itself when not found — fall back to a readable version
		if (translated && translated !== key) return translated;
		return status.replace(/\./g, ' ');
	}

	// ── Chain swap input helper ──────────────────────────────────────────────
	function toChainSwapInput(state: SwapChainState): ChainSwapStatusInput {
		const info = getSwapChainStatus(state);
		return {
			phase: state.phase,
			isFailed: info.isFailed,
			isPartial: info.isPartial,
			error: state.error
		};
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
					{@const cs = getChainSwapStatusInfo(toChainSwapInput(swapChainState), $t)}
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
									{fmtSats(Math.round(parseFloat(swapChainState.amount) * 100_000_000), $t)}
								</span>
								<span class="badge badge-sm {cs.color}">{cs.label}</span>
							</div>
						{/if}

						{#if swapChainState.swap1Id}
							<div class="mt-0.5 flex items-center justify-between text-xs">
								<span class="text-base-content/50 font-mono break-all">
									{$t('wallet.pending_swaps.swap_id')}: {swapChainState.swap1Id}
								</span>
								<button
									type="button"
									class="btn btn-ghost btn-xs text-base-content/40 hover:text-base-content/70 min-h-[28px] min-w-[28px] p-0"
									onclick={() => copySwapId(swapChainState.swap1Id!)}
									aria-label={$t('wallet.pending_swaps.copy_swap_id')}
								>
									{#if copiedId === swapChainState.swap1Id}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="text-success h-3.5 w-3.5"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											><path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M5 13l4 4L19 7"
											/></svg
										>
									{:else}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-3.5 w-3.5"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											><path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
											/></svg
										>
									{/if}
								</button>
								<span class="text-base-content/40 ml-1 shrink-0">
									{fmtTime(swapChainState.updatedAt, $t)}
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
										{$t('wallet.pending_swaps.view_on_boltz')}
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
									{$t('wallet.pending_swaps.check_status')}
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
									{$t('wallet.pending_swaps.resume')}
								</button>
							{:else if getSwapChainStatus(swapChainState).isPartial}
								<!-- PARTIAL state instructions (H13) -->
								<div class="bg-info/10 border-info/30 mb-2 w-full rounded-md border p-2 text-xs">
									<p class="text-info font-medium">
										{$t('wallet.pending_swaps.partial_instructions')}
									</p>
								</div>
								<!-- Refund / timelock info -->
								<div class="bg-base-300 mb-2 rounded-md p-2 text-xs">
									{#if refundInfo}
										{#if refundInfo.canRefund}
											<span class="text-success font-medium">
												{$t('wallet.pending_swaps.timelock_expired')} —
												{$t('wallet.pending_swaps.refund_available')}
											</span>
										{:else}
											<span class="text-base-content/60">{refundInfo.message}</span>
										{/if}
									{:else}
										<div class="flex items-center justify-between gap-2">
											<span class="text-base-content/60">
												{$t('wallet.pending_swaps.recover_description')}
											</span>
											<button
												class="btn btn-outline btn-xs shrink-0"
												disabled={recovering}
												onclick={handleRecover}
											>
												{#if recovering}
													<span class="loading loading-spinner loading-xs"></span>
												{/if}
												{$t('wallet.pending_swaps.recover')}
											</button>
										</div>
									{/if}
								</div>

								<!-- Recovery state -->
								{#if chainSwapRecovery.status === 'success'}
									<div class="border-success/30 bg-success/5 mt-2 rounded-md border p-2 text-xs">
										<p class="text-success font-medium">
											{$t('wallet.pending_swaps.refund_success')}
										</p>
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
										<p class="text-error font-medium">{$t('wallet.pending_swaps.refund_failed')}</p>
										<p class="text-error/70 mt-0.5">{chainSwapRecovery.error}</p>
									</div>
								{/if}

								<div class="flex items-center justify-end gap-2">
									<!-- Check status button (always available for partial/failed) -->
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
										{$t('wallet.pending_swaps.check_status')}
									</button>
									<!-- Claim button: resume the swap chain to retry the Boltz claim -->
									{#if swapChainState.swap1Id}
										<button
											class="btn btn-primary btn-xs min-h-[36px]"
											disabled={resuming}
											onclick={handleResumeChain}
										>
											{#if resuming}
												<span class="loading loading-spinner loading-xs"></span>
											{/if}
											{$t('wallet.pending_swaps.resume')}
										</button>
									{/if}
									{#if refundInfo && chainSwapRecovery.status !== 'success'}
										<button
											class="btn btn-outline btn-error btn-xs min-h-[36px]"
											disabled={chainSwapRecovery.status === 'loading' || !refundInfo.canRefund}
											onclick={handleRefund}
										>
											{#if chainSwapRecovery.status === 'loading'}
												<span class="loading loading-spinner loading-xs"></span>
											{/if}
											{$t('wallet.pending_swaps.refund')}
										</button>
									{/if}
								</div>
							{:else if getSwapChainStatus(swapChainState).isFailed}
								<!-- Refund / timelock info -->
								<div class="bg-base-300 mb-2 rounded-md p-2 text-xs">
									{#if refundInfo}
										{#if refundInfo.canRefund}
											<span class="text-success font-medium">
												{$t('wallet.pending_swaps.timelock_expired')} —
												{$t('wallet.pending_swaps.refund_available')}
											</span>
										{:else}
											<span class="text-base-content/60">{refundInfo.message}</span>
										{/if}
									{:else}
										<div class="flex items-center justify-between gap-2">
											<span class="text-base-content/60">
												{$t('wallet.pending_swaps.recover_description')}
											</span>
											<button
												class="btn btn-outline btn-xs shrink-0"
												disabled={recovering}
												onclick={handleRecover}
											>
												{#if recovering}
													<span class="loading loading-spinner loading-xs"></span>
												{/if}
												{$t('wallet.pending_swaps.recover')}
											</button>
										</div>
									{/if}
								</div>

								<!-- Recovery state -->
								{#if chainSwapRecovery.status === 'success'}
									<div class="border-success/30 bg-success/5 mt-2 rounded-md border p-2 text-xs">
										<p class="text-success font-medium">
											{$t('wallet.pending_swaps.refund_success')}
										</p>
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
										<p class="text-error font-medium">{$t('wallet.pending_swaps.refund_failed')}</p>
										<p class="text-error/70 mt-0.5">{chainSwapRecovery.error}</p>
									</div>
								{/if}

								<div class="flex items-center justify-end gap-2">
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
										{$t('wallet.pending_swaps.check_status')}
									</button>
									{#if refundInfo && chainSwapRecovery.status !== 'success'}
										<button
											class="btn btn-outline btn-error btn-xs min-h-[36px]"
											disabled={chainSwapRecovery.status === 'loading' || !refundInfo.canRefund}
											onclick={handleRefund}
										>
											{#if chainSwapRecovery.status === 'loading'}
												<span class="loading loading-spinner loading-xs"></span>
											{/if}
											{$t('wallet.pending_swaps.refund')}
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
									alt={$t('wallet.pending_swaps.bitcoin_rbtc')}
									class="h-5 w-5 shrink-0"
								/>
								<span class="text-sm font-medium">{$t('wallet.pending_swaps.bitcoin_rbtc')}</span>
							</div>
							<span class="text-primary flex flex-1 items-center justify-center"
								><IconArrowRight class="h-6 w-6" /></span
							>
							<div class="flex items-center gap-1.5">
								<img
									src="/images/chains/Bitcoin-Rootstock-logo.webp"
									alt={$t('wallet.pending_swaps.bitcoin_rbtc')}
									class="h-5 w-5 shrink-0"
								/>
								<span class="text-sm font-medium">{$t('wallet.pending_swaps.bitcoin_rbtc')}</span>
							</div>
						</div>

						<!-- Amount + badge -->
						<div class="flex items-center justify-between text-xs">
							<span class="text-base-content/60">
								{lockup.amountSats.toLocaleString()}
								{$t('wallet.pending_swaps.sats_unit')}
							</span>
							{#if recovery?.status === 'success'}
								<span class="badge badge-success badge-xs"
									>{$t('wallet.pending_swaps.recovered')}</span
								>
							{:else if lockup.resolved}
								<span class="badge badge-ghost badge-xs"
									>{$t('wallet.pending_swaps.already_resolved')}</span
								>
							{:else}
								<span class="badge {expired ? 'badge-success' : 'badge-warning'} badge-xs">
									{expired
										? $t('wallet.pending_swaps.refund_available')
										: $t('wallet.pending_swaps.timelock_remaining')}
								</span>
							{/if}
						</div>

						<!-- Status message (idle) or recovery result -->
						{#if recovery?.status === 'success'}
							<div class="mt-1 text-xs">
								<p class="text-success font-medium">{$t('wallet.pending_swaps.refund_success')}</p>
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
								<p class="text-error font-medium">{$t('wallet.pending_swaps.refund_failed')}</p>
								<p class="text-error/70 mt-0.5">{recovery.error}</p>
							</div>
						{:else if lockup.resolved}
							<p class="text-base-content/40 mt-1 text-xs">
								{$t('wallet.pending_swaps.lockup_claimed_or_refunded')}
							</p>
						{:else}
							<p class="text-base-content/50 mt-1 text-xs">
								{expired
									? $t('wallet.pending_swaps.lockup_expired_msg')
									: $t('wallet.pending_swaps.lockup_pending_msg')}
							</p>
						{/if}

						<!-- Actions -->
						<div class="border-base-300 mt-2 flex items-center justify-end gap-2 border-t pt-2">
							{#if recovery?.status === 'success' || lockup.resolved}
								<button
									class="btn btn-ghost btn-xs min-h-[36px]"
									onclick={() => dismissLockup(lockup.txHash)}
								>
									{$t('wallet.pending_swaps.dismiss')}
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
									{$t('wallet.pending_swaps.refund')}
								</button>
							{/if}
						</div>
					</div>
				{/each}

				<!-- Scanning indicator -->
				{#if scanningLockups && unclaimedLockups.length === 0}
					<div class="text-base-content/40 flex items-center justify-center gap-2 py-2 text-xs">
						<span class="loading loading-spinner loading-xs"></span>
						{$t('wallet.pending_swaps.scanning')}
					</div>
				{/if}

				<!-- Reverse swap cards -->
				{#each pendingSwaps as swap (swap.swapId)}
					{@const si = getReverseSwapStatusInfo(swap.status, $t)}
					<div class="bg-base-200 border-base-300 rounded-lg border p-3">
						<!-- Route: source left, destination right -->
						<div class="mb-2 flex items-center gap-2">
							<div class="flex items-center gap-1.5">
								<img
									src="/images/chains/Bitcoin.svg"
									alt={$t('wallet.pending_swaps.lightning')}
									class="h-5 w-5 shrink-0"
								/>
								<span class="text-sm font-medium">{$t('wallet.pending_swaps.lightning')}</span>
							</div>
							<span class="text-primary flex flex-1 items-center justify-center"
								><IconArrowRight class="h-6 w-6" /></span
							>
							<div class="flex items-center gap-1.5">
								<img
									src="/images/chains/Bitcoin-Rootstock-logo.webp"
									alt={$t('wallet.pending_swaps.bitcoin_rbtc')}
									class="h-5 w-5 shrink-0"
								/>
								<span class="text-sm font-medium">{$t('wallet.pending_swaps.bitcoin_rbtc')}</span>
							</div>
						</div>

						<!-- Amount + badge -->
						<div class="flex items-center justify-between text-xs">
							<span class="text-base-content/60">
								{fmtSats(swap.expectedAmount, $t)}
								{#if swap.connectedWalletName}
									· {swap.connectedWalletName}
								{/if}
							</span>
							<span class="badge badge-sm {si.color}">{si.label}</span>
						</div>

						<!-- Swap ID + timestamp -->
						{#if swap.claimTxHash}
							<div class="mt-0.5 flex items-center justify-between text-xs">
								<span class="text-base-content/50 font-mono break-all">
									{$t('wallet.pending_swaps.swap_id')}: {swap.claimTxHash}
								</span>
								<button
									type="button"
									class="btn btn-ghost btn-xs text-base-content/40 hover:text-base-content/70 min-h-[28px] min-w-[28px] p-0"
									onclick={() => copySwapId(swap.claimTxHash!)}
									aria-label={$t('wallet.pending_swaps.copy_swap_id')}
								>
									{#if copiedId === swap.claimTxHash}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="text-success h-3.5 w-3.5"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											><path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M5 13l4 4L19 7"
											/></svg
										>
									{:else}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-3.5 w-3.5"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											><path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
											/></svg
										>
									{/if}
								</button>
								<span class="text-base-content/40 ml-1 shrink-0">
									{fmtTime(swap.createdAt, $t)}
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
							{:else if !(swap as { status?: string }).status}
								<!-- Corrupted state recovery (H14) — no status set -->
								<div class="bg-warning/10 border-warning/30 w-full rounded-md border p-2 text-xs">
									<p class="text-warning font-medium">
										{$t('wallet.pending_swaps.state_unknown')}
									</p>
								</div>
							{/if}

							{#if swap.status === 'expired' || swap.status === 'failed' || !(swap as { status?: string }).status}
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
