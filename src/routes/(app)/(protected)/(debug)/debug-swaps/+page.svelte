<script lang="ts">
	import { onMount } from 'svelte';
	import { createDebug } from '$lib/utils/debug';
	import { boltzProvider } from '$lib/services/BoltzProvider';
	import {
		scanUnclaimedLockups,
		refundLockupDirect,
		loadClaimDataFromNostr,
		type UnclaimedLockup
	} from '$lib/services/swap-chain.service';
	import { claimTbtcOnArbitrum, claimRbtcOnRsk } from '$lib/services/swap-chain/boltz/claims';
	import { TBTC_ARB } from '$lib/services/swap-chain/utils';
	import { recoverSwapsFromNostr, type PendingSwapData, type SwapType } from '$lib/utils/swapAdapter';
	import { getNostrKeyPair } from '$lib/utils/nostrKeys';
	import { getRSKAddress, walletManager } from '$lib/stores/wallet.store';

	const d = createDebug('debug-swaps');

	// ── Tab state ─────────────────────────────────────────────────────
	let activeTab = $state<'scan' | 'check' | 'nostr' | 'manual'>('scan');

	// ── Wallet state ──────────────────────────────────────────────────
	let rskAddress = $state('');
	let walletReady = $state(false);
	let initError = $state('');

	// ── Scanner state ─────────────────────────────────────────────────
	let lockups = $state<UnclaimedLockup[]>([]);
	let scanning = $state(false);
	let scanError = $state('');
	let refundingTxHash = $state<string | null>(null);
	let refundResults = $state<Record<string, { ok: boolean; msg: string }>>({});

	// ── Checker state ─────────────────────────────────────────────────
	let checkSwapId = $state('');
	let checking = $state(false);
	let swapStatus = $state<{
		status: string;
		transactionId?: string;
		claimDetails?: {
			lockupAddress: string;
			amount: number;
			refundAddress: string;
			timeoutBlockHeight: number;
		};
		lockupDetails?: {
			claimAddress: string;
			amount: number;
		};
	} | null>(null);
	let checkError = $state('');
	let claimDataFromNostr = $state<{
		preimageHex: string;
		claimDetails: {
			lockupAddress: string;
			amount: number;
			refundAddress: string;
			timeoutBlockHeight: number;
		};
		lockupClaimAddress: string;
	} | null>(null);

	// ── Claim state ───────────────────────────────────────────────────
	let claiming = $state(false);
	let claimResult = $state<{ ok: boolean; msg: string } | null>(null);

	// ── Nostr recovery state ──────────────────────────────────────────
	let nostrSwaps = $state<PendingSwapData[]>([]);
	let recoveringNostr = $state(false);
	let nostrError = $state('');

	// ── Manual recovery state ─────────────────────────────────────────
	let manualSwapId = $state('');
	let manualPreimage = $state('');
	let manualContractAddress = $state('');
	let manualAmount = $state('');
	let manualClaimAddress = $state('');
	let manualRefundAddress = $state('');
	let manualTimelock = $state('');
	let manualChain = $state<'arbitrum' | 'rsk'>('arbitrum');
	let manualClaiming = $state(false);
	let manualClaimResult = $state<{ ok: boolean; msg: string } | null>(null);

	// ── Activity log ──────────────────────────────────────────────────
	interface LogEntry {
		time: string;
		level: 'info' | 'success' | 'error' | 'warn';
		msg: string;
	}
	let logs = $state<LogEntry[]>([]);

	function log(level: LogEntry['level'], msg: string) {
		const time = new Date().toLocaleTimeString();
		logs = [{ time, level, msg }, ...logs].slice(0, 200);
		if (level === 'error') d.error(msg);
		else d.log('[%s] %s', level, msg);
	}

	// ── Init ──────────────────────────────────────────────────────────
	onMount(async () => {
		try {
			await walletManager.initialize();
			rskAddress = await getRSKAddress();
			walletReady = true;
			log('success', `Wallet ready — RSK: ${rskAddress}`);
		} catch (err) {
			initError = (err as Error).message;
			log('error', `Wallet init failed: ${initError}`);
		}
	});

	// ── Scan RSK for unclaimed lockups ────────────────────────────────
	async function handleScan() {
		scanning = true;
		scanError = '';
		lockups = [];
		refundResults = {};
		log('info', 'Scanning RSK blockchain for Boltz lockups...');

		try {
			const { data, error } = await scanUnclaimedLockups();
			if (error) {
				scanError = error.message;
				log('error', `Scan failed: ${error.message}`);
				return;
			}
			lockups = data;
			log('success', `Found ${data.length} lockup(s) for ${rskAddress}`);

			for (const l of data) {
				const status = l.resolved
					? 'RESOLVED'
					: l.expired
						? 'EXPIRED (refundable)'
						: `active (timelock block ${l.timeoutBlockHeight})`;
				log(
					'info',
					`  → ${l.amountSats} sats | ${status} | tx: ${l.txHash.slice(0, 16)}...`
				);
			}
		} catch (err) {
			scanError = (err as Error).message;
			log('error', `Scan error: ${scanError}`);
		} finally {
			scanning = false;
		}
	}

	// ── Refund a specific lockup ──────────────────────────────────────
	async function handleRefund(lockup: UnclaimedLockup) {
		refundingTxHash = lockup.txHash;
		refundResults[lockup.txHash] = { ok: false, msg: 'Refunding...' };
		log('info', `Refunding lockup ${lockup.txHash.slice(0, 16)}... (${lockup.amountSats} sats)`);

		try {
			const { txHash, error } = await refundLockupDirect(lockup);
			if (error) {
				refundResults[lockup.txHash] = { ok: false, msg: error.message };
				log('error', `Refund failed: ${error.message}`);
			} else {
				refundResults[lockup.txHash] = { ok: true, msg: `TX: ${txHash}` };
				log('success', `Refund sent! TX: ${txHash}`);
				log('info', `View: https://rootstock.blockscout.com/tx/${txHash}`);
			}
		} catch (err) {
			refundResults[lockup.txHash] = { ok: false, msg: (err as Error).message };
			log('error', `Refund error: ${(err as Error).message}`);
		} finally {
			refundingTxHash = null;
		}
	}

	// ── Check swap status on Boltz ────────────────────────────────────
	async function handleCheckSwap() {
		if (!checkSwapId.trim()) return;
		checking = true;
		checkError = '';
		swapStatus = null;
		claimDataFromNostr = null;
		claimResult = null;

		const id = checkSwapId.trim();
		log('info', `Checking Boltz swap: ${id}`);

		try {
			const status = await boltzProvider.getSwapStatus(id);
			swapStatus = status;
			log('success', `Status: ${status.status}`);
			if (status.transactionId) log('info', `  TX: ${status.transactionId}`);
			if (status.claimDetails) {
				log('info', `  Claim lockup: ${status.claimDetails.lockupAddress}`);
				log('info', `  Amount: ${status.claimDetails.amount}`);
				log('info', `  Timeout block: ${status.claimDetails.timeoutBlockHeight}`);
				log('info', `  Refund addr: ${status.claimDetails.refundAddress}`);
			}
			if (status.lockupDetails) {
				log('info', `  Lockup claim addr: ${status.lockupDetails.claimAddress}`);
				log('info', `  Lockup amount: ${status.lockupDetails.amount}`);
			}

			// Try to recover claim data from Nostr
			log('info', 'Searching Nostr for claim data...');
			const cd = await loadClaimDataFromNostr(id);
			if (cd) {
				claimDataFromNostr = cd;
				log('success', `Preimage recovered from Nostr: ${cd.preimageHex.slice(0, 16)}...`);
			} else {
				log('warn', 'No claim data found in Nostr — preimage may be lost');
			}
		} catch (err) {
			checkError = (err as Error).message;
			log('error', `Check failed: ${checkError}`);
		} finally {
			checking = false;
		}
	}

	// ── Claim tBTC on Arbitrum (for RBTC→TBTC direction) ─────────────
	async function handleClaimTbtc() {
		if (!swapStatus?.claimDetails || !claimDataFromNostr) return;
		claiming = true;
		claimResult = null;

		const cd = claimDataFromNostr;
		const details = swapStatus.claimDetails;

		log('info', 'Claiming tBTC on Arbitrum...');
		log('info', `  Contract: ${details.lockupAddress}`);
		log('info', `  Amount: ${details.amount}`);
		log('info', `  Preimage: ${cd.preimageHex.slice(0, 16)}...`);

		try {
			const err = await claimTbtcOnArbitrum({
				contractAddress: details.lockupAddress,
				preimageHex: cd.preimageHex,
				amount: details.amount,
				tokenAddress: TBTC_ARB,
				claimAddress: cd.lockupClaimAddress || rskAddress,
				refundAddress: details.refundAddress,
				timelock: details.timeoutBlockHeight,
				sourceConnectedWalletId: null
			});

			if (err) {
				claimResult = { ok: false, msg: err.message };
				log('error', `Claim failed: ${err.message}`);
			} else {
				claimResult = { ok: true, msg: 'tBTC claimed successfully on Arbitrum!' };
				log('success', 'tBTC claimed on Arbitrum — check your Arbitrum balance');
			}
		} catch (err) {
			claimResult = { ok: false, msg: (err as Error).message };
			log('error', `Claim error: ${(err as Error).message}`);
		} finally {
			claiming = false;
		}
	}

	// ── Claim rBTC on RSK (for TBTC→RBTC direction) ──────────────────
	async function handleClaimRbtc() {
		if (!swapStatus?.claimDetails || !claimDataFromNostr) return;
		claiming = true;
		claimResult = null;

		const cd = claimDataFromNostr;
		const details = swapStatus.claimDetails;

		log('info', 'Claiming rBTC on RSK...');

		try {
			const err = await claimRbtcOnRsk({
				preimageHex: cd.preimageHex,
				amount: details.amount,
				claimAddress: cd.lockupClaimAddress || rskAddress,
				refundAddress: details.refundAddress,
				timelock: details.timeoutBlockHeight,
				sourceConnectedWalletId: null
			});

			if (err) {
				claimResult = { ok: false, msg: err.message };
				log('error', `Claim failed: ${err.message}`);
			} else {
				claimResult = { ok: true, msg: 'rBTC claimed successfully on RSK!' };
				log('success', 'rBTC claimed on RSK — check your RSK balance');
			}
		} catch (err) {
			claimResult = { ok: false, msg: (err as Error).message };
			log('error', `Claim error: ${(err as Error).message}`);
		} finally {
			claiming = false;
		}
	}

	// ── Recover all swaps from Nostr ──────────────────────────────────
	async function handleNostrRecovery() {
		recoveringNostr = true;
		nostrError = '';
		nostrSwaps = [];
		log('info', 'Recovering swap data from Nostr (all types, including final)...');

		try {
			const { nsec } = await getNostrKeyPair();
			const swapTypes: SwapType[] = [
				'boltz-swap-chain',
				'bittasker-swap-chain',
				'boltz-swap-reverse',
				'boltz-swap-submarine'
			];

			let allSwaps: PendingSwapData[] = [];
			for (const swapType of swapTypes) {
				log('info', `  Fetching ${swapType}...`);
				const swaps = await recoverSwapsFromNostr(nsec, swapType, true);
				allSwaps = [...allSwaps, ...swaps];
				log('info', `    → ${swaps.length} found`);
			}

			nostrSwaps = allSwaps;
			log('success', `Recovered ${allSwaps.length} total swap(s) from Nostr`);

			for (const swap of allSwaps) {
				const s = swap as unknown as Record<string, unknown>;
				const id = (s.id as string) ?? 'unknown';
				const status = (s.status as string) ?? '?';
				const hasPreimage = !!(s.preimage as string);
				log(
					'info',
					`  → ${id.slice(0, 16)}... | status: ${status} | preimage: ${hasPreimage ? 'YES' : 'NO'}`
				);
			}
		} catch (err) {
			nostrError = (err as Error).message;
			log('error', `Nostr recovery failed: ${nostrError}`);
		} finally {
			recoveringNostr = false;
		}
	}

	// ── Use a Nostr swap in the checker ───────────────────────────────
	function useSwapInChecker(swap: PendingSwapData) {
		const s = swap as unknown as Record<string, unknown>;
		checkSwapId = (s.id as string) ?? '';
		if (s.preimage) {
			log('info', `Loaded preimage for swap ${(s.id as string).slice(0, 16)}...`);
		}
		activeTab = 'check';
		handleCheckSwap();
	}

	// ── Manual claim ──────────────────────────────────────────────────
	async function handleManualClaim() {
		if (!manualPreimage || !manualContractAddress || !manualAmount || !manualTimelock) {
			manualClaimResult = { ok: false, msg: 'All fields are required' };
			return;
		}

		manualClaiming = true;
		manualClaimResult = null;

		// Normalize preimage — ensure 0x prefix
		const preimage = manualPreimage.startsWith('0x')
			? manualPreimage
			: '0x' + manualPreimage;

		log('info', `Manual claim on ${manualChain}...`);
		log('info', `  Contract: ${manualContractAddress}`);
		log('info', `  Amount: ${manualAmount}`);
		log('info', `  Preimage: ${preimage.slice(0, 18)}...`);

		try {
			let err: Error | null = null;

			if (manualChain === 'arbitrum') {
				err = await claimTbtcOnArbitrum({
					contractAddress: manualContractAddress,
					preimageHex: preimage.startsWith('0x') ? preimage.slice(2) : preimage,
					amount: parseInt(manualAmount, 10),
					tokenAddress: TBTC_ARB,
					claimAddress: manualClaimAddress || rskAddress,
					refundAddress: manualRefundAddress || rskAddress,
					timelock: parseInt(manualTimelock, 10),
					sourceConnectedWalletId: null
				});
			} else {
				err = await claimRbtcOnRsk({
					preimageHex: preimage.startsWith('0x') ? preimage.slice(2) : preimage,
					amount: parseInt(manualAmount, 10),
					claimAddress: manualClaimAddress || rskAddress,
					refundAddress: manualRefundAddress || rskAddress,
					timelock: parseInt(manualTimelock, 10),
					sourceConnectedWalletId: null
				});
			}

			if (err) {
				manualClaimResult = { ok: false, msg: err.message };
				log('error', `Manual claim failed: ${err.message}`);
			} else {
				manualClaimResult = { ok: true, msg: `Claimed on ${manualChain}!` };
				log('success', `Manual claim succeeded on ${manualChain}`);
			}
		} catch (err) {
			manualClaimResult = { ok: false, msg: (err as Error).message };
			log('error', `Manual claim error: ${(err as Error).message}`);
		} finally {
			manualClaiming = false;
		}
	}

	// ── Auto-fill from Nostr swap ─────────────────────────────────────
	function fillManualFromNostr(swap: PendingSwapData) {
		const s = swap as unknown as Record<string, unknown>;
		manualSwapId = (s.id as string) ?? '';
		manualPreimage = (s.preimage as string) ?? '';

		if (s.claimDetails) {
			const cd = s.claimDetails as Record<string, unknown>;
			manualContractAddress = (cd.lockupAddress as string) ?? '';
			manualAmount = String(cd.amount ?? '');
			manualTimelock = String(cd.timeoutBlockHeight ?? '');
			manualRefundAddress = (cd.refundAddress as string) ?? '';
		}
		if (s.lockupClaimAddress) {
			manualClaimAddress = s.lockupClaimAddress as string;
		}

		log('info', `Filled manual form from Nostr swap ${(s.id as string)?.slice(0, 16)}...`);
		activeTab = 'manual';
	}

	// ── Helpers ───────────────────────────────────────────────────────
	function fmtTime(ts: number | undefined): string {
		if (!ts) return '—';
		return new Date(ts * 1000).toLocaleString();
	}

	function clearLog() {
		logs = [];
	}
