<script lang="ts">
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { FEE_TIERS } from '$lib/utils/fees';
	import ContractInitiationDrawer from '$lib/components/contracts/ContractInitiationDrawer.svelte';
	import ContractFundingWalletCard from '$lib/components/contracts/ContractFundingWalletCard.svelte';
	import PaymentSplitSlider from '$lib/components/contracts/PaymentSplitSlider.svelte';
	import { ContractRune, TaskeeInvoiceRequired } from '$lib/runes/contract.svelte';
	import { initWasm } from '$lib/wasm/init-wasm';
	import { walletManager } from '$lib/stores/wallet/wallet-manager';
	import { walletBlocksAction } from '$lib/stores/wallet/wallet-link';
	import { invoiceMatchesRail, satsRailBlocked } from '$lib/services/rgb/escrow-rail';
	import { state as walletState } from '$lib/stores/wallet/wallet-state';
	import { lightningStore } from '$lib/stores/wallet/signet-lsp';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { resolveBidSats } from '$lib/utils/nostr-bid';
	import type { PaymentSplitConfig } from '$lib/types/rgb-contract';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
	import LocationPicker from '$lib/components/LocationPicker.svelte';
	import IconRefresh from '~icons/mdi/refresh';
	import IconMapMarker from '~icons/mdi/map-marker';
	import IconAlertCircle from '~icons/mdi/alert-circle';
	import IconCheckCircle from '~icons/mdi/check-circle';
	import BookingDatesDisplay from '$lib/components/shared/BookingDatesDisplay.svelte';
	import type { Location } from '$lib/types/task';
	import type { RadiusValidationResult } from '$lib/utils/location/distance';

	type ServiceContractAgreementSnapshot = {
		deliverables?: string;
		selectedAddOns?: string[];
		priceSnapshotLabel?: string;
	};
	type ServiceContractPricingSnapshot = {
		serviceVersionRef?: string;
		tierId?: string;
		selectedAddOns?: string[];
		rushDelivery?: boolean;
	};

	let {
		open = false,
		title = '',
		serviceTitle = '',
		providerName = null,
		providerAvatar = null,
		providerRating = null,
		providerPubkey = null,
		contractId = null,
		instantOrderId = null,
		contractRune = undefined,
		amountUsd = null,
		escrowInvoice = null,
		selectedTierLabel = null,
		agreementSnapshot = null,
		estimatedStartTime = null,
		estimatedCompletionTime = null,
		walletLoading = false,
		walletConnected = false,
		walletBalanceSats = '',
		walletBalanceUsd = '',
		usdtBalance = '',
		usdtBalanceUsd = '',
		requiredBalanceSats = '',
		requiredBalanceUsd = '',
		walletVerificationStatus = 'idle',
		walletVerificationMessage = '',
		walletVerificationErrorCode = null,
		showContractCreationProgress = false,
		contractCreationStatus = 'idle',
		contractCreationMessage = '',
		isPreparing = false,
		isSubmitting = false,
		isOffline = false,
		showReconnectNotice = false,
		errorMessage = '',
		errorHint = '',
		canConfirm = true,
		requiresTaskerLocation = false,
		taskeeServiceRadius = null,
		taskeeBaseLocation = null,
		taskerLocation = null,
		locationValidation = null,
		onTaskerLocationSelect = () => {},
		onConfirm = () => {},
		onRetry = () => {},
		onRefresh = () => {},
		onAddFunds = undefined,
		onClose = () => {}
	} = $props<{
		open?: boolean;
		title?: string;
		serviceTitle?: string;
		providerName?: string | null;
		providerAvatar?: string | null;
		providerRating?: number | null;
		providerPubkey?: string | null;
		contractId?: string | null;
		contractRune?: ContractRune;
		amountUsd?: number | null;
		escrowInvoice?: string | null;
		selectedTierLabel?: string | null;
		agreementSnapshot?: ServiceContractAgreementSnapshot | null;
		pricingSnapshot?: ServiceContractPricingSnapshot | null;
		instantOrderId?: string | null;
		estimatedStartTime?: number | null;
		estimatedCompletionTime?: number | null;
		walletLoading?: boolean;
		walletConnected?: boolean;
		walletBalanceSats?: string;
		walletBalanceUsd?: string;
		usdtBalance?: string;
		usdtBalanceUsd?: string;
		requiredBalanceSats?: string;
		requiredBalanceUsd?: string;
		walletVerificationStatus?: 'idle' | 'verifying' | 'ready' | 'error';
		walletVerificationMessage?: string;
		walletVerificationErrorCode?: string | null;
		showContractCreationProgress?: boolean;
		contractCreationStatus?: 'idle' | 'creating' | 'success' | 'error';
		contractCreationMessage?: string;
		isPreparing?: boolean;
		isSubmitting?: boolean;
		isOffline?: boolean;
		showReconnectNotice?: boolean;
		errorMessage?: string;
		errorHint?: string;
		canConfirm?: boolean;
		requiresTaskerLocation?: boolean;
		taskeeServiceRadius?: number | null;
		taskeeBaseLocation?: Location | null;
		taskerLocation?: Location | null;
		locationValidation?: RadiusValidationResult | null;
		onTaskerLocationSelect?: (location: Location) => void;
		onConfirm?: () => void | Promise<void>;
		onRetry?: () => void;
		onRefresh?: () => void;
		onAddFunds?: (amountUsd: number) => void;
		onClose?: () => void;
	}>();

	const DEFAULT_CLIENT_FEE_TIER = 1;
	const ESTIMATED_NETWORK_FEE_USD = 0.5;
	const USDT_PLATFORM_FEE_RATE = 0.1; // 10% for USDT payments
	const BTC_PLATFORM_FEE_RATE = FEE_TIERS[DEFAULT_CLIENT_FEE_TIER].percentage / 10000; // 2.5%

	let selectedSource = $state<'btc' | 'usdt'>('usdt');
	let usdtOverLightning = $state(false);
	let nodeEmpty = $state(true);
	const lspPayReady = $derived(
		selectedSource === 'btc'
			? !nodeEmpty
			: usdtOverLightning
				? $lightningStore.ready || !nodeEmpty
				: true
	);
	let sourceExpanded = $state(false);
	const paymentSplitEnabled = false;
	let paymentSplit = $state<PaymentSplitConfig>({
		primaryAsset: 'usdt_rgb',
		primaryPercentage: 100,
		secondaryAsset: 'btc_onchain',
		secondaryPercentage: 0
	});
	let readyToPay = $state(false);
	let localContractRune = $state<ContractRune | null>(null);
	let isFunding = $state(false);
	let runeError = $state('');

	let platformFeeRate = $derived(
		selectedSource === 'usdt' ? USDT_PLATFORM_FEE_RATE : BTC_PLATFORM_FEE_RATE
	);
	const PLATFORM_FEE_PERCENT_LABEL = $derived(`${(platformFeeRate * 100).toFixed(1)}%`);

	function formatUsdLabel(value: number | null): string {
		if (value == null || !Number.isFinite(value)) {
			return '—';
		}

		return `$${value.toFixed(2)}`;
	}

	const selectedAddOns = $derived(agreementSnapshot?.selectedAddOns ?? []);
	const includedScope = $derived(agreementSnapshot?.deliverables?.trim() ?? '');
	const baseAmountValue = $derived(
		amountUsd != null && Number.isFinite(amountUsd) && amountUsd > 0 ? amountUsd : null
	);
	const platformFeeValue = $derived(
		baseAmountValue != null ? baseAmountValue * platformFeeRate : null
	);
	const totalPaymentValue = $derived(
		baseAmountValue != null && platformFeeValue != null
			? baseAmountValue + platformFeeValue + ESTIMATED_NETWORK_FEE_USD
			: null
	);
	const baseAmountLabel = $derived(formatUsdLabel(baseAmountValue));
	const usdtPlatformFeeValue = $derived(
		baseAmountValue != null ? baseAmountValue * USDT_PLATFORM_FEE_RATE : null
	);
	const usdtPlatformFeeLabel = $derived(formatUsdLabel(usdtPlatformFeeValue));
	const platformFeeLabel = $derived(formatUsdLabel(platformFeeValue));
	const savingsValue = $derived.by(() => {
		if (usdtPlatformFeeValue != null && platformFeeValue != null && selectedSource === 'btc') {
			return usdtPlatformFeeValue - platformFeeValue;
		}
		return null;
	});
	const savingsLabel = $derived(formatUsdLabel(savingsValue));
	const estimatedNetworkFeeLabel = $derived(formatUsdLabel(ESTIMATED_NETWORK_FEE_USD));
	const totalPaymentLabel = $derived(formatUsdLabel(totalPaymentValue));
	const lockedSats = $derived(
		totalPaymentValue == null ? null : resolveBidSats(totalPaymentValue, 'USD', btcPrice.price)
	);
	const escrowRail = $derived<'usdt_rgb' | 'usdt_ln' | 'btc_lightning'>(
		selectedSource === 'usdt' ? (usdtOverLightning ? 'usdt_ln' : 'usdt_rgb') : 'btc_lightning'
	);
	const postedInvoice = $derived(escrowInvoice?.trim() ?? '');
	const invoiceReady = $derived(
		postedInvoice.length === 0 || invoiceMatchesRail(escrowRail, postedInvoice)
	);
	const resolvedErrorMessage = $derived(runeError || errorMessage);

	// Wallet card props — switch based on selected source
	let walletCardBalancePrimary = $derived(
		selectedSource === 'usdt' ? usdtBalanceUsd || usdtBalance || '$0.00' : walletBalanceSats
	);
	let walletCardBalanceSecondary = $derived(selectedSource === 'usdt' ? '' : walletBalanceUsd);
	let walletCardIconAlt = $derived(selectedSource === 'usdt' ? 'USDT' : 'Bitcoin');

	// Effective balance/required that switch based on selected source
	let effectiveBalance = $derived(
		selectedSource === 'usdt' ? usdtBalanceUsd || usdtBalance || '$0.00' : walletBalanceUsd
	);
	let effectiveRequired = $derived(requiredBalanceUsd);

	function parseUsdString(value: string): number {
		return parseFloat(value.replace(/[$,]/g, ''));
	}

	const remainingBalanceUsd = $derived.by(() => {
		if (!effectiveBalance || !effectiveRequired) return '—';
		const walletNum = parseUsdString(effectiveBalance);
		const requiredNum = parseUsdString(effectiveRequired);
		if (isNaN(walletNum) || isNaN(requiredNum)) return '—';
		const remaining = walletNum - requiredNum;
		if (remaining < 0) {
			return `- $${Math.abs(remaining).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
		}
		return `$${remaining.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	});

	const remainingIsNegative = $derived.by(() => {
		if (!effectiveBalance || !effectiveRequired) return false;
		const walletNum = parseUsdString(effectiveBalance);
		const requiredNum = parseUsdString(effectiveRequired);
		if (isNaN(walletNum) || isNaN(requiredNum)) return false;
		return walletNum < requiredNum;
	});

	$effect(() => {
		if (!open || selectedSource !== 'btc') return;
		let stale = false;
		satsRailBlocked(walletState.utexoWallet)
			.then((blocked) => {
				if (!stale) nodeEmpty = blocked;
			})
			.catch(() => {
				if (!stale) nodeEmpty = true;
			});
		return () => {
			stale = true;
		};
	});

	let showFullIncludedScope = $state(false);
	let includedScopeElement: HTMLParagraphElement | null = $state(null);
	let isIncludedScopeTruncated = $state(false);

	function checkIfIncludedScopeTruncated() {
		if (!includedScopeElement) return;

		const clone = includedScopeElement.cloneNode(true) as HTMLElement;
		clone.style.position = 'absolute';
		clone.style.visibility = 'hidden';
		clone.style.height = 'auto';
		clone.style.width = includedScopeElement.offsetWidth + 'px';
		clone.style.whiteSpace = 'pre-line';
		document.body.appendChild(clone);

		const fullHeight = clone.scrollHeight;
		const lineHeight = parseFloat(getComputedStyle(includedScopeElement).lineHeight) || 20;
		const maxHeight = lineHeight * 3;

		document.body.removeChild(clone);

		isIncludedScopeTruncated = fullHeight > maxHeight + 1;
	}

	$effect(() => {
		if (includedScopeElement && includedScope) {
			requestAnimationFrame(() => {
				checkIfIncludedScopeTruncated();
			});
		}
	});

	function toggleIncludedScope() {
		showFullIncludedScope = !showFullIncludedScope;
	}

	const resolvedErrorHint = $derived(resolvedErrorMessage ? errorHint : '');
	const resolvedTitle = $derived(
		title || ($t('dashboard.services.detail.book_now_drawer.title') as string)
	);
	const showingContractCreationProgress = $derived(
		showContractCreationProgress || contractCreationStatus !== 'idle'
	);
	let confirmModalOpen = $state(false);

	function handleAddFunds() {
		if (onAddFunds && totalPaymentValue != null) {
			onAddFunds(totalPaymentValue);
		} else {
			onClose();
			goto('/wallet?tab=receive');
		}
	}

	function handleDrawerConfirmClick() {
		if (
			!canConfirm ||
			isPreparing ||
			isOffline ||
			isSubmitting ||
			isFunding ||
			!lspPayReady ||
			!invoiceReady
		) {
			return;
		}

		if (!readyToPay) {
			attachEscrow().catch((error) => {
				runeError = error instanceof Error ? error.message : 'Escrow funding failed';
			});
			return;
		}

		confirmModalOpen = true;
	}

	async function attachEscrow(): Promise<void> {
		const blocked = walletBlocksAction();
		if (blocked) {
			runeError = blocked;
			return;
		}
		runeError = '';
		isFunding = true;
		try {
			const id = contractId ?? instantOrderId ?? `service-${serviceTitle}`;
			if (!id || totalPaymentValue == null) {
				throw new Error('Service contract details are incomplete');
			}
			await initWasm();
			await walletManager.initialize();
			const { getNpub } = await import('$lib/utils/nostrKeys');
			const buyer = await getNpub();
			const partyPubkeys = [providerPubkey, buyer].filter((key): key is string => Boolean(key));
			const rune =
				contractRune ??
				localContractRune ??
				new ContractRune({
					contractId: id,
					contractTitle: serviceTitle || resolvedTitle,
					bidderComments: includedScope,
					totalAmountUsd: totalPaymentValue,
					...(selectedSource === 'btc' && lockedSats
						? {
								amountSats: lockedSats,
								lockedAmount: lockedSats,
								lockedCurrency: 'SATS' as const
							}
						: {}),
					split: singleAssetSplit(selectedSource),
					partyPubkeys,
					...(typeof estimatedStartTime === 'number' ? { estimatedStartTime } : {})
				});
			localContractRune = rune;
			await rune.prepareFunding(escrowInvoice?.trim() || undefined);
			readyToPay = Boolean(rune.snapshot.fundingInvoice);
			if (!readyToPay) {
				runeError = $t('dashboard.services.detail.escrow_missing');
			}
		} catch (error) {
			readyToPay = false;
			runeError =
				error instanceof TaskeeInvoiceRequired
					? $t('dashboard.services.detail.escrow_missing')
					: error instanceof Error
						? error.message
						: 'Escrow funding failed';
		} finally {
			await walletManager.releaseRgbLock();
			isFunding = false;
		}
	}

	function handleCancelConfirmation() {
		confirmModalOpen = false;
	}

	function singleAssetSplit(source: 'btc' | 'usdt'): PaymentSplitConfig {
		return {
			primaryAsset:
				source === 'usdt' ? (usdtOverLightning ? 'usdt_ln' : 'usdt_rgb') : 'btc_lightning',
			primaryPercentage: 100,
			secondaryAsset: source === 'usdt' ? 'btc_onchain' : 'usdt_rgb',
			secondaryPercentage: 0
		};
	}

	function updatePaymentSplit(config: PaymentSplitConfig): void {
		if (!paymentSplitEnabled) return;
		paymentSplit = config;
	}

	function syncSplitForSource(source: 'btc' | 'usdt'): void {
		paymentSplit = paymentSplitEnabled
			? {
					...paymentSplit,
					primaryAsset:
						source === 'usdt' ? (usdtOverLightning ? 'usdt_ln' : 'usdt_rgb') : 'btc_lightning'
				}
			: singleAssetSplit(source);
	}

	async function handleConfirmEscrow() {
		confirmModalOpen = false;
		const blocked = walletBlocksAction();
		if (blocked) {
			runeError = blocked;
			return;
		}
		runeError = '';
		if (selectedSource === 'btc' && nodeEmpty) {
			runeError = $t('wallet.lightning_no_peer');
			return;
		}
		if (postedInvoice && !invoiceMatchesRail(escrowRail, postedInvoice)) {
			runeError =
				selectedSource === 'btc'
					? 'Sats escrow requires a Lightning invoice'
					: 'USDT escrow requires an rgb: invoice';
			return;
		}
		const runeToPay = contractRune ?? localContractRune;
		if (!runeToPay) {
			runeError = $t('dashboard.services.detail.escrow_missing');
			return;
		}
		isFunding = true;
		try {
			await runeToPay.payFundingFromWallet();
			await onConfirm();
		} catch (error) {
			runeError = error instanceof Error ? error.message : 'Escrow funding failed';
		} finally {
			await walletManager.releaseRgbLock();
			isFunding = false;
		}
	}
</script>

{#if open}
	<ContractInitiationDrawer
		{open}
		title={resolvedTitle}
		confirmLabel={readyToPay
			? $t('dashboard.bids.bid_acceptance.step_pay')
			: $t('dashboard.services.detail.book_now_drawer.confirm_cta')}
		canConfirm={canConfirm &&
			!isPreparing &&
			!isOffline &&
			!isFunding &&
			lspPayReady &&
			invoiceReady}
		hideFooter={showingContractCreationProgress}
		allowCloseWhileSubmitting={showingContractCreationProgress}
		isSubmitting={isSubmitting || isFunding}
		errorMessage={walletVerificationErrorCode === 'insufficient_funds' ? '' : resolvedErrorMessage}
		errorHint={walletVerificationErrorCode === 'insufficient_funds' ? '' : resolvedErrorHint}
		drawerTestId="service-instant-buy-modal"
		confirmTestId="service-instant-buy-confirm"
		retryTestId="service-instant-buy-retry"
		errorTestId="service-instant-buy-error"
		errorHintTestId="service-instant-buy-error-hint"
		onConfirm={handleDrawerConfirmClick}
		{onRetry}
		{onClose}
	>
		<div class="space-y-6 py-1">
			{#if showingContractCreationProgress}
				<div class="space-y-6 py-2 text-center" data-testid="service-contract-creation-progress">
					<div class="flex justify-center">
						<div class="bg-success/10 rounded-full p-4">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="text-success h-16 w-16"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
						</div>
					</div>

					<div class="space-y-2">
						<h3 class="text-xl font-bold">
							{$t('dashboard.services.detail.book_now_drawer.processing_title')}
						</h3>
						<p class="text-base-content/70 text-sm">
							{$t('dashboard.services.detail.book_now_drawer.processing_message')}
						</p>
					</div>

					<div class="bg-base-200 rounded-lg p-4" data-testid="service-contract-creation-status">
						<h4 class="mb-3 font-semibold">
							{$t('dashboard.services.detail.book_now_drawer.contract_creation_status')}
						</h4>
						<div class="flex items-center gap-3 text-left">
							{#if contractCreationStatus === 'error'}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="text-error h-5 w-5 shrink-0"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								<div class="space-y-1">
									<p class="text-error font-medium">
										{$t('dashboard.services.detail.book_now_drawer.contract_creation_failed')}
									</p>
									{#if contractCreationMessage}
										<p class="text-base-content/70 text-sm">
											{contractCreationMessage}
										</p>
									{/if}
								</div>
							{:else if contractCreationStatus === 'success'}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="text-success h-5 w-5 shrink-0"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								<p class="text-success font-medium">
									{$t('dashboard.services.detail.book_now_drawer.contract_created')}
								</p>
							{:else}
								<span class="loading loading-spinner loading-sm text-info shrink-0"></span>
								<p class="text-info font-medium">
									{$t('dashboard.services.detail.book_now_drawer.creating_contract')}
								</p>
							{/if}
						</div>
					</div>

					<div class="bg-base-200 rounded-lg p-4 text-left">
						<h4 class="mb-2 font-semibold">
							{$t('dashboard.services.detail.book_now_drawer.what_happens_next_title')}
						</h4>
						<ul class="text-base-content/80 space-y-1 text-sm">
							<li>• {$t('dashboard.services.detail.book_now_drawer.next_item_notify')}</li>
							<li>• {$t('dashboard.services.detail.book_now_drawer.next_item_begin')}</li>
							<li>• {$t('dashboard.services.detail.book_now_drawer.next_item_funds_held')}</li>
							<li>• {$t('dashboard.services.detail.book_now_drawer.next_item_release')}</li>
							{#if contractCreationStatus === 'success'}
								<li>
									• {$t('dashboard.services.detail.book_now_drawer.next_item_contract_details')}
								</li>
							{/if}
						</ul>
					</div>
				</div>
			{:else if isOffline}
				<div
					class="alert alert-warning alert-outline text-sm"
					data-testid="service-instant-buy-offline-alert"
				>
					<span>
						{$t('dashboard.services.detail.book_now_drawer.offline_notice')}
					</span>
				</div>
			{:else if showReconnectNotice}
				<div
					class="alert alert-info alert-outline text-sm"
					data-testid="service-instant-buy-reconnect-alert"
				>
					<span>
						{$t('dashboard.services.detail.book_now_drawer.reconnect_notice')}
					</span>
				</div>
			{/if}

			{#if !showingContractCreationProgress}
				<div class="bg-base-300 rounded-2xl">
					<div class="flex items-start justify-between gap-2 px-6 pt-3">
						<div class="min-w-0 flex-1">
							<h5
								class="wrap-break-words line-clamp-2 text-lg font-semibold"
								data-testid="service-instant-buy-title"
							>
								{serviceTitle}
							</h5>
						</div>
						{#if onRefresh}
							<button
								type="button"
								class="btn btn-ghost btn-md btn-circle -mt-2 -mr-2 shrink-0"
								onclick={(e) => {
									e.stopPropagation();
									onRefresh();
								}}
								disabled={walletLoading}
								aria-label={$t('common.buttons.refresh')}
							>
								<IconRefresh class="h-6 w-6 {walletLoading ? 'animate-spin' : ''}" />
							</button>
						{/if}
					</div>

					<div class="flex flex-col gap-4 px-3 pb-4">
						{#if isPreparing}
							<div class="border-base-300 bg-base-100 rounded-xl border p-4 text-sm">
								<div class="flex items-center gap-2" data-testid="service-instant-buy-preparing">
									<span class="loading loading-spinner loading-sm"></span>
									<span>
										{$t('dashboard.services.detail.book_now_drawer.loading_latest')}
									</span>
								</div>
							</div>
						{:else}
							<!-- Provider Info -->
							<div class="rounded-lg px-3 pt-3" data-testid="service-agreement-provider">
								<UserInfoDisplay
									avatar={providerAvatar}
									username={providerName ?? ''}
									rating={providerRating}
									size="sm"
									pubkey={providerPubkey}
									profileLink={providerPubkey}
								/>
							</div>

							<!-- Service Location Picker (for TASKER_LOCATION services) -->
							{#if requiresTaskerLocation}
								<div
									class="bg-base-100 border-base-300 rounded-xl border p-4"
									data-testid="service-location-picker-section"
								>
									<div class="mb-3">
										<div class="flex items-center gap-2">
											<IconMapMarker class="text-primary h-5 w-5" />
											<h4 class="font-semibold">
												{$t('dashboard.services.detail.book_now_drawer.service_location_title')}
											</h4>
										</div>
										<p class="text-base-content/70 mt-1 text-sm">
											{$t('dashboard.services.detail.book_now_drawer.service_location_description')}
										</p>
										{#if taskeeServiceRadius}
											<p class="text-base-content/60 mt-0.5 text-xs">
												{$t(
													'dashboard.services.detail.book_now_drawer.service_location_max_distance',
													{ values: { distance: taskeeServiceRadius } }
												)}
											</p>
										{/if}
									</div>

									<LocationPicker
										placeholder={$t(
											'dashboard.services.detail.book_now_drawer.service_location_placeholder'
										)}
										location={taskerLocation ?? undefined}
										onLocationSelect={onTaskerLocationSelect}
										mapHeight="280px"
										showFullscreen={true}
										showGeolocation={true}
										showServiceRadius={false}
										serviceRadius={taskeeServiceRadius ?? undefined}
										showRadiusCircle={!!taskeeServiceRadius && !!taskeeBaseLocation}
										circleCenterLocation={taskeeBaseLocation}
									/>

									<!-- Location Validation Feedback -->
									{#if locationValidation}
										{#if locationValidation.valid}
											<div class="text-success mt-3 flex items-center gap-2 text-sm">
												<IconCheckCircle class="h-4 w-4" />
												<span
													>{$t(
														'dashboard.services.detail.book_now_drawer.service_location_selected'
													)}</span
												>
											</div>
										{:else if locationValidation.errorCode === 'OUTSIDE_RADIUS'}
											<div class="text-error mt-3 flex items-start gap-2 text-sm">
												<IconAlertCircle class="mt-0.5 h-4 w-4 shrink-0" />
												<span>
													{$t(
														'dashboard.services.detail.book_now_drawer.service_location_outside_radius',
														{
															values: {
																distance: locationValidation.distanceKm,
																maxDistance: locationValidation.maxRadiusKm
															}
														}
													)}
												</span>
											</div>
										{/if}
									{:else if !taskerLocation}
										<div class="text-warning mt-3 flex items-center gap-2 text-sm">
											<IconAlertCircle class="h-4 w-4" />
											<span
												>{$t(
													'dashboard.services.detail.book_now_drawer.service_location_required'
												)}</span
											>
										</div>
									{/if}
								</div>
							{/if}

							<!-- Timeline Row -->
							<BookingDatesDisplay
								startTime={estimatedStartTime}
								endTime={estimatedCompletionTime}
								startLabel={$t('dashboard.services.detail.book_now_drawer.start_date')}
								endLabel={$t('dashboard.services.detail.book_now_drawer.delivery_date')}
							/>

							{#if selectedSource === 'btc' && nodeEmpty}
								<div
									class="alert alert-outline alert-warning text-sm"
									role="status"
									data-testid="lightning-no-peer"
								>
									{$t('wallet.lightning_no_peer')}
								</div>
							{/if}

							<!-- Source Wallet Selector -->
							<div class="form-control">
								<div
									class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
									class:collapse-open={sourceExpanded}
								>
									<button
										type="button"
										class="collapse-title flex min-h-0 items-center gap-2 px-3 py-2 pr-10 text-sm font-medium sm:pr-12"
										onclick={() => (sourceExpanded = !sourceExpanded)}
									>
										<span class="text-base-content/60">{$t('wallet.from')}:</span>
										{#if selectedSource === 'btc'}
											<img src="/images/chains/Bitcoin.svg" alt="Bitcoin" class="h-5 w-5" />
											<span>{$t('wallet.bitcoin')}</span>
											<span class="ml-auto text-xs opacity-70">{walletBalanceSats} Sats</span>
										{:else}
											<img src="/images/chains/Tether-USD.svg" alt="USDT" class="h-5 w-5" />
											<span>USD</span>
											<span class="ml-auto text-xs opacity-70"
												>{usdtBalanceUsd || usdtBalance || '$0.00'}</span
											>
										{/if}
									</button>
									<div class="collapse-content px-2">
										<div class="space-y-1">
											<button
												type="button"
												class="hover:bg-base-200 flex w-full items-center gap-2 rounded-lg p-2 transition-colors {selectedSource ===
												'btc'
													? 'bg-primary/10'
													: ''}"
												onclick={() => {
													selectedSource = 'btc';
													syncSplitForSource('btc');
													sourceExpanded = false;
												}}
												data-testid="service-source-btc"
											>
												<img src="/images/chains/Bitcoin.svg" alt="Bitcoin" class="h-5 w-5" />
												<span>{$t('wallet.bitcoin')}</span>
												<span class="ml-auto text-xs opacity-70">{walletBalanceSats} Sats</span>
											</button>
											<button
												type="button"
												class="hover:bg-base-200 flex w-full items-center gap-2 rounded-lg p-2 transition-colors {selectedSource ===
												'usdt'
													? 'bg-primary/10'
													: ''}"
												onclick={() => {
													selectedSource = 'usdt';
													syncSplitForSource('usdt');
													sourceExpanded = false;
												}}
											>
												<img src="/images/chains/Tether-USD.svg" alt="USDT" class="h-5 w-5" />
												<span>USD</span>
												<span class="ml-auto text-xs opacity-70"
													>{usdtBalanceUsd || usdtBalance || '$0.00'}</span
												>
											</button>
										</div>
									</div>
								</div>
							</div>
							{#if selectedSource === 'usdt'}
								<label
									class="mt-2 flex items-center gap-2 text-sm"
									data-testid="usdt-over-lightning"
								>
									<input
										type="checkbox"
										class="checkbox checkbox-sm"
										bind:checked={usdtOverLightning}
										onchange={() => syncSplitForSource('usdt')}
									/>
									{$t('dashboard.bids.bid_acceptance.fund_rail_usdt_ln')}
								</label>
							{/if}

							<!-- Wallet Balance Accordion -->
							<ContractFundingWalletCard
								title={$t('dashboard.services.detail.book_now_drawer.wallet_balance')}
								iconAlt={walletCardIconAlt}
								balanceSats={walletCardBalancePrimary}
								balanceUsd={walletCardBalanceSecondary}
								satsLabel={selectedSource === 'usdt'
									? ''
									: $t('dashboard.services.detail.book_now_drawer.sats')}
								notConnectedLabel={$t(
									'dashboard.services.detail.book_now_drawer.wallet_not_connected'
								)}
								availableLabel={$t('dashboard.services.detail.book_now_drawer.available_balance')}
								requiredLabel={$t('dashboard.services.detail.book_now_drawer.required_balance')}
								requiredUsd={requiredBalanceUsd}
								requiredSats={requiredBalanceSats}
								remainingUsd={remainingBalanceUsd}
								{remainingIsNegative}
								loading={walletLoading}
								connected={walletConnected}
								verificationStatus={walletVerificationStatus === 'error' ||
								walletVerificationStatus === 'ready'
									? 'idle'
									: walletVerificationStatus}
								verificationMessage={walletVerificationStatus === 'error' ||
								walletVerificationStatus === 'ready'
									? ''
									: walletVerificationMessage}
								forceOpen={false}
								availableBalance={selectedSource === 'usdt'
									? usdtBalanceUsd || usdtBalance || '$0.00'
									: undefined}
								iconSrc={selectedSource === 'usdt'
									? '/images/chains/Tether-USD.svg'
									: '/images/chains/Bitcoin.svg'}
							/>

							{#if paymentSplitEnabled}
								<PaymentSplitSlider
									totalAmountUsd={totalPaymentValue ?? 0}
									primaryAsset={selectedSource === 'usdt'
										? usdtOverLightning
											? 'usdt_ln'
											: 'usdt_rgb'
										: 'btc_lightning'}
									secondaryAsset={selectedSource === 'usdt' ? 'btc_lightning' : 'usdt_rgb'}
									onSplitChange={updatePaymentSplit}
								/>
							{/if}

							<!-- Pricing Card -->
							<div class="flex flex-col gap-4 lg:flex-row">
								<div class="min-w-0 flex-1">
									<div class="bg-base-100 rounded-lg p-3 lg:bg-transparent">
										<div class="space-y-2 text-right">
											<div class="flex items-center justify-between gap-3 text-xs">
												<span class="text-base-content/70">
													{$t('dashboard.services.detail.book_now_drawer.base_amount')}
												</span>
												<span data-testid="service-agreement-base-amount">{baseAmountLabel}</span>
											</div>
											<!-- USDT platform fee (strikethrough when paying Bitcoin) -->
											<div class="flex items-center justify-between gap-3 text-xs">
												<span
													class="text-base-content/70"
													class:line-through={selectedSource === 'btc'}
												>
													{$t('dashboard.services.detail.book_now_drawer.platform_fee', {
														values: { fee: '10.0%' }
													}) || 'Platform Fee (10.0%)'}
												</span>
												<span
													class:line-through={selectedSource === 'btc'}
													data-testid="service-agreement-usdt-platform-fee"
												>
													{usdtPlatformFeeLabel}
												</span>
											</div>
											<!-- Bitcoin platform fee (hidden when paying USDT) -->
											{#if selectedSource === 'btc'}
												<div class="flex items-center justify-between gap-3 text-xs">
													<span class="text-base-content/70">
														{$t('dashboard.services.detail.book_now_drawer.platform_fee', {
															values: { fee: PLATFORM_FEE_PERCENT_LABEL }
														}) || `Platform Fee (${PLATFORM_FEE_PERCENT_LABEL})`}
													</span>
													<span>
														{#if savingsValue != null && savingsValue > 0}
															<span class="text-success">(-{savingsLabel})</span>
														{/if}
														<span data-testid="service-agreement-platform-fee">
															{platformFeeLabel}
														</span>
													</span>
												</div>
											{/if}
											<div class="flex items-center justify-between gap-3 text-xs italic">
												<span class="text-base-content/70">
													{$t('dashboard.services.detail.book_now_drawer.estimated_network_fee')}
												</span>
												<span data-testid="service-agreement-gas-fee">
													{estimatedNetworkFeeLabel}
												</span>
											</div>
											<div class="border-base-200 border-t pt-2">
												<div class="flex items-center justify-between gap-3">
													<span class="text-sm font-semibold">
														{$t('dashboard.services.detail.book_now_drawer.total_payment')}
													</span>
													<span
														class="text-primary text-lg font-bold"
														data-testid="service-agreement-price"
													>
														{totalPaymentLabel}
													</span>
												</div>
											</div>
											<!-- Savings line -->
											{#if savingsValue != null && savingsValue > 0}
												<div class="text-base-content text-center text-xs font-bold">
													You save <span class="text-primary">{savingsLabel}</span> paying with Bitcoin
												</div>
											{/if}
										</div>

										{#if selectedTierLabel}
											<div class="mt-3 flex items-center justify-between text-xs">
												<span class="text-base-content/70">
													{$t('dashboard.services.detail.book_now_drawer.selected_tier')}
												</span>
												<div data-testid="service-agreement-tier">
													<span class="badge badge-outline badge-primary">{selectedTierLabel}</span>
												</div>
											</div>
										{/if}

										{#if selectedAddOns.length > 0}
											<div class="text-base-content/70 mt-3 text-xs">
												{$t('dashboard.services.detail.book_now_drawer.add_ons')}
											</div>
											<div class="mt-1 flex flex-wrap gap-2">
												{#each selectedAddOns as addOn (addOn)}
													<span class="badge badge-outline">{addOn}</span>
												{/each}
											</div>
										{/if}
									</div>
								</div>
							</div>

							<!-- Included Scope -->
							{#if includedScope}
								<div class="bg-base-100 rounded-lg p-4">
									<div class="text-base-content/70 text-xs font-medium">
										{$t('dashboard.services.detail.book_now_drawer.included_scope')}
									</div>
									<div
										class="relative overflow-hidden transition-[max-height] duration-500 ease-in-out {showFullIncludedScope
											? 'max-h-[1000px]'
											: 'max-h-18'}"
									>
										<p
											bind:this={includedScopeElement}
											class="text-base-content/80 mt-2 text-sm whitespace-pre-line"
											data-testid="service-agreement-scope"
										>
											{includedScope}
										</p>
										{#if !showFullIncludedScope && isIncludedScopeTruncated}
											<div
												class="from-base-100 pointer-events-none absolute right-0 bottom-0 left-0 h-8 bg-gradient-to-t to-transparent"
											></div>
										{/if}
									</div>
									{#if isIncludedScopeTruncated}
										<button class="btn btn-xs btn-ghost mt-1" onclick={toggleIncludedScope}>
											{showFullIncludedScope ? $t('common.show_less') : $t('common.show_more')}
										</button>
									{/if}
								</div>
							{/if}

							{#if walletVerificationErrorCode === 'insufficient_funds'}
								<div class="alert alert-error alert-outline mt-2 shadow-sm">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-6 w-6 shrink-0 stroke-current"
										fill="none"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z"
										/>
									</svg>
									<div class="flex-1">
										<span class="text-sm">{walletVerificationMessage}</span>
									</div>
									<div class="flex-none">
										<button class="btn btn-primary btn-sm" onclick={handleAddFunds}>
											{$t('dashboard.services.detail.book_now_drawer.add_funds')}
										</button>
									</div>
								</div>
							{/if}
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</ContractInitiationDrawer>

	<ConfirmModal
		isOpen={confirmModalOpen}
		title={$t('dashboard.services.detail.book_now_confirm_modal.title')}
		message={$t('dashboard.services.detail.book_now_confirm_modal.message')}
		confirmText={$t('dashboard.services.detail.book_now_confirm_modal.confirm')}
		cancelText={$t('dashboard.services.detail.book_now_confirm_modal.cancel')}
		confirmButtonClass="btn-primary"
		onConfirm={handleConfirmEscrow}
		onCancel={handleCancelConfirmation}
	/>
{/if}

<style>
	.transition-\[max-height\] {
		transition-property: max-height;
	}
</style>
