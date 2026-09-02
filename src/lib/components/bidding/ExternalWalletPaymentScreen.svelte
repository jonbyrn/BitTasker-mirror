<script lang="ts">
	import type { TaskBid } from '$lib/types/bid';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { t } from 'svelte-i18n';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { appStore } from '$lib/stores/app.store';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import { getHandle } from '$lib/stores/connected-wallets.store';
	import { EVMSignerNotAvailableError } from '$lib/services/external-wallet/types';
	import {
		encodeERC20Transfer,
		getBSCUSDTContractAddress,
		getChainIdForNetwork
	} from '$lib/services/external-wallet/chain-utils';

	// Props
	const props = $props<{
		bid: TaskBid;
		taskTitle: string;
		escrowDetails: {
			paymentMethod: 'bitcoin-lightning' | 'lbtc-liquid' | 'usdt-bsc';
			address: string;
			qrCode: string;
		};
		btcPrice: number;
		onPaymentConfirmed: () => void;
		onCancel: () => void;
	}>();

	// State
	let copied = $state(false);
	let selectedPayerWallet = $state<string | null>(null);
	let isPaying = $state(false);
	let payError = $state<string | null>(null);

	// Calculate totals
	let totalFiatPrice = $derived((props.bid.amount / 100000000) * props.btcPrice);

	// Get payment method display info
	let paymentInfo = $derived(() => {
		switch (props.escrowDetails.paymentMethod) {
			case 'bitcoin-lightning':
				return {
					name: $t('common.components.bidding.external_wallet.payment_methods.bitcoin_lightning'),
					icon: '/currency-symbols/Bitcoin.svg',
					color: 'from-orange-400 to-orange-600',
					network: $t('common.components.bidding.external_wallet.networks.lightning')
				};
			case 'lbtc-liquid':
				return {
					name: $t('common.components.bidding.external_wallet.payment_methods.lbtc'),
					icon: '/currency-symbols/LBTC.svg',
					color: 'from-cyan-400 to-cyan-600',
					network: $t('common.components.bidding.external_wallet.networks.liquid')
				};
			case 'usdt-bsc':
				return {
					name: $t('common.components.bidding.external_wallet.payment_methods.usdt'),
					icon: '/currency-symbols/USDt.svg',
					color: 'from-green-400 to-green-600',
					network: $t('common.components.bidding.external_wallet.networks.bsc')
				};
			default:
				return {
					name: $t('common.components.bidding.external_wallet.payment_methods.unknown'),
					icon: '/currency-symbols/Bitcoin.svg',
					color: 'from-gray-400 to-gray-600',
					network: $t('common.components.bidding.external_wallet.networks.unknown')
				};
		}
	});

	// Copy address to clipboard
	async function copyAddress() {
		try {
			copyToClipboard(props.escrowDetails.address);
			appStore.showSuccessToast($t('wallet.address_copied'));
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 5000);
		} catch (error) {
			console.error('Failed to copy address:', error);
		}
	}

	// Confirm payment
	function confirmPayment() {
		props.onPaymentConfirmed();
	}

	// Pay from connected wallet
	async function handlePayFromWallet(walletId: string) {
		selectedPayerWallet = walletId;
		isPaying = true;
		payError = null;

		try {
			const handle = getHandle(walletId);
			if (!handle?.evmSigner) throw new EVMSignerNotAvailableError(walletId);

			if (props.escrowDetails.paymentMethod === 'lbtc-liquid') {
				const chainId = 30; // RSK mainnet
				const amountWei = BigInt(props.bid.amount);
				await handle.evmSigner.sendTransaction({
					to: props.escrowDetails.address,
					value: amountWei * 10n ** 10n, // sats → wei (RBTC 18 decimals)
					chainId
				});

				appStore.showSuccessToast($t('common.components.bidding.external_wallet.payment_sent'));
				isPaying = false;
				props.onPaymentConfirmed();
			} else if (props.escrowDetails.paymentMethod === 'usdt-bsc') {
				const chainId = getChainIdForNetwork('usdt-bsc');
				const usdtContract = "";
				// Convert bid sats to USDT wei: sats * btcPrice / 1e8 * 1e18 = sats * btcPrice * 1e10
				const usdtAmountWei = BigInt(
					Math.round((props.bid.amount / 100_000_000) * props.btcPrice * 1e18)
				);
				const data = encodeERC20Transfer(props.escrowDetails.address, usdtAmountWei);
				await handle.evmSigner.sendTransaction({
					to: usdtContract,
					value: 0n,
					data,
					chainId
				});

				appStore.showSuccessToast($t('common.components.bidding.external_wallet.payment_sent'));
				isPaying = false;
				props.onPaymentConfirmed();
			} else {
				// Lightning payments from connected wallets are not supported
				appStore.showErrorToast(
					$t('common.components.bidding.external_wallet.lightning_not_supported')
				);
				selectedPayerWallet = null;
				isPaying = false;
				return;
			}
		} catch (err) {
			payError = err instanceof Error ? err.message : 'Payment failed';
			isPaying = false;
		}
	}
</script>

