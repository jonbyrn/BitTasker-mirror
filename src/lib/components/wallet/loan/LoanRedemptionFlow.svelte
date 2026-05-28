<script lang="ts">
	import { t } from 'svelte-i18n';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { walletStore } from '$lib/stores/wallet.store';
	import type { RedemptionFeeEstimate } from '$lib/services/redemption-fee-estimator';
	import type { DocWalletEntry } from './types';

	// ------------------------------------------------------------------
	// Props
	// ------------------------------------------------------------------

	let {
		wallet,
		maxDocBalance,
		onBack,
		onComplete
	}: {
		wallet: DocWalletEntry;
		maxDocBalance: number;
		onBack: () => void;
		onComplete: (txHash: string, rbtcReceived: string) => void;
	} = $props();

	// Destructure wallet fields used in the template
	let { walletName, balanceAvailable, walletId, address } = $derived(wallet);

	// ------------------------------------------------------------------
	// Lazy-loaded imports (ethers/wallet-core are browser-only)
	// ------------------------------------------------------------------
	let redemptionFeeEstimatorModule: typeof import('$lib/services/redemption-fee-estimator') | null =
		null;
	let MoCMintingServiceClass:
		| (typeof import('@bittasker/wallet-core'))['MoCMintingService']
		| null = null;

	import('$lib/services/redemption-fee-estimator').then((mod) => {
		redemptionFeeEstimatorModule = mod;
	});

	import('@bittasker/wallet-core').then((mod) => {
		MoCMintingServiceClass = mod.MoCMintingService;
	});

	// ------------------------------------------------------------------
	// Internal state (Svelte 5 runes)
	// ------------------------------------------------------------------
	let step = $state<'input' | 'review' | 'executing' | 'complete' | 'error'>('input');
	let docAmount = $state('');
	let feeEstimate = $state<RedemptionFeeEstimate | null>(null);
	let feeLoading = $state(false);
	let isSubmitting = $state(false);
	let errorMessage = $state('');
	let finalTxHash = $state('');
	let finalRbtc = $state('');
	let finalRbtcFormatted = $state('0.00000000');

	// ------------------------------------------------------------------
	// Derived: USD value of expected RBTC
	// ------------------------------------------------------------------
	let expectedRbtcUsd = $derived.by(() => {
		if (!feeEstimate) return '0.00';
		const rbtc = parseFloat(feeEstimate.expectedRbtc);
		const price = feeEstimate.rbtcPrice;
		if (isNaN(rbtc) || isNaN(price)) return '0.00';
		return (rbtc * price).toFixed(2);
	});

	// ------------------------------------------------------------------
	// Derived: can proceed
	// ------------------------------------------------------------------
	let canProceed = $derived(docAmount !== '' && parseFloat(docAmount) > 0);

	// ------------------------------------------------------------------
	// Debounce helpers
	// ------------------------------------------------------------------
	let estimateTimeout: ReturnType<typeof setTimeout> | null = null;

	function debouncedFetchEstimate(amount: string) {
		if (estimateTimeout) clearTimeout(estimateTimeout);
		estimateTimeout = setTimeout(() => fetchEstimate(amount), 300);
	}

	async function fetchEstimate(amount: string) {
		const num = parseFloat(amount);
		if (isNaN(num) || num <= 0) {
			feeEstimate = null;
			return;
		}

		const provider = $walletStore.rsk?.provider;
		const signer = $walletStore.rsk?.wallet;
		if (!provider || !signer || !redemptionFeeEstimatorModule) return;

		feeLoading = true;

		let docAmountWei: string;
		try {
			const ethersMod = await import('ethers');
			const { ethers: eth } = ethersMod;
			docAmountWei = eth.parseEther(amount).toString();
		} catch (e) {
			feeLoading = false;
			console.error('Failed to parse DOC amount for fee estimation:', e);
			return;
		}

		const { data: estimate, error } = await tryCatch(
			redemptionFeeEstimatorModule.redemptionFeeEstimator.estimateFees({
				docAmountWei,
				signer,
				provider
			})
		);

		feeLoading = false;

		if (error || !estimate) {
			console.error('Redemption fee estimation failed:', error);
			feeEstimate = null;
			return;
		}

		feeEstimate = estimate;
	}

	// ------------------------------------------------------------------
	// Amount input handler
	// ------------------------------------------------------------------
	function handleAmountInput(value: string) {
		docAmount = value;
		if (value && parseFloat(value) > 0) {
			debouncedFetchEstimate(value);
		} else {
			feeEstimate = null;
		}
	}

	function setMax() {
		docAmount = maxDocBalance.toFixed(2);
		handleAmountInput(docAmount);
	}

	// ------------------------------------------------------------------
	// Step navigation
	// ------------------------------------------------------------------
	function goToReview() {
		if (!canProceed) return;
		step = 'review';
	}

	function goToInput() {
		step = 'input';
	}

	function goToError(message: string) {
		errorMessage = message;
		isSubmitting = false;
		step = 'error';
	}

	// ------------------------------------------------------------------
	// Confirmation logic
	// ------------------------------------------------------------------
	async function handleConfirm() {
		isSubmitting = true;
		step = 'executing';

		const signer = $walletStore.rsk?.wallet;
		if (!signer) {
			goToError('Wallet not available');
			return;
		}

		if (!MoCMintingServiceClass) {
			// wallet-core not loaded yet — wait briefly and retry
			try {
				const mod = await import('@bittasker/wallet-core');
				MoCMintingServiceClass = mod.MoCMintingService;
			} catch {
				goToError($t('wallet.loan.error_wallet_not_initialized'));
				return;
			}
		}

		const moc = new MoCMintingServiceClass();
		moc.getMoCContract(signer);

		let docWei: bigint;
		try {
			const ethersMod = await import('ethers');
			const { ethers: eth } = ethersMod;
			docWei = eth.parseEther(docAmount);
		} catch {
			goToError('Invalid DOC amount');
			return;
		}

		const { data: result, error } = await tryCatch(moc.redeemDoc(docWei.toString(), signer));

		if (error || !result) {
			goToError(
				error instanceof Error ? error.message : $t('wallet.loan.redemption_error_network')
			);
			return;
		}

		finalTxHash = result.txHash;
		finalRbtc = result.rbtcReceived;
		try {
			const ethersMod = await import('ethers');
			const { ethers: eth } = ethersMod;
			finalRbtcFormatted = parseFloat(eth.formatEther(result.rbtcReceived || '0')).toFixed(8);
		} catch {
			finalRbtcFormatted = '0.00000000';
		}
		step = 'complete';
		isSubmitting = false;
	}

	// ------------------------------------------------------------------
	// Complete handler
	// ------------------------------------------------------------------
	function handleDone() {
		onComplete(finalTxHash, finalRbtc);
	}

	// ------------------------------------------------------------------
	// Wallet icon component (inline SVG)
	// ------------------------------------------------------------------
	function walletIconSrc(): string {
		const icons: Record<string, string> = {
			builtin:
				'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
			metamask:
				'M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z',
			walletconnect:
				'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
			trezor:
				'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z',
			ledger:
				'M4 7v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2zm4 0v10m8-10v10M8 7h8M8 17h8'
		};
		return icons[wallet.walletType] ?? icons.builtin;
	}
