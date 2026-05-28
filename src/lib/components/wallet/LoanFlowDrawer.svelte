<script lang="ts">
	import { browser } from '$app/environment';
	import { t } from 'svelte-i18n';
	import { onDestroy } from 'svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import { walletStore } from '$lib/stores/wallet.store';
	import { tryCatch } from '$lib/utils/tryCatch';

	// Lazy-loaded — ethers/wallet-core are browser-only and crash SSR
	let loanFeeEstimator:
		| (typeof import('$lib/services/loan-fee-estimator'))['loanFeeEstimator']
		| null = null;
	import('$lib/services/loan-fee-estimator').then((mod) => {
		loanFeeEstimator = mod.loanFeeEstimator;
	});
	import LoanInputStep from './loan/LoanInputStep.svelte';
	import LoanReviewStep from './loan/LoanReviewStep.svelte';
	import LoanExecutingStep from './loan/LoanExecutingStep.svelte';
	import LoanCompleteStep from './loan/LoanCompleteStep.svelte';
	import LoanErrorStep from './loan/LoanErrorStep.svelte';
	import type { FeeItem, ExecStep } from './loan/types';
	import ExistingLoansTab from './loan/ExistingLoansTab.svelte';
	import LoanRedemptionFlow from './loan/LoanRedemptionFlow.svelte';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import type { DocWalletEntry } from './loan/types';

	// Props
	let { isOpen, onClose }: { isOpen: boolean; onClose: () => void } = $props();

	// State
	let step = $state<'input' | 'review' | 'executing' | 'complete' | 'error'>('input');
	let inputAmount = $state('');
	let estimatedRbtcNeeded = $state('0');
	let estimatedArbReceive = $state('0');
	let feeBreakdown = $state<FeeItem[]>([]);
	let executionSteps = $state<ExecStep[]>([]);
	let errorMessage = $state('');
	let errorType = $state<'mint' | 'swap' | 'bridge' | 'timeout' | 'generic'>('generic');
	let finalTxHash = $state('');
	let finalAmount = $state('');
	let isSubmitting = $state(false);
	let quoteExpiresAt = $state(0);
	let elapsedSeconds = $state(0);

	let activeTab = $state<'new' | 'existing'>('existing');
	let activeRedemptionWallet = $state<DocWalletEntry | null>(null);
	let redemptionToken = $state(0); // increment to force re-render on new redemption

	// Aggregate DOC balances across all wallets for the Existing Loans tab
	let docWallets = $derived.by((): DocWalletEntry[] => {
		const wallets: DocWalletEntry[] = [];
		const allAssets = $walletStore.assets || [];

		// Built-in wallet DOC balance
		const docAsset = allAssets.find((a) => a.assetId === 'doc-rsk');
		const docBalance = docAsset?.balance ?? 0;
		if (docBalance > 0) {
			wallets.push({
				walletId: 'builtin',
				walletName: $t('wallet.loan.existing_builtin_label'),
				walletType: 'builtin',
				docBalance,
				balanceAvailable: true
			});
		}

		// Connected wallets (DOC not yet polled, show as unavailable)
		const connected = $connectedWalletsStore.wallets || [];
		for (const cw of connected) {
			wallets.push({
				walletId: cw.id,
				walletName: cw.walletName || cw.walletType || 'Connected Wallet',
				walletType: cw.walletType as DocWalletEntry['walletType'],
				docBalance: 0,
				balanceAvailable: false,
				address: cw.address
			});
		}

		return wallets;
	});

	let docLoading = $derived(false); // DOC is already loaded from allAssets

	// Derived: RBTC balance
	let rbtcBalance = $derived(parseFloat($walletStore.rsk?.formattedBalance || '0'));

	// Quote countdown timer
	let quoteTimer: ReturnType<typeof setInterval> | null = null;
	let remainingSeconds = $state(30);

	function startQuoteTimer() {
		clearQuoteTimer();
		quoteExpiresAt = Date.now() + 30000;
		remainingSeconds = 30;
		quoteTimer = setInterval(() => {
			const left = Math.max(0, Math.ceil((quoteExpiresAt - Date.now()) / 1000));
			remainingSeconds = left;
			if (left <= 0) {
				clearQuoteTimer();
				// Auto-refresh: re-fetch estimate when quote expires
				if (inputAmount && parseFloat(inputAmount) > 0) {
					fetchEstimate(inputAmount);
				}
			}
		}, 1000);
	}

	function clearQuoteTimer() {
		if (quoteTimer) {
			clearInterval(quoteTimer);
			quoteTimer = null;
		}
	}

	// Elapsed timer for executing step
	let elapsedTimer: ReturnType<typeof setInterval> | null = null;

	function startElapsedTimer() {
		elapsedSeconds = 0;
		elapsedTimer = setInterval(() => {
			elapsedSeconds++;
		}, 1000);
	}

	function clearElapsedTimer() {
		if (elapsedTimer) {
			clearInterval(elapsedTimer);
			elapsedTimer = null;
		}
	}

	// Debounce timeout for fetchEstimate
	let estimateTimeout: ReturnType<typeof setTimeout> | null = null;

	onDestroy(() => {
		clearQuoteTimer();
		clearElapsedTimer();
		if (estimateTimeout) clearTimeout(estimateTimeout);
	});

	// Reset all state when drawer closes
	function handleClose() {
		if (isSubmitting) return;
		clearQuoteTimer();
		clearElapsedTimer();
		if (estimateTimeout) {
			clearTimeout(estimateTimeout);
			estimateTimeout = null;
		}
		step = 'input';
		inputAmount = '';
		estimatedRbtcNeeded = '0';
		estimatedArbReceive = '0';
		feeBreakdown = [];
		executionSteps = [];
		errorMessage = '';
		errorType = 'generic';
		finalTxHash = '';
		finalAmount = '';
		isSubmitting = false;
		quoteExpiresAt = 0;
		elapsedSeconds = 0;
		remainingSeconds = 30;
		activeTab = 'existing';
		activeRedemptionWallet = null;
		onClose();
	}

	function switchTab(tab: 'new' | 'existing') {
		if (tab === activeTab) return;
		activeTab = tab;
		activeRedemptionWallet = null;
		// Reset new loan wizard if switching away
		if (tab === 'existing') {
			clearQuoteTimer();
			clearElapsedTimer();
			step = 'input';
			inputAmount = '';
			feeBreakdown = [];
			errorMessage = '';
		}
	}

	function handlePayOff(wallet: DocWalletEntry) {
		activeRedemptionWallet = wallet;
		redemptionToken++;
	}

	function handleRedemptionBack() {
		activeRedemptionWallet = null;
	}

	function handleRedemptionComplete(_txHash: string, _rbtcReceived: string) {
		// Show success and go back to existing loans tab
		activeRedemptionWallet = null;
		// Toast will be handled by the parent page
	}

	let formattedElapsed = $derived.by(() => {
		const mins = Math.floor(elapsedSeconds / 60);
		const secs = elapsedSeconds % 60;
		if (mins > 0) return `${mins}m ${secs}s`;
		return `${secs}s`;
	});

	// Amount input handler (called by LoanInputStep)
	function handleAmountInput(value: string) {
		inputAmount = value;
		if (value && parseFloat(value) > 0) {
			debouncedFetchEstimate(value);
		}
	}

	function debouncedFetchEstimate(amount: string) {
		if (estimateTimeout) clearTimeout(estimateTimeout);
		estimateTimeout = setTimeout(() => fetchEstimate(amount), 300);
	}

	async function fetchEstimate(amount: string) {
		const num = parseFloat(amount);
		if (isNaN(num) || num <= 0) return;

		// Show loading skeletons
		feeBreakdown = [
			{ label: $t('wallet.loan.fee_doc_mint'), amount: '', loading: true },
			{ label: $t('wallet.loan.fee_doc_swap'), amount: '', loading: true },
			{ label: $t('wallet.loan.fee_bridge'), amount: '', loading: true },
			{ label: $t('wallet.loan.fee_gas'), amount: '', loading: true }
		];

		// Get real estimates from services
		const wallet = $walletStore.rsk?.wallet;
		const provider = $walletStore.rsk?.provider;

		if (!wallet || !provider) {
			errorMessage = $t('wallet.loan.error_wallet_not_initialized');
			return;
		}

		if (!loanFeeEstimator) {
			// Fee estimator module still loading — retry next input
			return;
		}

		const { data: estimate, error } = await tryCatch(
			loanFeeEstimator.estimateFees({
				usdAmount: amount,
				signer: wallet,
				provider: provider
			})
		);
		console.log('[LoanFlow] estimateFees result:', { data: !!estimate, error: !!error });

		if (error || !estimate) {
			console.error('Fee estimation failed:', error);
			// Keep the skeleton rows so the section stays visible, clear loading indicators
			feeBreakdown = feeBreakdown.map((f) => ({ ...f, loading: false, amount: '—' }));
			errorMessage =
				error instanceof Error ? error.message : $t('wallet.loan.error_estimate_failed');
			return;
		}

		// Update state with real values
		// Map service-internal labels to i18n keys for UI display
		const serviceLabelMap: Record<string, string> = {
			'DOC Mint Fee': $t('wallet.loan.fee_doc_mint'),
			'Swap Impact/Fee': $t('wallet.loan.fee_doc_swap'),
			'Bridge Fee': $t('wallet.loan.fee_bridge'),
			'Gas Fee': $t('wallet.loan.fee_gas')
		};
		feeBreakdown = estimate.fees.map((f) => ({
			...f,
			label: serviceLabelMap[f.label] || f.label
		}));
		estimatedRbtcNeeded = estimate.totalRbtcNeeded;
		estimatedArbReceive = estimate.estimatedArbReceive;
		quoteExpiresAt = Date.now() + estimate.quoteExpiresIn * 1000;
		startQuoteTimer();
	}

	function goToReview() {
		if (!inputAmount || parseFloat(inputAmount) <= 0) return;
		step = 'review';
	}

	function goToInput() {
		step = 'input';
	}

	async function handleConfirm() {
		isSubmitting = true;
		step = 'executing';
		startElapsedTimer();

		executionSteps = [
			{ id: 'mint', label: $t('wallet.loan.executing_step_collateralize'), status: 'active' },
			{ id: 'swap', label: $t('wallet.loan.executing_step_convert'), status: 'pending' },
			{ id: 'bridge', label: $t('wallet.loan.executing_step_send'), status: 'pending' }
		];

		// Simulate step 1: minting
		await new Promise((r) => setTimeout(r, 1500));
		executionSteps = executionSteps.map((s) =>
			s.id === 'mint' ? { ...s, status: 'complete' } : s
		);
		executionSteps = executionSteps.map((s) => (s.id === 'swap' ? { ...s, status: 'active' } : s));

		// Simulate step 2: swapping
		await new Promise((r) => setTimeout(r, 1500));
		executionSteps = executionSteps.map((s) =>
			s.id === 'swap' ? { ...s, status: 'complete' } : s
		);
		executionSteps = executionSteps.map((s) =>
			s.id === 'bridge' ? { ...s, status: 'active' } : s
		);

		// Simulate step 3: bridging
		await new Promise((r) => setTimeout(r, 2000));
		executionSteps = executionSteps.map((s) =>
			s.id === 'bridge' ? { ...s, status: 'complete' } : s
		);

		clearElapsedTimer();
		finalAmount = estimatedArbReceive;
		finalTxHash = '0x' + Math.random().toString(16).slice(2, 42);
		step = 'complete';
		isSubmitting = false;
	}

	function handleRefreshQuote() {
		if (inputAmount && parseFloat(inputAmount) > 0) {
			fetchEstimate(inputAmount);
		}
	}

	function handleDone() {
		handleClose();
	}

	// Error step callbacks
	function handleRetryExecution() {
		step = 'executing';
		handleConfirm();
	}

	function handleSwapManually() {
		if (browser) window.open('https://app.openocean.finance/swap/rootstock/DOC/USDT0', '_blank');
	}

	function handleResetInput() {
		step = 'input';
		inputAmount = '';
	}

	function handleKeepAsUsdt0() {
		if (browser) window.open('https://usdt0.to/transfer', '_blank');
	}

	// Computed values
	let totalFees = $derived.by(() => {
		if (feeBreakdown.length === 0) return '$0.00';
		const sum = feeBreakdown.reduce((acc, f) => {
			const num = parseFloat(f.amount.replace('$', ''));
			return acc + (isNaN(num) ? 0 : num);
		}, 0);
		return `$${sum.toFixed(2)}`;
	});

	let hasInsufficientRbtc = $derived.by(() => {
		const needed = parseFloat(estimatedRbtcNeeded);
		return needed > rbtcBalance && inputAmount !== '' && parseFloat(inputAmount) > 0;
	});

	let canProceed = $derived(
		inputAmount !== '' && parseFloat(inputAmount) > 0 && !hasInsufficientRbtc
	);

	let progressPercent = $derived.by(() => {
		if (executionSteps.length === 0) return 0;
		const complete = executionSteps.filter((s) => s.status === 'complete').length;
		const active = executionSteps.filter((s) => s.status === 'active').length;
		const total = executionSteps.length;
		return Math.round(((complete + (active > 0 ? 0.5 : 0)) / total) * 100);
	});

	let isBridgeDelayed = $derived(elapsedSeconds > 180);