</script>

<svelte:head>
	<title>Swap Recovery — BitTasker Debug</title>
</svelte:head>

<div class="container mx-auto max-w-4xl px-3 py-4 sm:px-4 sm:py-6">
	<!-- Header -->
	<div class="mb-4">
		<h1 class="text-2xl font-bold">Swap Recovery Tool</h1>
		<p class="text-sm opacity-60">
			Recover locked funds from failed Boltz swaps. Scan RSK for unclaimed lockups, check swap
			status, recover preimages from Nostr, and execute claims/refunds.
		</p>
	</div>

	<!-- Wallet status -->
	{#if initError}
		<div class="alert alert-error mb-4">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<span>Wallet init failed: {initError}</span>
		</div>
	{:else if !walletReady}
		<div class="alert alert-info mb-4">
			<span class="loading loading-spinner loading-sm"></span>
			<span>Initializing wallet...</span>
		</div>
	{:else}
		<div class="alert alert-outline alert-success mb-4 py-2">
			<span class="text-xs font-mono">RSK: {rskAddress}</span>
		</div>
	{/if}

	<!-- Tabs -->
	<div role="tablist" class="tabs tabs-border mb-4">
		<button
			role="tab"
			class="tab"
			class:tab-active={activeTab === 'scan'}
			onclick={() => (activeTab = 'scan')}
		>
			RSK Scanner
		</button>
		<button
			role="tab"
			class="tab"
			class:tab-active={activeTab === 'check'}
			onclick={() => (activeTab = 'check')}
		>
			Boltz Checker
		</button>
		<button
			role="tab"
			class="tab"
			class:tab-active={activeTab === 'nostr'}
			onclick={() => (activeTab = 'nostr')}
		>
			Nostr Recovery
		</button>
		<button
			role="tab"
			class="tab"
			class:tab-active={activeTab === 'manual'}
			onclick={() => (activeTab = 'manual')}
		>
			Manual Claim
		</button>
	</div>

	<!-- Tab: RSK Scanner -->
	{#if activeTab === 'scan'}
		<div class="card bg-base-200 mb-4">
			<div class="card-body p-4">
				<h2 class="card-title text-lg">Scan RSK for Boltz Lockups</h2>
				<p class="text-sm opacity-70">
					Queries the Rootstock blockchain for all EtherSwap Lockup events belonging to your
					address. Shows unclaimed lockups that can be refunded if the timelock has expired.
				</p>

				<button
					class="btn btn-primary btn-sm mt-2"
					disabled={scanning || !walletReady}
					onclick={handleScan}
				>
					{#if scanning}
						<span class="loading loading-spinner loading-xs"></span>
						Scanning...
					{:else}
						Scan RSK Blockchain
					{/if}
				</button>

				{#if scanError}
					<div class="alert alert-error mt-3 py-2 text-sm">{scanError}</div>
				{/if}

				{#if lockups.length > 0}
					<div class="divider">Found {lockups.length} Lockup(s)</div>
					<div class="space-y-3">
						{#each lockups as lockup (lockup.txHash)}
							<div
								class="card bg-base-100 border-base-300 border"
								class:border-success={refundResults[lockup.txHash]?.ok}
								class:border-error={refundResults[lockup.txHash] && !refundResults[lockup.txHash].ok}
							>
								<div class="card-body p-3">
									<div class="flex items-center justify-between">
										<div>
											<span class="text-lg font-bold">{lockup.amountSats.toLocaleString()} sats</span>
											{#if lockup.resolved}
												<span class="badge badge-ghost badge-sm ml-2">Resolved</span>
											{:else if lockup.expired}
												<span class="badge badge-success badge-sm ml-2">Expired — Refundable</span>
											{:else}
												<span class="badge badge-warning badge-sm ml-2">Timelock Active</span>
											{/if}
										</div>
										{#if !lockup.resolved && lockup.expired}
											<button
												class="btn btn-success btn-sm"
												disabled={refundingTxHash === lockup.txHash}
												onclick={() => handleRefund(lockup)}
											>
												{#if refundingTxHash === lockup.txHash}
													<span class="loading loading-spinner loading-xs"></span>
												{/if}
												Refund
											</button>
										{/if}
									</div>

									<div class="mt-1 space-y-0.5 text-xs opacity-70">
										<div class="font-mono">TX: {lockup.txHash}</div>
										<div>Block: {lockup.blockNumber} | Timelock: {lockup.timeoutBlockHeight} | Current: {lockup.currentBlock}</div>
										<div>PreimageHash: {lockup.preimageHash.slice(0, 20)}...</div>
										<div>Claim addr: {lockup.claimAddress}</div>
									</div>

									{#if refundResults[lockup.txHash]}
										<div
											class="mt-2 rounded p-2 text-xs {refundResults[lockup.txHash].ok ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}"
										>
											{refundResults[lockup.txHash].msg}
										</div>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{:else if !scanning && !scanError && lockups.length === 0 && walletReady}
					<p class="mt-3 text-sm opacity-50">No lockups scanned yet. Click "Scan RSK Blockchain" to begin.</p>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Tab: Boltz Checker -->
	{#if activeTab === 'check'}
		<div class="card bg-base-200 mb-4">
			<div class="card-body p-4">
				<h2 class="card-title text-lg">Check Boltz Swap Status</h2>
				<p class="text-sm opacity-70">
					Enter a Boltz swap ID to check its current status. Automatically recovers claim data
					(preimage) from Nostr if available.
				</p>

				<div class="join mt-2 w-full">
					<input
						type="text"
						class="input input-bordered join-item flex-1 font-mono text-sm"
						placeholder="Boltz swap ID"
						bind:value={checkSwapId}
						onkeydown={(e) => e.key === 'Enter' && handleCheckSwap()}
					/>
					<button
						class="btn btn-primary join-item"
						disabled={checking || !checkSwapId.trim()}
						onclick={handleCheckSwap}
					>
						{#if checking}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
							Check
						{/if}
					</button>
				</div>

				{#if checkError}
					<div class="alert alert-error mt-3 py-2 text-sm">{checkError}</div>
				{/if}

				{#if swapStatus}
					<div class="divider">Swap Status</div>
					<div class="bg-base-100 rounded-lg p-3">
						<div class="mb-2 flex items-center gap-2">
							<span
								class="badge badge-sm"
								class:badge-success={swapStatus.status === 'transaction.claimed' || swapStatus.status === 'invoice.settled'}
								class:badge-error={swapStatus.status === 'swap.expired' || swapStatus.status === 'transaction.failed'}
								class:badge-warning={swapStatus.status.includes('pending') || swapStatus.status.includes('mempool')}
								class:badge-info={swapStatus.status === 'transaction.server.confirmed' || swapStatus.status === 'transaction.confirmed'}
							>
								{swapStatus.status}
							</span>
							{#if swapStatus.transactionId}
								<span class="font-mono text-xs opacity-60">TX: {swapStatus.transactionId}</span>
							{/if}
						</div>

						{#if swapStatus.claimDetails}
							<div class="mt-2 text-xs">
								<h4 class="font-bold">Claim Details (Boltz locked on destination chain)</h4>
								<div class="mt-1 space-y-0.5 font-mono opacity-70">
									<div>Lockup address: {swapStatus.claimDetails.lockupAddress}</div>
									<div>Amount: {swapStatus.claimDetails.amount}</div>
									<div>Timeout block: {swapStatus.claimDetails.timeoutBlockHeight}</div>
									<div>Refund address: {swapStatus.claimDetails.refundAddress}</div>
								</div>
							</div>
						{/if}

						{#if swapStatus.lockupDetails}
							<div class="mt-2 text-xs">
								<h4 class="font-bold">Lockup Details (user locked on source chain)</h4>
								<div class="mt-1 space-y-0.5 font-mono opacity-70">
									<div>Claim address: {swapStatus.lockupDetails.claimAddress}</div>
									<div>Amount: {swapStatus.lockupDetails.amount}</div>
								</div>
							</div>
						{/if}
					</div>
				{/if}

				{#if claimDataFromNostr}
					<div class="divider">Preimage (from Nostr)</div>
					<div class="bg-success/10 border-success/30 rounded-lg border p-3">
						<div class="text-sm font-bold text-success">Preimage recovered!</div>
						<div class="mt-1 font-mono text-xs break-all opacity-70">
							{claimDataFromNostr.preimageHex}
						</div>
						{#if claimDataFromNostr.lockupClaimAddress}
							<div class="mt-1 text-xs">
								Claim destination: {claimDataFromNostr.lockupClaimAddress}
							</div>
						{/if}

						{#if swapStatus?.claimDetails}
							<div class="mt-3 flex flex-wrap gap-2">
								<button
									class="btn btn-success btn-sm"
									disabled={claiming}
									onclick={handleClaimTbtc}
								>
									{#if claiming}
										<span class="loading loading-spinner loading-xs"></span>
									{/if}
									Claim tBTC on Arbitrum
								</button>
								<button
									class="btn btn-info btn-sm"
									disabled={claiming}
									onclick={handleClaimRbtc}
								>
									{#if claiming}
										<span class="loading loading-spinner loading-xs"></span>
									{/if}
									Claim rBTC on RSK
								</button>
							</div>
						{/if}
					</div>
				{:else if swapStatus && !claimDataFromNostr && !checking}
					<div class="alert alert-warning mt-3 py-2 text-sm">
						No preimage found in Nostr. Check "Nostr Recovery" tab or use "Manual Claim" with a
						known preimage.
					</div>
				{/if}

				{#if claimResult}
					<div
						class="mt-3 rounded-lg p-3 text-sm {claimResult.ok ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}"
					>
						{claimResult.msg}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Tab: Nostr Recovery -->
	{#if activeTab === 'nostr'}
		<div class="card bg-base-200 mb-4">
			<div class="card-body p-4">
				<h2 class="card-title text-lg">Recover Swaps from Nostr</h2>
				<p class="text-sm opacity-70">
					Fetches all swap events (kind 30078) from Nostr relays, including completed and expired
					swaps. Decrypts NIP-44 content to recover preimages, claim details, and swap metadata.
				</p>

				<button
					class="btn btn-primary btn-sm mt-2"
					disabled={recoveringNostr || !walletReady}
					onclick={handleNostrRecovery}
				>
					{#if recoveringNostr}
						<span class="loading loading-spinner loading-xs"></span>
						Recovering...
					{:else}
						Recover All Swaps from Nostr
					{/if}
				</button>

				{#if nostrError}
					<div class="alert alert-error mt-3 py-2 text-sm">{nostrError}</div>
				{/if}

				{#if nostrSwaps.length > 0}
					<div class="divider">Found {nostrSwaps.length} Swap(s)</div>
					<div class="space-y-2">
						{#each nostrSwaps as swap ((swap as unknown as Record<string, unknown>).id ?? Math.random())}
							{@const s = swap as unknown as Record<string, unknown>}
							<div class="bg-base-100 border-base-300 rounded-lg border p-3">
								<div class="flex items-center justify-between">
									<div>
										<span class="font-mono text-sm">{String(s.id ?? 'unknown').slice(0, 20)}...</span>
										<span
											class="badge badge-sm ml-2"
											class:badge-success={s.status === 'transaction.claimed'}
											class:badge-error={s.status === 'swap.expired'}
											class:badge-info={s.status === 'transaction.server.confirmed'}
											class:badge-warning={true}
										>
											{String(s.status ?? '?')}
										</span>
										{#if s.preimage}
											<span class="badge badge-success badge-xs ml-1">has preimage</span>
										{/if}
									</div>
									<div class="flex gap-1">
										{#if s.preimage}
											<button
												class="btn btn-outline btn-xs"
												onclick={() => fillManualFromNostr(swap)}
											>
												Use in Manual Claim
											</button>
										{/if}
										<button
											class="btn btn-outline btn-xs"
											onclick={() => useSwapInChecker(swap)}
										>
											Check Status
										</button>
									</div>
								</div>

								<div class="mt-1 space-y-0.5 text-xs opacity-60">
									{#if s.type}
										<div>Type: {String(s.type)}</div>
									{/if}
									{#if s.createdAt}
										<div>Created: {fmtTime(s.createdAt as number)}</div>
									{/if}
									{#if s.preimage}
										<div class="font-mono">Preimage: {String(s.preimage).slice(0, 32)}...</div>
									{/if}
									{#if s.claimDetails}
										{@const cd = s.claimDetails as Record<string, unknown>}
										<div>Claim contract: {String(cd.lockupAddress ?? '').slice(0, 20)}...</div>
										<div>Amount: {String(cd.amount ?? '?')} | Timeout: {String(cd.timeoutBlockHeight ?? '?')}</div>
									{/if}
									{#if s.lockupClaimAddress}
										<div>Claim to: {String(s.lockupClaimAddress).slice(0, 20)}...</div>
									{/if}
									{#if s.fromAmount}
										<div>From: {String(s.fromAmount)} {String(s.fromAsset ?? '')} → {String(s.toAsset ?? '')}</div>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{:else if !recoveringNostr && !nostrError && nostrSwaps.length === 0 && walletReady}
					<p class="mt-3 text-sm opacity-50">
						Click "Recover All Swaps from Nostr" to fetch swap data from relays.
					</p>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Tab: Manual Claim -->
	{#if activeTab === 'manual'}
		<div class="card bg-base-200 mb-4">
			<div class="card-body p-4">
				<h2 class="card-title text-lg">Manual Claim</h2>
				<p class="text-sm opacity-70">
					Execute a claim directly with known swap parameters. Use this when you have the preimage
					from Nostr recovery or from the swap creation flow. Fill from a Nostr swap using the
					Nostr Recovery tab.
				</p>

				<div class="mt-3 grid gap-3 sm:grid-cols-2">
					<label class="form-control">
						<span class="label-text text-xs">Swap ID (optional)</span>
						<input
							type="text"
							class="input input-bordered input-sm font-mono"
							placeholder="Boltz swap ID"
							bind:value={manualSwapId}
						/>
					</label>

					<label class="form-control">
						<span class="label-text text-xs">Claim Chain</span>
						<select class="select select-bordered select-sm" bind:value={manualChain}>
							<option value="arbitrum">Arbitrum (claim tBTC)</option>
							<option value="rsk">RSK (claim rBTC)</option>
						</select>
					</label>

					<label class="form-control sm:col-span-2">
						<span class="label-text text-xs">Preimage (hex, with or without 0x)</span>
						<input
							type="text"
							class="input input-bordered input-sm font-mono"
							placeholder="0x..."
							bind:value={manualPreimage}
						/>
					</label>

					<label class="form-control sm:col-span-2">
						<span class="label-text text-xs">Contract Address (Boltz lockup contract on destination chain)</span>
						<input
							type="text"
							class="input input-bordered input-sm font-mono"
							placeholder="0x..."
							bind:value={manualContractAddress}
						/>
					</label>

					<label class="form-control">
						<span class="label-text text-xs">Amount</span>
						<input
							type="text"
							class="input input-bordered input-sm font-mono"
							placeholder="Amount in smallest unit"
							bind:value={manualAmount}
						/>
					</label>

					<label class="form-control">
						<span class="label-text text-xs">Timelock (block height)</span>
						<input
							type="text"
							class="input input-bordered input-sm font-mono"
							placeholder="Block height"
							bind:value={manualTimelock}
						/>
					</label>

					<label class="form-control">
						<span class="label-text text-xs">Claim Address (where to receive funds)</span>
						<input
							type="text"
							class="input input-bordered input-sm font-mono"
							placeholder="0x... (defaults to your RSK address)"
							bind:value={manualClaimAddress}
						/>
					</label>

					<label class="form-control">
						<span class="label-text text-xs">Refund Address</span>
						<input
							type="text"
							class="input input-bordered input-sm font-mono"
							placeholder="0x... (defaults to your RSK address)"
							bind:value={manualRefundAddress}
						/>
					</label>
				</div>

				<button
					class="btn btn-primary btn-sm mt-4"
					disabled={manualClaiming || !manualPreimage || !manualContractAddress || !manualAmount || !manualTimelock}
					onclick={handleManualClaim}
				>
					{#if manualClaiming}
						<span class="loading loading-spinner loading-xs"></span>
						Claiming...
					{:else}
						Execute Claim on {manualChain === 'arbitrum' ? 'Arbitrum' : 'RSK'}
					{/if}
				</button>

				{#if manualClaimResult}
					<div
						class="mt-3 rounded-lg p-3 text-sm {manualClaimResult.ok ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}"
					>
						{manualClaimResult.msg}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Activity Log -->
	<div class="card bg-base-200">
		<div class="card-body p-4">
			<div class="flex items-center justify-between">
				<h2 class="card-title text-sm">Activity Log ({logs.length})</h2>
				<button class="btn btn-ghost btn-xs" onclick={clearLog}>Clear</button>
			</div>
			<div
				class="bg-base-300 max-h-80 overflow-y-auto rounded-lg p-2 font-mono text-xs"
			>
				{#if logs.length === 0}
					<p class="p-2 opacity-40">No activity yet.</p>
				{:else}
					{#each logs as entry (entry.time + entry.msg)}
						<div
							class="border-base-content/5 border-b px-1 py-0.5"
							class:text-success={entry.level === 'success'}
							class:text-error={entry.level === 'error'}
							class:text-warning={entry.level === 'warn'}
							class:opacity-60={entry.level === 'info'}
						>
							<span class="opacity-40">{entry.time}</span>
							<span class="ml-1">[{entry.level}]</span>
							<span class="ml-1">{entry.msg}</span>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	</div>
</div>
