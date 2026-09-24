<script lang="ts">
	import { t } from 'svelte-i18n';
	import { walletManager } from '$lib/stores/wallet/wallet-manager';
	import { walletStore } from '$lib/stores/wallet/wallet-state';
	import { appStore } from '$lib/stores/app.store';
	import { getConfiguredRgbUsdtAssetId } from '$lib/types/rgb-contract';
	import { createRgbInvoice } from '$lib/stores/wallet/wallet-balances';

	type ReceiveAsset = 'btc_onchain' | 'btc_lightning' | 'usdt_rgb';

	let { onClose = () => {} }: { onClose?: () => void } = $props();

	let asset = $state<ReceiveAsset>('btc_onchain');
	let amountSats = $state('');
	let isGenerating = $state(false);
	let receiveValue = $state('');
	let errorMessage = $state('');

	const assets: Array<{ id: ReceiveAsset; labelKey: string }> = [
		{ id: 'btc_onchain', labelKey: 'wallet.send_form.asset.bitcoin' },
		{ id: 'btc_lightning', labelKey: 'wallet.networks.lightning' },
		{ id: 'usdt_rgb', labelKey: 'wallet.taproot.tether_usd' }
	];

	const onchainAddress = $derived(
		$walletStore.rgb?.address ?? $walletStore.wdk?.btcOnchain?.address ?? ''
	);

	const requiresAmount = $derived(asset !== 'btc_onchain');
	const parsedAmount = $derived.by(() => {
		if (!requiresAmount) return 0;
		const parsed = Number(amountSats);
		return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
	});
	const usdtAssetId = getConfiguredRgbUsdtAssetId();
	const usdtUnconfigured = $derived(asset === 'usdt_rgb' && !usdtAssetId);
	const canGenerate = $derived(
		usdtUnconfigured
			? false
			: asset === 'btc_onchain'
				? onchainAddress !== ''
				: parsedAmount !== null && !isGenerating
	);

	async function handleGenerate(): Promise<void> {
		errorMessage = '';
		if (asset === 'btc_onchain') {
			receiveValue = onchainAddress || (await walletManager.getRgbAddress());
			return;
		}
		if (asset === 'usdt_rgb') {
			if (!usdtAssetId) {
				errorMessage = $t('wallet.taproot.usdt_not_configured');
				return;
			}
			isGenerating = true;
			try {
				const result = await createRgbInvoice({
					assetId: usdtAssetId,
					amount: parsedAmount ?? undefined
				});
				receiveValue = result.invoice;
			} catch (err) {
				errorMessage = err instanceof Error ? err.message : 'Failed to generate RGB invoice';
				console.error('[receive-modal] RGB invoice error:', err);
			} finally {
				isGenerating = false;
			}
			return;
		}
		// Lightning invoice generation deferred
		receiveValue = 'Pending implementation';
	}

	async function handleCopy(): Promise<void> {
		if (!receiveValue) return;
		try {
			await navigator.clipboard.writeText(receiveValue);
			appStore.showSuccessToast($t('wallet.taproot.hash_copied'));
		} catch {
			appStore.showErrorToast($t('common.error'));
		}
	}
</script>

<div class="flex flex-col gap-4" data-testid="receive-payment-form">
	<!-- Asset selector -->
	<div class="join w-full" role="group" aria-label={$t('wallet.taproot.token')}>
		{#each assets as option (option.id)}
			<button
				type="button"
				class="btn btn-sm join-item flex-1"
				class:btn-primary={asset === option.id}
				class:btn-outline={asset !== option.id}
				onclick={() => {
					asset = option.id;
					receiveValue = '';
					errorMessage = '';
				}}
				data-testid={`receive-asset-${option.id}`}
			>
				{$t(option.labelKey)}
			</button>
		{/each}
	</div>

	{#if requiresAmount}
		<label class="form-control">
			<span class="label-text mb-1"
				>{$t('wallet.taproot.amount')} ({asset === 'usdt_rgb' ? 'USDT' : 'sats'})</span
			>
			<input
				class="input input-bordered w-full"
				inputmode="numeric"
				placeholder="0"
				bind:value={amountSats}
				data-testid="receive-amount"
			/>
		</label>
	{/if}

	{#if usdtUnconfigured}
		<div
			class="alert alert-outline alert-warning text-sm"
			role="status"
			data-testid="receive-usdt-unconfigured"
		>
			<span>{$t('wallet.taproot.usdt_not_configured')}</span>
		</div>
	{:else if !receiveValue}
		<button
			type="button"
			class="btn btn-primary w-full"
			onclick={handleGenerate}
			disabled={!canGenerate}
			data-testid="receive-generate"
		>
			{#if isGenerating}
				<span class="loading loading-spinner loading-sm"></span>
			{/if}
			{asset === 'btc_onchain'
				? $t('wallet.taproot.receive_btc')
				: asset === 'btc_lightning'
					? $t('wallet.invoice.share_title')
					: $t('wallet.taproot.receive_usdt')}
		</button>
	{:else}
		<div class="bg-base-200 rounded-lg p-3 font-mono text-xs break-all" data-testid="receive-value">
			{receiveValue}
		</div>
		<button
			type="button"
			class="btn btn-outline w-full"
			onclick={handleCopy}
			data-testid="receive-copy"
		>
			{$t('wallet.taproot.copy_address')}
		</button>
	{/if}

	{#if errorMessage}
		<div class="alert alert-error text-sm" role="alert" data-testid="receive-error">
			{errorMessage}
		</div>
	{/if}

	<p class="text-base-content/60 text-xs">
		{$t('wallet.taproot.make_sure_network')}
	</p>

	<button type="button" class="btn btn-ghost w-full" onclick={onClose} data-testid="receive-close">
		{$t('common.close')}
	</button>
</div>
