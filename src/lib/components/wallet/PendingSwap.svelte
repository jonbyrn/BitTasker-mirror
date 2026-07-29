<script lang="ts">
	import { untrack } from 'svelte';
	import type { BoltzSwapData, ChainSwapData } from '@bittasker/wallet-core';
	import { t } from 'svelte-i18n';
	import generateQrCodeUrl from '$lib/utils/helpers/generateQrCodeUrl';

	type SwapType = 'lightning' | 'lbtc';

	let {
		swap,
		swapType,
		onCopyInvoice,
		onCopyAddress,
		onDeleteSwap,
		expanded = false
	}: {
		swap: BoltzSwapData | ChainSwapData;
		swapType: SwapType;
		onCopyInvoice?: (invoice: string) => Promise<void>;
		onCopyAddress?: (address: string) => Promise<void>;
		onDeleteSwap: (swapId: string) => Promise<void>;
		expanded?: boolean;
	} = $props();

	let isDeleting = $state(false); // Local state for deleting button
	let isExpanded = $state(untrack(() => expanded as boolean));

	/**
	 * Get status display info
	 */
	function getStatusInfo(status: string): { label: string; color: string; icon: string } {
		if (swapType === 'lightning') {
			switch (status) {
				case 'swap.created':
					return {
						label: $t('wallet.swap.lightning.status.invoice_ready'),
						color: 'text-warning',
						icon: '⏳'
					};
				case 'invoice.set':
					return {
						label: $t('wallet.swap.lightning.status.invoice_paid'),
						color: 'text-info',
						icon: '⚡'
					};
				case 'transaction.mempool':
					return {
						label: $t('wallet.swap.lightning.status.locking_funds'),
						color: 'text-info',
						icon: '🔒'
					};
				case 'transaction.confirmed':
					return {
						label: $t('wallet.swap.lightning.status.ready_to_claim'),
						color: 'text-success',
						icon: '✅'
					};
				case 'transaction.claim.pending':
					return {
						label: $t('wallet.swap.lightning.status.claiming'),
						color: 'text-info',
						icon: '⏳'
					};
				case 'transaction.claim.failed':
					return {
						label: $t('wallet.swap.lightning.status.claim_failed'),
						color: 'text-error',
						icon: '⚠️'
					};
				case 'invoice.settled':
					return {
						label: $t('wallet.swap.lightning.status.completed'),
						color: 'text-success',
						icon: '✅'
					};
				case 'claimed':
					return {
						label: $t('wallet.swap.lightning.status.claimed'),
						color: 'text-success',
						icon: '🎉'
					};
				case 'invoice.expired':
				case 'swap.expired':
					return {
						label: $t('wallet.swap.lightning.status.expired'),
						color: 'text-error',
						icon: '⏰'
					};
				case 'transaction.failed':
					return {
						label: $t('wallet.swap.lightning.status.failed'),
						color: 'text-error',
						icon: '❌'
					};
				default:
					return { label: status, color: 'text-base-content', icon: 'ℹ️' };
			}
		} else {
			// L-BTC swap statuses
			switch (status) {
				case 'swap.created':
					return {
						label: $t('wallet.swap.lbtc.status.ready_to_send'),
						color: 'text-warning',
						icon: '⏳'
					};
				case 'transaction.mempool':
					return {
						label: $t('wallet.swap.lbtc.status.lbtc_detected'),
						color: 'text-info',
						icon: '🔒'
					};
				case 'transaction.confirmed':
					return {
						label: $t('wallet.swap.lbtc.status.lbtc_confirmed'),
						color: 'text-info',
						icon: '⚡'
					};
				case 'transaction.server.mempool':
					return {
						label: $t('wallet.swap.lbtc.status.locking_rbtc'),
						color: 'text-info',
						icon: '🔒'
					};
				case 'transaction.server.confirmed':
					return {
						label: $t('wallet.swap.lbtc.status.claiming_rbtc'),
						color: 'text-info',
						icon: '⏳'
					};
				case 'transaction.claim.pending':
					return {
						label: $t('wallet.swap.lbtc.status.claim_pending'),
						color: 'text-info',
						icon: '⏳'
					};
				case 'transaction.claimed':
					return {
						label: $t('wallet.swap.lbtc.status.claimed'),
						color: 'text-success',
						icon: '🎉'
					};
				case 'swap.expired':
					return { label: $t('wallet.swap.lbtc.status.expired'), color: 'text-error', icon: '⏰' };
				case 'transaction.failed':
					return { label: $t('wallet.swap.lbtc.status.failed'), color: 'text-error', icon: '❌' };
				default:
					return { label: status, color: 'text-base-content', icon: 'ℹ️' };
			}
		}
	}

	async function handleDelete() {
		if (onDeleteSwap) {
			isDeleting = true;
			try {
				await onDeleteSwap(swap.id);
			} finally {
				isDeleting = false;
			}
		}
	}

	async function handleCopyPaymentDetails() {
		if (swapType === 'lightning' && onCopyInvoice) {
			await onCopyInvoice((swap as BoltzSwapData).invoice);
		} else if (swapType === 'lbtc' && onCopyAddress) {
			await onCopyAddress((swap as ChainSwapData).lockupAddress);
		}
	}

	function toggleExpanded() {
		isExpanded = !isExpanded;
	}

	// Determine QR code data based on swap type
	const qrCodeData = $derived(
		swapType === 'lightning' ? (swap as BoltzSwapData).invoice : (swap as ChainSwapData).liquidUri
	);
	const amountDisplay = $derived(
		swapType === 'lightning' ? (swap as BoltzSwapData).amount : (swap as ChainSwapData).toAmount
	);
	const lockupTxHash = $derived(
		swapType === 'lightning'
			? (swap as BoltzSwapData).lockupTxHash
			: (swap as ChainSwapData).lockupTxHash
	);
	const claimTxHash = $derived(
		swapType === 'lightning'
			? (swap as BoltzSwapData).claimTxHash
			: (swap as ChainSwapData).claimTxHash
	);
	const explorerBaseUrl =
		import.meta.env.VITE_RSK_NETWORK === 'testnet'
			? 'https://explorer.testnet.rsk.co'
			: 'https://explorer.rsk.co';

	const statusInfo = $derived(getStatusInfo(swap.status));
