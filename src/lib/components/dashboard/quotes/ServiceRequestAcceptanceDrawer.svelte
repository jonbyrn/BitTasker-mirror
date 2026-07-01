<script lang="ts">
	import { FEE_TIERS } from '@bittasker/wallet-core';
	import { goto } from '$app/navigation';
	import ContractInitiationDrawer from '$lib/components/contracts/ContractInitiationDrawer.svelte';
	import ContractFundingWalletCard from '$lib/components/contracts/ContractFundingWalletCard.svelte';
	import type { Service } from '$lib/types/service';
	import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
	import { getServiceDisplayTitle } from '$lib/utils/serviceDisplayTranslation';
	import { formatStandardDateTimeShort } from '$lib/utils/helpers/dateFormatter';
	import { normalizeServiceContractSchedule } from '$lib/utils/service-contract/schedule';
	import { locale, t } from 'svelte-i18n';
	import IconCalendarClock from '~icons/mdi/calendar-clock';
	import IconTruckDeliveryOutline from '~icons/mdi/truck-delivery-outline';
	import IconRefresh from '~icons/mdi/refresh';
	import BookingDatesDisplay from '$lib/components/shared/BookingDatesDisplay.svelte';

	const {
		open = false,
		timeline = null,
		service = null,
		isSubmitting = false,
		disabled = false,
		showContractCreationProgress = false,
		contractCreationStatus = 'creating',
		errorMessage = '',
		errorHint = '',
		walletLoading = false,
		walletConnected = false,
		walletBalanceSats = '',
		walletBalanceUsd = '',
		requiredBalanceSats = '',
		requiredBalanceUsd = '',
		walletVerificationStatus = 'idle',
		walletVerificationMessage = '',
		walletVerificationErrorCode = null,
		onConfirm = () => {},
		onRetry = () => {},
		onRefresh = () => {},
		onAddFunds = undefined,
		onClose = () => {}
	} = $props<{
		open?: boolean;
		timeline: ServiceQuoteTimelineEntry | null;
		service?: Service | null;
		isSubmitting?: boolean;
		disabled?: boolean;
		showContractCreationProgress?: boolean;
		contractCreationStatus?: 'creating' | 'success';
		errorMessage?: string;
		errorHint?: string;
		walletLoading?: boolean;
		walletConnected?: boolean;
		walletBalanceSats?: string;
		walletBalanceUsd?: string;
		requiredBalanceSats?: string;
		requiredBalanceUsd?: string;
		walletVerificationStatus?: 'idle' | 'verifying' | 'ready' | 'error';
		walletVerificationMessage?: string;
		walletVerificationErrorCode?: string | null;
		onConfirm?: () => void;
		onRetry?: () => void;
		onRefresh?: () => void;
		onAddFunds?: (amountUsd: number) => void;
		onClose?: () => void;
	}>();

	function tr(key: string, fallback: string): string {
		try {
			const value = $t(key);
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}

	function trv(key: string, fallback: string, values: Record<string, string | number>): string {
		try {
			const value = $t(key, { values });
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}

	function formatTimestamp(timestampSeconds: number | undefined): string {
		if (!timestampSeconds) {
			return '—';
		}

		return formatStandardDateTimeShort(new Date(timestampSeconds * 1000), $locale || 'en');
	}

	function formatUsdLabel(value: number | null): string {
		if (value == null || !Number.isFinite(value)) {
			return '—';
		}

		return `$${value.toFixed(2)}`;
	}

	const DEFAULT_CLIENT_FEE_TIER = 1;
	const ESTIMATED_NETWORK_FEE_USD = 0.5;
	const PLATFORM_FEE_RATE = FEE_TIERS[DEFAULT_CLIENT_FEE_TIER].percentage / 10000;
	const PLATFORM_FEE_PERCENT_LABEL = `${(PLATFORM_FEE_RATE * 100).toFixed(1)}%`;
	const latestProposal = $derived.by(() => timeline?.latestProposal ?? null);
	const serviceTitle = $derived.by(() => {
		if (service) {
			return getServiceDisplayTitle(service, $locale || 'en') || service.title;
		}

		return (
			timeline?.request.content.inquiry.title ??
			tr('dashboard.service_requests.drawer.title', 'Service request')
		);
	});
	const selectedTierLabel = $derived.by(() => {
		if (!service || !latestProposal) {
			return null;
		}

		const tierId =
			latestProposal.content.pricingSnapshot.tierId ?? timeline?.request.content.tierId;
		if (!tierId) {
			return null;
		}

		return (
			service.pricing?.tiers?.find((tier: { id: string; name: string }) => tier.id === tierId)
				?.name ?? null
		);
	});
	const addOnLabels = $derived.by(() => {
		if (!service || !latestProposal) {
			return [];
		}

		const selectedAddOns =
			latestProposal.content.pricingSnapshot.selectedAddOns ??
			timeline?.request.content.selectedAddOns ??
			[];

		return selectedAddOns.map((addOnId: string) => {
			const matchedAddOn = service.pricing?.simpleAddOns?.find(
				(addOn: { id: string; name: string }) => addOn.id === addOnId
			);
			return matchedAddOn?.name ?? addOnId;
		});
	});
	const rushDeliverySelected = $derived.by(
		() =>
			latestProposal?.content.pricingSnapshot.rushDelivery ??
			timeline?.request.content.rushDelivery ??
			false
	);
	const baseAmountValue = $derived.by(() => {
		const numericAmount = Number(latestProposal?.content.amountUsdt);
		return Number.isFinite(numericAmount) && numericAmount > 0 ? numericAmount : null;
	});
	const platformFeeValue = $derived.by(() =>
		baseAmountValue != null ? baseAmountValue * PLATFORM_FEE_RATE : null
	);
	const totalPaymentValue = $derived.by(() =>
		baseAmountValue != null && platformFeeValue != null
			? baseAmountValue + platformFeeValue + ESTIMATED_NETWORK_FEE_USD
			: null
	);
	const baseAmountLabel = $derived(formatUsdLabel(baseAmountValue));
	const platformFeeLabel = $derived(formatUsdLabel(platformFeeValue));
	const estimatedNetworkFeeLabel = $derived(formatUsdLabel(ESTIMATED_NETWORK_FEE_USD));
	const totalPaymentLabel = $derived(formatUsdLabel(totalPaymentValue));
	const selectedAddOns = $derived(addOnLabels);
	const includedScope = $derived(latestProposal?.content.description?.trim() ?? '');
	const normalizedSchedule = $derived.by(() =>
		normalizeServiceContractSchedule(
			latestProposal?.content.estimatedStartTime ?? 0,
			latestProposal?.content.estimatedEndTime ?? 0
		)
	);
	const proposalExpiresLabel = $derived(
		formatTimestamp(latestProposal?.content.expirationTimestamp)
	);
	const canConfirm = $derived.by(() => Boolean(latestProposal) && !disabled);
	const showingContractCreationProgress = $derived(showContractCreationProgress);

	function handleAddFunds() {
		if (onAddFunds && totalPaymentValue != null) {
			onAddFunds(totalPaymentValue);
		} else {
			onClose();
			goto('/wallet?tab=receive');
		}
	}

	const timingWarningMessage = $derived.by(() =>
		normalizedSchedule.startWasAdjusted
			? tr(
					'dashboard.service_requests.accept_drawer.start_time_adjusted_warning',
					'The quoted start time has already passed. The contract will use a start time about one hour from now and keep the quoted duration.'
				)
			: ''
	);
</script>

<ContractInitiationDrawer
	{open}
	title={tr('dashboard.service_requests.accept_drawer.title', 'Accept proposal')}
	confirmLabel={tr('dashboard.service_requests.accept_drawer.confirm', 'Accept Proposal')}
	{canConfirm}
	hideFooter={showingContractCreationProgress}
	allowCloseWhileSubmitting={showingContractCreationProgress}
	{isSubmitting}
	errorMessage={walletVerificationErrorCode === 'insufficient_funds' ? '' : errorMessage}
	errorHint={walletVerificationErrorCode === 'insufficient_funds' ? '' : errorHint}
	warningMessage={timingWarningMessage}
	drawerTestId="service-request-acceptance-drawer"
	confirmTestId="service-request-acceptance-confirm"
	retryTestId="service-request-acceptance-retry"
	{onConfirm}
	{onRetry}
	{onClose}
>
	<div class="space-y-6 py-1">
		{#if showingContractCreationProgress}
			<div
				class="space-y-6 py-2 text-center"
				data-testid="service-request-acceptance-contract-progress"
			>
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
						{tr(
							'dashboard.services.detail.book_now_drawer.processing_title',
							'Creating your secure payment contract'
						)}
					</h3>
					<p class="text-base-content/70 text-sm">
						{tr(
							'dashboard.services.detail.book_now_drawer.processing_message',
							'You can close this drawer. We will keep preparing the contract in the background.'
						)}
					</p>
				</div>

				<div
					class="bg-base-200 rounded-lg p-4"
					data-testid="service-request-acceptance-contract-status"
				>
					<h4 class="mb-3 font-semibold">
						{tr(
							'dashboard.services.detail.book_now_drawer.contract_creation_status',
							'Contract creation status'
						)}
					</h4>
					<div class="flex items-center gap-3 text-left">
						{#if contractCreationStatus === 'success'}
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
								{tr(
									'dashboard.services.detail.book_now_drawer.contract_created',
									'Contract created'
								)}
							</p>
						{:else}
							<span class="loading loading-spinner loading-sm text-info shrink-0"></span>
							<p class="text-info font-medium">
								{tr(
									'dashboard.services.detail.book_now_drawer.creating_contract',
									'Creating contract'
								)}
							</p>
						{/if}
					</div>
				</div>

				<div class="bg-base-200 rounded-lg p-4 text-left">
					<h4 class="mb-2 font-semibold">
						{tr(
							'dashboard.services.detail.book_now_drawer.what_happens_next_title',
							'What happens next'
						)}
					</h4>
					<ul class="text-base-content/80 space-y-1 text-sm">
						<li>
							• {tr(
								'dashboard.services.detail.book_now_drawer.next_item_notify',
								'The provider will be notified once the contract is ready.'
							)}
						</li>
						<li>
							• {tr(
								'dashboard.services.detail.book_now_drawer.next_item_begin',
								'Work can begin after the contract is confirmed.'
							)}
						</li>
						<li>
							• {tr(
								'dashboard.services.detail.book_now_drawer.next_item_funds_held',
								'Your funds remain secured in the contract until completion.'
							)}
						</li>
						<li>
							• {tr(
								'dashboard.services.detail.book_now_drawer.next_item_release',
								'Funds are released only after the service is completed.'
							)}
						</li>
						{#if contractCreationStatus === 'success'}
							<li>
								• {tr(
									'dashboard.services.detail.book_now_drawer.next_item_contract_details',
									'You can review the full contract details in Contracts.'
								)}
							</li>
						{/if}
					</ul>
				</div>
			</div>
		{:else if latestProposal}
			<div class="bg-base-300 rounded-2xl">
				<div class="flex items-start justify-between gap-2 px-6 pt-3">
					<div class="min-w-0 flex-1">
						<h5 class="wrap-break-words line-clamp-2 text-lg font-semibold">
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
					{tr(
						'dashboard.services.detail.book_now_drawer.contract_information',
						'Contract Information'
					)}
				</div>

				<div class="flex flex-col gap-4 px-3 pb-4">
					<div class="flex flex-col gap-4 lg:flex-row">
						<div class="min-w-0 flex-1 rounded-lg px-3 pt-3">
							<UserInfoDisplay
								avatar={service?.creator?.avatar ?? null}
								username={service?.creator?.username ?? ''}
								rating={service?.creator?.rating ?? null}
								size="sm"
								pubkey={latestProposal.pubkey}
								profileLink={latestProposal.pubkey}
							/>
						</div>

						<div class="min-w-0 flex-1">
							<div class="bg-base-100 rounded-lg p-3 lg:bg-transparent">
								<div class="space-y-2 text-right">
									<div class="flex items-center justify-between gap-3 text-xs">
										<span class="text-base-content/70">
											{tr('dashboard.services.detail.book_now_drawer.base_amount', 'Base Amount')}
										</span>
										<span data-testid="service-request-acceptance-base-amount">
											{baseAmountLabel}
										</span>
									</div>
									<div class="flex items-center justify-between gap-3 text-xs">
										<span class="text-base-content/70">
											{trv(
												'dashboard.services.detail.book_now_drawer.platform_fee',
												`Platform Fee (${PLATFORM_FEE_PERCENT_LABEL})`,
												{ fee: PLATFORM_FEE_PERCENT_LABEL }
											)}
										</span>
										<span data-testid="service-request-acceptance-platform-fee">
											{platformFeeLabel}
										</span>
									</div>
									<div class="flex items-center justify-between gap-3 text-xs italic">
										<span class="text-base-content/70">
											{tr(
												'dashboard.services.detail.book_now_drawer.estimated_network_fee',
												'Estimated network fee'
											)}
										</span>
										<span data-testid="service-request-acceptance-network-fee">
											{estimatedNetworkFeeLabel}
										</span>
									</div>
									<div class="border-base-200 border-t pt-2">
										<div class="flex items-center justify-between gap-3">
											<span class="text-sm font-semibold">
												{tr(
													'dashboard.services.detail.book_now_drawer.total_payment',
													'Total payment'
												)}
											</span>
											<span
												class="text-primary text-lg font-bold"
												data-testid="service-request-acceptance-total"
											>
												{totalPaymentLabel}
											</span>
										</div>
									</div>
								</div>

								{#if selectedTierLabel}
									<div class="mt-3 flex items-center justify-between text-xs">
										<span class="text-base-content/70">
											{tr(
												'dashboard.services.detail.book_now_drawer.selected_tier',
												'Selected tier'
											)}
										</span>
										<div>
											<span class="badge badge-outline badge-primary">{selectedTierLabel}</span>
										</div>
									</div>
								{/if}

								{#if selectedAddOns.length > 0}
									<div class="text-base-content/70 mt-3 text-xs">
										{tr('dashboard.services.detail.book_now_drawer.add_ons', 'Add-ons')}
									</div>
									<div class="mt-1 flex flex-wrap gap-2">
										{#each selectedAddOns as addOn (addOn)}
											<span class="badge badge-outline">{addOn}</span>
										{/each}
									</div>
								{/if}

								{#if rushDeliverySelected}
									<div class="mt-3 flex justify-end">
										<span class="badge badge-outline">
											{tr('dashboard.service_requests.rush_delivery', 'Rush delivery')}
										</span>
									</div>
								{/if}
							</div>
						</div>
					</div>

					<div class="space-y-4 text-sm">
						<!-- Booking Dates -->
						<BookingDatesDisplay
							startTime={normalizedSchedule.estimatedStartTime}
							endTime={normalizedSchedule.estimatedCompletionTime}
							startLabel={tr('dashboard.services.detail.book_now_drawer.start_date', 'Start date')}
							endLabel={tr(
								'dashboard.services.detail.book_now_drawer.delivery_date',
								'Delivery date'
							)}
						/>

						<!-- Expiry Row -->
						<div
							class="border-base-200 flex items-center justify-between gap-4 border-t px-1 pt-2 opacity-80"
						>
							<div class="flex min-w-0 flex-col">
								<div
									class="text-base-content/60 flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase"
								>
									<IconCalendarClock class="h-3.5 w-3.5" />
									<span
										>{tr(
											'dashboard.service_requests.accept_drawer.expires',
											'Proposal expires'
										)}</span
									>
								</div>
								<div class="mt-0.5 truncate text-[11px] font-semibold">
									{proposalExpiresLabel}
								</div>
							</div>
							<div class="flex min-w-0 flex-col items-end text-right">
								<div
									class="text-base-content/60 flex items-center justify-end gap-1.5 text-[10px] font-bold tracking-wider uppercase"
								>
									<span
										>{tr(
											'dashboard.service_requests.estimated_duration',
											'Estimated duration'
										)}</span
									>
									<IconTruckDeliveryOutline class="h-3.5 w-3.5" />
								</div>
								<div class="mt-0.5 truncate text-[11px] font-semibold">
									{latestProposal.content.estimatedDuration || '—'}
								</div>
							</div>
						</div>
					</div>

					{#if includedScope}
						<div class="bg-base-100 rounded-lg p-4">
							<div class="text-base-content/70 text-xs font-medium">
								{tr('dashboard.services.detail.book_now_drawer.included_scope', 'Included scope')}
							</div>
							<p class="text-base-content/80 mt-2 text-sm whitespace-pre-line">
								{includedScope}
							</p>
						</div>
					{/if}

					{#if latestProposal.content.coverLetter}
						<div class="bg-base-100 rounded-lg p-4">
							<div class="text-base-content/70 text-xs font-medium">
								{tr('dashboard.service_requests.drawer.cover_letter', 'Cover letter')}
							</div>
							<p class="text-base-content/80 mt-2 text-sm whitespace-pre-line">
								{latestProposal.content.coverLetter}
							</p>
						</div>
					{/if}

					<ContractFundingWalletCard
						title={tr('dashboard.services.detail.book_now_drawer.wallet_balance', 'Wallet balance')}
						iconAlt={tr('dashboard.services.detail.book_now_drawer.wallet_icon_alt', 'Bitcoin')}
						balanceSats={walletBalanceSats}
						balanceUsd={walletBalanceUsd}
						satsLabel={tr('dashboard.services.detail.book_now_drawer.sats', 'sats')}
						notConnectedLabel={tr(
							'dashboard.services.detail.book_now_drawer.wallet_not_connected',
							'Wallet not connected'
						)}
						availableLabel={tr(
							'dashboard.services.detail.book_now_drawer.available_balance',
							'Available balance'
						)}
						requiredLabel={tr(
							'dashboard.services.detail.book_now_drawer.required_balance',
							'Required for this contract'
						)}
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
							<div class="flex-1 text-left">
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
						data-testid="service-request-acceptance-confirm-warning"
					>
						<span>
							{tr(
								'dashboard.service_requests.accept_drawer.warning',
								'Accepting this proposal will create a service contract using the received quote details.'
							)}
						</span>
					</div>
				</div>
			</div>
		{/if}
	</div>
</ContractInitiationDrawer>
