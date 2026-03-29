<script lang="ts">
	import { FEE_TIERS } from '@bittasker/wallet-core';
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
	import IconTimerOutline from '~icons/mdi/timer-outline';

	const {
		open = false,
		timeline = null,
		service = null,
		isSubmitting = false,
		disabled = false,
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
		onConfirm = () => {},
		onRetry = () => {},
		onClose = () => {}
	} = $props<{
		open?: boolean;
		timeline: ServiceQuoteTimelineEntry | null;
		service?: Service | null;
		isSubmitting?: boolean;
		disabled?: boolean;
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
		onConfirm?: () => void;
		onRetry?: () => void;
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

		return service.pricing?.tiers?.find((tier) => tier.id === tierId)?.name ?? tierId;
	});
	const addOnLabels = $derived.by(() => {
		if (!service || !latestProposal) {
			return [];
		}

		const selectedAddOns =
			latestProposal.content.pricingSnapshot.selectedAddOns ??
			timeline?.request.content.selectedAddOns ??
			[];

		return selectedAddOns.map((addOnId) => {
			const matchedAddOn = service.pricing?.simpleAddOns?.find((addOn) => addOn.id === addOnId);
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
	const estimatedStartLabel = $derived(formatTimestamp(normalizedSchedule.estimatedStartTime));
	const estimatedCompletionLabel = $derived(
		formatTimestamp(normalizedSchedule.estimatedCompletionTime)
	);
	const proposalExpiresLabel = $derived(
		formatTimestamp(latestProposal?.content.expirationTimestamp)
	);
	const canConfirm = $derived.by(() => Boolean(latestProposal) && !disabled);
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
	subtitle={tr(
		'dashboard.service_requests.accept_drawer.subtitle',
		'Review the quote details before creating the service contract.'
	)}
	confirmLabel={tr('dashboard.service_requests.accept_drawer.confirm', 'Accept Proposal')}
	{canConfirm}
	{isSubmitting}
	{errorMessage}
	{errorHint}
	warningMessage={timingWarningMessage}
	drawerTestId="service-request-acceptance-drawer"
	confirmTestId="service-request-acceptance-confirm"
	retryTestId="service-request-acceptance-retry"
	{onConfirm}
	{onRetry}
	{onClose}
>
	<div class="space-y-6 py-1">
		{#if latestProposal}
			<div class="bg-base-300 rounded-2xl">
				<div class="w-full min-w-0 px-6 pt-3">
					<h5 class="wrap-break-words line-clamp-2 text-lg font-semibold">
						{serviceTitle}
					</h5>
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
								rating={service?.creator?.rating ?? 0}
								size="sm"
								pubkey={latestProposal.pubkey}
								profileLink={latestProposal.pubkey}
								memberSince={service?.createdAt ?? timeline?.request.created_at ?? null}
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
									<div class="text-base-content/70 mt-3 text-xs">
										{tr('dashboard.services.detail.book_now_drawer.selected_tier', 'Selected tier')}
									</div>
									<div class="mt-1">
										<span class="badge badge-outline badge-primary">{selectedTierLabel}</span>
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

					<div class="space-y-3 text-sm">
						<div class="flex min-w-0 items-center gap-3">
							<IconCalendarClock class="text-primary h-6 w-6 shrink-0" />
							<div class="min-w-0">
								<div class="text-base-content/60 text-xs font-medium">
									{tr('dashboard.services.detail.book_now_drawer.start_date', 'Start date')}
								</div>
								<div class="break-words">{estimatedStartLabel}</div>
							</div>
						</div>
						<div class="flex min-w-0 items-center gap-3">
							<IconTimerOutline class="text-primary h-6 w-6 shrink-0" />
							<div class="min-w-0">
								<div class="text-base-content/60 text-xs font-medium">
									{tr('dashboard.services.detail.book_now_drawer.delivery_date', 'Delivery date')}
								</div>
								<div class="break-words">{estimatedCompletionLabel}</div>
							</div>
						</div>
						<div class="flex min-w-0 items-center gap-3">
							<IconCalendarClock class="text-primary h-6 w-6 shrink-0" />
							<div class="min-w-0">
								<div class="text-base-content/60 text-xs font-medium">
									{tr('dashboard.service_requests.accept_drawer.expires', 'Proposal expires')}
								</div>
								<div class="break-words">{proposalExpiresLabel}</div>
							</div>
						</div>
						<div class="flex min-w-0 items-center gap-3">
							<IconTimerOutline class="text-primary h-6 w-6 shrink-0" />
							<div class="min-w-0">
								<div class="text-base-content/60 text-xs font-medium">
									{tr('dashboard.service_requests.estimated_duration', 'Estimated duration')}
								</div>
								<div class="break-words">{latestProposal.content.estimatedDuration || '—'}</div>
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
						verificationStatus={walletVerificationStatus}
						verificationMessage={walletVerificationMessage}
						forceOpen={walletLoading || walletVerificationStatus === 'error'}
					/>

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
