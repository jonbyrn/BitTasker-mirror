<script lang="ts">
	// Import polyfills FIRST before any other imports that might use Buffer/bitcoinjs-lib
	import '$lib/polyfills';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { page } from '$app/state';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import { appStore } from '$lib/stores/app.store';
	import { walletManager, rskConnection, walletStore } from '$lib/stores/wallet.store';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import BalanceCard from '$lib/components/wallet/BalanceCard.svelte';
	import TransactionHistory from '$lib/components/wallet/TransactionHistory.svelte';
	import WalletPaymentModal from '$lib/components/wallet/WalletPaymentModal.svelte';
	import UnknownTokensCard from '$lib/components/wallet/UnknownTokensCard.svelte';
	import ReceivePaymentForm from '$lib/components/wallet/ReceivePaymentForm.svelte';
	import SendPaymentForm from '$lib/components/wallet/SendPaymentForm.svelte';
	import IconContentCopy from '~icons/mdi/content-copy';
	import IconDownload from '~icons/mdi/download';
	import IconUpload from '~icons/mdi/upload';
	import IconSwapHorizontal from '~icons/mdi/swap-horizontal';
	import IconCash from '~icons/mdi/cash';
	import IconBankOutline from '~icons/mdi/bank-outline';
	import IconWallet from '~icons/mdi/wallet';
	import IconCellphoneLink from '~icons/mdi/usb-flash-drive';
	import IconCloseCircle from '~icons/mdi/close-circle';
	import IconAlertCircle from '~icons/mdi/alert-circle';
	import IconPlus from '~icons/mdi/plus';
	import IconInformationOutline from '~icons/mdi/information-outline';
	import IconClose from '~icons/mdi/close';
	import IconHandCoin from '~icons/mdi/hand-coin';
	import IconChartLine from '~icons/mdi/chart-line';
	import PaymentRequestModal from '$lib/components/wallet/PaymentRequestModal.svelte';
	import BankingMenu from '$lib/components/wallet/BankingMenu.svelte';
	import BuySellForm from '$lib/components/wallet/BuySellForm.svelte';
	import SwapForm from '$lib/components/wallet/SwapForm.svelte';
	import BorrowFlowDrawer from '$lib/components/wallet/BorrowFlowDrawer.svelte';
	import EarnFlowDrawer from '$lib/components/wallet/EarnFlowDrawer.svelte';
	import ConnectedWallets from '$lib/components/wallet/ConnectedWallets.svelte';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import HelpModal from '$lib/components/wallet/HelpModal.svelte';
	import BalanceHistory from '$lib/components/wallet/BalanceHistory.svelte';
	import { openHelpModal } from '$lib/runes/helpModal.svelte';
	import PendingClaimBanner from '$lib/components/wallet/PendingClaimBanner.svelte';
	import ConnectedTransactionHistory from '$lib/components/wallet/ConnectedTransactionHistory.svelte';
	import { isConnectedWalletsEnabled, isLoanFlowEnabled } from '$lib/services/kill-switch';
	import {
		removePendingSwap,
		type PendingConnectedSwap
	} from '$lib/services/connected-wallet-reverse-swap';

	let walletsEnabled = $state(isConnectedWalletsEnabled());
	let showConnectModal = $state(false);

	let isLoading = $state(false);
	let balancesHidden = $state(!import.meta.env.DEV);
	let claimableSwaps = $state<PendingConnectedSwap[]>([]);

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

		// Load DeFi positions (Aave V3) if feature enabled
		if (isLoanFlowEnabled()) {
			defiPositions.refreshAllAave().catch((err) => {
				console.error('[wallet] Failed to refresh DeFi positions:', err);
			});
		}

		// Open receive modal if tab=receive is in URL
		const tab = page.url.searchParams.get('tab');
		if (tab === 'receive') {
			showReceiveModal = true;
		}

		// Auto-validate swap chain: check if any COMPLETE swap is actually
		// incomplete on Boltz (e.g., single-hop Boltz chain swaps that were
		// marked COMPLETE before the destination chain claim was processed).
		validateSwapChainState();
	});

	/**
	 * Check the persisted swap chain state against Boltz's actual status.
	 * If a COMPLETE swap is still at transaction.server.confirmed on Boltz,
	 * revert it to PARTIAL so the user can retry the claim.
	 * Also resets COMPLETE swaps that are actually claimed (cleanup).
	 */
	async function validateSwapChainState() {
		try {
			const { getSwapChainState } = await import('$lib/services/swap-chain.service');
			const state = await getSwapChainState();
			if (!state || state.phase === 'IDLE' || !state.swap1Id) return;

			const { BoltzProvider } = await import('$lib/services/BoltzProvider');
			const boltz = new BoltzProvider();
			const boltzStatus = await boltz.getSwapStatus(state.swap1Id);

			if (
				state.phase === 'COMPLETE' &&
				(boltzStatus.status === 'transaction.server.confirmed' ||
					boltzStatus.status === 'transaction.claim.pending')
			) {
				// Swap marked COMPLETE but Boltz hasn't released funds —
				// revert to PARTIAL so it shows in pending swaps
				console.warn(
					'[wallet] Swap %s marked COMPLETE but Boltz status=%s — reverting to PARTIAL',
					state.swap1Id,
					boltzStatus.status
				);
				const { transitionTo } = await import('$lib/services/swap-chain/state');
				await transitionTo(state, 'PARTIAL', {
					error: `Swap not yet complete on Boltz: ${boltzStatus.status}`
				});
			} else if (
				state.phase === 'COMPLETE' &&
				(boltzStatus.status === 'transaction.claimed' ||
					boltzStatus.status === 'transaction.refunded')
			) {
				// Swap truly completed — clean up
				console.log(
					'[wallet] Swap %s confirmed as %s — cleaning up',
					state.swap1Id,
					boltzStatus.status
				);
				const { resetSwapChainState } = await import('$lib/services/swap-chain.service');
				await resetSwapChainState();
			}
		} catch (err) {
			console.warn('[wallet] Swap chain validation failed:', err);
		}
	}

	let hasErrors = $derived($walletStore.error || $rskConnection.error);

	// Modal state for new UX
	let showReceiveModal = $state(false);
	let showSendModal = $state(false);
	let showBuySell = $state(false);
	let showSwap = $state(false);
	let showTransactionsModal = $state(false);
	let showConnectedTransactionsModal = $state(false);

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

	// Connected wallet totals — single-pass aggregation
	let connectedTotals = $derived.by(() => {
		const wallets = $connectedWalletsStore.wallets;
		if (wallets.length === 0) return { usd: 0, sats: 0, usdt: 0, aggSats: 0, aggUsd: 0 };
		let usd = 0;
		let sats = 0;
		let usdt = 0;
		let aggSats = 0;
		for (const w of wallets) {
			const cur = w.balances;
			if (!cur) continue;
			const rbtc = Number(cur.rbtc?.raw ?? 0);
			const wbtc = Number(cur.wbtc?.raw ?? 0);
			const btc = Number(cur.btc?.raw ?? 0);
			const usdt0Arb = Number(cur['usdt0-arb']?.raw ?? 0);
			sats += rbtc + wbtc;
			aggSats += rbtc + btc;
			usd += ((rbtc + wbtc) / 1e8) * btcPrice.price + usdt0Arb / 1e6;
			usdt += usdt0Arb / 1e6;
		}
		return { usd, sats, usdt, aggSats, aggUsd: (aggSats / 1e8) * btcPrice.price };
	});

	// BankingMenu event listeners
	let bankingMenuOpen = $state(false);
	let showBorrow = $state(false);
	let showEarn = $state(false);

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

