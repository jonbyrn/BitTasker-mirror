<script lang="ts">
	import { t } from 'svelte-i18n';
	import IconRefresh from '~icons/mdi/refresh';
	import { walletConnectionStore } from '$lib/stores/wallet/wallet-link';

	let {
		title = undefined,
		iconAlt = undefined,
		balanceSats = '0',
		balanceUsd = '—',
		satsLabel = undefined,
		notConnectedLabel = undefined,
		availableLabel = undefined,
		requiredLabel = undefined,
		requiredUsd = '—',
		_requiredSats = '',
		remainingUsd = '—',
		remainingSats = '',
		remainingIsNegative = false,
		loading = false,
		connected = false,
		onRefresh = undefined,
		connectionError = '',
		verificationStatus = 'idle',
		verificationMessage = '',
		forceOpen = false,
		availableBalance = undefined,
		iconSrc = '/images/chains/Bitcoin.svg'
	} = $props<{
		title?: string;
		iconAlt?: string;
		balanceSats?: string;
		balanceUsd?: string;
		satsLabel?: string;
		notConnectedLabel?: string;
		availableLabel?: string;
		requiredLabel?: string;
		requiredUsd?: string;
		requiredSats?: string;
		remainingUsd?: string;
		remainingSats?: string;
		remainingIsNegative?: boolean;
		loading?: boolean;
		connected?: boolean;
		onRefresh?: () => void;
		connectionError?: string;
		verificationStatus?: 'idle' | 'verifying' | 'ready' | 'error';
		verificationMessage?: string;
		forceOpen?: boolean;
		availableBalance?: string;
		iconSrc?: string;
	}>();

	let expanded = $state(false);
	const liveWallet = $derived($walletConnectionStore);
	const liveConnected = $derived(liveWallet.phase === 'ready' || connected);
	const liveConnectionText = $derived(liveWallet.phase === 'ready' ? '' : liveWallet.headline);

	const walletStatusClass = $derived.by(() => {
		if (verificationStatus === 'ready') {
			return 'alert-success';
		}
		if (verificationStatus === 'error') {
			return 'alert-error';
		}
		return 'alert-info';
	});

	function tr(key: string, fallback: string): string {
		try {
			const value = $t(key);
			return typeof value === 'string' && value !== key ? value : fallback;
		} catch {
			return fallback;
		}
	}

	const resolvedTitle = $derived(
		title ?? tr('dashboard.contracts.wallet_card.title', 'Wallet balance')
	);
	const resolvedIconAlt = $derived(
		iconAlt ?? tr('dashboard.contracts.wallet_card.icon_alt', 'Bitcoin')
	);
	const resolvedSatsLabel = $derived(
		satsLabel ?? tr('dashboard.contracts.wallet_card.sats_label', 'sats')
	);
	const resolvedNotConnectedLabel = $derived(
		notConnectedLabel ?? tr('dashboard.contracts.wallet_card.not_connected', 'Wallet not connected')
	);
	const resolvedAvailableLabel = $derived(
		availableLabel ?? tr('dashboard.contracts.wallet_card.available_balance', 'Available balance')
	);
	const resolvedRequiredLabel = $derived(
		requiredLabel ??
			tr('dashboard.contracts.wallet_card.required_balance', 'Required for this contract')
	);
	const resolvedRemainingLabel = $derived(
		remainingUsd !== '—' || remainingSats !== ''
			? tr('dashboard.contracts.wallet_card.remaining_balance', 'Remaining')
			: ''
	);
</script>

<div
	class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
	class:collapse-open={expanded || forceOpen}
	data-testid="contract-funding-wallet-card"
>
	<div
		role="button"
		tabindex="0"
		class="collapse-title flex items-center justify-between px-3 py-2 pr-10 text-left text-sm font-medium sm:px-4 sm:py-3 sm:pr-12 sm:text-base"
		onclick={() => (expanded = !expanded)}
		onkeydown={(e) => e.key === 'Enter' && (expanded = !expanded)}
	>
		<div class="flex min-w-0 flex-1 items-center gap-2">
			<img src={iconSrc} alt={resolvedIconAlt} class="h-5 w-5 shrink-0 sm:h-6 sm:w-6" />
			<div class="flex items-center gap-2 overflow-hidden">
				<span class="truncate">{resolvedTitle}</span>
				{#if onRefresh}
					<button
						type="button"
						class="btn btn-ghost btn-xs btn-circle shrink-0"
						onclick={(e) => {
							e.stopPropagation();
							onRefresh();
						}}
						disabled={loading}
						aria-label={$t('common.buttons.refresh')}
					>
						<IconRefresh class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}" />
					</button>
				{/if}
			</div>
		</div>
		<div class="ml-2 shrink-0 text-right">
			{#if loading}
				<div class="flex h-9 w-9 flex-col items-end justify-center gap-0.5">
					<span class="loading loading-spinner loading-md"></span>
				</div>
			{:else if liveConnectionText}
				<div
					class="text-sm font-semibold sm:text-base {liveWallet.phase === 'error'
						? 'text-error'
						: ''}"
					data-testid="contract-funding-wallet-connection"
				>
					{connectionError || liveConnectionText}
				</div>
			{:else if !liveConnected || connectionError}
				<div class="text-error text-sm font-semibold sm:text-base">
					{connectionError || resolvedNotConnectedLabel}
				</div>
			{:else}
				<div class="text-sm font-semibold sm:text-base">{balanceSats} {resolvedSatsLabel}</div>
				<div class="text-xs opacity-70 sm:text-sm">{balanceUsd}</div>
			{/if}
		</div>
	</div>
	<div class="collapse-content">
		<div class="space-y-2 px-3 pb-1.5 sm:px-4 sm:pb-2">
			<div class="flex items-center justify-between gap-2 text-sm">
				<span class="text-base-content/70">{resolvedAvailableLabel}</span>
				<span>{availableBalance ?? balanceUsd}</span>
			</div>
			<div class="flex items-center justify-between gap-2 text-sm">
				<span class="text-base-content/70">{resolvedRequiredLabel}</span>
				<span class="text-right">
					{requiredUsd}
				</span>
			</div>
			{#if resolvedRemainingLabel}
				<div class="border-base-content/10 border-t py-1"></div>
				<div class="flex items-center justify-between gap-2 text-sm">
					<span class="text-base-content/70 font-semibold">{resolvedRemainingLabel}</span>
					<span
						class="{remainingIsNegative ? 'text-error' : 'text-success'} text-right font-semibold"
					>
						{remainingUsd}
					</span>
				</div>
			{/if}

			{#if verificationStatus === 'verifying'}
				<div class="alert alert-info text-sm">
					<span class="loading loading-spinner loading-sm"></span>
					<span data-testid="contract-funding-wallet-message">{verificationMessage}</span>
				</div>
			{:else if (verificationStatus !== 'idle' && verificationStatus !== 'verifying') || (verificationMessage && verificationStatus !== 'verifying')}
				<div class={`alert alert-outline text-sm ${walletStatusClass}`}>
					<span data-testid="contract-funding-wallet-message">{verificationMessage}</span>
				</div>
			{/if}
		</div>
	</div>
</div>
