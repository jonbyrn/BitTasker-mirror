<script lang="ts">
	// Import polyfills FIRST before any other imports that might use Buffer/bitcoinjs-lib
	import '$lib/polyfills';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { page } from '$app/state';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { appStore } from '$lib/stores/app.store';
	import { getSwapType } from '$lib/utils/wallet/swapTransaction';
	import type { PendingSwapData } from '$lib/utils/swapAdapter';
	import {
		walletManager,
		rskConnection,
		walletStore,
		updateSwapTransaction
	} from '$lib/stores/wallet.store';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import BalanceCard from '$lib/components/wallet/BalanceCard.svelte';
	import TransactionHistory from '$lib/components/wallet/TransactionHistory.svelte';
	import WalletPaymentModal from '$lib/components/wallet/WalletPaymentModal.svelte';
	import ReceivePaymentForm from '$lib/components/wallet/ReceivePaymentForm.svelte';
	import SendPaymentForm from '$lib/components/wallet/SendPaymentForm.svelte';
	import IconContentCopy from '~icons/mdi/content-copy';
	import IconDownload from '~icons/mdi/download';
	import IconUpload from '~icons/mdi/upload';
	import IconSwapHorizontal from '~icons/mdi/swap-horizontal';
	import IconCash from '~icons/mdi/cash';
	import IconFormatListBulleted from '~icons/mdi/format-list-bulleted';
	import IconBankOutline from '~icons/mdi/bank-outline';
	import IconWallet from '~icons/mdi/wallet';
	import IconCellphoneLink from '~icons/mdi/usb-flash-drive';
	import IconChevronRight from '~icons/mdi/chevron-right';
	import PaymentRequestModal from '$lib/components/wallet/PaymentRequestModal.svelte';
	import BankingMenu from '$lib/components/wallet/BankingMenu.svelte';
	import BuySellForm from '$lib/components/wallet/BuySellForm.svelte';
	import SwapForm from '$lib/components/wallet/SwapForm.svelte';
	import ConnectedWallets from '$lib/components/wallet/ConnectedWallets.svelte';
	import { isConnectedWalletsEnabled } from '$lib/services/kill-switch';

	let walletsEnabled = $state(isConnectedWalletsEnabled());

	let isLoading = $state(false);

	async function initializeWallet(): Promise<void> {
		try {
			isLoading = true;
			await walletManager.initialize();
			await walletManager.loadAssets();
		} finally {
			isLoading = false;
		}

		walletManager.loadRbtcExchangeRate();
	}

	onMount(async () => {
		await initializeWallet();
		walletManager.markExpectingInbound();

		const tab = page.url.searchParams.get('tab');
		if (tab === 'receive') {
			showReceiveModal = true;
		}
	});

	let hasErrors = $derived($walletStore.error || $rskConnection.error);

	// Modal state for new UX
	let showReceiveModal = $state(false);
	let showSendModal = $state(false);
	let showBuySell = $state(false);
	let showSwap = $state(false);
	let showTransactionsModal = $state(false);

	// Centralized Payment Request Modal state
	let paymentRequestModal = $state<{
		isOpen: boolean;
		// Pattern 1: Swap-based
		swapId?: string | null;
		// Pattern 2: Direct payment
		address?: string | null;
		network?: string | null;
		amount?: number | null;
		memo?: string | null;
		chargeFeesToPayer?: boolean;
		totalFees?: number | null;
		// Form state for restoration
		formState?: {
			amount: string;
			unit: 'sats' | 'usd';
			mathExpression: string;
			memo: string;
			selectedNetwork: string;
			chargeFeesToPayer: boolean;
		} | null;
	}>({
		isOpen: false,
		swapId: null,
		address: null,
		network: null,
		amount: null,
		memo: null,
		chargeFeesToPayer: false,
		totalFees: null,
		formState: null
	});

	// Function to open the payment request modal (supports both patterns)
	function openPaymentRequestModal(data: {
		swapId?: string;
		address?: string;
		network?: string;
		amount?: number;
		memo?: string;
		chargeFeesToPayer?: boolean;
		totalFees?: number;
		formState?: {
			amount: string;
			unit: 'sats' | 'usd';
			mathExpression: string;
			memo: string;
			selectedNetwork: string;
			chargeFeesToPayer: boolean;
		};
	}) {
		paymentRequestModal = {
			isOpen: true,
			...data
		};
	}

	// Function to close the payment request modal
	function closePaymentRequestModal() {
		paymentRequestModal = {
			isOpen: false,
			swapId: null,
			address: null,
			network: null,
			amount: null,
			memo: null,
			chargeFeesToPayer: false,
			totalFees: null,
			formState: null
		};
	}

	// Store receive form state for restoration
	let receiveFormState = $state<{
		amount: string;
		unit: 'sats' | 'usd';
		mathExpression: string;
		memo: string;
		selectedNetwork: string;
		chargeFeesToPayer: boolean;
	} | null>(null);

	// Tab state: 'wallet' | 'connected'
	let activeTab = $state<'wallet' | 'connected'>('wallet');

	// Connected wallet total USD (used on Connected tab instead of built-in balance)
	let connectedTotalUsd = $derived.by(() => {
		if ($connectedWalletsStore.wallets.length === 0) return 0;
		let total = 0;
		for (const w of $connectedWalletsStore.wallets) {
			const cur = w.balances;
			if (cur) {
				const btcSats = Number(cur.btc?.raw ?? 0) + Number(cur.rbtc?.raw ?? 0);
				const usdt = Number(cur.usdt?.raw ?? 0) / 1e18;
				total += (btcSats / 100_000_000) * btcPrice.price + usdt;
			}
		}
		return total;
	});

	// BankingMenu event listeners
	let bankingMenuOpen = $state(false);

	function closeBankingMenu() {
		bankingMenuOpen = false;
		(document.getElementById('banking-menu-modal') as HTMLDialogElement)?.close();
	}

	$effect(() => {
		if (!bankingMenuOpen) return;
		const el = document.getElementById('banking-menu-modal');
		if (!el) return;

		function handleSend() {
			closeBankingMenu();
			showSendModal = true;
		}
		function handleReceive() {
			closeBankingMenu();
			showReceiveModal = true;
		}
		function handleBuy() {
			closeBankingMenu();
			// Delay by one frame so the browser finishes removing the
			// <dialog> from the top layer before the Drawer mounts.
			requestAnimationFrame(() => (showBuySell = true));
		}
		function handleSell() {
			closeBankingMenu();
			requestAnimationFrame(() => (showBuySell = true));
		}
		function handleSwap() {
			closeBankingMenu();
			showSwap = true;
		}

		el.addEventListener('banking:send', handleSend);
		el.addEventListener('banking:receive', handleReceive);
		el.addEventListener('banking:buy', handleBuy);
		el.addEventListener('banking:sell', handleSell);
		el.addEventListener('banking:swap', handleSwap);

		return () => {
			el.removeEventListener('banking:send', handleSend);
			el.removeEventListener('banking:receive', handleReceive);
			el.removeEventListener('banking:buy', handleBuy);
			el.removeEventListener('banking:sell', handleSell);
			el.removeEventListener('banking:swap', handleSwap);
		};
	});
