<script lang="ts">
	import { t } from 'svelte-i18n';
	import { ContractRune } from '$lib/runes/contract.svelte';
	import { sendConsignmentToPeer } from '$lib/services/rgb/consignment-exchange';
	import { sendBidStatusUpdate } from '$lib/utils/nostr-bid';
	import { BidStatusEnum } from '$lib/utils/enums/bid.enum';
	import { appStore } from '$lib/stores/app.store';
	import { walletStore } from '$lib/stores/wallet/wallet-state';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import PaymentSplitSlider from '$lib/components/contracts/PaymentSplitSlider.svelte';
	import type { PaymentSplitConfig } from '$lib/types/rgb-contract';
	import type { NDKBid } from '$lib/nostr/events/bid';
	import type { NDKTask } from '$lib/nostr/events/task';

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

	const bidContent = $derived(bid.bidContent);
	const bidAmountUsd = $derived(bidContent?.amount ?? 0);
	const platformFeeUsd = $derived(bidAmountUsd * PLATFORM_FEE_RATE);
	const totalUsd = $derived(bidAmountUsd + platformFeeUsd);
	const totalSats = $derived(
		btcPrice.price > 0 ? Math.round((totalUsd / btcPrice.price) * 100_000_000) : null
	);

	const walletSats = $derived($walletStore.rgb?.balanceSats ?? 0);
	const walletConnected = $derived($walletStore.isConnected && $walletStore.rgb?.initialized);
	const requiredSats = $derived(totalSats ?? 0);
	const hasInsufficientFunds = $derived(
		walletConnected && totalSats !== null && walletSats < requiredSats
	);

	let split = $state<PaymentSplitConfig>({
		primaryAsset: 'btc_onchain',
		primaryPercentage: 95,
		secondaryAsset: 'btc_lightning',
		secondaryPercentage: 5
	});

	let isProcessing = $state(false);
	let processingStep = $state<'idle' | 'funding' | 'attesting' | 'notifying'>('idle');
	let errorMessage = $state('');

	const canConfirm = $derived(
		walletConnected && !hasInsufficientFunds && !isProcessing && bidContent !== null
	);

	function updateSplit(config: PaymentSplitConfig): void {
		split = config;
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
				totalAmountUsd: totalUsd,
				split,
				partyPubkeys: [bidderPubkey, task.pubkey].filter(Boolean)
			});

			// Step 3-5: Enqueue RGB commands, sign via @utexo/rgb-sdk-web, execute on BTC/LN/USDT layer
			await rune.fund();

			// Step 6: Nostr transport attests state + delivers consignment to the bidder
			processingStep = 'attesting';
			await sendConsignmentToPeer(bidderPubkey, {
				contractId,
				assetId: split.primaryAsset,
				invoice: contractId,
				transferId: rune.seals[0]?.id
			});

			processingStep = 'notifying';
			await sendBidStatusUpdate(
				bid.id,
				bidContent.taskId || task.id,
				bidderPubkey,
				BidStatusEnum.ACCEPTED,
				undefined,
				contractId
			);

			appStore.showSuccessToast($t('dashboard.bids.bid_acceptance.success_subtitle'));
			onFunded(contractId);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Escrow funding failed';
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

	<!-- Payment split (RGB escrow allocation) -->
	<PaymentSplitSlider
		totalAmountUsd={totalUsd}
		btcPriceUsd={btcPrice.price}
		onSplitChange={updateSplit}
	/>

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
	</div>
</div>
