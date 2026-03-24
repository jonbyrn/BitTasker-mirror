<script lang="ts">
	import { t } from 'svelte-i18n';
	import { fly } from 'svelte/transition';
	import { linear } from 'svelte/easing';
	import { goto } from '$app/navigation';
	import { formatRBTCAmount } from '$lib/utils/escrow/v2';

	let {
		/** Total amount funded (RBTC string) for success message */
		totalAmountRbtc,
		/** Orchestrator status: simulated (no tx) or pending (awaiting confirmation) */
		status,
		/** True when Nostr contract published and side effects complete */
		contractComplete,
		/** True when real tx is confirmed (simulated: always false) */
		txConfirmed
	}: {
		totalAmountRbtc: string;
		status: 'simulated' | 'pending';
		contractComplete: boolean;
		txConfirmed: boolean;
	} = $props();

	function goToContracts() {
		goto('/dashboard?tab=contracts');
	}

	function goToCreateTask() {
		goto('/dashboard/create-task');
	}
</script>

<div
	class="space-y-6 text-center"
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: 20
	}}
>
	<!-- Success Icon -->
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

	<!-- Success Message -->
	<div class="space-y-2">
		<h3 class="text-xl font-bold">{$t('dashboard.bids.bid_acceptance.success_subtitle')}</h3>
		<p class="text-base-content/70">
			{$t('dashboard.bids.bid_acceptance.success_message', {
				values: {
					amount: totalAmountRbtc ? formatRBTCAmount(totalAmountRbtc) : '0'
				}
			})}
		</p>
	</div>

	<!-- Contract Creation Status -->
	<div class="bg-base-200 rounded-lg p-4">
		<h4 class="mb-3 font-semibold">
			{$t('dashboard.bids.bid_acceptance.contract_creation_status')}
		</h4>
		<div class="flex items-center gap-3">
			{#if !contractComplete}
				<span class="loading loading-spinner loading-sm text-info"></span>
				<span class="text-info">{$t('dashboard.bids.bid_acceptance.creating_nostr_contract')}</span>
			{:else if status === 'pending' && !txConfirmed}
				<span class="loading loading-spinner loading-sm text-info"></span>
				<span class="text-info">{$t('dashboard.bids.bid_acceptance.waiting_for_confirmation')}</span
				>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-success h-5 w-5"
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
				<span class="text-success"
					>{$t('dashboard.bids.bid_acceptance.nostr_contract_success')}</span
				>
			{/if}
		</div>
	</div>

	<!-- Next Steps -->
	<div class="bg-base-200 rounded-lg p-4">
		<h4 class="text-base-content mb-2 font-semibold">
			{$t('dashboard.bids.bid_acceptance.what_happens_next_title')}
		</h4>
		<ul class="text-base-content/80 space-y-1 text-left text-sm">
			<li>• {$t('dashboard.bids.bid_acceptance.next_item_notify')}</li>
			<li>• {$t('dashboard.bids.bid_acceptance.next_item_begin')}</li>
			<li>• {$t('dashboard.bids.bid_acceptance.next_item_funds_held')}</li>
			<li>• {$t('dashboard.bids.bid_acceptance.next_item_release')}</li>
		</ul>
	</div>

	<!-- Action Buttons -->
	<div class="flex flex-col gap-3 pt-4 sm:flex-row">
		<button class="btn btn-outline flex-1" onclick={goToCreateTask}>
			{$t('dashboard.bids.bid_acceptance.create_new_task')}
		</button>
		<button class="btn btn-primary flex-1" onclick={goToContracts}>
			{$t('dashboard.bids.bid_acceptance.go_to_contracts')}
		</button>
	</div>
</div>