</script>

<svelte:head>
	<title>{$t('wallet.title')} | BitTasker</title>
</svelte:head>

<div class="bg-base-100 mx-auto max-w-6xl rounded-lg px-2 py-6 shadow-lg md:px-0 md:py-0">
	<div class="flex h-full flex-col p-3 sm:p-6">
		{#if $rskConnection.connecting}
			<div class="alert alert-outline alert-info mb-3 py-2 sm:mb-6 sm:py-4">
				<div class="flex items-center">
					<span class="loading loading-spinner loading-sm mr-2"></span>
					<span>{$t('wallet.connecting')}</span>
				</div>
			</div>
		{:else if hasErrors}
			<div class="alert alert-outline alert-error mb-3 py-2 sm:mb-6 sm:py-4">
				<div class="flex w-full items-center justify-between">
					<div class="flex items-center">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mr-2 h-6 w-6 shrink-0 stroke-current"
							fill="none"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<div>
							<div class="font-bold">{$t('wallet.page.connection_error')}</div>
							<div class="text-sm">
								{#if $rskConnection.error?.includes('No mnemonic found')}
									{$t('wallet.page.no_wallet_setup')}
								{:else if $rskConnection.error}
									RSK: {$rskConnection.error}
								{/if}
							</div>
						</div>
					</div>
					<button
						class="btn btn-outline btn-sm ml-4"
						onclick={async () => {
							await initializeWallet();
						}}
					>
						{$t('wallet.page.retry_connection')}
					</button>
				</div>
			</div>
		{/if}

		<!-- Testnet Warning Alert -->
		{#if $appStore.network === 'testnet'}
			<div class="alert alert-outline alert-warning mb-3 py-2 sm:mb-6 sm:py-4">
				<div class="flex items-center">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mr-2 h-5 w-5 shrink-0 stroke-current sm:mr-3 sm:h-6 sm:w-6"
						fill="none"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
						/>
					</svg>
					<div class="flex-1">
						<div class="text-warning text-center text-sm font-bold sm:text-base">
							{$t('wallet.testnet_warning.title')}
						</div>
						<div class="text-xs sm:text-sm">
							<strong>{$t('wallet.testnet_warning.do_not_send_real_assets')}</strong>
							{$t('wallet.testnet_warning.description')}
						</div>
						<!-- User's Testnet Address -->
						{#if $rskConnection.address}
							<div class="bg-base-200 mt-2 rounded-lg p-2 sm:mt-3 sm:p-3">
								<div class="mb-1 text-xs font-medium sm:mb-2 sm:text-sm">
									{$t('wallet.testnet_warning.your_address')}
								</div>
								<div class="flex items-center gap-2">
									<input
										type="text"
										value={$rskConnection.address}
										readonly
										class="input input-sm flex-1 font-mono text-xs"
									/>
									<button
										class="btn btn-sm btn-outline"
										onclick={() => {
											triggerHaptic(ImpactStyle.Light);
											copyToClipboard($rskConnection.address || '');
											appStore.showSuccessToast($t('wallet.address_copied'));
										}}
										title={$t('wallet.testnet_warning.copy_address')}
										aria-label={$t('wallet.testnet_warning.copy_address')}
									>
										<IconContentCopy class="h-4 w-4" />
									</button>
								</div>
							</div>
						{/if}

						<div class="mt-1.5 text-xs sm:mt-2 sm:text-sm">
							{$t('wallet.testnet_warning.faucet_instruction')}
							<a
								href="https://faucet.rootstock.io/"
								target="_blank"
								rel="noopener noreferrer"
								class="link link-primary font-semibold"
							>
								{$t('wallet.testnet_warning.faucet_link_text')}
							</a>
							{$t('wallet.testnet_warning.faucet_instruction_end')}
						</div>
					</div>
				</div>
			</div>
		{/if}

		{#if $walletStore.isConnected || !hasErrors}
			<!-- Tab Bar (only shown when connected wallets feature is enabled) -->
			{#if walletsEnabled}
				<div
					class="tabs tabs-boxed tabs-reversed border-base-300 mb-3 shrink-0 overflow-hidden rounded-lg border sm:mb-4"
				>
					<button
						class="tab flex-1"
						class:bg-primary={activeTab === 'wallet'}
						class:text-primary-content={activeTab === 'wallet'}
						class:tab-active={activeTab === 'wallet'}
						onclick={() => (activeTab = 'wallet')}
					>
						<IconWallet class="mr-1 h-4 w-4" />
						{$t('wallet.tab_wallet')}
					</button>
					<button
						class="tab flex-1"
						class:bg-primary={activeTab === 'connected'}
						class:text-primary-content={activeTab === 'connected'}
						class:tab-active={activeTab === 'connected'}
						onclick={() => (activeTab = 'connected')}
					>
						<IconCellphoneLink class="mr-1 h-4 w-4" />
						{$t('wallet.tab_connected')}
					</button>
				</div>
			{/if}

			<!-- Balance Card -->
			<div class="flex h-full flex-col space-y-3 overflow-y-auto sm:space-y-4">
				<BalanceCard
					{isLoading}
					hideDetails={activeTab === 'connected'}
					overrideTotalUsd={activeTab === 'connected' ? connectedTotalUsd : null}
				/>

				<!-- Transactions Button (Wallet tab only) -->
				{#if !walletsEnabled || activeTab === 'wallet'}
					<div>
						<button
							type="button"
							class="collapse-title border-primary bg-base-100 hover:bg-base-200 flex min-h-0 w-full items-center justify-between rounded-lg border-2 px-3 py-2 pr-10 text-left text-sm font-medium transition-colors sm:px-4 sm:py-3 sm:pr-12 sm:text-base"
							onclick={() => (showTransactionsModal = true)}
						>
							<div class="flex min-w-0 flex-1 items-center gap-2">
								<IconFormatListBulleted class="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
								<span>{$t('wallet.tab_transactions')}</span>
							</div>
							<div class="absolute right-2 flex items-center sm:right-3">
								<IconChevronRight class="h-5 w-5 shrink-0 sm:h-6 sm:w-6" />
							</div>
						</button>
					</div>
				{/if}

				<!-- Connected tab: explanatory card (only when no wallets) -->
				{#if activeTab === 'connected' && $connectedWalletsStore.wallets.length === 0}
					<div class="card bg-base-200 rounded-box p-5">
						<div class="card-body items-center gap-3 px-2 py-0 text-center">
							<IconBankOutline class="text-base-content h-8 w-8" />
							<p class="text-xs leading-relaxed">
								Think of connected wallets like your bank — they're where you store larger amounts
								securely, accessible via MetaMask, Ledger, or Trezor.
							</p>
							<p class="text-xs leading-relaxed">
								Your BitTasker wallet is for daily tasks like sending, swapping, and receiving small
								amounts.
							</p>
							<!-- Connect a Wallet button (above action buttons) -->
							<button
								class="btn btn-outline btn-primary btn-block min-h-[44px] text-sm sm:text-base"
								onclick={() => {
									const connectedSection = document.querySelector(
										'[data-connect-button]'
									) as HTMLButtonElement;
									connectedSection?.click();
								}}
							>
								<svg class="mr-1 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 4v16m8-8H4"
									/></svg
								>
								{$t('wallet.connected.connect_modal_title')}
							</button>
						</div>
					</div>
				{/if}

				<!-- Send and Receive Buttons (always visible) -->
				<div class="flex flex-row gap-2 sm:gap-4">
					<button
						class="btn btn-primary order-1 min-h-[44px] flex-1 py-2 text-sm sm:order-1 sm:py-3 sm:text-base"
						onclick={() => (showReceiveModal = true)}
					>
						<IconDownload class="mr-1 h-4 w-4 sm:mr-2 sm:h-5 sm:w-5" />
						{$t('wallet.tab_receive')}
					</button>
					<button
						class="btn btn-secondary order-2 min-h-[44px] flex-1 py-2 text-sm sm:order-2 sm:py-3 sm:text-base"
						onclick={() => (showSendModal = true)}
					>
						<IconUpload class="mr-1 h-4 w-4 sm:mr-2 sm:h-5 sm:w-5" />
						{$t('wallet.send_button')}
					</button>
				</div>

				<!-- Swap / BuySell Buttons (always visible) -->
				<div class="flex flex-row gap-2 sm:gap-4">
					<button
						class="btn btn-outline border-primary min-h-[44px] flex-1 py-2 text-sm transition-none active:scale-100 sm:py-3 sm:text-base"
						onclick={() => (showSwap = true)}
					>
						<IconSwapHorizontal class="mr-1 h-4 w-4 sm:mr-2 sm:h-5 sm:w-5" />
						{$t('wallet.tab_swap')}
					</button>
					<button
						class="btn btn-outline border-primary min-h-[44px] flex-1 py-2 text-sm transition-none active:scale-100 sm:py-3 sm:text-base"
						onclick={() => (showBuySell = true)}
					>
						<IconCash class="mr-1 h-4 w-4 sm:mr-2 sm:h-5 sm:w-5" />
						{$t('wallet.tab_buy_sell')}
					</button>
				</div>

				<!-- Connected Wallet List (only on connected tab, below all buttons) -->
				{#if activeTab === 'connected'}
					<ConnectedWallets
						onSend={() => (showSendModal = true)}
						onReceive={() => (showReceiveModal = true)}
						onSwap={() => (showSwap = true)}
						onBuySell={() => (showBuySell = true)}
					/>
				{/if}

				<!-- Learn More — centered below all buttons, always visible -->
				<div class="flex justify-center pb-4">
					<button
						class="btn btn-ghost btn-sm text-base-content/50 gap-1 text-xs"
						onclick={() => {
							(document.querySelector('[data-help-modal]') as HTMLButtonElement)?.click();
						}}
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/></svg
						>
						{$t('wallet.learn_more')}
					</button>
				</div>
			</div>
		{:else}
			<!-- No wallets connected - show setup options -->
			<div class="py-12 text-center">
				<div class="mb-6">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-base-content/30 mx-auto h-16 w-16"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="1"
							d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
						/>
					</svg>
				</div>
				<h3 class="mb-4 text-xl font-semibold">{$t('wallet.error.no_mnemonic.title')}</h3>
				<p class="text-base-content/70 mx-auto mb-6 max-w-md">
					{$t('wallet.error.no_mnemonic.message')}
				</p>
				<div class="flex justify-center gap-4">
					<button class="btn btn-primary" onclick={async () => await initializeWallet()}>
						{$t('wallet.error.no_mnemonic.try_again')}
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- Banking Menu Modal -->
<BankingMenu onclose={closeBankingMenu} />

<!-- Buy/Sell Drawer -->
<BuySellForm isOpen={showBuySell} onClose={() => (showBuySell = false)} />

<!-- Swap Drawer -->
<SwapForm isOpen={showSwap} onClose={() => (showSwap = false)} />

<!-- New UX Modals -->
<WalletPaymentModal isOpen={showReceiveModal} onClose={() => (showReceiveModal = false)}>
	<ReceivePaymentForm
		onCancel={() => {
			showReceiveModal = false;
			receiveFormState = null; // Clear form state on cancel
		}}
		onOpenPaymentRequest={(data) => {
			// Store form state for restoration
			if (data.formState) {
				receiveFormState = data.formState;
			}
			showReceiveModal = false; // Close receive form
			openPaymentRequestModal(data); // Open payment request modal
		}}
		initialFormState={receiveFormState
			? {
					...receiveFormState,
					// For Rootstock, go to step 1 (network selector); for others, go to step 2 (details)
					currentStep: (receiveFormState.selectedNetwork === 'rootstock-bitcoin' ||
					receiveFormState.selectedNetwork === 'usdt-bsc'
						? 1
						: 2) as 1 | 2
				}
			: undefined}
	/>
</WalletPaymentModal>

<WalletPaymentModal isOpen={showSendModal} onClose={() => (showSendModal = false)}>
	<SendPaymentForm
		onCancel={() => (showSendModal = false)}
		onSuccess={(txHash, network) => {
			// Handle send success
			console.log('Payment sent:', txHash, network);
			showSendModal = false;
		}}
	/>
</WalletPaymentModal>

<WalletPaymentModal isOpen={showTransactionsModal} onClose={() => (showTransactionsModal = false)}>
	<div class="mb-4 hidden items-center justify-between lg:flex">
		<h2 class="text-2xl font-bold">{$t('wallet.tab_transactions')}</h2>
		<button
			class="btn btn-ghost btn-sm btn-circle"
			onclick={() => (showTransactionsModal = false)}
			aria-label="Close transactions modal"
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
	<TransactionHistory
		onOpenPaymentRequest={(swapId) => {
			showTransactionsModal = false; // Close transactions modal
			openPaymentRequestModal({ swapId }); // Open payment request modal with swap
		}}
		onClose={() => (showTransactionsModal = false)}
	/>
</WalletPaymentModal>

<!-- Centralized Payment Request Modal -->
{#if paymentRequestModal.isOpen && (paymentRequestModal.swapId || paymentRequestModal.address)}
	<WalletPaymentModal isOpen={paymentRequestModal.isOpen} onClose={closePaymentRequestModal}>
		<PaymentRequestModal
			isOpen={paymentRequestModal.isOpen}
			swapId={paymentRequestModal.swapId ?? undefined}
			address={paymentRequestModal.address ?? undefined}
			network={paymentRequestModal.network ?? undefined}
			amount={paymentRequestModal.amount ?? undefined}
			memo={paymentRequestModal.memo ?? undefined}
			chargeFeesToPayer={paymentRequestModal.chargeFeesToPayer}
			totalFees={paymentRequestModal.totalFees ?? undefined}
			onClose={closePaymentRequestModal}
			onEdit={() => {
				// Close payment request modal and reopen receive form with saved state
				// Form state is already stored in paymentRequestModal.formState
				if (paymentRequestModal.formState) {
					receiveFormState = paymentRequestModal.formState;
				}
				closePaymentRequestModal();
				showReceiveModal = true;
			}}
		/>
	</WalletPaymentModal>
{/if}
