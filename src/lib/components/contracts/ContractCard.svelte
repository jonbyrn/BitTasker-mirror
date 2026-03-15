<script lang="ts">
	import type { ContractWithEvents } from '$lib/types/contract';
	import {
		getStatusTranslationKey,
		getStatusColorClass
	} from '$lib/utils/helpers/contractStatusFormatter';
	import { contractStore } from '$lib/stores/contract.store';
	import { t } from 'svelte-i18n';
	import ContractActions from './ContractActions.svelte';
	import UserNostrBadge from '../UserNostrBadge.svelte';
	import TaskDeadlineDisplay from '../task/TaskDeadlineDisplay.svelte';
	import TaskLocationDisplay from '../task/TaskLocationDisplay.svelte';
	import {
		getPaymentRailLabel,
		resolvePaymentContext
	} from '$lib/utils/helpers/paymentContext';

	const { contract, btcPrice } = $props<{
		contract: ContractWithEvents;
		btcPrice: number;
	}>();

	const rawPaymentAsset = $derived(contract.contractEvent.content.paymentAsset ?? null);
	const paymentContext = $derived(
		resolvePaymentContext(rawPaymentAsset, contract.contractEvent.content.paymentNetwork)
	);
	const paymentAsset = $derived(paymentContext.paymentAsset);
	const hasExplicitPaymentNetwork = $derived(
		Boolean(contract.contractEvent.content.paymentNetwork?.trim())
	);
	const hasExplicitPaymentAssetContext = $derived(rawPaymentAsset === 'USDT' || rawPaymentAsset === 'RBTC');
	const paymentNetwork = $derived(paymentContext.paymentNetwork);
	const paymentRailLabel = $derived(getPaymentRailLabel(paymentAsset, paymentNetwork));
	const isUsdtContract = $derived(paymentAsset === 'USDT' && !shouldFailClosedBscAmountDisplay);
	const isLegacyMissingContextContract = $derived(
		contract.blockchainStatus === null &&
			!contract.isPending &&
			!contract.contractEvent.content.transactionHash &&
			!hasExplicitPaymentNetwork &&
			!hasExplicitPaymentAssetContext
	);
	const isMetadataOnlyBscContract = $derived(
		paymentNetwork.startsWith('bsc') && contract.blockchainStatus === null
	);
	const shouldFailClosedBscAmountDisplay = $derived(
		isMetadataOnlyBscContract && !hasExplicitPaymentAssetContext
	);
	const contractRailLabel = $derived(
		isLegacyMissingContextContract
			? 'Legacy escrow'
			: shouldFailClosedBscAmountDisplay
				? 'BSC escrow'
				: paymentRailLabel
	);

	// Check if blockchain query failed (no blockchain status and not pending)
	const isBlockchainQueryFailed = $derived(
		contract.blockchainStatus === null &&
			!contract.isPending &&
			!contract.contractEvent.content.transactionHash &&
			!isLegacyMissingContextContract &&
			!contract.contractEvent.content.paymentNetwork?.startsWith('bsc')
	);

	// Format RBTC amount
	function formatRBTC(amount: string): string {
		const num = parseFloat(amount);
		return num.toFixed(4);
	}

	// Format price with stacked USD and Sats
	function formatPriceStacked(amount: string, btcPrice: number): { usd: string; sats: string } {
		const rbtc = parseFloat(amount);
		if (isNaN(rbtc) || btcPrice <= 0) {
			return { usd: '$0.00', sats: '0 Sats' };
		}

		// Convert RBTC to USD (assuming RBTC ≈ BTC)
		const usdAmount = rbtc * btcPrice;

		// Convert to sats
		const sats = Math.round(rbtc * 100_000_000);

		return {
			usd: `$${usdAmount.toFixed(2)}`,
			sats: `${sats.toLocaleString('en-US')} Sats`
		};
	}

	function formatTokenAmount(amount: string): string {
		const num = Number.parseFloat(amount);
		if (!Number.isFinite(num)) {
			return `${amount} ${paymentAsset}`;
		}

		return `${num.toLocaleString('en-US', {
			minimumFractionDigits: 0,
			maximumFractionDigits: paymentAsset === 'USDT' ? 6 : 8
		})} ${paymentAsset}`;
	}

	// Format date with proper timestamp handling
	function formatDate(timestamp: number): string {
		// Handle invalid or zero timestamps
		if (!timestamp || timestamp <= 0) {
			return 'Not set';
		}

		// Convert to milliseconds if timestamp is in seconds
		const date = timestamp > 1000000000000 ? new Date(timestamp) : new Date(timestamp * 1000);

		// Check if date is valid
		if (isNaN(date.getTime())) {
			return 'Invalid date';
		}

		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	// Get role badge class
	function getRoleBadgeClass(isClient: boolean): string {
		return isClient ? 'badge-primary' : 'badge-secondary';
	}

	// Get available actions count
	function getAvailableActionsCount(): number {
		if (isLegacyMissingContextContract) return 0;

		let count = 0;
		if (contract.permissions.canComplete) count++;
		if (contract.permissions.canAccept) count++;
		if (contract.permissions.canDispute) count++;
		if (contract.permissions.canPropose) count++;
		if (contract.permissions.canAcceptProposal) count++;
		if (contract.permissions.canCancel) count++;
		if (contract.permissions.canResolveTimelock) count++;
		return count;
	}

	const openDrawer = () => {
		$contractStore.contract = contract;
		$contractStore.isDrawerOpen = true;
	};
</script>

<div
	class="card bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg {isBlockchainQueryFailed
		? 'pointer-events-none opacity-60'
		: ''}"
	class:cursor-not-allowed={isBlockchainQueryFailed}