</script>

<Drawer
	{isOpen}
	onClose={handleClose}
	title={$t('wallet.loan.title')}
	position="right"
	isScrollable={true}
	{isSubmitting}
>
	<!-- Tab Bar -->
	<div
		class="tabs tabs-boxed border-base-300 mb-1 shrink-0 overflow-hidden rounded-lg border sm:mb-2"
		role="tablist"
	>
		<button
			class="tab min-h-[44px] flex-1"
			class:bg-primary={activeTab === 'existing'}
			class:text-primary-content={activeTab === 'existing'}
			class:tab-active={activeTab === 'existing'}
			role="tab"
			aria-selected={activeTab === 'existing'}
			onclick={() => switchTab('existing')}
		>
			{$t('wallet.loan.tab_existing_loans')}
		</button>
		<button
			class="tab min-h-[44px] flex-1"
			class:bg-primary={activeTab === 'new'}
			class:text-primary-content={activeTab === 'new'}
			class:tab-active={activeTab === 'new'}
			role="tab"
			aria-selected={activeTab === 'new'}
			onclick={() => switchTab('new')}
		>
			{$t('wallet.loan.tab_new_loan')}
		</button>
	</div>

	{#if activeTab === 'new'}
		<div class="flex flex-col gap-4">
			{#if step === 'input'}
				<LoanInputStep
					bind:inputAmount
					{feeBreakdown}
					{remainingSeconds}
					{hasInsufficientRbtc}
					{estimatedRbtcNeeded}
					{estimatedArbReceive}
					{totalFees}
					{canProceed}
					onAmountInput={handleAmountInput}
					onNext={goToReview}
				/>
			{:else if step === 'review'}
				<LoanReviewStep
					{estimatedRbtcNeeded}
					{estimatedArbReceive}
					{totalFees}
					{remainingSeconds}
					{isSubmitting}
					onConfirm={handleConfirm}
					onBack={goToInput}
					onRefreshQuote={handleRefreshQuote}
				/>
			{:else if step === 'executing'}
				<LoanExecutingStep
					{executionSteps}
					{progressPercent}
					{formattedElapsed}
					{isBridgeDelayed}
				/>
			{:else if step === 'complete'}
				<LoanCompleteStep {finalAmount} {finalTxHash} onDone={handleDone} />
			{:else if step === 'error'}
				<LoanErrorStep
					{errorType}
					{errorMessage}
					onRetryExecution={handleRetryExecution}
					onSwapManually={handleSwapManually}
					onResetInput={handleResetInput}
					onKeepAsUsdt0={handleKeepAsUsdt0}
					onDismiss={handleClose}
				/>
			{/if}
		</div>
	{:else if activeRedemptionWallet}
		<!-- Redemption sub-flow -->
		<LoanRedemptionFlow
			key={redemptionToken}
			wallet={activeRedemptionWallet}
			maxDocBalance={activeRedemptionWallet.docBalance}
			onBack={handleRedemptionBack}
			onComplete={handleRedemptionComplete}
		/>
	{:else}
		<!-- Existing Loans tab -->
		<ExistingLoansTab
			{docWallets}
			isLoading={docLoading}
			onPayOff={handlePayOff}
			onRequestNewLoan={() => switchTab('new')}
		/>
	{/if}
</Drawer>
