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

	const { contract, btcPrice } = $props<{
		contract: ContractWithEvents;
		btcPrice: number;
	}>();

	// Check if blockchain query failed (no blockchain status and not pending)
	const isBlockchainQueryFailed = $derived(
		contract.blockchainStatus === null &&
			!contract.isPending &&
			!contract.contractEvent.content.transactionHash
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
	class="bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg {isBlockchainQueryFailed
		? 'pointer-events-none opacity-60'
		: ''}"
	class:cursor-not-allowed={isBlockchainQueryFailed}
>
	<div class="card-body">
		<div class="flex flex-col justify-between gap-2">
				<div class="min-w-0 flex-1">
					<small class="card-title line-clamp-1 text-lg">
						<button
							class="hover:text-primary cursor-pointer text-left transition-colors"
							onclick={openDrawer}
						>
							{contractStore.getContractKey(contract, 'taskTitle')}
						</button>
					</small>
					<div class="text-base-content/60 mt-1 line-clamp-2">
						{contractStore.getContractKey(contract, 'taskDescription')}
					</div>
				</div>

			<!-- Badges in top right corner -->
			<div class="sm:ml-4 flex shrink-0 flex-row sm:flex-col items-start sm:items-end gap-2 justify-between sm:justify-center">
					<div class="flex flex-col sm:flex-row justify-start items-start sm:items-center gap-2">
						<div class="badge {getStatusColorClass(contract.status)} badge-sm">
							{#if contract?.isPending}
								<span class="loading loading-spinner loading-xs mr-1"></span>
							{/if}
							{$t(getStatusTranslationKey(contract.status))}
						</div>
						<div class="badge {getRoleBadgeClass(contract.isClient)} badge-sm">
							{contract.isClient ? $t('dashboard.client') : $t('dashboard.freelancer')}
						</div>
						{#if import.meta.env.DEV}
							<div class="badge badge-error badge-sm">
								{contract.escrowData?.id}
							</div>
						{/if}
					</div>

					<!-- Price with stacked design -->
					<div class="text-right">
						{#if btcPrice > 0}
							{@const priceData = formatPriceStacked(
								contractStore.getContractKey(contract, 'amount') as string,
								btcPrice
							)}
							<div class="text-base-content text-lg font-bold">
								{priceData.usd}
							</div>
							<div class="text-base-content/60 text-sm">
								{priceData.sats}
							</div>
						{:else}
							<div class="text-base-content text-lg font-bold">
								{formatRBTC(contractStore.getContractKey(contract, 'amount') as string)} RBTC
							</div>
						{/if}
					</div>
				</div>
		</div>

		<div class="flex w-full items-center justify-between">
			<!-- Left: Deadline -->
			<div class="flex items-center gap-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-base-content/60 h-6 w-6 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<div class="flex flex-col">
					<small class="text-base-content/60 text-xs">
						{$t('dashboard.contracts.deadline')}
					</small>
					<span class="text-sm font-medium">
						{formatDate(contractStore.getContractKey(contract, 'estimatedCompletionTime') as number)}
					</span>
				</div>
			</div>

			<!-- Right: Empty space for balance -->
			<div class=""></div>
		</div>

		<div class="mt-1 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<!-- Left: User Info aligned with buttons -->
			<UserNostrBadge
				npub={contractStore.getContractKey(contract, 'otherPartyNpub') as string}
				role={contract.isClient ? $t('dashboard.freelancer') : $t('dashboard.client')}
			/>

			<!-- Right: Action Buttons -->
			<div class="flex w-full flex-col gap-3 sm:flex-row sm:items-center md:w-auto">
				{#if getAvailableActionsCount() > 0}
					<ContractActions
						{contract}
						containerClass="flex flex-row-reverse flex-wrap gap-2 w-full sm:w-auto"
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