>
	<div class="card-body rounded-xl p-4 md:p-4">
		<!-- Top Row: Title + Description + Badges -->
		<div class="mb-3 flex flex-row items-start justify-between gap-2">
			<!-- Left: Title and Description (flexible, takes available space) -->
			<div class="flex-1 min-w-0 pr-2 md:pr-4">
				<div class="card-title line-clamp-2 text-lg font-semibold">
					<button
						class="hover:text-primary cursor-pointer text-left transition-colors"
						onclick={openDrawer}
					>
						{contractStore.getContractKey(contract, 'taskTitle')}
					</button>
				</div>
				<div class="text-sm text-base-content/80 whitespace-pre-line line-clamp-2 mt-1">
					{contractStore.getContractKey(contract, 'taskDescription')}
				</div>
			</div>
			<!-- Right: Badges -->
			<div class="flex shrink-0 flex-col items-end self-stretch">
				<!-- Top row: Role + Dev badge -->
				<div class="flex flex-wrap justify-end gap-1">
					<div class="badge {getRoleBadgeClass(contract.isClient)} badge-sm">
						{contract.isClient ? $t('dashboard.client') : $t('dashboard.freelancer')}
					</div>
					<div class="badge badge-outline badge-sm">
						{contractRailLabel}
					</div>
					{#if import.meta.env.DEV}
						<div class="badge badge-error badge-sm">
							{contract.escrowData?.id}
						</div>
					{/if}
				</div>
				<!-- Bottom row: Status badge (with min gap from top badges) -->
				<div class="badge {getStatusColorClass(contract.status)} badge-sm mt-2">
					{#if contract?.isPending}
						<span class="loading loading-spinner loading-xs mr-1"></span>
					{/if}
					{$t(getStatusTranslationKey(contract.status))}
				</div>
				{#if isMetadataOnlyBscContract}
					<div class="badge badge-warning badge-sm mt-2">
						Read-only pre-ABI
					</div>
				{:else if isLegacyMissingContextContract}
					<div class="badge badge-warning badge-sm mt-2">
						Missing rail context
					</div>
				{/if}
			</div>
		</div>

		<!-- Second Row: Deadline + Location + Price -->
		<div class="mb-3 flex flex-row items-center justify-between gap-3">
			<!-- Left: Deadline + Location -->
			<div class="flex flex-col gap-2 min-w-0 flex-1">
				<!-- Deadline -->
				<TaskDeadlineDisplay
					deadline={contractStore.getContractKey(contract, 'estimatedCompletionTime') as number}
				/>

				<!-- Location (contracts don't have location data, default to Remote) -->
				<TaskLocationDisplay />
			</div>

			<!-- Right: Price -->
			<div class="text-right shrink-0">
				{#if isUsdtContract}
					<div class="text-2xl font-bold">
						{formatTokenAmount(contractStore.getContractKey(contract, 'amount') as string)}
					</div>
					<div class="text-base-content/60 text-base">{contractRailLabel}</div>
				{:else if isLegacyMissingContextContract}
					<div class="text-xl font-bold">Read-only</div>
					<div class="text-base-content/60 max-w-44 text-right text-sm">
						Missing rail context
					</div>
				{:else if shouldFailClosedBscAmountDisplay}
					<div class="text-xl font-bold">Read-only</div>
					<div class="text-base-content/60 max-w-44 text-right text-sm">
						BSC escrow legacy context
					</div>
				{:else if btcPrice > 0}
					{@const priceData = formatPriceStacked(
						contractStore.getContractKey(contract, 'amount') as string,
						btcPrice
					)}
					<div class="text-2xl font-bold">{priceData.usd}</div>
					<div class="text-base-content/60 text-base">{priceData.sats}</div>
				{:else}
					<div class="text-2xl font-bold">
						{formatRBTC(contractStore.getContractKey(contract, 'amount') as string)} RBTC
					</div>
				{/if}
			</div>
		</div>

		<!-- Bottom Row: User Info + Action Buttons -->
		<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<!-- Left: User Info (without role headline) -->
			<div class="min-w-0 flex-1">
				<UserNostrBadge
					npub={contractStore.getContractKey(contract, 'otherPartyNpub') as string}
				/>
				{#if isMetadataOnlyBscContract}
					<div class="text-warning mt-2 text-xs">
						{contractRailLabel} is available in read-only mode until the deployed BSC escrow
						ABI/artifacts are accepted.
						{#if shouldFailClosedBscAmountDisplay}
							Payment asset context is legacy or missing, so RBTC/sats display is intentionally
							suppressed until the record is normalized safely.
						{/if}
					</div>
				{:else if isLegacyMissingContextContract}
					<div class="text-warning mt-2 text-xs">
						This legacy contract is readable, but contract-changing actions stay blocked until the
						rail context is normalized safely.
					</div>
				{/if}
			</div>

			<!-- Right: Action Buttons -->
			<div class="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:w-auto">
				{#if getAvailableActionsCount() > 0}
					<ContractActions
						{contract}
						containerClass="flex flex-col gap-2 sm:flex-row sm:flex-wrap w-full sm:w-auto"
						isInline={true}
					/>
				{/if}
				<button class="btn btn-outline btn-sm w-full sm:w-auto" onclick={openDrawer}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					{$t('dashboard.contracts.view_details')}
				</button>
			</div>
		</div>
	</div>
</div>
