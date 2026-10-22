<script lang="ts">
	import { t } from 'svelte-i18n';
	import { getUtexoWallet } from '$lib/stores/wallet/wallet-init';
	import { planManualChannel, MIN_MANUAL_CHANNEL_SATS } from '$lib/stores/wallet/lightning-status';
	import { openManualChannel } from '$lib/stores/wallet/manual-lightning';
	import type { ManualChannelPlan } from '$lib/stores/wallet/lightning-status';

	let open = $state(false);
	let peer = $state('');
	let capacity = $state(String(MIN_MANUAL_CHANNEL_SATS));
	let assetId = $state('');
	let assetAmount = $state('');
	let plan = $state<ManualChannelPlan | null>(null);
	let errorKey = $state('');
	let submitting = $state(false);
	let openedId = $state('');

	function review(): void {
		errorKey = '';
		openedId = '';
		const capacitySat = Number(capacity.trim());
		const amountRaw = assetAmount.trim();
		const planned = planManualChannel({
			peer,
			capacitySat,
			assetId,
			assetAmount: amountRaw === '' ? undefined : Number(amountRaw)
		});
		if (!planned.ok) {
			plan = null;
			errorKey = planned.errorKey;
			return;
		}
		plan = planned.plan;
	}

	async function confirmOpen(): Promise<void> {
		if (!plan || submitting) return;
		const wallet = getUtexoWallet();
		if (!wallet?.openChannel) {
			errorKey = 'wallet.advanced_lightning_not_ready';
			return;
		}
		submitting = true;
		errorKey = '';
		try {
			const opened = await openManualChannel(wallet, plan);
			openedId = opened.temporaryChannelId;
			plan = null;
		} catch {
			errorKey = 'wallet.advanced_lightning_failed';
		} finally {
			submitting = false;
		}
	}
</script>

<details class="mt-2" bind:open data-testid="advanced-lightning">
	<summary class="cursor-pointer text-sm">{$t('wallet.advanced_lightning')}</summary>
	<div class="mt-3 flex flex-col gap-3">
		<p class="text-base-content/70 text-xs">{$t('wallet.advanced_lightning_help')}</p>
		{#if plan}
			<div class="bg-base-200 rounded-lg p-3 text-sm" data-testid="advanced-lightning-confirm">
				<p>
					{$t('wallet.advanced_lightning_node_value', {
						values: { node: plan.peerUri ?? plan.peerPubkey }
					})}
				</p>
				<p>
					{$t('wallet.advanced_lightning_commit', {
						values: { sats: plan.capacitySat.toLocaleString() }
					})}
				</p>
				<p>
					{$t('wallet.advanced_lightning_asset_value', {
						values: { asset: plan.assetId || $t('wallet.advanced_lightning_none') }
					})}
				</p>
				<p>
					{$t('wallet.advanced_lightning_amount_value', {
						values: {
							amount: plan.assetLocalAmount ?? $t('wallet.advanced_lightning_none')
						}
					})}
				</p>
				{#if plan.explicitBot}
					<p class="text-warning text-xs">{$t('wallet.advanced_lightning_bot')}</p>
				{/if}
				<div class="mt-2 flex gap-2">
					<button
						type="button"
						class="btn btn-primary btn-sm"
						disabled={submitting}
						onclick={() => void confirmOpen()}
						data-testid="advanced-lightning-confirm-submit"
					>
						{submitting
							? $t('wallet.advanced_lightning_opening')
							: $t('wallet.advanced_lightning_open')}
					</button>
					<button
						type="button"
						class="btn btn-ghost btn-sm"
						disabled={submitting}
						onclick={() => (plan = null)}
					>
						{$t('wallet.advanced_lightning_back')}
					</button>
				</div>
			</div>
		{:else}
			<label class="form-control">
				<span class="label-text mb-1">{$t('wallet.advanced_lightning_node')}</span>
				<input
					class="input input-bordered w-full font-mono text-xs"
					bind:value={peer}
					placeholder="02…@host:9735"
					data-testid="advanced-lightning-peer"
				/>
			</label>
			<label class="form-control">
				<span class="label-text mb-1">{$t('wallet.advanced_lightning_capacity')}</span>
				<input
					class="input input-bordered w-full"
					inputmode="numeric"
					bind:value={capacity}
					data-testid="advanced-lightning-capacity"
				/>
			</label>
			<label class="form-control">
				<span class="label-text mb-1">{$t('wallet.advanced_lightning_asset')}</span>
				<input
					class="input input-bordered w-full font-mono text-xs"
					bind:value={assetId}
					placeholder="rgb:…"
					data-testid="advanced-lightning-asset"
				/>
			</label>
			<label class="form-control">
				<span class="label-text mb-1">{$t('wallet.advanced_lightning_amount')}</span>
				<input
					class="input input-bordered w-full"
					inputmode="numeric"
					bind:value={assetAmount}
					data-testid="advanced-lightning-asset-amount"
				/>
			</label>
			<button
				type="button"
				class="btn btn-outline btn-sm"
				onclick={review}
				data-testid="advanced-lightning-review"
			>
				{$t('wallet.advanced_lightning_review')}
			</button>
		{/if}
		{#if openedId}
			<p class="text-success text-xs break-all" data-testid="advanced-lightning-opened">
				{$t('wallet.advanced_lightning_opened', { values: { id: openedId } })}
			</p>
		{/if}
		{#if errorKey}
			<p class="text-error text-sm" data-testid="advanced-lightning-error">{$t(errorKey)}</p>
		{/if}
	</div>
</details>
