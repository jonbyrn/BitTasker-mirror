<script lang="ts">
	import { browser } from '$app/environment';
	import { t } from 'svelte-i18n';
	import { appStore } from '$lib/stores/app.store';
	import { walletManager } from '$lib/stores/wallet/wallet-manager';
	import { invoiceMatchesAmount } from '$lib/services/rgb/escrow-rail';
	import { receiveUsdtInvoice } from '$lib/stores/wallet/wallet-balances';
	import { contractUsdtUnits, publishFundingInvoice } from '$lib/utils/nostr-bid';
	import { BidStatusEnum } from '$lib/utils/enums/bid.enum';

	let {
		bidId,
		taskId,
		taskerPubkey,
		existingInvoice = '',
		status,
		amount = 0,
		currency
	}: {
		bidId: string;
		taskId: string;
		taskerPubkey?: string;
		existingInvoice?: string;
		status?: string;
		amount?: number;
		currency?: string;
	} = $props();

	const storageKey = $derived(`rgb-escrow-invoice:${bidId}`);
	const storedInvoice = $derived(
		browser ? (localStorage.getItem(`rgb-escrow-invoice:${bidId}`) ?? '') : ''
	);
	let createdInvoice = $state('');
	const invoice = $derived(createdInvoice || storedInvoice || existingInvoice);
	let busy = $state(false);
	let relayAck = $state(false);
	let errorMessage = $state('');

	const accepted = $derived(
		status === BidStatusEnum.ACCEPTED || status === BidStatusEnum.ESCROW_FUNDED
	);
	const invoiceUnits = $derived.by(() => {
		try {
			return contractUsdtUnits(amount, currency);
		} catch {
			return null;
		}
	});
	const canCreate = $derived(
		status === BidStatusEnum.ACCEPTED && !invoice && !busy && invoiceUnits !== null
	);

	async function publishInvoice(value: string): Promise<void> {
		if (!taskerPubkey) {
			errorMessage = $t('bids.escrow_invoice_missing_tasker');
			return;
		}
		const sent = await publishFundingInvoice(bidId, taskId, taskerPubkey, value);
		if (!sent) throw new Error($t('bids.escrow_invoice_failed'));
		relayAck = true;
		appStore.showSuccessToast($t('bids.escrow_invoice_sent'));
	}

	async function createInvoice(): Promise<void> {
		if (!taskerPubkey) {
			errorMessage = $t('bids.escrow_invoice_missing_tasker');
			return;
		}
		busy = true;
		errorMessage = '';
		relayAck = false;
		try {
			await walletManager.initialize();
			const units = invoiceUnits;
			if (units === null) throw new Error($t('bids.escrow_invoice_amount'));
			const created = await receiveUsdtInvoice(amount);
			if (created.blank || !invoiceMatchesAmount('usdt_rgb', created.invoice, units)) {
				throw new Error($t('bids.escrow_invoice_amount'));
			}
			await publishInvoice(created.invoice);
			createdInvoice = created.invoice;
			if (browser) localStorage.setItem(storageKey, created.invoice);
		} catch (error) {
			relayAck = false;
			errorMessage = error instanceof Error ? error.message : $t('bids.escrow_invoice_failed');
		} finally {
			await walletManager.releaseRgbLock();
			busy = false;
		}
	}

	async function resendInvoice(): Promise<void> {
		if (!invoice) return;
		busy = true;
		errorMessage = '';
		relayAck = false;
		try {
			await walletManager.initialize();
			await publishInvoice(invoice);
		} catch (error) {
			relayAck = false;
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
			<input
				class="input input-bordered input-sm w-full font-mono text-xs"
				readonly
				value={invoice}
				aria-label={$t('bids.escrow_invoice_sent')}
				data-testid="escrow-invoice-value"
			/>
			{#if relayAck}
				<p class="text-success text-xs" data-testid="escrow-invoice-ready">
					{$t('bids.escrow_invoice_sent')}
				</p>
			{/if}
			<button
				type="button"
				class="btn btn-outline btn-sm w-full"
				onclick={resendInvoice}
				disabled={busy}
				data-testid="resend-escrow-invoice"
			>
				{$t('bids.escrow_invoice_resend')}
			</button>
		{/if}
	</div>
{/if}