</script>

<!-- ================================================================= -->
<!-- Step: Input -->
<!-- ================================================================= -->
{#if step === 'input'}
	<div class="flex flex-col gap-4" data-wallet-id={walletId}>
		<!-- Wallet info header -->
		<div class="bg-base-200 rounded-box flex items-center gap-3 p-3">
			<div class="bg-primary/10 rounded-full p-2">
				<svg class="text-primary h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d={walletIconSrc()}
					/>
				</svg>
			</div>
			<div>
				<div class="text-sm font-medium">{walletName}</div>
				{#if address}
					<div class="text-base-content/50 font-mono text-xs">
						...{address.slice(-6)}
					</div>
				{/if}
				<div class="text-base-content/60 text-xs">
					{$t('wallet.loan.existing_doc_balance', {
						values: { amount: maxDocBalance.toFixed(2), usd: maxDocBalance.toFixed(2) }
					})}
				</div>
				{#if !balanceAvailable}
					<div class="text-warning mt-0.5 text-xs">
						{$t('wallet.loan.existing_balance_unavailable')}
					</div>
				{/if}
			</div>
		</div>

		<!-- Amount input with DOC prefix join pattern -->
		<div class="space-y-2">
			<label for="redemption-amount" class="text-sm font-medium">
				{$t('wallet.loan.redemption_amount_label')}
			</label>
			<div class="join w-full">
				<span
					class="btn join-item no-animation bg-base-200 text-base-content/70 min-h-[48px] border-r-0 text-lg"
				>
					DOC
				</span>
				<input
					id="redemption-amount"
					type="number"
					class="input input-bordered join-item min-h-[48px] flex-1 text-lg"
					placeholder="0.00"
					bind:value={docAmount}
					oninput={(e) => handleAmountInput(e.currentTarget.value)}
					min="0"
					step="0.01"
					inputmode="decimal"
				/>
				<button class="btn join-item min-h-[48px] rounded-r-lg" onclick={setMax}>
					{$t('wallet.loan.redemption_max')}
				</button>
			</div>
		</div>

		<!-- Fee estimate (shown once user types) -->
		{#if feeEstimate && !feeLoading}
			<div class="card bg-base-200 rounded-box">
				<div class="card-body space-y-2 p-3">
					<div class="flex justify-between">
						<span class="text-sm">{$t('wallet.loan.redemption_fee_label')}</span>
						<span class="text-sm font-medium">${feeEstimate.mocFeeUsd}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-sm">{$t('wallet.loan.redemption_gas_label')}</span>
						<span class="text-sm font-medium">${feeEstimate.gasCostUsd}</span>
					</div>
					<div class="border-base-300 border-t"></div>
					<div class="flex justify-between">
						<span class="text-sm font-semibold">{$t('wallet.loan.redemption_receive')}</span>
						<span class="text-sm font-semibold">
							{$t('wallet.loan.redemption_receive_rbtc', {
								values: { amount: feeEstimate.expectedRbtc, usd: expectedRbtcUsd }
							})}
						</span>
					</div>
				</div>
			</div>
		{:else if feeLoading}
			<div class="card bg-base-200 rounded-box">
				<div class="card-body p-3">
					<div class="skeleton h-4 w-full rounded"></div>
					<div class="skeleton mt-2 h-4 w-3/4 rounded"></div>
				</div>
			</div>
		{/if}

		<!-- Next button -->
		<button class="btn btn-primary min-h-[44px] w-full" disabled={!canProceed} onclick={goToReview}>
			{$t('wallet.loan.redemption_confirm')}
		</button>
	</div>

	<!-- ================================================================= -->
	<!-- Step: Review -->
	<!-- ================================================================= -->
{:else if step === 'review'}
	{@const amountExceedsBalance = parseFloat(docAmount) > maxDocBalance}
	<div class="flex flex-col gap-4">
		<div class="text-base-content/70 text-sm font-medium">
			{$t('wallet.loan.step_review')}
		</div>

		<!-- Summary card -->
		<div class="card bg-base-200 rounded-box">
			<div class="card-body space-y-2 p-4">
				<div class="flex justify-between">
					<span class="text-sm">{$t('wallet.loan.redemption_amount_label')}</span>
					<span class="text-sm font-medium">{docAmount} DOC</span>
				</div>
				{#if feeEstimate}
					<div class="flex justify-between">
						<span class="text-sm">{$t('wallet.loan.redemption_fee_label')}</span>
						<span class="text-sm font-medium">${feeEstimate.mocFeeUsd}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-sm">{$t('wallet.loan.redemption_gas_label')}</span>
						<span class="text-sm font-medium">${feeEstimate.gasCostUsd}</span>
					</div>
					<div class="border-base-300 border-t"></div>
					<div class="flex justify-between font-semibold">
						<span class="text-sm">{$t('wallet.loan.redemption_receive')}</span>
						<span class="text-sm">
							{$t('wallet.loan.redemption_receive_rbtc', {
								values: { amount: feeEstimate.expectedRbtc, usd: expectedRbtcUsd }
							})}
						</span>
					</div>
				{/if}
			</div>
		</div>

		{#if amountExceedsBalance}
			<div class="text-error text-sm font-medium">
				{$t('wallet.loan.redemption_error_balance')}
			</div>
		{/if}

		<!-- Buttons -->
		<button
			class="btn btn-primary min-h-[44px] w-full text-sm sm:text-base"
			onclick={handleConfirm}
			disabled={isSubmitting || amountExceedsBalance}
		>
			{#if isSubmitting}
				<span class="loading loading-spinner loading-sm"></span>
			{/if}
			{$t('wallet.loan.redemption_confirm')}
		</button>
		<button class="btn btn-ghost min-h-[44px] w-full text-sm sm:text-base" onclick={goToInput}>
			{$t('wallet.loan.redemption_back')}
		</button>
	</div>

	<!-- ================================================================= -->
	<!-- Step: Executing -->
	<!-- ================================================================= -->
{:else if step === 'executing'}
	<div class="flex flex-col items-center gap-4 py-6" aria-live="polite">
		<span class="loading loading-spinner loading-lg text-primary"></span>
		<div class="space-y-1 text-center">
			<div class="font-semibold">{$t('wallet.loan.redemption_executing')}</div>
			<div class="text-base-content/60 text-sm">
				{$t('wallet.loan.redemption_executing_desc')}
			</div>
		</div>
	</div>

	<!-- ================================================================= -->
	<!-- Step: Complete -->
	<!-- ================================================================= -->
{:else if step === 'complete'}
	<div class="flex flex-col items-center gap-4 py-4">
		<!-- Success checkmark -->
		<div class="bg-success rounded-full p-4">
			<svg
				class="text-success-content h-12 w-12"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2.5"
					d="M5 13l4 4L19 7"
				/>
			</svg>
		</div>

		<div class="space-y-1 text-center">
			<div class="text-lg font-bold">
				{$t('wallet.loan.redemption_complete_title')}
			</div>
			<div class="text-base-content/60 text-sm">
				{$t('wallet.loan.redemption_complete_desc', {
					values: {
						amount: finalRbtcFormatted
					}
				})}
			</div>
		</div>

		<!-- View Transaction link -->
		{#if finalTxHash}
			<a
				href={`https://rootstock.blockscout.com/tx/${finalTxHash}`}
				target="_blank"
				rel="noopener noreferrer"
				class="btn btn-outline btn-sm gap-1"
			>
				{$t('wallet.loan.redemption_view_tx')}
				<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
					/>
				</svg>
			</a>
		{/if}

		<button class="btn btn-primary min-h-[44px] w-full text-sm sm:text-base" onclick={handleDone}>
			{$t('wallet.loan.paused_dismiss')}
		</button>
	</div>

	<!-- ================================================================= -->
	<!-- Step: Error -->
	<!-- ================================================================= -->
{:else if step === 'error'}
	<div class="flex flex-col items-center gap-4 py-2" role="alert">
		<!-- Error icon -->
		<div class="bg-warning/10 rounded-full p-4">
			<svg class="text-warning h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
				/>
			</svg>
		</div>

		<div class="space-y-1 text-center">
			<div class="text-lg font-bold">{$t('wallet.loan.redemption_error_title')}</div>
			<div class="text-base-content/60 text-sm">{errorMessage}</div>
		</div>

		<!-- Retry + Back buttons -->
		<div class="flex w-full flex-col gap-2">
			<button
				class="btn btn-primary min-h-[44px] w-full text-sm sm:text-base"
				onclick={handleConfirm}
			>
				{$t('wallet.loan.paused_retry_swap')}
			</button>
			<button class="btn btn-ghost min-h-[44px] w-full text-sm sm:text-base" onclick={onBack}>
				{$t('wallet.loan.redemption_back')}
			</button>
		</div>
	</div>
{/if}
