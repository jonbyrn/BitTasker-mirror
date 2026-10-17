<script lang="ts">
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
	let errorMessage = $state('');
	let submitting = $state(false);
	let openedId = $state('');

	function review(): void {
		errorMessage = '';
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
			errorMessage = planned.error;
			return;
		}
		plan = planned.plan;
	}

	async function confirmOpen(): Promise<void> {
		if (!plan || submitting) return;
		const wallet = getUtexoWallet();
		if (!wallet?.openChannel) {
			errorMessage = 'Lightning is not ready yet.';
			return;
		}
		submitting = true;
		errorMessage = '';
		try {
			const opened = await openManualChannel(wallet, plan);
			openedId = opened.temporaryChannelId;
			plan = null;
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Channel open failed';
		} finally {
			submitting = false;
		}
	}
</script>

<details class="mt-2" bind:open data-testid="advanced-lightning">
	<summary class="cursor-pointer text-sm">Advanced Lightning</summary>
	<div class="mt-3 flex flex-col gap-3">
		<p class="text-base-content/70 text-xs">
			Connect your own node. This spends the bitcoin you confirm below, once.
		</p>
		{#if plan}
			<div class="bg-base-200 rounded-lg p-3 text-sm" data-testid="advanced-lightning-confirm">
				<p>Node: <span class="font-mono break-all">{plan.peerUri ?? plan.peerPubkey}</span></p>
				<p>Bitcoin to commit: {plan.capacitySat.toLocaleString()} sats</p>
				<p>RGB asset: {plan.assetId || 'None'}</p>
				<p>RGB amount: {plan.assetLocalAmount ?? 'None'}</p>
				{#if plan.explicitBot}
					<p class="text-warning text-xs">You typed this public node yourself.</p>
				{/if}
				<div class="mt-2 flex gap-2">
					<button
						type="button"
						class="btn btn-primary btn-sm"
						disabled={submitting}
						onclick={() => void confirmOpen()}
						data-testid="advanced-lightning-confirm-submit"
					>
						{submitting ? 'Opening…' : 'Open channel'}
					</button>
					<button
						type="button"
						class="btn btn-ghost btn-sm"
						disabled={submitting}
						onclick={() => (plan = null)}
					>
						Back
					</button>
				</div>
			</div>
		{:else}
			<label class="form-control">
				<span class="label-text mb-1">Node (publickey@host:port)</span>
				<input
					class="input input-bordered w-full font-mono text-xs"
					bind:value={peer}
					placeholder="02…@host:9735"
					data-testid="advanced-lightning-peer"
				/>
			</label>
			<label class="form-control">
				<span class="label-text mb-1">Bitcoin capacity (sats)</span>
				<input
					class="input input-bordered w-full"
					inputmode="numeric"
					bind:value={capacity}
					data-testid="advanced-lightning-capacity"
				/>
			</label>
			<label class="form-control">
				<span class="label-text mb-1">RGB asset id (optional)</span>
				<input
					class="input input-bordered w-full font-mono text-xs"
					bind:value={assetId}
					placeholder="rgb:…"
					data-testid="advanced-lightning-asset"
				/>
			</label>
			<label class="form-control">
				<span class="label-text mb-1">RGB amount in base units (optional)</span>
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
				Review
			</button>
		{/if}
		{#if openedId}
			<p class="text-success text-xs break-all" data-testid="advanced-lightning-opened">
				Submitted. Channel id {openedId}. It is not usable until it confirms.
			</p>
		{/if}
		{#if errorMessage}
			<p class="text-error text-sm" data-testid="advanced-lightning-error">{errorMessage}</p>
		{/if}
	</div>
</details>
