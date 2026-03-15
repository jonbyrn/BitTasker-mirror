<script lang="ts">
	import type { ContractWithEvents } from '$lib/types/contract';
	import { contractStore } from '$lib/stores/contract.store';
	import { t } from 'svelte-i18n';
	import ContractBadges from './ContractBadges.svelte';
	import ContractActionsByVersion from './ContractActionsByVersion.svelte';
	import UserNostrBadge from '../UserNostrBadge.svelte';
	import TaskDeadlineDisplay from '../task/TaskDeadlineDisplay.svelte';
	import TaskLocationDisplay from '../task/TaskLocationDisplay.svelte';

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
	class="card bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg {isBlockchainQueryFailed
		? 'pointer-events-none opacity-60'
		: ''}"
	class:cursor-not-allowed={isBlockchainQueryFailed}
>
	<div class="card-body rounded-xl p-4 md:p-4">
		<!-- Top Row: Title + Description + Badges -->
		<div class="mb-3 flex flex-row items-start justify-between gap-2">
			<!-- Left: Title and Description (flexible, takes available space) -->
			<div class="min-w-0 flex-1 pr-2 md:pr-4">
				<div class="card-title line-clamp-2 text-lg font-semibold">
					<button
						class="hover:text-primary cursor-pointer text-left transition-colors"
						onclick={openDrawer}
					>
						{contractStore.getContractKey(contract, 'taskTitle')}
					</button>
				</div>
				<div class="text-base-content/80 mt-1 line-clamp-2 text-sm whitespace-pre-line">
					{contractStore.getContractKey(contract, 'taskDescription')}
				</div>
			</div>
			<!-- Right: Badges (version-aware) -->
			<ContractBadges {contract} showDevBadge={import.meta.env.DEV} />
		</div>

		<!-- Second Row: Deadline + Location + Price -->
		<div class="mb-3 flex flex-row items-center justify-between gap-3">
			<!-- Left: Deadline + Location -->
			<div class="flex min-w-0 flex-1 flex-col gap-2">
				<!-- Deadline -->
				<TaskDeadlineDisplay
					deadline={contractStore.getContractKey(contract, 'estimatedCompletionTime') as number}
				/>

				<!-- Location (contracts don't have location data, default to Remote) -->
				<TaskLocationDisplay />
			</div>

			<!-- Right: Price -->
			<div class="shrink-0 text-right">
				{#if btcPrice > 0}
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
			<UserNostrBadge npub={contractStore.getContractKey(contract, 'otherPartyNpub') as string} />

			<!-- Right: Action Buttons -->
			<div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
				{#if getAvailableActionsCount() > 0}
					<ContractActionsByVersion
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
