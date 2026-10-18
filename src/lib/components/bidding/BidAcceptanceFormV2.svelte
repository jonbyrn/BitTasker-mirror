<script lang="ts">
	import { t } from 'svelte-i18n';
	import { ContractRune } from '$lib/runes/contract.svelte';
	import {
		fetchFundingInvoice,
		isSatBid,
		lockBidAmount,
		resolveBidSats,
		sendBidStatusUpdate
	} from '$lib/utils/nostr-bid';
	import { formatInteger, formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { BidStatusEnum } from '$lib/utils/enums/bid.enum';
	import { appStore } from '$lib/stores/app.store';
	import { notificationCenterService } from '$lib/api/services/notificationCenter.service';
	import { onMount } from 'svelte';
	import { walletStore, state as walletState } from '$lib/stores/wallet/wallet-state';
	import { invoiceMatchesRail, satsRailBlocked } from '$lib/services/rgb/escrow-rail';
	import { walletManager } from '$lib/stores/wallet/wallet-manager';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { CONTRACT_PAYMENT_ASSETS, type PaymentSplitConfig } from '$lib/types/rgb-contract';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { initWasm } from '$lib/wasm/init-wasm';
	import type { NDKBid } from '$lib/nostr/events/bid';
	import type { NDKTask } from '$lib/nostr/events/task';
	import { assignTask } from '$lib/nostr/task';

	const BTC_ONLY_SPLIT: PaymentSplitConfig = {
		primaryAsset: 'btc_onchain',
		primaryPercentage: 100,
		secondaryAsset: 'btc_lightning',
		secondaryPercentage: 0
	};
	const USDT_SPLIT: PaymentSplitConfig = {
		primaryAsset: 'usdt_rgb',
		primaryPercentage: 100,
		secondaryAsset: 'btc_lightning',
		secondaryPercentage: 0
	};
	const LIGHTNING_SPLIT: PaymentSplitConfig = {
		primaryAsset: 'btc_lightning',
		primaryPercentage: 100,
		secondaryAsset: 'usdt_rgb',
		secondaryPercentage: 0
	};
	const LN_USDT_SPLIT: PaymentSplitConfig = {
		primaryAsset: 'usdt_ln',
		primaryPercentage: 100,
		secondaryAsset: 'btc_lightning',
		secondaryPercentage: 0
	};

	let {
		bid,
		task,
		onCancel = () => {},
		onFunded = (_contractId: string) => {}
	}: {
		bid: NDKBid;
		task: NDKTask;
		onCancel?: () => void;
		onFunded?: (contractId: string) => void;
	} = $props();

	const PLATFORM_FEE_RATE = 0.025; // 2.5% client fee (tier 1)
	const isE2ETest =
		(typeof window !== 'undefined' &&
			(window as { __PLAYWRIGHT_TEST__?: boolean }).__PLAYWRIGHT_TEST__ === true) ||
		import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true';

	const bidContent = $derived(bid.bidContent);
	const dollarBid = $derived(bidContent ? !isSatBid(bidContent.currency) : false);
	const lockedBid = $derived(
		bidContent ? lockBidAmount(bidContent.amount, bidContent.currency) : null
	);
	let fundRail = $state<'usdt_rgb' | 'btc_lightning' | 'usdt_ln'>('usdt_rgb');
	let nodeEmpty = $state(true);
	const lightningSats = $derived(
		dollarBid && lockedBid ? resolveBidSats(lockedBid.lockedAmount, 'USD', btcPrice.price) : null
	);
	const bidAmountSats = $derived(
		resolveBidSats(bidContent?.amount ?? 0, bidContent?.currency, btcPrice.price)
	);
	const platformFeeSats = $derived(
		bidAmountSats === null ? null : Math.max(1, Math.round(bidAmountSats * PLATFORM_FEE_RATE))
	);
	const totalSats = $derived(
		bidAmountSats === null || platformFeeSats === null ? null : bidAmountSats + platformFeeSats
	);
	const totalUsd = $derived(
		totalSats === null || btcPrice.price <= 0 ? null : (totalSats * btcPrice.price) / 100_000_000
	);

	const walletSats = $derived($walletStore.rgb?.balanceSats ?? 0);
	const walletConnected = $derived(
		$walletStore.isConnected && $walletStore.rgb?.initialized === true
	);
	const requiredSats = $derived(totalSats ?? 0);
	const hasInsufficientFunds = $derived(
		!dollarBid && !isE2ETest && walletConnected && totalSats !== null && walletSats < requiredSats
	);
	const contractTitle = $derived(
		bidContent?.taskTitle ||
			task.taskContent?.title ||
			$t('dashboard.bids.bid_acceptance.contract_information')
	);
	const bidderComments = $derived(
		bidContent?.proposedApproach || bidContent?.coverLetter || bidContent?.description || ''
	);

	const split = $derived(
		!dollarBid
			? BTC_ONLY_SPLIT
			: fundRail === 'btc_lightning'
				? LIGHTNING_SPLIT
				: fundRail === 'usdt_ln'
					? LN_USDT_SPLIT
					: USDT_SPLIT
	);
	const settlementUnit = $derived(CONTRACT_PAYMENT_ASSETS[split.primaryAsset]);

	let isProcessing = $state(false);
	let processingStep = $state<
		'idle' | 'funding' | 'paying' | 'verifying' | 'attesting' | 'notifying' | 'starting'
	>('idle');
	let errorMessage = $state('');
	let fundedRune = $state<ContractRune | null>(null);
	let fundedContractId = $state<string | null>(null);
	let escrowReady = $state(false);
	let awaitingTaskeeInvoice = $state(false);

	const lightningFundReady = $derived(
		fundRail !== 'btc_lightning' || (!nodeEmpty && totalSats !== null)
	);
	const canConfirm = $derived(
		walletConnected &&
			!hasInsufficientFunds &&
			!isProcessing &&
			bidContent !== null &&
			lockedBid !== null &&
			(dollarBid ? lightningFundReady : totalSats !== null && totalUsd !== null)
	);
	const fundingInvoice = $derived(fundedRune?.snapshot?.fundingInvoice ?? '');
	const payMatchesRail = $derived(
		fundingInvoice.length > 0 && invoiceMatchesRail(split.primaryAsset, fundingInvoice)
	);
	const awaitingFunding = $derived(Boolean(fundedRune && !escrowReady && fundingInvoice));
	const fundingStep = $derived(escrowReady ? 3 : awaitingFunding ? 2 : 1);

	async function notifyFunded(contractId: string, bidderPubkey: string): Promise<void> {
		processingStep = 'notifying';
		await publishContractStep({
			status: BidStatusEnum.ESCROW_FUNDED,
			action: 'contract_created',
			contractId,
			bidderPubkey,
			message: 'RGB escrow funded'
		});
		fundedContractId = contractId;
		escrowReady = true;
		if (isE2ETest && typeof window !== 'undefined') {
			(window as Window & { __lastFundedContractId?: string }).__lastFundedContractId = contractId;
		}
		appStore.showSuccessToast($t('dashboard.bids.bid_acceptance.success_subtitle'));
	}

	async function publishContractStep(params: {
		status: BidStatusEnum;
		action: string;
		contractId: string;
		bidderPubkey: string;
		message?: string;
		estimatedCompletionTime?: number;
	}): Promise<void> {
		if (!bidContent) return;
		await sendBidStatusUpdate(
			bid.id,
			bidContent.taskId || task.id,
			params.bidderPubkey,
			params.status,
			params.message,
			params.contractId
		);
		await notificationCenterService.enrich({
			action: params.action,
			escrowId: params.contractId,
			bidEventId: bid.id,
			taskId: bidContent.taskId || task.id,
			taskTitle: contractTitle,
			amount: String(dollarBid && lockedBid ? lockedBid.lockedAmount : requiredSats),
			...(params.estimatedCompletionTime
				? { estimatedCompletionTime: params.estimatedCompletionTime }
				: {})
		});
	}

	function contractInput(bidderPubkey: string) {
		const partyPubkeys = [bidderPubkey, task.pubkey].filter((key): key is string => Boolean(key));
		if (dollarBid && fundRail === 'btc_lightning') {
			return {
				contractId: `contract-${task.id}-${bid.id}`,
				contractTitle,
				bidderComments,
				totalAmountUsd: totalUsd ?? 0,
				amountSats: totalSats ?? undefined,
				lockedAmount: totalSats ?? 0,
				lockedCurrency: 'SATS' as const,
				split,
				partyPubkeys
			};
		}
		if (dollarBid && lockedBid?.lockedCurrency === 'USD') {
			return {
				contractId: `contract-${task.id}-${bid.id}`,
				contractTitle,
				bidderComments,
				totalAmountUsd: lockedBid.lockedAmount,
				lockedAmount: lockedBid.lockedAmount,
				lockedCurrency: lockedBid.lockedCurrency,
				split,
				partyPubkeys
			};
		}
		return {
			contractId: `contract-${task.id}-${bid.id}`,
			contractTitle,
			bidderComments,
			totalAmountUsd: totalUsd ?? 0,
			amountSats: totalSats ?? undefined,
			lockedAmount: lockedBid?.lockedAmount ?? totalSats ?? 0,
			lockedCurrency: 'SATS' as const,
			split,
			partyPubkeys
		};
	}

	function acceptedTaskKey(current: NDKTask): string {
		const readTag = current.tagValue;
		if (typeof readTag !== 'function') return current.id;
		return readTag.call(current, 'd') || current.id;
	}

	async function handleAcceptAndFund(): Promise<void> {
		if (!bidContent) {
			errorMessage = 'Bid content is unavailable';
			return;
		}
		const bidderPubkey = bidContent.bidderId;
		if (!bidderPubkey) {
			errorMessage = 'Bidder pubkey is unavailable';
			return;
		}

		isProcessing = true;
		errorMessage = '';

		try {
			const contractId = `contract-${task.id}-${bid.id}`;
			processingStep = 'funding';
			const rune = new ContractRune(contractInput(bidderPubkey));

			await initWasm();
			await walletManager.initialize();
			await rune.prepareFunding();

			processingStep = 'notifying';
			await publishContractStep({
				status: BidStatusEnum.ACCEPTED,
				action: 'bid_accepted',
				contractId,
				bidderPubkey,
				message: 'Bid accepted'
			});
			const taskKey = acceptedTaskKey(task);
			if (taskKey) {
				assignTask(taskKey).catch((error: unknown) => {
					console.warn('[accept-fund] task assign failed', error);
				});
			}

			fundedRune = rune;
			fundedContractId = contractId;
			if (isE2ETest && typeof window !== 'undefined') {
				(window as Window & { __lastFundedContractId?: string }).__lastFundedContractId =
					contractId;
			}
			if (rune.status === 'funded') {
				await notifyFunded(contractId, bidderPubkey);
			}
		} catch (error) {
			if (error instanceof Error && error.name === 'TaskeeInvoiceRequired') {
				const contractId = `contract-${task.id}-${bid.id}`;
				await publishContractStep({
					status: BidStatusEnum.ACCEPTED,
					action: 'bid_accepted',
					contractId,
					bidderPubkey,
					message: 'Bid accepted'
				});
				const taskKey = acceptedTaskKey(task);
				if (taskKey) {
					assignTask(taskKey).catch((error: unknown) => {
						console.warn('[accept-fund] task assign failed', error);
					});
				}
				awaitingTaskeeInvoice = true;
				errorMessage = '';
				return;
			}
			if (isE2ETest) {
				console.error('[accept-fund] failed', error);
			}
			fundedRune = null;
			fundedContractId = null;
			escrowReady = false;
			errorMessage = error instanceof Error ? error.message : 'Escrow funding failed';
			appStore.showErrorToast($t('dashboard.bids.bid_acceptance.funding_confirm_failed'));
		} finally {
			await walletManager.releaseRgbLock();
			isProcessing = false;
			processingStep = 'idle';
		}
	}

	async function loadPostedInvoice(quiet = false): Promise<void> {
		if (!bidContent?.bidderId) return;
		if (!quiet) {
			isProcessing = true;
			errorMessage = '';
			processingStep = 'funding';
		}
		try {
			const invoice = await fetchFundingInvoice(bidContent.taskId || task.id, bid.id);
			if (!invoice) {
				if (!quiet) errorMessage = $t('dashboard.bids.bid_acceptance.invoice_missing');
				return;
			}
			const rune = new ContractRune(contractInput(bidContent.bidderId));
			await initWasm();
			await walletManager.initialize();
			await rune.prepareFunding(invoice);
			fundedRune = rune;
			fundedContractId = rune.snapshot.contractId;
			awaitingTaskeeInvoice = false;
		} catch (error) {
			if (quiet) return;
			errorMessage = error instanceof Error ? error.message : 'Escrow funding failed';
			appStore.showErrorToast($t('dashboard.bids.bid_acceptance.funding_confirm_failed'));
		} finally {
			await walletManager.releaseRgbLock();
			if (!quiet) {
				isProcessing = false;
				processingStep = 'idle';
			}
		}
	}

	$effect(() => {
		if (!awaitingTaskeeInvoice) return;
		const timer = setInterval(() => {
			void loadPostedInvoice(true);
		}, 5000);
		return () => clearInterval(timer);
	});

	async function handlePayFromWallet(): Promise<void> {
		if (!fundedRune || !fundedContractId || !bidContent?.bidderId || !payMatchesRail) return;
		if (dollarBid && fundRail === 'btc_lightning' && nodeEmpty) {
			errorMessage = $t('wallet.lightning_no_peer');
			return;
		}
		isProcessing = true;
		errorMessage = '';
		processingStep = 'paying';
		try {
			const paid = await fundedRune.payFundingFromWallet();
			if (paid.status === 'locked' || paid.status === 'funded') {
				await notifyFunded(fundedContractId, bidContent.bidderId);
			}
			isProcessing = false;
			processingStep = 'idle';
		} catch (error) {
			const cause = error instanceof Error ? error.cause : undefined;
			const causeMessage = cause instanceof Error ? cause.message : undefined;
			errorMessage = causeMessage || (error instanceof Error ? error.message : String(error));
			appStore.showErrorToast($t('dashboard.bids.bid_acceptance.funding_confirm_failed'));
		} finally {
			await walletManager.releaseRgbLock();
			isProcessing = false;
			processingStep = 'idle';
		}
	}

	async function handleCheckFunding(): Promise<void> {
		if (!fundedRune || !fundedContractId || !bidContent?.bidderId) return;
		isProcessing = true;
		errorMessage = '';
		processingStep = 'verifying';
		try {
			await fundedRune.confirmFunding();
			await notifyFunded(fundedContractId, bidContent.bidderId);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Payment has not been detected yet';
		} finally {
			await walletManager.releaseRgbLock();
			isProcessing = false;
			processingStep = 'idle';
		}
	}

	async function handleStartTask(): Promise<void> {
		if (!bidContent || !fundedRune || !fundedContractId) return;
		const bidderPubkey = bidContent.bidderId;
		if (!bidderPubkey) {
			errorMessage = 'Bidder pubkey is unavailable';
			return;
		}

		isProcessing = true;
		errorMessage = '';
		processingStep = 'starting';
		try {
			await fundedRune.startWork();
			await publishContractStep({
				status: BidStatusEnum.WORK_IN_PROGRESS,
				action: 'work_started',
				contractId: fundedContractId,
				bidderPubkey,
				message: 'Task started',
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60
			});
			onFunded(fundedContractId);
		} catch (error) {
			if (isE2ETest) {
				console.error('[start-task] failed', error);
			}
			errorMessage = error instanceof Error ? error.message : 'Task start failed';
			appStore.showErrorToast($t('dashboard.bids.bid_acceptance.funding_confirm_failed'));
		} finally {
			isProcessing = false;
			processingStep = 'idle';
		}
	}

	onMount(() => {
		walletManager
			.initialize()
			.then(() => satsRailBlocked(walletState.utexoWallet))
			.then((blocked) => {
				nodeEmpty = blocked;
			})
			.catch((error: unknown) => {
				nodeEmpty = true;
				console.warn('[bid-acceptance] wallet init failed', error);
			});
	});
</script>

<div
	class="mx-auto flex h-full min-h-0 w-full max-w-md flex-col gap-4"
	data-testid="bid-acceptance-form"
>
	<section class="card bg-base-100 border-base-300 shrink-0 border shadow-sm">
		<div class="card-body gap-2 p-3">
			<div class="flex items-center justify-between gap-3">
				<h2 class="text-sm font-semibold">
					{$t('dashboard.bids.bid_acceptance.contract_information')}
				</h2>
				<span class="badge badge-primary badge-sm shrink-0" data-testid="contract-settlement-unit">
					{settlementUnit}
				</span>
			</div>
			<div class="flex flex-col gap-1 text-sm">
				{#if dollarBid}
					<div class="flex items-center justify-between gap-3 font-semibold">
						<span>{$t('dashboard.bids.bid_acceptance.base_amount')}</span>
						<span class="tabular-nums" data-testid="bid-base-amount">
							{lockedBid ? `$${formatNumberWithTwoDecimals(lockedBid.lockedAmount)}` : '—'}
						</span>
					</div>
					<p class="text-base-content/60 text-xs" data-testid="usd-escrow-note">
						{$t(
							fundRail === 'btc_lightning'
								? 'dashboard.bids.bid_acceptance.lightning_escrow_note'
								: 'dashboard.bids.bid_acceptance.usd_escrow_note'
						)}
					</p>
				{:else}
					<div class="flex items-center justify-between gap-3">
						<span class="text-base-content/70"
							>{$t('dashboard.bids.bid_acceptance.base_amount')}</span
						>
						<span class="tabular-nums" data-testid="bid-base-amount">
							{bidAmountSats === null ? '—' : `${formatInteger(bidAmountSats)} sats`}
						</span>
					</div>
					<div class="flex items-center justify-between gap-3">
						<span class="text-base-content/70">
							{$t('dashboard.bids.bid_acceptance.client_fee', {
								values: { fee: `${(PLATFORM_FEE_RATE * 100).toFixed(1)}%` }
							})}
						</span>
						<span class="tabular-nums" data-testid="bid-platform-fee">
							{platformFeeSats === null ? '—' : `${formatInteger(platformFeeSats)} sats`}
						</span>
					</div>
					<div
						class="border-base-300 flex items-center justify-between gap-3 border-t pt-2 font-semibold"
					>
						<span>{$t('dashboard.bids.bid_acceptance.total_payment')}</span>
						<span class="tabular-nums" data-testid="bid-total-payment">
							<span data-testid="bid-total-sats"
								>{totalSats === null ? '—' : `${formatInteger(totalSats)} sats`}</span
							>
						</span>
					</div>
					<p class="text-base-content/60 text-xs" data-testid="sats-usdt-note">
						{$t('dashboard.bids.bid_acceptance.sats_usdt_note')}
					</p>
				{/if}
			</div>
			{#if dollarBid && !fundedRune}
				<div class="mt-2 flex flex-col gap-2" data-testid="fund-rail">
					<p class="text-sm font-medium">{$t('dashboard.bids.bid_acceptance.fund_rail_prompt')}</p>
					<label class="flex items-center gap-2 text-sm">
						<input
							type="radio"
							name="fund-rail"
							class="radio radio-primary radio-sm"
							bind:group={fundRail}
							value="usdt_rgb"
							data-testid="fund-rail-usdt"
						/>
						{$t('dashboard.bids.bid_acceptance.fund_rail_usdt')}
					</label>
					<label class="flex items-center gap-2 text-sm">
						<input
							type="radio"
							name="fund-rail"
							class="radio radio-sm"
							bind:group={fundRail}
							value="btc_lightning"
							data-testid="fund-rail-lightning"
						/>
						{$t('dashboard.bids.bid_acceptance.fund_rail_lightning')}
					</label>
					<label class="flex items-center gap-2 text-sm">
						<input
							type="radio"
							name="fund-rail"
							class="radio radio-sm"
							bind:group={fundRail}
							value="usdt_ln"
							data-testid="fund-rail-usdt-ln"
						/>
						{$t('dashboard.bids.bid_acceptance.fund_rail_usdt_ln')}
					</label>
					{#if fundRail === 'btc_lightning'}
						<p class="text-base-content/70 text-xs" data-testid="lightning-sats">
							{lightningSats === null
								? '—'
								: $t('dashboard.bids.bid_acceptance.lightning_sats', {
										values: { amount: formatInteger(lightningSats) }
									})}
						</p>
						<p class="text-base-content/70 text-xs" data-testid="lightning-lock-note">
							{platformFeeSats === null
								? '—'
								: $t('dashboard.bids.bid_acceptance.lightning_lock_note', {
										values: { lock: formatInteger(platformFeeSats) }
									})}
						</p>
					{/if}
				</div>
			{/if}
		</div>
	</section>

	<ul class="steps steps-horizontal w-full shrink-0 text-xs" data-testid="funding-steps">
		<li class="step step-primary">{$t('dashboard.bids.bid_acceptance.step_accept')}</li>
		<li class="step" class:step-primary={fundingStep >= 2}>
			{$t('dashboard.bids.bid_acceptance.step_pay')}
		</li>
		<li class="step" class:step-primary={fundingStep >= 3}>
			{$t('dashboard.bids.bid_acceptance.step_start')}
		</li>
	</ul>

	{#if !walletConnected}
		<div
			class="alert alert-outline alert-warning text-sm"
			role="alert"
			data-testid="wallet-disconnected"
		>
			{$t('dashboard.bids.bid_acceptance.my_wallet')} — {$t('wallet.error.no_connection')}
		</div>
	{:else}
		<div
			class="border-base-300 rounded-box flex shrink-0 items-center justify-between gap-3 border px-3 py-2 text-sm"
			role="status"
			data-testid="wallet-connected"
		>
			<span>{$t('dashboard.bids.bid_acceptance.my_wallet')}</span>
			<span class="badge badge-success badge-sm gap-1">
				<span class="status status-success"></span>
				{$t('dashboard.bids.bid_acceptance.wallet_connected')}
			</span>
		</div>
	{/if}
	{#if dollarBid && fundRail === 'btc_lightning' && nodeEmpty}
		<div
			class="alert alert-outline alert-warning text-sm"
			role="status"
			data-testid="lightning-no-peer"
		>
			{$t('wallet.lightning_no_peer')}
		</div>
	{/if}
	{#if hasInsufficientFunds}
		<div
			class="alert alert-outline alert-error text-sm"
			role="alert"
			data-testid="insufficient-funds"
		>
			{$t('dashboard.services.detail.book_now_drawer.required_balance')}: {requiredSats.toLocaleString()}
			sats
		</div>
	{/if}

	{#if errorMessage}
		<div class="alert alert-outline alert-error text-sm" role="alert" data-testid="funding-error">
			{errorMessage}
		</div>
	{/if}

	{#if isProcessing}
		<div
			class="text-base-content/70 flex items-center gap-2 text-sm"
			data-testid="processing-state"
		>
			<span class="loading loading-spinner loading-sm text-primary"></span>
			{#if processingStep === 'funding'}
				{$t('dashboard.bids.bid_acceptance.processing')} — RGB escrow
			{:else if processingStep === 'paying'}
				{$t('dashboard.bids.bid_acceptance.paying')}
			{:else if processingStep === 'attesting'}
				{$t('dashboard.bids.bid_acceptance.follow_up_in_progress')}
			{:else if processingStep === 'starting'}
				{$t('dashboard.bids.bid_acceptance.starting_task')}
			{:else if processingStep === 'verifying'}
				{$t('dashboard.bids.bid_acceptance.check_payment')}
			{:else}
				{$t('dashboard.bids.bid_acceptance.processing')}
			{/if}
		</div>
	{/if}

	<div class="mt-auto flex shrink-0 flex-col gap-2">
		{#if awaitingFunding}
			<p class="text-base-content/70 text-xs" data-testid="rgb-btc-settlement">
				{$t('dashboard.bids.bid_acceptance.waiting_for_payment')}
			</p>
			<div class="flex items-center gap-2">
				<input
					class="input input-bordered input-sm min-w-0 flex-1 font-mono text-xs"
					readonly
					value={fundingInvoice}
					aria-label={$t('dashboard.bids.bid_acceptance.funding_request_label')}
				/>
				<button
					type="button"
					class="btn btn-outline btn-sm shrink-0"
					onclick={() => copyToClipboard(fundingInvoice)}
					data-testid="copy-funding-invoice"
				>
					{$t('dashboard.bids.bid_acceptance.copy')}
				</button>
			</div>
			<button
				type="button"
				class="btn btn-primary glow-soft w-full"
				onclick={handlePayFromWallet}
				disabled={isProcessing || !payMatchesRail}
				data-testid="pay-funding-from-wallet"
			>
				{#if isProcessing && processingStep === 'paying'}
					<span class="loading loading-spinner loading-sm"></span>
				{/if}
				{$t('dashboard.bids.bid_acceptance.pay_from_wallet')}
			</button>
			<button
				type="button"
				class="btn btn-outline btn-sm w-full"
				onclick={handleCheckFunding}
				disabled={isProcessing}
				data-testid="check-funding-button"
			>
				{#if isProcessing && processingStep === 'verifying'}
					<span class="loading loading-spinner loading-sm"></span>
				{/if}
				{$t('dashboard.bids.bid_acceptance.check_payment')}
			</button>
		{:else if awaitingTaskeeInvoice}
			<p class="text-base-content/70 text-xs" data-testid="waiting-taskee-invoice">
				{$t(
					fundRail === 'btc_lightning'
						? 'dashboard.bids.bid_acceptance.waiting_lightning_invoice'
						: 'dashboard.bids.bid_acceptance.waiting_taskee_invoice'
				)}
			</p>
			<button
				type="button"
				class="btn btn-primary w-full"
				onclick={() => loadPostedInvoice(false)}
				disabled={isProcessing}
				data-testid="load-taskee-invoice"
			>
				{#if isProcessing}
					<span class="loading loading-spinner loading-sm"></span>
				{/if}
				{$t('dashboard.bids.bid_acceptance.load_taskee_invoice')}
			</button>
		{:else if fundedRune && escrowReady}
			<button
				type="button"
				class="btn btn-primary w-full"
				onclick={handleStartTask}
				disabled={isProcessing}
				data-testid="start-contract-button"
			>
				{#if isProcessing && processingStep === 'starting'}
					<span class="loading loading-spinner loading-sm"></span>
				{/if}
				{$t('dashboard.bids.bid_acceptance.start_task')}
			</button>
		{:else}
			<button
				type="button"
				class="btn btn-primary w-full"
				onclick={handleAcceptAndFund}
				disabled={!canConfirm}
				data-testid="accept-fund-button"
			>
				{#if isProcessing}
					<span class="loading loading-spinner loading-sm"></span>
				{/if}
				{$t('dashboard.bids.bid_acceptance.accept_fund')}
			</button>
		{/if}
		<button
			type="button"
			class="btn btn-ghost w-full"
			onclick={onCancel}
			disabled={isProcessing}
			data-testid="cancel-button"
		>
			{$t('dashboard.bids.bid_acceptance.cancel')}
		</button>
	</div>
</div>
