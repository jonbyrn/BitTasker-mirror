<script lang="ts">
	import { t } from 'svelte-i18n';
	import { walletStore } from '$lib/stores/wallet.store';
	import type { PaymentSplitConfig } from '$lib/types/rgb-contract';

	let {
		totalAmountUsd,
		btcPriceUsd = 0,
		onSplitChange
	}: {
		/** Total contract amount in USD, used to compute both split shares. */
		totalAmountUsd: number;
		/** Current BTC/USD price, used to render the secondary share in sats. Omit to hide the sats readout. */
		btcPriceUsd?: number;
		/** Called whenever the split changes — preview only, not wired to contract submission. */
		onSplitChange?: (config: PaymentSplitConfig) => void;
	} = $props();

	let primaryPercentage = $state(95);
	let useColdStorage = $state(false);
	let customColdStorageAddress = $state('');

	const secondaryPercentage = $derived(100 - primaryPercentage);
	const defaultBtcAddress = $derived($walletStore.wdk?.btcOnchain?.address ?? '');
	const effectiveSecondaryAddress = $derived(
		useColdStorage ? customColdStorageAddress.trim() : defaultBtcAddress
	);

	const primaryUsdAmount = $derived(totalAmountUsd * (primaryPercentage / 100));
	const secondaryUsdAmount = $derived(totalAmountUsd * (secondaryPercentage / 100));
	const secondarySats = $derived(
		btcPriceUsd > 0 ? Math.round((secondaryUsdAmount / btcPriceUsd) * 100_000_000) : null
	);

	// Notifies the parent of the computed split — the parent decides whether/how to use it.
	$effect(() => {
		onSplitChange?.({
			primaryAsset: 'usdt_rgb',
			primaryPercentage,
			secondaryAsset: 'btc_onchain',
			secondaryPercentage,
			secondaryPayoutAddress: effectiveSecondaryAddress || undefined
		});
	});
</script>

<div class="bg-base-100 border-primary/30 space-y-4 rounded-lg border p-4">
	<div class="flex items-center justify-between gap-2">
		<span class="badge badge-warning badge-sm">{$t('dashboard.bids.bid_acceptance.payment_split.preview_badge')}</span>
		<h4 class="text-base-content text-sm font-semibold">
			{$t('dashboard.bids.bid_acceptance.payment_split.title')}
		</h4>
	</div>

	<div class="space-y-2">
		<div class="text-base-content/80 flex justify-between text-xs sm:text-sm">
			<span
				>{$t('dashboard.bids.bid_acceptance.payment_split.primary_label')}: <strong
					>{primaryPercentage}%</strong
				> (${primaryUsdAmount.toFixed(2)})</span
			>
			<span
				>{$t('dashboard.bids.bid_acceptance.payment_split.secondary_label')}: <strong
					>{secondaryPercentage}%</strong
				> (${secondaryUsdAmount.toFixed(2)})</span
			>
		</div>

		<input
			type="range"
			min="0"
			max="100"
			step="1"
			bind:value={primaryPercentage}
			class="range range-primary range-sm w-full"
		/>
	</div>

	{#if secondaryPercentage > 0}
		<div class="bg-base-200 border-base-300 space-y-3 rounded-lg border p-3">
			{#if secondarySats !== null}
				<p class="text-base-content/60 text-xs">
					{$t('dashboard.bids.bid_acceptance.payment_split.secondary_sats', {
						values: { sats: secondarySats.toLocaleString() }
					})}
				</p>
			{/if}

			<label class="label flex cursor-pointer items-center justify-start gap-2 p-0">
				<input type="checkbox" class="checkbox checkbox-sm" bind:checked={useColdStorage} />
				<span class="label-text text-sm">
					{$t('dashboard.bids.bid_acceptance.payment_split.cold_storage_toggle')}
				</span>
			</label>

			{#if useColdStorage}
				<input
					type="text"
					bind:value={customColdStorageAddress}
					placeholder={$t('dashboard.bids.bid_acceptance.payment_split.cold_storage_placeholder')}
					class="input input-bordered input-sm w-full"
				/>
			{:else}
				<p class="text-base-content/60 text-xs">
					{$t('dashboard.bids.bid_acceptance.payment_split.default_payout_note')}
					<code class="text-primary text-xs"
						>{defaultBtcAddress || $t('dashboard.bids.bid_acceptance.payment_split.wallet_not_connected')}</code
					>
				</p>
			{/if}
		</div>
	{/if}
</div>
