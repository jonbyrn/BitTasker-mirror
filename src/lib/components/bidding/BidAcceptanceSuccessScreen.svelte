<script lang="ts">
	import { t } from 'svelte-i18n';
	import { fly } from 'svelte/transition';
	import { linear } from 'svelte/easing';
	import { goto } from '$app/navigation';
	import { formatConvertedAmount } from '$lib/utils/helpers/currencyFormatter';

	let {
		/** Total amount funded (RBTC string) for success message */
		totalAmountRbtc,
		/** After tx broadcast: chain confirm + Nostr follow-up */
		followUpStatus,
		transactionHash = ''
	}: {
		totalAmountRbtc: string;
		followUpStatus: 'mining' | 'done' | 'failed';
		transactionHash?: string;
	} = $props();

	const explorerUrl = $derived.by(() => {
		if (!transactionHash) return '';
		const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';
		const base =
			network === 'mainnet'
				? 'https://rootstock.blockscout.com/tx/'
				: 'https://rootstock-testnet.blockscout.com/tx/';
		return `${base}${transactionHash}`;
	});

	function goToContracts() {
		goto('/hiring/contracts');
	}

	function goToCreateTask() {
		goto('/create-task');
	}
</script>

<div
	class="flex min-h-full flex-col"
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: 20
	}}
>
	<!-- Scrollable content — flex-1 so it absorbs available space, keeping buttons at bottom -->
	<div class="flex-1 space-y-6 text-center">
		<!-- Status Icon -->
		<div class="flex justify-center">
			<div class="{followUpStatus === 'done' ? 'bg-success/10' : 'bg-info/10'} rounded-full p-4">
				{#if followUpStatus === 'mining'}
					<span class="loading loading-spinner loading-lg text-info"></span>
				{:else if followUpStatus === 'failed'}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-error h-16 w-16"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
						/>
					</svg>
				{:else}
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
				{/if}
			</div>
		</div>

		<!-- Status Message -->
		<div class="space-y-2">
			<h3 class="text-xl font-bold">
				{#if followUpStatus === 'mining'}
					{$t('dashboard.bids.bid_acceptance.funding_pending_title')}
				{:else if followUpStatus === 'failed'}
					{$t('dashboard.bids.bid_acceptance.funding_confirm_failed')}
				{:else}
					{$t('dashboard.bids.bid_acceptance.success_subtitle')}
				{/if}
			</h3>
			{#if followUpStatus === 'done'}
				<p class="text-base-content/70">
					{$t('dashboard.bids.bid_acceptance.success_message', {
						values: {
							amount: totalAmountRbtc
								? formatConvertedAmount(totalAmountRbtc, 'RBTC', { suffix: '' })
								: '0'
						}
					})}
				</p>
			{:else if followUpStatus === 'mining'}
				<p class="text-base-content/70">
					{$t('dashboard.bids.bid_acceptance.funding_pending_message')}
				</p>
			{/if}
			{#if explorerUrl}
				<a
					class="link link-primary text-sm break-all"
					href={explorerUrl}
					target="_blank"
					rel="noopener noreferrer"
				>
					{$t('dashboard.bids.bid_acceptance.view_transaction')}
				</a>
			{/if}
		</div>

		<!-- Contract Creation Status -->
		<div class="bg-base-200 rounded-lg p-4">
			<h4 class="mb-3 font-semibold">
				{$t('dashboard.bids.bid_acceptance.contract_creation_status')}
			</h4>
			<div class="flex items-center gap-3">
				{#if followUpStatus === 'failed'}
					<span class="text-error"
						>{$t('dashboard.bids.bid_acceptance.funding_confirm_failed')}</span
					>
				{:else if followUpStatus === 'mining'}
					<span class="loading loading-spinner loading-sm text-info"></span>
					<span class="text-info">{$t('dashboard.bids.bid_acceptance.follow_up_in_progress')}</span>
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
		{#if followUpStatus === 'done'}
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
		{/if}
	</div>

	<!-- Action Buttons — shrink-0 so they stay pinned at the bottom of the drawer -->
	<div class="flex shrink-0 flex-col gap-3 pt-4 sm:flex-row">
		<button class="btn btn-outline flex-1" onclick={goToCreateTask}>
			{$t('dashboard.bids.bid_acceptance.create_new_task')}
		</button>
		<button class="btn btn-primary flex-1" onclick={goToContracts}>
			{$t('dashboard.bids.bid_acceptance.go_to_contracts')}
		</button>
	</div>
</div>
