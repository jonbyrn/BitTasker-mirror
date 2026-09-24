<script lang="ts">
	import { browser } from '$app/environment';
	import { t } from 'svelte-i18n';
	import { appStore } from '$lib/stores/app.store';
	import { walletManager } from '$lib/stores/wallet/wallet-manager';
	import { acceptIncomingPayment, receiveBlankInvoice } from '$lib/stores/wallet/wallet-balances';
	import { publishFundingInvoice } from '$lib/utils/nostr-bid';
	import { BidStatusEnum } from '$lib/utils/enums/bid.enum';

	let {
		bidId,
		taskId,
		taskerPubkey,
		status
	}: {
		bidId: string;
		taskId: string;
		taskerPubkey?: string;
		status?: string;
	} = $props();

	const storageKey = $derived(`rgb-escrow-invoice:${bidId}`);
	const storedInvoice = $derived(
		browser ? (sessionStorage.getItem(`rgb-escrow-invoice:${bidId}`) ?? '') : ''
	);
	let createdInvoice = $state('');
	const invoice = $derived(createdInvoice || storedInvoice);
	let busy = $state(false);
	let errorMessage = $state('');

	const accepted = $derived(
		status === BidStatusEnum.ACCEPTED || status === BidStatusEnum.ESCROW_FUNDED
	);
	const canCreate = $derived(status === BidStatusEnum.ACCEPTED && !invoice && !busy);
	const canAccept = $derived(!busy && (Boolean(invoice) || status === BidStatusEnum.ESCROW_FUNDED));

	async function createInvoice(): Promise<void> {
		if (!taskerPubkey) {
			errorMessage = $t('bids.escrow_invoice_missing_tasker');
			return;
		}
		busy = true;
		errorMessage = '';
		try {
			await walletManager.initialize();
			const created = await receiveBlankInvoice();
			const sent = await publishFundingInvoice(bidId, taskId, taskerPubkey, created.invoice);
			if (!sent) throw new Error($t('bids.escrow_invoice_failed'));
			createdInvoice = created.invoice;
			if (browser) sessionStorage.setItem(storageKey, created.invoice);
			appStore.showSuccessToast($t('bids.escrow_invoice_sent'));
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : $t('bids.escrow_invoice_failed');
		} finally {
			await walletManager.releaseRgbLock();
			busy = false;
		}
	}

	async function acceptPayment(): Promise<void> {
		busy = true;
		errorMessage = '';
		try {
			await walletManager.initialize();
			await acceptIncomingPayment();
			appStore.showSuccessToast($t('bids.incoming_payment_accepted'));
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : $t('bids.escrow_invoice_failed');
		} finally {
			await walletManager.releaseRgbLock();
			busy = false;
		}
	}
</script>

{#if accepted}
	<div
		class="border-base-300 flex flex-col gap-2 rounded-lg border p-3"
		data-testid="escrow-invoice-actions"
	>
		<p class="text-base-content/70 text-xs">{$t('bids.escrow_invoice_hint')}</p>
		{#if errorMessage}
			<div class="alert alert-outline alert-error py-2 text-sm" data-testid="escrow-invoice-error">
				{errorMessage}
			</div>
		{/if}
		{#if canCreate}
			<button
				type="button"
				class="btn btn-primary btn-sm w-full"
				onclick={createInvoice}
				data-testid="create-escrow-invoice"
			>
				{$t('bids.create_escrow_invoice')}
			</button>
		{:else if busy}
			<span class="loading loading-spinner loading-sm text-primary"></span>
		{/if}
		{#if invoice}
			<p class="text-success text-xs" data-testid="escrow-invoice-ready">
				{$t('bids.escrow_invoice_sent')}
			</p>
		{/if}
		{#if canAccept}
			<button
				type="button"
				class="btn btn-outline btn-sm w-full"
				onclick={acceptPayment}
				data-testid="accept-incoming-payment"
			>
				{#if busy}<span class="loading loading-spinner loading-xs"></span>{/if}
				{$t('bids.accept_incoming_payment')}
			</button>
		{/if}
	</div>
{/if}