</script>

<div class="card bg-base-200 shadow-lg">
	<div class="card-body p-4">
		<!-- Status Header -->
		<div class="mb-4 flex items-center justify-between">
			<div class="flex items-center gap-2">
				<span class="text-xl">{statusInfo.icon}</span>
				<span class="text-sm font-semibold {statusInfo.color}">{statusInfo.label}</span>
			</div>
			<span class="text-sm opacity-70">{amountDisplay} {$t('wallet.sats')}</span>
		</div>

		<!-- Main Payment Details with QR (Collapsible) -->
		<div class="bg-base-100 cursor-pointer rounded-lg">
			<div class="flex w-full items-center justify-between">
				<button
					class="flex flex-1 items-center justify-between p-4 text-left transition-colors hover:opacity-80"
					onclick={toggleExpanded}
					type="button"
				>
					<span class="block font-medium">
						{#if swapType === 'lightning'}
							{$t('wallet.swap.lightning.view_invoice')}
						{:else}
							{$t('wallet.swap.lbtc.view_payment_details')}
						{/if}
					</span>
				</button>
				<button
					class="ml-2 p-4 transition-transform duration-200 hover:opacity-80 {isExpanded
						? 'rotate-180'
						: ''}"
					onclick={toggleExpanded}
					type="button"
					aria-label={isExpanded
						? $t('wallet.swap.collapse_details')
						: $t('wallet.swap.expand_details')}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M19 9l-7 7-7-7"
						/>
					</svg>
				</button>
			</div>

			<!-- Collapsible Content -->
			{#if isExpanded}
				<div class="border-base-300 border-t p-4">
					<div class="flex flex-col items-center gap-4">
						<!-- QR Code -->
						<div class="flex w-full justify-center sm:max-w-[50%]">
							{#await generateQrCodeUrl(qrCodeData)}
								<div class="flex h-44 w-44 items-center justify-center rounded-lg bg-white p-3">
									<span class="loading loading-spinner loading-md"></span>
								</div>
							{:then qrUrl}
								<div class="w-full max-w-[176px] rounded-lg bg-white p-1 sm:max-w-full">
									<img src={qrUrl} alt="QR Code" class="h-full w-full" />
								</div>
							{/await}
						</div>

						<!-- Payment String/Address -->
						<div class="w-full">
							<button
								class="btn btn-outline btn-sm h-auto min-h-12 w-full justify-start p-3 text-left break-all"
								onclick={handleCopyPaymentDetails}
								type="button"
							>
								<code class="text-xs leading-relaxed">
									{#if swapType === 'lightning'}
										{(swap as BoltzSwapData).invoice}
									{:else}
										{(swap as ChainSwapData).lockupAddress}
									{/if}
								</code>
							</button>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- Swap Details -->
		<div class="space-y-1 text-xs">
			{#if lockupTxHash}
				<div class="flex justify-between">
					<span class="opacity-70">
						{#if swapType === 'lightning'}
							{$t('wallet.swap.lockup_tx')}
						{:else}
							{$t('wallet.swap.lbtc_tx')}
						{/if}:
					</span>
					<a
						href="{explorerBaseUrl}/tx/{lockupTxHash}"
						target="_blank"
						rel="noopener noreferrer"
						class="link link-primary"
					>
						{$t('wallet.swap.view')}
					</a>
				</div>
			{/if}
			{#if claimTxHash}
				<div class="flex justify-between">
					<span class="opacity-70">{$t('wallet.swap.claim_tx')}:</span>
					<a
						href="{explorerBaseUrl}/tx/{claimTxHash}"
						target="_blank"
						rel="noopener noreferrer"
						class="link link-primary"
					>
						{$t('wallet.swap.view')}
					</a>
				</div>
			{/if}
		</div>

		<!-- Action Buttons -->
		<div class="mt-2 flex flex-wrap justify-end gap-2">
			<!-- Always show delete button -->
			<button
				class="btn btn-ghost btn-sm btn-outline"
				onclick={handleDelete}
				title={$t('wallet.swap.delete_swap')}
				disabled={isDeleting}
			>
				{#if isDeleting}
					<span class="loading loading-spinner loading-xs"></span>
					{$t('wallet.swap.delete')}...
				{:else}
					🗑️ {$t('wallet.swap.delete')}
				{/if}
			</button>

			{#if swapType === 'lightning' && (swap.status === 'swap.created' || swap.status === 'invoice.set' || swap.status === 'transaction.mempool')}
				<div class="text-base-content/70 w-full py-2 text-center text-xs">
					{#if swap.status === 'swap.created'}
						{$t('wallet.swap.lightning.helper.pay_invoice')}
					{:else if swap.status === 'invoice.set'}
						{$t('wallet.swap.lightning.helper.payment_received')}
					{:else if swap.status === 'transaction.mempool'}
						{$t('wallet.swap.lightning.helper.lockup_progress')}
					{/if}
				</div>
			{:else if swapType === 'lbtc' && (swap.status === 'swap.created' || swap.status === 'transaction.mempool' || swap.status === 'transaction.confirmed' || swap.status === 'transaction.server.mempool' || swap.status === 'transaction.server.confirmed')}
				<div class="text-base-content/70 w-full py-2 text-center text-xs">
					{#if swap.status === 'swap.created'}
						{$t('wallet.swap.lbtc.helper.send_lbtc')}
					{:else if swap.status === 'transaction.mempool'}
						{$t('wallet.swap.lbtc.helper.lbtc_waiting')}
					{:else if swap.status === 'transaction.confirmed' || swap.status === 'transaction.server.mempool'}
						{$t('wallet.swap.lbtc.helper.waiting_boltz')}
					{:else if swap.status === 'transaction.server.confirmed'}
						{$t('wallet.swap.lbtc.helper.claiming_now')}
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
