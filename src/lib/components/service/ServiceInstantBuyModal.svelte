<script lang="ts">
	import { format } from 'date-fns';
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { FEE_TIERS } from '@bittasker/wallet-core';
	import ContractInitiationDrawer from '$lib/components/contracts/ContractInitiationDrawer.svelte';
	import ContractFundingWalletCard from '$lib/components/contracts/ContractFundingWalletCard.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
	import IconCalendarClock from '~icons/mdi/calendar-clock';
	import IconTruckDeliveryOutline from '~icons/mdi/truck-delivery-outline';
	import IconRefresh from '~icons/mdi/refresh';
	import { formatDurationBetweenDates } from '$lib/utils/helpers/dateFormatter';
	import type {
		ServiceContractAgreementSnapshot,
		ServiceContractPricingSnapshot
	} from '$lib/types/contract';

	let {
		open = false,
		title = '',
		serviceTitle = '',
		providerName = null,
		providerAvatar = null,
		providerRating = 0,
		providerPubkey = null,
		providerMemberSince = null,
		amountUsd = null,
		selectedTierLabel = null,
		agreementSnapshot = null,
		estimatedStartTime = null,
		estimatedCompletionTime = null,
		walletLoading = false,
		walletConnected = false,
		walletBalanceSats = '',
		walletBalanceUsd = '',
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
		onConfirm = () => {},
		onRetry = () => {},
		onRefresh = () => {},
		onAddFunds = undefined,
		onClose = () => {},
		shortfallUsd = null,
		totalRequiredUsd = null
	} = $props<{
		open?: boolean;
		title?: string;
		serviceTitle?: string;
		providerName?: string | null;
		providerAvatar?: string | null;
		providerRating?: number;
		providerPubkey?: string | null;
		providerMemberSince?: number | string | Date | null;
		amountUsd?: number | null;
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
		onConfirm?: () => void;
		onRetry?: () => void;
		onRefresh?: () => void;
		onAddFunds?: (amountUsd: number) => void;
		onClose?: () => void;
		shortfallUsd?: number | null;
		totalRequiredUsd?: number | null;
	}>();

	const DEFAULT_CLIENT_FEE_TIER = 1;
	const ESTIMATED_NETWORK_FEE_USD = 0.5;
	const PLATFORM_FEE_RATE = FEE_TIERS[DEFAULT_CLIENT_FEE_TIER].percentage / 10000;
	const PLATFORM_FEE_PERCENT_LABEL = `${(PLATFORM_FEE_RATE * 100).toFixed(1)}%`;

	function formatTimestamp(timestampSeconds: number | null): string {
		if (!timestampSeconds || !Number.isFinite(timestampSeconds)) {
			return $t('dashboard.services.detail.book_now_drawer.unavailable');
		}

		return format(new Date(timestampSeconds * 1000), 'MMM d, yyyy');
	}

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
		baseAmountValue != null ? baseAmountValue * PLATFORM_FEE_RATE : null
	);
	const totalPaymentValue = $derived(
		baseAmountValue != null && platformFeeValue != null
			? baseAmountValue + platformFeeValue + ESTIMATED_NETWORK_FEE_USD
			: null
	);
	const baseAmountLabel = $derived(formatUsdLabel(baseAmountValue));
	const platformFeeLabel = $derived(formatUsdLabel(platformFeeValue));
	const estimatedNetworkFeeLabel = $derived(formatUsdLabel(ESTIMATED_NETWORK_FEE_USD));
	// Use totalRequiredUsd from preflight when available to ensure consistency
	const totalPaymentLabel = $derived(
		totalRequiredUsd != null && Number.isFinite(totalRequiredUsd)
			? formatUsdLabel(totalRequiredUsd)
			: formatUsdLabel(totalPaymentValue)
	);
	const estimatedStartLabel = $derived(formatTimestamp(estimatedStartTime));
	const estimatedCompletionLabel = $derived(formatTimestamp(estimatedCompletionTime));
	const durationLabel = $derived.by(() => {
		if (estimatedStartTime && estimatedCompletionTime) {
			return formatDurationBetweenDates(
				new Date(estimatedStartTime * 1000),
				new Date(estimatedCompletionTime * 1000),
				$t
			);
		}
		return '';
	});
	const resolvedErrorMessage = $derived(errorMessage);

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
		// Use shortfall amount when user has insufficient funds, otherwise use full payment amount
		const amountToRequest =
			walletVerificationErrorCode === 'insufficient_funds' &&
			shortfallUsd != null &&
			shortfallUsd > 0
				? shortfallUsd
				: totalPaymentValue;

		if (onAddFunds && amountToRequest != null) {
			onAddFunds(amountToRequest);
		} else {
			onClose();
			goto('/dashboard/wallet?tab=receive');
		}
	}

	function handleDrawerConfirmClick() {
		if (!canConfirm || isPreparing || isOffline || isSubmitting) {
			return;
		}

		confirmModalOpen = true;
	}

	function handleCancelConfirmation() {
		confirmModalOpen = false;
	}

	function handleConfirmEscrow() {
		confirmModalOpen = false;
		onConfirm();
	}
</script>