<div class="bg-base-100 mx-auto max-h-[70vh] overflow-y-auto rounded-lg shadow-lg">
	<!-- Header with close button -->
	<div
		class="bg-base-100 border-base-300 sticky top-0 z-10 flex items-center justify-between border-b p-4 pb-4 sm:p-6"
	>
		<h4 class="font-bold">{$t('common.components.bidding.external_wallet.title')}</h4>
		<button
			type="button"
			class="btn btn-ghost btn-sm btn-circle"
			onclick={props.onCancel}
			aria-label={$t('common.components.bidding.external_wallet.close_dialog')}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M6 18L18 6M6 6l12 12"
				/>
			</svg>
		</button>
	</div>

	<!-- Content with padding -->
	<div class="p-4 sm:p-6">
		<!-- Main Content Grid -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<!-- Left Column: Instructions -->
			<div class="w-full">
				<!-- Payment Method & Amount -->
				<div
					class="bg-base-200 mb-6 flex flex-row items-center justify-between gap-4 rounded-2xl p-3"
				>
					<div class="flex items-center gap-3">
						<div class="flex h-10 w-10 items-center justify-center rounded-full">
							<img src={paymentInfo().icon} alt={paymentInfo().name} class="h-6 w-6" />
						</div>
						<div class="text-left">
							<div class="text-sm font-semibold">{paymentInfo().name}</div>
							<div class="text-base-content/70 text-xs">{paymentInfo().network}</div>
						</div>
					</div>
					<div class="text-right">
						<div class="text-lg font-bold">${totalFiatPrice.toFixed(2)}</div>
						<div class="text-base-content/70 text-xs">
							{formatNumberWithTwoDecimals(props.bid.amount)} sats
						</div>
					</div>
				</div>
				<!-- Instructions -->
				<div class="alert-info alert-outline alert w-full">
					<div class="flex items-start gap-3">
						<svg
							class="text-info mt-0.5 h-4 w-4"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<div class="text-info text-xs">
							<ul class="space-y-1">
								<li>
									{$t('common.components.bidding.external_wallet.instructions.send_exactly', {
										values: { amount: totalFiatPrice.toFixed(2) }
									})}
								</li>
								<li>
									{$t('common.components.bidding.external_wallet.instructions.use_network', {
										values: { network: paymentInfo().network }
									})}
								</li>
								<li>{$t('common.components.bidding.external_wallet.instructions.no_exchange')}</li>
							</ul>
						</div>
					</div>
				</div>
			</div>

			<!-- Right Column: QR Code Only -->
			<div class="flex flex-col items-center">
				<div class="rounded-lg bg-white p-4 shadow-lg">
					<img
						src={props.escrowDetails.qrCode}
						alt={$t('common.components.bidding.external_wallet.qr_alt')}
						class="h-40 w-40"
					/>
				</div>
				<!-- Payment Status -->
				<div class="mt-4 text-center">
					<div class="text-base-content/70 text-xs">
						{$t('common.components.bidding.external_wallet.scan_qr')}
					</div>
				</div>
			</div>
		</div>

		<!-- Address Section -->
		<div class="">
			<label for="payment-address" class="mb-2 block text-sm font-medium"
				>{$t('common.components.bidding.external_wallet.payment_address')}</label
			>
			<div class="bg-base-200 flex items-center gap-2 rounded-lg p-3">
				<span id="payment-address" class="flex-1 font-mono text-xs break-all"
					>{props.escrowDetails.address}</span
				>
				<button
					class="btn btn-ghost btn-sm {copied ? 'btn-success' : ''}"
					onclick={copyAddress}
					disabled={copied}
				>
					{#if copied}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 13l4 4L19 7"
							/>
						</svg>
						{$t('common.components.bidding.external_wallet.copied')}
					{:else}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
							/>
						</svg>
						{$t('common.components.bidding.external_wallet.copy')}
					{/if}
				</button>
			</div>
		</div>

		<!-- Connected Wallet Payment Section -->
		{#if $connectedWalletsStore.wallets.length > 0}
			<div class="divider text-xs">Or pay directly from</div>
			<div class="space-y-2">
				{#each $connectedWalletsStore.wallets as wallet (wallet.id)}
					<button
						class="btn btn-outline min-h-[44px] w-full justify-start gap-3"
						onclick={() => handlePayFromWallet(wallet.id)}
						disabled={isPaying}
					>
						<div class="text-left">
							<div class="text-sm font-medium">{wallet.walletName}</div>
							<div class="text-xs opacity-50">
								{wallet.address.slice(0, 10)}...{wallet.address.slice(-4)}
							</div>
						</div>
						{#if selectedPayerWallet === wallet.id && isPaying}
							<span class="loading loading-spinner loading-sm ml-auto"></span>
						{/if}
					</button>
				{/each}
			</div>
		{/if}

		<!-- Payment Error -->
		{#if payError}
			<div class="alert alert-error mt-3">
				<span class="text-sm">{payError}</span>
			</div>
		{/if}
	</div>

	<!-- Action Buttons -->
	<div
		class="bg-base-100 border-base-300 sticky bottom-0 flex w-full flex-col justify-end gap-3 border-t p-4 sm:flex-row md:py-2"
	>
		<button type="button" class="btn btn-error" onclick={props.onCancel}>
			{$t('common.components.bidding.external_wallet.cancel')}
		</button>
		<button type="button" class="btn btn-primary" onclick={confirmPayment}>
			{$t('common.components.bidding.external_wallet.payment_sent')}
		</button>
	</div>
</div>