<div class="bg-base-100 mx-auto max-w-6xl rounded-lg px-2 py-2 shadow-lg md:px-0 md:py-0">
	<div class="flex h-full flex-col p-1 sm:p-6">
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
						<IconCloseCircle class="text-error mr-2 h-6 w-6 shrink-0" />
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
					<IconAlertCircle class="text-warning mr-2 h-5 w-5 shrink-0 sm:mr-3 sm:h-6 sm:w-6" />
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
						onclick={() => {
							activeTab = 'wallet';
							showConnectModal = false;
						}}
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
			<div class="flex h-full flex-col gap-2 overflow-y-auto sm:gap-4">
				{#if activeTab === 'connected' && $connectedWalletsStore.wallets.length > 0}
					<BalanceCard
						{isLoading}
						hideDetails
						{balancesHidden}
						onToggleBalances={(hidden) => (balancesHidden = hidden)}
						overrideTotalUsd={connectedTotals.usd}
						overrideSats={connectedTotals.sats}
						overrideUsdt={connectedTotals.usdt}
					/>
					<!-- Pending Lightning claim banner -->
					{#if claimableSwaps.length > 0}
						<PendingClaimBanner
							claims={claimableSwaps}
							onDismiss={async (swapId) => {
								await removePendingSwap(swapId);
								claimableSwaps = claimableSwaps.filter((s) => s.swapId !== swapId);
							}}
						/>
					{/if}
				{:else if activeTab === 'wallet'}
					<BalanceCard
						{isLoading}
						hideDetails={false}
						{balancesHidden}
						onToggleBalances={(hidden) => (balancesHidden = hidden)}
						onManageLoans={() => (showBorrow = true)}
					/>
				{/if}

				<!-- Activity Accordion (Wallet tab only — built-in wallet data) -->
				{#if activeTab === 'wallet'}
					<div class="divider my-0"></div>
					<BalanceHistory
						{balancesHidden}
						onOpenTransactions={() => (showTransactionsModal = true)}
					/>
				{/if}

				<!-- Connected tab: explanatory card (only when no wallets) -->
				{#if activeTab === 'connected' && $connectedWalletsStore.wallets.length === 0}
					<div class="card bg-base-200 rounded-box p-5">
						<div class="card-body items-center gap-3 px-2 py-0 text-center">
							<IconBankOutline class="text-base-content h-8 w-8" />
							<p class="text-xs leading-relaxed">
								{$t('wallet.connected.explanation')}
							</p>
							<!-- Connect a Wallet button (above action buttons) -->
							<button
								class="btn btn-outline btn-primary btn-block min-h-[44px] text-sm sm:text-base"
								onclick={() => (showConnectModal = true)}
							>
								<IconPlus class="mr-1 h-5 w-5" />
								{$t('wallet.connected.connect_modal_title')}
							</button>
						</div>
					</div>
				{/if}

				<!-- Connected Wallet List (Connected tab, above buttons) -->
				{#if activeTab === 'connected'}
					<ConnectedWallets {balancesHidden} bind:showConnectModal />

					<UnknownTokensCard wallets={$connectedWalletsStore.wallets} />

					{#if $connectedWalletsStore.wallets.length > 0}
						<div class="divider my-0"></div>

						<!-- Activity Accordion (connected tab — below wallets, above Connect button) -->
						{#key activeTab}
							<BalanceHistory
								{balancesHidden}
								overrideSats={activeTab === 'connected' ? connectedTotals.aggSats : 0}
								overrideUsd={activeTab === 'connected' ? connectedTotals.aggUsd : 0}
								overrideAddress={activeTab === 'connected'
									? $connectedWalletsStore.wallets[0]?.address || ''
									: ''}
								onOpenTransactions={() => (showConnectedTransactionsModal = true)}
							/>
						{/key}
					{/if}

					<!-- Full-width Connect a Wallet (when wallets exist, below activity accordion) -->
					{#if $connectedWalletsStore.wallets.length > 0}
						<button
							class="btn btn-outline btn-primary btn-block min-h-[44px] text-sm sm:text-base"
							onclick={() => (showConnectModal = true)}
						>
							<IconPlus class="mr-1 h-5 w-5" />
							{$t('wallet.connected.connect')}
						</button>
					{/if}
				{/if}

				{#if activeTab === 'wallet' || $connectedWalletsStore.wallets.length > 0}
					<div class="divider my-0"></div>
				{/if}

				<!-- Action Buttons (all four on one row) -->
				<div class="flex flex-row gap-1">
					<button
						class="btn btn-outline border-primary h-auto min-h-0 flex-1 !flex-col items-center gap-1 rounded-lg px-1.5 py-2 text-xs active:scale-95"
						onclick={() => (showBuySell = true)}
					>
						<span class="inline-flex shrink-0"><IconCash class="h-5 w-5" /></span>
						<span class="leading-tight">{$t('wallet.tab_buy_sell')}</span>
					</button>
					<button
						class="btn btn-outline border-primary h-auto min-h-0 flex-1 !flex-col items-center gap-1 rounded-lg px-1.5 py-2 text-xs active:scale-95"
						onclick={() => (showSwap = true)}
					>
						<span class="inline-flex shrink-0"><IconSwapHorizontal class="h-5 w-5" /></span>
						<span class="leading-tight">{$t('wallet.tab_swap')}</span>
					</button>
					<button
						class="btn btn-secondary border-base-content/30 h-auto min-h-0 flex-1 !flex-col items-center gap-1 rounded-lg border px-1.5 py-2 text-xs active:scale-95"
						onclick={() => (showSendModal = true)}
					>
						<span class="inline-flex shrink-0"><IconUpload class="h-5 w-5" /></span>
						<span class="leading-tight">{$t('wallet.send_button')}</span>
					</button>
					<button
						class="btn btn-primary h-auto min-h-0 flex-1 !flex-col items-center gap-1 rounded-lg px-1.5 py-2 text-xs active:scale-95"
						onclick={() => (showReceiveModal = true)}
					>
						<span class="inline-flex shrink-0"><IconDownload class="h-5 w-5" /></span>
						<span class="leading-tight">{$t('wallet.tab_receive')}</span>
					</button>
				</div>

				<!-- DeFi Buttons (Loans + Earn, one row) — gated by single LOAN_FLOW flag -->
				{#if isLoanFlowEnabled()}
					<div class="flex flex-row gap-1">
						<button
							class="btn btn-outline border-primary h-auto min-h-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-lg px-1.5 py-2.5 text-xs active:scale-95"
							onclick={() => (showBorrow = true)}
						>
							<IconHandCoin class="h-5 w-5 shrink-0" />
							<span class="leading-tight font-medium">{$t('wallet.defi.tab_borrow')}</span>
						</button>
						<button
							class="btn btn-outline border-primary h-auto min-h-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-lg px-1.5 py-2.5 text-xs active:scale-95"
							onclick={() => (showEarn = true)}
						>
							<IconChartLine class="h-5 w-5 shrink-0" />
							<span class="leading-tight font-medium">{$t('wallet.defi.tab_earn')}</span>
						</button>
					</div>
				{/if}

				<!-- Learn More — centered below all buttons, always visible -->
				<div class="flex justify-center pb-4">
					<button
						class="btn btn-ghost btn-sm text-base-content/50 gap-1 text-xs"
						onclick={openHelpModal}
					>
						<IconInformationOutline class="h-4 w-4 shrink-0" />
						{$t('wallet.learn_more')}
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- Banking Menu Modal -->
<BankingMenu onclose={closeBankingMenu} />

<!-- Help Modal (always in DOM so Learn More button works on all tabs) -->
<HelpModal />

<!-- DeFi Drawer (gated by single LOAN_FLOW flag) -->
{#if isLoanFlowEnabled()}
	{#if showBorrow}
		<BorrowFlowDrawer isOpen={showBorrow} onClose={() => (showBorrow = false)} />
	{/if}
	{#if showEarn}
		<EarnFlowDrawer isOpen={showEarn} onClose={() => (showEarn = false)} isSubmitting={false} />
	{/if}
{/if}

<!-- Buy/Sell Drawer -->
<BuySellForm
	isOpen={showBuySell}
	onClose={() => {
		showBuySell = false;
	}}
/>

<!-- Swap Drawer -->
<SwapForm
	isOpen={showSwap}
	onClose={() => {
		showSwap = false;
	}}
/>

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
		initialFormState={(receiveFormState
			? {
					...receiveFormState,
					// For Rootstock, go to step 1 (network selector); for others, go to step 2 (details)
					currentStep: (receiveFormState.selectedNetwork === 'rootstock-bitcoin' ||
					receiveFormState.selectedNetwork === 'usdt-bsc'
						? 1
						: 2) as 1 | 2
				}
			: undefined) as (typeof receiveFormState & { currentStep: 1 | 2 }) | undefined}
	/>
</WalletPaymentModal>

<WalletPaymentModal isOpen={showSendModal} onClose={() => (showSendModal = false)}>
	<SendPaymentForm
		onCancel={() => (showSendModal = false)}
		onSuccess={(_txHash, _network) => {
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
			aria-label={$t('common.close')}
		>
			<IconClose class="h-5 w-5" />
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

<!-- Connected Wallet Transactions Modal -->
<WalletPaymentModal
	isOpen={showConnectedTransactionsModal}
	onClose={() => (showConnectedTransactionsModal = false)}
>
	<ConnectedTransactionHistory
		wallets={$connectedWalletsStore.wallets.map((w) => ({
			id: w.id,
			walletName: w.walletName,
			walletType: w.walletType,
			address: w.address
		}))}
		onClose={() => (showConnectedTransactionsModal = false)}
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
