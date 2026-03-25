<script lang="ts">
	import { format } from 'date-fns';
	import { t } from 'svelte-i18n';
	import { FEE_TIERS } from '@bittasker/wallet-core';
	import ContractInitiationDrawer from '$lib/components/contracts/ContractInitiationDrawer.svelte';
	import ContractFundingWalletCard from '$lib/components/contracts/ContractFundingWalletCard.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
	import IconCalendarClock from '~icons/mdi/calendar-clock';
	import IconTimerOutline from '~icons/mdi/timer-outline';
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
		onClose = () => {}
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
		onClose?: () => void;
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
	const totalPaymentLabel = $derived(formatUsdLabel(totalPaymentValue));
	const estimatedStartLabel = $derived(formatTimestamp(estimatedStartTime));
	const estimatedCompletionLabel = $derived(formatTimestamp(estimatedCompletionTime));
	const resolvedErrorMessage = $derived(errorMessage);
	const resolvedErrorHint = $derived(resolvedErrorMessage ? errorHint : '');
	const resolvedTitle = $derived(
		title || ($t('dashboard.services.detail.book_now_drawer.title') as string)
	);
	const showingContractCreationProgress = $derived(
		showContractCreationProgress || contractCreationStatus !== 'idle'
	);
	let confirmModalOpen = $state(false);

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
		errorMessage={resolvedErrorMessage}
		errorHint={resolvedErrorHint}
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
					<div class="w-full min-w-0 px-6 pt-3">
						<h5
							class="wrap-break-words line-clamp-2 text-lg font-semibold"
							data-testid="service-instant-buy-title"
						>
							{serviceTitle}
						</h5>
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
											<div class="text-base-content/70 mt-3 text-xs">
												{$t('dashboard.services.detail.book_now_drawer.selected_tier')}
											</div>
											<div class="mt-1" data-testid="service-agreement-tier">
												<span class="badge badge-outline badge-primary">{selectedTierLabel}</span>
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

							<div class="space-y-3 text-sm">
								<div class="flex min-w-0 items-center gap-3" data-testid="service-agreement-start">
									<IconCalendarClock class="text-primary h-6 w-6 shrink-0" />
									<div class="min-w-0">
										<div class="text-base-content/60 text-xs font-medium">
											{$t('dashboard.services.detail.book_now_drawer.start_date')}
										</div>
										<div class="truncate">{estimatedStartLabel}</div>
									</div>
								</div>
								<div
									class="flex min-w-0 items-center gap-3"
									data-testid="service-agreement-delivery"
								>
									<IconTimerOutline class="text-primary h-6 w-6 shrink-0" />
									<div class="min-w-0">
										<div class="text-base-content/60 text-xs font-medium">
											{$t('dashboard.services.detail.book_now_drawer.delivery_date')}
										</div>
										<div class="truncate">{estimatedCompletionLabel}</div>
									</div>
								</div>
							</div>

							{#if includedScope}
								<div class="bg-base-100 rounded-lg p-4">
									<div class="text-base-content/70 text-xs font-medium">
										{$t('dashboard.services.detail.book_now_drawer.included_scope')}
									</div>
									<p
										class="text-base-content/80 mt-2 text-sm whitespace-pre-line"
										data-testid="service-agreement-scope"
									>
										{includedScope}
									</p>
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
								verificationStatus={walletVerificationStatus}
								verificationMessage={walletVerificationMessage}
								forceOpen={walletLoading || walletVerificationStatus === 'error'}
							/>

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
