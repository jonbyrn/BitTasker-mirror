<script lang="ts">
	import { t } from 'svelte-i18n';
	import { ContractRune } from '$lib/runes/contract.svelte';
	import { sendBidStatusUpdate } from '$lib/utils/nostr-bid';
	import { BidStatusEnum } from '$lib/utils/enums/bid.enum';
	import { appStore } from '$lib/stores/app.store';
	import { notificationCenterService } from '$lib/api/services/notificationCenter.service';
	import { walletStore } from '$lib/stores/wallet/wallet-state';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { CONTRACT_PAYMENT_ASSETS, type PaymentSplitConfig } from '$lib/types/rgb-contract';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import type { NDKBid } from '$lib/nostr/events/bid';
	import type { NDKTask } from '$lib/nostr/events/task';

	const BTC_ONLY_SPLIT: PaymentSplitConfig = {
		primaryAsset: 'btc_onchain',
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
	const bidAmountUsd = $derived(bidContent?.amount ?? 0);
	const platformFeeUsd = $derived(bidAmountUsd * PLATFORM_FEE_RATE);
	const totalUsd = $derived(bidAmountUsd + platformFeeUsd);
	const totalSats = $derived(
		btcPrice.price > 0 ? Math.round((totalUsd / btcPrice.price) * 100_000_000) : null
	);

	const walletSats = $derived($walletStore.rgb?.balanceSats ?? 0);
	const walletConnected = $derived(
		isE2ETest || ($walletStore.isConnected && $walletStore.rgb?.initialized)
	);
	const requiredSats = $derived(totalSats ?? 0);
	const hasInsufficientFunds = $derived(
		!isE2ETest && walletConnected && totalSats !== null && walletSats < requiredSats
	);
	const contractTitle = $derived(
		bidContent?.taskTitle || task.taskContent?.title || $t('dashboard.bids.bid_acceptance.contract_information')
	);
	const bidderComments = $derived(
		bidContent?.proposedApproach || bidContent?.coverLetter || bidContent?.description || ''
	);

	// TODO: Re-enable split settlement after RGB USDT configuration is wired for this flow.
	const split = BTC_ONLY_SPLIT;
	const settlementUnit = $derived(CONTRACT_PAYMENT_ASSETS[split.primaryAsset]);

	let isProcessing = $state(false);
	let processingStep = $state<
		'idle' | 'funding' | 'verifying' | 'attesting' | 'notifying' | 'starting'
	>('idle');
	let errorMessage = $state('');
	let fundedRune = $state<ContractRune | null>(null);
	let fundedContractId = $state<string | null>(null);

	const canConfirm = $derived(
		walletConnected && !hasInsufficientFunds && !isProcessing && bidContent !== null
	);
	const fundingInvoice = $derived(fundedRune?.snapshot?.fundingInvoice ?? '');
	const awaitingFunding = $derived(
		Boolean(fundedRune && fundedRune.status === 'funding' && fundingInvoice)
	);

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
			amount: String(requiredSats),
			...(params.estimatedCompletionTime
				? { estimatedCompletionTime: params.estimatedCompletionTime }
				: {})
		});
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
			// Step 1-2: Create ContractRune and initialize escrow state
			const contractId = `contract-${task.id}-${bid.id}`;
			processingStep = 'funding';
			const rune = new ContractRune({
				contractId,
				contractTitle,
				bidderComments,
				totalAmountUsd: totalUsd,
				split,
				partyPubkeys: [bidderPubkey, task.pubkey].filter(Boolean)
			});

			// Test mode completes deterministically; production creates a request and waits for payment.
			if (isE2ETest) {
				await rune.fundForE2E();
			} else {
				await rune.prepareFunding();
			}

			processingStep = 'notifying';
			await publishContractStep({
				status: BidStatusEnum.ACCEPTED,
				action: 'bid_accepted',
				contractId,
				bidderPubkey,
				message: 'Bid accepted'
			});

			fundedRune = rune;
			fundedContractId = contractId;
			if (rune.status === 'funded') {
				await notifyFunded(contractId, bidderPubkey);
			}
		} catch (error) {
			if (isE2ETest) {
				console.error('[accept-fund] failed', error);
			}
			errorMessage = error instanceof Error ? error.message : 'Escrow funding failed';
			appStore.showErrorToast($t('dashboard.bids.bid_acceptance.funding_confirm_failed'));
		} finally {
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
</script>

<div class="flex h-full flex-col gap-4 p-4" data-testid="bid-acceptance-form">
	<!-- Bid summary -->
	<div class="bg-base-200 rounded-lg p-4">
		<h4 class="mb-2 text-sm font-semibold">
			{$t('dashboard.bids.bid_acceptance.contract_information')}
		</h4>
		<div class="space-y-1 text-sm">
			<div class="flex justify-between">
				<span class="text-base-content/70">{$t('dashboard.bids.bid_acceptance.base_amount')}</span>
				<span data-testid="bid-base-amount">${bidAmountUsd.toFixed(2)}</span>
			</div>
			<div class="flex justify-between">
				<span class="text-base-content/70">
					{$t('dashboard.bids.bid_acceptance.client_fee', {
						values: { fee: `${(PLATFORM_FEE_RATE * 100).toFixed(1)}%` }
					})}
				</span>
				<span data-testid="bid-platform-fee">${platformFeeUsd.toFixed(2)}</span>
			</div>
			<div class="border-base-300 flex justify-between border-t pt-1 font-semibold">
				<span>{$t('dashboard.bids.bid_acceptance.total_payment')}</span>
				<span data-testid="bid-total-payment">${totalUsd.toFixed(2)}</span>
			</div>
			{#if totalSats !== null}
				<div class="text-base-content/60 flex justify-between text-xs">
					<span>{$t('dashboard.bids.bid_acceptance.btc_price')}</span>
					<span data-testid="bid-total-sats">{totalSats.toLocaleString()} sats</span>
				</div>
			{/if}
		</div>
	</div>

	<div class="bg-base-200 rounded-lg p-4 text-sm" data-testid="rgb-btc-settlement">
		<div class="flex items-center justify-between gap-3">
			<div class="flex min-w-0 flex-col">
				<span class="text-base-content/70">RGB Escrow</span>
				<span class="text-base-content/60 text-xs">Settlement rail</span>
			</div>
			<div
				class="badge badge-primary badge-lg shrink-0 font-semibold"
				data-testid="contract-settlement-unit"
			>
				{settlementUnit}
			</div>
		</div>
	</div>

	<!-- Wallet state -->
	{#if !walletConnected}
		<div class="alert alert-warning text-sm" role="alert" data-testid="wallet-disconnected">
			{$t('dashboard.bids.bid_acceptance.my_wallet')} — {$t('wallet.error.no_connection')}
		</div>
	{:else if hasInsufficientFunds}
		<div class="alert alert-error text-sm" role="alert" data-testid="insufficient-funds">
			{$t('dashboard.services.detail.book_now_drawer.required_balance')}: {requiredSats.toLocaleString()}
			sats
		</div>
	{/if}

	{#if errorMessage}
		<div class="alert alert-error text-sm" role="alert" data-testid="funding-error">
			{errorMessage}
		</div>
	{/if}

	{#if isProcessing}
		<div
			class="text-base-content/70 flex items-center gap-2 text-sm"
			data-testid="processing-state"
		>
			<span class="loading loading-spinner loading-sm"></span>
			{#if processingStep === 'funding'}
				{$t('dashboard.bids.bid_acceptance.processing')} — RGB escrow
			{:else if processingStep === 'attesting'}
				{$t('dashboard.bids.bid_acceptance.follow_up_in_progress')}
			{:else if processingStep === 'starting'}
				Starting task
			{:else if processingStep === 'verifying'}
				Checking your payment
			{:else}
				{$t('dashboard.bids.bid_acceptance.processing')}
			{/if}
		</div>
	{/if}

	<!-- Actions -->
	<div class="mt-auto flex gap-3 pt-2">
		<button
			type="button"
			class="btn btn-ghost flex-1"
			onclick={onCancel}
			disabled={isProcessing}
			data-testid="cancel-button"
		>
			{$t('dashboard.bids.bid_acceptance.cancel')}
		</button>
		{#if awaitingFunding}
			<div class="flex min-w-0 flex-1 flex-col gap-2">
				<div class="flex items-center gap-2 text-xs text-base-content/70">
					<span class="badge badge-warning badge-sm">Waiting for payment</span>
					<span class="truncate">Copy the request into your RGB wallet</span>
				</div>
				<div class="join w-full">
					<input class="input input-bordered join-item min-w-0 flex-1 text-xs" readonly value={fundingInvoice} aria-label="Escrow funding request" />
					<button
						type="button"
						class="btn btn-outline join-item"
						onclick={() => copyToClipboard(fundingInvoice)}
						data-testid="copy-funding-invoice"
					>
						Copy
					</button>
				</div>
				<button type="button" class="btn btn-primary w-full" onclick={handleCheckFunding} disabled={isProcessing} data-testid="check-funding-button">
					{#if isProcessing}<span class="loading loading-spinner loading-sm"></span>{/if}
					I have paid, check payment
				</button>
			</div>
		{:else if fundedRune}
			<button
				type="button"
				class="btn btn-primary flex-1"
				onclick={handleStartTask}
				disabled={isProcessing}
				data-testid="start-contract-button"
			>
				{#if isProcessing && processingStep === 'starting'}
					<span class="loading loading-spinner loading-sm"></span>
				{/if}
				Start Task
			</button>
		{:else}
			<button
				type="button"
				class="btn btn-primary flex-1"
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
	</div>
</div>