{#if open}
	<ContractInitiationDrawer
		{open}
		title={resolvedTitle}
		confirmLabel={$t('dashboard.services.detail.book_now_drawer.confirm_cta')}
		canConfirm={canConfirm && !isPreparing && !isOffline}
		hideFooter={showingContractCreationProgress}
		allowCloseWhileSubmitting={showingContractCreationProgress}
		{isSubmitting}
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

					<div class="divider text-base-content/60 mx-6 my-2 text-sm">
						{$t('dashboard.services.detail.book_now_drawer.contract_information')}
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
							<div class="flex flex-col gap-4 lg:flex-row">
								<div
									class="min-w-0 flex-1 rounded-lg px-3 pt-3"
									data-testid="service-agreement-provider"
								>
									<UserInfoDisplay
										avatar={providerAvatar}
										username={providerName ?? ''}
										rating={providerRating}
										size="sm"
										pubkey={providerPubkey}
										profileLink={providerPubkey}
										memberSince={providerMemberSince}
									/>
								</div>

								<div class="min-w-0 flex-1">
									<div class="bg-base-100 rounded-lg p-3 lg:bg-transparent">
										<div class="space-y-2 text-right">
											<div class="flex items-center justify-between gap-3 text-xs">
												<span class="text-base-content/70">
													{$t('dashboard.services.detail.book_now_drawer.base_amount')}
												</span>
												<span data-testid="service-agreement-base-amount">{baseAmountLabel}</span>
											</div>
											<div class="flex items-center justify-between gap-3 text-xs">
												<span class="text-base-content/70">
													{$t('dashboard.services.detail.book_now_drawer.platform_fee', {
														values: { fee: PLATFORM_FEE_PERCENT_LABEL }
													}) || `Platform Fee (${PLATFORM_FEE_PERCENT_LABEL})`}
												</span>
												<span data-testid="service-agreement-platform-fee">
													{platformFeeLabel}
												</span>
											</div>
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

							<div class="flex items-center justify-between gap-2 px-1">
								<!-- Start Date -->
								<div class="flex min-w-0 flex-col" data-testid="service-agreement-start">
									<div
										class="text-base-content/60 flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase"
									>
										<IconCalendarClock class="h-3.5 w-3.5" />
										<span>{$t('dashboard.services.detail.book_now_drawer.start_date')}</span>
									</div>
									<div class="mt-0.5 truncate text-xs font-bold sm:text-sm">
										{estimatedStartLabel}
									</div>
								</div>

								<!-- Duration Indicator -->
								{#if durationLabel}
									<div class="flex min-w-[60px] flex-1 flex-col items-center justify-center px-2">
										<div class="relative flex w-full items-center py-2">
											<div class="bg-primary/20 h-0.5 flex-1 rounded-full"></div>
											<div class="absolute inset-0 flex items-center justify-center">
												<span
													class="badge badge-ghost badge-xs text-primary border-primary/20 h-5 px-2 text-[11px] font-bold whitespace-nowrap shadow-sm"
												>
													{durationLabel}
												</span>
											</div>
											<div class="bg-primary/20 h-0.5 flex-1 rounded-full"></div>
											<div class="absolute -right-0.5 flex items-center">
												<div
													class="border-l-primary/30 border-t-[4px] border-b-[4px] border-l-[6px] border-transparent"
												></div>
											</div>
										</div>
									</div>
								{/if}

								<!-- Delivery Date -->
								<div
									class="flex min-w-0 flex-col items-end text-right"
									data-testid="service-agreement-delivery"
								>
									<div
										class="text-base-content/60 flex items-center justify-end gap-1.5 text-[10px] font-bold tracking-wider uppercase"
									>
										<span>{$t('dashboard.services.detail.book_now_drawer.delivery_date')}</span>
										<IconTruckDeliveryOutline class="h-3.5 w-3.5" />
									</div>
									<div class="mt-0.5 truncate text-xs font-bold sm:text-sm">
										{estimatedCompletionLabel}
									</div>
								</div>
							</div>

							{#if includedScope}
								<div class="bg-base-100 rounded-lg p-4">
									<div class="text-base-content/70 text-xs font-medium">
										{$t('dashboard.services.detail.book_now_drawer.included_scope')}
									</div>
									<div
										class="relative overflow-hidden transition-[max-height] duration-500 ease-in-out {showFullIncludedScope
											? 'max-h-[1000px]'
											: 'max-h-[4.5rem]'}"
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

							<ContractFundingWalletCard
								title={$t('dashboard.services.detail.book_now_drawer.wallet_balance')}
								iconAlt={$t('dashboard.services.detail.book_now_drawer.wallet_icon_alt')}
								balanceSats={walletBalanceSats}
								balanceUsd={walletBalanceUsd}
								satsLabel={$t('dashboard.services.detail.book_now_drawer.sats')}
								notConnectedLabel={$t(
									'dashboard.services.detail.book_now_drawer.wallet_not_connected'
								)}
								availableLabel={$t('dashboard.services.detail.book_now_drawer.available_balance')}
								requiredLabel={$t('dashboard.services.detail.book_now_drawer.required_balance')}
								requiredUsd={requiredBalanceUsd}
								requiredSats={requiredBalanceSats}
								loading={walletLoading}
								connected={walletConnected}
								verificationStatus={walletVerificationStatus === 'error'
									? 'idle'
									: walletVerificationStatus}
								verificationMessage={walletVerificationStatus === 'error'
									? ''
									: walletVerificationMessage}
								forceOpen={false}
							/>

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

							<div
								class="alert alert-outline alert-warning text-sm"
								data-testid="service-instant-buy-confirm-warning"
							>
								<span>
									{$t('dashboard.services.detail.book_now_drawer.confirm_warning')}
								</span>
							</div>
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
