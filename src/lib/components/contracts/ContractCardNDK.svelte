<script lang="ts">
	import { EscrowStatus } from '$lib/utils/escrow';
	import {
		getStatusTranslationKey,
		getStatusColorClass
	} from '$lib/utils/helpers/contractStatusFormatter';
	import { t } from 'svelte-i18n';
	import TaskDeadlineDisplay from '../task/TaskDeadlineDisplay.svelte';
	import TaskLocationDisplay from '../task/TaskLocationDisplay.svelte';
	import UserNostrBadge from '../UserNostrBadge.svelte';
	import type { NDKPaymentContract } from '$lib/nostr/events/contract';

	const { contract }: { contract: NDKPaymentContract } = $props();

	/** Layout preview only — wire to real contract data later */
	const staticDeadline = Date.parse('2026-06-15T12:00:00');
	const staticDemoStatus = EscrowStatus.InProgress;
	/** Mirrors `btcPrice > 0` branch in ContractCard; flip to preview RBTC-only layout */
	const previewUsdPrice = true;
	/** Bech32-shaped placeholder; profile fetch is non-blocking */

	const isTasker = $derived(contract.author.pubkey === contract.ndk?.activeUser?.pubkey);
</script>

<div class="card bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg">
	<div class="card-body rounded-xl p-4 md:p-4">
		<!-- Top Row: Title + Description + Badges -->
		<div class="mb-3 flex flex-row items-start justify-between gap-2">
			<!-- Left: Title and Description (flexible, takes available space) -->
			<div class="min-w-0 flex-1 pr-2 md:pr-4">
				<div class="card-title line-clamp-2 text-lg font-semibold">
					<button
						type="button"
						class="hover:text-primary cursor-pointer text-left transition-colors"
					>
						{contract.taskTitle}
					</button>
				</div>
				<div class="text-base-content/80 mt-1 line-clamp-2 text-sm whitespace-pre-line">
					{contract.taskDescription}
				</div>
			</div>
			<!-- Right: Badges -->
			<div class="flex shrink-0 flex-col items-end self-stretch">
				<!-- Top row: Role + Dev badge -->
				<div class="flex flex-wrap justify-end gap-1">
					<div class="badge {isTasker ? 'badge-primary' : 'badge-secondary'} badge-sm">
						{isTasker ? $t('dashboard.client') : $t('dashboard.freelancer')}
					</div>
					{#if import.meta.env.DEV && contract.paymentId}
						<div class="badge badge-error badge-sm">
							{contract.paymentId}
						</div>
					{/if}
				</div>
				<!-- Bottom row: Status badge (with min gap from top badges) -->
				<div class="badge {getStatusColorClass(staticDemoStatus)} badge-sm mt-2">
					{$t(getStatusTranslationKey(staticDemoStatus))}
				</div>
			</div>
		</div>

		<!-- Second Row: Deadline + Location + Price -->
		<div class="mb-3 flex flex-row items-center justify-between gap-3">
			<!-- Left: Deadline + Location -->
			<div class="flex min-w-0 flex-1 flex-col gap-2">
				<!-- Deadline -->
				<TaskDeadlineDisplay deadline={staticDeadline} />

				<!-- Location (contracts don't have location data, default to Remote) -->
				<TaskLocationDisplay />
			</div>

			<!-- Right: Price -->
			<div class="shrink-0 text-right">
				{#if previewUsdPrice}
					<div class="text-2xl font-bold">{$t('dashboard.contracts.ndk_preview.price_usd')}</div>
					<div class="text-base-content/60 text-base">
						{$t('dashboard.contracts.ndk_preview.price_sats')}
					</div>
				{:else}
					<div class="text-2xl font-bold">{$t('dashboard.contracts.ndk_preview.price_rbtc')}</div>
				{/if}
			</div>
		</div>

		<!-- Bottom Row: User Info + Action Buttons -->
		<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<!-- Left: User Info (without role headline) -->
			<UserNostrBadge npub={contract.otherPartyNpub} />

			<!-- Right: Action Buttons -->
			<div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
				{#if false}
					<!-- Static placeholder: ContractActions will mount here when wired -->
				{/if}
				<button type="button" class="btn btn-outline btn-sm w-full sm:w-auto">
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
